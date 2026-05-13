// owner-calendar.jsx — week + timeline calendar variants
function OwnerCalendar({ theme = "light", view = "week" }) {
  return (
    <PSShell theme={theme} sidebar="owner"
      title="Calendar"
      breadcrumb={["Owner", "Plantation HQ"]}
      actions={<>
        <button className="ps-btn ps-btn-sm"><Icons.filter size={12} /> Filters · 2</button>
        <button className="ps-btn"><Icons.arrow_l size={14} /></button>
        <button className="ps-btn"><Icons.calendar size={14} /> May 11 – 17 <Icons.chev_d size={12} /></button>
        <button className="ps-btn"><Icons.arrow_r size={14} /></button>
        <button className="ps-btn ps-btn-primary"><Icons.plus size={14} /> Booking</button>
      </>}>

      {/* View tabs + filters strip */}
      <div className="ps-card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--surface-2)", borderRadius: 10 }}>
          {["Day", "Week", "Month", "Timeline", "List"].map(v => (
            <button key={v} className="ps-btn ps-btn-sm" style={{
              height: 26, padding: "0 10px",
              background: v.toLowerCase() === view ? "var(--surface)" : "transparent",
              border: "1px solid transparent",
              boxShadow: v.toLowerCase() === view ? "var(--shadow-xs)" : "none",
              fontWeight: 600,
              color: v.toLowerCase() === view ? "var(--text)" : "var(--text-3)",
            }}>{v}</button>
          ))}
        </div>
        <div style={{ height: 18, width: 1, background: "var(--line)" }} />
        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Locations</div>
        <button className="ps-btn ps-btn-sm" style={{ height: 26 }}>All 5 <Icons.chev_d size={11} /></button>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</div>
        {["Meeting", "Day pass", "Office"].map(t => (
          <span key={t} className="ps-chip ps-chip-violet" style={{ background: t === "Meeting" ? "var(--brand-soft)" : "var(--surface-2)", color: t === "Meeting" ? "var(--brand-strong)" : "var(--text-2)" }}>{t}</span>
        ))}
        <div style={{ flex: 1 }} />
        <input className="ps-input" placeholder="Search member, company, room…" style={{ width: 240, height: 30, fontSize: 12 }} />
        <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center" }}><Icons.more size={14} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
        <div className="ps-card" style={{ padding: 18 }}>
          {view === "week" ? <WeekView /> : <DayTimeline />}
        </div>

        {/* Sidebar inspector */}
        <div className="ps-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Selected booking</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name="Maya Chen" size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Maya Chen</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Northwind Studio</div>
              </div>
              <StatusBadge status="confirmed" />
            </div>
          </div>

          <hr className="ps-divider" />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row icon={Icons.box} label="Riverside 3" sub="Conference · 4 seats" />
            <Row icon={Icons.calendar} label="Wed, May 13" sub="2:00 – 4:00 pm · 2h" />
            <Row icon={Icons.pin} label="Plantation HQ" sub="12301 W Sunrise Blvd" />
            <Row icon={Icons.dollar} label="$120.00" sub="Card on file · paid" />
            <Row icon={Icons.users} label="4 attendees" sub="2 guests · 2 members" />
          </div>

          <hr className="ps-divider" />

          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Note from member</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, padding: 10, background: "var(--surface-2)", borderRadius: 8 }}>
              "Demo of new product to a vendor — would love whiteboard ready if possible. Thanks!"
            </div>
          </div>

          <hr className="ps-divider" />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="ps-btn ps-btn-sm" style={{ justifyContent: "center" }}><Icons.mail size={13} /> Message member</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="ps-btn ps-btn-sm" style={{ flex: 1, justifyContent: "center" }}>Reschedule</button>
              <button className="ps-btn ps-btn-sm" style={{ flex: 1, justifyContent: "center", color: "var(--ps-danger)", borderColor: "var(--ps-danger-bg)" }}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </PSShell>
  );
}

function Row({ icon: Icon, label, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--text-3)", flex: "0 0 auto" }}><Icon size={14} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</div>}
      </div>
    </div>
  );
}

