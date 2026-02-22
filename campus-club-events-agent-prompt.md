# Campus Club Event Aggregator — Full Build Prompt

## Project Overview

Build a feature within our existing React + Node.js + PostgreSQL application that automatically discovers UTD student organization Instagram accounts, lets users select which clubs to follow, fetches their latest public Instagram post daily, and uses AI to analyze each post to determine if it's an event — extracting structured event data (date, time, location, food availability, dress code, etc.) into our existing events feed with a confidence-based ranking system.

---

## Tech Stack (Existing)

- **Frontend:** React
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **AI/LLM:** Anthropic Claude API (Claude Sonnet for analysis)
- **Auth:** Whatever auth system is already in place

---

## Architecture: 3 Major Pipelines

### Pipeline 1: Club Discovery & Directory (Instagram Only)

**Goal:** Build and maintain a ranked database of UTD student org Instagram accounts.

**Discovery Sources (run as periodic cron job or admin-triggered):**

1. **Google Dorking via SerpAPI or Google Custom Search API:**
   - Queries to run:
     - `"UTD" site:instagram.com`
     - `"UT Dallas" site:instagram.com`
     - `"utdallas" site:instagram.com`
   - Extract Instagram handles/URLs from search results
   - Store raw discovered accounts in a `discovered_accounts` staging table

2. **UTD Official Student Org Directory:**
   - Scrape or manually import from UTD's Student Organization Center page
   - Cross-reference with discovered Instagram accounts

3. **LLM Classification:**
   - For each discovered account, fetch their public bio/description
   - Send to Claude with prompt: *"Given this Instagram bio and username, determine: (1) Is this a UT Dallas student organization? (2) What category? (academic, social, cultural, sports, professional, religious, arts, greek life, other) (3) Confidence score 0-1. Respond in JSON."*
   - Store the confidence score — this feeds directly into the ranking system (see below)
   - No manual review needed. Low-confidence accounts simply rank lower.

**Ranking System — Core Concept:**

Every club gets a `ranking_score` (0-100) that determines its position in all listings. The score is calculated from:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Registered on our platform** | +40 points | Club admin has created an account on our app and claimed their club. This is the biggest boost — we reward clubs that use our platform. We are also 100% sure they are a real club. |
| **LLM confidence score** | +25 points max | `confidence * 25`. A 0.9 confidence = +22.5 points |
| **From official UTD directory** | +15 points | Cross-referenced with university's official student org list |
| **Instagram follower count** | +10 points max | Scaled: `min(followers / 1000, 10)` — caps at 10k followers |
| **Post recency** | +10 points max | Posted in last 7 days = +10, last 30 days = +5, older = 0 |

Clubs that register on our platform automatically get the highest visibility. Scraped-only clubs still appear but rank lower. This incentivizes clubs to join our platform.

**Database Schema:**

