# Signal Clone: Project Spec (source of truth)

Scaler SDE Fullstack assignment: a functional clone of the Signal messaging app. UI/UX must closely match Signal (layout, bubbles, colors, spacing, modals, toasts). Encryption is mocked. Everything below is a locked decision unless marked **(default)**, which means "sensible choice not yet reviewed by the owner".

## Rules for Claude Code

- This file is the single source of truth. Do not redesign anything covered here.
- If something is not covered, pick the simplest option consistent with this spec, and list it under "Decisions I made" in your phase summary. Never silently deviate.
- Keep routers thin: HTTP only. All business logic lives in `services/`. All WebSocket push goes through `realtime/`.
- No new dependencies without naming them in the phase summary.
- Original work only. Do not copy from existing Signal-clone repos.
- UI references are in `/reference` (Signal Desktop screenshots). Match them: build, compare, adjust.
- Before declaring a phase done: run the backend tests and walk through that phase's checklist.
- Out of scope, do not build: attachments, disappearing messages, message-body search, message requests, real encryption, real SMS.
- Timestamps: UTC, ISO 8601 with `Z`.

## Stack and hosting

- Frontend: Next.js (App Router) + TypeScript + Tailwind. Radix/shadcn primitives only for behavior-heavy pieces (dialogs, dropdowns, tooltips). Zustand for state. Deployed on Vercel.
- Backend: Python, FastAPI, SQLAlchemy 2.0, SQLite (foreign keys ON, WAL ON). Deployed on Render free web service.
- Render free tier has an ephemeral disk and sleeps after 15 min idle. Therefore:
  - Tables are created with `create_all` on boot, then the seed runs on every boot (idempotent: skip if users exist).
  - `GET /health` exists for an external uptime pinger.
- Cross-origin deploy: CORS origin comes from env var; WebSocket uses `wss://`.
- Env: backend `SECRET_KEY`, `CORS_ORIGINS`, `DATABASE_URL`; frontend `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.

## Repo structure

```
frontend/
  src/app/login/page.tsx
  src/app/(app)/layout.tsx        # auth gate + WebSocket + store + sidebar live HERE
  src/app/(app)/page.tsx          # empty chat pane
  src/app/(app)/chat/[id]/page.tsx
  src/components/  src/store/  src/lib/  (api client, ws client, theme tokens)
backend/
  app/main.py config.py db.py seed.py
  app/models/  app/schemas/  app/routers/  app/services/
  app/realtime/ (manager.py = user_id -> sockets map, events.py)
  tests/
reference/   # Signal screenshots
CLAUDE.md  README.md
```

The WebSocket connection and Zustand store must live in the `(app)` layout, never in page components, so the socket survives chat switches.

## Auth (mocked)

- Identity is a phone number, normalized (country code kept, spaces/dashes stripped) and unique.
- `POST /auth/request-otp` always succeeds. Fixed OTP is `123456` **(default)**; show it as a hint/toast on the OTP screen.
- `POST /auth/verify {phone, otp}`: creates the user if new (`is_new: true`, empty display name), returns `{token, user, is_new}`.
- Onboarding (new users): set display name + avatar via `PUT /me`.
- Token: JWT (HS256), 7-day expiry **(default)**, stored in `localStorage`, sent as `Authorization: Bearer`.
- WebSocket auth: `wss://.../ws?token=<jwt>`. Invalid token or missing user closes with code **4401**.
- Client rule: any 401 from REST, a missing user on `/me`, or WS close 4401 clears the token and redirects to `/login`.
- Logout is client-side (delete token, close socket).

## Schema

IDs are autoincrement integers (message ids double as cursors).

```
users
  id PK, phone UNIQUE, display_name, avatar (preset key | small data URL | NULL),
  last_seen NULL, created_at

contacts
  id PK, owner_id FK users, contact_user_id FK users, nickname NULL, created_at
  UNIQUE(owner_id, contact_user_id), CHECK owner_id != contact_user_id

conversations
  id PK, type ('direct'|'group'), name NULL, avatar NULL,
  created_by FK users NULL, direct_key NULL UNIQUE ("minUserId:maxUserId"), created_at

conversation_members
  PK(conversation_id FK, user_id FK), role ('admin'|'member'), joined_at,
  last_delivered_message_id DEFAULT 0, last_read_message_id DEFAULT 0
  INDEX(user_id)

messages
  id PK, conversation_id FK, sender_id FK, type ('text'|'system'),
  body NULL, meta JSON NULL, reply_to_id FK messages NULL, client_id NULL, created_at
  UNIQUE(sender_id, client_id)
  INDEX(conversation_id, id)

message_reactions   # schema only for now; UI/endpoints are stretch
  PK(message_id FK, user_id FK), emoji, created_at
```

