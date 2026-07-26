# Runbook — Adopting the hardened local MongoDB

Closes [H-7](../audit/02-security.md#h-7--mongodb-exposed-without-authentication-in-local-development)
on a developer machine **without losing local data**.

---

## Why this needs a procedure

[docker-compose.yml](../../docker-compose.yml) now pins `mongo:8.0`, binds to
`127.0.0.1`, and requires root credentials. But **`MONGO_INITDB_ROOT_USERNAME`
and `MONGO_INITDB_ROOT_PASSWORD` only provision users on an empty data
directory.** An existing volume ignores them entirely, so the container comes up
with auth still effectively off.

Making them take effect requires `docker compose down -v`, and `-v` **deletes the
volume** — including whatever is in your local `dwcode` database.

> Verified on this machine 2026-07-26: the running local Mongo accepts
> **unauthenticated** connections and holds a `dwcode` database with 10
> collections (`problems`, `submissions`, `userprofiles`, `comments`, `contests`,
> `usercoins`, `userroles`, `bookmarks`, `githubintegrations`,
> `playgroundsnippets`). Running `down -v` without dumping first destroys all of it.

---

## Procedure

Takes about two minutes. Run from the repo root.

### 1. Dump the existing data

```bash
mkdir -p .local-backups
docker exec dwcode_mongodb mongodump \
  --db dwcode \
  --archive=/tmp/dwcode-predump.archive --gzip

docker cp dwcode_mongodb:/tmp/dwcode-predump.archive \
  .local-backups/dwcode-$(date +%Y%m%d-%H%M%S).archive
```

Confirm the file is non-trivial in size before continuing:

```bash
ls -lh .local-backups/
```

> If the current container was started without auth (the default before this
> change), `mongodump` needs no credentials. If you have already recreated it,
> add `-u dwcode -p dwcode-local-dev --authenticationDatabase admin`.

### 2. Recreate the container with auth

```bash
docker compose down -v     # -v removes the volume; you dumped in step 1
docker compose up -d
docker compose ps          # wait for healthy
```

### 3. Restore

```bash
ARCHIVE=$(ls -t .local-backups/*.archive | head -1)
docker cp "$ARCHIVE" dwcode_mongodb:/tmp/restore.archive

docker exec dwcode_mongodb mongorestore \
  -u dwcode -p dwcode-local-dev --authenticationDatabase admin \
  --archive=/tmp/restore.archive --gzip
```

### 4. Point the app at it (optional)

**Only if you want local development to stop touching production data.** Both
`client/.env.local` and `server/.env` currently point at Atlas.

```
MONGODB_URI=mongodb://dwcode:dwcode-local-dev@127.0.0.1:27017/dwcode?authSource=admin
```

Trade-off: your dev data then diverges from production and needs seeding. Leaving
both on Atlas is simpler but means local development reads and writes live
records — including anything destructive you try.

### 5. Verify

```bash
# Should now be REFUSED (auth required)
docker exec dwcode_mongodb mongosh --quiet --eval 'db.adminCommand("ping")'

# Should succeed
docker exec dwcode_mongodb mongosh --quiet \
  -u dwcode -p dwcode-local-dev --authenticationDatabase admin \
  --eval 'db.getSiblingDB("dwcode").getCollectionNames()'

# Should NOT be reachable from another machine on your network
# (run from a second device, replacing the IP)
#   mongosh mongodb://<your-lan-ip>:27017 --eval 'db.adminCommand("ping")'
```

The last check is the one that proves H-7 is actually closed. Before this change,
that command succeeded from any device on the same network.

---

## Credentials

The defaults in `docker-compose.yml` (`dwcode` / `dwcode-local-dev`) are
**development-only**, deliberately committed, and must never be reused anywhere
else. Override per machine:

```bash
MONGO_USERNAME=... MONGO_PASSWORD=... docker compose up -d
```

---

## If you would rather not do any of this

Acceptable alternative: leave the local Mongo alone and keep developing against
Atlas. The hardened compose file then sits unused until someone adopts it.

Be explicit that this leaves **an unauthenticated MongoDB listening on your
machine**. On a trusted home network the exposure is limited; on shared office or
café Wi-Fi, any device on the same subnet can read and write that database. At
minimum, stop the container when not using it:

```bash
docker compose stop
```
