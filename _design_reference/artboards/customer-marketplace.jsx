// customer-marketplace.jsx — public marketplace search + map
function CustomerMarketplace({ theme = "light" }) {
  return (
    <div className={`ps theme-${theme}`} style={{
      width: "100%", height: "100%",
      background: "var(--bg)", color: "var(--text)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <MarketplaceTopbar />

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden" }}>
        {/* Left: search + results */}
        <div style={{ overflow: "auto", padding: "20px 24px" }}>
          {/* Search hero */}
          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Find a workspace by the hour, day, or month.</h1>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6 }}>3,240 spaces · 124 cities · book in under 60 seconds</div>
          </div>

          {/* Tab pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              { label: "Coworking", sub: "Day passes", active: true },
              { label: "Meeting rooms", sub: "Hourly" },
              { label: "Private offices", sub: "Monthly" },
              { label: "Event spaces", sub: "Half-day" },
            ].map(t => (
              <button key={t.label} className="ps-btn" style={{
                height: "auto", padding: "8px 14px",
                background: t.active ? "var(--brand)" : "var(--surface)",
                color: t.active ? "#fff" : "var(--text-2)",
                borderColor: t.active ? "var(--brand)" : "var(--line)",
                flexDirection: "column", alignItems: "flex-start", gap: 0,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{t.sub}</span>
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="ps-card" style={{ padding: 8, marginBottom: 14, display: "flex", alignItems: "center", gap: 4, borderRadius: 14 }}>
            <div style={{ flex: 2, padding: "6px 10px", borderRight: "1px solid var(--line)" }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Where</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Icons.pin size={13} color="var(--brand)" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Plantation, FL</span>
                <Icons.chev_d size={11} color="var(--text-3)" />
              </div>
            </div>
            <div style={{ flex: 1.5, padding: "6px 10px", borderRight: "1px solid var(--line)" }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>When</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Icons.calendar size={13} color="var(--text-3)" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Wed, May 13</span>
              </div>
            </div>
            <div style={{ flex: 1, padding: "6px 10px", borderRight: "1px solid var(--line)" }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Capacity</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Icons.users size={13} color="var(--text-3)" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>4 people</span>
              </div>
            </div>
            <button className="ps-btn ps-btn-primary" style={{ height: 44, padding: "0 18px" }}>
              <Icons.search size={14} sw={2.5} /> Search
            </button>
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <span className="ps-chip ps-chip-violet">2 active</span>
            {["Under $50/hr", "WiFi", "Coffee", "Parking", "AC", "Whiteboard", "Open today"].map((f, i) => (
              <span key={f} className="ps-chip" style={{ background: i < 2 ? "var(--brand-soft)" : "var(--surface-2)", color: i < 2 ? "var(--brand-strong)" : "var(--text-3)", cursor: "pointer" }}>
                {f} {i < 2 && <Icons.x size={10} sw={2.5} />}
              </span>
            ))}
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ height: 24, padding: "0 10px" }}><Icons.filter size={12} /> All filters</button>
          </div>

          {/* Results summary */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}><strong>12 spaces</strong> within 25 mi · 3 available now</div>
            <button className="ps-btn ps-btn-sm ps-btn-ghost">Recommended <Icons.chev_d size={11} /></button>
          </div>

          {/* Result cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ResultCard idx={1} name="Plantation HQ · Riverside 3" type="Conference Room" addr="12301 W Sunrise Blvd, Plantation" price="$30/hr" capacity="4 seats" rating="4.92" reviews="218" featured tags={["WiFi", "Coffee", "Whiteboard"]} dist="3.3 mi" />
            <ResultCard idx={2} name="Brickell Commons · Suite A" type="Conference Room" addr="200 Brickell Ave, Miami" price="$210/day" capacity="12 seats" rating="4.86" reviews="142" tags={["WiFi", "Catering", "Parking"]} dist="26.0 mi" />
            <ResultCard idx={3} name="Coral Springs · Open Floor" type="Day pass" addr="8800 N University, Coral Springs" price="$29/day" capacity="40 desks" rating="4.71" reviews="93" tags={["WiFi", "Coffee", "Booth"]} dist="6.4 mi" available />
            <ResultCard idx={4} name="West Lauderdale · Studio" type="Private office" addr="1100 N Federal Hwy, Lauderdale" price="$1,200/mo" capacity="6 seats" rating="4.65" reviews="34" tags={["WiFi", "Mailbox"]} dist="12.1 mi" />
          </div>
        </div>

        {/* Right: map */}
        <div style={{ position: "relative", background: "var(--surface-2)", overflow: "hidden", borderLeft: "1px solid var(--line)" }}>
          <MapMock />
          <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", gap: 6, justifyContent: "space-between", pointerEvents: "none" }}>
            <button className="ps-btn ps-btn-sm" style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)", pointerEvents: "auto" }}>
              <Icons.map size={12} /> Map
            </button>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="ps-btn ps-btn-sm" style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)", pointerEvents: "auto", width: 30, padding: 0, justifyContent: "center" }}>+</button>
              <button className="ps-btn ps-btn-sm" style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)", pointerEvents: "auto", width: 30, padding: 0, justifyContent: "center" }}>−</button>
            </div>
          </div>
          {/* Hovered pin preview */}
          <div className="ps-card" style={{
            position: "absolute", bottom: 20, left: 20, right: 20,
            padding: 12, display: "flex", gap: 12, alignItems: "center",
            boxShadow: "var(--shadow-lg)",
          }}>
            <div style={{ width: 60, height: 60, borderRadius: 10, background: "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))", flex: "0 0 auto", display: "grid", placeItems: "center", color: "var(--brand)" }}>
              <Icons.building size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Plantation HQ</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>· 4 spaces</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span className="ps-chip ps-chip-mint" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>Open now</span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>From $30/hr · 4.92 ★</span>
              </div>
            </div>
            <button className="ps-btn ps-btn-sm ps-btn-primary">View</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketplaceTopbar() {
  return (
    <header style={{
      display: "flex", alignItems: "center", padding: "12px 24px",
      borderBottom: "1px solid var(--line)", background: "var(--bg)",
      gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PSLogo size={30} />
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>Priddyspaces</div>
      </div>
      <nav style={{ display: "flex", gap: 4, marginLeft: 24 }}>
        {["Discover", "How it works", "For hosts", "Help"].map((l, i) => (
          <button key={l} className="ps-btn ps-btn-ghost ps-btn-sm" style={{
            color: i === 0 ? "var(--text)" : "var(--text-3)",
            fontWeight: i === 0 ? 600 : 500,
          }}>{l}</button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <button className="ps-btn ps-btn-sm ps-btn-ghost">List your space</button>
      <button className="ps-btn ps-btn-sm">Sign in</button>
      <button className="ps-btn ps-btn-sm ps-btn-primary">Get started</button>
    </header>
  );
}

function ResultCard({ idx, name, type, addr, price, capacity, rating, reviews, tags, dist, featured, available }) {
  return (
    <div className="ps-card" style={{
      padding: 12, display: "flex", gap: 12, alignItems: "stretch",
      border: featured ? "1px solid var(--brand)" : "1px solid var(--line)",
      boxShadow: featured ? "0 0 0 3px var(--brand-soft)" : "var(--shadow-xs)",
      cursor: "pointer", transition: "all .15s",
    }}>
      <div style={{ position: "relative", width: 140, height: 120, borderRadius: 10, overflow: "hidden", background: "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))", flex: "0 0 auto" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 70%, rgba(255,255,255,.5), transparent 50%), radial-gradient(circle at 70% 30%, rgba(124,91,245,.2), transparent 50%)" }} />
        <div style={{ position: "absolute", top: 8, left: 8 }}>
          <span className="ps-chip" style={{ background: "rgba(255,255,255,.85)", height: 20, fontSize: 10, padding: "0 6px", fontWeight: 600 }}>
            #{idx}
          </span>
        </div>
        {featured && <div style={{ position: "absolute", top: 8, right: 8 }}>
          <span className="ps-chip ps-chip-violet" style={{ height: 20, fontSize: 10, padding: "0 6px", background: "var(--brand)", color: "#fff" }}>
            <Icons.sparkle size={10} sw={2.5} /> Featured
          </span>
        </div>}
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--brand)", opacity: 0.5 }}>
          <Icons.building size={28} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
            {available && <span className="ps-chip ps-chip-mint" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>Open now</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{type} · {capacity} · {dist} away</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{addr}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {tags.map(t => (
              <span key={t} className="ps-chip" style={{ height: 20, fontSize: 10, padding: "0 6px" }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-3)" }}>
              <Icons.star size={11} fill="var(--ps-warning)" color="var(--ps-warning)" />
              <strong style={{ color: "var(--text)" }}>{rating}</strong> <span>({reviews})</span>
            </div>
            <div className="ps-num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, letterSpacing: "-0.01em" }}>{price}</div>
          </div>
          <button className="ps-btn ps-btn-sm ps-btn-primary">Book →</button>
        </div>
      </div>
    </div>
  );
}

function MapMock() {
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 600 800" style={{ display: "block" }}>
      <defs>
        <pattern id="grid-bg" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#EDEEF2" />
          <path d="M40 0v40H0" fill="none" stroke="#E0E2EA" strokeWidth="0.5" />
        </pattern>
        <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C7DDF0" />
          <stop offset="1" stopColor="#A8C8E8" />
        </linearGradient>
        <linearGradient id="park" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D7EBC8" />
          <stop offset="1" stopColor="#C1DCAD" />
        </linearGradient>
      </defs>
      <rect width="600" height="800" fill="url(#grid-bg)" />
      {/* Parks */}
      <path d="M0 0 L320 0 L380 120 L260 200 L120 240 L0 200 Z" fill="url(#park)" opacity="0.7" />
      <ellipse cx="450" cy="640" rx="220" ry="180" fill="url(#park)" opacity="0.6" />
      {/* Water */}
      <path d="M0 540 Q120 480 240 520 T600 580 L600 800 L0 800 Z" fill="url(#water)" />
      {/* Roads */}
      {[120, 240, 380, 520, 660].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#FFF" strokeWidth="6" opacity="0.7" />)}
      {[100, 250, 400, 530].map(x => <line key={x} x1={x} x2={x} y1="0" y2="800" stroke="#FFF" strokeWidth="6" opacity="0.7" />)}
      {/* Highway accent */}
      <line x1="0" y1="380" x2="600" y2="380" stroke="#F5C36A" strokeWidth="8" opacity="0.7" />
      {/* Pins */}
      {[
        { x: 220, y: 320, n: 1, big: true },
        { x: 380, y: 240, n: 2 },
        { x: 460, y: 460, n: 3 },
        { x: 140, y: 540, n: 4 },
        { x: 320, y: 600, n: 5 },
      ].map(p => (
        <g key={p.n}>
          <circle cx={p.x} cy={p.y + 3} r={p.big ? 18 : 14} fill="rgba(0,0,0,.15)" />
          <circle cx={p.x} cy={p.y} r={p.big ? 18 : 14} fill={p.big ? "#7C5BF5" : "#FFF"} stroke="#7C5BF5" strokeWidth="2" />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={p.big ? 14 : 12} fontWeight="700" fill={p.big ? "#FFF" : "#7C5BF5"} fontFamily="Geist Mono">{p.n}</text>
        </g>
      ))}
      {/* Compass + scale */}
      <g transform="translate(540 30)">
        <circle r="14" fill="#FFF" stroke="#E0E2EA" />
        <path d="M0 -8 L4 0 L0 8 L-4 0 Z" fill="#7C5BF5" />
        <text y="22" textAnchor="middle" fontSize="10" fill="#6B7280">N</text>
      </g>
    </svg>
  );
}

Object.assign(window, { CustomerMarketplace, MarketplaceTopbar, ResultCard, MapMock });
