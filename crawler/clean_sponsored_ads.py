import os
import re
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# Load environments
load_dotenv('.env')
load_dotenv('website/.env')
load_dotenv('website/.env.local')

uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/makeupkhoj')
client = MongoClient(uri)
db = client['makeupkhoj']

print("==========================================================")
print(f" CLEANING 'Sponsored Ad' FROM DATABASE: {db.name}")
print("==========================================================")

clean_title_re = re.compile(r'^(?:sponsored\s*ad\s*[-–—:]*\s*|sponsored\s*[-–—:]*\s*|deal\s+of\s+the\s+day\s*[-–—:]*\s*)', re.IGNORECASE)
clean_slug_re = re.compile(r'^sponsored-ad-?', re.IGNORECASE)
search_re = re.compile(r'^sponsored\s*ad', re.IGNORECASE)
slug_search_re = re.compile(r'^sponsored-ad', re.IGNORECASE)

# 1. Clean amazon_makeupkhoj
amz_col = db['amazon_makeupkhoj']
amz_docs = list(amz_col.find({
    '$or': [
        {'title': search_re},
        {'name': search_re}
    ]
}))
print(f"\n[1] amazon_makeupkhoj: Found {len(amz_docs)} products with 'Sponsored Ad'")
if amz_docs:
    bulk_ops = []
    for doc in amz_docs:
        update_fields = {}
        if doc.get('title'):
            clean_t = clean_title_re.sub('', doc['title']).strip()
            if clean_t != doc['title']:
                update_fields['title'] = clean_t
        if doc.get('name'):
            clean_n = clean_title_re.sub('', doc['name']).strip()
            if clean_n != doc['name']:
                update_fields['name'] = clean_n
        if doc.get('slug'):
            clean_s = clean_slug_re.sub('', doc['slug']).strip()
            if clean_s != doc['slug']:
                update_fields['slug'] = clean_s

        if update_fields:
            bulk_ops.append(UpdateOne({'_id': doc['_id']}, {'$set': update_fields}))

    if bulk_ops:
        res = amz_col.bulk_write(bulk_ops)
        print(f"    --> Successfully updated {res.modified_count} documents in amazon_makeupkhoj.")

# 2. Clean catalog_sources
src_col = db['catalog_sources']
src_docs = list(src_col.find({
    '$or': [
        {'title': search_re},
        {'name': search_re}
    ]
}))
print(f"\n[2] catalog_sources: Found {len(src_docs)} records with 'Sponsored Ad'")
if src_docs:
    bulk_ops = []
    for doc in src_docs:
        update_fields = {}
        if doc.get('title'):
            clean_t = clean_title_re.sub('', doc['title']).strip()
            if clean_t != doc['title']:
                update_fields['title'] = clean_t
        if doc.get('name'):
            clean_n = clean_title_re.sub('', doc['name']).strip()
            if clean_n != doc['name']:
                update_fields['name'] = clean_n

        if update_fields:
            bulk_ops.append(UpdateOne({'_id': doc['_id']}, {'$set': update_fields}))

    if bulk_ops:
        res = src_col.bulk_write(bulk_ops)
        print(f"    --> Successfully updated {res.modified_count} records in catalog_sources.")

# 3. Clean catalog_nodes
node_col = db['catalog_nodes']
node_docs = list(node_col.find({
    '$or': [
        {'title': search_re},
        {'displayTitle': search_re},
        {'slug': slug_search_re},
        {'productSlug': slug_search_re}
    ]
}))
print(f"\n[3] catalog_nodes: Found {len(node_docs)} groups with 'Sponsored Ad'")
if node_docs:
    bulk_ops = []
    for doc in node_docs:
        update_fields = {}
        if doc.get('title'):
            clean_t = clean_title_re.sub('', doc['title']).strip()
            if clean_t != doc['title']:
                update_fields['title'] = clean_t
        if doc.get('displayTitle'):
            clean_dt = clean_title_re.sub('', doc['displayTitle']).strip()
            if clean_dt != doc['displayTitle']:
                update_fields['displayTitle'] = clean_dt
        if doc.get('slug'):
            clean_s = clean_slug_re.sub('', doc['slug']).strip()
            if clean_s != doc['slug']:
                update_fields['slug'] = clean_s
        if doc.get('productSlug'):
            clean_ps = clean_slug_re.sub('', doc['productSlug']).strip()
            if clean_ps != doc['productSlug']:
                update_fields['productSlug'] = clean_ps

        if update_fields:
            bulk_ops.append(UpdateOne({'_id': doc['_id']}, {'$set': update_fields}))

    if bulk_ops:
        res = node_col.bulk_write(bulk_ops)
        print(f"    --> Successfully updated {res.modified_count} records in catalog_nodes.")

print("\n==========================================================")
print(" VERIFICATION POST-CLEANUP:")
print("==========================================================")
for cname in ['amazon_makeupkhoj', 'catalog_sources', 'catalog_nodes']:
    col = db[cname]
    t_cnt = col.count_documents({'title': search_re})
    n_cnt = col.count_documents({'name': search_re})
    s_cnt = col.count_documents({'slug': slug_search_re})
    print(f"{cname}: remaining with 'Sponsored Ad' -> title: {t_cnt}, name: {n_cnt}, slug: {s_cnt}")

# Check the Elizabeth Arden product specifically
ea = amz_col.find_one({'asin': 'B0B7C31KYZ'})
if ea:
    print(f"\n[Verified Sample ASIN B0B7C31KYZ]:")
    print(f"  Title: {ea.get('title')}")
    print(f"  Name : {ea.get('name')}")
print("==========================================================")

