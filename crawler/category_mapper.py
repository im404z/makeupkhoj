#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Central Category Mapper & URL Registry for MakeupKhoj
Parses, normalizes and maps all makeup category listing URLs from 'Marketplace Makeup URLS'
across Amazon, Nykaa, Myntra, and Flipkart.
"""

import os
import re
import json
from typing import Dict, Any, List, Optional

# Base file path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEFAULT_SOURCE_FILE = os.path.join(BASE_DIR, 'Marketplace Makeup URLS')

# Canonical Normalizations
CANONICAL_LEAF_MAP = {
    'foundation': 'Foundation',
    'compact powder': 'Compact Powder',
    'compact': 'Compact Powder',
    'face concealer': 'Concealer',
    'concealer': 'Concealer',
    'eye concealer': 'Eye Concealer',
    'face blushes': 'Blush',
    'blush': 'Blush',
    'face bronzers': 'Bronzer',
    'bronzer': 'Bronzer',
    'face highlighters & illuminators': 'Highlighter',
    'highlighter': 'Highlighter',
    'highlighters': 'Highlighter',
    'foundation primers': 'Primer',
    'face primer': 'Primer',
    'primer': 'Primer',
    'eye primer': 'Eye Primer',
    'eyeshadow bases & primers': 'Eye Primer',
    'sindoors': 'Sindoor',
    'sindoor': 'Sindoor',
    'makeup setting sprays & powders': 'Setting Spray & Powder',
    'setting spray': 'Setting Spray',
    'loose powder': 'Loose Powder',
    'makeup remover': 'Makeup Remover',
    'remover': 'Makeup Remover',
    'contour': 'Contour',
    'bb & cc cream': 'BB & CC Cream',
    'tinted face moisturisers': 'Tinted Moisturizer',
    'tinted moisturizer': 'Tinted Moisturizer',
    
    # Lips
    'lipstick': 'Lipstick',
    'liquid lipstick': 'Liquid Lipstick',
    'lip glosses': 'Lip Gloss',
    'lip gloss': 'Lip Gloss',
    'lip liners': 'Lip Liner',
    'lip liner': 'Lip Liner',
    'lip stains & tints': 'Lip Stain & Tint',
    'lip stain': 'Lip Stain',
    'lip balm': 'Lip Balm',
    
    # Eyes
    'eyeshadow': 'Eyeshadow',
    'eye shadow': 'Eyeshadow',
    'mascaras': 'Mascara',
    'mascara': 'Mascara',
    'eyeliners': 'Eyeliner',
    'eyeliner': 'Eyeliner',
    'eyeliner & kajal': 'Eyeliner & Kajal',
    'kajal & kohls': 'Kajal',
    'kajal': 'Kajal',
    'eyebrow colors': 'Eyebrows',
    'brows': 'Eyebrows',
    'false lashes': 'False Lashes',
    'lashes': 'False Lashes',
    'eye makeup': 'Eye Makeup',
    'face makeup': 'Face Makeup',
    
    # Nails
    'nail paint': 'Nail Polish',
    'nail polish': 'Nail Polish',
    'nails': 'Nail Polish',
    'nail care': 'Nail Care',
    
    # Tools & Combos
    'makeup brushes & tools': 'Brushes & Tools',
    'makeup accessories': 'Brushes & Tools',
    'accessories': 'Brushes & Tools',
    'makeup kits & combos': 'Kits & Combos',
    'kits & combos': 'Kits & Combos',
    'makeup': 'General Makeup'
}

SUB_CAT_LOOKUP = {
    'Foundation': 'Face',
    'Compact Powder': 'Face',
    'Concealer': 'Face',
    'Blush': 'Face',
    'Bronzer': 'Face',
    'Highlighter': 'Face',
    'Primer': 'Face',
    'Sindoor': 'Face',
    'Setting Spray & Powder': 'Face',
    'Setting Spray': 'Face',
    'Loose Powder': 'Face',
    'Makeup Remover': 'Face',
    'Contour': 'Face',
    'BB & CC Cream': 'Face',
    'Tinted Moisturizer': 'Face',
    'Face Makeup': 'Face',
    
    'Lipstick': 'Lips',
    'Liquid Lipstick': 'Lips',
    'Lip Gloss': 'Lips',
    'Lip Liner': 'Lips',
    'Lip Stain & Tint': 'Lips',
    'Lip Stain': 'Lips',
    'Lip Balm': 'Lips',
    
    'Eyeshadow': 'Eyes',
    'Mascara': 'Eyes',
    'Eyeliner': 'Eyes',
    'Eyeliner & Kajal': 'Eyes',
    'Kajal': 'Eyes',
    'Eyebrows': 'Eyes',
    'False Lashes': 'Eyes',
    'Eye Primer': 'Eyes',
    'Eye Concealer': 'Eyes',
    'Eye Makeup': 'Eyes',
    
    'Nail Polish': 'Nails',
    'Nail Care': 'Nails',
    
    'Brushes & Tools': 'Tools & Accessories',
    'Kits & Combos': 'Kits & Sets',
    'General Makeup': 'General'
}


def normalize_category_leaf(raw_text: str) -> str:
    cleaned = raw_text.strip().lower()
    return CANONICAL_LEAF_MAP.get(cleaned, raw_text.strip())


def parse_marketplace_urls(filepath: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Parses 'Marketplace Makeup URLS' and returns a normalized structured list of categories and URLs.
    """
    path = filepath or DEFAULT_SOURCE_FILE
    if not os.path.exists(path):
        # Fallback search
        alt_path = os.path.join(os.getcwd(), 'Marketplace Makeup URLS')
        if os.path.exists(alt_path):
            path = alt_path
        else:
            raise FileNotFoundError(f"Cannot find Marketplace Makeup URLS at {path}")

    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    lines = text.splitlines()
    marketplace = None
    urls = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or line.startswith('---'):
            continue
        if 'Amazon Makeup URLS' in line:
            marketplace = 'amazon'
            continue
        elif 'Nyka Makeup URLS' in line:
            marketplace = 'nykaa'
            continue
        elif 'Myntra Makeup URLS' in line:
            marketplace = 'myntra'
            continue
        elif 'Flipkart Makeup URLS' in line:
            marketplace = 'flipkart'
            continue
        elif line.lower() in ['amazon over', 'face', 'lips', 'eyes', 'nail', 'nails', 'makeup brushes & tools', 'eye makeup']:
            continue

        path_str = ''
        url_str = ''

        m_colon = re.match(r'^(.*?)\s*:\s*(https?://\S+)', line)
        if m_colon:
            path_str = m_colon.group(1).strip()
            url_str = m_colon.group(2).strip()
        elif '\t' in line and 'http' in line:
            parts = [p.strip() for p in line.split('\t') if p.strip()]
            url_str = next((p for p in parts if p.startswith('http')), '')
            path_str = parts[0]
        elif line.startswith('http'):
            url_str = line
        else:
            path_candidate = line
            while i < len(lines):
                next_l = lines[i].strip()
                i += 1
                if not next_l or next_l.startswith('---'):
                    continue
                if next_l.startswith('http'):
                    path_str = path_candidate
                    url_str = next_l
                    break

        if url_str:
            cleaned_path = path_str.replace('->', '→')
            raw_parts = [re.sub(r'^\s*Makeup\s*→?|^\s*Beauty\s*→?', '', p).strip() for p in cleaned_path.split('→')]
            parts = [p for p in raw_parts if p and p.lower() not in ('makeup', 'beauty')]

            if len(parts) >= 2:
                raw_sub = parts[0].strip()
                raw_leaf = parts[1].strip()
            elif len(parts) == 1:
                raw_sub = parts[0].strip()
                raw_leaf = parts[0].strip()
            else:
                raw_sub = 'General'
                raw_leaf = 'Makeup'

            leaf = normalize_category_leaf(raw_leaf)
            sub_cat = SUB_CAT_LOOKUP.get(leaf) or raw_sub

            # Specific fixes
            if raw_leaf.lower() == 'eye concealer':
                sub_cat = 'Eyes'
                leaf = 'Eye Concealer'
            elif raw_leaf.lower() == 'makeup remover':
                sub_cat = 'Face'
                leaf = 'Makeup Remover'

            category_path = f"Makeup > {sub_cat} > {leaf}" if sub_cat != leaf else f"Makeup > {sub_cat}"

            urls.append({
                'marketplace': marketplace,
                'marketplace_name': {
                    'amazon': 'Amazon',
                    'nykaa': 'Nykaa',
                    'myntra': 'Myntra',
                    'flipkart': 'Flipkart',
                    'tatacliq': 'Tata CLiQ'
                }.get(marketplace, marketplace.title() if marketplace else ''),
                'category': 'Makeup',
                'sub_category': sub_cat,
                'sub_sub_category': leaf,
                'category_path': category_path,
                'category_name': leaf,
                'url': url_str
            })

    return urls


