// owner-analytics.jsx — analytics overview with charts and heatmap
function OwnerAnalytics({ theme = "light" }) {
  return (
    <PSShell theme={theme} sidebar="owner"
      title="Analytics"
      breadcrumb={["Owner", "Insights"]}
      actions={<>
        <button className="ps-btn"><Icons.pin size={14} /> All locations <Icons.chev_d size={12} /></button>
        <button className="ps-btn"><Icons.calendar size={14} /> Last 30 days <Icons.chev_d size={12} /></button>
        <button className="ps-btn ps-btn-ghost" style={{ width: 36, padding: 0, justifyContent: "center" }}><Icons.doc size={14} /></button>
      </>}>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid var(--line)" }}>
        {[
          { id: "overview", label: "Overview", active: true },
          { id: "occupancy", label: "Occupancy" },
          { id: "revenue", label: "Revenue" },
          { id: "members", label: "Members" },
          { id: "heatmap", label: "Peak hours" },
        ].map(t => (
          <button key={t.id} style={{
            padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer",
            borderBottom: t.active ? "2px solid var(--brand)" : "2px solid transparent",
            color: t.active ? "var(--text)" : "var(--text-3)",
            fontSize: 13, fontWeight: t.active ? 600 : 500, marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Top row KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        <StatCard label="Revenue (owner net)" value="$48,260" delta="+12.4%" deltaPositive icon={Icons.dollar} accent="violet" sub="vs prior period" sparkline={[4,5,4,6,7,8,7,9,10,12]} />
        <StatCard label="Bookings" value="284" delta="+8.0%" deltaPositive icon={Icons.calendar} accent="violet" sub="63 this week" sparkline={[6,5,7,8,9,8,10,11]} />
        <StatCard label="Occupancy" value="76%" delta="+4.1%" deltaPositive icon={Icons.building} accent="mint" sub="Peak 2pm-4pm" sparkline={[4,5,6,5,7,6,7,8]} />
        <StatCard label="Active members" value="142" delta="-1.4%" deltaPositive={false} icon={Icons.users} sub="3 churned" sparkline={[8,9,8,8,9,7,8,7]} />
      </div>

      {/* Main row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 16 }}>
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Revenue · daily"
            sub="Net of refunds & platform fees · $48,260 last 30d"
            right={<>
              <button className="ps-btn ps-btn-sm" style={{ background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>Daily</button>
              <button className="ps-btn ps-btn-sm ps-btn-ghost">Weekly</button>
              <button className="ps-btn ps-btn-sm ps-btn-ghost">Monthly</button>
            </>} />
          <RevenueBarChart />
        </div>

        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="By space type" sub="Revenue mix" />
          <Donut />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {[
              { label: "Meeting rooms", value: "$21,840", pct: 45, color: "var(--brand)" },
              { label: "Private offices", value: "$15,400", pct: 32, color: "var(--ps-violet-300)" },
              { label: "Day passes", value: "$8,420", pct: 17, color: "var(--ps-mint-500)" },
              { label: "Memberships", value: "$2,600", pct: 6, color: "var(--ps-mint-300)" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                <span style={{ flex: 1, fontWeight: 500 }}>{s.label}</span>
                <span className="ps-num" style={{ color: "var(--text-3)" }}>{s.pct}%</span>
                <span className="ps-num" style={{ fontWeight: 600, minWidth: 64, textAlign: "right" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 16 }}>
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Peak hours · all locations"
            sub="Darker means more bookings. Tap a cell to drill in."
            right={<button className="ps-btn ps-btn-sm ps-btn-ghost"><Icons.filter size={12} /> Filter</button>} />
          <Heatmap />
        </div>

        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Top members" sub="By revenue, last 30d" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { name: "Foundry Co.", spend: "$3,200", bookings: 12, trend: "+22%" },
              { name: "Atlas Labs", spend: "$1,840", bookings: 18, trend: "+8%" },
              { name: "Loop", spend: "$1,210", bookings: 11, trend: "+34%" },
              { name: "Northwind Studio", spend: "$960", bookings: 6, trend: "—" },
              { name: "Saltworks", spend: "$880", bookings: 4, trend: "-12%" },
            ].map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, borderBottom: i === 4 ? "none" : "1px solid var(--line)" }}>
                <div className="ps-num" style={{ fontSize: 11, color: "var(--text-4)", width: 14 }}>{i + 1}</div>
                <Avatar name={m.name} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)" }}>{m.bookings} bookings</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="ps-num" style={{ fontSize: 12, fontWeight: 600 }}>{m.spend}</div>
                  <div style={{ fontSize: 10, color: m.trend.startsWith("+") ? "var(--ps-success)" : m.trend.startsWith("-") ? "var(--ps-danger)" : "var(--text-3)" }}>{m.trend}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Retention + funnel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Retention" sub="Returning vs prior window" />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="ps-num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>72%</div>
            <span className="ps-chip ps-chip-success">+6.2%</span>
          </div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3 }}>
            {[80, 72, 78, 75, 70, 76, 72, 74].map((v, i) => (
              <div key={i}>
                <div style={{ height: 60, background: "var(--surface-2)", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${v}%`, background: "var(--brand)", borderRadius: 4 }} />
                </div>
                <div className="ps-num" style={{ fontSize: 9, color: "var(--text-4)", textAlign: "center", marginTop: 4 }}>W{i + 1}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Avg booking value" />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="ps-num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>$170</div>
            <span className="ps-chip ps-chip-success">+4.4%</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-3)" }}>vs $163 last period</div>
          <div style={{ marginTop: 12, height: 80, position: "relative" }}>
            <Sparkline points={[150, 155, 160, 158, 163, 167, 165, 170]} positive width={240} height={80} />
          </div>
        </div>
        <div className="ps-card" style={{ padding: 20 }}>
          <SectionHead title="Cancellations" sub="As % of confirmed" />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="ps-num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>3.2%</div>
            <span className="ps-chip ps-chip-success">-0.8%</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-3)" }}>9 cancellations · 1 no-show</div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            {[1,1,0,1,1,0,1,0,1,1,1,1,0,1,1].map((v, i) => (
              <div key={i} style={{ flex: 1, height: 28, borderRadius: 3, background: v ? "var(--surface-2)" : "var(--ps-danger-bg)" }} />
            ))}
          </div>
        </div>
      </div>
    </PSShell>
  );
}

function RevenueBarChart() {
  const data = Array.from({ length: 30 }, (_, i) => {
    const base = 700 + i * 30;
    const seasonal = Math.sin(i * 0.9) * 350;
    const noise = ((i * 7) % 13) * 20;
    return Math.max(150, Math.round(base + seasonal + noise));
  });
  const max = Math.max(...data);
  const today = 28;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 180, padding: "0 0 24px" }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, position: "relative", height: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{
              width: "100%",
              height: `${(v / max) * 100}%`,
              background: i === today ? "var(--brand)" : i > today - 7 ? "var(--ps-violet-300)" : "var(--ps-violet-200)",
              borderRadius: "4px 4px 2px 2px",
              transition: "all .2s",
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", marginTop: -16, fontFamily: "var(--f-mono)" }}>
        <span>Apr 14</span><span>Apr 21</span><span>Apr 28</span><span>May 5</span><span>May 12</span>
      </div>
    </div>
  );
}

function Donut() {
  const slices = [
    { pct: 45, color: "var(--brand)" },
    { pct: 32, color: "var(--ps-violet-300)" },
    { pct: 17, color: "var(--ps-mint-500)" },
    { pct: 6, color: "var(--ps-mint-300)" },
  ];
  let acc = 0;
  const r = 60, c = 80;
  const stroke = 24;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
      <svg width={c * 2} height={c * 2} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {slices.map((s, i) => {
          const dash = (s.pct / 100) * circ;
          const offset = (acc / 100) * circ;
          acc += s.pct;
          return (
            <circle key={i} cx={c} cy={c} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt" />
          );
        })}
        <g transform={`rotate(90 ${c} ${c})`}>
          <text x={c} y={c - 4} textAnchor="middle" style={{ fontSize: 22, fontWeight: 600, fill: "var(--text)", letterSpacing: "-0.02em", fontFamily: "var(--f-mono)" }}>$48k</text>
          <text x={c} y={c + 14} textAnchor="middle" style={{ fontSize: 10, fill: "var(--text-3)" }}>last 30 days</text>
        </g>
      </svg>
    </div>
  );
}

function Heatmap() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = ["8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p"];
  // Realistic pattern: weekday peaks 10–3, Tue/Wed busiest
  const data = days.map((_, di) => hours.map((_, hi) => {
    const isWeekend = di >= 5;
    if (isWeekend) return Math.max(0, 0.2 + (Math.sin(hi * 0.6) + 1) * 0.15);
    const peak = Math.exp(-Math.pow((hi - 6) / 3, 2)); // peak around 2pm
    const dayMul = di === 1 || di === 2 ? 1 : di === 4 ? 0.7 : 0.85;
    return Math.min(1, peak * dayMul + 0.1);
  }));

  const colorFor = (v) => {
    if (v < 0.15) return "var(--surface-2)";
    if (v < 0.3) return "rgba(124,91,245,.15)";
    if (v < 0.5) return "rgba(124,91,245,.3)";
    if (v < 0.7) return "rgba(124,91,245,.55)";
    return "var(--brand)";
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "40px repeat(12, 1fr)", gap: 3, marginBottom: 4 }}>
        <div />
        {hours.map(h => (
          <div key={h} className="ps-num" style={{ fontSize: 9, color: "var(--text-3)", textAlign: "center" }}>{h}</div>
        ))}
      </div>
      {days.map((d, di) => (
        <div key={di} style={{ display: "grid", gridTemplateColumns: "40px repeat(12, 1fr)", gap: 3, marginBottom: 3 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", fontWeight: di < 5 ? 500 : 400 }}>{d}</div>
          {hours.map((h, hi) => {
            const v = data[di][hi];
            return (
              <div key={hi} style={{
                aspectRatio: "1.2",
                background: colorFor(v),
                borderRadius: 4,
                position: "relative",
              }}>
                {v > 0.7 && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 9, fontWeight: 600 }}>
                    {Math.round(v * 12)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 10, color: "var(--text-3)" }}>
        <span>Less</span>
        {["var(--surface-2)", "rgba(124,91,245,.15)", "rgba(124,91,245,.3)", "rgba(124,91,245,.55)", "var(--brand)"].map((c, i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
        ))}
        <span>More</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-2)" }}>Peak: <strong>Wed 2–4pm</strong></span>
      </div>
    </div>
  );
}

Object.assign(window, { OwnerAnalytics, RevenueBarChart, Donut, Heatmap });
