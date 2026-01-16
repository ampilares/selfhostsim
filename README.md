# SelfhostSim — self-hosted Android SMS gateway for GoHighLevel (GHL)

SelfhostSim is an open-source SMS gateway that lets you send/receive SMS in GoHighLevel using your **own Android phone(s)** (real SIM cards) while self-hosting the backend infrastructure.

**Tech stack:** Android (Java) • Node.js (NestJS + Express) • MongoDB • Redis • Firebase Cloud Messaging (FCM)
**Official Installation Guide:** https://selfhostsim.com/docs

## What you get

- **Outbound SMS from GHL → your phone** (GHL conversations send, SelfhostSim delivers via your Android device)
- **Inbound SMS from your phone → GHL** (replies show up in GHL conversations)
- **Multi-device support** (scale throughput by using multiple phones/SIMs)
- **REST API + Swagger UI** (manage users, devices, messages, API keys)
- **Optional queueing with Redis** (Bull queue)

## High-level architecture

SelfhostSim is split into three parts:

- **`android/`**: Android gateway app (sends/receives carrier SMS; talks to the API; receives push jobs via FCM).
- **`api/`**: NestJS API (auth, device management, message routing, outbound push via FCM, inbound processing).
- **`ghl/`**: GHL bridge service (OAuth installer + webhook handler + internal endpoint for posting inbound messages to GHL).

Typical message flows:

**Outbound (GHL → phone → carrier)**

1. GHL triggers an outbound message webhook to `ghl/`
2. `ghl/` forwards the event to `api/` (internal-authenticated)
3. `api/` sends an FCM push job to the Android device
4. Android device sends the SMS via the carrier network

**Inbound (carrier → phone → GHL)**

1. Android receives an SMS and POSTs it to `api/` (API-key authenticated)
2. `api/` calls `ghl/` internal inbound endpoint to add it to the GHL conversation

## Quick start (Docker Compose)

### Prerequisites

- Docker + Docker Compose
- A Firebase project (for FCM) and a **service account JSON** for the backend (`api/`)
- A GoHighLevel (GHL) OAuth app (client id/secret) and webhook signing key
- A public domain + HTTPS (recommended for production; needed for GHL webhooks/OAuth in most setups)

### 1) Create env files

Copy the examples and fill in values:

```bash
cp api/.env.example api/.env
cp ghl/.env.example ghl/.env
cp .env.example .env
```

#### Important: internal secrets must match

There are two “internal” secrets used for service-to-service calls:

- **GHL → API forwarding secret**
  - `api/.env`: set `INTERNAL_SECRET=...`
  - `ghl/.env`: set `SELFHOSTSIM_INTERNAL_SECRET=...` to the **same value**
- **API → GHL inbound secret**
  - `api/.env`: set `GHL_INTERNAL_SECRET=...`
  - `ghl/.env`: set `GHL_INTERNAL_SECRET=...` to the **same value**

Header names are configurable (`INTERNAL_API_KEY_HEADER_NAME`, `GHL_INTERNAL_HEADER_NAME`), but default to `x-internal-secret`.

### 2) Start services

```bash
docker compose up -d --build
```

Useful URLs (defaults):

- API Swagger UI: `http://localhost:3001/`
- API base path: `http://localhost:3001/api/v1`
- GHL bridge home: `http://localhost:3002/`
- Mongo Express: `http://localhost:8081/`

### 3) Confirm the API bootstrapped an admin user

On first start (when the user collection is empty), the API creates a default admin user using:

- `DEFAULT_ADMIN_USERNAME` (default: `admin`)
- `DEFAULT_ADMIN_PASSWORD` (default: `selfhostsim`)

Change these defaults before deploying to production.

## Configuration reference

### API (`api/.env`)

Common settings:

- `PORT`: API port (default `3001`)
- `MONGO_URI`: Mongo connection string (Docker Compose uses `selfhostsim-db`)
- `JWT_SECRET`: change to a long random value
- `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_PASSWORD`: first-boot admin user
- `DEFAULT_PHONE_COUNTRY_CODE`: used to normalize numbers without country prefix

Firebase (FCM) service account fields (required):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY_ID`
- `FIREBASE_PRIVATE_KEY` (make sure newlines are preserved; `api/` replaces `\\n` with newlines)
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_CLIENT_ID`
- `FIREBASE_CLIENT_C509_CERT_URL`

Redis / queueing:

- `REDIS_URL`: required for Bull queue config (Docker Compose includes Redis)
- `USE_SMS_QUEUE`: enables queue-based outbound dispatching

GHL inbound sync (API → `ghl/`):

- `GHL_SERVICE_BASE_URL`: base URL for the `ghl/` service (Docker: `http://selfhostsim-ghl:3002`)
- `GHL_INTERNAL_SECRET`, `GHL_INTERNAL_HEADER_NAME`: must match `ghl/.env` for `/api/ghl/v1/internal/*`