def get_marketplace_urls(marketplace: str, filepath: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns all URLs for a given marketplace"""
    all_urls = parse_marketplace_urls(filepath)
    return [u for u in all_urls if u.get('marketplace') == marketplace.lower()]


def lookup_category_by_url(url: str, filepath: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Finds category metadata for a URL"""
    all_urls = parse_marketplace_urls(filepath)
    # 1. Exact match
    for item in all_urls:
        if item['url'] == url or item['url'].rstrip('/') == url.rstrip('/'):
            return item

    # 2. Substring or query match
    for item in all_urls:
        # Check match on path/key query
        if item['url'].split('?')[0] == url.split('?')[0]:
            return item

    return None


def export_all_json_files():
    """Exports structured JSON URL files for each marketplace crawler folder"""
    all_items = parse_marketplace_urls()
    by_mp: Dict[str, List[Dict[str, Any]]] = {}
    for item in all_items:
        mp = item['marketplace']
        by_mp.setdefault(mp, []).append(item)

    base_crawler_dir = os.path.dirname(os.path.abspath(__file__))

    # Write central JSON
    central_path = os.path.join(base_crawler_dir, 'makeup_urls.json')
    with open(central_path, 'w', encoding='utf-8') as f:
        json.dump(all_items, f, indent=2, ensure_ascii=False)
    print(f"[EXPORT OK] Central makeup URLs saved: {central_path} ({len(all_items)} entries)")

    for mp, entries in by_mp.items():
        mp_dir = os.path.join(base_crawler_dir, mp)
        os.makedirs(mp_dir, exist_ok=True)
        json_file = os.path.join(mp_dir, f"{mp}_makeup_urls.json")
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
        
        # Also write a convenient txt list
        txt_file = os.path.join(mp_dir, f"{mp}_makeup_urls.txt")
        with open(txt_file, 'w', encoding='utf-8') as f:
            for e in entries:
                f.write(f"#{e['category_path']}\n{e['url']}\n")

        print(f"[EXPORT OK] {mp.title()}: {len(entries)} URLs saved to {json_file} and {txt_file}")


if __name__ == '__main__':
    export_all_json_files()