function WeekView() {
  const days = ["Mon 11", "Tue 12", "Wed 13", "Thu 14", "Fri 15", "Sat 16", "Sun 17"];
  const today = 2;
  // Hours 8a–8p
  const hours = Array.from({ length: 13 }, (_, i) => 8 + i);

  // Events: { day, start (hour), end, room, name, tone, member }
  const events = [
    { day: 0, s: 9, e: 10, name: "Standup", room: "Conf · Riverside 3", tone: "violet" },
    { day: 0, s: 14, e: 16, name: "Loop · weekly", room: "Brickell A", tone: "violet" },
    { day: 1, s: 10, e: 12, name: "Onboarding", room: "Plantation 2", tone: "mint" },
    { day: 1, s: 13, e: 15, name: "Day pass · 4", room: "Open floor", tone: "mint" },
    { day: 2, s: 9, e: 10, name: "Standup", room: "Riverside 3", tone: "violet" },
    { day: 2, s: 14, e: 16, name: "Maya Chen", room: "Riverside 3", tone: "pending", selected: true },
    { day: 2, s: 11, e: 13, name: "Foundry · monthly", room: "Coral 12B", tone: "violet" },
    { day: 3, s: 9, e: 11, name: "Sales QBR", room: "Plantation 2", tone: "violet" },
    { day: 3, s: 15, e: 16, name: "Interview", room: "Plantation 2", tone: "warning" },
    { day: 4, s: 10, e: 14, name: "All-hands", room: "Brickell A", tone: "violet" },
    { day: 4, s: 16, e: 17, name: "Vendor demo", room: "Riverside 4", tone: "mint" },
    { day: 5, s: 11, e: 13, name: "Workshop", room: "Plantation 1", tone: "violet" },
  ];

  const toneMap = {
    violet: ["rgba(124,91,245,.13)", "var(--brand)", "var(--brand-strong)"],
    mint: ["rgba(46,184,136,.13)", "var(--ps-mint-500)", "var(--ps-mint-700)"],
    pending: ["rgba(178,91,0,.13)", "var(--ps-warning)", "var(--ps-warning)"],
    warning: ["rgba(178,91,0,.13)", "var(--ps-warning)", "var(--ps-warning)"],
  };

  const dayStart = 8, dayEnd = 21; // 8a–9p
  const totalH = dayEnd - dayStart;

  return (
    <div>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "44px repeat(7, 1fr)", gap: 4, marginBottom: 6, position: "sticky", top: 0, background: "var(--surface)", paddingBottom: 6 }}>
        <div />
        {days.map((d, i) => (
          <div key={d} style={{ textAlign: "center", padding: "4px 0" }}>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{d.split(" ")[0]}</div>
            <div className="ps-num" style={{
              fontSize: 18, fontWeight: 600,
              color: i === today ? "var(--brand-fg)" : "var(--text)",
              background: i === today ? "var(--brand)" : "transparent",
              width: 30, height: 30, borderRadius: 8,
              display: "grid", placeItems: "center", margin: "2px auto 0",
              letterSpacing: "-0.02em",
            }}>{d.split(" ")[1]}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "44px repeat(7, 1fr)", gap: 4, position: "relative" }}>
        {/* Hour labels */}
        <div style={{ position: "relative" }}>
          {hours.map((h, i) => (
            <div key={h} className="ps-num" style={{ height: 36, fontSize: 10, color: "var(--text-3)", paddingTop: 2 }}>
              {h > 12 ? h - 12 : h}{h >= 12 ? "p" : "a"}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, di) => (
          <div key={di} style={{
            position: "relative",
            height: hours.length * 36,
            background: di === today ? "var(--brand-soft)" : "var(--surface-2)",
            borderRadius: 8,
            opacity: di === today ? 1 : 0.6,
          }}>
            {/* Hour rows */}
            {hours.map((h, i) => (
              <div key={h} style={{
                position: "absolute", top: i * 36, height: 36, left: 0, right: 0,
                borderTop: i === 0 ? "none" : "1px solid var(--bg)",
              }} />
            ))}
            {/* Now line on today */}
            {di === today && (
              <div style={{
                position: "absolute", left: -4, right: -4, top: (11.4 - dayStart) * 36, height: 2,
                background: "var(--brand)", zIndex: 5, borderRadius: 2,
              }}>
                <div style={{
                  position: "absolute", left: -6, top: -4, width: 10, height: 10, borderRadius: 999,
                  background: "var(--brand)", border: "2px solid var(--surface)",
                }} />
              </div>
            )}
            {/* Events */}
            {events.filter(e => e.day === di).map((e, ei) => {
              const [bg, accent, fg] = toneMap[e.tone];
              const top = (e.s - dayStart) * 36;
              const height = (e.e - e.s) * 36 - 2;
              return (
                <div key={ei} style={{
                  position: "absolute",
                  left: 4, right: 4, top, height,
                  background: bg,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 6,
                  padding: "5px 7px",
                  fontSize: 11,
                  overflow: "hidden",
                  outline: e.selected ? `2px solid ${accent}` : "none",
                  boxShadow: e.selected ? "0 4px 12px rgba(124,91,245,.2)" : "none",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.room}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayTimeline() {
  const rooms = [
    { name: "Riverside 3", type: "Conference · 4 seats", events: [{ s: 1, w: 1, name: "Standup", tone: "violet" }, { s: 6, w: 2, name: "Maya Chen", tone: "pending" }] },
    { name: "Plantation 1", type: "Open floor · 12 desks", events: [{ s: 0, w: 4, name: "Day pass · 8 desks", tone: "mint" }, { s: 5, w: 3, name: "Day pass · 4 desks", tone: "mint" }] },
    { name: "Plantation 2", type: "Conference · 8 seats", events: [{ s: 1, w: 2, name: "Sales QBR", tone: "violet" }, { s: 7, w: 1, name: "Interview", tone: "warning" }] },
    { name: "Coral 12B", type: "Private office · 4", events: [{ s: 0, w: 13, name: "Foundry Co. · monthly", tone: "violet" }] },
    { name: "Brickell A", type: "Conference · 12 seats", events: [{ s: 4, w: 1, name: "Loop sync", tone: "violet" }, { s: 8, w: 2, name: "Workshop", tone: "violet" }] },
    { name: "Riverside 4", type: "Conference · 6 seats", events: [{ s: 1, w: 1, name: "Standup", tone: "violet" }, { s: 9, w: 1, name: "Vendor demo", tone: "mint" }] },
    { name: "West A", type: "Hot desk · 8", events: [] },
  ];
  const hours = Array.from({ length: 14 }, (_, i) => 8 + i);
  const toneMap = {
    violet: ["rgba(124,91,245,.18)", "var(--brand)"],
    mint: ["rgba(46,184,136,.18)", "var(--ps-mint-500)"],
    pending: ["rgba(178,91,0,.18)", "var(--ps-warning)"],
    warning: ["rgba(178,91,0,.18)", "var(--ps-warning)"],
  };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Space</div>
        <div style={{ position: "relative", height: 18 }}>
          {hours.map((h, i) => (
            <div key={h} className="ps-num" style={{ position: "absolute", left: `${(i / (hours.length - 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 10, color: "var(--text-3)" }}>
              {h > 12 ? h - 12 : h}{h >= 12 ? "p" : "a"}
            </div>
          ))}
        </div>
      </div>
      {rooms.map((r, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, padding: "6px 0", borderTop: ri === 0 ? "1px solid var(--line)" : "1px solid var(--line)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.type}</div>
          </div>
          <div style={{ position: "relative", height: 30, background: "var(--surface-2)", borderRadius: 6 }}>
            {[2,4,6,8,10,12].map(i => (
              <div key={i} style={{ position: "absolute", left: `${(i / (hours.length - 1)) * 100}%`, top: 0, bottom: 0, width: 1, background: "var(--bg)" }} />
            ))}
            {/* Now */}
            <div style={{ position: "absolute", left: `${(3.4 / (hours.length - 1)) * 100}%`, top: -4, bottom: -4, width: 2, background: "var(--brand)", borderRadius: 2, zIndex: 3 }} />
            {r.events.map((e, ei) => {
              const left = (e.s / (hours.length - 1)) * 100;
              const width = (e.w / (hours.length - 1)) * 100;
              const [bg, fg] = toneMap[e.tone];
              return (
                <div key={ei} style={{
                  position: "absolute", left: `${left}%`, width: `${width}%`, top: 3, bottom: 3,
                  background: bg, color: fg,
                  borderRadius: 5,
                  fontSize: 10, fontWeight: 600,
                  display: "flex", alignItems: "center", padding: "0 8px",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  borderLeft: `3px solid ${fg}`,
                }}>{e.name}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { OwnerCalendar, WeekView, DayTimeline });
