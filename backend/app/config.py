from functools import cached_property

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-me"
    # Comma-separated list of allowed browser origins.
    cors_origins_raw: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")
    database_url: str = "sqlite:///./signal.db"

    @cached_property
    def cors_origins(self) -> list[str]:
        # A trailing slash never matches the browser's Origin header, so strip it.
        return [o.strip().rstrip("/") for o in self.cors_origins_raw.split(",") if o.strip()]


settings = Settings()
