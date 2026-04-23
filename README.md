# Phoenix Server

Phoenix Server is the backend entry point for your virtual airline platform. The current deployment baseline includes:

- PostgreSQL in Docker
- Next.js API in Docker
- Nginx reverse proxy in Docker
- Airport schema, importer, and read-only API
- Fleet and aircraft schema, importer, and read-only API
- Scheduled route schema, importer, and read-only API
- Rank schema, importer, and read-only API
- Pilot auth schema and login API
- PIREP schema and API (upload logs + personal stats)

## Local development

Run the app locally:

```bash
pnpm dev
```

Health check:

```bash
curl http://localhost:3000/api/health
```

Airport API examples:

```bash
curl http://localhost:3000/api/airports
curl "http://localhost:3000/api/airports?q=KISH&limit=10"
curl http://localhost:3000/api/airports/OIBK
curl http://localhost:3000/api/fleets
curl http://localhost:3000/api/aircraft
curl http://localhost:3000/api/routes
curl http://localhost:3000/api/ranks
curl http://localhost:3000/api/auth/me
```

## ECS deployment

All deployment files live in this directory:

- [Dockerfile](/F:/CialloACARS/server/Dockerfile)
- [docker-compose.yml](/F:/CialloACARS/server/docker-compose.yml)
- [nginx/default.conf](/F:/CialloACARS/server/nginx/default.conf)
- [.env.example](/F:/CialloACARS/server/.env.example)

Suggested server path:

```bash
/opt/phoenix/server
```

Deployment steps:

```bash
cp .env.example .env
docker compose build
docker compose up -d
docker compose ps
```

Health check after startup:

```bash
curl http://47.98.212.205/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "phoenix-api"
}
```

## Airport database flow

Run migrations inside the API container:

```bash
docker compose exec api node scripts/run-migrations.mjs
```

Upload your airport CSV to the server, for example:

```bash
/opt/phoenix/server/data/airport_example.csv
```

Then import it:

```bash
docker compose exec api node scripts/import-airports.mjs /data/airport_example.csv
```

Test the airport endpoints:

```bash
curl http://47.98.212.205/api/airports
curl http://47.98.212.205/api/airports/OIBK
```

Fleet import:

```bash
docker compose exec api node scripts/import-fleets.mjs /data/fleet_example.csv
```

Aircraft import:

```bash
docker compose exec api node scripts/import-aircraft.mjs /data/aircraft_example.csv
```

Fleet endpoint examples:

```bash
curl http://47.98.212.205/api/fleets
curl "http://47.98.212.205/api/fleets?q=B77W"
curl http://47.98.212.205/api/fleets/8886
curl http://47.98.212.205/api/fleets/B77W
```

Aircraft endpoint examples:

```bash
curl http://47.98.212.205/api/aircraft
curl "http://47.98.212.205/api/aircraft?q=B-8490"
curl "http://47.98.212.205/api/aircraft?sourceFleetId=8855"
curl http://47.98.212.205/api/aircraft/B-8490
```

Route import:

```bash
docker compose exec api node scripts/import-routes.mjs /data/route_example.csv
```

Route endpoint examples:

```bash
curl http://47.98.212.205/api/routes
curl "http://47.98.212.205/api/routes?departure=ESSA&arrival=RJTT"
curl "http://47.98.212.205/api/routes?flightNumber=NH222"
curl "http://47.98.212.205/api/routes?sourceFleetId=2441"
curl http://47.98.212.205/api/routes/1740765
```

Rank import from JSON:

```bash
docker compose exec api node scripts/import-ranks-json.mjs /data/ranks_raw.json
```

Rank endpoint examples:

```bash
curl http://47.98.212.205/api/ranks
curl "http://47.98.212.205/api/ranks?airlineId=265"
curl "http://47.98.212.205/api/ranks?honoraryRank=true"
curl "http://47.98.212.205/api/ranks?q=CPT"
curl http://47.98.212.205/api/ranks/2697
```

Pilot import from JSON:

```bash
docker compose exec api node scripts/import-pilots-json.mjs /data/pilot_example.json
```

Auth endpoints:

```bash
POST /api/auth/precheck
POST /api/auth/external-verify
POST /api/auth/set-password
POST /api/auth/login
GET  /api/auth/me
```

PIREP endpoints:

```bash
POST /api/pireps
GET  /api/pireps
GET  /api/pireps/{identifier}
GET  /api/pireps/stats
GET  /api/pireps/migration-status
```

Dispatch endpoints:

```bash
GET    /api/dispatch/current
POST   /api/dispatch/current
DELETE /api/dispatch/current
```

Dispatch behavior:

```text
POST /api/dispatch/current
- upsert current dispatch as ACTIVE
- update pilots.current_airport_icao = departure_icao in same transaction

POST /api/pireps
- write PIREP
- clear matching active dispatch as CLEARED
- update pilots.current_airport_icao = arrival_icao
- all in one transaction
```

Upload a PIREP example (requires `Authorization: Bearer <token>`):

```bash
curl -X POST https://api.virtualcca.org/api/pireps \
  -H "Authorization: Bearer <your_auth_token>" \
  -H "Content-Type: application/json" \
  -d @/opt/phoenix/server/data/pirep.json
```

Get latest PIREPs for current pilot:

```bash
curl "https://api.virtualcca.org/api/pireps?limit=20" \
  -H "Authorization: Bearer <your_auth_token>"
```

Get personal stats (all time):

```bash
curl https://api.virtualcca.org/api/pireps/stats \
  -H "Authorization: Bearer <your_auth_token>"
```

Get personal stats for last 30 days:

```bash
curl "https://api.virtualcca.org/api/pireps/stats?days=30" \
  -H "Authorization: Bearer <your_auth_token>"
```

Historical PIREP backfill (from OPS API):

```text
- Triggered automatically after successful login / first password setup
- Runs asynchronously in the background (non-blocking for client)
- Imports PIREPs by source_pilot_id from OPS /pireps and /pireps/{id}
- Upserts into local `pireps` by source_pirep_id (idempotent)
```

Check migration status:

```bash
curl https://api.virtualcca.org/api/pireps/migration-status \
  -H "Authorization: Bearer <your_auth_token>"
```

Auth environment variables:

```env
AUTH_TOKEN_SECRET=replace-with-a-strong-random-secret
AUTH_TOKEN_TTL_SECONDS=604800
EXTERNAL_PLATFORM_PILOT_URL=https://example.com/api/pilots?username={username}
EXTERNAL_PLATFORM_USERINFO_URL=https://example.com/api/v3/pilot/user
EXTERNAL_PLATFORM_VERIFY_URL=https://example.com/api/auth/verify
EXTERNAL_PLATFORM_API_KEY=replace-with-external-api-key
```

Recommended login flow:

```text
1) POST /api/auth/precheck
2) if hasPassword=false -> POST /api/auth/external-verify
3) POST /api/auth/set-password (with bootstrapToken) once
4) POST /api/auth/login
5) GET /api/auth/me
```

`POST /api/auth/external-verify` request body (preferred):

```json
{
  "username": "CCA1800",
  "externalAccessToken": "oauth_access_token_from_external_platform"
}
```

Legacy compatibility (still supported):

```json
{
  "username": "CCA1800",
  "externalToken": "legacy_external_token"
}
```

## Notes

- PostgreSQL is only exposed inside the Docker network and is not published to the public internet.
- Nginx publishes port `80` and proxies requests to the Next.js container.
- The Next.js app is built with `output: "standalone"` to keep the runtime image small.
- HTTPS is not enabled yet in this baseline. Add a domain plus SSL in the next step.
