"""
TAMU Dining Hall Menu Scraper

Navigates DineOnCampus with Playwright, intercepts the API responses the
frontend makes, and stores menu data in Supabase.

Usage:
    python scraper.py                    # Scrape today's menus
    python scraper.py --date 2026-03-27  # Scrape a specific date

Setup:
    pip install -r requirements.txt
    python -m playwright install chromium
"""

import argparse
import json
import sys
import time
from datetime import date, datetime

import requests
from playwright.sync_api import sync_playwright, Page

from config import (
    DINING_HALLS,
    SUPABASE_REST_URL,
    SUPABASE_SERVICE_KEY,
)

# Headers for Supabase REST API
SB_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


# ── Supabase helpers ──────────────────────────────────────────────


def sb_get(table: str, params: dict) -> list[dict]:
    resp = requests.get(f"{SUPABASE_REST_URL}/{table}", headers=SB_HEADERS, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def sb_post(table: str, data: dict | list[dict]) -> list[dict]:
    resp = requests.post(f"{SUPABASE_REST_URL}/{table}", headers=SB_HEADERS, json=data, timeout=10)
    resp.raise_for_status()
    return resp.json()


def sb_delete(table: str, params: dict):
    resp = requests.delete(f"{SUPABASE_REST_URL}/{table}", headers=SB_HEADERS, params=params, timeout=10)
    resp.raise_for_status()


# ── Browser-based scraping via interception ───────────────────────


def scrape_location_menus(page: Page, location_id: str, target_date: str) -> dict[str, list[str]]:
    """
    Navigate to a dining hall's menu page and capture all period/menu data.
    Returns {meal_type: [item_names]}.
    """
    captured_periods = []
    captured_menus = {}

    def handle_response(response):
        url = response.url
        try:
            if f"/locations/{location_id}/periods" in url:
                data = response.json()
                captured_periods.extend(data.get("periods", []))
            elif f"/locations/{location_id}/menu" in url:
                data = response.json()
                period_data = data.get("period", {})
                period_id = period_data.get("id", "")
                categories = period_data.get("categories", [])
                items = []
                for cat in categories:
                    for item in cat.get("items", []):
                        name = item.get("name", "").strip()
                        if name:
                            items.append(name)
                captured_menus[period_id] = items
        except Exception:
            pass

    page.on("response", handle_response)

    # Navigate to the menu page — the frontend will auto-load the first period
    slug = {v: k for k, v in DINING_HALLS.items()}
    menu_url = f"https://new.dineoncampus.com/tamu/whats-on-the-menu"
    page.goto(menu_url, wait_until="networkidle")
    time.sleep(3)

    # Select the correct location from the dropdown if needed
    # The page should load with a location selector. Click on our target.
    try:
        # Look for the location dropdown/selector and click the right one
        location_buttons = page.locator('[class*="location"]').all()
        for btn in location_buttons:
            text = btn.inner_text().lower()
            for hall_name, lid in DINING_HALLS.items():
                if lid == location_id and hall_name.lower() in text:
                    btn.click()
                    time.sleep(2)
                    break
    except Exception:
        pass

    # Wait for the periods data to load
    page.wait_for_timeout(3000)

    # Now click through each period tab to load all menus
    period_name_map = {"breakfast": "breakfast", "lunch": "lunch", "dinner": "dinner", "brunch": "lunch"}
    result = {}

    for period in captured_periods:
        period_name = period.get("name", "")
        period_id = period.get("id", "")
        meal_type = period_name_map.get(period_name.lower())

        if not meal_type:
            continue

        # If we already captured this period's menu from initial load, use it
        if period_id in captured_menus:
            result[meal_type] = captured_menus[period_id]
            continue

        # Otherwise, click the period tab to trigger the API call
        try:
            tab = page.locator(f'text="{period_name}"').first
            if tab.is_visible():
                tab.click()
                page.wait_for_timeout(3000)
                if period_id in captured_menus:
                    result[meal_type] = captured_menus[period_id]
        except Exception:
            pass

    page.remove_listener("response", handle_response)
    return result


def scrape_all_via_interception(target_date: str):
    """
    Use a single browser to navigate through each dining hall and capture menus.
    Falls back to direct JavaScript fetch within the page context.
    """
    print(f"Scraping menus for {target_date}...\n")
    print("Launching browser...")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # First visit: establish Cloudflare session
        page.goto("https://new.dineoncampus.com/tamu/whats-on-the-menu", wait_until="networkidle")
        time.sleep(3)

        for hall_name, location_id in DINING_HALLS.items():
            print(f"--- {hall_name} ---")
            dining_hall_id = get_dining_hall_id(hall_name)

            try:
                # Use JavaScript fetch within the page context (shares Cloudflare cookies)
                periods_data = page.evaluate(
                    """async (args) => {
                        const [locId, date] = args;
                        const resp = await fetch(
                            `https://apiv4.dineoncampus.com/locations/${locId}/periods/?date=${date}`
                        );
                        return await resp.json();
                    }""",
                    [location_id, target_date],
                )
                periods = periods_data.get("periods", [])
            except Exception as e:
                print(f"  Failed to fetch periods: {e}")
                continue

            if not periods:
                print("  No meal periods found.")
                continue

            for period in periods:
                period_name = period.get("name", "")
                period_id = period.get("id", "")
                meal_type = normalize_meal_type(period_name)

                if not meal_type:
                    print(f"  Skipping unknown period: {period_name}")
                    continue

                print(f"  {meal_type}...", end=" ")

                try:
                    menu_data = page.evaluate(
                        """async (args) => {
                            const [locId, date, periodId] = args;
                            const resp = await fetch(
                                `https://apiv4.dineoncampus.com/locations/${locId}/menu?date=${date}&period=${periodId}`
                            );
                            return await resp.json();
                        }""",
                        [location_id, target_date, period_id],
                    )
                except Exception as e:
                    print(f"FAILED ({e})")
                    continue

                # Parse items from response, grouped by category/station
                period_obj = menu_data.get("period", {})
                categories = period_obj.get("categories", [])

                # Store in Supabase
                meal_id = upsert_meal(meal_type, target_date, dining_hall_id)
                clear_old_items(meal_id)
                clear_old_stations(meal_id)

                total_items = 0
                for cat in categories:
                    cat_name = cat.get("name", "").strip()
                    if not cat_name:
                        continue
                    cat_items = []
                    for raw in cat.get("items", []):
                        name = raw.get("name", "").strip()
                        if not name:
                            continue
                        allergens = [
                            a["name"]
                            for a in raw.get("allergens", [])
                            if a.get("value") and a.get("name")
                        ]
                        cat_items.append({"name": name, "allergens": allergens})
                    if not cat_items:
                        continue
                    station_id = upsert_station(cat_name, meal_id)
                    insert_menu_items(meal_id, station_id, cat_items)
                    total_items += len(cat_items)

                print(f"{total_items} items")

        browser.close()

    print("\nDone!")


# ── Meal type mapping ─────────────────────────────────────────────

PERIOD_NAME_MAP = {
    "breakfast": "breakfast",
    "lunch": "lunch",
    "dinner": "dinner",
    "brunch": "lunch",
}


def normalize_meal_type(period_name: str) -> str | None:
    return PERIOD_NAME_MAP.get(period_name.lower())


# ── Database operations ───────────────────────────────────────────


def get_dining_hall_id(name: str) -> int:
    rows = sb_get("dining_halls", {"name": f"eq.{name}", "select": "id"})
    if not rows:
        raise ValueError(f"Dining hall '{name}' not found in database")
    return rows[0]["id"]


def upsert_meal(meal_type: str, target_date: str, dining_hall_id: int) -> int:
    existing = sb_get("meals", {
        "meal_type": f"eq.{meal_type}",
        "date": f"eq.{target_date}",
        "dining_hall_id": f"eq.{dining_hall_id}",
        "select": "id",
    })

    if existing:
        return existing[0]["id"]

    result = sb_post("meals", {
        "meal_type": meal_type,
        "date": target_date,
        "dining_hall_id": dining_hall_id,
    })
    return result[0]["id"]


def clear_old_items(meal_id: int):
    # Clear items first — they FK into stations
    sb_delete("menu_items", {"meal_id": f"eq.{meal_id}"})


def clear_old_stations(meal_id: int):
    sb_delete("stations", {"meal_id": f"eq.{meal_id}"})


def upsert_station(name: str, meal_id: int) -> int:
    resp = requests.post(
        f"{SUPABASE_REST_URL}/stations",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
        json={"meal_id": meal_id, "name": name},
        params={"on_conflict": "meal_id,name"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()[0]["id"]


def insert_menu_items(meal_id: int, station_id: int, items: list[dict]):
    if not items:
        return
    rows = [
        {
            "name": item["name"],
            "meal_id": meal_id,
            "station_id": station_id,
            "allergens": item.get("allergens", []),
        }
        for item in items
    ]
    sb_post("menu_items", rows)


# ── Entry point ───────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="TAMU Dining Menu Scraper")
    parser.add_argument("--date", type=str, help="Date to scrape (YYYY-MM-DD), defaults to today")
    args = parser.parse_args()

    target_date = args.date or date.today().isoformat()

    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        print(f"Invalid date format: {target_date}. Use YYYY-MM-DD.")
        sys.exit(1)

    scrape_all_via_interception(target_date)


if __name__ == "__main__":
    main()
