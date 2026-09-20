from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from .config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def postgis_available() -> bool:
    with engine.connect() as conn:
        row = conn.execute(text("select 1 from pg_extension where extname='postgis'")).first()
        return row is not None


# A fixed, arbitrary key for a session-level advisory lock (see run_startup_migrations). Any int64
# works; this one has no other meaning.
_STARTUP_LOCK_KEY = 727270001


def init_extensions() -> None:
    """Create the required extensions. PostGIS gets its own transaction: on a plain Postgres image
    (no PostGIS installed, e.g. the stock postgres:16-alpine image used in local Docker/CI) its
    CREATE EXTENSION fails and aborts the current transaction — if uuid-ossp and pg_trgm shared that
    transaction, their creation would be silently rolled back too, only to surface later as a
    confusing "operator class ... does not exist" error when a table using them is created."""
    with engine.begin() as conn:
        conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    except Exception:
        # PostGIS is optional; the address table keeps plain latitude/longitude columns.
        pass


def run_startup_migrations() -> None:
    """Create extensions and tables, serialized across concurrent processes with a Postgres advisory
    lock. Running more than one uvicorn worker (see backend/docker-entrypoint.sh) means each worker
    runs this startup step independently; without the lock, two workers creating the same tables at
    the same time can race and one fails with "relation already exists" or a similar DDL conflict."""
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _STARTUP_LOCK_KEY})
    try:
        init_extensions()
        Base.metadata.create_all(bind=engine)
    finally:
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _STARTUP_LOCK_KEY})
