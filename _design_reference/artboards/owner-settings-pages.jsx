// owner-settings-pages.jsx — each settings sub-page as its own artboard.
// Wraps the same shell + side nav with a different active section.

function SettingsLayoutShell({ theme = "light", active, title = "Settings", actionsLabel = "Save changes", children }) {
  return (
    <PSShell theme={theme} sidebar="owner"
      title={title}
      breadcrumb={["Owner", "Plantation HQ", "Settings"]}
      actions={<button className="ps-btn ps-btn-primary">{actionsLabel}</button>}>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
        <SettingsSectionNav active={active} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
          {children}
        </div>
      </div>
    </PSShell>
  );
}

function SettingsSectionNav({ active }) {
  const items = [
    { group: "Organization" },
    { id: "profile", label: "Profile", icon: Icons.building },
    { id: "branding", label: "Branding & domain", icon: Icons.globe },
    { id: "team-roles", label: "Team & roles", icon: Icons.users },
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
  ];
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0, alignSelf: "flex-start" }}>
      {items.map((it, i) => {
        if (it.group) {
          return (
            <div key={`g-${i}`} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)", padding: "12px 10px 4px" }}>
              {it.group}
            </div>
          );
        }
        const isActive = it.id === active;
        return (
          <div key={it.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
            borderRadius: 8, fontSize: 13,
            background: isActive ? "var(--brand-soft)" : "transparent",
            color: isActive ? "var(--brand-strong)" : "var(--text-2)",
            fontWeight: isActive ? 600 : 500, cursor: "pointer",
          }}>
            <it.icon size={14} color={isActive ? "var(--brand)" : "var(--text-3)"} />
            {it.label}
          </div>
        );
      })}
    </aside>
  );
}

