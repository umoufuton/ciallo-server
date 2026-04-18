# Phoenix Server

Phoenix Server is the backend entry point for your virtual airline platform. The current deployment baseline includes:

- PostgreSQL in Docker
- Next.js API in Docker
- Nginx reverse proxy in Docker

## Local development

Run the app locally:

```bash
pnpm dev
```

Health check:

```bash
curl http://localhost:3000/api/health
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

## Notes

- PostgreSQL is only exposed inside the Docker network and is not published to the public internet.
- Nginx publishes port `80` and proxies requests to the Next.js container.
- The Next.js app is built with `output: "standalone"` to keep the runtime image small.
- HTTPS is not enabled yet in this baseline. Add a domain plus SSL in the next step.
