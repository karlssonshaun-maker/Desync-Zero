from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Desync-Zero"
    app_version: str = "2.0.0"
    debug: bool = False

    # Set to the PgBouncer URL in production, direct Postgres URL in dev.
    # When use_pgbouncer=true, SQLAlchemy uses NullPool (PgBouncer owns pooling).
    database_url: str
    use_pgbouncer: bool = False

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440

    credential_encryption_key: str

    takealot_api_base_url: str = "https://seller-api.takealot.com/v2"
    takealot_rate_limit_per_minute: int = 60

    amazon_rate_limit_per_minute: int = 30

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_starter: str = ""
    stripe_price_pro: str = ""
    stripe_price_enterprise: str = ""

    sync_max_retries: int = 5
    sync_base_backoff_seconds: float = 1.0
    sync_max_backoff_seconds: float = 60.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