```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT, -- academic, social, cultural, sports, professional, religious, arts, greek_life, other
  instagram_handle TEXT UNIQUE,
  bio TEXT,
  profile_image_url TEXT,
  follower_count INTEGER,
  ranking_score FLOAT DEFAULT 0, -- 0-100, recalculated periodically
  is_registered BOOLEAN DEFAULT false, -- club admin has claimed this on our platform
  registered_user_id UUID REFERENCES users(id), -- the club admin who claimed it
  discovery_source TEXT, -- google_dork, official_directory, user_submitted, self_registered
  llm_confidence FLOAT, -- 0-1 from classification
  in_official_directory BOOLEAN DEFAULT false,
  last_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE discovered_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL UNIQUE,
  url TEXT,
  bio TEXT,
  llm_classification JSONB, -- {is_utd_org: bool, category: str, confidence: float}
  status TEXT DEFAULT 'pending', -- pending, promoted (moved to clubs table)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Pipeline 2: Post Fetching (Instagram Only)

**Goal:** Fetch the most recent post from each tracked club's Instagram daily at 5 AM CT.

**Fetching Schedule:**
- **Runs once daily at 5:00 AM CT** via cron job
- Fetches only the **1 most recent post** per club
- Deduplicates by Instagram post ID (skip if already stored)
- If the post is new, queue it for AI event analysis

**Instagram Fetching Strategy (pick one, in order of preference):**
1. **Apify Instagram Scraper** — most reliable, ~$5/1000 posts, returns structured JSON
2. **RapidAPI Instagram endpoints** — various providers, check for `instagram-scraper-api` or similar
3. **Direct public endpoint** — fragile but free fallback

**Database Schema:**

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  instagram_post_id TEXT NOT NULL UNIQUE, -- native ID from Instagram
  post_url TEXT,
  image_urls TEXT[], -- array of image URLs (carousel posts have multiple)
  caption TEXT,
  posted_at TIMESTAMPTZ,
  likes_count INTEGER,
  comments_count INTEGER,
  raw_data JSONB, -- full raw response for future use
  ai_analysis_status TEXT DEFAULT 'pending', -- pending, analyzed, not_event
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Pipeline 3: AI Event Extraction & Analysis (Claude)

**Goal:** For every new post, determine if it's an event and extract maximum structured data.

**Analysis Flow:**

1. After the 5 AM fetch, for each new post where `ai_analysis_status = 'pending'`:
   - Send the post image(s) AND caption to **Claude API** (use `claude-sonnet-4-5-20250929` with vision)
   - Parse the structured JSON response
   - If `is_event: true` → insert into `events` table with the `ai_confidence` score
   - Events rank in the feed by: `club.ranking_score * 0.6 + event.ai_confidence * 40`
   - Low-confidence events still appear, just further down the feed

**Claude Event Extraction Prompt:**

```
You are an AI assistant that analyzes social media posts from university student organizations to extract event information.

Given the following social media post (image + caption) from a student club at UT Dallas, analyze it and determine:

1. **Is this an event announcement?** (yes/no)
   - Events include: meetings, workshops, socials, info sessions, fundraisers, competitions, performances, study sessions, guest speakers, career fairs, etc.
   - NOT events: memes, throwback photos, member spotlights, general announcements without a specific gathering, recruitment posts without a specific date

2. If YES, extract ALL available information into this JSON structure:

{
  "is_event": true,
  "confidence": 0.95,
  "event_name": "Spring Kickoff Social",
  "event_type": "social",
  "description": "Brief 1-2 sentence description of what the event is about",
  "date": "2025-02-15",
  "date_raw": "February 15th",
  "time_start": "18:00",
  "time_end": "20:00",
  "time_raw": "6-8 PM",
  "location": "ECSW 1.315",
  "location_building": "Engineering and Computer Science West",
  "is_on_campus": true,
  "food_available": true,
  "food_details": "Free pizza and drinks",
  "dress_code": "business casual",
  "dress_code_details": "Wear your best professional attire",
  "is_free": true,
  "cost": null,
  "rsvp_required": false,
  "rsvp_link": null,
  "capacity_limited": false,
  "open_to_all": true,
  "membership_required": false,
  "perks": ["free food", "networking", "resume review"],
  "tags": ["career", "networking", "professional development"],
  "contact_info": "@utd_business_club on Instagram",
  "recurring": false,
  "recurring_pattern": null
}

Event type options: meeting, workshop, social, info_session, fundraiser, competition, performance, study_session, guest_speaker, career_fair, sports, cultural, other

Dress code options: casual, business_casual, formal, costume, theme_specific (null if not mentioned)

3. If NOT an event, return:
{
  "is_event": false,
  "post_type": "meme"
}

Post type options: meme, spotlight, recruitment, announcement, throwback, other

