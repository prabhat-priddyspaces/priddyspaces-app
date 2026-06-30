import os
import re
import sys
from pathlib import Path

# Ensure project root is on sys.path for tests.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg2://priddyspaces:priddyspaces@localhost:5433/priddyspaces_test"
)

TEST_DATABASE_URL = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or DEFAULT_TEST_DATABASE_URL
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault(
    "JWT_SECRET",
    "test-internal-jwt-secret-with-at-least-sixty-four-bytes-of-entropy",
)

from app.db.deps import get_db
from app.core.auth import get_current_user, get_optional_user
from app.main import app
from app.models.base import Base
from app import models  # noqa: F401


def _validate_test_database_url(url: str) -> None:
    parsed = make_url(url)
    if parsed.drivername.split("+", 1)[0] != "postgresql":
        raise RuntimeError("Backend tests require a PostgreSQL DATABASE_URL")
    if not parsed.database or not re.search(r"(^test_|_test$|_test_)", parsed.database):
        raise RuntimeError(
            "Refusing to run backend tests against a non-test database. "
            "Set TEST_DATABASE_URL to a PostgreSQL database whose name contains 'test'."
        )


def _ensure_test_database(url: str) -> None:
    parsed = make_url(url)
    database = parsed.database
    if not database:
        raise RuntimeError("TEST_DATABASE_URL must include a database name")
    maintenance_url = parsed.set(database="postgres")
    maintenance_engine = create_engine(
        maintenance_url,
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )
    try:
        with maintenance_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :database"),
                {"database": database},
            ).scalar()
            if not exists:
                quoted_database = conn.dialect.identifier_preparer.quote(database)
                conn.execute(text(f"CREATE DATABASE {quoted_database}"))
    finally:
        maintenance_engine.dispose()


def _reset_public_schema(engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))


def _seed_space_types(engine) -> None:
    # The spaces.space_type FK references space_types.key, so the built-in
    # registry rows must exist before any test inserts a space.
    from app.services.space_type_registry import seed_system_space_types

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        seed_system_space_types(session)
        session.commit()
    finally:
        session.close()


@pytest.fixture(scope="session")
def db_engine():
    _validate_test_database_url(TEST_DATABASE_URL)
    _ensure_test_database(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    _reset_public_schema(engine)
    Base.metadata.create_all(engine)
    _seed_space_types(engine)
    try:
        yield engine
    finally:
        _reset_public_schema(engine)
        engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=connection,
        join_transaction_mode="create_savepoint",
    )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture()
def client_factory(db_session):
    def _make(user_payload: dict):
        def override_get_db():
            yield db_session

        def override_get_current_user():
            return user_payload

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_optional_user] = override_get_current_user
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()