// ─── Team & roles ─────────────────────────────────────────────
function OwnerSettingsTeamRoles({ theme = "light" }) {
  const team = [
    { name: "Jane Miller", email: "jane@plant.co", role: "Owner", you: true, locs: "All", emails: true, last: "Active now" },
    { name: "Carlos Vela", email: "c@plant.co", role: "Admin", locs: "Plantation HQ · Riverside", emails: true, last: "2h ago" },
    { name: "Priya Shah", email: "priya@plant.co", role: "Staff", locs: "Coral Springs", emails: true, last: "Yesterday" },
    { name: "Diego Rivera", email: "diego@plant.co", role: "Staff", locs: "Brickell Commons", emails: false, last: "3d ago" },
    { name: "Maya Chen", email: "maya@plant.co", role: "Read-only", locs: "All", emails: false, last: "1w ago" },
  ];
  const invites = [
    { email: "ben@atlas.dev", role: "Staff", sent: "Yesterday" },
    { email: "hp@plant.co", role: "Admin", sent: "3d ago" },
  ];
  return (
    <SettingsLayoutShell theme={theme} active="team-roles" title="Team & roles">
      <SettingsCard title="Invite a member" sub="Owners, admins, staff, and read-only viewers. Members get an email to join.">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8 }}>
          <input className="ps-input" placeholder="admin@example.com" />
          <div className="ps-input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-2)" }}>
            Staff <Icons.chev_d size={12} color="var(--text-3)" />
          </div>
          <div className="ps-input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-2)" }}>
            Coral Springs <Icons.chev_d size={12} color="var(--text-3)" />
          </div>
          <button className="ps-btn ps-btn-primary"><Icons.plus size={14} /> Send invite</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 10 }}>
          <Icons.mail size={14} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>Forward new booking emails to this member</span>
          <Toggle on />
        </div>
      </SettingsCard>

      <SettingsCard title="Team" sub="5 active · 2 pending invites">
        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 110px 1.4fr 90px 90px 32px", padding: "8px 14px", borderBottom: "1px solid var(--line)", fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--surface-2)" }}>
            <div>Member</div><div>Role</div><div>Locations</div><div>Notify</div><div>Last seen</div><div />
          </div>
          {team.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 110px 1.4fr 90px 90px 32px", padding: "12px 14px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={m.name} size={30} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                    {m.name}
                    {m.you && <span className="ps-chip ps-chip-violet" style={{ height: 18, fontSize: 10 }}>You</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{m.email}</div>
                </div>
              </div>
              <div>
                <span className="ps-chip" style={{
                  height: 22, fontSize: 11, fontWeight: 600,
                  background: m.role === "Owner" ? "var(--brand-soft)" : m.role === "Admin" ? "var(--ps-info-bg)" : "var(--surface-2)",
                  color: m.role === "Owner" ? "var(--brand-strong)" : m.role === "Admin" ? "var(--ps-info)" : "var(--text-2)",
                }}>{m.role}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>{m.locs}</div>
              <Toggle on={m.emails} />
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{m.last}</div>
              <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icons.more size={13} /></button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Pending invites">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invites.map((iv, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, background: "var(--bg-elev)", display: "grid", placeItems: "center", color: "var(--text-3)" }}>
                <Icons.mail size={13} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{iv.email}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>{iv.role} · sent {iv.sent}</div>
              </div>
              <button className="ps-btn ps-btn-sm">Resend</button>
              <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ color: "var(--ps-danger)" }}>Revoke</button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Role permissions" sub="Customize what each role can do. Owner is locked.">
        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr)", padding: "8px 14px", background: "var(--surface-2)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)" }}>
            <div>Capability</div>
            <div style={{ textAlign: "center" }}>Owner</div>
            <div style={{ textAlign: "center" }}>Admin</div>
            <div style={{ textAlign: "center" }}>Staff</div>
            <div style={{ textAlign: "center" }}>Read-only</div>
          </div>
          {[
            ["Approve / reject requests", true, true, true, false],
            ["Refund a booking", true, true, false, false],
            ["Manage rooms & inventory", true, true, false, false],
            ["Edit pricing & promos", true, true, false, false],
            ["Connect Stripe", true, false, false, false],
            ["Invite team members", true, true, false, false],
            ["View analytics", true, true, true, true],
            ["Export data", true, true, false, false],
          ].map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr)", padding: "10px 14px", borderTop: "1px solid var(--line)", fontSize: 12, alignItems: "center" }}>
              <div>{row[0]}</div>
              {row.slice(1).map((on, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "center" }}>
                  {on ? <Icons.check size={14} color="var(--ps-success)" sw={2.5} /> : <Icons.x size={14} color="var(--text-4)" sw={2} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Branding & domain ─────────────────────────────────────────
function OwnerSettingsBranding({ theme = "light" }) {
  return (
    <SettingsLayoutShell theme={theme} active="branding" title="Branding & domain">
      <SettingsCard title="Brand" sub="Your logo and color show on the marketplace, emails, and receipts.">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 96, height: 96, borderRadius: 20, background: "linear-gradient(135deg, var(--ps-violet-400), var(--ps-violet-600))", display: "grid", placeItems: "center", color: "#fff", fontSize: 32, fontWeight: 700, letterSpacing: "-0.04em", boxShadow: "var(--shadow-md)" }}>
              PH
            </div>
            <button className="ps-btn ps-btn-sm">Upload logo</button>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>SVG, PNG · 256px min</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1 }}>
            <Field label="Public display name">
              <input className="ps-input" defaultValue="Priddyspaces · Plantation HQ" />
            </Field>
            <Field label="Tagline" hint="One line. Appears below your name on the marketplace.">
              <input className="ps-input" defaultValue="Workspaces by the hour or month, in the heart of Plantation." />
            </Field>
            <Field label="Brand color">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {["#7C5BF5", "#2EB888", "#FF9E5E", "#FF7AA2", "#5E8EFF"].map((c, i) => (
                  <button key={c} style={{
                    width: 30, height: 30, borderRadius: 999, background: c,
                    border: i === 0 ? "3px solid var(--surface)" : "1px solid var(--line)",
                    boxShadow: i === 0 ? "0 0 0 2px var(--brand)" : "none",
                    cursor: "pointer",
                  }} />
                ))}
                <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>Custom: <span className="ps-num" style={{ color: "var(--text)" }}>#7C5BF5</span></span>
              </div>
            </Field>
            <Field label="Hero image">
              <div style={{ height: 60, borderRadius: 10, border: "1px dashed var(--line-strong)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", color: "var(--text-3)", fontSize: 12 }}>
                <Icons.box size={14} />
                Drop image, or click to upload · 1600 × 900
              </div>
            </Field>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Public listing" sub="What guests see on priddyspaces.com.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <Field label="Public slug">
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", height: 36, overflow: "hidden" }}>
              <div style={{ padding: "0 10px", color: "var(--text-3)", fontSize: 13, borderRight: "1px solid var(--line)", fontFamily: "var(--f-mono)" }}>priddyspaces.com /</div>
              <input style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "0 10px", fontSize: 13, fontFamily: "var(--f-mono)" }} defaultValue="plantation" />
              <span className="ps-chip ps-chip-success" style={{ marginRight: 8 }}>Available</span>
            </div>
          </Field>
          <Field label="Support email">
            <input className="ps-input" defaultValue="hello@plant.co" />
          </Field>
          <Field label="Support phone">
            <input className="ps-input" defaultValue="(954) 906-7565" />
          </Field>
          <Field label="Category">
            <div className="ps-input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              Coworking & meeting rooms <Icons.chev_d size={12} color="var(--text-3)" />
            </div>
          </Field>
        </div>
        <Field label="About your spaces" hint="Markdown supported. Max 800 characters.">
          <textarea className="ps-input" style={{ height: 96, padding: 12, resize: "vertical" }}
            defaultValue="A boutique network of bright, glass-walled workspaces across South Florida. Hourly meeting rooms, day passes, and monthly private offices — same quality, no contract." />
        </Field>
      </SettingsCard>

      <SettingsCard title="Custom domain" sub="Point your own domain at your Priddyspaces site." badge={{ label: "Verified", tone: "success" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
          <div className="ps-input" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", fontFamily: "var(--f-mono)", fontSize: 13 }}>
            <Icons.globe size={14} color="var(--brand)" /> book.plant.co
          </div>
          <button className="ps-btn">Manage DNS</button>
        </div>
        <div style={{ marginTop: 12, padding: 14, background: "var(--surface-2)", borderRadius: 10, display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 16, fontSize: 12, alignItems: "center" }}>
          <span style={{ color: "var(--text-3)" }}>Type</span>
          <span style={{ color: "var(--text-3)" }}>Name</span>
          <span style={{ color: "var(--text-3)" }}>Value</span>
          <span />
          <span className="ps-num">CNAME</span>
          <span className="ps-num">book</span>
          <span className="ps-num" style={{ color: "var(--text-2)" }}>cname.priddyspaces.com</span>
          <Icons.check size={14} color="var(--ps-success)" sw={2.5} />
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Tax ──────────────────────────────────────────────────────
function OwnerSettingsTax({ theme = "light" }) {
  return (
    <SettingsLayoutShell theme={theme} active="tax" title="Tax">
      <SettingsCard title="Tax collection" sub="Tax is calculated at checkout based on the location's address. Stripe Tax handles filing in supported jurisdictions.">
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, background: "var(--surface-2)", borderRadius: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ps-info-bg)", color: "var(--ps-info)", display: "grid", placeItems: "center" }}>
            <Icons.zap size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Automatic tax · Stripe Tax</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Recommended. Stripe computes, collects, and files. $0 setup, 0.5% per transaction.</div>
          </div>
          <Toggle on />
        </div>

        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px 110px 90px 32px", padding: "8px 14px", borderBottom: "1px solid var(--line)", fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--surface-2)" }}>
            <div>Location</div><div>Jurisdiction</div><div>Rate</div><div>Method</div><div>YTD collected</div><div />
          </div>
          {[
            { loc: "Plantation HQ", juris: "Broward County, FL", rate: "7.00%", method: "Stripe Tax", ytd: "$8,240" },
            { loc: "Coral Springs", juris: "Broward County, FL", rate: "7.00%", method: "Stripe Tax", ytd: "$4,820" },
            { loc: "Brickell Commons", juris: "Miami-Dade, FL", rate: "7.00%", method: "Stripe Tax", ytd: "$11,920" },
            { loc: "West Lauderdale", juris: "Broward County, FL", rate: "7.00%", method: "Stripe Tax", ytd: "$420" },
          ].map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px 110px 90px 32px", padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 500 }}>{row.loc}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>{row.juris}</div>
              <div className="ps-num" style={{ fontWeight: 600 }}>{row.rate}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{row.method}</div>
              <div className="ps-num" style={{ fontWeight: 600 }}>{row.ytd}</div>
              <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icons.more size={13} /></button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Receipts & invoices" sub="What members see in their booking receipts.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Tax label (as shown to customer)">
            <input className="ps-input" defaultValue="Sales tax" />
          </Field>
          <Field label="Tax ID">
            <input className="ps-input" defaultValue="EIN 84-3920411" />
          </Field>
          <Field label="Show tax inclusively in marketplace price?" hint="If on, listings display the all-in total. Off shows pre-tax with a + tax note.">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <Toggle on={false} />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>Off — show pre-tax with explanation</span>
            </div>
          </Field>
          <Field label="Invoice footer">
            <input className="ps-input" defaultValue="Thanks for booking with Priddyspaces · plant.co" />
          </Field>
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Cancellation policies ─────────────────────────────────────
function OwnerSettingsCancellation({ theme = "light" }) {
  return (
    <SettingsLayoutShell theme={theme} active="cancellation" title="Cancellation policies">
      <SettingsCard title="Pick a base policy" sub="Apply to all spaces. Override per-space below.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { tone: "success", title: "Flexible", sub: "Full refund up to 24h before. 50% up to 4h before.", on: true, body: ["100% — 24h+", "50% — 4–24h", "0% — < 4h"] },
            { tone: "info", title: "Moderate", sub: "Full refund up to 5 days before. 50% up to 24h.", body: ["100% — 5d+", "50% — 24h–5d", "0% — < 24h"] },
            { tone: "warning", title: "Strict", sub: "Full refund up to 14 days before. None after.", body: ["100% — 14d+", "0% — < 14d"] },
          ].map((p, i) => (
            <label key={i} style={{
              padding: 16, borderRadius: 12, cursor: "pointer",
              border: p.on ? "1px solid var(--brand)" : "1px solid var(--line)",
              background: p.on ? "var(--brand-soft)" : "var(--surface)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <input type="radio" name="cx" defaultChecked={p.on} style={{ accentColor: "var(--brand)" }} />
                <span className={`ps-chip ps-chip-${p.tone}`}>{p.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>{p.sub}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-2)" }}>
                {p.body.map((b, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--text-4)" }} />{b}
                  </div>
                ))}
              </div>
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Per-space overrides" sub="Higher-friction policies for premium spaces.">
        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 1fr 1fr 90px 32px", padding: "8px 14px", borderBottom: "1px solid var(--line)", fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--surface-2)" }}>
            <div>Space</div><div>Policy</div><div>Free until</div><div>50% until</div><div>No-show fee</div><div />
          </div>
          {[
            { space: "Brickell · Suite A", policy: "Strict", a: "14d before", b: "—", fee: "100%" },
            { space: "Coral 12B · Office", policy: "Moderate", a: "5d before", b: "24h before", fee: "50%" },
            { space: "Riverside 3", policy: "Flexible", a: "24h before", b: "4h before", fee: "$25" },
          ].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 1fr 1fr 90px 32px", padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 500 }}>{r.space}</div>
              <span className={`ps-chip ps-chip-${r.policy === "Flexible" ? "success" : r.policy === "Moderate" ? "info" : "warning"}`}>{r.policy}</span>
              <div className="ps-num" style={{ color: "var(--text-2)" }}>{r.a}</div>
              <div className="ps-num" style={{ color: "var(--text-2)" }}>{r.b}</div>
              <div className="ps-num" style={{ color: "var(--ps-danger)", fontWeight: 600 }}>{r.fee}</div>
              <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icons.more size={13} /></button>
            </div>
          ))}
        </div>
        <button className="ps-btn ps-btn-sm" style={{ marginTop: 10 }}><Icons.plus size={12} /> Add override</button>
      </SettingsCard>

      <SettingsCard title="Member-facing copy" sub="What guests read before checkout.">
        <Field label="Cancellation explainer">
          <textarea className="ps-input" style={{ height: 76, padding: 12 }} defaultValue="Plans change — we get it. Cancel 24h before your booking for a full refund. Within 24h, 50% back. No-shows are charged in full." />
        </Field>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Promo codes ──────────────────────────────────────────────
function OwnerSettingsPromos({ theme = "light" }) {
  const codes = [
    { code: "WELCOME20", type: "Percent", value: "20% off", scope: "First booking", uses: "82 / 500", expires: "Dec 31, 2026", status: "active" },
    { code: "DOWNTOWN", type: "Amount", value: "$15 off", scope: "Brickell Commons", uses: "14 / 100", expires: "Jun 30, 2026", status: "active" },
    { code: "SUMMER25", type: "Percent", value: "25% off", scope: "Day passes", uses: "—", expires: "Aug 31, 2026", status: "draft" },
    { code: "WEEKEND10", type: "Amount", value: "$10 off", scope: "Sat-Sun bookings", uses: "240 / 250", expires: "May 18, 2026", status: "active" },
    { code: "VIP-FOUNDRY", type: "Percent", value: "30% off", scope: "Members of Foundry Co.", uses: "6 / —", expires: "Never", status: "active" },
    { code: "LAUNCH50", type: "Percent", value: "50% off", scope: "All spaces", uses: "100 / 100", expires: "Apr 1, 2026", status: "ended" },
  ];
  return (
    <SettingsLayoutShell theme={theme} active="promos" title="Promo codes">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="Active codes" value="4" icon={Icons.zap} accent="violet" />
        <StatCard label="Total uses · 30d" value="342" delta="+18%" deltaPositive icon={Icons.users} />
        <StatCard label="Discount given" value="$2,840" sub="Last 30 days" icon={Icons.dollar} accent="violet" />
        <StatCard label="Avg order with code" value="$184" delta="+6%" deltaPositive icon={Icons.chart} accent="mint" />
      </div>

      <SettingsCard title="Active & scheduled codes" sub="">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input className="ps-input" placeholder="Search code…" style={{ maxWidth: 280 }} />
          <button className="ps-btn ps-btn-sm">All statuses <Icons.chev_d size={11} /></button>
          <button className="ps-btn ps-btn-sm">Type <Icons.chev_d size={11} /></button>
          <div style={{ flex: 1 }} />
          <button className="ps-btn ps-btn-primary"><Icons.plus size={14} /> New code</button>
        </div>
        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr 1fr 100px 90px 32px", padding: "8px 14px", borderBottom: "1px solid var(--line)", fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--surface-2)" }}>
            <div>Code</div><div>Discount</div><div>Scope</div><div>Usage</div><div>Expires</div><div>Status</div><div />
          </div>
          {codes.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr 1fr 100px 90px 32px", padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13, alignItems: "center" }}>
              <div className="ps-num" style={{ fontWeight: 600, color: c.status === "ended" ? "var(--text-3)" : "var(--text)" }}>{c.code}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{c.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)" }}>{c.type}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>{c.scope}</div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                <span className="ps-num">{c.uses}</span>
                {c.uses !== "—" && (
                  <div style={{ marginTop: 3, height: 3, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: c.uses.includes("100 / 100") ? "100%" : "30%", background: c.uses.includes("100 / 100") ? "var(--ps-warning)" : "var(--brand)", borderRadius: 99 }} />
                  </div>
                )}
              </div>
              <div className="ps-num" style={{ fontSize: 12, color: "var(--text-2)" }}>{c.expires}</div>
              <StatusBadge status={c.status === "ended" ? "canceled" : c.status === "draft" ? "draft" : "active"} />
              <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icons.more size={13} /></button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Membership plans ─────────────────────────────────────────
function OwnerSettingsPlans({ theme = "light" }) {
  const plans = [
    { name: "Day Pass", price: "$49", per: "/day", desc: "One open desk for a full workday. Walk-up friendly.", subs: 0, popular: false, color: "var(--text-3)", features: ["Open floor seating", "WiFi & coffee", "Print + booth credits"] },
    { name: "Flex 8", price: "$220", per: "/mo", desc: "8 day passes per month. Roll over up to 4.", subs: 42, popular: true, color: "var(--brand)", features: ["8 day passes", "Rollover up to 4", "10% off meeting rooms", "Member events"] },
    { name: "Resident", price: "$420", per: "/mo", desc: "Unlimited coworking + 4 hours/mo of meeting rooms.", subs: 28, color: "var(--ps-mint-700)", features: ["Unlimited coworking", "4hr meeting credit", "Mail handling", "Locker"] },
    { name: "Office 12B", price: "$1,200", per: "/mo", desc: "Private office for 4. Annual lock-in saves 15%.", subs: 6, color: "var(--ps-warning)", features: ["Private 4-seat office", "All-hours access", "20hr meeting credit", "Brand on the door"] },
  ];
  return (
    <SettingsLayoutShell theme={theme} active="plans" title="Membership plans">
      <SettingsCard title="Plans" sub="Active across all locations. Members can upgrade / downgrade themselves.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {plans.map((p, i) => (
            <div key={i} className="ps-card" style={{
              padding: 18,
              border: p.popular ? "1px solid var(--brand)" : "1px solid var(--line)",
              boxShadow: p.popular ? "0 0 0 3px var(--brand-soft)" : "var(--shadow-xs)",
              position: "relative",
            }}>
              {p.popular && (
                <span className="ps-chip" style={{ position: "absolute", top: -10, left: 14, background: "var(--brand)", color: "#fff", height: 22, fontSize: 10, padding: "0 10px" }}>
                  <Icons.star size={10} sw={2.5} /> Most popular
                </span>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
                <span className="ps-num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>{p.price}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.per}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5, minHeight: 32 }}>{p.desc}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "14px 0" }}>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)" }}>
                    <Icons.check size={11} color="var(--ps-success)" sw={2.5} /> {f}
                  </div>
                ))}
              </div>
              <hr className="ps-divider" style={{ margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>{p.subs} subscribers</div>
                <button className="ps-btn ps-btn-sm">Edit</button>
              </div>
            </div>
          ))}
        </div>
        <button className="ps-btn ps-btn-sm" style={{ marginTop: 14 }}><Icons.plus size={12} /> New plan</button>
      </SettingsCard>

      <SettingsCard title="Subscriber summary" sub="Last 90 days">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard label="Active subs" value="76" delta="+9.0%" deltaPositive icon={Icons.users} accent="violet" />
          <StatCard label="MRR" value="$18,920" delta="+12.4%" deltaPositive icon={Icons.dollar} accent="violet" />
          <StatCard label="Churn" value="2.1%" delta="-0.6%" deltaPositive icon={Icons.x} />
          <StatCard label="LTV" value="$2,420" delta="+4.2%" deltaPositive icon={Icons.star} accent="mint" />
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Loyalty ──────────────────────────────────────────────────
function OwnerSettingsLoyalty({ theme = "light" }) {
  return (
    <SettingsLayoutShell theme={theme} active="loyalty" title="Loyalty">
      <SettingsCard title="Program" sub="Reward members for repeat bookings, referrals, and reviews." badge={{ label: "Enabled", tone: "success" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Program name">
            <input className="ps-input" defaultValue="Priddy Points" />
          </Field>
          <Field label="Earn rate" hint="Members earn this per $ spent.">
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", height: 36, padding: "0 12px" }}>
              <input style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "var(--f-mono)" }} defaultValue="2" />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>pts / $1</span>
            </div>
          </Field>
          <Field label="Redemption rate" hint="What members get back per point.">
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", height: 36, padding: "0 12px" }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>1 pt =</span>
              <input style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "var(--f-mono)" }} defaultValue="0.05" />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>USD</span>
            </div>
          </Field>
          <Field label="Min redemption">
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", height: 36, padding: "0 12px" }}>
              <input style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "var(--f-mono)" }} defaultValue="500" />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>pts ($25)</span>
            </div>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Tiers" sub="Members unlock perks at each tier.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { name: "Bronze", req: "0+ pts", perks: ["Standard booking"], color: "#A87047", members: 86 },
            { name: "Silver", req: "1,000+ pts", perks: ["5% off rooms", "Priority requests"], color: "#9CA3AF", members: 38 },
            { name: "Gold", req: "5,000+ pts", perks: ["10% off rooms", "Free coffee credit"], color: "#D4A574", members: 14 },
            { name: "Platinum", req: "15,000+ pts", perks: ["15% off", "Guest passes", "Concierge"], color: "var(--brand)", members: 4 },
          ].map((t, i) => (
            <div key={i} className="ps-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, background: `linear-gradient(135deg, ${t.color}, ${t.color}AA)` }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
              </div>
              <div className="ps-num" style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>{t.req}</div>
              {t.perks.map((p, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
                  <Icons.check size={11} color="var(--ps-success)" sw={2.5} /> {p}
                </div>
              ))}
              <hr className="ps-divider" style={{ margin: "10px 0" }} />
              <div className="ps-num" style={{ fontSize: 11, color: "var(--text-3)" }}>{t.members} members</div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Earn rules" sub="Beyond spending — bonus points for actions that grow your community.">
        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          {[
            { trig: "Complete first booking", pts: "+200", on: true },
            { trig: "Leave a review", pts: "+50", on: true },
            { trig: "Refer a friend who books", pts: "+500", on: true },
            { trig: "Birthday month bonus", pts: "+250", on: false },
            { trig: "Book 3 weeks in a row", pts: "+300", on: true },
          ].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 60px", padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid var(--line)", alignItems: "center", fontSize: 13 }}>
              <div>{r.trig}</div>
              <div className="ps-num" style={{ fontWeight: 600, color: "var(--brand)" }}>{r.pts}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}><Toggle on={r.on} /></div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

