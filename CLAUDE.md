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
  - `GET /health` is monitored every 5 minutes by an external uptime pinger (UptimeRobot).
- Cross-origin deploy: CORS origin comes from env var; WebSocket uses `wss://`.
- Env: backend `SECRET_KEY`, `CORS_ORIGINS`, `DATABASE_URL`, optional `PRESENCE_GRACE_SECONDS` (default 5); frontend `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.

## Repo structure

```
frontend/
  src/app/login/page.tsx
  src/app/(app)/layout.tsx        # auth gate + WebSocket + store + sidebar live HERE
  src/app/(app)/page.tsx          # empty chat pane
  src/app/(app)/chat/[id]/page.tsx
  src/app/status/page.tsx         # dev connectivity check (REST health + WS echo); not linked in the UI
  src/app/globals.css             # design tokens (light/dark)
  src/components/ (chat/ = message list, bubbles, composer)  src/store/ (app.ts, toasts.ts)
  src/lib/  (api client, ws client, theme, shortcuts, receipts, ...)
backend/
  app/main.py config.py db.py deps.py seed.py
  app/models/  app/schemas/  app/routers/  app/services/
  app/realtime/ (manager.py = user_id -> sockets map, events.py = all pushes, presence.py)
  tests/
reference/   # Signal screenshots
CLAUDE.md  README.md
```

The WebSocket connection and Zustand store must live in the `(app)` layout, never in page components, so the socket survives chat switches.

## Auth (mocked)

- Identity is a phone number, normalized and unique: spaces, dashes, parentheses and dots are stripped; a leading `+` country code is required; the result is `+<digits>` with 8-15 digits. `+91` numbers must have exactly 10 national digits and must not start with 0. Anything else is a 422.
- `POST /auth/request-otp` always succeeds for a valid phone (malformed phone: 422). Fixed OTP is `123456` **(default)**; show it as a hint/toast on the OTP screen.
- `POST /auth/verify {phone, otp}`: creates the user if new (`is_new: true`, empty display name), returns `{token, user, is_new}`.
- Onboarding (new users): set display name (trimmed, 1-50) + avatar via `PUT /me`. `avatar` is `preset:<key>` (fixed list of 8, shared with the frontend) or null; data-URL uploads are not accepted yet.
- Token: JWT (HS256), 7-day expiry **(default)**, stored in `localStorage`, sent as `Authorization: Bearer`.
- WebSocket auth: `wss://.../ws?token=<jwt>`. Invalid token or missing user closes with code **4401**.
- Client rule: any 401 from REST, a missing user on `/me`, or WS close 4401 clears the token and redirects to `/login`.
- Logout is client-side (delete token, close socket).

## Schema

IDs are autoincrement integers (message ids double as cursors). SQLite `AUTOINCREMENT` is on for users, contacts, conversations and messages, so ids are never reused after deletes. `ondelete`: CASCADE for contacts, members, a conversation's messages and reactions; SET NULL for `created_by` and `reply_to_id`; a user who has sent messages can't be deleted.

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

message_reactions   # phase 8: one reaction per user per message (the PK enforces it)
  PK(message_id FK, user_id FK), emoji, created_at
  emoji is one of ❤️ 👍 👎 😂 😮 😢 (ALLOWED_REACTIONS in services/reactions.py, REACTIONS in lib/reactions.ts)