### GHL bridge (`ghl/.env`)

GHL OAuth + webhook verification:

- `CLIENT_ID`, `CLIENT_SECRET`: from your GHL OAuth app
- `WEBHOOK_PUBLIC_KEY`: used to verify `x-wh-signature` on incoming webhooks

Mongo session storage:

- `MONGO_URL`, `MONGO_DB_NAME`, `COLLECTION_NAME`: stores OAuth tokens/sessions
  - Docker Compose defaults: `ghl_sessions` DB, `sessions` collection

Public URLs / reverse proxy:

- `GHL_PUBLIC_BASE_URL`: public base URL used to generate OAuth redirect URIs (recommended in production)
- `TRUST_PROXY=1`: set when running behind a reverse proxy

API forwarding (webhook → API internal route):

- `SELFHOSTSIM_API_BASE_URL`: API base URL (example: `http://localhost:3001/api/v1`)
- `SELFHOSTSIM_INTERNAL_SECRET`: must match `api/.env` `INTERNAL_SECRET`

Inbound posting to GHL (API → internal route):

- `GHL_INTERNAL_SECRET`: must match `api/.env` `GHL_INTERNAL_SECRET`
- `GHL_CONVERSATION_PROVIDER_ID`: your conversation provider id from GHL

## GoHighLevel setup (what to point where)

SelfhostSim exposes these key endpoints on the `ghl/` service:

- **OAuth install**: `GET /install`
  - Redirects to GHL authorization and stores the token in MongoDB.
  - Redirect URI used: `GET /oauth-callback` (must be allowed/registered in your GHL app settings).
- **Outbound webhook receiver**: `POST /api/ghl/v1/webhook/messages`
  - Verifies `x-wh-signature` (using `WEBHOOK_PUBLIC_KEY`) and forwards to the API.
- **Internal inbound endpoint** (used by `api/`): `POST /api/ghl/v1/internal/inbound-sms`
  - Protected by the internal secret header.

After your services are reachable via HTTPS:

1. Configure GHL to send the relevant webhook(s) to `https://<your-ghl-service-host>/api/ghl/v1/webhook/messages`.
2. Visit `https://<your-ghl-service-host>/install` and complete OAuth for each location you want to enable.

## Android app setup (`android/`)

### Prerequisites

- Android Studio (recommended) or a working Gradle/JDK setup
- A Firebase project with `google-services.json` for the Android app

### Configure

1. Place your `google-services.json` into the Android app module (standard Firebase Android setup).
2. Update the API base URL in `android/app/build.gradle` (`BuildConfig.API_BASE_URL`) to your API’s base URL:
   - Local example: `http://10.0.2.2:3001/api/v1/` (Android emulator)
   - Device-on-LAN example: `http://<your-server-lan-ip>:3001/api/v1/`
   - Production example: `https://api.example.com/api/v1/`
3. Build and install:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

### Connect the phone to your API

The Android app uses an **API key** (`x-api-key`) to authenticate to the backend.

1. Generate an API key in the API (Swagger UI → `POST /api/v1/auth/api-keys`).
2. In the Android app:
   - Paste the API key
   - Enable the gateway
   - (Optional) enable inbound SMS forwarding and status updates
   - Grant SMS permissions and disable aggressive battery optimizations for reliability

## Local development (without Docker)

### API

```bash
cd api
cp .env.example .env
pnpm install
pnpm start:dev
```

API docs are served at `http://localhost:3001/` and endpoints are under `http://localhost:3001/api/v1`.

### GHL bridge

```bash
cd ghl
cp .env.example .env
npm ci
node index.js
```

## Production notes

- Put both services behind HTTPS (Caddy/Nginx/Traefik) and set `TRUST_PROXY=1` for `ghl/` when needed.
- Do not expose MongoDB/Redis to the public internet.
- Rotate secrets: `JWT_SECRET`, `INTERNAL_SECRET`, `GHL_INTERNAL_SECRET`, and all OAuth credentials.

Example Caddy (host-based routing recommended):

```caddyfile
api.example.com {
  reverse_proxy localhost:3001
}

ghl.example.com {
  reverse_proxy localhost:3002
}
```

## Contributing

1. Fork the project.
2. Create a feature/bugfix branch from `main`.
3. Keep commits focused with clear messages.
4. Open a PR against `main`.

## Bug reports & security

- Bugs/feature requests: open an issue at `https://github.com/ampilares/selfhostsim/issues/new`.
- Security issues: email `contact@selfhostsim.com` instead of filing a public issue.

## Support

Email `contact@selfhostsim.com`, or join the community:

- Facebook group: https://www.facebook.com/groups/selfhostsim
- Subreddit: https://reddit.com/r/selfhostsim/
