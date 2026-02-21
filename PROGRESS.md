# ProAnimate Connect - Build Plan & Progress

> Derived from the original build plan: `peoplewallet.docx`

## Overview

**Product:** AI-powered relationship intelligence mobile app.
**Core Thesis:** People forget the people they meet. The 45-second walking-away moment is critical for capturing relationship context.
**Funding:** $500K SAFE at $3.5M cap with milestone contingencies.
**Timeline:** 75-day sprint + 18-month product roadmap.

---

## Milestone Targets (Success = 5 of 6)

| # | Milestone | Day | Confidence | Status |
|---|-----------|-----|-----------|--------|
| 1 | Working iOS prototype (manual + dictation + LinkedIn auto-fill) | 30 | 90% | IN PROGRESS |
| 2 | 250+ beta users at UTD, 30+ AI-assisted contacts | 60 | 75% | Not started |
| 3 | Day-7 and Day-14 retention data | 65 | 85% | Not started |
| 4 | Privacy attorney opinion letter (Perkins Coie/Cooley) | 45 | 95% | Not started |
| 5 | 1 LOI from UTD career center or Dallas professional org | 70 | 60% | Not started |
| 6 | Co-founder candidate in serious conversations | 60 | 70% | Not started |

---

## Tech Stack

| Layer | Technology | Rationale | Status |
|-------|-----------|-----------|--------|
| Mobile | React Native (Expo, iOS-first) | Cross-platform, 70% iPhone in target market | DONE |
| Backend | Node.js + Express | Serverless scaling, low ops overhead | DONE |
| Database | PostgreSQL 17 (local, planned AWS RDS) | Structured + JSON flexibility, AES-256 at rest | DONE |
| Auth | Firebase Auth + LinkedIn OAuth 2.0 | Fast implementation, core feature | DONE (JWT fallback) |
| Speech-to-Text | Deepgram API (Nova-2) | $0.0059/min, superior conversational accuracy | Integrated |
| Entity Extraction | Claude Haiku 4.5 (Anthropic) | Structured output, low cost | TESTED ✓ |
| Push Notifications | Firebase Cloud Messaging | Free tier, reliable iOS delivery | Not started |
| Analytics | Mixpanel (free tier) | Event-based tracking, cohort analysis | Not started |
| CI/CD | GitHub Actions + Fastlane | Automated iOS builds, TestFlight | Not started |
| Monitoring | Sentry + AWS CloudWatch | Crash reporting, API health | Not started |

> **Note:** Original plan specified GPT-4o-mini for extraction. Swapped to Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) per founder preference. Deepgram Nova-2 retained for speech-to-text. Claude 3.5 Haiku reached EOL on Feb 19, 2026.

---

## MVP Feature Set (V1 - Days 1-30)

### Feature 1: Rich Contact Cards
- [x] Identity: Full name, nickname, pronouns
- [x] Appearance tags: Height range, hair color, glasses, distinguishing features (12-month auto-expiry)
- [x] Professional: School, year, major, company, job title
- [x] Social: LinkedIn, Instagram, Twitter, GitHub, website
- [x] Context: How/where met, event name, date, mutual connections
- [x] Notes: Conversation summary, interests, follow-ups
- [x] Relationship tags: User-defined custom tags
- [x] Search & filter contacts

### Feature 2: AI-Assisted Capture (three modes)
- [x] **Mode A - Post-Conversation Dictation (Primary):** User speaks 15-30 sec summary -> Deepgram transcription -> Claude extraction -> pre-populated card. UI built, API integrated.
- [ ] **Mode B - Quick-Add from Recents:** Auto-populate from recent Instagram follow or LinkedIn connection. Deferred post-MVP.
- [x] **Mode C - Live Recording (Secondary):** Record during 1-on-1, visible indicator, consent prompt; audio discarded after transcription. UI built, API integrated.

