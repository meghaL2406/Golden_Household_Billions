from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # No implicit localhost default: an unset value must fail loudly (see app.core.database) rather
    # than silently trying 127.0.0.1 on a server that has no database.
    DATABASE_URL: str = ""
    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MINUTES: int = 720
    DEV_MODE: bool = True
    DEMO_OTP: str = "123456"
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@familyid.gov.in"
    CORS_ORIGINS: str = "http://localhost:5173"

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        """Managed Postgres providers (Render, Heroku, ...) hand out a bare `postgres://` or
        `postgresql://` URL. SQLAlchemy needs the psycopg 3 driver spelled out, so rewrite the scheme
        rather than requiring every deployment target to know that detail."""
        if v.startswith("postgres://"):
            return "postgresql+psycopg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @property
    def cloudinary_enabled(self) -> bool:
        return bool(self.CLOUDINARY_CLOUD_NAME and self.CLOUDINARY_API_KEY and self.CLOUDINARY_API_SECRET)

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)


settings = Settings()
