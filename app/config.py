from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"
    PORTKEY_API_KEY: str = ""
    PORTKEY_PROVIDER: str = "gemini"
    USE_PORTKEY: bool = False
    DATABASE_URL: str = "sqlite:///chatbot.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