### Feature 3: Authentication
- [x] Email-based registration & login (JWT)
- [x] LinkedIn OAuth 2.0 login (expo-web-browser in-app flow)
- [ ] Firebase Auth (optional, placeholder configured)

---

## AI/NLP Pipeline

### Dictation-to-Contact Flow
1. User taps "New Contact" and speaks summary (15-30 seconds)
2. Audio -> Deepgram Nova-2 for real-time transcription (<5 sec latency)
3. Transcript -> Claude Haiku 4.5 with structured extraction prompt
4. Confidence scoring:
   - **> 0.7** auto-populate (green)
   - **0.4-0.7** suggest with confirm (yellow)
   - **< 0.4** leave blank
5. User reviews, confirms, saves (~45 seconds total)

### Entity Extraction
Extract: name, school, year, major, company, job_title, interests[], conversation_topics[], follow_up_items[], appearance_tags{}

Rules: Normalize school names, infer year from context, attach confidence scores, **never infer race/ethnicity/health info**.

### Accuracy Targets
| Environment | Expected Accuracy | Behavior |
|------------|-------------------|----------|
| Clean (1-on-1 dictation) | 85-95% | Auto-populate all fields |
| Moderate (coffee shop) | 65-80% | Auto-populate names/school only |
| Poor (career fair cross-talk) | 40-60% | Show raw transcript with highlight UI |
| Very poor | <40% | "Couldn't understand much - highlight key info?" |

### Compute Cost Model
- Deepgram: $0.0059/min -> 30 min/month = $0.18/user
- Claude Haiku extraction: ~10K tokens/month = ~$0.002/user
- Claude Haiku nudges: ~5K tokens/month = ~$0.001/user
- **Total: ~$0.183/user/month** -> At $4.99/mo = **96.3% gross margin**

---

## Privacy Architecture

- **Voice recording:** User-initiated, visible indicator, consent prompt -> compliant with 2-party consent states
- **BIPA:** No voiceprints stored, audio transcribed then discarded
- **Non-user profiling:** "Claimed profile" system for public access/deletion
- **LinkedIn data:** OAuth-based only, public profiles, no scraping
- **Profile-level encryption:** AES-256-GCM ensures breach exposes ciphertext only
- **Appearance tags:** Auto-expire after 12 months of inactivity
- **Rate limit:** 10 new profiles per day per user (prevent bulk surveillance)
- **Content filter:** Blocks sensitive data (SSN, health info) from being stored
- **Audit log:** GDPR/CCPA compliance trail for all data operations

---

## Data Architecture

### Database Schema (PostgreSQL - 11 tables, all migrated)

| Table | Purpose | Status |
|-------|---------|--------|
| `migrations` | Schema version tracking | Migrated |
| `users` | Account management, subscription tier | Migrated |
| `contacts` | Core contact profiles with encryption | Migrated |
| `contact_professional` | School, company, job info | Migrated |
| `contact_social` | Multi-platform social links | Migrated |
| `contact_appearance` | Physical appearance tags (12-month expiry) | Migrated |
| `contact_context` | How/where met, events, mutual connections | Migrated |
| `contact_notes` | Conversation summaries from dictation/manual/recording | Migrated |
| `contact_tags` | User-defined relationship tags | Migrated |
| `transcriptions` | Raw transcripts + extracted entities + confidence scores | Migrated |
| `audit_log` | GDPR/CCPA compliance trail | Migrated |

---

## API Endpoints

### Auth (`/api/auth`)
| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/register` | Create account | Tested |
| POST | `/login` | Login with email | Tested |
| GET | `/me` | Get profile | Tested |
| PUT | `/me` | Update profile | Built |
| GET | `/linkedin` | Get LinkedIn OAuth URL (accepts ?returnUrl) | Tested |
| GET | `/linkedin/callback` | LinkedIn OAuth callback (redirects to mobile) | Tested |

### Contacts (`/api/contacts`)
| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/` | List contacts (search/filter) | Tested |
| POST | `/` | Create contact | Tested |
| GET | `/:id` | Get contact detail | Tested |
| PUT | `/:id` | Update contact | Built |
| DELETE | `/:id` | Delete contact | Built |
| POST | `/:id/notes` | Add note | Built |
| POST | `/:id/tags` | Add tags | Built |

