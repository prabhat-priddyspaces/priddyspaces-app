// shared.jsx — atoms shared across every artboard

// ─── Icons ──────────────────────────────────────────────────────
// Stroked, 18px default, 1.5 weight. All take {size, className, color}.
function Ic({ d, size = 18, sw = 1.6, fill, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"} stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {typeof d === 'string' ? <path d={d} /> : d}
    </svg>
  );
}

const Icons = {
  home:      (p) => <Ic {...p} d="M3 11l9-8 9 8M5 9v12h14V9" />,
  calendar:  (p) => <Ic {...p} d={<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>} />,
  inbox:     (p) => <Ic {...p} d="M3 14l3-9h12l3 9M3 14v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5M3 14h5l1 3h6l1-3h5" />,
  users:     (p) => <Ic {...p} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  mail:      (p) => <Ic {...p} d={<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></>} />,
  star:      (p) => <Ic {...p} d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />,
  chart:     (p) => <Ic {...p} d="M3 3v18h18M7 14l4-4 4 4 6-6" />,
  pin:       (p) => <Ic {...p} d="M12 22s-7-7.5-7-13a7 7 0 0 1 14 0c0 5.5-7 13-7 13zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  box:       (p) => <Ic {...p} d="M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />,
  plus:      (p) => <Ic {...p} d="M12 5v14M5 12h14" />,
  settings:  (p) => <Ic {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />,
  search:    (p) => <Ic {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />,
  bell:      (p) => <Ic {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M14 21a2 2 0 0 1-4 0" />,
  arrow_r:   (p) => <Ic {...p} d="M5 12h14M13 5l7 7-7 7" />,
  arrow_l:   (p) => <Ic {...p} d="M19 12H5M12 19l-7-7 7-7" />,
  chev_d:    (p) => <Ic {...p} d="m6 9 6 6 6-6" />,
  chev_r:    (p) => <Ic {...p} d="m9 6 6 6-6 6" />,
  check:     (p) => <Ic {...p} d="M20 6 9 17l-5-5" />,
  x:         (p) => <Ic {...p} d="M18 6 6 18M6 6l12 12" />,
  dot:       (p) => <Ic {...p} d="M12 12h.01" sw={4} />,
  more:      (p) => <Ic {...p} d="M5 12h.01M12 12h.01M19 12h.01" sw={3} />,
  filter:    (p) => <Ic {...p} d="M3 4h18l-7 9v6l-4 2v-8L3 4z" />,
  clock:     (p) => <Ic {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  dollar:    (p) => <Ic {...p} d="M12 1v22M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" />,
  trend_up:  (p) => <Ic {...p} d="m22 7-8.5 8.5-5-5L2 17M16 7h6v6" />,
  trend_dn:  (p) => <Ic {...p} d="m22 17-8.5-8.5-5 5L2 7M16 17h6v-6" />,
  building:  (p) => <Ic {...p} d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 13v.01M9 17v.01M15 13v.01M15 17v.01" />,
  wifi:      (p) => <Ic {...p} d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0M12 20h.01" />,
  car:       (p) => <Ic {...p} d="M5 17h14l-1-7H6l-1 7zM5 17v2M19 17v2M7 14h.01M17 14h.01M9 10V6h6v4" />,
  coffee:    (p) => <Ic {...p} d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />,
  command:   (p) => <Ic {...p} d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />,
  sparkle:   (p) => <Ic {...p} d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />,
  zap:       (p) => <Ic {...p} d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  card:      (p) => <Ic {...p} d={<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>} />,
  doc:       (p) => <Ic {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  megaphone: (p) => <Ic {...p} d="M3 11v2a1 1 0 0 0 1 1h2l5 5V5L6 10H4a1 1 0 0 0-1 1zM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" />,
  globe:     (p) => <Ic {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>} />,
  map:       (p) => <Ic {...p} d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3zM9 3v15M15 6v15" />,
  user:      (p) => <Ic {...p} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  sun:       (p) => <Ic {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>} />,
  moon:      (p) => <Ic {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  printer:   (p) => <Ic {...p} d={<><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>} />,
};

// ─── Workspace Shell ────────────────────────────────────────────
function PSShell({ title, subtitle, breadcrumb, actions, children, sidebar = "owner", search = true, theme = "light", scale = 1, dense = false, badge }) {
  return (
    <div className={`ps theme-${theme}`} style={{
      width: "100%", height: "100%",
      display: "grid",
      gridTemplateColumns: "232px 1fr",
      background: "var(--bg)",
      color: "var(--text)",
      overflow: "hidden",
    }}>
      <PSSidebar variant={sidebar} />
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <PSTopbar title={title} breadcrumb={breadcrumb} actions={actions} search={search} badge={badge} />
        <div style={{ flex: 1, overflow: "auto", padding: dense ? "20px 24px" : "28px 32px" }}>
          {subtitle && (
            <div style={{ marginBottom: 20, color: "var(--text-3)", fontSize: 14, maxWidth: 600 }}>{subtitle}</div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function PSLogo({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: "linear-gradient(135deg, var(--ps-violet-400) 0%, var(--ps-violet-600) 100%)",
      display: "grid", placeItems: "center",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.25), 0 1px 3px rgba(64,40,170,.25)",
      flex: "0 0 auto",
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M5 3v18M5 3h7a5 5 0 0 1 0 10H5M14.5 13l5 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function PSSidebar({ variant = "owner", active }) {
  const ownerSections = [
    { label: "Overview", items: [
      { id: "dashboard", icon: Icons.home, label: "Dashboard", count: null },
      { id: "calendar", icon: Icons.calendar, label: "Calendar", count: null },
      { id: "requests", icon: Icons.inbox, label: "Requests", count: 4, dot: "warning" },
    ]},
    { label: "Operations", items: [
      { id: "members", icon: Icons.users, label: "Members" },
      { id: "locations", icon: Icons.pin, label: "Locations" },
      { id: "inventory", icon: Icons.box, label: "Inventory" },
      { id: "team", icon: Icons.user, label: "Team" },
    ]},
    { label: "Growth", items: [
      { id: "marketing", icon: Icons.megaphone, label: "Marketing" },
      { id: "loyalty", icon: Icons.star, label: "Loyalty" },
      { id: "analytics", icon: Icons.chart, label: "Analytics" },
    ]},
    { label: "Finance", items: [
      { id: "payments", icon: Icons.card, label: "Payments" },
      { id: "invoices", icon: Icons.doc, label: "Invoices" },
    ]},
  ];

  const customerSections = [
    { label: "Workspace", items: [
      { id: "discover", icon: Icons.search, label: "Discover" },
      { id: "bookings", icon: Icons.calendar, label: "My bookings", count: 3 },
      { id: "memberships", icon: Icons.star, label: "Memberships" },
      { id: "invoices", icon: Icons.doc, label: "Invoices" },
    ]},
    { label: "Account", items: [
      { id: "profile", icon: Icons.user, label: "Profile" },
      { id: "billing", icon: Icons.card, label: "Billing" },
    ]},
  ];

  const sections = variant === "customer" ? customerSections : ownerSections;
  const activeId = active ?? (variant === "customer" ? "discover" : "dashboard");

  return (
    <aside style={{
      borderRight: "1px solid var(--line)",
      background: "var(--bg)",
      display: "flex", flexDirection: "column",
      padding: "14px 12px",
      gap: 4,
    }}>
      {/* Brand + workspace switcher */}
      <button style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 8px",
        borderRadius: 10,
        border: "1px solid transparent",
        background: "transparent",
        cursor: "pointer", textAlign: "left",
        marginBottom: 10,
      }}>
        <PSLogo size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.1 }}>Priddyspaces</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.1, marginTop: 2 }}>
            {variant === "customer" ? "Member" : "Plantation HQ"}
          </div>
        </div>
        <Icons.chev_d size={14} color="var(--text-3)" />
      </button>

      {/* Search */}
      <button style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px",
        borderRadius: 10,
        border: "1px solid var(--line)",
        background: "var(--surface)",
        cursor: "pointer", color: "var(--text-3)",
        fontSize: 13,
        marginBottom: 8,
      }}>
        <Icons.search size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>Search…</span>
        <span className="ps-kbd">⌘K</span>
      </button>

      <nav style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {sections.map((sec, i) => (
          <div key={i}>
            <div style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--text-4)", padding: "4px 10px", marginBottom: 2,
            }}>{sec.label}</div>
            {sec.items.map((it) => (
              <div key={it.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: it.id === activeId ? 600 : 500,
                color: it.id === activeId ? "var(--brand-strong)" : "var(--text-2)",
                background: it.id === activeId ? "var(--brand-soft)" : "transparent",
                cursor: "pointer",
              }}>
                <it.icon size={15} color={it.id === activeId ? "var(--brand)" : "var(--text-3)"} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.count && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "1px 6px", borderRadius: 999,
                    background: it.dot === "warning" ? "var(--ps-warning-bg)" : "var(--surface-2)",
                    color: it.dot === "warning" ? "var(--ps-warning)" : "var(--text-2)",
                  }}>{it.count}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div style={{
        padding: "10px 8px",
        marginTop: 8,
        display: "flex", alignItems: "center", gap: 10,
        borderRadius: 10,
        background: "var(--surface-2)",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 999,
          background: "linear-gradient(135deg, #FFD074, #FF9E5E)",
          display: "grid", placeItems: "center",
          color: "#5a2a00", fontSize: 11, fontWeight: 700,
        }}>JM</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {variant === "customer" ? "Jane Miller" : "Ops · J. Miller"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.1, marginTop: 2 }}>
            jane@plant.co
          </div>
        </div>
        <Icons.settings size={14} color="var(--text-3)" />
      </div>
    </aside>
  );
}

function PSTopbar({ title, breadcrumb, actions, search, badge }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "12px 28px",
      borderBottom: "1px solid var(--line)",
      background: "var(--bg)",
      minHeight: 60,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Icons.chev_r size={11} />}
                <span>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h1>
          {badge && <span className={`ps-chip ps-chip-${badge.tone || "mint"}`}>{badge.label}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {actions}
        <button className="ps-btn ps-btn-ghost" style={{ width: 36, padding: 0, justifyContent: "center", position: "relative" }}>
          <Icons.bell size={16} />
          <span style={{
            position: "absolute", top: 7, right: 8, width: 7, height: 7, borderRadius: 999,
            background: "var(--ps-warning)", border: "2px solid var(--bg)",
          }} />
        </button>
      </div>
    </header>
  );
}

// ─── KPI Stat Card ──────────────────────────────────────────────
function StatCard({ label, value, delta, deltaPositive, sub, sparkline, icon: Icon, accent, large }) {
  return (
    <div className="ps-card" style={{ padding: large ? 20 : 16, display: "flex", flexDirection: "column", gap: large ? 14 : 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: accent === "violet" ? "var(--brand-soft)" : accent === "mint" ? "var(--ps-mint-50)" : "var(--surface-2)",
            color: accent === "violet" ? "var(--brand)" : accent === "mint" ? "var(--ps-mint-700)" : "var(--text-2)",
            display: "grid", placeItems: "center", flex: "0 0 auto",
          }}><Icon size={14} /></div>}
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>{label}</div>
        </div>
        {delta && (
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 11, fontWeight: 600,
            color: deltaPositive ? "var(--ps-success)" : "var(--ps-danger)",
            padding: "2px 6px", borderRadius: 999,
            background: deltaPositive ? "var(--ps-success-bg)" : "var(--ps-danger-bg)",
          }}>
            {deltaPositive ? <Icons.trend_up size={10} sw={2.5} /> : <Icons.trend_dn size={10} sw={2.5} />}
            <span className="ps-num">{delta}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div className="ps-num" style={{ fontSize: large ? 32 : 26, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1 }}>{value}</div>
        {sparkline && <Sparkline points={sparkline} positive={deltaPositive} />}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

function Sparkline({ points, positive, width = 80, height = 24 }) {
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const color = positive === false ? "var(--ps-danger)" : "var(--brand)";
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <path d={`${path} L${width} ${height} L0 ${height} Z`} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────
function Avatar({ name, size = 28, color, src }) {
  const initials = (name || "?").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const palette = [
    ["#FFD074", "#FF9E5E", "#5a2a00"],
    ["#B59FFF", "#7C5BF5", "#28195D"],
    ["#7FDDB8", "#2EB888", "#0a3a2a"],
    ["#FFC4D9", "#FF7AA2", "#5a1030"],
    ["#A8C7FF", "#5E8EFF", "#0c2c60"],
  ];
  const seed = (name || "").charCodeAt(0) || 0;
  const c = palette[seed % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: color || `linear-gradient(135deg, ${c[0]}, ${c[1]})`,
      color: c[2],
      display: "grid", placeItems: "center",
      fontSize: size * 0.36, fontWeight: 700,
      flex: "0 0 auto",
    }}>{initials}</div>
  );
}

// ─── Section header ─────────────────────────────────────────────
function SectionHead({ title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
        {sub && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
      </div>
      {right && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{right}</div>}
    </div>
  );
}

// ─── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    confirmed: { tone: "success", label: "Confirmed", dot: "var(--ps-success)" },
    pending:   { tone: "warning", label: "Pending", dot: "var(--ps-warning)" },
    canceled:  { tone: "danger", label: "Canceled", dot: "var(--ps-danger)" },
    paid:      { tone: "success", label: "Paid", dot: "var(--ps-success)" },
    failed:    { tone: "danger", label: "Failed", dot: "var(--ps-danger)" },
    active:    { tone: "violet", label: "Active", dot: "var(--brand)" },
    draft:     { tone: "info", label: "Draft", dot: "var(--ps-info)" },
  };
  const s = map[status] || { tone: "info", label: status, dot: "var(--text-3)" };
  return (
    <span className={`ps-chip ps-chip-${s.tone}`}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot }} />
      {s.label}
    </span>
  );
}

Object.assign(window, { Ic, Icons, PSShell, PSSidebar, PSTopbar, PSLogo, StatCard, Sparkline, Avatar, SectionHead, StatusBadge });
