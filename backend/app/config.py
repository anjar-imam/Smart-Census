from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite:///./smart_census.db"
    jwt_secret: str = "replace-this-with-a-long-random-secret"
    jwt_expire_minutes: int = 720
    sms_provider: str = "console"
    otp_expire_minutes: int = 5
    otp_max_attempts: int = 5
    frontend_origins: str = "http://localhost:5173"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