### LinkedIn (`/api/linkedin`)
| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/lookup` | Fetch & extract contact data from LinkedIn profile URL | Built |

### AI Pipeline (`/api/ai`)
| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/transcribe` | Audio -> Deepgram -> Claude -> structured contact | TESTED ✓ |
| POST | `/extract` | Text -> Claude entity extraction | TESTED ✓ |
| POST | `/transcribe-only` | Audio -> Deepgram transcription only | Built |

---

## Project Structure

```
peoplewallet/
├── server/                     # Node.js + Express backend
│   ├── src/
│   │   ├── index.js            # Express server entry (port 3000)
│   │   ├── config/
│   │   │   ├── database.js     # PostgreSQL pool config
│   │   │   └── firebase.js     # Firebase Admin (optional)
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT + Firebase auth, rate limiting, Pro gate
│   │   │   ├── audit.js        # GDPR/CCPA audit logging
│   │   │   └── validation.js   # Express-validator + content filter
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.js  # Full schema (10 app tables)
│   │   │   └── run.js          # Migration runner
│   │   ├── routes/
│   │   │   ├── auth.js         # Register, login, profile, LinkedIn OAuth
│   │   │   ├── contacts.js     # Full CRUD + search/filter/tags/notes
│   │   │   ├── ai.js           # Audio -> Deepgram -> Claude -> contact
│   │   │   └── linkedin.js     # LinkedIn profile lookup + auto-fill
│   │   ├── services/
│   │   │   ├── deepgram.js     # Deepgram Nova-2 transcription
│   │   │   ├── extraction.js   # Claude Haiku 4.5 entity extraction
│   │   │   └── linkedin.js     # LinkedIn OAuth 2.0
│   │   └── utils/
│   │       ├── encryption.js   # AES-256-GCM encrypt/decrypt
│   │       └── logger.js       # Winston logger
│   ├── .env                    # Environment variables
│   └── package.json
│
├── mobile/                     # Expo (React Native) app
│   ├── src/
│   │   ├── App.js              # Root component
│   │   ├── components/
│   │   │   ├── Button.js       # Reusable button (variants, sizes)
│   │   │   ├── Input.js        # Form input with labels/errors
│   │   │   ├── Tag.js          # Removable tag chips
│   │   │   ├── ContactCard.js  # Contact list item card
│   │   │   └── CaptureModeSelector.js  # Mode picker component
│   │   ├── screens/
│   │   │   ├── LoginScreen.js          # Email + LinkedIn login
│   │   │   ├── ContactListScreen.js    # Searchable/filterable list + FAB
│   │   │   ├── ContactDetailScreen.js  # Full contact view
│   │   │   ├── NewContactScreen.js     # Tabbed form + AI confidence
│   │   │   ├── EditContactScreen.js    # Contact editing
│   │   │   ├── DictationScreen.js      # Post-conversation voice memo (expo-av)
│   │   │   ├── RecordingScreen.js      # Live recording + consent (expo-av)
│   │   │   ├── SettingsScreen.js       # Profile, subscription, privacy
│   │   │   └── CaptureChooserScreen.js # Mode picker modal
│   │   ├── navigation/
│   │   │   └── AppNavigator.js # Stack + Bottom Tab, auth-gated
│   │   ├── context/
│   │   │   └── AuthContext.js  # Auth state, LinkedIn OAuth, deep links
│   │   ├── services/
│   │   │   └── api.js          # Axios client with auth interceptors
│   │   └── theme/
│   │       └── colors.js       # Design system tokens
│   ├── app.json                # Expo config (scheme: proanimate)
│   └── package.json
│
├── mobile-rn-backup/           # Original bare React Native (backup)
├── PROGRESS.md                 # This file
└── package.json                # Root package scripts
```

