from app import config
from pymongo import MongoClient
for uri, db in [(config.SN_MONGODB_URI, config.SN_DB), (config.AI_MONGODB_URI, config.AI_DB)]:
    col = MongoClient(uri)[db][config.CANDIDATE_COLLECTION]
    n = col.delete_many({"percent": {"$exists": True}}).deleted_count
    print(f"{db}: {n} demo rows deleted, {col.count_documents({})} real candidates left")
