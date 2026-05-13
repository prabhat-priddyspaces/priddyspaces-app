// mobile-owner.jsx — owner mobile screens: calendar, requests, analytics, locations, settings, members
//
// Renders 6 iOS device frames side-by-side.

function MobileOwnerSuite({ theme = "light" }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      gap: 28, padding: 28, alignContent: "start", justifyItems: "center",
    }}>
      <PhoneCard title="Calendar"><MobileOwnerCalendar theme={theme} /></PhoneCard>
      <PhoneCard title="Requests inbox"><MobileOwnerRequests theme={theme} /></PhoneCard>
      <PhoneCard title="Analytics"><MobileOwnerAnalytics theme={theme} /></PhoneCard>
      <PhoneCard title="Locations"><MobileOwnerLocations theme={theme} /></PhoneCard>
      <PhoneCard title="Settings"><MobileOwnerSettings theme={theme} /></PhoneCard>
      <PhoneCard title="Members directory"><MobileOwnerMembers theme={theme} /></PhoneCard>
    </div>
  );
}

function PhoneCard({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <IOSDevice width={340} height={720}>
        {children}
      </IOSDevice>
      <div style={{ fontSize: 11, color: "rgba(60,50,40,0.6)" }}>{title}</div>
    </div>
  );
}

function MobileShell({ theme, title, sub, right, children, nav = "home", bottomCTA }) {
  return (
    <div className={`ps theme-${theme}`} style={{ width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}>
          <Icons.arrow_l size={15} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 16px " + (bottomCTA ? "104px" : "76px") }}>
        {children}
      </div>
      {bottomCTA && (
        <div style={{
          position: "absolute", bottom: 64, left: 0, right: 0,
          padding: "12px 16px",
          background: "var(--bg-elev)",
          borderTop: "1px solid var(--line)",
          display: "flex", gap: 8,
        }}>
          {bottomCTA}
        </div>
      )}
      <OwnerMobileNav active={nav} />
    </div>
  );
}

function OwnerMobileNav({ active }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      background: "var(--bg-elev)",
      borderTop: "1px solid var(--line)",
      padding: "8px 8px 22px",
      display: "flex", gap: 0,
    }}>
      {[
        { id: "home", icon: Icons.home, label: "Home" },
        { id: "calendar", icon: Icons.calendar, label: "Calendar" },
        { id: "inbox", icon: Icons.inbox, label: "Inbox", badge: 4 },
        { id: "more", icon: Icons.more, label: "More" },
      ].map(it => (
        <div key={it.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: it.id === active ? "var(--brand)" : "var(--text-3)", position: "relative", padding: "4px 0" }}>
          <it.icon size={20} sw={it.id === active ? 2.2 : 1.6} />
          <span style={{ fontSize: 10, fontWeight: it.id === active ? 600 : 500 }}>{it.label}</span>
          {it.badge && <span style={{ position: "absolute", top: 0, right: "30%", width: 14, height: 14, borderRadius: 999, background: "var(--ps-warning)", color: "#fff", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center" }}>{it.badge}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────
function MobileOwnerCalendar({ theme }) {
  const days = ["Mon 11", "Tue 12", "Wed 13", "Thu 14", "Fri 15", "Sat 16", "Sun 17"];
  const today = 2;
  return (
    <MobileShell theme={theme} title="Calendar" sub="May 11 – 17" nav="calendar"
      right={<button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.filter size={14} /></button>}>
      <div style={{ display: "flex", gap: 4, padding: "4px 0 8px", overflowX: "auto" }}>
        {days.map((d, i) => {
          const [day, num] = d.split(" ");
          const isToday = i === today;
          return (
            <div key={d} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              padding: "8px 0", borderRadius: 10, flex: "0 0 40px",
              background: isToday ? "var(--brand)" : "transparent",
              color: isToday ? "#fff" : "var(--text-2)",
            }}>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", opacity: isToday ? 0.8 : 0.6 }}>{day}</span>
              <span className="ps-num" style={{ fontSize: 15, fontWeight: 600 }}>{num}</span>
              {!isToday && i === 1 && <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--brand)", marginTop: 2 }} />}
              {!isToday && i === 4 && <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--brand)", marginTop: 2 }} />}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", padding: "6px 0 10px" }}>Wed, May 13 · 12 bookings</div>

      {[
        { time: "9:00", dur: "1h", name: "Standup", room: "Riverside 3", tone: "violet", who: "MC + 3" },
        { time: "11:00", dur: "2h", name: "Foundry · monthly review", room: "Coral 12B", tone: "violet", who: "PS + 4" },
        { time: "14:00", dur: "2h", name: "Maya Chen", room: "Riverside 3", tone: "pending", who: "Pending approval" },
        { time: "15:00", dur: "1h", name: "Sales QBR", room: "Plantation 2", tone: "violet", who: "JM + 5" },
        { time: "16:00", dur: "1h", name: "Vendor demo", room: "Riverside 4", tone: "mint", who: "CV + 2" },
        { time: "17:00", dur: "1h", name: "Interview", room: "Plantation 2", tone: "warning", who: "BL · 1:1" },
      ].map((e, i) => {
        const toneFg = e.tone === "violet" ? "var(--brand)" : e.tone === "mint" ? "var(--ps-mint-500)" : "var(--ps-warning)";
        return (
          <div key={i} className="ps-card" style={{ padding: 12, marginBottom: 6, display: "grid", gridTemplateColumns: "44px 4px 1fr auto", gap: 10, alignItems: "center" }}>
            <div>
              <div className="ps-num" style={{ fontSize: 13, fontWeight: 600 }}>{e.time}</div>
              <div className="ps-num" style={{ fontSize: 10, color: "var(--text-3)" }}>{e.dur}</div>
            </div>
            <div style={{ width: 4, alignSelf: "stretch", background: toneFg, borderRadius: 99 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.room} · {e.who}</div>
            </div>
            <Icons.chev_r size={14} color="var(--text-4)" />
          </div>
        );
      })}
    </MobileShell>
  );
}

// ─── Requests ────────────────────────────────────────────────
function MobileOwnerRequests({ theme }) {
  return (
    <MobileShell theme={theme} title="Requests" sub="4 pending" nav="inbox"
      right={<button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.filter size={14} /></button>}>
      <div style={{ display: "flex", gap: 4, padding: "6px 0 12px", overflowX: "auto" }}>
        {[
          { l: "Pending", c: 4, on: true, tone: "warning" },
          { l: "Approved", c: 18 },
          { l: "Failed", c: 1, tone: "danger" },
          { l: "Rejected", c: 2 },
        ].map((t, i) => (
          <button key={i} className="ps-chip" style={{
            height: 28, padding: "0 12px", flex: "0 0 auto",
            background: t.on ? "var(--brand-soft)" : "var(--surface)",
            color: t.on ? "var(--brand-strong)" : "var(--text-2)",
            border: t.on ? "1px solid var(--brand)" : "1px solid var(--line)",
            fontWeight: t.on ? 600 : 500, cursor: "pointer",
          }}>
            {t.l}
            <span style={{
              padding: "1px 6px", borderRadius: 999, fontSize: 10,
              background: t.on ? "var(--brand)" : t.tone === "danger" ? "var(--ps-danger-bg)" : "var(--surface-2)",
              color: t.on ? "#fff" : t.tone === "danger" ? "var(--ps-danger)" : "var(--text-3)",
            }}>{t.c}</span>
          </button>
        ))}
      </div>

      {[
        { name: "Maya Chen", company: "Northwind Studio", space: "Conf · Riverside 3", time: "Today · 2pm – 4pm", value: "$120", urgent: true },
        { name: "Ben Larkin", company: "Atlas Labs", space: "Day pass · 4 desks", time: "Tomorrow", value: "$196" },
        { name: "Priya Shah", company: "Foundry Co.", space: "Office 12B · all day", time: "May 16", value: "$320" },
        { name: "Carlos Vela", company: "Loop", space: "Conf · Coral Springs", time: "May 17 · 9–11am", value: "$110" },
      ].map((r, i) => (
        <div key={i} className="ps-card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Avatar name={r.name} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                {r.urgent && <span className="ps-chip ps-chip-warning" style={{ height: 16, fontSize: 9, padding: "0 5px" }}>Today</span>}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.company}</div>
            </div>
            <div className="ps-num" style={{ fontSize: 14, fontWeight: 600 }}>{r.value}</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-2)", paddingLeft: 0, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><Icons.box size={11} color="var(--text-3)" /> {r.space}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><Icons.clock size={11} color="var(--text-3)" /> {r.time}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="ps-btn ps-btn-sm" style={{ flex: 1, justifyContent: "center", height: 32, background: "var(--ps-success)", color: "#fff", borderColor: "var(--ps-success)" }}>
              <Icons.check size={13} sw={2.5} /> Approve
            </button>
            <button className="ps-btn ps-btn-sm" style={{ height: 32, color: "var(--ps-danger)" }}>
              <Icons.x size={13} sw={2.5} />
            </button>
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ height: 32, width: 32, padding: 0, justifyContent: "center" }}>
              <Icons.mail size={13} />
            </button>
          </div>
        </div>
      ))}
    </MobileShell>
  );
}

// ─── Analytics ───────────────────────────────────────────────
function MobileOwnerAnalytics({ theme }) {
  return (
    <MobileShell theme={theme} title="Analytics" sub="Last 30 days" nav="more"
      right={<button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.calendar size={14} /></button>}>
      <div style={{ display: "flex", gap: 4, padding: "6px 0 12px", overflowX: "auto" }}>
        {["Overview", "Occupancy", "Revenue", "Peak hours"].map((t, i) => (
          <button key={t} className="ps-chip" style={{
            height: 26, padding: "0 12px", flex: "0 0 auto",
            background: i === 0 ? "var(--brand)" : "var(--surface)",
            color: i === 0 ? "#fff" : "var(--text-2)",
            border: i === 0 ? "1px solid var(--brand)" : "1px solid var(--line)",
            fontWeight: 600,
          }}>{t}</button>
        ))}
      </div>

      <div className="ps-card" style={{ padding: 16, background: "linear-gradient(135deg, var(--brand), var(--ps-violet-700))", color: "#fff", borderColor: "transparent", marginBottom: 10 }}>
        <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Revenue · owner net</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <div className="ps-num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em" }}>$48,260</div>
          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "rgba(255,255,255,.2)", fontWeight: 600 }}>+12.4%</span>
        </div>
        <Sparkline points={[3,5,4,7,6,8,9,11,10,13]} positive width={260} height={36} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          ["Bookings", "284", "+8%", true],
          ["Occupancy", "76%", "+4.1%", true],
          ["Avg value", "$170", "+4.4%", true],
          ["Cancellations", "3.2%", "-0.8%", true],
        ].map(([l, v, d, p], i) => (
          <div key={i} className="ps-card" style={{ padding: 12 }}>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span className="ps-num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: p ? "var(--ps-success)" : "var(--ps-danger)" }}>{d}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="ps-card" style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>By space type</div>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>30d revenue mix</span>
        </div>
        {[
          { label: "Meeting rooms", pct: 45, val: "$21,840", color: "var(--brand)" },
          { label: "Private offices", pct: 32, val: "$15,400", color: "var(--ps-violet-300)" },
          { label: "Day passes", pct: 17, val: "$8,420", color: "var(--ps-mint-500)" },
          { label: "Memberships", pct: 6, val: "$2,600", color: "var(--ps-mint-300)" },
        ].map((s, i) => (
          <div key={i} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <span style={{ fontWeight: 500 }}>{s.label}</span>
              </span>
              <span className="ps-num" style={{ fontWeight: 600 }}>{s.val}</span>
            </div>
            <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${s.pct}%`, background: s.color, borderRadius: 99 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="ps-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Peak hours</div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 10 }}>Darker = more bookings</div>
        <MiniHeatmap />
      </div>
    </MobileShell>
  );
}

function MiniHeatmap() {
  const days = ["M","T","W","T","F","S","S"];
  const data = days.map((_, di) => Array.from({ length: 8 }, (_, hi) => {
    const isWeekend = di >= 5;
    if (isWeekend) return Math.max(0, 0.2 + (Math.sin(hi * 0.6) + 1) * 0.15);
    const peak = Math.exp(-Math.pow((hi - 4) / 2.5, 2));
    const dayMul = di === 1 || di === 2 ? 1 : di === 4 ? 0.7 : 0.85;
    return Math.min(1, peak * dayMul + 0.1);
  }));
  const colorFor = (v) => v < 0.15 ? "var(--surface-2)" : v < 0.3 ? "rgba(124,91,245,.15)" : v < 0.5 ? "rgba(124,91,245,.3)" : v < 0.7 ? "rgba(124,91,245,.55)" : "var(--brand)";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "20px repeat(8, 1fr)", gap: 3 }}>
        <div />
        {["8a","10a","12p","2p","4p","6p","8p","10p"].map(h => (
          <div key={h} className="ps-num" style={{ fontSize: 8, color: "var(--text-3)", textAlign: "center" }}>{h}</div>
        ))}
      </div>
      {days.map((d, di) => (
        <div key={`r-${di}`} style={{ display: "grid", gridTemplateColumns: "20px repeat(8, 1fr)", gap: 3, marginTop: 3 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", display: "flex", alignItems: "center" }}>{d}</div>
          {data[di].map((v, hi) => (
            <div key={hi} style={{ aspectRatio: "1", background: colorFor(v), borderRadius: 3 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Locations ───────────────────────────────────────────────
function MobileOwnerLocations({ theme }) {
  return (
    <MobileShell theme={theme} title="Locations" sub="5 active · 1 onboarding" nav="more"
      right={<button className="ps-btn ps-btn-sm" style={{ height: 30, padding: "0 10px", background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>
        <Icons.plus size={13} /> New
      </button>}>
      {[
        { name: "Plantation HQ", city: "Plantation, FL", rooms: 6, occ: 0.82, mtd: 12480, status: "live", primary: true },
        { name: "Brickell Commons", city: "Miami, FL", rooms: 8, occ: 0.91, mtd: 18240, status: "live" },
        { name: "Coral Springs", city: "Coral Springs, FL", rooms: 4, occ: 0.64, mtd: 7820, status: "live" },
        { name: "Riverside Annex", city: "Plantation, FL", rooms: 3, occ: 0.48, mtd: 4920, status: "live" },
        { name: "West Lauderdale", city: "Lauderdale, FL", rooms: 5, occ: 0.21, mtd: 1200, status: "onboarding" },
      ].map((l, i) => (
        <div key={i} className="ps-card" style={{ overflow: "hidden", marginBottom: 10, border: l.primary ? "1px solid var(--brand)" : "1px solid var(--line)" }}>
          <div style={{ height: 64, background: l.status === "onboarding" ? "linear-gradient(135deg, #FFF4E5, #FFE4C9)" : "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: l.status === "onboarding" ? "var(--ps-warning)" : "var(--brand)", opacity: 0.4 }}>
              <Icons.building size={22} />
            </div>
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
              {l.primary && <span className="ps-chip ps-chip-violet" style={{ height: 18, fontSize: 9, background: "rgba(255,255,255,.7)" }}>Primary</span>}
              <span className={`ps-chip ps-chip-${l.status === "onboarding" ? "warning" : "success"}`} style={{ height: 18, fontSize: 9 }}>
                {l.status === "onboarding" ? "Onboarding" : "Live"}
              </span>
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{l.city}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginTop: 10, padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
              {[
                ["Rooms", l.rooms],
                ["Occ", `${Math.round(l.occ * 100)}%`],
                ["MTD", `$${(l.mtd / 1000).toFixed(1)}k`],
              ].map(([lbl, v]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{lbl}</div>
                  <div className="ps-num" style={{ fontSize: 14, fontWeight: 600, marginTop: 1, letterSpacing: "-0.01em" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </MobileShell>
  );
}

// ─── Settings (mobile section list) ──────────────────────────
function MobileOwnerSettings({ theme }) {
  const items = [
    { group: "Organization" },
    { id: "profile", icon: Icons.building, label: "Profile", sub: "Display name, slug, contact" },
    { id: "branding", icon: Icons.globe, label: "Branding & domain", sub: "Logo, color, custom domain" },
    { id: "team", icon: Icons.users, label: "Team & roles", sub: "5 members · 2 invites", badge: "2" },
    { group: "Operations" },
    { id: "amenities", icon: Icons.wifi, label: "Amenities", sub: "7 active" },
    { id: "pricing", icon: Icons.dollar, label: "Pricing rules", sub: "4 rules" },
    { id: "tax", icon: Icons.doc, label: "Tax", sub: "Auto · Stripe Tax" },
    { id: "cancel", icon: Icons.x, label: "Cancellation policies", sub: "Flexible (default)" },
    { group: "Growth" },
    { id: "promos", icon: Icons.zap, label: "Promo codes", sub: "4 active" },
    { id: "plans", icon: Icons.star, label: "Membership plans", sub: "4 plans · 76 subs" },
    { id: "loyalty", icon: Icons.sparkle, label: "Loyalty", sub: "Priddy Points · enabled" },
    { group: "Platform" },
    { id: "stripe", icon: Icons.card, label: "Stripe", sub: "Connected · acct_1Q8r" },
    { id: "assistant", icon: Icons.sparkle, label: "AI assistant", sub: "4 policies enabled" },
    { id: "flags", icon: Icons.command, label: "Feature flags", sub: "4 enabled" },
  ];
  return (
    <MobileShell theme={theme} title="Settings" nav="more">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((it, i) => {
          if (it.group) {
            return (
              <div key={i} style={{ padding: "16px 4px 6px", fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {it.group}
              </div>
            );
          }
          return (
            <button key={it.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 12px",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              marginBottom: 6,
              textAlign: "left", cursor: "pointer",
              fontFamily: "inherit",
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                <it.icon size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>
              </div>
              {it.badge && (
                <span style={{
                  padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: "var(--ps-warning-bg)", color: "var(--ps-warning)",
                }}>{it.badge}</span>
              )}
              <Icons.chev_r size={14} color="var(--text-4)" />
            </button>
          );
        })}

        <button style={{
          margin: "12px 4px 0", padding: "12px",
          background: "transparent",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          color: "var(--ps-danger)",
          fontSize: 13, fontWeight: 600,
          fontFamily: "inherit",
        }}>Sign out</button>
      </div>
    </MobileShell>
  );
}

// ─── Members directory ──────────────────────────────────────
function MobileOwnerMembers({ theme }) {
  return (
    <MobileShell theme={theme} title="Members" sub="142 total · 28 new this mo" nav="more"
      right={<button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.search size={15} /></button>}>
      <div style={{ display: "flex", gap: 4, padding: "6px 0 12px", overflowX: "auto" }}>
        {[
          { l: "All", c: 142, on: true },
          { l: "New", c: 28 },
          { l: "Active", c: 96 },
          { l: "Lapsed", c: 14, tone: "danger" },
        ].map((t, i) => (
          <button key={i} className="ps-chip" style={{
            height: 26, padding: "0 12px", flex: "0 0 auto",
            background: t.on ? "var(--brand)" : "var(--surface)",
            color: t.on ? "#fff" : "var(--text-2)",
            border: t.on ? "1px solid var(--brand)" : "1px solid var(--line)",
            fontWeight: 600,
          }}>
            {t.l} <span style={{ opacity: 0.7 }}>{t.c}</span>
          </button>
        ))}
      </div>

      {/* Top members section */}
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 6 }}>Top spenders</div>
      {[
        { name: "Priya Shah", company: "Foundry Co.", plan: "Office 12B", spend: "$3,200", trend: "+22%", positive: true },
        { name: "Ben Larkin", company: "Atlas Labs", plan: "Flex 8", spend: "$1,840", trend: "+8%", positive: true },
        { name: "Carlos Vela", company: "Loop", plan: "Resident", spend: "$1,210", trend: "+34%", positive: true },
        { name: "Maya Chen", company: "Northwind", plan: "Pay-as-go", spend: "$960", trend: "—" },
        { name: "Hana Park", company: "—", plan: "Day Pass", spend: "$420", trend: "-12%" },
      ].map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
          <div className="ps-num" style={{ fontSize: 10, color: "var(--text-4)", width: 12 }}>{i + 1}</div>
          <Avatar name={m.name} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.company} · {m.plan}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="ps-num" style={{ fontSize: 13, fontWeight: 600 }}>{m.spend}</div>
            <div style={{ fontSize: 10, color: m.positive ? "var(--ps-success)" : m.trend.startsWith("-") ? "var(--ps-danger)" : "var(--text-3)" }}>{m.trend}</div>
          </div>
        </div>
      ))}
    </MobileShell>
  );
}

Object.assign(window, {
  MobileOwnerSuite, MobileShell, OwnerMobileNav,
  MobileOwnerCalendar, MobileOwnerRequests, MobileOwnerAnalytics,
  MobileOwnerLocations, MobileOwnerSettings, MobileOwnerMembers, MiniHeatmap,
});
