// owner-settings.jsx — settings split into clear sections instead of one giant scroll
function OwnerSettings({ theme = "light" }) {
  return (
    <PSShell theme={theme} sidebar="owner"
      title="Settings"
      breadcrumb={["Owner", "Plantation HQ"]}
      actions={<button className="ps-btn ps-btn-primary">Save changes</button>}>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
        {/* Section nav */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            { group: "Organization" },
            { id: "profile", label: "Profile", icon: Icons.building, active: true },
            { id: "branding", label: "Branding & domain", icon: Icons.globe },
            { id: "team", label: "Team & roles", icon: Icons.users },
            { group: "Operations" },
            { id: "amenities", label: "Amenities", icon: Icons.wifi },
            { id: "pricing", label: "Pricing rules", icon: Icons.dollar },
            { id: "tax", label: "Tax", icon: Icons.doc },
            { id: "cancellation", label: "Cancellation policies", icon: Icons.x },
            { group: "Growth" },
            { id: "promos", label: "Promo codes", icon: Icons.zap },
            { id: "plans", label: "Membership plans", icon: Icons.star },
            { id: "loyalty", label: "Loyalty", icon: Icons.sparkle },
            { group: "Platform" },
            { id: "stripe", label: "Stripe", icon: Icons.card },
            { id: "assistant", label: "AI assistant", icon: Icons.sparkle },
            { id: "flags", label: "Feature flags", icon: Icons.command },
          ].map((it, i) => {
            if (it.group) {
              return (
                <div key={`g-${i}`} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)", padding: "12px 10px 4px" }}>
                  {it.group}
                </div>
              );
            }
            return (
              <div key={it.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                borderRadius: 8, fontSize: 13,
                background: it.active ? "var(--brand-soft)" : "transparent",
                color: it.active ? "var(--brand-strong)" : "var(--text-2)",
                fontWeight: it.active ? 600 : 500, cursor: "pointer",
              }}>
                <it.icon size={14} color={it.active ? "var(--brand)" : "var(--text-3)"} />
                {it.label}
              </div>
            );
          })}
        </aside>

        {/* Content panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
          <SettingsCard
            title="Organization profile"
            sub="The name members see at checkout and on receipts."
            badge={{ label: "Approved", tone: "success" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Display name" hint="Appears on the marketplace.">
                <input className="ps-input" defaultValue="Priddyspaces · Plantation" />
              </Field>
              <Field label="Public slug">
                <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", height: 36 }}>
                  <div style={{ padding: "0 10px", color: "var(--text-3)", fontSize: 13, borderRight: "1px solid var(--line)", fontFamily: "var(--f-mono)" }}>priddyspaces.com /</div>
                  <input style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "0 10px", fontSize: 13, fontFamily: "var(--f-mono)" }} defaultValue="plantation" />
                </div>
              </Field>
              <Field label="Support email">
                <input className="ps-input" defaultValue="hello@plant.co" />
              </Field>
              <Field label="Public phone">
                <input className="ps-input" defaultValue="(954) 906-7565" />
              </Field>
            </div>
          </SettingsCard>

          <SettingsCard title="Amenities" sub="Members filter by these on the marketplace.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {[
                ["WiFi", Icons.wifi, true],
                ["Coffee", Icons.coffee, true],
                ["Parking", Icons.car, true],
                ["Printer", Icons.printer, true],
                ["Whiteboard", Icons.doc, true],
                ["AC", Icons.zap, true],
                ["Meeting Room", Icons.users, true],
                ["Phone booth", Icons.box, false],
                ["Lockers", Icons.box, false],
                ["Outdoor patio", Icons.globe, false],
                ["Mother's room", Icons.users, false],
                ["Pet friendly", Icons.star, false],
              ].map(([n, I, on], i) => (
                <button key={i} className="ps-chip" style={{
                  height: 28, padding: "0 10px",
                  background: on ? "var(--brand-soft)" : "var(--surface-2)",
                  color: on ? "var(--brand-strong)" : "var(--text-3)",
                  border: on ? "1px solid var(--ps-violet-200)" : "1px dashed var(--line-strong)",
                  cursor: "pointer",
                }}>
                  <I size={12} sw={2} /> {n}
                  {on && <Icons.check size={11} sw={2.5} />}
                </button>
              ))}
              <button className="ps-chip" style={{ height: 28, background: "transparent", border: "1px dashed var(--line-strong)", color: "var(--text-3)" }}>
                <Icons.plus size={12} sw={2.5} /> Custom amenity
              </button>
            </div>
          </SettingsCard>

          <SettingsCard title="Pricing rules" sub="Override hourly / daily / monthly base rates per space, weekday, or time-of-day.">
            <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 120px 90px 30px", padding: "8px 12px", borderBottom: "1px solid var(--line)", fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--surface-2)" }}>
                <div>Scope</div>
                <div>Rate type</div>
                <div>Window</div>
                <div>Days</div>
                <div style={{ textAlign: "right" }}>Price</div>
                <div />
              </div>
              {[
                { scope: "Conference rooms · all", type: "Hourly", win: "9am – 6pm", days: "Mon – Fri", price: "$30" },
                { scope: "Riverside 3", type: "Hourly", win: "6pm – 10pm", days: "Mon – Fri", price: "$45", premium: true },
                { scope: "Day pass", type: "Daily", win: "Any time", days: "Mon – Sun", price: "$49" },
                { scope: "Coral 12B", type: "Monthly", win: "—", days: "—", price: "$1,200" },
              ].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 120px 90px 30px", padding: "10px 12px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 12 }}>
                  <div style={{ fontWeight: 500 }}>{r.scope} {r.premium && <span className="ps-chip ps-chip-warning" style={{ height: 16, fontSize: 9, padding: "0 6px", marginLeft: 4 }}>Premium</span>}</div>
                  <div style={{ color: "var(--text-3)" }}>{r.type}</div>
                  <div className="ps-num" style={{ color: "var(--text-3)" }}>{r.win}</div>
                  <div style={{ color: "var(--text-3)" }}>{r.days}</div>
                  <div className="ps-num" style={{ fontWeight: 600, textAlign: "right" }}>{r.price}</div>
                  <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icons.more size={12} /></button>
                </div>
              ))}
            </div>
            <button className="ps-btn ps-btn-sm" style={{ marginTop: 10 }}><Icons.plus size={12} /> Add rule</button>
          </SettingsCard>

          <SettingsCard title="Stripe" sub="Accept bookings and process subscriptions through your own Stripe account."
            badge={{ label: "Connected", tone: "success" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, background: "var(--surface-2)", borderRadius: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "linear-gradient(135deg, #635BFF, #4138e5)",
                display: "grid", placeItems: "center", flex: "0 0 auto",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M13.5 11c-1.86-.67-2.85-1.13-2.85-2.07 0-.78.62-1.23 1.69-1.23 1.51 0 2.97.58 4.13 1.18l.6-3.69C16.13 4.7 14.55 4.2 12.5 4.2 8.92 4.2 6.4 6.1 6.4 9.04c0 3.46 3.78 4.21 5.66 4.86 1.99.7 2.66 1.18 2.66 1.96 0 .8-.69 1.23-1.87 1.23-1.78 0-4.05-.84-5.54-1.59l-.6 3.72c1.48.69 3.65 1.32 5.93 1.32 3.78 0 6.36-1.86 6.36-4.99 0-2.78-1.69-3.79-5.5-5.55z" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Stripe · acct_1Q8r…fX2</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>Live mode · USD · payouts to BoA •••• 4982</div>
              </div>
              <button className="ps-btn ps-btn-sm">Open dashboard</button>
              <button className="ps-btn ps-btn-sm ps-btn-ghost">Disconnect</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
              {[
                ["Platform fee", "2.9% + $0.30"],
                ["Payout schedule", "Daily, T+2"],
                ["Statement descriptor", "PRIDDY · PLANTATION"],
              ].map(([l, v]) => (
                <div key={l} style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{v}</div>
                </div>
              ))}
            </div>
          </SettingsCard>

          <SettingsCard title="AI assistant policies" sub="What the assistant is allowed to do without owner approval.">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { label: "Auto-approve recurring members under $200", on: true },
                { label: "Send confirmation emails on owner's behalf", on: true },
                { label: "Suggest pricing changes weekly", on: false },
                { label: "Auto-cancel no-shows after 30 min", on: true },
                { label: "Reply to FAQ inquiries (read-only)", on: true },
              ].map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  <Icons.sparkle size={14} color="var(--brand)" />
                  <div style={{ flex: 1, fontSize: 13 }}>{p.label}</div>
                  <Toggle on={p.on} />
                </div>
              ))}
            </div>
          </SettingsCard>
        </div>
      </div>
    </PSShell>
  );
}

function SettingsCard({ title, sub, badge, children }) {
  return (
    <div className="ps-card" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
            {badge && <span className={`ps-chip ps-chip-${badge.tone}`}>{badge.label}</span>}
          </div>
          {sub && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, maxWidth: 560 }}>{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, display: "block" }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ on }) {
  return (
    <div style={{
      width: 32, height: 18, borderRadius: 999,
      background: on ? "var(--brand)" : "var(--surface-3)",
      padding: 2, transition: "background .15s",
      flex: "0 0 auto",
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: 999, background: "#fff",
        transform: on ? "translateX(14px)" : "translateX(0)",
        transition: "transform .18s var(--ease-spring)",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }} />
    </div>
  );
}

Object.assign(window, { OwnerSettings, SettingsCard, Field, Toggle });