```

### Derived rules

- **Direct chats:** one per user pair, enforced by `direct_key`; `POST /conversations/direct` is get-or-create.
- **Unread count:** messages in the conversation with `id > my last_read_message_id`, excluding my own messages and system messages.
- **Message status for my messages** (computed client-side from members' cursors, never stored): take the minimum cursor among the OTHER members. At or past the message in read means `read`; in delivered means `delivered`; otherwise `sent`. `sending` is client-only optimistic state. For 1:1 this is simply the other person's cursors.
- **Cursor updates:** only move forward. Bumping read also bumps delivered to at least that value.
- **Conversation list order:** latest message per conversation via the `(conversation_id, id)` index (no denormalized `last_message_id`), sorted by that message's time (ties by id), which equals latest-id order because ids are assigned in time order. Conversations with no messages sort by their `created_at` in the same list.
- **Empty direct chats:** a direct conversation with no messages is listed only for its creator (`created_by`); the other person sees it once the first message arrives.
- **New group member:** sees full history (note in README). Their cursors start at the current latest message id so history is not unread.
- **Leave / removal:** the member row is deleted.
- **Reactions:** text messages only (system -> 400). PUT with a different emoji replaces mine, the same emoji is a no-op, DELETE removes (no-op if none). No side effects on unread counts, cursors, previews or ordering. A member who leaves keeps their reactions. Lists are ordered by when people (last) reacted.
- **System messages:** `type='system'`, `body` NULL, `sender_id` = the actor, structured `meta` `{action, actor_id, actor_name, target_id?, target_name?, name?, role?}`. `actor_name`/`target_name` are display-name snapshots at the time of the change (so the text still reads right after someone leaves); `name` is the group name (`group_created`, `renamed`); `role` is set on `role_changed`. Actions: `group_created`, `member_added`, `member_removed`, `member_left`, `renamed`, `role_changed`. An automatic promotion is a `role_changed` with `actor_id == target_id` ("Rahul is now an admin."). The client renders per-viewer text ("You added Raj" / "Ana added you") as centered gray text, looking names up as: current member (viewer's nickname) -> snapshot -> "Someone".

## Groups and admin rules

- Creator starts as admin. Multiple admins via the `role` column.
- Admins can: rename, add members, remove members, promote/demote. Non-admins can only leave. **(default)** Any admin may remove any other member.
- Admins cannot remove themselves; they use `leave`.
- Cannot demote the last admin.
- If the last admin leaves and members remain, auto-promote the longest-standing member (earliest `joined_at`, tie by lowest user id). If nobody remains, delete the conversation.
- Errors: group endpoints on a direct chat -> 400; missing conversation -> 404; not a member or not an admin -> 403; removing yourself -> 400 ("Use Leave group to leave"); target user not in the group -> 404; demoting the last admin -> 400.
- No-ops write nothing and push nothing: renaming to the same name, setting the role a member already has, adding only existing members.
- Group names are trimmed, 1-50 chars. `member_ids`/`user_ids` must be distinct (422); including yourself when creating, or unknown users, -> 400.

## REST API

All routes except auth and health require the bearer token.

```
GET  /health
POST /auth/request-otp          {phone}
POST /auth/verify               {phone, otp} -> {token, user, is_new}
GET  /me        PUT /me         {display_name?, avatar?}

GET  /contacts
POST /contacts                  {phone, nickname?}   # 201; 404 not registered, 400 own number, 409 already a contact
GET  /search?q=                 # {contacts, conversations}: names/nicknames/phone digits, max 20 each, no message bodies

GET  /conversations             # recent-activity order
POST /conversations/direct      {user_id}            # get-or-create
POST /conversations/group       {name, member_ids}
PATCH /conversations/{id}       {name?}              # admin
POST /conversations/{id}/members            {user_ids}   # admin
DELETE /conversations/{id}/members/{uid}              # admin
PATCH /conversations/{id}/members/{uid}     {role}       # admin
POST /conversations/{id}/leave                           # 204

GET  /conversations/{id}/messages?before_id=&limit=      # default 30, max 100, newest first
POST /conversations/{id}/messages   {client_id, body, reply_to_id?}
POST /conversations/{id}/read       {message_id} -> {conversation_id, last_read, last_delivered}

