// booking-flow.jsx — checkout/booking confirmation flow on one screen
function BookingFlow({ theme = "light" }) {
  return (
    <div className={`ps theme-${theme}`} style={{
      width: "100%", height: "100%",
      background: "var(--bg)", color: "var(--text)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <header style={{
        display: "flex", alignItems: "center", padding: "12px 32px",
        borderBottom: "1px solid var(--line)", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PSLogo size={28} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Priddyspaces</div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <StepPill n={1} label="Sign in" done />
          <StepConnector done />
          <StepPill n={2} label="Your info" active />
          <StepConnector />
          <StepPill n={3} label="Payment" />
          <StepConnector />
          <StepPill n={4} label="Confirm" />
        </div>
        <button className="ps-btn ps-btn-sm ps-btn-ghost"><Icons.x size={13} /> Cancel</button>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "32px 0" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "1fr 380px", gap: 32 }}>
          {/* Form */}
          <div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>Tell us about your booking</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4, marginBottom: 24 }}>
              Plantation HQ will use this to greet you and prepare the space.
            </div>

            {/* Your info */}
            <div className="ps-card" style={{ padding: 24, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Contact</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Full name">
                  <input className="ps-input" defaultValue="Jane Miller" />
                </Field>
                <Field label="Email">
                  <input className="ps-input" defaultValue="jane@plant.co" />
                </Field>
                <Field label="Phone (optional)" hint="We'll text you a 30-min reminder.">
                  <input className="ps-input" placeholder="+1 555 000 0000" />
                </Field>
                <Field label="Company (optional)">
                  <input className="ps-input" defaultValue="Northwind Studio" />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Message to host (optional)" hint="Whiteboard prefs, A/V needs, accessibility notes…">
                    <textarea className="ps-input" style={{ height: 80, padding: 10, resize: "vertical" }} placeholder="Demo for vendor — would love whiteboard ready if possible." />
                  </Field>
                </div>
              </div>
            </div>

            {/* Add-ons */}
            <div className="ps-card" style={{ padding: 24, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Add-ons</h3>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>Optional extras — added to your total.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { icon: Icons.coffee, label: "Coffee & pastry tray", sub: "Serves 4 · arrives 10 min before", price: 28, selected: true },
                  { icon: Icons.users, label: "Tech setup", sub: "Host preps display & confirms A/V", price: 0, selected: true, free: true },
                  { icon: Icons.printer, label: "Print package", sub: "20 color, 50 b/w prints", price: 12 },
                  { icon: Icons.car, label: "Reserved parking", sub: "Spot held at front entrance", price: 8 },
                ].map((a, i) => (
                  <label key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: 12, borderRadius: 10,
                    border: `1px solid ${a.selected ? "var(--brand)" : "var(--line)"}`,
                    background: a.selected ? "var(--brand-soft)" : "var(--surface)",
                    cursor: "pointer",
                  }}>
                    <input type="checkbox" defaultChecked={a.selected} style={{ accentColor: "var(--brand)" }} />
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--text-2)" }}>
                      <a.icon size={15} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>{a.sub}</div>
                    </div>
                    <div className="ps-num" style={{ fontSize: 13, fontWeight: 600, color: a.free ? "var(--ps-success)" : "var(--text)" }}>
                      {a.free ? "Free" : `+ $${a.price}`}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Policies */}
            <div className="ps-card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Cancellation</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ps-success-bg)", color: "var(--ps-success)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                  <Icons.check size={18} sw={2.5} />
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                  <strong>Flexible.</strong> Full refund up to 24h before. 50% refund up to 4h before.
                  No refund after that — but you can reschedule once for free.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button className="ps-btn ps-btn-ghost"><Icons.arrow_l size={14} /> Back</button>
              <button className="ps-btn ps-btn-primary ps-btn-lg">Continue to payment <Icons.arrow_r size={16} /></button>
            </div>
          </div>

          {/* Right: summary */}
          <div style={{ position: "sticky", top: 0 }}>
            <div className="ps-card" style={{ overflow: "hidden" }}>
              <div style={{ height: 120, background: "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--brand)", opacity: 0.4 }}>
                  <Icons.building size={32} />
                </div>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your booking</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>Riverside 3 · Plantation HQ</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Conference Room · 4 seats</div>

                <hr className="ps-divider" style={{ margin: "16px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Row icon={Icons.calendar} label="Wed, May 13, 2026" sub="2:00 – 4:00 pm · 2h" />
                  <Row icon={Icons.users} label="4 attendees" sub="2 members · 2 guests" />
                  <Row icon={Icons.pin} label="12301 W Sunrise Blvd" sub="Plantation, FL" />
                </div>

                <hr className="ps-divider" style={{ margin: "16px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                  <Line label="$30 × 2 hours" value="$60.00" />
                  <Line label="Coffee & pastry tray" value="$28.00" />
                  <Line label="Tech setup" value="Free" muted />
                  <Line label="Service fee" value="$6.16" muted />
                  <Line label="Tax (7%)" value="$6.59" muted />
                </div>

                <hr className="ps-divider" style={{ margin: "12px 0" }} />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                  <span className="ps-num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>$100.75</span>
                </div>

                <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--ps-mint-50)", borderRadius: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <Icons.star size={14} color="var(--ps-mint-700)" fill="var(--ps-mint-500)" />
                  <div style={{ fontSize: 11, color: "var(--ps-mint-700)" }}>
                    <strong>Earn 100 points</strong> · $5 off your next booking
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPill({ n, label, done, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 22, height: 22, borderRadius: 999,
        background: done ? "var(--brand)" : active ? "var(--surface)" : "var(--surface-2)",
        border: active ? "2px solid var(--brand)" : "2px solid transparent",
        color: done ? "#fff" : active ? "var(--brand)" : "var(--text-3)",
        display: "grid", placeItems: "center",
        fontSize: 11, fontWeight: 700,
        boxShadow: active ? "0 0 0 4px var(--brand-soft)" : "none",
      }}>
        {done ? <Icons.check size={12} sw={3} /> : n}
      </div>
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? "var(--text)" : done ? "var(--text-2)" : "var(--text-3)" }}>{label}</span>
    </div>
  );
}

function StepConnector({ done }) {
  return <div style={{ width: 32, height: 2, background: done ? "var(--brand)" : "var(--line-strong)", borderRadius: 1 }} />;
}

function Line({ label, value, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: muted ? "var(--text-3)" : "var(--text-2)" }}>
      <span>{label}</span>
      <span className="ps-num">{value}</span>
    </div>
  );
}

Object.assign(window, { BookingFlow, StepPill, StepConnector, Line });
