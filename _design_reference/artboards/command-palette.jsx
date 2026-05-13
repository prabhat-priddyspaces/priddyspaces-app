// command-palette.jsx — dashboard with the ⌘K command palette open
function CommandPaletteArtboard({ theme = "light" }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Dimmed dashboard underneath */}
      <div style={{ filter: "blur(2px)", pointerEvents: "none", width: "100%", height: "100%" }}>
        <OwnerDashboardPopulated theme={theme} />
      </div>

      {/* Dim overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: theme === "dark" ? "rgba(7, 6, 26, 0.55)" : "rgba(16, 10, 31, 0.35)",
        backdropFilter: "blur(2px)",
      }} />

      {/* Palette */}
      <div style={{
        position: "absolute", top: 110, left: "50%", transform: "translateX(-50%)",
        width: 580, maxWidth: "90%",
      }} className={`ps theme-${theme}`}>
        <div className="ps-card" style={{
          boxShadow: "0 30px 80px rgba(40,25,93,0.4), 0 8px 24px rgba(40,25,93,0.2)",
          padding: 0, overflow: "hidden",
          background: "var(--surface)",
        }}>
          {/* Search input */}
          <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid var(--line)", gap: 12 }}>
            <Icons.search size={18} color="var(--text-3)" />
            <input style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 16, fontFamily: "var(--f-sans)", color: "var(--text)",
            }} placeholder="Search bookings, members, settings…" defaultValue="approve" />
            <span className="ps-kbd">esc</span>
          </div>

          {/* Active filter chips */}
          <div style={{ padding: "8px 18px", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scope</span>
            <span className="ps-chip ps-chip-violet" style={{ height: 22 }}>All locations <Icons.chev_d size={10} /></span>
            <span className="ps-chip" style={{ height: 22 }}>This week <Icons.chev_d size={10} /></span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>14 results</span>
          </div>

          {/* Results */}
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <Group label="Quick actions">
              <Item icon={Icons.check} title="Approve all pending requests" sub="4 pending · auto-charge cards" kbd={["A"]} active />
              <Item icon={Icons.plus} title="New booking" sub="Pick a member, space, and time" kbd={["⌘", "N"]} />
              <Item icon={Icons.mail} title="Message all members in pending" sub="4 recipients" />
            </Group>

            <Group label="Pending requests">
              <Item icon={Icons.inbox} title="Maya Chen · Riverside 3 · Today 2pm" sub="$120 · Pending 18m" badge={{ label: "Pending", tone: "warning" }} />
              <Item icon={Icons.inbox} title="Ben Larkin · Day pass · Tomorrow" sub="$196 · 4 desks · Atlas Labs" badge={{ label: "Pending", tone: "warning" }} />
            </Group>

            <Group label="Navigation">
              <Item icon={Icons.calendar} title="Go to Calendar" kbd={["G", "C"]} />
              <Item icon={Icons.chart} title="Go to Analytics" kbd={["G", "A"]} />
              <Item icon={Icons.settings} title="Go to Settings → Pricing rules" />
            </Group>

            <Group label="Help">
              <Item icon={Icons.sparkle} title="Ask the assistant: 'approve requests under $200 from returning members'" ai />
            </Group>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "10px 18px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
            fontSize: 11, color: "var(--text-3)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="ps-kbd">↑↓</span> Navigate
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="ps-kbd">↵</span> Select
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="ps-kbd">⌘</span><span className="ps-kbd">↵</span> Open in new tab
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Icons.sparkle size={11} color="var(--brand)" /> Powered by Priddy AI
            </span>
          </div>
        </div>

        {/* Hint */}
        <div style={{
          marginTop: 16, textAlign: "center",
          fontSize: 12, color: theme === "dark" ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.85)",
        }}>
          Press <span className="ps-kbd" style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.2)" }}>⌘K</span> anywhere to open
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }) {
  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 18px 6px" }}>{label}</div>
      {children}
    </div>
  );
}

function Item({ icon: Icon, title, sub, kbd, badge, active, ai }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 18px",
      background: active ? "var(--brand-soft)" : "transparent",
      cursor: "pointer",
      borderLeft: active ? "3px solid var(--brand)" : "3px solid transparent",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: ai ? "linear-gradient(135deg, var(--ps-violet-300), var(--brand))" : active ? "var(--brand)" : "var(--surface-2)",
        color: active || ai ? "#fff" : "var(--text-2)",
        display: "grid", placeItems: "center", flex: "0 0 auto",
      }}>
        <Icon size={14} sw={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      {badge && <span className={`ps-chip ps-chip-${badge.tone}`}>{badge.label}</span>}
      {kbd && (
        <div style={{ display: "flex", gap: 3 }}>
          {kbd.map((k, i) => <span key={i} className="ps-kbd">{k}</span>)}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CommandPaletteArtboard });
