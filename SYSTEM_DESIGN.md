# System Design Write-up

## Compatibility scoring design

Each tenant has one `TenantProfile` (preferred location, budget range, move-in date,
optional bio). Each open `Listing` belongs to an owner. Rather than scoring every
tenant against every listing eagerly, scoring is **lazy and cached**: the first time a
tenant browses listings (`GET /listings`), the server checks the `Match` table for an
existing `(tenantId, listingId)` row. If absent, it calls the compatibility service,
then writes the result to `Match` before returning it. Every subsequent browse, or the
interest-creation flow, reads the cached row instead of re-calling the LLM. This keeps
LLM cost and latency proportional to the number of *distinct* tenant-listing pairs ever
viewed, not the number of page loads, and satisfies the requirement that scores be
"stored in DB, not recomputed on every request." A `POST /listings/:id/rescore`
endpoint exists for the rare case a tenant wants a fresh score after editing their
profile, using `upsert` to overwrite the cached row.

The score itself blends two signals that the requirements call out explicitly: budget
fit and location fit, with move-in date and (when available) bio-stated room
preferences as secondary inputs. I deliberately kept the prompt narrow and asked for
strict JSON output (`{ score, explanation }`) rather than free text, both to keep
the response parseable and to keep the explanation short enough to render directly in
the listing card UI.

## LLM integration and fallback

`compatibilityService.js` is a single module with three exports: `callLLM` (calls the
Anthropic Messages API directly via `fetch`, with a 10-second `AbortController`
timeout), `ruleBasedScore` (a deterministic scorer), and `computeCompatibility`, the
public entry point that tries the LLM first and falls back to the rule-based scorer on
*any* failure — missing API key, network error, non-200 response, timeout, or a
response that doesn't parse into `{ score: number, explanation: string }`. Because the
fallback path never throws, `computeCompatibility` always resolves, so a flaky LLM
provider can never break the browse or interest-creation flows — it only ever degrades
the explanation quality, not availability. The fallback intentionally uses the *same*
weighting the LLM was instructed to prioritize (budget and location), so a tenant
shouldn't see wildly different rankings depending on which path served a particular
pair; a `scoreSource` field on `Match` records which one did, for transparency and
debugging. I didn't build a queue/retry system for the LLM call, since a single timeout
plus immediate fallback gives a bounded worst-case latency (~10s) and a guaranteed
response, which matters more for a synchronous browse-listings endpoint than squeezing
out marginal extra LLM coverage.

## Real-time chat implementation

Chat threads are gated behind accepted interest: a `Chat` row is created exactly once,
when an owner sets an `Interest` to `ACCEPTED` (1:1 relation, enforced via a unique
foreign key on `Chat.interestId`). This means there's no chat-creation race or orphaned
threads — the REST `PATCH /interests/:id` handler is the single place a `Chat` is born.
Socket.IO handles the live transport: clients connect with a JWT in the `auth` payload
which is verified once in an `io.use` middleware (`chatSocket.js`), so every socket on
the server is already authenticated before any event handler runs. `join_chat`
re-validates that the connecting user is actually a participant of that specific chat
(tenant or owner on the row) before adding them to the Socket.IO room — this stops a
user from joining someone else's chat just by guessing/sniffing a chat ID. `send_message`
persists the message to Postgres *first*, then broadcasts the saved row (including
`sender.name`) to the room — this ordering means a message is never broadcast unless
it's durably stored, so a page refresh via the REST `GET /chats/:id/messages` endpoint
always shows everything that was seen live. A lightweight `typing` event is broadcast
without persistence, since it's ephemeral UI state.

## Notification flow

Two email triggers map directly to the two "key events" called out in the brief:
expressing interest, and the owner's accept/decline decision. Both are fired
synchronously inside their respective route handlers, but `emailService.js` wraps every
`nodemailer.sendMail` call in a try/catch that logs and returns rather than throwing —
so an SMTP outage degrades to "no email sent" rather than failing the underlying
interest/accept request. The high-match email only fires when the *cached* compatibility
score (read via the same `getOrComputeMatch` helper used by browse) is at or above
`HIGH_MATCH_THRESHOLD` (env-configurable, default 80), reusing the cache rather than
re-scoring at interest time. If `SMTP_HOST` isn't configured at all, the service logs
the would-be email to the console instead — handy for local development without setting
up a mail provider, while keeping the same code path used in production.
