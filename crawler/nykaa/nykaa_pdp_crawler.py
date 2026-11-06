#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScentKhoj Nykaa PDP / Catalog Extractor - nykaa_pdp_crawler.py
=============================================================
High-performance Product Details Page (PDP) extractor for Nykaa Fragrances.
Extracts deep specifications, fragrance notes, verified brand names, volume/size,
pricing, customer review photo rails, and verified buyer reviews.

Features:
  - Bypasses Akamai Bot Protection with curl_cffi Chrome 124 TLS client hello
  - Dual extraction engine:
      1. Fast JSON Extraction via window.__PRELOADED_STATE__
      2. Resilient DOM Fallback targeting exact Nykaa PDP HTML classes
  - Extracts:
      * Untruncated full title & volume/size (e.g. "100ml")
      * Verified brand name using Nykaa's metadata + NykaaBrandMatcher
      * Live selling price, strike-through MRP, and discount percentage
      * Rating score (e.g. 4.4/5), total rating count, review count & 5-star split
      * High-resolution gallery images, swatch icons & product demo videos
      * Fragrance pyramid notes (Top, Heart, Base notes & olfactory family)
      * Full A+ product story and description
      * Verified buyer reviews (title, description, rating, variant/shade, review photos)
      * Customer review photo rail
      * Seller, expiry date, return policy, and country of origin
  - Ingests into MongoDB collection: `nykaa.product_data`
  - Flags scraped records in `nykaa.products` (`pdp_scraped: True`)

Usage:
  # Scrape 10 pending PDPs:
  python crawler/nykaa/nykaa_pdp_crawler.py --limit 10

  # Scrape a specific URL directly:
  python crawler/nykaa/nykaa_pdp_crawler.py --url "https://www.nykaa.com/.../p/17493667"

  # Force re-scrape all:
  python crawler/nykaa/nykaa_pdp_crawler.py --limit 50 --force