PUT    /messages/{id}/reaction      {emoji} -> [{user_id, emoji}]   # 404 missing, 403 not a member, 400 system, 422 emoji
DELETE /messages/{id}/reaction              -> [{user_id, emoji}]
```

- Group mutations (`POST /conversations/group`, `PATCH /conversations/{id}`, the members endpoints) return the conversation object as the caller sees it.

- Sending is REST only. Same `(sender, client_id)` twice returns the existing message (idempotent retry). The response is the saved message; this is the `sent` state.
- After saving, the server pushes `message_new` to all members' sockets, including the sender's (multi-tab). The client dedupes by `client_id`/`id`.
- `POST .../read` clamps `message_id` to the conversation's latest id and only moves forward.
- Conversation object: `{id, type, name, avatar, created_at, unread_count, last_message, members:[{user_id, display_name, avatar, phone, nickname (the viewer's nickname for them or null), role, online, last_seen, last_delivered, last_read}]}`.
- Message object: `{id, conversation_id, sender_id, type, body, meta, reply_to: {id, sender_id, type, body} | null, client_id, created_at, reactions: [{user_id, emoji}]}` (reactions loaded for a whole page in one query).
- Validation errors use FastAPI/Pydantic 422; permission errors 403; missing 404; duplicate contact 409. Business-rule errors carry a plain-English `detail` that the UI shows as-is.

## WebSocket contract

Envelope for every message: `{ "type": string, "data": object }`.

**Server to client**
- `message_new`: full message object (covers system messages).
- `receipt_update`: `{conversation_id, user_id, delivered_up_to?, read_up_to?}`
- `typing`: `{conversation_id, user_id, is_typing}`
- `presence`: `{user_id, online, last_seen}` (sent to users who share a conversation with that user)
- `conversation_updated`: full conversation object (rename, members, roles, new group). Replace the entry in the store.
- `conversation_removed`: `{conversation_id}` (sent to a removed member, to a member who left, including the last one out)
- `reaction_update`: `{conversation_id, message_id, reactions: [{user_id, emoji}]}`, the message's FULL current list (a snapshot), to all members including the actor's other tabs; no-ops push nothing.
- `pong`
- `error` (`{detail}` for a malformed envelope; the socket stays open) and `echo` (unknown client types are echoed back; kept for the `/status` page)

**Client to server**
- `typing`: `{conversation_id, is_typing}`
- `ping`

**Server behavior**
- Invalid token: the server accepts, then closes with 4401 (closing during the handshake would reach the browser as 1006).
- On connect: if an offline announcement is pending (reconnect within the grace period) cancel it and announce nothing; otherwise, on the user's first socket, broadcast `presence` online. Then bump `last_delivered` to each conversation's latest id for this user and emit `receipt_update`s.
- On a new text message: bump the delivered cursor of non-sender members whose socket is open, then push `message_new` and those `receipt_update`s to all members. Group system messages are pushed as `message_new` but don't bump delivered.
- Group changes push, in order: `conversation_updated` (built per recipient, so nicknames and unread counts are theirs) to current members, then each system message as `message_new`, then `conversation_removed` to whoever lost access.
- On last socket close: wait `PRESENCE_GRACE_SECONDS` (5s), then if still offline write `last_seen` and broadcast `presence` offline. Multiple tabs: offline only after the last socket closes.
- Typing is never persisted, only relayed to the other members (not to the typist's own other tabs); non-members' typing is ignored.
- REST handlers schedule pushes with FastAPI `BackgroundTasks` (they run on the event loop after the response is sent); the `/ws` route awaits them directly.
- Initial online/last-seen state also arrives inside `GET /conversations` (no snapshot event).

**Client behavior**
- Typing: send `true` at most every ~3s while typing and `false` on stop (empty input, 1.5s idle, send, blur, leaving the chat). Receiver auto-clears after ~5s, on that user's next message, and on reconnect.
- Heartbeat: `ping` every ~25s.
- Reconnect with exponential backoff (0.5s doubling, cap 15s, +-20% jitter, 10s connect timeout). On every (re)connect, including the first, refetch `/conversations` and the active chat's latest messages.
- Read: while a chat is open in a visible tab, `POST /read` with the latest id (debounced 300ms), optimistically zeroing the badge.

## Frontend architecture

- Layout: Signal-style two-pane. Left sidebar (profile header, search, conversation list, new chat / new group), right chat pane.
- Routes: `/login`, `/` (empty pane), `/chat/[id]`. Below 768px one pane at a time (list on `/`, chat on `/chat/[id]` with a back arrow).
- Settings is a modal (full-screen on mobile) with Profile (name, preset avatar, phone), Privacy and Notifications (placeholders), Appearance (System / Light / Dark, stored in `localStorage` key `signal.theme`, applied by an inline head script before paint), Keyboard shortcuts and About. "Coming soon" toasts for voice/video calls (DM header), Stories and Linked devices (profile menu).
- Toasts: own small store (`store/toasts.ts`), 4s auto-dismiss, max 3, top-center below the header.
- Keyboard shortcuts (`lib/shortcuts.ts`): Alt+N new chat, Alt+G new group, Alt+, settings, Ctrl/Cmd+K or `/` search, Alt+Up/Down previous/next chat, Esc (dialog/menu, else touch action row, else reply, else search). Alt shortcuts ignore AltGr (Ctrl+Alt).
- Reply-to: Reply/Copy actions on text messages, reply bar in the composer, click a quote to jump to the original.
- Message actions (React / Reply / Copy): with a mouse they appear beside the bubble on hover/focus (unchanged). On a coarse pointer (`lib/useCoarsePointer.ts`, `matchMedia("(pointer: coarse)")`) tapping a saved text bubble reveals a row BENEATH it (below reaction chips); one open at a time (`openActionsId` in the store); closes on tapping the bubble again, tapping elsewhere, chat switch, send, Esc, Reply, Copy or picking a reaction. When closed the row stays in the DOM visually hidden (`sr-only`, `focus-within:not-sr-only`) for keyboard / screen-reader users. One-time toast "Tap a message to reply or react" (localStorage `signal.hint.tapMessage`, `lib/hints.ts`).
- Login page: original two-bubble brand mark (not Signal's logo), "Signal Clone" + tagline, "Try a demo account" buttons (Priya / Rahul / Ananya from `DEMO_ACCOUNTS`, must match `seed.py`; tap fills the number, no auto-submit), "Fill code" on the OTP hint, and a footer note that sign-in and encryption are simulated.
- Zustand store holds conversations, messages by conversation id, presence, typing. REST loads the store; WebSocket events patch it.
- Optimistic send: generate `client_id` (uuid), show as `sending`, replace with the server message on response; on failure show a retry state.
- History: cursor pagination, load 30, load older on scroll to top (a "Load older messages" button is the acceptable fallback). Preserve scroll position when prepending.
- Theme: Signal colors/fonts/sizes as design tokens (CSS variables / Tailwind theme) from day one, light and dark, so dark mode is nearly free.
- Avatars: colored circle with initials (color derived from user id) by default; onboarding and Settings offer 8 presets. Image upload (data URL in `users.avatar`) is not built.
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
Also covered: REST validation and real WebSocket round-trips (pushes, receipts, typing, presence, group events). The live-socket tests use a throwaway file SQLite DB (the in-memory engine shares one connection, which concurrent sessions can't safely share).
Real-time is also verified manually: two browser windows as different users (send, typing, read receipts, group changes, refresh mid-chat). Re-run the manual checklist against the live deployed URLs, not just localhost.

## Build phases (vertical slices; each ends deployed and demoable)

Status: phases 0-8 **done** (phase 7 tagged `submission-ready`); phase 9 (touch actions + login polish) **done**, pending your review.

0. **[done]** Skeleton: monorepo, FastAPI `/health` + CORS + WebSocket echo, Next.js shell, deploy both (Render + Vercel), verify `wss://` works live.
1. **[done]** Auth and onboarding: OTP flow, JWT, display name and avatar, session persistence, logout.
2. **[done]** App shell: theme tokens, Signal layout, seeded conversation list, search, contacts, new contact.
3. **[done]** Direct messaging: REST send, `message_new` push, optimistic send, pagination, delivered/sent states.
4. **[done]** Receipts, typing, presence, unread badges, last-seen.
5. **[done]** Groups: create, members view, admin controls, system messages, `conversation_updated`/`removed`.
6. **[done]** Polish and bonuses: dark mode, reply-to, keyboard shortcuts, toasts, settings placeholders. Stretch: responsive layout done (built in phase 3); reactions done in phase 8; "read by" not built.
7. **[done]** README and final live checklist.
8. **[done]** Reactions (bonus): PUT/DELETE `/messages/{id}/reaction`, `reaction_update` snapshot event, picker + chips in the UI.
9. **[done]** Mobile message actions (tap-to-reveal row on touch screens) and login page polish (brand header, demo accounts, fill code). Frontend only.

Cut line if time runs short: drop from the end (stretch, then bonuses, then group polish). Never leave the core (phases 0-4) half-working.

## README must include

Setup instructions, tech stack, architecture overview (layered backend, one-socket-per-user model, single-process limitation of the in-memory connection map), database schema with the rationale for cursors and the unified conversation model, API and WebSocket overview, test logins, assumptions (new members see history, mocked OTP, ephemeral DB on free hosting), and a note that Alembic would be the production next step.
