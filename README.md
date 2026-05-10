# Desync-Zero

**E-commerce Stock Orchestration Engine — South African Market**

Desync-Zero is a production-ready inventory synchronization middleware that prevents out-of-stock fines by maintaining a consistent "source of truth" across multiple sales channels (Shopify, Takealot, Amazon SA). It reacts to Shopify orders in real time, atomically deducts stock, and pushes the updated quantity to all active marketplace channels concurrently.

---

## Architecture Overview

```
┌──────────────┐   Webhook (Order Created)   ┌──────────────────────────┐
│   Shopify    │ ─────────────────────────▶  │   FastAPI  /webhook/     │
│  In-Store    │                             │   shopify/order-created  │
└──────────────┘                             └────────────┬─────────────┘
                                                          │
                                             ┌────────────▼─────────────┐
                                             │   InventoryOrchestrator  │
                                             │  • Atomic DB deduction   │
                                             │  • Safety buffer calc    │
                                             │  • Concurrent pushers    │
                                             └──────┬────────────┬──────┘
                                                    │            │
                                       ┌────────────▼──┐  ┌─────▼──────────┐
                                       │  PostgreSQL   │  │     Redis      │
                                       │ ─ universal_  │  │ ─ Token Bucket │
                                       │   inventory   │  │ ─ Retry Queue  │
                                       │ ─ channel_    │  │ ─ Dead Letter  │
                                       │   mapping     │  │   Queue        │
                                       │ ─ sync_logs   │  └────────────────┘
                                       └───────────────┘
                                                    │
                          ┌─────────────────────────▼───────────────────────────┐
                          │                Marketplace Pushers                  │
                          │  TakealotPusher  ──  Token Bucket + Exp. Backoff    │
                          │  AmazonPusher    ──  Token Bucket + Exp. Backoff    │
                          └─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
desync-zero/
├── main.py                          # FastAPI app entry point, lifespan hooks
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
├── migrations/
│   └── 001_initial_schema.sql       # Full PostgreSQL DDL
└── app/
    ├── api/
    │   ├── health.py                # GET /health
    │   ├── webhooks.py              # POST /webhook/shopify/order-created
    │   └── inventory.py             # CRUD + force-sync endpoints
    ├── core/
    │   ├── config.py                # Pydantic settings (reads .env)
    │   └── security.py              # API key hashing + Shopify HMAC verification
    ├── db/
    │   ├── session.py               # Async SQLAlchemy engine + session factory
    │   └── redis_client.py          # Async Redis connection pool
    ├── models/
    │   └── schemas.py               # Pydantic request/response models
    └── services/
        ├── inventory_service.py     # Atomic SQL operations on universal_inventory
        ├── sync_log_service.py      # Audit trail writes to sync_logs
        ├── orchestrator.py          # Coordinates deduction + concurrent pushes
        ├── marketplace_pusher.py    # Takealot + Amazon HTTP clients with retry
        ├── rate_limiter.py          # Redis Token Bucket (Lua atomic script)
        └── retry_worker.py          # Background worker polls Redis retry queue
```

---

## Database Schema

### `universal_inventory`
The single source of truth for all stock levels.

| Column          | Type         | Notes                                              |
|-----------------|--------------|----------------------------------------------------|
| `sku`           | VARCHAR PK   | Universal product identifier (always uppercase)    |
| `product_name`  | VARCHAR      |                                                    |
| `total_qty`     | INTEGER      | Raw stock count                                    |
| `safety_buffer` | INTEGER      | Units held back to avoid OOS fines                 |
| `available_qty` | INTEGER      | **Generated column**: `MAX(total_qty - safety_buffer, 0)` — this is what gets pushed to marketplaces |
| `last_updated`  | TIMESTAMPTZ  |                                                    |
| `version`       | INTEGER      | Optimistic concurrency counter                     |

### `channel_mapping`
Maps one universal SKU to platform-specific IDs.

| Column              | Type       | Notes                                 |
|---------------------|------------|---------------------------------------|
| `universal_sku`     | FK → sku   |                                       |
| `channel`           | ENUM       | `takealot` \| `amazon` \| `shopify`   |
| `channel_sku_id`    | VARCHAR    | e.g., Takealot TSIN or Amazon ASIN    |
| `channel_product_id`| VARCHAR    | Optional parent product ID            |
| `is_active`         | BOOLEAN    | Soft-disable without deleting         |

### `sync_logs`
Immutable audit trail for every push attempt.

| Column           | Type       | Notes                                              |
|------------------|------------|----------------------------------------------------|
| `status`         | ENUM       | `pending → success / failed → retrying → dead_letter` |
| `qty_before`     | INTEGER    | Stock before this event                            |
| `qty_after`      | INTEGER    | Stock after deduction                              |
| `qty_pushed`     | INTEGER    | Available quantity pushed to marketplace           |
| `latency_ms`     | INTEGER    | Round-trip time to marketplace API                 |
| `retry_count`    | INTEGER    | How many times this push was retried               |

---

## Core Mechanics

