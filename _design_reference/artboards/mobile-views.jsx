// mobile-views.jsx — three iOS device frames showing key responsive views

function MobileViews({ theme = "light" }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "transparent",
      display: "flex", justifyContent: "center", alignItems: "center", gap: 28,
      padding: 24,
    }}>
      <MobileFrame title="Marketplace">
        <CustomerMobileMarketplace theme={theme} />
      </MobileFrame>

      <MobileFrame title="Listing detail">
        <CustomerMobileListing theme={theme} />
      </MobileFrame>

      <MobileFrame title="Owner dashboard">
        <OwnerMobileDashboard theme={theme} />
      </MobileFrame>
    </div>
  );
}

function MobileFrame({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <IOSDevice width={340} height={720}>
        {children}
      </IOSDevice>
      <div style={{ fontSize: 11, color: "rgba(60,50,40,0.6)" }}>{title}</div>
    </div>
  );
}

// ─── Mobile Marketplace ─────────────────────────────────────────
function CustomerMobileMarketplace({ theme }) {
  return (
    <div className={`ps theme-${theme}`} style={{ width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)" }}>
        <PSLogo size={26} />
        <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Discover</div>
        <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center" }}>
          <Icons.user size={14} />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 16px" }}>
        <div className="ps-card" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, borderRadius: 12 }}>
          <Icons.search size={15} color="var(--text-3)" />
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>Plantation, FL</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Wed May 13 · 4 ppl</div>
          </div>
          <button className="ps-btn ps-btn-sm" style={{ width: 28, height: 28, padding: 0, justifyContent: "center", background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>
            <Icons.filter size={12} sw={2} />
          </button>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, overflowX: "auto" }}>
        {[
          { label: "Coworking", active: true, icon: Icons.coffee },
          { label: "Meeting", icon: Icons.users },
          { label: "Office", icon: Icons.building },
          { label: "Event", icon: Icons.star },
        ].map(c => (
          <div key={c.label} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "8px 14px", borderRadius: 12, flex: "0 0 auto",
            background: c.active ? "var(--brand)" : "var(--surface)",
            color: c.active ? "#fff" : "var(--text-2)",
            border: c.active ? "none" : "1px solid var(--line)",
          }}>
            <c.icon size={16} sw={1.8} />
            <span style={{ fontSize: 10, fontWeight: 600 }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 16px 76px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", padding: "4px 0" }}>12 spaces · sorted by rec</div>
        {[
          { name: "Plantation HQ · Riverside 3", price: "$30/hr", rating: "4.92", dist: "3.3mi", featured: true },
          { name: "Brickell · Suite A", price: "$210/day", rating: "4.86", dist: "26mi" },
          { name: "Coral Springs · Open", price: "$29/day", rating: "4.71", dist: "6.4mi" },
        ].map((s, i) => (
          <div key={i} className="ps-card" style={{ overflow: "hidden", border: s.featured ? "1px solid var(--brand)" : "1px solid var(--line)" }}>
            <div style={{ height: 110, background: "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--brand)", opacity: 0.4 }}>
                <Icons.building size={28} />
              </div>
              {s.featured && (
                <span className="ps-chip" style={{ position: "absolute", top: 8, left: 8, height: 20, fontSize: 10, padding: "0 6px", background: "var(--brand)", color: "#fff" }}>
                  <Icons.sparkle size={10} sw={2.5} /> Featured
                </span>
              )}
              <button style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,.85)", border: "none", display: "grid", placeItems: "center" }}>
                <Icons.star size={14} color="var(--text-2)" />
              </button>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{s.dist} away · open now</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}>
                  <Icons.star size={11} fill="var(--ps-warning)" color="var(--ps-warning)" />
                  <strong>{s.rating}</strong>
                </div>
              </div>
              <div className="ps-num" style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{s.price}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "var(--bg-elev)",
        borderTop: "1px solid var(--line)",
        padding: "10px 16px 24px",
        display: "flex", gap: 4,
      }}>
        {[
          { icon: Icons.search, label: "Discover", active: true },
          { icon: Icons.calendar, label: "Bookings" },
          { icon: Icons.star, label: "Saved" },
          { icon: Icons.user, label: "Profile" },
        ].map(it => (
          <div key={it.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: it.active ? "var(--brand)" : "var(--text-3)" }}>
            <it.icon size={20} sw={it.active ? 2.2 : 1.6} />
            <span style={{ fontSize: 10, fontWeight: it.active ? 600 : 500 }}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mobile Listing ─────────────────────────────────────────────
function CustomerMobileListing({ theme }) {
  return (
    <div className={`ps theme-${theme}`} style={{ width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {/* Hero image */}
      <div style={{ height: 220, background: "linear-gradient(135deg, var(--ps-violet-200), var(--ps-mint-200, #c7f0e3))", position: "relative", flex: "0 0 auto" }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--brand)", opacity: 0.4 }}>
          <Icons.building size={48} />
        </div>
        <button style={{ position: "absolute", top: 14, left: 14, width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,.85)", border: "none", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,.15)" }}>
          <Icons.arrow_l size={16} color="var(--text)" />
        </button>
        <button style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,.85)", border: "none", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,.15)" }}>
          <Icons.star size={16} color="var(--text)" />
        </button>
        <div style={{ position: "absolute", bottom: 10, right: 10, padding: "4px 10px", background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: 999, fontSize: 11, fontFamily: "var(--f-mono)" }}>
          1 / 12
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 16px 120px" }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Riverside 3 · Plantation HQ</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
          <Icons.star size={12} fill="var(--ps-warning)" color="var(--ps-warning)" />
          <strong style={{ color: "var(--text)" }}>4.92</strong>
          <span>(218)</span>
          <span>·</span>
          <span>3.3 mi away</span>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 12, flexWrap: "wrap" }}>
          <span className="ps-chip ps-chip-mint" style={{ height: 22, fontSize: 10 }}>Open now</span>
          <span className="ps-chip" style={{ height: 22, fontSize: 10 }}>Up to 4</span>
          <span className="ps-chip" style={{ height: 22, fontSize: 10 }}>Instant book</span>
        </div>

        <hr className="ps-divider" style={{ margin: "16px 0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name="Plantation HQ" size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Plantation HQ</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>Superhost · 4 yrs · replies in 12m</div>
          </div>
          <button className="ps-btn ps-btn-sm" style={{ height: 28 }}>Message</button>
        </div>

        <hr className="ps-divider" style={{ margin: "16px 0" }} />

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>What's included</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            [Icons.wifi, "Gigabit WiFi"],
            [Icons.coffee, "Coffee bar"],
            [Icons.car, "Free parking"],
            [Icons.box, '65" display'],
          ].map(([I, l], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <I size={14} color="var(--text-3)" /> {l}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 600, marginTop: 12 }}>See all 14 amenities →</div>

        <hr className="ps-divider" style={{ margin: "16px 0" }} />

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Pick a time slot</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {[
            { t: "9am" }, { t: "10am", off: true }, { t: "11am" }, { t: "12p" },
            { t: "1p", off: true }, { t: "2p", sel: true }, { t: "3p", sel: true }, { t: "4p" },
          ].map(s => (
            <div key={s.t} style={{
              height: 30, borderRadius: 7,
              background: s.sel ? "var(--brand)" : s.off ? "var(--surface-2)" : "var(--surface)",
              color: s.sel ? "#fff" : s.off ? "var(--text-4)" : "var(--text-2)",
              border: s.off ? "1px dashed var(--line)" : "1px solid var(--line-strong)",
              display: "grid", placeItems: "center",
              fontSize: 11, fontWeight: 600, fontFamily: "var(--f-mono)",
              textDecoration: s.off ? "line-through" : "none",
            }}>{s.t}</div>
          ))}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "14px 16px 28px",
        background: "var(--bg-elev)",
        borderTop: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 -4px 20px rgba(16,10,31,.06)",
      }}>
        <div>
          <div className="ps-num" style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>$60</div>
          <div style={{ fontSize: 10, color: "var(--text-3)" }}>2 hrs · before fees</div>
        </div>
        <button className="ps-btn ps-btn-primary" style={{ flex: 1, height: 44, justifyContent: "center" }}>
          <Icons.zap size={14} sw={2.5} /> Reserve
        </button>
      </div>
    </div>
  );
}