### Derived rules

- **Direct chats:** one per user pair, enforced by `direct_key`; `POST /conversations/direct` is get-or-create.
- **Unread count:** messages in the conversation with `id > my last_read_message_id`, excluding my own messages and system messages.
- **Message status for my messages** (computed client-side from members' cursors, never stored): take the minimum cursor among the OTHER members. At or past the message in read means `read`; in delivered means `delivered`; otherwise `sent`. `sending` is client-only optimistic state. For 1:1 this is simply the other person's cursors.
- **Cursor updates:** only move forward. Bumping read also bumps delivered to at least that value.
- **Conversation list order:** by the latest message id per conversation, computed via the `(conversation_id, id)` index (no denormalized `last_message_id`). Conversations with no messages sort by `created_at`.
- **New group member:** sees full history (note in README). Their cursors start at the current latest message id so history is not unread.
- **Leave / removal:** the member row is deleted.
- **System messages:** `type='system'`, empty `body`, structured `meta` like `{action, actor_id, target_id?, name?}`. Actions: `group_created`, `member_added`, `member_removed`, `member_left`, `renamed`, `role_changed`. The client renders per-viewer text ("You added Raj" / "Ana added you") as centered gray text.

## Groups and admin rules

- Creator starts as admin. Multiple admins via the `role` column.
- Admins can: rename, add members, remove members, promote/demote. Non-admins can only leave. **(default)** Any admin may remove any other member.
- Admins cannot remove themselves; they use `leave`.
- Cannot demote the last admin.
- If the last admin leaves and members remain, auto-promote the longest-standing member (earliest `joined_at`, tie by lowest user id). If nobody remains, delete the conversation.

## REST API

All routes except auth and health require the bearer token.

```
GET  /health
POST /auth/request-otp          {phone}
POST /auth/verify               {phone, otp} -> {token, user, is_new}
GET  /me        PUT /me         {display_name?, avatar?}

GET  /contacts
POST /contacts                  {phone, nickname?}   # 404 if phone not registered
GET  /search?q=                 # contacts + conversations (names), no message bodies

GET  /conversations             # recent-activity order
POST /conversations/direct      {user_id}            # get-or-create
POST /conversations/group       {name, member_ids}
PATCH /conversations/{id}       {name?}              # admin
POST /conversations/{id}/members            {user_ids}   # admin
DELETE /conversations/{id}/members/{uid}              # admin
PATCH /conversations/{id}/members/{uid}     {role}       # admin
POST /conversations/{id}/leave

GET  /conversations/{id}/messages?before_id=&limit=      # default 30, max 100, newest first
POST /conversations/{id}/messages   {client_id, body, reply_to_id?}
POST /conversations/{id}/read       {message_id}
```

- Sending is REST only. Same `(sender, client_id)` twice returns the existing message (idempotent retry). The response is the saved message; this is the `sent` state.
- After saving, the server pushes `message_new` to all members' sockets, including the sender's (multi-tab). The client dedupes by `client_id`/`id`.
- `POST .../read` clamps `message_id` to the conversation's latest id and only moves forward.
- Conversation object: `{id, type, name, avatar, created_at, unread_count, last_message, members:[{user_id, display_name, avatar, phone, nickname (the viewer's nickname for them or null), role, online, last_seen, last_delivered, last_read}]}`.
- Message object: `{id, conversation_id, sender_id, type, body, meta, reply_to: {id, sender_id, type, body} | null, client_id, created_at}`.
- Validation errors use FastAPI/Pydantic 422; permission errors 403; missing 404.

## WebSocket contract

Envelope for every message: `{ "type": string, "data": object }`.

**Server to client**
- `message_new`: full message object (covers system messages).
- `receipt_update`: `{conversation_id, user_id, delivered_up_to?, read_up_to?}`
- `typing`: `{conversation_id, user_id, is_typing}`
- `presence`: `{user_id, online, last_seen}` (sent to users who share a conversation with that user)
- `conversation_updated`: full conversation object (rename, members, roles, new group). Replace the entry in the store.
- `conversation_removed`: `{conversation_id}` (sent to a removed member)
- `pong`

**Client to server**
- `typing`: `{conversation_id, is_typing}`
- `ping`

**Server behavior**
- On connect: mark online; bump `last_delivered` to each conversation's latest id for this user and emit `receipt_update`s; broadcast `presence`.
- On `message_new` push to a connected non-sender member: bump their delivered cursor and emit `receipt_update`.
- On last socket close: wait a ~5s grace period **(default)**, then write `last_seen`, mark offline, broadcast `presence`.
- Typing is never persisted, only relayed to the other members.
- Initial online/last-seen state also arrives inside `GET /conversations` (no snapshot event).

**Client behavior**
- Typing: send `true` at most every ~3s while typing and `false` on stop. Receiver auto-clears after ~5s.
- Heartbeat: `ping` every ~25s.
- Reconnect with exponential backoff. On reconnect, refetch `/conversations` and the active chat's latest messages.

## Frontend architecture

- Layout: Signal-style two-pane. Left sidebar (profile header, search, conversation list, new chat / new group), right chat pane.
- Routes: `/login`, `/` (empty pane), `/chat/[id]`. Settings is a modal with placeholders (Privacy, Notifications, Appearance with theme toggle). "Coming soon" placeholders for calls, stories, linked devices.
- Zustand store holds conversations, messages by conversation id, presence, typing. REST loads the store; WebSocket events patch it.
- Optimistic send: generate `client_id` (uuid), show as `sending`, replace with the server message on response; on failure show a retry state.
- History: cursor pagination, load 30, load older on scroll to top (a "Load older messages" button is the acceptable fallback). Preserve scroll position when prepending.
- Theme: Signal colors/fonts/sizes as design tokens (CSS variables / Tailwind theme) from day one, light and dark, so dark mode is nearly free.
- Avatars: colored circle with initials (color derived from user id) by default; onboarding offers a few presets. Optional small image upload stored as a data URL in `users.avatar` (client-side resize, max ~200 KB). Upload is an upgrade, not a dependency.
- Group message check marks follow the derived rule above. A per-member "read by" info view is a stretch item.

## Seed data

Idempotent (skip if users exist); relative timestamps (e.g. "2 hours ago") so the app looks fresh on every boot.
- 5-6 users with realistic phone numbers. Document 2-3 test logins in the README and on the login screen so an evaluator can open two browsers as different users.
- Several DMs and 1-2 groups with 10-20 realistic messages each, mixing read / delivered / unread states, one quoted reply, one system message, one group where the primary test user is admin.
- One long conversation (~100+ messages) to exercise pagination.
- Pre-seeded contacts for the test users. Some users online (seed `last_seen` values).

## Testing

pytest, in-memory SQLite, covering `services/`:
- cursor math: unread counts, group min-of-cursors status, forward-only updates
- duplicate `client_id` returns the same message
- direct get-or-create returns the same conversation both ways
- admin permissions, last-admin demote blocked, auto-promote on last admin leaving
- `before_id` pagination
Real-time is verified manually: two browser windows as different users (send, typing, read receipts, group changes, refresh mid-chat). Re-run the manual checklist against the live deployed URLs, not just localhost.

## Build phases (vertical slices; each ends deployed and demoable)

0. Skeleton: monorepo, FastAPI `/health` + CORS + WebSocket echo, Next.js shell, deploy both (Render + Vercel), verify `wss://` works live.
1. Auth and onboarding: OTP flow, JWT, display name and avatar, session persistence, logout.
2. App shell: theme tokens, Signal layout, seeded conversation list, search, contacts, new contact.
3. Direct messaging: REST send, `message_new` push, optimistic send, pagination, delivered/sent states.
4. Receipts, typing, presence, unread badges, last-seen.
5. Groups: create, members view, admin controls, system messages, `conversation_updated`/`removed`.
6. Polish and bonuses: dark mode, reply-to, keyboard shortcuts, toasts, settings placeholders. Stretch: reactions, responsive layout, "read by" view.
7. README and final live checklist.

Cut line if time runs short: drop from the end (stretch, then bonuses, then group polish). Never leave the core (phases 0-4) half-working.

## README must include

Setup instructions, tech stack, architecture overview (layered backend, one-socket-per-user model, single-process limitation of the in-memory connection map), database schema with the rationale for cursors and the unified conversation model, API and WebSocket overview, test logins, assumptions (new members see history, mocked OTP, ephemeral DB on free hosting), and a note that Alembic would be the production next step.
