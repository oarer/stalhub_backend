# Telegram userbot

The userbot uses an MTProto Telegram user account (GramJS), independently of the Bot API bot in `src/bot.ts`.

## Environment

Required:

- `TG_API_ID` — Telegram application ID from <https://my.telegram.org>.
- `TG_API_HASH` — Telegram application hash.
- `DISCORD_BOT_SERVICE_JWT` — the existing backend internal secret. Requests use `x-bot-secret: $DISCORD_BOT_SERVICE_JWT`.
- At least one source channel:
  - `USERBOT_EXBO_CHANNEL` — EXBO channel username or ID.
  - `USERBOT_STALZONE_CHANNEL` — comma-separated Stalzone report channel usernames/IDs.
  - `USERBOT_OFFICIAL_MEDIA_CHANNEL` — official media channel username or ID.

Optional:

- `USERBOT_SOURCES` — JSON mapping or semicolon-separated mapping such as `EXBO_TG=@exbo;STALZONE_REPORT=@stalzone_report_1,@stalzone_report_2`.
- `BACKEND_URL` — defaults to `http://localhost:3001`; `/api/v1` is added when absent.
- `TG_USERBOT_SESSION_STRING` — saved StringSession for headless operation. `TG_USERBOT_SESSION` is accepted as an alias.
- `TG_USERBOT_PHONE` — phone number used by the interactive first login.
- `TG_USERBOT_REQUEST_TIMEOUT_MS` — request/download timeout, default `15000`.
- `TG_USERBOT_MAX_ATTEMPTS` — retry count, default `3`.
- `TG_MEDIA_UPLOAD_URL` — optional multipart media-upload URL. The current backend tree does not expose a generic internal media-upload route, so media is downloaded but omitted from `image_urls` unless this is supplied by the backend deployment.

## Bootstrap a session

Run this from an interactive terminal:

```sh
cd telegram-bot
TG_API_ID=123 TG_API_HASH=... TG_USERBOT_PHONE=+70000000000 bun run src/userbot-login.ts
```

Enter the Telegram code and 2FA password when prompted. Store the printed `TG_USERBOT_SESSION_STRING` as a secret. Do not commit it.

Without a session string, `src/userbot.ts` can also perform an interactive login when run from a TTY. In a headless environment it exits with instructions to use the helper first.

## Run

```sh
cd telegram-bot
bun run userbot
```

The existing Bot API bot remains available through `bun run start` (or `bun run dev`).

## Posting behavior

New messages are mapped to `EXBO_TG`, `STALZONE_REPORT`, or `OFFICIAL_MEDIA` based on the configured channel. The userbot sends `POST /api/v1/internal/feed-posts` with an external key like `tg:<channel>:<message_id>`, plain text with basic Telegram formatting converted to Markdown-lite, the channel title/handle, and uploaded media URLs when a media upload URL is configured. Video posts receive a note that the attached image is a thumbnail. Feed-post delivery retries with exponential backoff; HTTP 409 is treated as an already-delivered message.

The backend inspection found that `src/app/api/attachments/` is only a weapon-attachment lookup route. The existing `/arts/upload` route requires normal user authentication and is not a suitable internal userbot upload endpoint, so the userbot does not pretend it can call that route with `x-bot-secret`.
