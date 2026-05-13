// owner-locations.jsx — locations with rooms
function OwnerLocations({ theme = "light" }) {
  const locations = [
    { name: "Plantation HQ", city: "Plantation, FL", address: "12301 W Sunrise Blvd", rooms: 6, occ: 0.82, revenue: 12480, status: "active", primary: true },
    { name: "Coral Springs", city: "Coral Springs, FL", address: "8800 N University Dr", rooms: 4, occ: 0.64, revenue: 7820, status: "active" },
    { name: "Brickell Commons", city: "Miami, FL", address: "200 Brickell Ave", rooms: 8, occ: 0.91, revenue: 18240, status: "active" },
    { name: "Riverside Annex", city: "Plantation, FL", address: "12301 W Sunrise Blvd · Bldg 2", rooms: 3, occ: 0.48, revenue: 4920, status: "active" },
    { name: "West Lauderdale", city: "Lauderdale, FL", address: "1100 N Federal Hwy", rooms: 5, occ: 0.21, revenue: 1200, status: "onboarding" },
  ];

  return (
    <PSShell theme={theme} sidebar="owner"
      title="Locations"
      breadcrumb={["Owner", "Operations"]}
      actions={<>
        <button className="ps-btn"><Icons.map size={14} /> Map view</button>
        <button className="ps-btn ps-btn-primary"><Icons.plus size={14} /> New location</button>
      </>}>

      <div style={{ marginBottom: 18, color: "var(--text-3)", fontSize: 13 }}>
        Manage locations and the rooms available at each site. Public marketplace pulls from this directly.
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <input className="ps-input" placeholder="Search location, city, address…" style={{ flex: 1, maxWidth: 360 }} />
        <button className="ps-btn ps-btn-sm">Status · All <Icons.chev_d size={11} /></button>
        <button className="ps-btn ps-btn-sm">City · All <Icons.chev_d size={11} /></button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--surface-2)", borderRadius: 10 }}>
          <button className="ps-btn ps-btn-sm" style={{ height: 26, background: "var(--surface)", boxShadow: "var(--shadow-xs)" }}>Cards</button>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ height: 26 }}>Table</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {locations.map((l, i) => (
          <LocationCard key={i} {...l} />
        ))}

        {/* Add new card */}
        <div style={{
          padding: 22, borderRadius: "var(--r-lg)",
          border: "2px dashed var(--line-strong)",
          background: "var(--surface)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 200,
          color: "var(--text-3)", cursor: "pointer", textAlign: "center",
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center" }}>
            <Icons.plus size={20} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Add a new location</div>
          <div style={{ fontSize: 12, maxWidth: 240 }}>Address, hours, amenities — appears on the marketplace once you add rooms.</div>
        </div>
      </div>
    </PSShell>
  );
}

function LocationCard({ name, city, address, rooms, occ, revenue, status, primary }) {
  return (
    <div className="ps-card" style={{
      overflow: "hidden",
      borderColor: primary ? "var(--brand)" : "var(--line)",
      boxShadow: primary ? "0 0 0 3px var(--brand-soft)" : "var(--shadow-xs)",
    }}>
      {/* Hero strip */}
      <div style={{
        height: 80,
        background: status === "onboarding"
          ? "linear-gradient(135deg, #FFF4E5, #FFE4C9)"
          : "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))",
        position: "relative",
      }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(circle at 20% 80%, rgba(255,255,255,.4) 0%, transparent 50%),
                            radial-gradient(circle at 80% 20%, rgba(124,91,245,.15) 0%, transparent 50%)`,
        }} />
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
          {primary && <span className="ps-chip ps-chip-violet" style={{ background: "rgba(255,255,255,.7)" }}>Primary</span>}
          {status === "onboarding" ? (
            <span className="ps-chip ps-chip-warning"><Icons.dot size={10} sw={4} /> Onboarding</span>
          ) : (
            <span className="ps-chip ps-chip-success"><Icons.dot size={10} sw={4} /> Live</span>
          )}
        </div>
        <div style={{ position: "absolute", left: 16, bottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--brand)", boxShadow: "var(--shadow-sm)" }}>
            <Icons.building size={16} />
          </div>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{name}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <Icons.pin size={11} /> {address} · {city}
            </div>
          </div>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 28, padding: 0, justifyContent: "center" }}><Icons.more size={14} /></button>
        </div>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: 12, background: "var(--surface-2)", borderRadius: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rooms</div>
            <div className="ps-num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{rooms}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Occupancy</div>
            <div className="ps-num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: occ > 0.8 ? "var(--ps-success)" : occ > 0.5 ? "var(--text)" : "var(--ps-warning)" }}>
              {Math.round(occ * 100)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>MTD net</div>
            <div className="ps-num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>${(revenue / 1000).toFixed(1)}k</div>
          </div>
        </div>

        {/* Amenities */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
          {[Icons.wifi, Icons.coffee, Icons.car, Icons.printer].map((I, i) => (
            <div key={i} style={{ width: 22, height: 22, borderRadius: 5, background: "var(--surface-2)", color: "var(--text-3)", display: "grid", placeItems: "center" }}>
              <I size={11} sw={2} />
            </div>
          ))}
          <span style={{ fontSize: 11, color: "var(--text-3)", padding: "2px 6px" }}>+ 3 more</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ps-btn ps-btn-sm" style={{ flex: 1, justifyContent: "center", background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>Manage rooms</button>
          <button className="ps-btn ps-btn-sm">Edit</button>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center" }}><Icons.globe size={13} /></button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OwnerLocations, LocationCard });