// ─── Mobile Owner Dashboard ─────────────────────────────────────
function OwnerMobileDashboard({ theme }) {
  return (
    <div className={`ps theme-${theme}`} style={{ width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{ padding: "14px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name="Jane Miller" size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Wed, May 13</div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>Plantation HQ</div>
        </div>
        <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 32, padding: 0, justifyContent: "center" }}><Icons.bell size={14} /></button>
        <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 32, padding: 0, justifyContent: "center" }}><Icons.command size={14} /></button>
      </div>

      <div style={{ padding: "0 16px 76px", flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Hero stat */}
        <div className="ps-card" style={{
          padding: 18,
          background: "linear-gradient(135deg, var(--brand) 0%, var(--ps-violet-700) 100%)",
          color: "#fff",
          borderColor: "transparent",
        }}>
          <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>MTD Revenue</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <div className="ps-num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>$48,260</div>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "rgba(255,255,255,.2)" }}>+12.4%</span>
          </div>
          <Sparkline points={[3,5,4,7,6,8,9,11,10,13]} positive width={260} height={36} />
        </div>

        {/* Quick stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            ["Today", "12", "bookings"],
            ["Pending", "4", "requests"],
            ["Occ.", "76%", "this wk"],
          ].map(([l, v, s]) => (
            <div key={l} className="ps-card" style={{ padding: 10, textAlign: "left" }}>
              <div style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
              <div className="ps-num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{v}</div>
              <div style={{ fontSize: 9, color: "var(--text-3)" }}>{s}</div>
            </div>
          ))}
        </div>

        {/* Pending requests */}
        <div className="ps-card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Pending requests · 4</div>
            <Icons.chev_r size={13} color="var(--text-3)" />
          </div>
          {[
            { name: "Maya Chen", space: "Riverside 3 · 2pm", val: "$120" },
            { name: "Ben Larkin", space: "Day pass · 4 desks", val: "$196" },
            { name: "Priya Shah", space: "Office 12B · all day", val: "$320" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <Avatar name={r.name} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.space}</div>
              </div>
              <div className="ps-num" style={{ fontSize: 12, fontWeight: 600 }}>{r.val}</div>
              <button className="ps-btn ps-btn-sm" style={{ width: 24, height: 24, padding: 0, justifyContent: "center", borderColor: "var(--ps-success)", color: "var(--ps-success)" }}>
                <Icons.check size={11} sw={2.5} />
              </button>
            </div>
          ))}
        </div>

        {/* Today timeline mini */}
        <div className="ps-card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Today · 12 bookings</div>
            <span className="ps-chip ps-chip-violet" style={{ height: 18, fontSize: 9 }}>Live</span>
          </div>
          {[
            { time: "10:00", name: "Standup", room: "Riverside 3", tone: "violet" },
            { time: "11:00", name: "Foundry monthly", room: "Coral 12B", tone: "violet" },
            { time: "14:00", name: "Maya Chen", room: "Riverside 3", tone: "pending" },
            { time: "15:00", name: "Sales QBR", room: "Plantation 2", tone: "violet" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: i === 0 ? "none" : "1px dashed var(--line)" }}>
              <div className="ps-num" style={{ fontSize: 11, color: "var(--text-3)", width: 36, fontWeight: 600 }}>{e.time}</div>
              <div style={{ width: 3, background: e.tone === "pending" ? "var(--ps-warning)" : "var(--brand)", borderRadius: 99, flex: "0 0 auto" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)" }}>{e.room}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "var(--bg-elev)",
        borderTop: "1px solid var(--line)",
        padding: "8px 8px 22px",
        display: "flex", gap: 0,
      }}>
        {[
          { icon: Icons.home, label: "Home", active: true },
          { icon: Icons.calendar, label: "Calendar" },
          { icon: Icons.inbox, label: "Inbox", badge: 4 },
          { icon: Icons.chart, label: "Insights" },
        ].map(it => (
          <div key={it.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: it.active ? "var(--brand)" : "var(--text-3)", position: "relative", padding: "4px 0" }}>
            <it.icon size={20} sw={it.active ? 2.2 : 1.6} />
            <span style={{ fontSize: 10, fontWeight: it.active ? 600 : 500 }}>{it.label}</span>
            {it.badge && (
              <span style={{
                position: "absolute", top: 0, right: "30%",
                width: 14, height: 14, borderRadius: 999,
                background: "var(--ps-warning)", color: "#fff",
                fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center",
              }}>{it.badge}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { MobileViews, CustomerMobileMarketplace, CustomerMobileListing, OwnerMobileDashboard });