// ─── Feature flags ────────────────────────────────────────────
function OwnerSettingsFlags({ theme = "light" }) {
  const flags = [
    { id: "ai-summary", name: "AI dashboard summary", desc: "Generative morning brief with anomalies and suggestions.", state: "Tenant", on: true },
    { id: "host-chat", name: "In-app messaging (beta)", desc: "Members and hosts can DM. SMS fallback when offline.", state: "Org", on: true, beta: true },
    { id: "loyalty-tiers", name: "Loyalty tiers", desc: "Bronze / Silver / Gold / Platinum.", state: "Org", on: true },
    { id: "google-cal", name: "Google Calendar sync", desc: "Two-way sync per member.", state: "User", on: true },
    { id: "ical-feed", name: "iCal subscription feed", desc: "Read-only feed per location.", state: "Org", on: false },
    { id: "advanced-reporting", name: "Advanced reporting", desc: "Cohorts, funnels, custom dashboards.", state: "Tenant", on: false, locked: true },
    { id: "concierge", name: "Concierge requests", desc: "Members can request catering, prints, transit.", state: "Org", on: false },
    { id: "auto-confirm", name: "Instant book by default", desc: "Skip approval for trusted members.", state: "Org", on: true },
  ];
  return (
    <SettingsLayoutShell theme={theme} active="flags" title="Feature flags">
      <SettingsCard title="Feature flags" sub="Roll features out gradually. Per-org overrides win over tenant defaults.">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <input className="ps-input" placeholder="Search flag…" style={{ maxWidth: 280 }} />
          <button className="ps-btn ps-btn-sm">Scope · All <Icons.chev_d size={11} /></button>
          <button className="ps-btn ps-btn-sm">State · All <Icons.chev_d size={11} /></button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>4 enabled · 4 disabled · 1 locked</span>
        </div>
        <div className="ps-card" style={{ overflow: "hidden", boxShadow: "none" }}>
          {flags.map((f, i) => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr 90px 80px 60px", padding: "14px 16px", gap: 14, alignItems: "center", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <Icons.command size={14} color="var(--text-3)" />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  {f.name}
                  {f.beta && <span className="ps-chip ps-chip-info" style={{ height: 18, fontSize: 10 }}>Beta</span>}
                  {f.locked && <span className="ps-chip ps-chip-warning" style={{ height: 18, fontSize: 10 }}>Locked · Pro plan</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{f.desc}</div>
              </div>
              <div className="ps-num" style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--text-3)" }}>{f.id}</div>
              <span className={`ps-chip ${f.state === "Tenant" ? "ps-chip-violet" : f.state === "Org" ? "ps-chip-mint" : ""}`}>{f.state}</span>
              <Toggle on={f.on} />
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Override audit" sub="Last 10 flag changes — who, what, when.">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[
            { who: "Jane Miller", what: "enabled", flag: "AI dashboard summary", when: "2h ago" },
            { who: "Carlos Vela", what: "disabled", flag: "iCal subscription feed", when: "Yesterday" },
            { who: "Jane Miller", what: "enabled", flag: "Instant book by default", when: "3d ago" },
            { who: "Priya Shah", what: "enabled", flag: "Loyalty tiers", when: "1w ago" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : "1px dashed var(--line)", fontSize: 13 }}>
              <Avatar name={e.who} size={24} />
              <div style={{ flex: 1 }}>
                <strong>{e.who}</strong> <span style={{ color: "var(--text-3)" }}>{e.what}</span> <strong>{e.flag}</strong>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{e.when}</div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsLayoutShell>
  );
}

Object.assign(window, {
  SettingsLayoutShell, SettingsSectionNav,
  OwnerSettingsTeamRoles, OwnerSettingsBranding, OwnerSettingsTax,
  OwnerSettingsCancellation, OwnerSettingsPromos, OwnerSettingsPlans,
  OwnerSettingsLoyalty, OwnerSettingsFlags,
});
