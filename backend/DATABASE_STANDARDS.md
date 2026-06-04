# Database Standards — Priddyspaces Backend

This document defines mandatory standards for every SQLAlchemy model and every
query written in this codebase. A pre-merge checklist is provided at the bottom.

---

## 1. Foreign Key Constraints

Every integer column that stores an ID from another table **MUST** use SQLAlchemy's
`ForeignKey` with an explicit `ondelete` behaviour.

```python
# ✅ Correct
from sqlalchemy import Column, ForeignKey, Integer

user_id = Column(
    Integer,
    ForeignKey("users.id", ondelete="RESTRICT"),
    nullable=False,
    index=True,
)
booking_series_id = Column(
    Integer,
    ForeignKey("booking_series.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)

# ❌ Wrong — plain Integer without ForeignKey
user_id = Column(Integer, nullable=False)
```

**Choose `ondelete` as follows:**

| Relationship | ondelete |
|---|---|
| Child cannot exist without parent (booking → space) | `RESTRICT` |
| Child becomes orphaned gracefully (booking → booking_series) | `SET NULL` |
| Child is tightly owned by parent (policy tier → policy) | `CASCADE` |

Never leave `ondelete` unset — the default `NO ACTION` behaves like `RESTRICT` but
raises at the end of the transaction, not immediately, which is harder to debug.

---

## 2. Index on Every FK Column

Every column with a `ForeignKey` **MUST** have `index=True` (or appear in a
`__table_args__` `Index`). Without this the database performs a full table scan
whenever a parent row is referenced in a join or WHERE clause.

```python
# ✅ Correct
space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT"), nullable=False, index=True)

# ❌ Wrong — FK with no index
space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT"), nullable=False)
```

For composite indexes use `__table_args__`:

```python
__table_args__ = (
    Index("ix_payments_tenant_status", "tenant_id", "status"),
)
```

---

## 3. Enum Columns

Status, type, and mode columns **MUST** use a typed Python enum wired to a
PostgreSQL enum type. Raw `String(32)` status columns cause silent data drift
(any string is accepted) and break runtime type checks.

```python
# ✅ Correct
from sqlalchemy import Column, Enum
from app.models.enums import SubscriptionStatusEnum, enum_values

status = Column(
    Enum(SubscriptionStatusEnum, values_callable=enum_values),
    nullable=False,
    default=SubscriptionStatusEnum.PENDING_APPROVAL,
    server_default="pending_approval",
)

# ❌ Wrong
status = Column(String(32), nullable=False)
```

Add the Python enum to `app/models/enums.py`. Never define ad-hoc string values
in migration files or application code.

---

## 4. Python `default=` and SQL `server_default=` Together

Every column with a Python `default=` **MUST** also have a matching
`server_default=`. Without `server_default` a raw SQL `INSERT` that bypasses the
ORM will insert `NULL` instead of the intended value.

```python
# ✅ Correct
status = Column(
    Enum(BookingStatus, values_callable=enum_values),
    nullable=False,
    default=BookingStatus.PENDING,
    server_default="pending",
)

capacity = Column(Integer, nullable=False, default=1, server_default="1")
is_primary = Column(Boolean, nullable=False, default=False, server_default="false")

# ❌ Wrong — server_default missing
capacity = Column(Integer, default=1)
```

---

## 5. Multi-Tenant Tables

Every table that belongs to a tenant (organisation) **MUST** have:

- `tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)`
- A composite index on `(tenant_id, <primary filter column>)` for hot queries.

`tenant_id` must **never** be nullable on owned resources.

---

## 6. Unique Constraints

Unique business keys (not just primary keys) **MUST** be declared in
`__table_args__` as a named `UniqueConstraint`. This makes violations raise
`IntegrityError` in application code and documents the business rule clearly.

```python
# ✅ Correct
__table_args__ = (
    UniqueConstraint("organization_id", "provider", name="uq_owner_payment_settings_org_provider"),
    UniqueConstraint("tenant_id", "code", name="uq_promo_codes_tenant_code"),
)

# ❌ Wrong — uniqueness only enforced by application code
```

