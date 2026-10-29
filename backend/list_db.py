from app import config
from pymongo import MongoClient
for label, uri in [("SN_MONGODB_URI", config.SN_MONGODB_URI), ("AI_MONGODB_URI", config.AI_MONGODB_URI)]:
    c = MongoClient(uri, serverSelectionTimeoutMS=10000)
    print(f"\n{label} -> {uri.split('@')[-1].split('/')[0]}")
    for d in c.list_database_names():
        if d in ("admin", "local", "config"):
            continue
        for col in c[d].list_collection_names():
            print(f"   {d}.{col}: {c[d][col].estimated_document_count()}")