IMPORTANT RULES:
- If a field's info is not available in the post, set it to null. Do NOT guess or hallucinate.
- If the date says something relative like "this Friday" or "tomorrow", calculate the actual date. The post was published on: {post_timestamp}.
- Look at BOTH the image AND the caption — event flyers in images often contain details not in the caption.
- UTD campus building abbreviations: ECSW = Engineering & Computer Science West, ECSS = Engineering & Computer Science South, SCI = Science Building, JSOM = Jindal School of Management, SU = Student Union, AB = Activity Center, ATC = Activity Center Theater, FN = Founders North, CB = Classroom Building, GR = Green Hall, HH = Hoblitzelle Hall, MC = Math/CS Building
- For food: look for keywords like "free food", "pizza", "refreshments", "snacks provided", "catered", food emojis, etc.
- Respond with ONLY valid JSON, no markdown formatting or backticks.
```

**Event Feed Ranking Formula:**

Events in the feed are sorted by a combined score:

```
event_feed_score = (club.ranking_score * 0.6) + (event.ai_confidence * 40)
```

This means:
- A registered club (ranking_score ~85) with high-confidence event (0.95): `85*0.6 + 0.95*40 = 51 + 38 = 89`
- A scraped-only club (ranking_score ~30) with high-confidence event (0.9): `30*0.6 + 0.9*40 = 18 + 36 = 54`
- A scraped club with low-confidence event (0.5): `30*0.6 + 0.5*40 = 18 + 20 = 38`

Registered clubs naturally float to the top. Everything still shows — just ranked.

Within the same score tier, sort by event date (soonest first).

**Database Schema:**

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id),
  club_id UUID REFERENCES clubs(id),
  event_name TEXT,
  event_type TEXT,
  description TEXT,
  event_date DATE,
  time_start TIME,
  time_end TIME,
  location TEXT,
  location_building TEXT,
  is_on_campus BOOLEAN,
  food_available BOOLEAN DEFAULT false,
  food_details TEXT,
  dress_code TEXT,
  dress_code_details TEXT,
  is_free BOOLEAN DEFAULT true,
  cost DECIMAL(10,2),
  rsvp_required BOOLEAN DEFAULT false,
  rsvp_link TEXT,
  open_to_all BOOLEAN DEFAULT true,
  perks TEXT[],
  tags TEXT[],
  contact_info TEXT,
  recurring BOOLEAN DEFAULT false,
  recurring_pattern TEXT,
  ai_confidence FLOAT,
  feed_score FLOAT, -- precomputed: club.ranking_score * 0.6 + ai_confidence * 40
  raw_ai_response JSONB,
  status TEXT DEFAULT 'active', -- active, cancelled, completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_event_interactions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  interaction_type TEXT, -- saved, interested, going, dismissed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, interaction_type)
);
```

---

## Frontend: Event Detail Page (New Page to Build)

Build an event detail page accessible from the existing events feed. Each event card in the feed links to this page.

**Event Detail Page shows:**
- Club profile pic + name (links to club page)
- Original Instagram post image/flyer (full size)
- Event name as page title
- All extracted fields displayed cleanly:
  - 📅 Date & time
  - 📍 Location (with campus map pin if on-campus)
  - 🍕 Food info (if available)
  - 👔 Dress code (if specified)
  - 🎟️ Cost / Free badge
  - 📋 RSVP link (if available)
  - Whether it's open to all or members-only
  - Perks listed as badges/chips
  - Tags as clickable filters
- "Interested" / "Going" / "Save" action buttons
- "Add to Google Calendar" button (generate gcal link with event details pre-filled)
- "View Original Post" link → opens Instagram post
- Related upcoming events from the same club

---

## Existing Pages to Update

### Club Discovery Page (Already Exists)
- **Update sorting** to use `ranking_score` descending
- Registered clubs should visually stand out (verified badge or "Official" tag)
- Everything else about the page stays the same

### Events Feed (Already Exists)
- **Update sorting** to use `feed_score` descending, then by event date soonest-first as tiebreaker
- Add quick-glance badges on event cards: 🍕 Free Food | 📍 On Campus | 💼 Business Casual | 🎟️ Free
- Add filter options: food available, free only, on-campus only, category, date range
- Each event card links to the new Event Detail Page

---

## Cron Jobs / Background Workers

