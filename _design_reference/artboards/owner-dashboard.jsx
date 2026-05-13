// owner-dashboard.jsx — populated + empty states
function OwnerDashboardPopulated({ theme = "light" }) {
  return (
    <PSShell theme={theme} sidebar="owner"
      title="Dashboard"
      breadcrumb={["Owner", "Plantation HQ"]}
      badge={{ label: "Live · Plantation HQ", tone: "mint" }}
      actions={<>
        <button className="ps-btn"><Icons.calendar size={14} /> Last 30 days <Icons.chev_d size={12} /></button>
        <button className="ps-btn ps-btn-primary"><Icons.plus size={14} /> New booking</button>
      </>}>

      {/* Hero strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Good morning, Jane.</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            4 requests waiting · 12 bookings today · occupancy peaking at 2pm.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="ps-chip ps-chip-violet"><Icons.sparkle size={11} sw={2.5} /> AI summary ready</span>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="MTD Revenue" value="$48,260" delta="+12.4%" deltaPositive
          icon={Icons.dollar} accent="violet" sparkline={[3,5,4,7,6,8,9,11,10,13,12,14]} sub="vs. $42.9k last month" />
        <StatCard label="Bookings" value="284" delta="+8.0%" deltaPositive
          icon={Icons.calendar} accent="violet" sparkline={[10,12,11,14,13,16,15,18]} sub="63 booked this week" />
        <StatCard label="Occupancy" value="76%" delta="+4.1%" deltaPositive
          icon={Icons.building} accent="mint" sparkline={[6,5,7,8,7,9,10,9,11,10]} sub="Peak 2pm-4pm Wed" />
        <StatCard label="Active members" value="142" delta="-1.4%" deltaPositive={false}
          icon={Icons.users} sparkline={[14,15,14,16,15,14,13,14]} sub="3 churned this month" />
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
        {/* Today timeline */}
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Today · 5 locations · 18 rooms"
            sub="Wed, May 13 — 11:24am"
            right={<>
              <button className="ps-btn ps-btn-sm ps-btn-ghost">Day</button>
              <button className="ps-btn ps-btn-sm">Week</button>
              <button className="ps-btn ps-btn-sm ps-btn-ghost">Month</button>
              <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center" }}><Icons.filter size={13} /></button>
            </>} />
          <TimelineMini />
        </div>

        {/* Requests inbox */}
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Pending requests"
            sub="4 waiting · oldest 18m"
            right={<button className="ps-btn ps-btn-sm ps-btn-ghost">Open inbox <Icons.arrow_r size={12} /></button>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { name: "Maya Chen", company: "Northwind Studio", space: "Conf · Riverside 3", at: "Today · 2:00–4:00pm", value: "$120", new: true },
              { name: "Ben Larkin", company: "Atlas Labs", space: "Day pass · 4 desks", at: "Tomorrow", value: "$196", new: true },
              { name: "Priya Shah", company: "Foundry Co.", space: "Private office · 12B", at: "May 16 · all day", value: "$320" },
              { name: "Carlos Vela", company: "Loop", space: "Conf · Coral Springs", at: "May 17 · 9–11am", value: "$110" },
            ].map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 4px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}>
                <Avatar name={r.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                    {r.new && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--brand)" }} />}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.space} · {r.at}
                  </div>
                </div>
                <div className="ps-num" style={{ fontSize: 13, fontWeight: 600 }}>{r.value}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="ps-btn ps-btn-sm" style={{ height: 26, width: 26, padding: 0, justifyContent: "center", borderColor: "var(--ps-success)", color: "var(--ps-success)" }}>
                    <Icons.check size={13} sw={2.5} />
                  </button>
                  <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ height: 26, width: 26, padding: 0, justifyContent: "center" }}>
                    <Icons.x size={13} sw={2.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue chart */}
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Revenue · last 30 days"
            sub="Net of refunds & platform fees"
            right={<>
              <span className="ps-chip ps-chip-violet" style={{ background: "transparent", padding: 0, color: "var(--text-3)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--brand)" }} /> Bookings
              </span>
              <span className="ps-chip" style={{ background: "transparent", padding: 0, color: "var(--text-3)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ps-mint-500)" }} /> Memberships
              </span>
            </>} />
          <RevenueChart />
          <div style={{ display: "flex", gap: 24, paddingTop: 14, borderTop: "1px solid var(--line)", marginTop: 12 }}>
            <Stat tiny label="Gross" value="$52,840" />
            <Stat tiny label="Refunded" value="$1,420" />
            <Stat tiny label="Platform fees" value="$3,160" />
            <Stat tiny label="Owner net" value="$48,260" highlight />
          </div>
        </div>

        {/* Locations */}
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Locations" sub="5 active · 1 onboarding"
            right={<button className="ps-btn ps-btn-sm ps-btn-ghost">Manage <Icons.arrow_r size={12} /></button>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { name: "Plantation HQ", city: "Plantation, FL", occ: 0.82, rooms: 6, today: 12 },
              { name: "Coral Springs", city: "Coral Springs, FL", occ: 0.64, rooms: 4, today: 8 },
              { name: "Brickell Commons", city: "Miami, FL", occ: 0.91, rooms: 8, today: 18 },
              { name: "Riverside Annex", city: "Plantation, FL", occ: 0.48, rooms: 3, today: 5 },
              { name: "West Lauderdale", city: "Lauderdale, FL", occ: 0.21, rooms: 5, today: 2, onboarding: true },
            ].map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                    {l.name}
                    {l.onboarding && <span className="ps-chip" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>Onboarding</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{l.city} · {l.rooms} rooms</div>
                </div>
                <div>
                  <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${l.occ * 100}%`, height: "100%", background: l.occ > 0.8 ? "var(--ps-success)" : l.occ > 0.5 ? "var(--brand)" : "var(--text-4)", borderRadius: 99 }} />
                  </div>
                  <div className="ps-num" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{Math.round(l.occ * 100)}% occ</div>
                </div>
                <div className="ps-num" style={{ fontSize: 12, color: "var(--text-2)", textAlign: "right" }}>{l.today} today</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PSShell>
  );
}

function Stat({ label, value, highlight, tiny }) {
  return (
    <div>
      <div style={{ fontSize: tiny ? 10 : 11, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="ps-num" style={{ fontSize: tiny ? 16 : 22, fontWeight: 600, color: highlight ? "var(--brand)" : "var(--text)", marginTop: 2, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function TimelineMini() {
  const rooms = [
    { name: "Riverside 3", type: "Conf", events: [{ s: 0.08, w: 0.12, name: "Std Up", tone: "violet" }, { s: 0.25, w: 0.13, name: "Maya Chen", tone: "pending" }, { s: 0.5, w: 0.18, name: "Atlas weekly", tone: "mint" }] },
    { name: "Plantation 1", type: "Open", events: [{ s: 0.0, w: 0.4, name: "Day pass · 8 desks", tone: "mint" }, { s: 0.55, w: 0.3, name: "—", tone: "muted" }] },
    { name: "Coral 12B", type: "Office", events: [{ s: 0.0, w: 0.95, name: "Foundry Co. · monthly", tone: "violet" }] },
    { name: "Brickell A", type: "Conf", events: [{ s: 0.12, w: 0.08, name: "—", tone: "muted" }, { s: 0.3, w: 0.12, name: "Loop sync", tone: "violet" }, { s: 0.6, w: 0.2, name: "Workshop", tone: "violet" }] },
    { name: "Plantation 2", type: "Conf", events: [{ s: 0.4, w: 0.15, name: "Sales QBR", tone: "violet" }, { s: 0.7, w: 0.15, name: "Interview", tone: "warning" }] },
    { name: "Riverside 4", type: "Conf", events: [{ s: 0.05, w: 0.1, name: "Standup", tone: "violet" }, { s: 0.65, w: 0.1, name: "Vendor demo", tone: "mint" }] },
  ];
  const hours = ["8a", "10a", "12p", "2p", "4p", "6p"];
  const toneMap = {
    violet: ["var(--ps-violet-100)", "var(--ps-violet-700)", "var(--brand)"],
    mint: ["var(--ps-mint-100)", "var(--ps-mint-700)", "var(--ps-mint-500)"],
    pending: ["var(--ps-warning-bg)", "var(--ps-warning)", "var(--ps-warning)"],
    warning: ["var(--ps-warning-bg)", "var(--ps-warning)", "var(--ps-warning)"],
    muted: ["var(--surface-2)", "var(--text-4)", "var(--text-4)"],
  };
  return (
    <div>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 6 }}>
        <div />
        <div style={{ position: "relative", height: 16 }}>
          {hours.map((h, i) => (
            <div key={h} className="ps-num" style={{
              position: "absolute", left: `${(i / (hours.length - 1)) * 100}%`,
              transform: "translateX(-50%)",
              fontSize: 10, color: "var(--text-3)",
            }}>{h}</div>
          ))}
          {/* Now line */}
          <div style={{
            position: "absolute", left: "37%", top: 16, height: rooms.length * 36, width: 2, background: "var(--brand)", zIndex: 2, opacity: 0.6,
          }} />
        </div>
      </div>
      {rooms.map((r, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 4 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.type}</div>
          </div>
          <div style={{ position: "relative", height: 32, background: "var(--surface-2)", borderRadius: 8, overflow: "hidden" }}>
            {/* Gridlines */}
            {[0.2, 0.4, 0.6, 0.8].map(p => (
              <div key={p} style={{ position: "absolute", left: `${p * 100}%`, top: 0, bottom: 0, width: 1, background: "var(--bg)" }} />
            ))}
            {r.events.map((e, ei) => {
              const [bg, fg] = toneMap[e.tone] || toneMap.muted;
              return (
                <div key={ei} style={{
                  position: "absolute",
                  left: `${e.s * 100}%`, width: `${e.w * 100}%`, top: 3, bottom: 3,
                  background: bg, color: fg,
                  borderRadius: 6,
                  fontSize: 10, fontWeight: 600,
                  display: "flex", alignItems: "center", padding: "0 8px",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  borderLeft: `3px solid ${toneMap[e.tone]?.[2] || "var(--text-4)"}`,
                }}>{e.name}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RevenueChart() {
  const days = 30;
  const data = Array.from({ length: days }, (_, i) => {
    const trend = 800 + i * 50;
    const wobble = Math.sin(i * 0.7) * 400 + Math.cos(i * 1.3) * 200;
    return { bookings: Math.max(200, trend + wobble), members: 600 + Math.sin(i * 0.3) * 150 + i * 6 };
  });
  const max = Math.max(...data.map(d => d.bookings + d.members));
  const w = 100, h = 140;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="bookingsGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="memberGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ps-mint-500)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--ps-mint-500)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--line)" strokeWidth="0.3" strokeDasharray="0.5 1" vectorEffect="non-scaling-stroke" />
      ))}
      {/* Memberships baseline area */}
      <path d={
        `M0,${h - (data[0].members / max) * h} ` +
        data.map((d, i) => `L${(i / (days - 1)) * w},${h - (d.members / max) * h}`).join(" ") +
        ` L${w},${h} L0,${h} Z`
      } fill="url(#memberGrad)" />
      <path d={
        `M0,${h - (data[0].members / max) * h} ` +
        data.map((d, i) => `L${(i / (days - 1)) * w},${h - (d.members / max) * h}`).join(" ")
      } fill="none" stroke="var(--ps-mint-500)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {/* Bookings area on top */}
      <path d={
        `M0,${h - ((data[0].bookings + data[0].members) / max) * h} ` +
        data.map((d, i) => `L${(i / (days - 1)) * w},${h - ((d.bookings + d.members) / max) * h}`).join(" ") +
        ` L${w},${h - (data[data.length - 1].members / max) * h} ` +
        data.slice().reverse().map((d, i) => `L${((days - 1 - i) / (days - 1)) * w},${h - (d.members / max) * h}`).join(" ") +
        ` Z`
      } fill="url(#bookingsGrad)" />
      <path d={
        `M0,${h - ((data[0].bookings + data[0].members) / max) * h} ` +
        data.map((d, i) => `L${(i / (days - 1)) * w},${h - ((d.bookings + d.members) / max) * h}`).join(" ")
      } fill="none" stroke="var(--brand)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ───────────── Empty / onboarding state ─────────────
function OwnerDashboardEmpty({ theme = "light" }) {
  return (
    <PSShell theme={theme} sidebar="owner"
      title="Dashboard"
      breadcrumb={["Owner", "Plantation HQ"]}
      badge={{ label: "Onboarding", tone: "warning" }}
      actions={<>
        <button className="ps-btn"><Icons.sparkle size={14} /> Tour</button>
        <button className="ps-btn ps-btn-primary"><Icons.plus size={14} /> Add location</button>
      </>}>

      {/* Welcome */}
      <div className="ps-card" style={{
        padding: 32, marginBottom: 20,
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, var(--brand-soft) 0%, transparent 60%), var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "linear-gradient(135deg, var(--brand) 0%, var(--ps-violet-700) 100%)",
            display: "grid", placeItems: "center", flex: "0 0 auto",
            boxShadow: "0 8px 24px rgba(124,91,245,.35)",
          }}>
            <Icons.sparkle size={24} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Welcome to Priddyspaces, Jane.</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4, maxWidth: 600 }}>
              You're 4 steps from going live. We'll connect Stripe last so your first booking can pay.
            </div>
          </div>
          <button className="ps-btn ps-btn-primary ps-btn-lg">Continue setup <Icons.arrow_r size={16} /></button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 28 }}>
          {[
            { done: true, label: "Account" },
            { done: true, label: "Organization" },
            { done: false, current: true, label: "First location" },
            { done: false, label: "Add a room" },
            { done: false, label: "Connect Stripe" },
            { done: false, label: "Invite team" },
          ].map((s, i, arr) => (
            <React.Fragment key={i}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: s.done ? "var(--brand)" : s.current ? "var(--surface)" : "var(--surface-2)",
                  border: s.current ? "2px solid var(--brand)" : "2px solid transparent",
                  display: "grid", placeItems: "center",
                  color: s.done ? "#fff" : "var(--brand)",
                  boxShadow: s.current ? "0 0 0 4px var(--brand-soft)" : "none",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {s.done ? <Icons.check size={12} sw={3} /> : i + 1}
                </div>
                <div style={{ fontSize: 11, color: s.current ? "var(--text)" : "var(--text-3)", fontWeight: s.current ? 600 : 500, whiteSpace: "nowrap" }}>{s.label}</div>
              </div>
              {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: s.done ? "var(--brand)" : "var(--line-strong)", marginBottom: 18 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Onboarding cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { icon: Icons.pin, title: "Add your first location", body: "Address, hours, amenities — the public marketplace pulls from this.", cta: "Add location", primary: true, est: "~ 3 min" },
          { icon: Icons.box, title: "Set up rooms or desks", body: "Pricing per hour / day / month, capacity, photos, buffer time.", cta: "Add a room", est: "~ 5 min" },
          { icon: Icons.card, title: "Connect Stripe", body: "Accept bookings and run subscriptions through your own Stripe account.", cta: "Connect Stripe", est: "~ 2 min" },
        ].map((s, i) => (
          <div key={i} className="ps-card" style={{
            padding: 20,
            border: s.primary ? "1px solid var(--brand)" : "1px solid var(--line)",
            boxShadow: s.primary ? "0 0 0 3px var(--brand-soft)" : undefined,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "var(--brand-soft)", color: "var(--brand)",
              display: "grid", placeItems: "center", marginBottom: 14,
            }}><s.icon size={18} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>{s.body}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button className={`ps-btn ps-btn-sm ${s.primary ? "ps-btn-primary" : ""}`}>{s.cta}</button>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{s.est}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quiet KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          ["MTD Revenue", "$0", Icons.dollar, "Connect Stripe to track"],
          ["Bookings", "0", Icons.calendar, "Add a room to start"],
          ["Occupancy", "—", Icons.building, "We'll start measuring once you go live"],
          ["Active members", "0", Icons.users, "Invite or migrate"],
        ].map(([l, v, I, sub]) => (
          <div key={l} className="ps-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--surface-2)", color: "var(--text-3)", display: "grid", placeItems: "center" }}><I size={13} /></div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{l}</div>
            </div>
            <div className="ps-num" style={{ fontSize: 26, fontWeight: 600, color: "var(--text-4)", lineHeight: 1, letterSpacing: "-0.02em" }}>{v}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Resources */}
      <div className="ps-card" style={{ padding: 20 }}>
        <SectionHead title="While you're setting up"
          right={<button className="ps-btn ps-btn-sm ps-btn-ghost">Skip <Icons.x size={12} /></button>} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { icon: Icons.doc, title: "Import existing members", body: "Bring members from a CSV or Cobot export." },
            { icon: Icons.megaphone, title: "Publish to marketplace", body: "Your location appears at priddyspaces.com once live." },
            { icon: Icons.users, title: "Invite your team", body: "Owners, admins, staff — each with their own access." },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 10, background: "var(--surface-2)" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--surface)", color: "var(--text-2)", display: "grid", placeItems: "center", flex: "0 0 auto" }}><r.icon size={14} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>{r.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PSShell>
  );
}

Object.assign(window, { OwnerDashboardPopulated, OwnerDashboardEmpty, TimelineMini, RevenueChart, Stat });
