# Rent & Flatmate Finder

A platform where owners list rooms and tenants create "looking for room" profiles. An
AI-powered compatibility engine scores and ranks matches, real-time chat unlocks once
interest is accepted, and email notifications fire on key events.

## Tech stack

- **Backend:** Node.js, Express, Prisma ORM, PostgreSQL, Socket.IO, JWT auth, Zod validation
- **Frontend:** Vanilla HTML/CSS/JS single-page app (no build step), Socket.IO client
- **LLM:** Anthropic Claude API for compatibility scoring, with a deterministic rule-based fallback
- **Email:** Nodemailer over SMTP (works with any free-tier provider)

The frontend is served as static files directly by the Express server, so the whole
app deploys as **one service** (simplest path for Render/Railway). It can also be split
into two services if preferred (see "Deploying separately" below).

---

## 1. Project structure

```
rent-flatmate-finder/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # DB schema (see section 4)
│   ├── src/
│   │   ├── routes/              # auth, tenant-profile, listings, interests, chats, admin
│   │   ├── middleware/          # JWT auth, role guard, error handler
│   │   ├── services/
│   │   │   ├── compatibilityService.js  # LLM scoring + rule-based fallback
│   │   │   ├── matchService.js          # caches scores in DB
│   │   │   └── emailService.js          # nodemailer wrapper
│   │   ├── sockets/chatSocket.js        # WebSocket real-time chat
│   │   ├── prisma/seed.js               # seeds a default admin user
│   │   ├── app.js                       # Express app (also serves frontend/)
│   │   └── server.js                    # HTTP server + Socket.IO bootstrap
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── api.js              # fetch wrapper for the REST API
        ├── app-core.js         # router, layout, auth screens
        ├── app-tenant.js       # tenant profile + browse + sent interests
        ├── app-owner.js        # owner listings + received interests
        └── app-chat-admin.js   # WebSocket chat UI + admin dashboard
```

## 2. Setup guide

### Prerequisites
- Node.js 18+ (uses native `fetch`)
- A PostgreSQL database (local install, Docker, or a free-tier hosted instance e.g.
  Supabase, Neon, Railway Postgres)

### Steps

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET, and optionally ANTHROPIC_API_KEY + SMTP_*

npm install
npx prisma migrate dev --name init   # creates tables
npm run seed                         # creates a default admin (see console output for credentials)
npm run dev                          # starts on http://localhost:4000
```

Open `http://localhost:4000` in the browser — the frontend is served from the same
origin, so no separate frontend server or CORS setup is needed for local dev.

### Local dev without Postgres installed (SQLite)

If you don't want to install Postgres locally, swap the datasource in
`backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

and change the `photos String[] @default([])` field on `Listing` to `photos String
@default("[]")` (SQLite has no native array type — store photo URLs as a JSON string
and `JSON.parse`/`JSON.stringify` them in `listing.routes.js`). Then run
`npx prisma migrate dev` as above. This is for local testing only — use Postgres in
production.

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret for signing auth tokens — set a long random value |
| `ANTHROPIC_API_KEY` | Optional. If unset, compatibility scoring always uses the rule-based fallback |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-4-6` |
| `HIGH_MATCH_THRESHOLD` | Score (0-100) above which the owner gets a "high match" email on interest (default 80) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | Any free-tier SMTP (Gmail App Password, Mailtrap, Brevo, Resend SMTP, Ethereal for testing). If `SMTP_HOST` is unset, emails are logged to the console instead of sent — useful for local dev without configuring SMTP. |

---

## 3. API documentation

All endpoints are prefixed with `/api`. Authenticated endpoints require
`Authorization: Bearer <token>`.

### Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | — | `{ name, email, password, role: TENANT\|OWNER }` → `{ token, user }` |
| POST | `/auth/login` | — | `{ email, password }` → `{ token, user }` |

### Tenant profile
| Method | Path | Role | Description |
|---|---|---|---|
| PUT | `/tenant-profile/me` | TENANT | Upsert `{ preferredLocation, budgetMin, budgetMax, moveInDate, bio? }` |
| GET | `/tenant-profile/me` | TENANT | Fetch own profile |

### Listings
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/listings` | OWNER | Create a listing `{ location, rent, availableFrom, roomType, furnishingStatus, photos?, description? }` |
| GET | `/listings/mine` | OWNER | Owner's own listings |
| PATCH | `/listings/:id/fill` | OWNER | Mark a listing filled (hides it from search) |
| GET | `/listings?location=&minRent=&maxRent=` | TENANT | Browse open listings, filtered, **ranked by cached AI compatibility score** (descending) |
| POST | `/listings/:id/rescore` | TENANT | Force-recompute the compatibility score for one listing |
| GET | `/listings/:id` | any | Listing detail |

### Interests
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/interests` | TENANT | `{ listingId }` — express interest; sends owner a high-match email if score ≥ threshold |
| GET | `/interests/sent` | TENANT | Interests the tenant has sent |
| GET | `/interests/received` | OWNER | Interests received on the owner's listings |
| PATCH | `/interests/:id` | OWNER | `{ status: ACCEPTED\|DECLINED }` — accepting creates the chat thread; either decision emails the tenant |

