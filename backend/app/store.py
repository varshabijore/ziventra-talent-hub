"""Database access. MongoStore = production (sir's two clusters). MemoryStore = local demo/tests."""
import copy, datetime as dt, uuid
from . import config

POOLS = {"sn": "ServiceNow", "ai": "AI/ML"}


def now():
    return dt.datetime.now(dt.timezone.utc)


class MongoStore:
    def __init__(self):
        from pymongo import MongoClient, ASCENDING, DESCENDING
        from bson import ObjectId
        self.ObjectId = ObjectId
        self.DESC = DESCENDING
        sn = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=10000)
        ai = MongoClient(config.AI_MONGODB_URI, serverSelectionTimeoutMS=10000) if config.AI_MONGODB_URI else sn
        self.cand = {"sn": sn[config.SN_DB][config.CANDIDATE_COLLECTION], "ai": ai[config.AI_DB][config.CANDIDATE_COLLECTION]}
        db = sn[config.APP_DB]
        self.users, self.activity, self.audit = db.users, db.activity, db.audit
        self.settings, self.bookmarks, self.runs = db.settings, db.bookmarks, db.runs
        self.users.create_index([("email", ASCENDING)], unique=True)
        self.activity.create_index([("at", DESCENDING)])
        self.audit.create_index([("cand", ASCENDING), ("at", DESCENDING)])
        self.bookmarks.create_index([("user", ASCENDING), ("cand", ASCENDING)], unique=True)

    def _id(self, s):
        try:
            return self.ObjectId(s)
        except Exception:
            return None

    @staticmethod
    def _user(d):
        if not d:
            return None
        d = dict(d)
        d["id"] = str(d.pop("_id"))
        return d

    # users
    def user_by_email(self, email): return self._user(self.users.find_one({"email": email}))
    def user_by_id(self, uid): return self._user(self.users.find_one({"_id": self._id(uid)}))
    def users_list(self): return [self._user(u) for u in self.users.find().sort("created_at", 1)]
    def user_count(self): return self.users.count_documents({})
    def user_insert(self, doc):
        r = self.users.insert_one(dict(doc))
        return str(r.inserted_id)
    def user_update(self, uid, fields): self.users.update_one({"_id": self._id(uid)}, {"$set": fields})
    def users_keep_only(self, email): return self.users.delete_many({"email": {"$ne": email}}).deleted_count

    # logs
    def log(self, entry): self.activity.insert_one(dict(entry))
    def logs(self, limit=200, user=None):
        q = {"user_id": user} if user else {}
        return [{**{k: v for k, v in d.items() if k != "_id"}} for d in self.activity.find(q).sort("at", -1).limit(limit)]
    def audit_add(self, entry): self.audit.insert_one(dict(entry))
    def audit_for(self, cand): return [{k: v for k, v in d.items() if k != "_id"} for d in self.audit.find({"cand": cand}).sort("at", -1).limit(100)]

    # settings
    def settings_get(self):
        d = self.settings.find_one({"_id": "main"}) or {}
        d.pop("_id", None)
        return d
    def settings_put(self, doc): self.settings.replace_one({"_id": "main"}, {**doc, "_id": "main"}, upsert=True)

    # bookmarks
    def bookmarks_of(self, uid): return {d["cand"] for d in self.bookmarks.find({"user": uid})}
    def bookmark_toggle(self, uid, cand):
        if self.bookmarks.delete_one({"user": uid, "cand": cand}).deleted_count:
            return False
        self.bookmarks.insert_one({"user": uid, "cand": cand, "at": now()})
        return True

    # runs (optional: n8n can log each run here)
    def runs_on(self, day): return [{k: v for k, v in d.items() if k != "_id"} for d in self.runs.find({"date": day}).sort("time", 1)]

    # candidates
    def candidates(self, pool):
        out = []
        for d in self.cand[pool].find({}):
            d["_id"] = str(d["_id"])
            out.append(d)
        return out
    def candidate_set(self, pool, cid, fields): self.cand[pool].update_one({"_id": self._id(cid)}, {"$set": fields})
    def candidate_insert(self, pool, doc):
        return str(self.cand[pool].insert_one(dict(doc)).inserted_id)


class MemoryStore:
    """Same methods, kept in memory. Used for the local demo and automated tests."""
    def __init__(self, seed=None):
        self._users, self._activity, self._audit, self._bm, self._runs = {}, [], [], set(), []
        self._settings = {}
        self._cand = {"sn": {}, "ai": {}}
        if seed:
            seed(self)

    def user_by_email(self, email): return copy.deepcopy(next((u for u in self._users.values() if u["email"] == email), None))
    def user_by_id(self, uid): return copy.deepcopy(self._users.get(uid))
    def users_list(self): return sorted(copy.deepcopy(list(self._users.values())), key=lambda u: u["created_at"])
    def user_count(self): return len(self._users)
    def user_insert(self, doc):
        if self.user_by_email(doc["email"]):
            raise ValueError("duplicate")
        uid = uuid.uuid4().hex[:24]
        self._users[uid] = {**copy.deepcopy(doc), "id": uid}
        return uid
    def user_update(self, uid, fields): self._users[uid].update(copy.deepcopy(fields))
    def users_keep_only(self, email):
        old = [k for k, u in self._users.items() if u["email"] != email]
        for k in old: del self._users[k]
        return len(old)

    def log(self, entry): self._activity.append(copy.deepcopy(entry))
    def logs(self, limit=200, user=None):
        rows = [a for a in self._activity if not user or a.get("user_id") == user]
        return copy.deepcopy(sorted(rows, key=lambda a: a["at"], reverse=True)[:limit])
    def audit_add(self, entry): self._audit.append(copy.deepcopy(entry))
    def audit_for(self, cand): return copy.deepcopy(sorted([a for a in self._audit if a["cand"] == cand], key=lambda a: a["at"], reverse=True))

    def settings_get(self): return copy.deepcopy(self._settings)
    def settings_put(self, doc): self._settings = copy.deepcopy(doc)

    def bookmarks_of(self, uid): return {c for u, c in self._bm if u == uid}
    def bookmark_toggle(self, uid, cand):
        if (uid, cand) in self._bm:
            self._bm.discard((uid, cand))
            return False
        self._bm.add((uid, cand))
        return True

    def runs_on(self, day): return copy.deepcopy([r for r in self._runs if r.get("date") == day])

    def candidates(self, pool): return copy.deepcopy(list(self._cand[pool].values()))
    def candidate_set(self, pool, cid, fields):
        d = self._cand[pool][cid]
        for k, v in fields.items():
            if "." in k:
                a, b = k.split(".", 1)
                d.setdefault(a, {})[b] = copy.deepcopy(v)
            else:
                d[k] = copy.deepcopy(v)
    def candidate_insert(self, pool, doc):
        cid = uuid.uuid4().hex[:24]
        self._cand[pool][cid] = {**copy.deepcopy(doc), "_id": cid}
        return cid


def make_store():
    if config.DATA_MODE == "memory":
        from .sample import seed
        return MemoryStore(seed)
    return MongoStore()
