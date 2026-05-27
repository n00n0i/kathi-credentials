import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Neo4j
    neo4j_uri: str = "bolt://localhost:7688"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "experience123"

    # Encryption
    encryption_key: str = ""

    # Auth
    admin_token: str = ""
    jwt_secret: str = "dev-jwt-secret-change-me"
    session_expiry_days: int = 7  # browser sessions expire after N days

    # API
    api_port: int = 8124
    api_host: str = "0.0.0.0"
    api_base_url: str = "http://localhost:8124"  # override for agent setup links

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Logging
    log_level: str = "INFO"

    class Config:
        env_prefix = ""
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()