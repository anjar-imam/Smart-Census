from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.database import Base
from app.models import User
from app.security import create_access_token


@pytest.fixture
def api_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, sessionmaker]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", engine)

    def override_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[main.get_db] = override_db
    with TestClient(main.app) as client:
        yield client, factory
    main.app.dependency_overrides.clear()
    engine.dispose()


def sign_in(client: TestClient, phone: str, monkeypatch: pytest.MonkeyPatch) -> str:
    captured: list[str] = []
    monkeypatch.setattr(main, "deliver_otp", lambda _phone, code: captured.append(code))
    requested = client.post("/auth/request-otp", json={"phone": phone})
    assert requested.status_code == 200
    verified = client.post("/auth/verify-otp", json={"phone": phone, "code": captured[0]})
    assert verified.status_code == 200
    return verified.json()["access_token"]


def test_citizen_household_member_audit_and_aggregate(api_client, monkeypatch):
    client, _factory = api_client
    token = sign_in(client, "+91 98765 43210", monkeypatch)
    headers = {"Authorization": f"Bearer {token}"}
    household_response = client.post(
        "/households",
        headers=headers,
        json={
            "head_name": "Asha Rao",
            "mobile": "+919876543210",
            "state": "Demo State",
            "district": "Demo District",
            "city_village": "Example City",
            "ward": "3",
            "locality": "Sample Locality",
            "address": "12 Test Street",
            "consent": True,
        },
    )
    assert household_response.status_code == 201
    household = household_response.json()
    household_id = household["id"]
    member_payload = {
        "full_name": "Asha Rao",
        "age": 34,
        "gender": "female",
        "relationship": "Self",
        "living_status": "active",
    }
    member = client.post(f"/households/{household_id}/members", headers=headers, json=member_payload)
    assert member.status_code == 201
    assert client.post(f"/households/{household_id}/members", headers=headers, json=member_payload).status_code == 409
    deceased = {**member_payload, "full_name": "Deceased Relative", "age": 76, "gender": "male", "living_status": "deceased"}
    assert client.post(f"/households/{household_id}/members", headers=headers, json=deceased).status_code == 201

    aggregate = client.get("/public/analytics").json()
    assert aggregate["total_households"] == 1
    assert aggregate["total_population"] == 1
    assert aggregate["female_population"] == 1
    assert aggregate["average_family_size"] == 1
    assert aggregate["population_growth"][-1]["population"] == 1
    assert "Asha Rao" not in str(aggregate)
    assert "12 Test Street" not in str(aggregate)
    assert client.get(f"/households/{household_id}/history", headers=headers).json()

    removed = client.delete(f"/households/{household_id}/members/{member.json()['id']}", headers=headers)
    assert removed.status_code == 204
    assert client.get("/public/analytics").json()["total_population"] == 0


def test_citizen_cannot_access_another_household(api_client, monkeypatch):
    client, _factory = api_client
    owner_token = sign_in(client, "+919111111111", monkeypatch)
    other_token = sign_in(client, "+919222222222", monkeypatch)
    household = client.post(
        "/households",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "head_name": "Private Person",
            "mobile": "+919111111111",
            "state": "Demo State",
            "district": "Demo District",
            "city_village": "Example City",
            "ward": "3",
            "locality": "Sample Locality",
            "address": "Secret House",
            "consent": True,
        },
    ).json()
    response = client.get(
        f"/households/{household['id']}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404


def test_admin_only_exports_and_can_manage_households(api_client, monkeypatch):
    client, factory = api_client
    citizen_token = sign_in(client, "+919333333333", monkeypatch)
    household = client.post(
        "/households",
        headers={"Authorization": f"Bearer {citizen_token}"},
        json={
            "head_name": "Test Citizen",
            "mobile": "+919333333333",
            "state": "Demo State",
            "district": "Demo District",
            "city_village": "Example City",
            "ward": "3",
            "locality": "Sample Locality",
            "address": "Example Address",
            "consent": True,
        },
    ).json()
    with factory() as db:
        admin = User(phone="+919444444444", role="admin")
        db.add(admin)
        db.commit()
        db.refresh(admin)
        admin_token = create_access_token(admin)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    assert client.get("/admin/export.csv", headers={"Authorization": f"Bearer {citizen_token}"}).status_code == 403
    changed = client.patch(
        f"/admin/households/{household['id']}",
        headers=admin_headers,
        json={"head_name": "Updated by administrator"},
    )
    assert changed.status_code == 200
    assert changed.json()["head_name"] == "Updated by administrator"
    assert "household_code" in client.get("/admin/export.csv", headers=admin_headers).text
