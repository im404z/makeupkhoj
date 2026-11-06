#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Database Configuration & Safety Guard for MakeupKhoj
All makeup crawlers exclusively target the dedicated 'makeupkhoj' database.
Each marketplace stores its complete catalog (listing data + enriched PDP specs) in a single unified collection:
  - amazon_makeupkhoj
  - flipkart_makeupkhoj
  - myntra_makeupkhoj
  - nykaa_makeupkhoj
  - tatacliq_makeupkhoj
Protected databases (amazon, flipkart, myntra, nykaa, scentkhoj) are strictly blocked from writes.
"""

import os
import sys
import logging
from pymongo import MongoClient
from dotenv import load_dotenv

# Load root .env
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ROOT_ENV = os.path.join(PROJECT_ROOT, '.env')
if os.path.exists(ROOT_ENV):
    load_dotenv(ROOT_ENV)
load_dotenv()

# MongoDB URI resolution
DEFAULT_MONGO_URI = (
    os.getenv('MONGODB_URI') or
    os.getenv('MONGO_URI') or
    os.getenv('MONGO') or
    'mongodb://admin:8ko92AWggrY2%21@38.45.64.201:27017/?authSource=admin'
)

# Dedicated Single Database for all MakeupKhoj data
DB_NAME = os.getenv('MASTER_DB', 'makeupkhoj')

# Protected databases that must NEVER be touched or written to
PROTECTED_DATABASES = {'amazon', 'flipkart', 'myntra', 'nykaa', 'scentkhoj', 'admin', 'config', 'local'}

# Marketplace Collections inside 'makeupkhoj' database
COLLECTIONS = {
    'amazon': 'amazon_makeupkhoj',
    'flipkart': 'flipkart_makeupkhoj',
    'myntra': 'myntra_makeupkhoj',
    'nykaa': 'nykaa_makeupkhoj',
    'tatacliq': 'tatacliq_makeupkhoj',
    'master_products': 'products',
    'master_brands': 'brands',
}


def validate_db_safety(db_name: str, collection_name: str = None):
    """Safety guardrail to ensure we never touch existing databases or legacy collections"""
    if db_name in PROTECTED_DATABASES:
        raise ValueError(
            f"[CRITICAL SAFETY BLOCK] Write attempt blocked on existing database '{db_name}'. "
            f"All MakeupKhoj data must only be written to '{DB_NAME}'!"
        )
    if collection_name and collection_name in ['amazon_perfume', 'amazon_perfume_products', 'flipkart_perfume', 'myntra_perfume']:
        raise ValueError(
            f"[CRITICAL SAFETY BLOCK] Write attempt blocked on legacy perfume collection '{collection_name}'!"
        )


def get_mongo_client(uri: str = None) -> MongoClient:
    """Returns a connected MongoClient instance"""
    target_uri = uri or DEFAULT_MONGO_URI
    return MongoClient(target_uri, serverSelectionTimeoutMS=6000)


def get_db(uri: str = None, db_name: str = DB_NAME):
    """Returns the dedicated makeupkhoj database with strict safety validation"""
    validate_db_safety(db_name)
    client = get_mongo_client(uri)
    return client[db_name]


def get_collection(marketplace: str, uri: str = None):
    """Returns the requested collection within makeupkhoj database"""
    coll_name = COLLECTIONS.get(marketplace, marketplace)
    db = get_db(uri)
    return db[coll_name]
