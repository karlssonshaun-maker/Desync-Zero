CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE universal_inventory (
    sku                 VARCHAR(100)        PRIMARY KEY,
    product_name        VARCHAR(255)        NOT NULL,
    total_qty           INTEGER             NOT NULL DEFAULT 0,
    safety_buffer       INTEGER             NOT NULL DEFAULT 0,
    available_qty       INTEGER             GENERATED ALWAYS AS (
                            GREATEST(total_qty - safety_buffer, 0)
                        ) STORED,
    last_updated        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    version             INTEGER             NOT NULL DEFAULT 0,

    CONSTRAINT total_qty_non_negative CHECK (total_qty >= 0),
    CONSTRAINT safety_buffer_non_negative CHECK (safety_buffer >= 0)
);

CREATE TABLE channel_mapping (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    universal_sku       VARCHAR(100)        NOT NULL REFERENCES universal_inventory(sku) ON DELETE CASCADE,
    channel             VARCHAR(50)         NOT NULL,
    channel_sku_id      VARCHAR(255)        NOT NULL,
    channel_product_id  VARCHAR(255),
    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT channel_mapping_unique UNIQUE (universal_sku, channel),
    CONSTRAINT channel_valid CHECK (channel IN ('takealot', 'amazon', 'shopify'))
);

CREATE TABLE sync_logs (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    universal_sku       VARCHAR(100)        NOT NULL,
    channel             VARCHAR(50)         NOT NULL,
    trigger_source      VARCHAR(50)         NOT NULL,
    qty_before          INTEGER             NOT NULL,
    qty_after           INTEGER             NOT NULL,
    qty_pushed          INTEGER             NOT NULL,
    status              VARCHAR(20)         NOT NULL DEFAULT 'pending',
    http_status_code    INTEGER,
    error_message       TEXT,
    retry_count         INTEGER             NOT NULL DEFAULT 0,
    latency_ms          INTEGER,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,

    CONSTRAINT status_valid CHECK (status IN ('pending', 'success', 'failed', 'retrying', 'dead_letter'))
);

CREATE TABLE api_keys (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash            VARCHAR(64)         NOT NULL UNIQUE,
    name                VARCHAR(100)        NOT NULL,
    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ
);

CREATE INDEX idx_channel_mapping_sku ON channel_mapping(universal_sku);
CREATE INDEX idx_channel_mapping_channel ON channel_mapping(channel);
CREATE INDEX idx_sync_logs_sku ON sync_logs(universal_sku);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX idx_universal_inventory_last_updated ON universal_inventory(last_updated DESC);
