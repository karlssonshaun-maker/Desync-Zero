CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255)        NOT NULL,
    email               VARCHAR(255)        NOT NULL UNIQUE,
    stripe_customer_id  VARCHAR(100),
    plan                VARCHAR(50)         NOT NULL DEFAULT 'free',
    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email               VARCHAR(255)        NOT NULL UNIQUE,
    hashed_password     VARCHAR(255)        NOT NULL,
    full_name           VARCHAR(255),
    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN             NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    stripe_subscription_id      VARCHAR(100) UNIQUE,
    stripe_price_id             VARCHAR(100),
    plan                        VARCHAR(50) NOT NULL DEFAULT 'free',
    status                      VARCHAR(50) NOT NULL DEFAULT 'active',
    current_period_start        TIMESTAMPTZ,
    current_period_end          TIMESTAMPTZ,
    cancel_at_period_end        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_credentials (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel             VARCHAR(50)         NOT NULL,
    credential_key      VARCHAR(100)        NOT NULL,
    encrypted_value     TEXT                NOT NULL,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT tenant_credentials_unique UNIQUE (tenant_id, channel, credential_key)
);

CREATE TABLE usage_events (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type          VARCHAR(50)         NOT NULL,
    quantity            INTEGER             NOT NULL DEFAULT 1,
    period_start        DATE                NOT NULL DEFAULT CURRENT_DATE,
    recorded_at         TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

ALTER TABLE universal_inventory     ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE channel_mapping         ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sync_logs               ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE api_keys                ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE universal_inventory     DROP CONSTRAINT universal_inventory_pkey;
ALTER TABLE universal_inventory     ADD PRIMARY KEY (tenant_id, sku);

ALTER TABLE channel_mapping         DROP CONSTRAINT channel_mapping_unique;
ALTER TABLE channel_mapping         ADD CONSTRAINT channel_mapping_unique UNIQUE (tenant_id, universal_sku, channel);

ALTER TABLE universal_inventory     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE channel_mapping         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sync_logs               ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_keys                ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_tenant_credentials_tenant ON tenant_credentials(tenant_id, channel);
CREATE INDEX idx_usage_events_tenant_period ON usage_events(tenant_id, period_start DESC);
CREATE INDEX idx_universal_inventory_tenant ON universal_inventory(tenant_id);
CREATE INDEX idx_channel_mapping_tenant ON channel_mapping(tenant_id);
CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