---

## 75-Day Sprint Progress

### Phase 1: Foundation (Days 1-15) - COMPLETE

- [x] Project setup (monorepo structure, server, mobile)
- [x] React Native init -> converted to Expo managed workflow
- [x] PostgreSQL schema design and migration (11 tables)
- [x] Express server with security (helmet, CORS, rate limiting)
- [x] JWT authentication middleware
- [x] Firebase Auth integration (optional, JWT fallback works)
- [x] LinkedIn OAuth 2.0 (full flow: mobile -> browser -> callback -> token)
- [x] Contact CRUD API with search/filter/pagination
- [x] Contact card UI components
- [x] Navigation (Stack + Bottom Tabs, auth-gated)
- [x] Theme/design system (colors, typography, spacing)
- [x] AES-256-GCM encryption for sensitive data
- [x] GDPR/CCPA audit logging middleware
- [x] Content filter (blocks SSN, health info, etc.)
- [ ] CI/CD (GitHub Actions + Fastlane) - deferred

### Phase 2: AI Capture (Days 16-30) - IN PROGRESS

- [x] Deepgram Nova-2 integration (service built)
- [x] Claude 3.5 Haiku extraction pipeline (service + prompt built)
- [x] Dictation mode UI (expo-av Audio.Recording)
- [x] Recording mode UI with consent flow (3 checkboxes)
- [x] Confidence-based UI highlights (green > 0.7, yellow 0.4-0.7, blank < 0.4)
- [x] AI pipeline API routes (transcribe, extract, transcribe-only)
- [x] Pipeline wired end-to-end: DictationScreen → API → Deepgram → Claude → NewContactScreen
- [x] Pro tier gate removed for beta (all users get AI features)
- [x] Text extraction tested via curl — Claude Haiku 4.5 returns structured contacts (0.91 confidence)
- [x] Full audio pipeline tested via curl — Deepgram (99.8% confidence) + Claude extraction in ~3.6s
- [x] Fixed `transcriptions.contact_id` NOT NULL constraint (was blocking pipeline — contact doesn't exist at transcription time)
- [ ] **End-to-end DEVICE test: record on phone → transcribe → extract → save contact**
- [ ] Prompt tuning with real-world audio samples
- [ ] TestFlight / EAS build for device testing
- [x] LinkedIn auto-fill from profile URL (fetches public profile meta tags, Claude extracts structured data, auto-fills form fields)

### Phase 3: Beta Launch (Days 31-50) - NOT STARTED

- [ ] TestFlight / EAS build distribution (10 initial users)
- [ ] Ambassador recruitment (2 from professional fraternity at UTD)
- [ ] Ambassador-led outreach (30+ users)
- [ ] Real-world audio testing (3 networking events)
- [ ] Privacy attorney opinion letter (Perkins Coie/Cooley) - target Day 45
- [ ] Prompt iteration based on real-world data
- [ ] Push to 50+ users, 30+ AI-assisted contacts
- [ ] LOI pursuit: UTD Career Center, Dallas professional orgs

### Phase 4: Measurement (Days 51-75) - NOT STARTED

- [ ] Contact decay reminders ("Haven't connected in 45 days")
- [ ] Pre-event prep nudges (surface relevant contacts before career fairs)
- [ ] "Did You Know?" nudges (weekly LinkedIn update notifications)
- [ ] Mixpanel dashboard (DAU, WAU, Day-1/7/14 retention)
- [ ] User interviews (5 power users, 5 churned)
- [ ] Semester recap feature
- [ ] Co-founder finalization
- [ ] Investor re-pitch with data
- [ ] Final LOI follow-up
- [ ] Submit all milestone evidence

---

## Pricing Model (Planned)

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Manual entry, 50 contacts, basic search |
| Pro | $4.99/mo | AI capture, LinkedIn auto-fill, unlimited contacts, decay reminders |
| Pro Annual | $39.99/yr | ~33% discount |
| Student | $2.99/mo | Pro features with .edu email |

Beta conversion target: 6% free-to-paid (minimum 3%).

---

## Competitive Landscape

| Competitor | Funding | Pricing | Our Advantage |
|------------|---------|---------|--------------|
| Folk | $2.2M | $19/mo | 4x cheaper, campus wedge, AI capture |
| Nat (GitHub ex-CEO) | Undisclosed | $10/mo | Younger demo, campus wedge, structured capture |
| Clay | $46M | $349-800/mo | Consumer accessible, abandoned market |
| Dex | ~$3M | $12/mo | AI-assisted eliminates manual friction |
| Apple Contacts | N/A | Free | Rich context, AI capture, relationship intelligence |
| LinkedIn | $15B+ | Free/$30+/mo | Personal + professional, not platform-limited |

**Key Risk:** Folk - if they launch student pricing or campus distribution, escalate immediately.

---

## Key Metrics & Kill Signals

| Metric | Month 3 | Month 6 | Month 12 | Kill Signal |
|--------|---------|---------|----------|-------------|
| Total Users | 100+ | 1,000 | 5,000 | <200 at Month 6 |
| Paying Users | N/A (beta) | 60 (6%) | 400 | <2% conversion at Month 8 |
| Day-7 Retention | 30%+ | 35%+ | 40%+ | <15% at Month 3 |
| Day-14 Retention | 15%+ | 20%+ | 25%+ | <10% at Month 3 |
| Contacts/User (median) | 5+ | 10+ | 20+ | <3 at Month 6 |
| AI-Assisted Contact Rate | 30%+ | 40%+ | 50%+ | <20% at Month 6 |
| WAU/MAU | 25%+ | 30%+ | 35%+ | <15% at Month 6 |
| NPS | 30+ | 40+ | 50+ | <10 at Month 6 |
| MRR | $0 (beta) | $300 | $2,000 | <$500 at Month 9 |

### Product Kill Signals
- Day-14 retention < 15% -> Pivot to B2B CRM for recruiting
- < 30% AI-assisted contact creation -> AI capture isn't the unlock
- Zero unprompted referrals after 50+ users -> Distribution is structural problem

### Execution Kill Signals
- No prototype by Day 45 -> Ship radically reduced MVP
- Attorney identifies unfixable privacy risk -> Strip AI features
- Founder burnout -> Restructure timeline

---

## Budget Allocation ($500K / 18 months)

| Category | Months 1-6 | Months 7-12 | Months 13-18 | Total |
|----------|-----------|-----------|------------|-------|
| Engineering (contract + tools) | $48K | $60K | $60K | $168K |
| Founder salary ($4K/mo) | $24K | $24K | $24K | $72K |
| Infrastructure/cloud/APIs | $9K | $18K | $24K | $51K |
| Legal & compliance | $15K | $10K | $8K | $33K |
| Campus ambassador program | $6K | $12K | $12K | $30K |
| Marketing & growth | $6K | $18K | $24K | $48K |
| Design (contract) | $12K | $6K | $3K | $21K |
| Contingency buffer | - | - | - | $77K |
| **TOTAL** | **$120K** | **$148K** | **$155K** | **$500K** |

Monthly burn rate: $22-28K average. Cash-flow positive target: ~4,000 paying users at $4.99/mo (Month 14-15).

---

## Post-MVP Roadmap (Months 4-18)

### Phase 2 (Months 4-7): Engagement Layer
- Shareable contact cards (growth mechanic)
- Mutual connections feature
- Quick-Add from Instagram/LinkedIn recents
- Calendar integration for pre-event prep

### Phase 3 (Months 8-12): Social Intelligence
- Contact activity feed (LinkedIn updates, post aggregation)
- AI relationship insights & maintenance suggestions
- Contact groups with batch actions
- Contact archive/export

### Phase 4 (Months 10-18): B2B Expansion
- Team Plans ($29-49/seat/month) for recruiting, sales, event orgs
- Career center partnerships (institutional accounts)
- Event organizer tools (career fair contact flows)
- API layer (Salesforce, HubSpot integrations)

> **B2B Gate:** Do NOT build team plans until: (1) 3+ inbound multi-seat requests, (2) 1 paid pilot with recruiting firm or career center, (3) Proven consumer retention.

---

## Environment Setup

### Server (.env)
```
PORT=3000
DATABASE_URL=postgresql://ihsanduru@localhost:5432/proanimate_connect
ANTHROPIC_API_KEY=<your-key>      # Claude 3.5 Haiku
DEEPGRAM_API_KEY=<your-key>       # Nova-2 speech-to-text
LINKEDIN_CLIENT_ID=<your-id>
LINKEDIN_CLIENT_SECRET=<your-secret>
LINKEDIN_REDIRECT_URI=http://192.168.4.26:3000/api/auth/linkedin/callback
JWT_SECRET=<your-secret>
ENCRYPTION_KEY=<32-byte-key>
```

### Running Locally
```bash
# Start PostgreSQL
brew services start postgresql@17

# Start backend server
cd server && npm run dev          # http://localhost:3000

# Start mobile app
cd mobile && npx expo start       # Expo Go on phone or simulator
```

### Mobile API Base URL
Configured in `mobile/src/services/api.js` -> uses `192.168.4.26:3000` for physical device testing.

---

## Known Issues & Immediate Next Steps

### Blocking (for Milestone 1)
1. ~~**End-to-end AI pipeline test**~~ — ✅ Audio pipeline tested via curl (Deepgram + Claude working). Need device test with expo-av recording.
2. **LinkedIn OAuth redirect URI** - Must register `http://192.168.4.26:3000/api/auth/linkedin/callback` in LinkedIn Developer Console

### Short-term
3. EAS Build for standalone app (custom URL scheme `proanimate://` only works in standalone builds)
4. Push notifications (Firebase Cloud Messaging)
5. Contact decay reminders
6. Pre-event prep feature

### Technical Debt
7. TypeScript migration (mobile currently JS)
8. Unit tests for server routes and services
9. E2E tests for mobile flows
10. Production deployment (AWS ECS Fargate)
11. Sentry error tracking integration
12. Mixpanel analytics integration

---

## Team

| Role | Person | Status |
|------|--------|--------|
| Founder/CEO/AI Engineer | Zalamancer | Active, $4K/mo + equity |
| React Native Engineer | TBD contractor | $6K/mo contract |
| Co-founder (Full-stack mobile) | Searching | Target: handshake by Day 60 |

---

## Risk Register

| Risk | Prob | Impact | Mitigation |
|------|------|--------|-----------|
| Category is non-retentive for consumers | 40% | Fatal | Kill signals at Day-14 retention; pivot to B2B |
| Engineer falls through / co-founder not found | 30% | High | Ship reduced MVP solo; expand search |
| LinkedIn revokes OAuth access | 15% | Medium | Auto-fill is convenience not core; fallback to manual |
| Privacy attorney identifies unfixable legal risk | 10% | High | Remove affected features; evaluate viability |
| Apple ships enhanced contacts | 20% | High | Build deeper not wider; become power-user layer |
| Folk launches student pricing / campus push | 15% | High | Accelerate campus density at UTD; differentiate on AI capture |
| Negative PR around profiling/surveillance | 20% | Medium | Structured tags only, rate limits, transparent privacy |
| Founder burnout | 25% | High | Co-founder solves; strict time-boxing until then |

---

*Last updated: 2026-02-21*
*Source document: /Users/ihsanduru/Documents/peoplewallet.docx*