### Atomic Stock Deduction
Stock is deducted using a single `UPDATE ... RETURNING` statement with a `WHERE total_qty >= :qty` guard. This means:
- Two simultaneous orders for the same SKU cannot both succeed if only one unit exists — the second `UPDATE` matches zero rows and raises a `ValueError` with a clear message.
- No `SELECT` + `UPDATE` race condition is possible.

### Safety Buffer
`available_qty` is a PostgreSQL **generated column**: `GREATEST(total_qty - safety_buffer, 0)`. If a SKU has `total_qty = 5` and `safety_buffer = 3`, the marketplaces see `2`. If total drops to `2`, marketplaces see `0` — preventing over-selling before the buffer is consumed.

### Token Bucket Rate Limiter
Implemented in a single Lua script executed atomically inside Redis. Takealot and Amazon each have their own bucket. The script refills tokens proportionally to elapsed wall-clock time, so it handles bursts gracefully without a separate scheduler.

### Exponential Backoff + Self-Healing Queue
On a failed marketplace push:
1. The task is serialized as JSON and scored into a Redis sorted set (`desync:retry_queue`) with `score = now + backoff_seconds`.
2. The backoff doubles with each retry: `1s → 2s → 4s → 8s → 16s → 60s` (capped).
3. A background `retry_worker_loop` runs every 5 seconds, fetching all items with `score <= now` and replaying them.
4. After `SYNC_MAX_RETRIES` exhausted failures, the item is moved to `desync:dead_letter` (a Redis list) and an error is logged — ready for alerting via your ops tooling.

---

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env with your actual API keys and passwords
```

### 2. Start all services

```bash
docker compose up --build
```

PostgreSQL auto-runs the migration on first start via `docker-entrypoint-initdb.d`.

### 3. Provision an API key

Connect to PostgreSQL and insert a hashed key:

```sql
-- Generate a SHA-256 hash of your chosen key string
INSERT INTO api_keys (key_hash, name)
VALUES (encode(sha256('your-secret-key-here'), 'hex'), 'primary-ops-key');
```

### 4. Register a SKU

```bash
curl -X POST http://localhost:8000/inventory/ \
  -H "X-API-Key: your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{"sku": "PROD-001", "product_name": "Widget Pro", "total_qty": 100, "safety_buffer": 5}'
```

### 5. Map SKU to marketplaces

```bash
curl -X POST http://localhost:8000/inventory/mappings/ \
  -H "X-API-Key: your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{"universal_sku": "PROD-001", "channel": "takealot", "channel_sku_id": "TSIN-12345678"}'
```

### 6. Simulate a Shopify order webhook

```bash
curl -X POST http://localhost:8000/webhook/shopify/order-created \
  -H "Content-Type: application/json" \
  -d '{
    "id": 9001,
    "order_number": "SA-1001",
    "financial_status": "paid",
    "fulfillment_status": null,
    "created_at": "2026-04-05T10:00:00Z",
    "line_items": [{"sku": "PROD-001", "quantity": 2, "title": "Widget Pro"}]
  }'
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | DB + Redis connectivity check |
| `GET` | `/inventory/{sku}` | API Key | Fetch current stock for a SKU |
| `POST` | `/inventory/` | API Key | Create or upsert a SKU |
| `PATCH` | `/inventory/{sku}` | API Key | Set new total_qty + trigger marketplace sync |
| `POST` | `/inventory/{sku}/sync` | API Key | Force push current stock to all channels |
| `POST` | `/inventory/mappings/` | API Key | Register a channel mapping for a SKU |
| `POST` | `/webhook/shopify/order-created` | HMAC Sig | Receive Shopify order webhook |

All authenticated endpoints require the header `X-API-Key: <your-key>`.

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | asyncpg connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `TAKEALOT_API_KEY` | — | Takealot Seller API key |
| `TAKEALOT_RATE_LIMIT_PER_MINUTE` | `60` | Tokens per minute for Takealot bucket |
| `AMAZON_RATE_LIMIT_PER_MINUTE` | `30` | Tokens per minute for Amazon bucket |
| `SHOPIFY_WEBHOOK_SECRET` | — | HMAC secret from Shopify webhook config |
| `SYNC_MAX_RETRIES` | `5` | Attempts before dead-letter |
| `SYNC_BASE_BACKOFF_SECONDS` | `1.0` | Initial backoff duration |
| `SYNC_MAX_BACKOFF_SECONDS` | `60.0` | Backoff ceiling |

---

## Production Considerations

- **Multiple workers**: Uvicorn is configured with 2 workers. The retry worker is a coroutine task inside each worker process — for distributed deployments, move `retry_worker_loop` to a dedicated Celery worker or separate container to avoid duplicate processing.
- **Dead letter alerting**: Consume `desync:dead_letter` from Redis and pipe to PagerDuty/Slack. The list persists across restarts.
- **Database connection pooling**: Pool size is `10` with `max_overflow=20`. Tune to your VPS RAM and PostgreSQL `max_connections`.
- **Shopify HMAC verification**: Set `SHOPIFY_WEBHOOK_SECRET` in production. Without it, the signature check is skipped (suitable only for local testing).
- **Amazon SP-API**: The current implementation uses a simplified SP-API call. For production, integrate the `python-amazon-sp-api` library for full LWA token refresh and request signing.
