# Deploy To ECS

This guide deploys the current baseline stack to your Ubuntu 22.04 ECS server at `47.98.212.205`.

## 1. Prepare directories

```bash
sudo mkdir -p /opt/phoenix
sudo chown -R $USER:$USER /opt/phoenix
cd /opt/phoenix
```

## 2. Upload project files

Upload the whole `server` directory from this repository to:

```bash
/opt/phoenix/server
```

## 3. Create environment file

```bash
cd /opt/phoenix/server
cp .env.example .env
nano .env
```

Recommended first-pass values:

```env
APP_ENV=production
TZ=Asia/Shanghai
POSTGRES_DB=phoenix
POSTGRES_USER=phoenix
POSTGRES_PASSWORD=replace-with-a-strong-password
API_BASE_URL=http://47.98.212.205
CLIENT_APP_KEY=replace-with-a-random-client-key
```

## 4. Start containers

```bash
docker compose build
docker compose up -d
docker compose ps
```

## 5. Verify health

```bash
curl http://127.0.0.1/api/health
curl http://47.98.212.205/api/health
```

Expected JSON:

```json
{
  "ok": true,
  "service": "phoenix-api"
}
```

## 6. Inspect logs if needed

```bash
docker compose logs -f api
docker compose logs -f nginx
docker compose logs -f postgres
```

## 7. Open firewall / security group

Allow:

- TCP `80`

Keep closed to the public internet:

- TCP `5432`

## 8. Useful operations

Restart:

```bash
docker compose restart
```

Rebuild after code changes:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```
