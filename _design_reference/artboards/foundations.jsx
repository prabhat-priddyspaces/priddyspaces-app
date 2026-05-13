// foundations.jsx — System brand · type · color · components
function FoundationsArtboard({ theme = "light" }) {
  return (
    <div className={`ps theme-${theme}`} style={{
      width: "100%", height: "100%",
      background: "var(--bg)", color: "var(--text)",
      padding: 40, overflow: "auto",
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32,
    }}>
      {/* —— Left: brand + type —————————————————————— */}
      <div>
        {/* Brand */}
        <div className="ps-card" style={{ padding: 28, marginBottom: 20, position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 100% 0%, var(--brand-soft) 0%, transparent 50%)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <PSLogo size={48} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Priddyspaces</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Coworking & space booking · 2026</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55, maxWidth: 420 }}>
              A premium, multi-tenant SaaS for managing workspaces, members and bookings.
              The system favors calm violet, generous radius, and a tight typographic hierarchy.
            </div>
          </div>
        </div>

        {/* Type scale */}
        <div className="ps-card" style={{ padding: 24, marginBottom: 20 }}>
          <SectionHead title="Type · Geist" sub="Display 48 → Caption 11. Numeric uses tabular figures." />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Display", 48, 600, "Spaces, simplified."],
              ["H1", 36, 600, "Today across your portfolio"],
              ["H2", 28, 600, "Plantation HQ"],
              ["H3", 22, 600, "Approve booking request"],
              ["H4", 19, 600, "Pricing rules"],
              ["Body", 14, 400, "Approve, deny, or retry payment from a single inbox."],
              ["Small", 13, 400, "12301 West Sunrise Boulevard · Plantation, FL"],
              ["Caption", 11, 500, "MTD REVENUE"],
            ].map(([label, size, weight, sample]) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 16, paddingBottom: 8, borderBottom: "1px dashed var(--line)" }}>
                <div style={{ width: 60, fontSize: 11, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontSize: size, fontWeight: weight, letterSpacing: size > 24 ? "-0.025em" : "-0.005em", lineHeight: 1.1, flex: 1 }}>{sample}</div>
                <div className="ps-num" style={{ fontSize: 10, color: "var(--text-4)" }}>{size}px / {weight}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Spacing */}
        <div className="ps-card" style={{ padding: 24 }}>
          <SectionHead title="Spacing · 4px base" sub="4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
            {[4, 8, 12, 16, 20, 24, 32, 40, 48, 64].map(s => (
              <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                <div style={{ width: s, height: s, background: "var(--brand)", borderRadius: 3 }} />
                <div className="ps-num" style={{ fontSize: 10, color: "var(--text-3)" }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* —— Right: color + components —————————————————— */}
      <div>
        {/* Color palette */}
        <div className="ps-card" style={{ padding: 24, marginBottom: 20 }}>
          <SectionHead title="Color · Violet primary, mint accent" sub="WCAG-AA contrast on all text pairings." />
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Brand · Violet</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 4, borderRadius: 10, overflow: "hidden" }}>
              {[100,200,300,400,500,600,700,800,900].map(n => (
                <div key={n} style={{ height: 48, background: `var(--ps-violet-${n})`, position: "relative" }}>
                  <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 9, color: n >= 500 ? "#fff" : "var(--text)", fontFamily: "var(--f-mono)" }}>{n}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Accent · Mint</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, borderRadius: 10, overflow: "hidden" }}>
              {[50,100,300,500,700].map(n => (
                <div key={n} style={{ height: 32, background: `var(--ps-mint-${n})`, position: "relative" }}>
                  <div style={{ position: "absolute", bottom: 4, left: 6, fontSize: 9, color: n >= 500 ? "#fff" : "var(--text)", fontFamily: "var(--f-mono)" }}>{n}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Semantic</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {[
                ["Success", "var(--ps-success)", "var(--ps-success-bg)"],
                ["Warning", "var(--ps-warning)", "var(--ps-warning-bg)"],
                ["Danger", "var(--ps-danger)", "var(--ps-danger-bg)"],
                ["Info", "var(--ps-info)", "var(--ps-info-bg)"],
              ].map(([n, fg, bg]) => (
                <div key={n} style={{ borderRadius: 8, padding: 8, background: bg, color: fg, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: fg }} />{n}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Components */}
        <div className="ps-card" style={{ padding: 24, marginBottom: 20 }}>
          <SectionHead title="Buttons" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <button className="ps-btn ps-btn-primary"><Icons.plus size={14} />New booking</button>
            <button className="ps-btn">Cancel</button>
            <button className="ps-btn ps-btn-ghost">Ghost</button>
            <button className="ps-btn ps-btn-primary ps-btn-sm">Small</button>
            <button className="ps-btn ps-btn-lg"><Icons.sparkle size={16} />Ask assistant</button>
          </div>
          <SectionHead title="Inputs & chips" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <input className="ps-input" placeholder="Search member or space…" />
            <div className="ps-input" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)" }}>
              <Icons.calendar size={14} /> May 13, 2026
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <StatusBadge status="confirmed" />
            <StatusBadge status="pending" />
            <StatusBadge status="canceled" />
            <StatusBadge status="paid" />
            <StatusBadge status="active" />
            <span className="ps-chip ps-chip-violet"><Icons.wifi size={11} sw={2} /> WiFi</span>
            <span className="ps-chip ps-chip-violet"><Icons.coffee size={11} sw={2} /> Coffee</span>
          </div>
        </div>

        {/* Cards preview */}
        <div className="ps-card" style={{ padding: 24 }}>
          <SectionHead title="Cards · radii · shadow" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <StatCard label="MTD Revenue" value="$48,260" delta="+12.4%" deltaPositive
              icon={Icons.dollar} accent="violet" sparkline={[3,5,4,7,6,8,9,11,10,13]} />
            <StatCard label="Occupancy" value="76%" delta="+4.1%" deltaPositive
              icon={Icons.building} accent="mint" sub="Last 30 days" />
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FoundationsArtboard });
