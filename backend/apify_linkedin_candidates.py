"""
Apify -> LinkedIn candidate pull -> cleaned Excel/CSV

Setup:
    pip install apify-client pandas openpyxl
    Set env vars (don't hardcode secrets):
        APIFY_TOKEN   = your Apify API token (Apify Console > Settings > Integrations)
        LI_AT_COOKIE  = li_at cookie from the TEMP LinkedIn account

Usage:
    1. Pick an actor in the Apify Store (LinkedIn profile / people search scraper).
    2. Open its "Input" tab, switch to JSON view, and copy the input format.
    3. Paste it into ACTOR_INPUT below. Keep the cookie as LI_AT_COOKIE.
    4. python apify_linkedin_candidates.py
"""

import os
import sys
from datetime import datetime

import pandas as pd
from apify_client import ApifyClient

# ---------------- CONFIG ----------------
ACTOR_ID = "PASTE_ACTOR_ID_HERE"   # e.g. "username/actor-name" from the actor's URL

LI_AT = os.environ.get("LI_AT_COOKIE", "")

# Paste the actor's JSON input here. Field names differ per actor.
# The example below is only a shape: replace it with the actor's real input.
ACTOR_INPUT = {
    "cookie": [{"name": "li_at", "value": LI_AT, "domain": ".linkedin.com"}],
    "searchUrl": "https://www.linkedin.com/search/results/people/?keywords=java%20developer&geoUrn=%5B%22102713980%22%5D",
    "maxResults": 100,          # keep small per run; see notes in chat
    "minDelay": 5,              # seconds between requests, if the actor supports it
    "maxDelay": 15,
}

OUTPUT_PREFIX = "linkedin_candidates"
# ----------------------------------------

# Possible field names across different actors -> our standard column
FIELD_MAP = {
    "Full Name":        ["fullName", "name", "full_name", "firstName"],
    "Headline":         ["headline", "title", "occupation", "jobTitle"],
    "Current Company":  ["companyName", "currentCompany", "company", "current_company"],
    "Current Role":     ["currentPosition", "position", "jobTitle", "currentRole"],
    "Location":         ["location", "geoLocation", "addressWithCountry", "city"],
    "Experience":       ["experience", "experiences", "positions"],
    "Skills":           ["skills", "topSkills"],
    "Education":        ["education", "educations", "schools"],
    "Email":            ["email", "emails"],
    "Phone":            ["phone", "phones", "mobileNumber"],
    "Profile URL":      ["profileUrl", "url", "linkedinUrl", "linkedInProfileUrl", "publicProfileUrl"],
}


def pick(item: dict, keys: list):
    for k in keys:
        v = item.get(k)
        if v not in (None, "", [], {}):
            if isinstance(v, list):
                parts = []
                for x in v:
                    if isinstance(x, dict):
                        parts.append(" | ".join(str(val) for val in x.values() if val)[:200])
                    else:
                        parts.append(str(x))
                return "; ".join(parts)
            if isinstance(v, dict):
                return " | ".join(str(val) for val in v.values() if val)
            return v
    return ""


def main():
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        sys.exit("Set APIFY_TOKEN env var first.")
    if not LI_AT:
        print("Warning: LI_AT_COOKIE is empty. Cookie-based actors will fail.")
    if ACTOR_ID.startswith("PASTE"):
        sys.exit("Set ACTOR_ID first.")

    client = ApifyClient(token)
    print(f"Running {ACTOR_ID} ...")
    run = client.actor(ACTOR_ID).call(run_input=ACTOR_INPUT)
    if not run or run.get("status") != "SUCCEEDED":
        sys.exit(f"Run did not succeed: {run.get('status') if run else 'no run'}")

    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"Fetched {len(items)} raw records")
    if not items:
        sys.exit("No data returned. Check the cookie (expired/logged out) and the actor input.")

    rows = [{col: pick(it, keys) for col, keys in FIELD_MAP.items()} for it in items]
    df = pd.DataFrame(rows)

    # Clean + dedupe
    df["Profile URL"] = df["Profile URL"].astype(str).str.split("?").str[0].str.rstrip("/")
    df = df[df["Full Name"].astype(str).str.strip().ne("") &
            ~df["Full Name"].astype(str).str.contains("LinkedIn Member", case=False)]
    df = df.drop_duplicates(subset=["Profile URL"]).reset_index(drop=True)
    df.insert(0, "Pulled On", datetime.now().strftime("%Y-%m-%d"))

    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    xlsx, csv = f"{OUTPUT_PREFIX}_{stamp}.xlsx", f"{OUTPUT_PREFIX}_{stamp}.csv"
    df.to_excel(xlsx, index=False)
    df.to_csv(csv, index=False)

    # Keep raw too, in case the field mapping missed something
    pd.DataFrame(items).to_json(f"{OUTPUT_PREFIX}_{stamp}_raw.json", orient="records", indent=2)

    print(f"Saved {len(df)} clean candidates -> {xlsx}, {csv} (+ raw JSON)")


if __name__ == "__main__":
    main()