### Chats
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/chats` | any | List the user's chat threads |
| GET | `/chats/:id/messages` | any (participant) | Message history (initial load; live messages arrive over WebSocket) |

### Admin
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/admin/stats` | ADMIN | Platform activity counts |
| GET | `/admin/users` / `DELETE /admin/users/:id` | ADMIN | Manage users |
| GET | `/admin/listings` / `DELETE /admin/listings/:id` | ADMIN | Manage listings |

### WebSocket (Socket.IO)

Connect with `io({ auth: { token: <JWT> } })`.

| Event (client → server) | Payload | Server emits |
|---|---|---|
| `join_chat` | `{ chatId }` | `joined_chat` or `error_event` |
| `send_message` | `{ chatId, content }` | broadcasts `new_message` to the room (persisted to DB first) |
| `typing` | `{ chatId }` | broadcasts `typing` to the other participant |

---

## 4. Database schema (Prisma)

See `backend/prisma/schema.prisma` for the full source. Summary:

- **User** — `id, name, email, passwordHash, role(TENANT/OWNER/ADMIN)`
- **TenantProfile** — 1:1 with User; `preferredLocation, budgetMin, budgetMax, moveInDate, bio`
- **Listing** — belongs to an owner `User`; `location, rent, availableFrom, roomType, furnishingStatus, photos[], isFilled`
- **Match** — caches the AI/rule-based compatibility result per `(tenantId, listingId)` pair: `score, explanation, scoreSource`. Unique constraint prevents duplicate scoring and means scores are **computed once, then read from the DB** on subsequent requests.
- **Interest** — a tenant's interest in a listing; `status(PENDING/ACCEPTED/DECLINED)`; unique per `(tenantId, listingId)`
- **Chat** — created automatically when an `Interest` is accepted; 1:1 with `Interest`
- **Message** — belongs to a `Chat` and a sender `User`; persisted on every WebSocket `send_message`

---

## 5. LLM prompt and example I/O

Prompt template (built in `compatibilityService.js`):

```
Given this room listing: {listing JSON} and this tenant profile: {tenant JSON},
compute a compatibility score from 0 to 100 based on budget and location match.
Also briefly factor in move-in date alignment and room type/furnishing fit if
mentioned in the tenant bio. Return JSON only, no markdown, no preamble, in exactly
this shape: { "score": number, "explanation": string }. The explanation must be
1-2 sentences.
```

**Example input:**

```json
{
  "listing": { "location": "Koramangala, Bangalore", "rent": 18000, "roomType": "PRIVATE_ROOM",
    "furnishingStatus": "FURNISHED", "availableFrom": "2026-07-15", "description": "Sunny room near metro" },
  "tenant": { "preferredLocation": "Koramangala", "budgetMin": 15000, "budgetMax": 20000,
    "moveInDate": "2026-07-20", "bio": "Working professional, prefers furnished rooms" }
}
```

**Example LLM output:**

```json
{ "score": 92, "explanation": "Rent fits comfortably within budget and the location and move-in date are well aligned." }
```

**Fallback (rule-based) output** if the LLM is unavailable, weighted budget 60% +
location 30% + move-in proximity 10%:

```json
{ "score": 90, "explanation": "Rule-based estimate: rent fits comfortably within the tenant budget; location matches tenant preference; move-in dates align closely.", "scoreSource": "RULE_BASED" }
```

Scores are persisted in the `Match` table on first computation and read from there on
every later request — they are never recomputed unless the tenant calls
`POST /listings/:id/rescore`.

---

## 6. Deploying

### Single-service deploy (recommended — simplest)

Deploy `backend/` to Render/Railway as a Node web service. Since `app.js` serves
`frontend/` as static files, no separate frontend deploy is needed.

1. Push this repo to GitHub (branch `main`, public).
2. On Render/Railway: New Web Service → connect repo → root directory `backend`.
3. Build command: `npm install && npx prisma generate && npx prisma migrate deploy`
4. Start command: `npm start`
5. Add a managed Postgres instance and set `DATABASE_URL` plus the other env vars from
   `.env.example`.
6. After first deploy, run `npm run seed` once (via the platform's shell/console) to
   create the admin account.

### Deploying separately

If you'd rather host the frontend on Vercel/Netlify: deploy `backend/` as above, then
deploy `frontend/` as a static site, and edit `API_BASE` in `frontend/js/api.js` to the
backend's full URL. Set `CLIENT_ORIGIN` in the backend `.env` to the frontend's URL for
CORS, and update the Socket.IO `cors.origin` in `server.js` accordingly.

---

## 7. Notes on what's implemented vs. simplified

- Photo upload is a `photos: string[]` of URLs (no file upload server) — keeps the
  submission free of extra storage dependencies, per the "minimal dependencies"
  guideline.
- Email failures are caught and logged, never block the request (interest/accept flow
  succeeds even if SMTP is down).
- LLM failures, timeouts (10s), or malformed JSON responses all fall back to the
  rule-based scorer transparently — `scoreSource` on the `Match` record shows which
  path was used for any given pair.
