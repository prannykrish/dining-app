import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Supabase REST API (PostgREST) base URL
SUPABASE_REST_URL = f"{SUPABASE_URL}/rest/v1"

# DineOnCampus API v4
DINEONCAMPUS_BASE = "https://apiv4.dineoncampus.com"
TAMU_SITE_ID = "5751fd4290975b60e0489534"

# Dining hall names → DineOnCampus location IDs
DINING_HALLS = {
    "Commons": "59972586ee596fe55d2eef75",
    "Sbisa": "587909deee596f31cedc179c",
    "Duncan": "5878eb5cee596f847636f114",
}