Common patterns requiring unique constraints:

| Table | Columns |
|---|---|
| feature_flags | (tenant_id, flag_key, scope_type, scope_id) |
| owner_payment_settings | (organization_id, provider) |
| cancellation_policies | (tenant_id, space_type) |
| organization_members | (organization_id, user_id) |
| location_admins | (location_id, user_id) |
| member_owner_payment_methods | (user_id, organization_id, provider) |

---

## 7. Timestamp Fields

Every table **MUST** use `TimestampMixin` (provides `created_at` and `updated_at`
with server defaults). Do not add raw `created_at`/`updated_at` columns without
the mixin.

---

## 8. List Endpoints Must Be Paginated

Every endpoint that returns a list of rows **MUST** accept `page` and `page_size`
query parameters and use SQL `LIMIT`/`OFFSET`. Never return an unbounded `.all()`.

```python
# ✅ Correct
@router.get("/admin/members")
def list_members(page: int = 1, page_size: int = 50, ...):
    query = db.query(User).filter(...)
    total = query.count()
    members = query.offset((page - 1) * page_size).limit(page_size).all()

# ❌ Wrong
members = query.all()
```

---

## 9. Aggregation Queries Must Use SQL Functions

Never load all rows to compute a sum, count, or average in Python. Use
`func.sum()`, `func.count()`, and `case()` in SQL instead.

```python
# ✅ Correct
from sqlalchemy import case, func

result = db.query(
    func.sum(Payment.amount).label("total"),
    func.sum(case((Payment.status == PaymentStatus.SUCCEEDED, Payment.amount), else_=0)).label("gmv"),
).one()

# ❌ Wrong — loads entire table
payments = db.query(Payment).all()
gmv = sum(p.amount for p in payments if p.status == PaymentStatus.SUCCEEDED)
```

---

## 10. Avoid N+1 Queries

Never load a parent entity and then query its children one at a time inside a loop
or sequential calls. Batch-load using `IN (...)` queries or SQL joins.

```python
# ✅ Correct — single join
booking, space, location = (
    db.query(Booking, Space, Location)
    .join(Space, Space.id == Booking.space_id)
    .join(Location, Location.id == Space.location_id)
    .filter(Booking.public_id == public_id)
    .one()
)

# ❌ Wrong — three round-trips per booking
booking = db.query(Booking).filter(Booking.public_id == public_id).first()
space = db.query(Space).filter(Space.id == booking.space_id).first()
location = db.query(Location).filter(Location.id == space.location_id).first()
```

---

## 11. Migration Checklist

Before opening a PR that touches the database:

- [ ] Every new FK column has `ForeignKey("table.id", ondelete=...)` and `index=True`
- [ ] Every Enum column has a matching Python enum in `enums.py`
- [ ] Every column with `default=` also has `server_default=`
- [ ] `tenant_id` is `NOT NULL` on every owned resource
- [ ] Unique business keys are declared in `__table_args__`
- [ ] List endpoints have pagination (`page`, `page_size`)
- [ ] No query loads all rows just to filter or aggregate in Python
- [ ] Migration uses `NOT VALID` for new FK constraints on existing tables, validated in a follow-up migration
- [ ] Indexes are created with `postgresql_concurrently=True` on large existing tables (> 100k rows)
- [ ] `alembic upgrade head` runs clean on test DB
- [ ] All tests pass after migration

---

## 12. Adding FK Constraints to Existing Tables

Use this pattern to avoid locking production tables:

```python
# Migration 0055 — add constraint without validating existing rows
def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE bookings "
        "ADD CONSTRAINT fk_bookings_user_id "
        "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT "
        "NOT VALID"
    ))

# Migration 0056 — validate in a separate transaction (ShareLock only, no writes blocked)
def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE bookings VALIDATE CONSTRAINT fk_bookings_user_id"))
```

The `NOT VALID` flag means existing rows are not scanned, so the migration runs
instantly. The `VALIDATE CONSTRAINT` step acquires only a `ShareUpdateExclusiveLock`,
which does not block reads or writes.