"""

import os
import sys
import re
import csv
import json
import time
import random
import logging
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

# Ensure UTF-8 console output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Optional curl_cffi for Akamai TLS Impersonation
try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

# Optional BeautifulSoup
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# Optional PyMongo
try:
    import pymongo
    from pymongo import UpdateOne
except ImportError:
    pymongo = None
    UpdateOne = None

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', 'server', '.env'))
except ImportError:
    pass

# Import MakeupKhoj DB config and Category Mapper
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety
from category_mapper import get_marketplace_urls, lookup_category_by_url

DEFAULT_DB = DB_NAME  # 'makeupkhoj'
DEFAULT_COLLECTION = COLLECTIONS['nykaa']  # 'nykaa_makeupkhoj'

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("NykaaPDPCrawler")

# Import or define Brand Matcher
try:
    from crawler.nykaa.nykaa_crawler import NykaaBrandMatcher
except Exception:
    NykaaBrandMatcher = None


# --- HELPER UTILITIES ---
def clean_text(val: Any) -> str:
    """Strip excess whitespace and escape control chars."""
    if not val:
        return ""
    return re.sub(r'\s+', ' ', str(val)).strip()


def parse_number(val: Any) -> Optional[Any]:
    """Parse numeric values (int/float) safely."""
    if val is None or val == "" or val == "N/A":
        return None
    if isinstance(val, (int, float)):
        return val
    s = str(val).replace(",", "").strip()
    m = re.search(r'[-+]?\d*\.?\d+', s)
    if m:
        num = float(m.group(0))
        return int(num) if num.is_integer() else num
    return None


def extract_pyramid_notes(text: str, title: str = "") -> Dict[str, List[str]]:
    """Extract olfactory notes (Top, Heart, Base) and Fragrance Family."""
    combined = f"{title}\n{text}"
    notes = {
        "top": [],
        "heart": [],
        "base": [],
        "family": []
    }

    top_pat = re.search(r'(?:Top Notes?|Opening|Head Notes?)\s*[:\-–]\s*([^\n\.<]+)', combined, re.I)
    heart_pat = re.search(r'(?:Heart Notes?|Middle Notes?)\s*[:\-–]\s*([^\n\.<]+)', combined, re.I)
    base_pat = re.search(r'(?:Base Notes?|Drydown|Bottom Notes?)\s*[:\-–]\s*([^\n\.<]+)', combined, re.I)
    family_pat = re.search(r'(?:Fragrance Family|Olfactory Family|Fragrance Category)\s*[:\-–]\s*([^\n\.<]+)', combined, re.I)

    if top_pat:
        notes["top"] = [x.strip() for x in re.split(r'[,|/&;]', top_pat.group(1)) if x.strip()]
    if heart_pat:
        notes["heart"] = [x.strip() for x in re.split(r'[,|/&;]', heart_pat.group(1)) if x.strip()]
    if base_pat:
        notes["base"] = [x.strip() for x in re.split(r'[,|/&;]', base_pat.group(1)) if x.strip()]
    if family_pat:
        notes["family"] = [x.strip() for x in re.split(r'[,|/&;]', family_pat.group(1)) if x.strip()]

    # Fallback: scan for well-known olfactory families
    if not notes["family"] and not notes["top"]:
        families = ["Floral", "Citrus", "Woody", "Aquatic", "Fresh Aqua", "Oriental", "Gourmand", "Spicy", "Aromatic", "Fruity", "Musk"]
        found_fams = [f for f in families if re.search(rf'\b{re.escape(f)}\b', combined, re.I)]
        if found_fams:
            notes["family"] = found_fams

    return notes


def clean_high_res_image(url: str) -> str:
    """Convert Nykaa image transform URLs into clean high-resolution assets."""
    if not url:
        return ""
    # Remove thumbnail transformation parameter (e.g. tr:w-150,h-150 or ?tr=w-344,h-344)
    clean = re.sub(r'tr:[^/]+/', '', url)
    clean = re.sub(r'\?tr=[^&]+', '', clean)
    return clean


def extract_makeup_attributes(text: str, title: str = "", prod_state: dict = None) -> Dict[str, Any]:
    """Extract makeup-specific attributes: shade, finish, formulation, coverage, skin_type, spf."""
    combined = f"{title}\n{text}"
    attrs = {
        "shade": None,
        "finish": None,
        "formulation": None,
        "coverage": None,
        "skin_type": None,
        "spf": None
    }

    # Shade
    shade_match = re.search(r'(?:Shade(?:\s*Name|\s*No\.?)?|Color)\s*[:\-–]\s*([^\n\.<,]+)', combined, re.I)
    if shade_match:
        attrs["shade"] = shade_match.group(1).strip()
    elif prod_state and prod_state.get("variantName"):
        attrs["shade"] = clean_text(prod_state.get("variantName"))

    # Finish
    finishes = ["Matte", "Glossy", "Dewy", "Satin", "Shimmer", "Radiant", "Metallic", "Natural", "Velvet", "Glitter", "Luminous", "Sheer"]
    for f in finishes:
        if re.search(rf'\b{f}\b', combined, re.I):
            attrs["finish"] = f
            break

    # Formulation
    formulations = ["Liquid", "Cream", "Powder", "Gel", "Crayon", "Pencil", "Stick", "Serum", "Mousse", "Pressed Powder", "Loose Powder"]
    for frm in formulations:
        if re.search(rf'\b{re.escape(frm)}\b', combined, re.I):
            attrs["formulation"] = frm
            break

    # Coverage
    coverages = ["Full Coverage", "Medium Coverage", "Sheer Coverage", "Buildable Coverage", "Light Coverage"]
    for cov in coverages:
        if re.search(rf'\b{re.escape(cov)}\b', combined, re.I):
            attrs["coverage"] = cov
            break
    if not attrs["coverage"]:
        for cov_simple in ["Full", "Medium", "Sheer", "Light"]:
            if re.search(rf'\b{cov_simple}\s+Coverage\b', combined, re.I):
                attrs["coverage"] = f"{cov_simple} Coverage"
                break

    # Skin Type
    skin_types = ["All Skin Types", "Oily Skin", "Dry Skin", "Combination Skin", "Sensitive Skin", "Normal Skin"]
    for st in skin_types:
        if re.search(rf'\b{re.escape(st)}\b', combined, re.I):
            attrs["skin_type"] = st
            break

    # SPF
    spf_match = re.search(r'\b(SPF\s*\d+\+?)\b', combined, re.I)
    if spf_match:
        attrs["spf"] = spf_match.group(1).upper()

    return attrs


# --- CORE PDP EXTRACTOR ---
class NykaaPDPCrawler:
    """Extractor for Nykaa Fragrance Product Details Pages"""

    def __init__(self, mongo_uri: Optional[str] = None):
        self.mongo_uri = mongo_uri or DEFAULT_MONGO_URI
        self.session = None

        if cffi_requests is not None:
            self.session = cffi_requests.Session(impersonate="chrome124")
        else:
            logger.warning("curl_cffi is not installed. Akamai may block standard requests.")

        self.brand_matcher = NykaaBrandMatcher(mongo_uri=self.mongo_uri) if NykaaBrandMatcher else None

    def fetch_page_html(self, url: str) -> Optional[str]:
        """Fetch live Nykaa PDP HTML with Chrome 124 TLS impersonation"""
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
        }

        try:
            if self.session:
                resp = self.session.get(url, headers=headers, timeout=25)
            else:
                import urllib.request
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=25) as r:
                    return r.read().decode('utf-8', errors='replace')

            if resp.status_code == 200:
                return resp.text
            elif resp.status_code == 404:
                logger.warning(f"  [404 NOT FOUND] {url}")
                return None
            else:
                logger.warning(f"  [HTTP {resp.status_code}] Failed to fetch {url}")
                return None
        except Exception as e:
            logger.error(f"  [FETCH ERROR] {url}: {e}")
            return None

    def parse_pdp(self, html: str, source_url: str) -> Optional[Dict[str, Any]]:
        """
        Extract detailed catalog data using hybrid Preloaded State + DOM parser.
        """
        if not html:
            return None

        # Try JSON extraction first
        state_data = self._extract_preloaded_state(html)
        soup = BeautifulSoup(html, "html.parser") if BeautifulSoup else None

        prod_state = state_data.get("productPage", {}).get("product", {}) if state_data else {}
        app_state = state_data.get("appReducer", {}) if state_data else {}

        # 1. Product IDs
        raw_pid = None
        if prod_state.get("id"):
            raw_pid = str(prod_state["id"])
        elif source_url:
            m = re.search(r'/p/(\d+)', source_url) or re.search(r'productId=(\d+)', source_url)
            if m:
                raw_pid = m.group(1)

        formatted_id = f"NYK-{raw_pid}" if raw_pid else f"NYK-{abs(hash(source_url)) % 100000000}"

        # 2. Title & Size / Volume
        title = None
        size = None
        if prod_state.get("title"):
            title = clean_text(prod_state.get("title"))
        elif prod_state.get("name"):
            title = clean_text(prod_state.get("name"))
        elif soup:
            h1 = soup.select_one("h1.css-1gc4x7i") or soup.select_one("h1")
            if h1:
                title = clean_text(h1.get_text())

        if prod_state.get("packSize"):
            size = clean_text(prod_state.get("packSize"))
        elif soup:
            size_el = soup.select_one("span.css-1ctpgu6")
            if size_el:
                size = clean_text(size_el.get_text()).strip("()")

        # Clean title if size is appended e.g. "(100ml)"
        if title and size and f"({size})" in title:
            clean_product_title = title.replace(f"({size})", "").strip()
        else:
            clean_product_title = title

        # 3. Brand
        brand = None
        if prod_state.get("brandName"):
            brand = clean_text(prod_state["brandName"])
        elif self.brand_matcher and clean_product_title:
            brand = self.brand_matcher.extract_brand(clean_product_title, source_url)

        # 4. Breadcrumbs & Category & Gender
        breadcrumbs: List[str] = []
        if app_state.get("breadCrumb"):
            for bc in app_state["breadCrumb"]:
                k = bc.get("key")
                if k and k not in breadcrumbs:
                    breadcrumbs.append(clean_text(k))
        elif soup:
            for li in soup.select("nav[aria-label='Breadcrumb'] li"):
                txt = li.get_text(strip=True).replace("❯", "").strip()
                if txt and txt not in breadcrumbs:
                    breadcrumbs.append(txt)

        cat_meta = lookup_category_by_url(source_url) or {}
        category = cat_meta.get('category', 'Makeup')
        sub_category = cat_meta.get('sub_category', breadcrumbs[1] if len(breadcrumbs) > 1 else (breadcrumbs[0] if breadcrumbs else 'General'))
        sub_sub_category = cat_meta.get('sub_sub_category', cat_meta.get('category_name', breadcrumbs[-1] if breadcrumbs else 'Makeup'))
        category_path = cat_meta.get('category_path', f"Makeup > {sub_category} > {sub_sub_category}")
        category_name = cat_meta.get('category_name', sub_sub_category)

        gender = "Unisex"
        for bc in breadcrumbs:
            if "women" in bc.lower():
                gender = "Women"
                break
            elif "men" in bc.lower():
                gender = "Men"
                break

        if gender == "Unisex" and title:
            if re.search(r'\b(?:for women|for her)\b', title, re.I):
                gender = "Women"
            elif re.search(r'\b(?:for men|for him)\b', title, re.I):
                gender = "Men"

        # 5. Pricing & Availability
        mrp = parse_number(prod_state.get("mrp"))
        price = parse_number(prod_state.get("offerPrice"))
        in_stock = bool(prod_state.get("inStock", True))
        discount_percentage = parse_number(prod_state.get("discount"))

        if soup and (price is None or mrp is None):
            price_el = soup.select_one(".css-1jczs19") or soup.select_one(".css-111z9ua")
            if price_el:
                price = parse_number(price_el.get_text())

            mrp_el = soup.select_one(".css-u05rr") or soup.select_one(".css-17x46n5")
            if mrp_el:
                mrp = parse_number(mrp_el.get_text())

            disc_el = soup.select_one(".css-bhhehx") or soup.select_one(".css-cjd9an")
            if disc_el and discount_percentage is None:
                discount_percentage = parse_number(disc_el.get_text())

        if mrp is None and price is not None:
            mrp = price
        elif price is None and mrp is not None:
            price = mrp

        if discount_percentage is None and mrp and price and mrp > price:
            discount_percentage = round(((mrp - price) / mrp) * 100)

        discount_text = f"{discount_percentage}% Off" if discount_percentage else ""

        # 6. Ratings & Breakdown
        rating = parse_number(prod_state.get("rating"))
        rating_count = parse_number(prod_state.get("ratingCount"))
        review_count = parse_number(prod_state.get("reviewCount"))

        if soup:
            if rating is None:
                r_el = soup.select_one(".css-m6n3ou") or soup.select_one(".css-1297gf2")
                if r_el:
                    rating = parse_number(r_el.get_text().split("/")[0])

            if rating_count is None:
                for el in soup.select(".css-1hvvm95, .css-v6hqrc, .css-1eip5u4 div"):
                    m_rc = re.search(r'([\d,]+)\s*(?:verified\s*)?ratings?', el.get_text(), re.I)
                    if m_rc:
                        rating_count = parse_number(m_rc.group(1))
                        break

            if review_count is None:
                for el in soup.select(".css-1hvvm95, .css-1eip5u4 div"):
                    m_rev = re.search(r'([\d,]+)\s*reviews?', el.get_text(), re.I)
                    if m_rev:
                        review_count = parse_number(m_rev.group(1))
                        break

        rating_breakdown = {}
        if prod_state.get("reviewSplitUp") and isinstance(prod_state["reviewSplitUp"], list):
            for row in prod_state["reviewSplitUp"]:
                star_id = row.get("id")
                star_cnt = parse_number(row.get("count"))
                if star_id is not None:
                    rating_breakdown[f"{star_id}_star"] = star_cnt
        elif soup:
            for row in soup.select(".ratingSplitPopup .css-kxc9rx"):
                lbl = row.select_one("label")
                cnt = row.select_one(".css-11lfsnj")
                if lbl and cnt:
                    s_num = lbl.get_text(strip=True)
                    rating_breakdown[f"{s_num}_star"] = parse_number(cnt.get_text())

        # 7. Images, Swatches & Videos
        gallery_images: List[str] = []
        video_urls: List[str] = []

        # From preloaded state media
        if prod_state.get("parentMedia"):
            for m_item in prod_state["parentMedia"]:
                if m_item.get("mediaType") == "image" and m_item.get("url"):
                    clean_img = clean_high_res_image(m_item["url"])
                    if clean_img not in gallery_images:
                        gallery_images.append(clean_img)
                elif m_item.get("mediaType") == "video" and m_item.get("url"):
                    if m_item["url"] not in video_urls:
                        video_urls.append(m_item["url"])

        # Also check variants media
        if prod_state.get("variants"):
            for v in prod_state["variants"]:
                for m_item in v.get("media", []):
                    u = clean_high_res_image(m_item.get("url"))
                    if u and u not in gallery_images:
                        gallery_images.append(u)
                for c_item in v.get("carousel", []):
                    u = clean_high_res_image(c_item.get("url"))
                    if u and u not in gallery_images and not u.endswith(".mp4"):
                        gallery_images.append(u)
                    elif c_item.get("mediaType") == "video" and c_item.get("url"):
                        if c_item["url"] not in video_urls:
                            video_urls.append(c_item["url"])

        # Fallback to DOM images
        if soup and not gallery_images:
            for img in soup.select(".slide-view-container img, .productSelectedImage img, .css-smh1rg img, .css-irizhh img, img[alt*='product image'], img[alt='product-image-lens']"):
                src = img.get("src")
                if src:
                    clean_img = clean_high_res_image(src)
                    if clean_img and clean_img not in gallery_images and "userprofile" not in clean_img and "prod-review" not in clean_img:
                        gallery_images.append(clean_img)

        hero_image = gallery_images[0] if gallery_images else clean_high_res_image(prod_state.get("imageUrl", ""))

        # Customer photos rail
        customer_photos: List[str] = []
        if state_data.get("reviewImages", {}).get("images"):
            for rim in state_data["reviewImages"]["images"]:
                u = rim.get("url")
                if u:
                    clean_u = clean_high_res_image(u)
                    if clean_u not in customer_photos:
                        customer_photos.append(clean_u)
        elif soup:
            for img in soup.select(".imageRailImageItem img, .imageItem img"):
                src = img.get("src")
                if src:
                    clean_u = clean_high_res_image(src)
                    if clean_u and clean_u not in customer_photos and "userprofile" not in clean_u:
                        customer_photos.append(clean_u)

        # 8. Description & Fragrance Notes
        raw_desc_html = prod_state.get("description", "")
        clean_desc = ""
        if raw_desc_html:
            clean_desc = BeautifulSoup(raw_desc_html, "html.parser").get_text(separator="\n", strip=True) if BeautifulSoup else raw_desc_html
        elif soup:
            desc_el = soup.select_one("#content-details") or soup.select_one(".css-13udqpx")
            if desc_el:
                raw_desc_html = str(desc_el)
                clean_desc = desc_el.get_text(separator="\n", strip=True)

        pyramid_notes = extract_pyramid_notes(clean_desc, clean_product_title or "")

        # 9. Variants (Bottle Sizes / Shades)
        variants_list: List[Dict[str, Any]] = []
        if prod_state.get("variants"):
            for v in prod_state["variants"]:
                v_entry = {
                    "variant_id": str(v.get("childId") or v.get("id")),
                    "sku": v.get("sku"),
                    "name": v.get("variantName") or v.get("name"),
                    "pack_size": v.get("packSize"),
                    "price": parse_number(v.get("offerPrice")),
                    "mrp": parse_number(v.get("mrp")),
                    "discount": v.get("discount"),
                    "in_stock": bool(v.get("inStock", True)),
                    "shade_image": v.get("shadeImage"),
                    "expiry": v.get("expiry")
                }
                variants_list.append(v_entry)
        elif soup:
            for btn in soup.select("button[id^='variant_']"):
                var_id = btn.get("id", "").replace("variant_", "")
                label = btn.get("aria-label", "")
                img_el = btn.select_one("img")
                variants_list.append({
                    "variant_id": var_id,
                    "name": label,
                    "shade_image": img_el.get("src") if img_el else None
                })

        # 10. Verified Customer Reviews
        reviews_list: List[Dict[str, Any]] = []
        if prod_state.get("latestReviews") and isinstance(prod_state["latestReviews"], list):
            for r in prod_state["latestReviews"]:
                rev_photos = [clean_high_res_image(u) for u in r.get("images", []) if u]
                reviews_list.append({
                    "id": str(r.get("id", "")),
                    "author": r.get("name"),
                    "rating": parse_number(r.get("rating")),
                    "title": clean_text(r.get("title", "")).strip('"'),
                    "text": clean_text(r.get("description", "")),
                    "date": r.get("createdOnText") or r.get("createdOn"),
                    "is_verified": bool(r.get("isBuyer", True)),
                    "helpful_count": parse_number(r.get("likeCount", 0)) or 0,
                    "photos": rev_photos,
                    "variant_id": str(r.get("variantId", ""))
                })
        elif soup:
            for card in soup.select(".css-z7l7ua"):
                author_el = card.select_one(".css-amd8cf")
                verified_el = card.select_one(".css-fl6f6z")
                rating_el = card.select_one(".css-1132h24")
                shade_el = card.select_one(".css-1aqqo0s")
                date_el = card.select_one(".css-3zk3jq")
                title_el = card.select_one(".css-tm4hnq")
                text_el = card.select_one("p.css-1n0nrdk")
                helpful_el = card.select_one(".css-137iujl")

                rev_photos = []
                for p_img in card.select(".imageItem img"):
                    psrc = p_img.get("src")
                    if psrc:
                        rev_photos.append(clean_high_res_image(psrc))

                reviews_list.append({
                    "author": clean_text(author_el.get_text()) if author_el else None,
                    "is_verified": bool(verified_el and "verified" in verified_el.get_text().lower()),
                    "rating": parse_number(rating_el.get_text()) if rating_el else None,
                    "shade": clean_text(shade_el.get_text()) if shade_el else None,
                    "date": clean_text(date_el.get_text()) if date_el else None,
                    "title": clean_text(title_el.get_text()).strip('"') if title_el else None,
                    "text": clean_text(text_el.get_text()) if text_el else None,
                    "helpful_count": parse_number(helpful_el.get_text()) if helpful_el else 0,
                    "photos": rev_photos
                })

        # Ensure all customer review photos are included in customer_photos
        for r in reviews_list:
            for p in r.get("photos", []):
                if p and p not in customer_photos:
                    customer_photos.append(p)

        # 11. Metadata & Specifics
        seller_name = prod_state.get("sellerName")
        if not seller_name and soup:
            s_el = soup.select_one(".css-1ggqzsv")
            if s_el:
                seller_name = clean_text(s_el.get_text())

        expiry_date = prod_state.get("expiry")
        if not expiry_date and soup:
            exp_p = soup.find(string=re.compile(r'Expiry Date:', re.I))
            if exp_p:
                expiry_date = clean_text(exp_p).replace("Expiry Date:", "").strip()

        origin_country = prod_state.get("originOfCountryName")
        if not origin_country and soup:
            orig_el = soup.select_one(".content-info")
            if orig_el:
                origin_country = clean_text(orig_el.get_text())

        bestseller_tag = None
        if prod_state.get("bestSellerTagInfo"):
            tag_info = prod_state["bestSellerTagInfo"]
            bestseller_tag = f"#{tag_info.get('rank', '')} BESTSELLER in {tag_info.get('categoryName', '')}".strip()
        elif soup:
            bs_el = soup.select_one("span[data-test-id='gradientWrapper']")
            cat_el = soup.select_one(".css-mnzhu9")
            if bs_el:
                bestseller_tag = f"{clean_text(bs_el.get_text())} in {clean_text(cat_el.get_text()) if cat_el else ''}".strip()

        # Extract makeup-specific attributes
        makeup_attrs = extract_makeup_attributes(clean_desc, clean_product_title or "", prod_state)

        return {
            "id": formatted_id,
            "product_id": raw_pid,
            "sku": prod_state.get("sku"),
            "title": clean_product_title,
            "brand": brand or "Unknown",
            "url": source_url,
            "slug": prod_state.get("slug") or urlparse(source_url).path.strip("/"),
            "gender": gender,
            "category": category,
            "sub_category": sub_category,
            "sub_sub_category": sub_sub_category,
            "category_path": category_path,
            "category_name": category_name,
            "category_url": cat_meta.get('url', source_url),
            "size": size or prod_state.get("packSize"),
            "pack_size": size or prod_state.get("packSize"),

            # Makeup Attributes
            "shade": makeup_attrs.get("shade"),
            "finish": makeup_attrs.get("finish"),
            "formulation": makeup_attrs.get("formulation"),
            "coverage": makeup_attrs.get("coverage"),
            "skin_type": makeup_attrs.get("skin_type"),
            "spf": makeup_attrs.get("spf"),
            "breadcrumbs": breadcrumbs,

            # Pricing
            "price": price,
            "mrp": mrp,
            "discount": discount_text,
            "discount_percentage": discount_percentage,
            "in_stock": in_stock,

            # Ratings & Reviews
            "rating": rating,
            "rating_count": rating_count,
            "review_count": review_count,
            "rating_breakdown": rating_breakdown,

            # Visuals
            "image": hero_image,
            "images": gallery_images,
            "customer_photos": customer_photos,
            "videos": video_urls,

            # Product Content & Specs
            "description": clean_desc,
            "description_html": raw_desc_html,
            "pyramid_notes": pyramid_notes,
            "bestseller_tag": bestseller_tag,
            "seller_name": seller_name or "Nykaa E retail limited",
            "expiry_date": expiry_date,
            "country_of_origin": origin_country or "India",
            "manufacturer": prod_state.get("manufacturerName"),
            "return_policy": prod_state.get("messageOnReturn") or "15 days",
            "authenticity_badge": "100% Genuine Products",

            # Variants & Customer Reviews
            "variants": variants_list,
            "reviews": reviews_list,

            "marketplace": "nykaa",
            "crawled_at": datetime.now(timezone.utc).isoformat()
        }

    def _extract_preloaded_state(self, html: str) -> Dict[str, Any]:
        """Extract and parse window.__PRELOADED_STATE__ JSON object from HTML"""
        try:
            idx = html.find("window.__PRELOADED_STATE__")
            if idx == -1:
                return {}
            end_idx = html.find("</script>", idx)
            if end_idx == -1:
                return {}
            raw_js = html[idx:end_idx].strip()
            raw_json = re.sub(r'^window\.__PRELOADED_STATE__\s*=\s*', '', raw_js).rstrip(';')
            return json.loads(raw_json)
        except Exception:
            return {}

    def run(
        self,
        limit: int = 50,
        force: bool = False,
        mode: str = "pending",
        single_url: Optional[str] = None,
        single_id: Optional[str] = None,
        dry_run: bool = False
    ) -> int:
        """Run batch PDP extraction for pending or targeted Nykaa products"""
        is_all_mode = (mode == "all" or force)
        active_mode = "all" if is_all_mode else "pending"

        logger.info("=" * 75)
        logger.info(f"       MAKEUPKHOJ NYKAA PDP & CATALOG EXTRACTOR")
        logger.info("=" * 75)
        logger.info(f"Target DB: {DEFAULT_DB}.{DEFAULT_COLLECTION} | Master: {DEFAULT_DB}.products")
        logger.info(f"Execution Mode: {active_mode.upper()} {'(Re-checking all products)' if is_all_mode else '(Pending un-scraped items only)'}")
        logger.info(f"Run Type: {'DRY RUN' if dry_run else 'LIVE MONGODB SYNC'}")
        logger.info(f"Limit: {limit if limit > 0 else 'All available'} | Force: {force}")
        logger.info("-" * 75)

        # 1. Determine targets
        targets = []
        client = None
        db = None
        col = None

        if pymongo:
            try:
                validate_db_safety(DEFAULT_DB, DEFAULT_COLLECTION)
                client = pymongo.MongoClient(self.mongo_uri, serverSelectionTimeoutMS=8000)
                db = client[DEFAULT_DB]
                col = db[DEFAULT_COLLECTION]
            except Exception as e:
                logger.error(f"MongoDB connection failed: {e}")

        if single_url:
            targets = [{"url": single_url, "id": single_id or "NYK-CUSTOM"}]
        elif single_id and col is not None:
            doc = col.find_one({"$or": [{"id": single_id}, {"product_id": single_id}]})
            if doc:
                targets = [doc]
            else:
                logger.warning(f"Product ID {single_id} not found in {DEFAULT_COLLECTION}.")
                return 0
        elif col is not None:
            query = {} if is_all_mode else {"$or": [{"pdp_scraped": {"$ne": True}}, {"pdp_scraped": {"$exists": False}}]}
            cursor = col.find(query)
            if limit > 0:
                cursor = cursor.limit(limit)
            targets = list(cursor)

        if not targets:
            logger.info(f"No products to scrape in '{active_mode}' mode. Use --all to re-scrape existing items.")
            return 0

        logger.info(f"Loaded {len(targets)} Nykaa product(s) to process (Mode: {active_mode.upper()}).\n")

        total_scraped = 0

        for idx, item in enumerate(targets, 1):
            url = item.get("url")
            pid = item.get("id") or item.get("product_id")
            if not url:
                continue

            logger.info(f"[{idx}/{len(targets)}] Scraping PDP: {pid} | {url[:65]}...")

            html = self.fetch_page_html(url)
            if not html:
                time.sleep(1.0)
                continue

            record = self.parse_pdp(html, url)
            if not record or not record.get("title"):
                logger.warning(f"  Failed to parse PDP data for {url}")
                continue

            total_scraped += 1

            now_utc = datetime.now(timezone.utc)
            now_iso = now_utc.isoformat()
            today_str = now_utc.strftime("%Y-%m-%d")

            new_price = record.get("price")
            mrp = record.get("mrp") or new_price
            if mrp is None and new_price is not None:
                mrp = new_price
            elif new_price is None and mrp is not None:
                new_price = mrp

            record["price"] = new_price
            record["mrp"] = mrp
            record["price_last_checked"] = now_iso
            record["updated_at"] = now_iso
            record["pdp_scraped"] = True
            record["pdp_scraped_at"] = now_iso

            # Log rich sample summary
            logger.info(
                f"  -> Extracted: [{record['brand']}] {record['title'][:48]} | "
                f"Price: INR {record.get('price')} (MRP: INR {record.get('mrp')}) | "
                f"Shade: {record.get('shade')} | Finish: {record.get('finish')} | "
                f"Rating: {record.get('rating')} ({record.get('rating_count')} revs)"
            )
            if record.get("reviews"):
                logger.info(f"     Verified Reviews: {len(record['reviews'])} extracted | Photos: {len(record.get('customer_photos', []))}")

            if not dry_run and col is not None and pymongo is not None:
                # Check existing record for price shift & review tracking
                existing = col.find_one({"$or": [{"id": record["id"]}, {"id": pid}, {"url": url}]})
                price_shift_detected = False
                old_price = None
                pdp_update_ops = {"$set": record}

                if existing:
                    old_price = existing.get("price")
                    existing_history = existing.get("price_history") or []

                    if new_price is not None and old_price is not None and round(float(old_price)) != round(float(new_price)):
                        price_shift_detected = True
                        shift = round(float(new_price) - float(old_price))
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": old_price,
                            "mrp": mrp or new_price,
                            "change": shift,
                            "marketplace": "nykaa"
                        }
                        if shift < 0:
                            logger.info(f"  [PRICE DROP] Nykaa PID {pid}: ₹{old_price} -> ₹{new_price} (Save ₹{abs(shift)} / Price Drop!)")
                        else:
                            logger.info(f"  [PRICE HIKE] Nykaa PID {pid}: ₹{old_price} -> ₹{new_price} (+₹{shift})")

                        pdp_update_ops["$push"] = {
                            "price_history": {
                                "$each": [history_entry],
                                "$slice": -30
                            }
                        }
                        pdp_update_ops["$min"] = {"lowest_recorded_price": new_price}
                        pdp_update_ops["$max"] = {"highest_recorded_price": max(mrp or new_price, existing.get("highest_recorded_price", 0))}
                    elif not existing_history and new_price is not None:
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": new_price,
                            "mrp": mrp or new_price,
                            "change": 0,
                            "marketplace": "nykaa"
                        }
                        pdp_update_ops["$push"] = {
                            "price_history": {
                                "$each": [history_entry],
                                "$slice": -30
                            }
                        }
                        pdp_update_ops["$min"] = {"lowest_recorded_price": new_price}
                        pdp_update_ops["$max"] = {"highest_recorded_price": mrp or new_price}

                    old_rating = existing.get("rating")
                    new_rating = record.get("rating")
                    old_rc = existing.get("rating_count") or existing.get("review_count")
                    new_rc = record.get("rating_count") or record.get("review_count")
                    if (new_rating and old_rating and new_rating != old_rating) or (new_rc and old_rc and new_rc != old_rc):
                        logger.info(f"  [REVIEWS UPDATED] Nykaa PID {pid}: Rating {old_rating}★ -> {new_rating}★ | Reviews: {old_rc} -> {new_rc}")

                else:
                    record["created_at"] = now_iso
                    if new_price is not None:
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": new_price,
                            "mrp": mrp or new_price,
                            "change": 0,
                            "marketplace": "nykaa"
                        }
                        pdp_update_ops["$push"] = {
                            "price_history": {
                                "$each": [history_entry],
                                "$slice": -30
                            }
                        }
                        record["lowest_recorded_price"] = new_price
                        record["highest_recorded_price"] = mrp or new_price

                # 1. Upsert full deep specifications in-place into makeupkhoj.nykaa_makeupkhoj
                match_filter = {}
                if "_id" in item:
                    match_filter = {"_id": item["_id"]}
                elif item.get("id"):
                    match_filter = {"id": item.get("id")}
                elif item.get("url"):
                    match_filter = {"url": item.get("url")}
                else:
                    match_filter = {"id": record["id"]}

                col.update_one(match_filter, pdp_update_ops, upsert=True)

                # 2. Propagate to makeupkhoj master products catalog
                try:
                    master_col = db["products"]
                    target_ids = [record["id"], item.get("id")]
                    master_set_fields = {
                        "name": record.get("title"),
                        "brand": record.get("brand"),
                        "category": record.get("category", "Makeup"),
                        "sub_category": record.get("sub_category"),
                        "sub_sub_category": record.get("sub_sub_category"),
                        "category_path": record.get("category_path"),
                        "category_name": record.get("category_name"),
                        "shade": record.get("shade"),
                        "finish": record.get("finish"),
                        "formulation": record.get("formulation"),
                        "coverage": record.get("coverage"),
                        "skin_type": record.get("skin_type"),
                        "spf": record.get("spf"),
                        "price": record.get("price"),
                        "lowest_price": record.get("price"),
                        "mappings.nykaa.id": record.get("id"),
                        "mappings.nykaa.price": record.get("price"),
                        "mappings.nykaa.mrp": record.get("mrp"),
                        "mappings.nykaa.url": url,
                        "mappings.nykaa.rating": record.get("rating"),
                        "mappings.nykaa.rating_count": record.get("rating_count"),
                        "mappings.nykaa.seller": record.get("seller_name"),
                        "mappings.nykaa.updated_at": now_iso,
                        "price_last_checked": now_iso,
                        "updated_at": now_iso
                    }
                    if record.get("image"):
                        master_set_fields["mappings.nykaa.image"] = record["image"]
                        master_set_fields["image"] = record["image"]
                    if record.get("images"):
                        master_set_fields["mappings.nykaa.images"] = record["images"]

                    master_ops = {
                        "$set": master_set_fields,
                        "$addToSet": {
                            "customer_photos": {"$each": record.get("customer_photos", [])},
                            "images": {"$each": record.get("images", [])}
                        }
                    }

                    if price_shift_detected and old_price is not None:
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": old_price,
                            "mrp": mrp or new_price,
                            "change": round(float(new_price) - float(old_price)),
                            "marketplace": "nykaa"
                        }
                        master_ops["$push"] = {"price_history": {"$each": [history_entry], "$slice": -30}}
                        if new_price:
                            master_ops["$min"] = {"lowest_recorded_price": new_price}

                    master_col.update_many(
                        {
                            "$or": [
                                {"mappings.nykaa.id": {"$in": target_ids}},
                                {"mappings.nykaa.url": url},
                                {"id": {"$in": target_ids}}
                            ]
                        },
                        master_ops
                    )
                except Exception as m_err:
                    logger.debug(f"Master catalog sync notice: {m_err}")

                # 3. Brand synchronization to makeupkhoj.brands
                if record.get("brand") and record["brand"] != "Unknown":
                    try:
                        db["brands"].update_one(
                            {"name": record["brand"]},
                            {
                                "$set": {
                                    "name": record["brand"],
                                    "marketplace": "nykaa",
                                    "updated_at": now_iso
                                },
                                "$setOnInsert": {"created_at": now_iso}
                            },
                            upsert=True
                        )
                    except Exception as b_err:
                        logger.debug(f"Brand sync notice: {b_err}")

            # Politeness delay
            time.sleep(random.uniform(0.8, 1.6))

        logger.info("\n" + "=" * 75)
        logger.info(f"[PDP CRAWL COMPLETE] Successfully processed {total_scraped} Nykaa PDP document(s) in {DEFAULT_DB}.{DEFAULT_COLLECTION}.")
        logger.info("=" * 75)
        return total_scraped


# --- CLI ENTRYPOINT ---
def main():
    parser = argparse.ArgumentParser(description="MakeupKhoj Nykaa PDP / Catalog Details Extractor")
    parser.add_argument("--mode", choices=["all", "pending"], default=None, help="Crawl mode: 'all' to re-crawl entire catalog (update prices, price history, reviews), 'pending' for unscraped products only")
    parser.add_argument("--all", dest="run_all", action="store_true", help="Re-crawl ALL catalog products (check price changes, record price history, update reviews/ratings)")
    parser.add_argument("--pending", dest="run_pending", action="store_true", help="Crawl ONLY pending / unscraped products")
    parser.add_argument("--limit", type=int, default=50, help="Max products to scrape (0 for all) [default: 50]")
    parser.add_argument("--url", type=str, default=None, help="Scrape a single Nykaa PDP URL directly")
    parser.add_argument("--id", type=str, default=None, help="Scrape a specific product ID")
    parser.add_argument("--force", action="store_true", help="Force re-scrape already processed products (alias for --all)")
    parser.add_argument("--dry-run", action="store_true", help="Scrape without saving changes to MongoDB")
    parser.add_argument("--mongo-uri", type=str, default=DEFAULT_MONGO_URI, help="MongoDB connection URI")

    args = parser.parse_args()

    # Determine mode
    mode = "pending"
    if args.run_all or args.force or args.mode == "all":
        mode = "all"
    elif args.run_pending or args.mode == "pending":
        mode = "pending"
    elif not args.url and not args.id and args.limit == 50 and len(sys.argv) == 1:
        # Interactive mode selection when invoked without CLI arguments
        print("\n" + "=" * 65)
        print(f"      NYKAA PDP CRAWLER -> {DEFAULT_DB}.{DEFAULT_COLLECTION}")
        print("=" * 65)
        print("Select Crawling Mode:")
        print("  [1] Crawl PENDING products only (unscraped Nykaa items) [DEFAULT]")
        print("  [2] Re-crawl ALL catalog products (check price changes, reviews, ratings)")
        choice = input("Enter choice [1 or 2, default: 1]: ").strip()
        if choice == "2":
            mode = "all"
        else:
            mode = "pending"

        limit_in = input("\nEnter max products to scrape [Press Enter for all, or enter number]: ").strip().lower()
        if limit_in.isdigit():
            args.limit = int(limit_in)
        else:
            args.limit = 0

    extractor = NykaaPDPCrawler(mongo_uri=args.mongo_uri)
    extractor.run(
        limit=args.limit,
        force=(mode == "all"),
        mode=mode,
        single_url=args.url,
        single_id=args.id,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
