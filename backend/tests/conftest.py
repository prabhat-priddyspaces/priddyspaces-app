import sys
from pathlib import Path

# Ensure project root is on sys.path for tests.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.deps import get_db
from app.core.auth import get_current_user, get_optional_user
from app.main import app
from app.models.base import Base
from app import models  # noqa: F401


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