1. **Club Discovery** — Weekly (Sunday 2 AM CT): Run Google dork queries, classify new accounts with Claude, calculate ranking scores
2. **Post Fetcher** — Daily at 5:00 AM CT: Fetch the 1 most recent post from each tracked club's Instagram
3. **Event Analyzer** — Runs immediately after post fetch completes: Run Claude vision analysis on all new pending posts
4. **Ranking Recalculator** — Daily after analysis: Recalculate `ranking_score` for all clubs and `feed_score` for active events
5. **Event Cleanup** — Daily: Mark past events as `completed`

---

## API Endpoints

```
# Clubs
GET    /api/clubs                    — List all clubs, sorted by ranking_score desc
GET    /api/clubs/:id                — Club detail + upcoming events
POST   /api/clubs/suggest            — User submits a missing club
POST   /api/clubs/register           — Club admin claims/registers their club (big ranking boost)

# User Club Follows
GET    /api/me/clubs                 — User's followed clubs
POST   /api/me/clubs/:clubId/follow  — Follow a club
DELETE /api/me/clubs/:clubId/follow  — Unfollow a club

# Events
GET    /api/events                   — Events feed sorted by feed_score, filtered by user's clubs + date range + category + food + free-only + on-campus
GET    /api/events/:id               — Event detail (full extracted data)
GET    /api/events/calendar          — Events in calendar format for calendar view

# User Event Interactions
POST   /api/events/:id/interested    — Mark interested
POST   /api/events/:id/going         — Mark going
POST   /api/events/:id/save          — Save event
DELETE /api/events/:id/interaction   — Remove interaction
```

---

## Environment Variables Needed

```env
# Existing
DATABASE_URL=
JWT_SECRET=

# Google Dorking (pick one)
SERPAPI_KEY=           # For Google dorking ($50/mo)
# OR
GOOGLE_CSE_API_KEY=   # Google Custom Search (100 free/day, then $5/1000)
GOOGLE_CSE_ID=        # Custom Search Engine ID

# Instagram Scraping (pick one)
APIFY_TOKEN=          # For Instagram scraping (~$5/1000 posts)
# OR
RAPIDAPI_KEY=         # Alternative Instagram scraping provider

# AI Analysis
ANTHROPIC_API_KEY=    # For Claude vision event analysis

# Optional
GOOGLE_MAPS_API_KEY=  # For location mapping on event detail pages
```

---

## Implementation Priority Order

1. **Database schema + migrations** — set up all tables above
2. **Seed club directory** — manual seed with top 50 UTD clubs + their Instagram handles
3. **Ranking system** — implement `ranking_score` calculation, wire into existing club discovery page sorting
4. **Instagram post fetcher** — 5 AM CT cron job, fetch 1 most recent post per club
5. **Claude event analyzer** — process new posts, extract event data, store with `feed_score`
6. **Wire events into existing feed** — sort by `feed_score`, add filter badges
7. **Event detail page** — full event view with all extracted info + calendar export
8. **Club registration flow** — let club admins claim their club for the +40 ranking boost
9. **Google dork discovery pipeline** — automate finding new club Instagram accounts
10. **"Add to Calendar" + share functionality**

---

## Key Technical Notes

- **Rate limits:** With 1 post per club per day at 5 AM, even 500 clubs = 500 API calls — very manageable.
- **Image storage:** Download and store Instagram images in your own S3/Cloudflare R2 bucket. Instagram image URLs expire.
- **Claude API cost:** ~$0.01-0.03 per post with Claude Sonnet vision. 500 posts/day = ~$5-15/day max.
- **Job queue:** Use BullMQ with Redis or pg-boss for the background processing pipeline (fetch → analyze → rank).
- **Ranking recalc:** Precompute `feed_score` on events and `ranking_score` on clubs so feed queries are a simple `ORDER BY feed_score DESC` — no expensive joins at read time.
- **Timezone:** All times in CT (Central Time) since UTD is in Richardson, TX. Store as UTC in DB, convert for display.
