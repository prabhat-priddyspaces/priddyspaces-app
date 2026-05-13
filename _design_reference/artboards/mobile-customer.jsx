// mobile-customer.jsx — customer mobile screens: booking flow, my bookings, profile, payment, confirmation

function MobileCustomerSuite({ theme = "light" }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      gap: 28, padding: 28, alignContent: "start", justifyItems: "center",
    }}>
      <CPhone title="Booking flow · contact"><MobileCustomerBookingContact theme={theme} /></CPhone>
      <CPhone title="Booking flow · payment"><MobileCustomerPayment theme={theme} /></CPhone>
      <CPhone title="Booking confirmed"><MobileCustomerConfirm theme={theme} /></CPhone>
      <CPhone title="My bookings"><MobileCustomerBookings theme={theme} /></CPhone>
      <CPhone title="Filters bottom sheet"><MobileCustomerFilters theme={theme} /></CPhone>
      <CPhone title="Profile"><MobileCustomerProfile theme={theme} /></CPhone>
    </div>
  );
}

function CPhone({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <IOSDevice width={340} height={720}>
        {children}
      </IOSDevice>
      <div style={{ fontSize: 11, color: "rgba(60,50,40,0.6)" }}>{title}</div>
    </div>
  );
}

function MCShell({ theme, top, children, bottomCTA, nav = "discover", noNav }) {
  return (
    <div className={`ps theme-${theme}`} style={{ width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {top}
      <div style={{ flex: 1, overflow: "auto", padding: bottomCTA ? "0 16px 110px" : noNav ? "0 16px 16px" : "0 16px 76px" }}>
        {children}
      </div>
      {bottomCTA && (
        <div style={{
          position: "absolute", bottom: noNav ? 0 : 64, left: 0, right: 0,
          padding: noNav ? "12px 16px 28px" : "12px 16px",
          background: "var(--bg-elev)",
          borderTop: "1px solid var(--line)",
          display: "flex", gap: 8, alignItems: "center",
          boxShadow: "0 -4px 20px rgba(16,10,31,.06)",
        }}>
          {bottomCTA}
        </div>
      )}
      {!noNav && <CustomerMobileNav active={nav} />}
    </div>
  );
}

function CustomerMobileNav({ active }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      background: "var(--bg-elev)",
      borderTop: "1px solid var(--line)",
      padding: "8px 8px 22px",
      display: "flex", gap: 0,
    }}>
      {[
        { id: "discover", icon: Icons.search, label: "Discover" },
        { id: "bookings", icon: Icons.calendar, label: "Bookings" },
        { id: "saved", icon: Icons.star, label: "Saved" },
        { id: "profile", icon: Icons.user, label: "Profile" },
      ].map(it => (
        <div key={it.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: it.id === active ? "var(--brand)" : "var(--text-3)", padding: "4px 0" }}>
          <it.icon size={20} sw={it.id === active ? 2.2 : 1.6} />
          <span style={{ fontSize: 10, fontWeight: it.id === active ? 600 : 500 }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Booking flow · contact ─────────────────────────────────
function MobileCustomerBookingContact({ theme }) {
  return (
    <MCShell theme={theme} noNav
      top={
        <div style={{ borderBottom: "1px solid var(--line)", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.arrow_l size={15} /></button>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Reserve Riverside 3</div>
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.x size={15} /></button>
          </div>
          {/* Step strip */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {["Sign in", "Your info", "Payment", "Confirm"].map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <div style={{ flex: 1, height: 2, background: i <= 1 ? "var(--brand)" : "var(--line-strong)" }} />}
                <div style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: i < 1 ? "var(--brand)" : i === 1 ? "var(--brand)" : "var(--surface-2)",
                  outline: i === 1 ? "3px solid var(--brand-soft)" : "none",
                }} />
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Step 2 of 4</span><span>Your info</span>
          </div>
        </div>
      }
      bottomCTA={
        <>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ height: 44, padding: "0 14px" }}>Back</button>
          <button className="ps-btn ps-btn-primary" style={{ flex: 1, height: 44, justifyContent: "center" }}>
            Continue to payment <Icons.arrow_r size={14} sw={2.5} />
          </button>
        </>
      }>
      <div style={{ marginTop: 14, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Tell us about your booking</div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, marginBottom: 16 }}>
        Plantation HQ will use this to greet you.
      </div>

      <div className="ps-card" style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Contact</div>
        {[
          { l: "Full name", v: "Jane Miller" },
          { l: "Email", v: "jane@plant.co" },
          { l: "Phone", v: "+1 555 000 0000", optional: true },
          { l: "Company", v: "Northwind Studio", optional: true },
        ].map((f, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, marginBottom: 4 }}>
              {f.l} {f.optional && <span style={{ color: "var(--text-4)", fontWeight: 400 }}>(optional)</span>}
            </label>
            <input className="ps-input" defaultValue={f.v} style={{ fontSize: 13 }} />
          </div>
        ))}
        <label style={{ fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" }}>Message to host <span style={{ color: "var(--text-4)", fontWeight: 400 }}>(optional)</span></label>
        <textarea className="ps-input" style={{ height: 60, padding: 10, resize: "none" }} placeholder="Whiteboard prefs, A/V needs, accessibility…" />
      </div>

      <div className="ps-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Add-ons</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>Optional extras</div>
        {[
          { icon: Icons.coffee, label: "Coffee & pastry tray", price: "+$28", sel: true },
          { icon: Icons.users, label: "Tech setup", price: "Free", sel: true, free: true },
          { icon: Icons.printer, label: "Print package", price: "+$12" },
        ].map((a, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
            <input type="checkbox" defaultChecked={a.sel} style={{ accentColor: "var(--brand)" }} />
            <a.icon size={14} color="var(--text-3)" />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{a.label}</span>
            <span className="ps-num" style={{ fontSize: 12, fontWeight: 600, color: a.free ? "var(--ps-success)" : "var(--text)" }}>{a.price}</span>
          </label>
        ))}
      </div>
    </MCShell>
  );
}

// ─── Booking flow · payment ─────────────────────────────────
function MobileCustomerPayment({ theme }) {
  return (
    <MCShell theme={theme} noNav
      top={
        <div style={{ borderBottom: "1px solid var(--line)", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.arrow_l size={15} /></button>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Payment</div>
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.x size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {["Sign in", "Your info", "Payment", "Confirm"].map((_, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ flex: 1, height: 2, background: i <= 2 ? "var(--brand)" : "var(--line-strong)" }} />}
                <div style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: i <= 2 ? "var(--brand)" : "var(--surface-2)",
                  outline: i === 2 ? "3px solid var(--brand-soft)" : "none",
                }} />
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Step 3 of 4</span><span>Payment</span>
          </div>
        </div>
      }
      bottomCTA={
        <button className="ps-btn ps-btn-primary" style={{ width: "100%", height: 48, justifyContent: "center", fontSize: 14 }}>
          <Icons.zap size={14} sw={2.5} /> Pay $100.75
        </button>
      }>
      {/* Apple Pay express */}
      <button className="ps-btn" style={{
        width: "100%", marginTop: 14, height: 48, justifyContent: "center",
        background: "#000", color: "#fff", borderColor: "#000", fontSize: 14,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M17 2c-2.6 0-4 2-4 2s.4 2.4 1.5 3.5C15.7 8.8 18 9 18 9s-.4-2.6-1-3.5C16 4 14 2 17 2zM5 9c2 0 3 1 5 1s3-1 5-1c3 0 5 2 5 6s-3 8-5 8c-1 0-2-1-3-1s-2 1-3 1c-2 0-5-4-5-8s2-6 4-6z"/></svg>
        Pay with Apple Pay
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0", color: "var(--text-3)", fontSize: 11 }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        OR PAY WITH CARD
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      <div className="ps-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Saved cards</div>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ height: 24, padding: "0 6px", color: "var(--brand)" }}><Icons.plus size={11} /> Add new</button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 10px", borderRadius: 10, border: "1px solid var(--brand)", background: "var(--brand-soft)", marginBottom: 8 }}>
          <input type="radio" defaultChecked style={{ accentColor: "var(--brand)" }} />
          <div style={{ width: 38, height: 26, borderRadius: 5, background: "linear-gradient(135deg, #635BFF, #4138e5)", display: "grid", placeItems: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>VISA</div>
          <div style={{ flex: 1 }}>
            <div className="ps-num" style={{ fontSize: 12, fontWeight: 600 }}>•••• 4982</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>Exp 09/28</div>
          </div>
          <span className="ps-chip ps-chip-success" style={{ height: 18, fontSize: 10 }}>Default</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 10px", borderRadius: 10, border: "1px solid var(--line)" }}>
          <input type="radio" style={{ accentColor: "var(--brand)" }} />
          <div style={{ width: 38, height: 26, borderRadius: 5, background: "linear-gradient(135deg, #F7B500, #E27D00)", display: "grid", placeItems: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>MC</div>
          <div style={{ flex: 1 }}>
            <div className="ps-num" style={{ fontSize: 12, fontWeight: 600 }}>•••• 1140</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>Exp 04/27</div>
          </div>
        </label>
      </div>

      <div className="ps-card" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Total</div>
        {[
          ["Riverside 3 · 2h", "$60.00"],
          ["Coffee & pastry tray", "$28.00"],
          ["Tech setup", "Free"],
          ["Service fee", "$6.16"],
          ["Tax (7%)", "$6.59"],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>
            <span>{l}</span><span className="ps-num">{v}</span>
          </div>
        ))}
        <hr className="ps-divider" style={{ margin: "8px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Total due</span>
          <span className="ps-num" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>$100.75</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 10, color: "var(--text-3)" }}>
        <Icons.check size={11} color="var(--ps-success)" sw={2.5} /> Secured by Stripe · 256-bit TLS · PCI DSS
      </div>
    </MCShell>
  );
}

// ─── Booking confirmed ──────────────────────────────────────
function MobileCustomerConfirm({ theme }) {
  return (
    <MCShell theme={theme} nav="bookings"
      top={null}
      bottomCTA={
        <>
          <button className="ps-btn ps-btn-sm" style={{ flex: 1, height: 40, justifyContent: "center" }}>
            <Icons.calendar size={13} /> Add to calendar
          </button>
          <button className="ps-btn ps-btn-primary" style={{ flex: 1, height: 40, justifyContent: "center" }}>
            <Icons.map size={13} /> Directions
          </button>
        </>
      }>
      {/* Success hero */}
      <div style={{
        marginTop: 20,
        background: "linear-gradient(135deg, var(--ps-mint-50), var(--ps-mint-100))",
        borderRadius: 18,
        padding: 22,
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 0%, rgba(46,184,136,.18) 0%, transparent 60%)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: "var(--ps-mint-500)", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 14px", boxShadow: "0 8px 24px rgba(46,184,136,.4)" }}>
            <Icons.check size={32} sw={3} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ps-mint-700)" }}>You're booked!</div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 }}>Plantation HQ will message you at jane@plant.co.</div>
        </div>
      </div>

      <div className="ps-card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Confirmation</span>
          <span className="ps-num" style={{ fontSize: 11, fontWeight: 600 }}>· PR-92840</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Riverside 3 · Plantation HQ</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Conference Room · 4 seats</div>

        <hr className="ps-divider" style={{ margin: "14px 0" }} />

        {[
          [Icons.calendar, "Wed, May 13, 2026", "2:00 – 4:00 pm · 2h"],
          [Icons.pin, "12301 W Sunrise Blvd", "Plantation, FL · Free parking"],
          [Icons.users, "Jane Miller", "+3 attendees · Northwind Studio"],
          [Icons.dollar, "$100.75 paid", "VISA •••• 4982"],
        ].map(([I, t, s], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px dashed var(--line)" }}>
            <I size={14} color="var(--text-3)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{t}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{s}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        {[
          { icon: Icons.mail, label: "Message host" },
          { icon: Icons.users, label: "Invite attendees" },
          { icon: Icons.x, label: "Cancel booking", danger: true },
        ].map((a, i) => (
          <button key={i} className="ps-btn" style={{ justifyContent: "flex-start", height: 44, fontSize: 13, color: a.danger ? "var(--ps-danger)" : "var(--text)", borderColor: "var(--line)" }}>
            <a.icon size={14} /> {a.label}
            <div style={{ flex: 1 }} />
            <Icons.chev_r size={13} color="var(--text-4)" />
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--ps-mint-50)", borderRadius: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <Icons.star size={14} color="var(--ps-mint-700)" fill="var(--ps-mint-500)" />
        <div style={{ fontSize: 11, color: "var(--ps-mint-700)" }}>
          <strong>You earned 100 points</strong> — total 1,240 (Silver)
        </div>
      </div>
    </MCShell>
  );
}

// ─── My bookings ────────────────────────────────────────────
function MobileCustomerBookings({ theme }) {
  const upcoming = [
    { date: "Wed May 13", time: "2:00 – 4:00 pm", name: "Riverside 3", loc: "Plantation HQ", price: "$100.75", status: "confirmed", days: "Today" },
    { date: "Mon May 18", time: "9:00 am – 12:00 pm", name: "Brickell Suite A", loc: "Brickell Commons", price: "$210", status: "confirmed", days: "in 5d" },
    { date: "Fri May 22", time: "All day", name: "Day pass", loc: "Coral Springs", price: "$29", status: "pending", days: "in 9d" },
  ];
  return (
    <MCShell theme={theme} nav="bookings"
      top={
        <div style={{ padding: "12px 16px 4px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>My bookings</div>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 30, padding: 0, justifyContent: "center", height: 30 }}><Icons.search size={15} /></button>
        </div>
      }>
      <div style={{ display: "flex", gap: 4, padding: "6px 0 12px" }}>
        {[
          { l: "Upcoming", c: 3, on: true },
          { l: "Past", c: 24 },
          { l: "Canceled", c: 2 },
        ].map((t, i) => (
          <button key={i} className="ps-chip" style={{
            height: 28, padding: "0 14px",
            background: t.on ? "var(--brand)" : "var(--surface)",
            color: t.on ? "#fff" : "var(--text-2)",
            border: t.on ? "1px solid var(--brand)" : "1px solid var(--line)",
            fontWeight: 600,
          }}>{t.l} <span style={{ opacity: 0.7 }}>{t.c}</span></button>
        ))}
      </div>

      {upcoming.map((b, i) => (
        <div key={i} className="ps-card" style={{ padding: 0, marginBottom: 10, overflow: "hidden", borderColor: b.days === "Today" ? "var(--brand)" : "var(--line)" }}>
          <div style={{ display: "flex", gap: 0 }}>
            <div style={{
              width: 68, padding: "12px 0", textAlign: "center",
              background: b.days === "Today" ? "var(--brand)" : "var(--surface-2)",
              color: b.days === "Today" ? "#fff" : "var(--text-2)",
              borderRight: "1px solid var(--line)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>
                {b.date.split(" ")[0]}
              </div>
              <div className="ps-num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: "2px 0" }}>{b.date.split(" ")[2]}</div>
              <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.7 }}>{b.date.split(" ")[1]}</div>
            </div>
            <div style={{ flex: 1, padding: "12px 14px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</span>
                {b.days === "Today" && <span className="ps-chip ps-chip-mint" style={{ height: 16, fontSize: 9 }}>Today</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.loc}</div>
              <div className="ps-num" style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>{b.time}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <StatusBadge status={b.status} />
                <span className="ps-num" style={{ fontSize: 13, fontWeight: 600 }}>{b.price}</span>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: "var(--brand-soft)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--brand)", color: "#fff", display: "grid", placeItems: "center" }}>
          <Icons.sparkle size={16} sw={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Book again?</div>
          <div style={{ fontSize: 10, color: "var(--text-3)" }}>You've used Riverside 3 four times</div>
        </div>
        <button className="ps-btn ps-btn-sm" style={{ background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>Rebook</button>
      </div>
    </MCShell>
  );
}

// ─── Filters bottom sheet ───────────────────────────────────
function MobileCustomerFilters({ theme }) {
  return (
    <div className={`ps theme-${theme}`} style={{ width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", position: "relative", overflow: "hidden" }}>
      {/* Dimmed background hint */}
      <div style={{ filter: "blur(2px) brightness(0.7)", pointerEvents: "none", height: "100%" }}>
        <CustomerMobileMarketplace theme={theme} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(16,10,31,0.45)" }} />

      {/* Sheet */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: "78%",
        background: "var(--bg-elev)",
        borderRadius: "20px 20px 0 0",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -20px 60px rgba(0,0,0,.3)",
      }}>
        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--line-strong)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "8px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Filters</div>
          <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ color: "var(--text-3)" }}>Reset</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginTop: 8, marginBottom: 8 }}>Type</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
            {[
              { l: "Day pass", on: true },
              { l: "Meeting", on: true },
              { l: "Private office" },
              { l: "Event" },
            ].map((t, i) => (
              <button key={i} className="ps-chip" style={{
                height: 36, padding: "0 14px", justifyContent: "center",
                background: t.on ? "var(--brand)" : "var(--surface)",
                color: t.on ? "#fff" : "var(--text-2)",
                border: t.on ? "1px solid var(--brand)" : "1px solid var(--line)",
                fontWeight: 600, fontSize: 12,
              }}>{t.l}</button>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 8 }}>Price · per hour</div>
          <div style={{ height: 30, position: "relative", marginBottom: 24 }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 14, height: 4, background: "var(--surface-2)", borderRadius: 99 }} />
            <div style={{ position: "absolute", left: "10%", right: "30%", top: 14, height: 4, background: "var(--brand)", borderRadius: 99 }} />
            <div style={{ position: "absolute", left: "10%", top: 8, width: 16, height: 16, borderRadius: 999, background: "#fff", border: "3px solid var(--brand)", boxShadow: "var(--shadow-sm)" }} />
            <div style={{ position: "absolute", left: "70%", top: 8, width: 16, height: 16, borderRadius: 999, background: "#fff", border: "3px solid var(--brand)", boxShadow: "var(--shadow-sm)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginTop: -16, marginBottom: 16 }}>
            <span>$10</span><span className="ps-num">$10 – $80</span><span>$200+</span>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 8 }}>Amenities</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {[
              ["WiFi", Icons.wifi, true],
              ["Coffee", Icons.coffee, true],
              ["Parking", Icons.car, false],
              ["Printer", Icons.printer, false],
              ["AC", Icons.zap, false],
              ["Whiteboard", Icons.doc, false],
            ].map(([n, I, on], i) => (
              <button key={i} className="ps-chip" style={{
                height: 32, padding: "0 12px",
                background: on ? "var(--brand-soft)" : "var(--surface)",
                color: on ? "var(--brand-strong)" : "var(--text-2)",
                border: on ? "1px solid var(--brand)" : "1px solid var(--line)",
                fontWeight: 500,
              }}>
                <I size={12} sw={2} /> {n}
                {on && <Icons.check size={11} sw={2.5} />}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 8 }}>Capacity</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["1", "2-4", "5-8", "9+"].map((n, i) => (
              <button key={n} className="ps-chip" style={{
                flex: 1, height: 36, justifyContent: "center",
                background: i === 1 ? "var(--brand)" : "var(--surface)",
                color: i === 1 ? "#fff" : "var(--text-2)",
                border: i === 1 ? "1px solid var(--brand)" : "1px solid var(--line)",
                fontWeight: 600, fontSize: 13,
              }}>{n}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 16px 28px", borderTop: "1px solid var(--line)" }}>
          <button className="ps-btn ps-btn-primary" style={{ width: "100%", height: 46, justifyContent: "center" }}>
            Show 12 spaces
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Profile ────────────────────────────────────────────────
function MobileCustomerProfile({ theme }) {
  return (
    <MCShell theme={theme} nav="profile"
      top={
        <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, borderBottom: "1px solid var(--line)", paddingBottom: 18 }}>
          <Avatar name="Jane Miller" size={64} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>Jane Miller</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>jane@plant.co · Member since 2024</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="ps-chip ps-chip-violet" style={{ height: 24, padding: "0 10px" }}>
              <Icons.star size={11} sw={2.5} /> Silver · 1,240 pts
            </span>
            <span className="ps-chip" style={{ height: 24, padding: "0 10px" }}>
              <Icons.check size={11} color="var(--ps-success)" sw={2.5} /> Verified
            </span>
          </div>
        </div>
      }>
      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, padding: "14px 0 8px" }}>
        {[
          ["Bookings", "27"],
          ["Spent", "$3.2k"],
          ["Hours saved", "84"],
        ].map(([l, v]) => (
          <div key={l} style={{ padding: "10px", background: "var(--surface-2)", borderRadius: 10, textAlign: "center" }}>
            <div className="ps-num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Sections */}
      {[
        { group: "Workspace", items: [
          { icon: Icons.calendar, label: "My bookings", sub: "3 upcoming" },
          { icon: Icons.star, label: "Saved spaces", sub: "12 saved", count: 12 },
          { icon: Icons.users, label: "Teams", sub: "Northwind Studio" },
        ]},
        { group: "Account", items: [
          { icon: Icons.card, label: "Payment methods", sub: "VISA •••• 4982 · default" },
          { icon: Icons.doc, label: "Receipts & invoices" },
          { icon: Icons.bell, label: "Notifications", sub: "Email + push" },
          { icon: Icons.globe, label: "Language & currency", sub: "English · USD" },
        ]},
        { group: "Loyalty & rewards", items: [
          { icon: Icons.sparkle, label: "Priddy Points", sub: "1,240 pts · 760 to Gold", badge: "Silver" },
          { icon: Icons.zap, label: "Invite friends", sub: "Get 500 pts each" },
        ]},
        { group: "Support", items: [
          { icon: Icons.mail, label: "Help center" },
          { icon: Icons.doc, label: "Legal & policies" },
        ]},
      ].map((sec, si) => (
        <div key={si} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 6, padding: "0 4px" }}>{sec.group}</div>
          <div className="ps-card" style={{ overflow: "hidden" }}>
            {sec.items.map((it, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", color: "var(--text-2)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                  <it.icon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</div>
                  {it.sub && <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>}
                </div>
                {it.badge && <span className="ps-chip ps-chip-violet" style={{ height: 18, fontSize: 10 }}>{it.badge}</span>}
                {it.count && <span style={{ fontSize: 11, color: "var(--text-3)" }} className="ps-num">{it.count}</span>}
                <Icons.chev_r size={13} color="var(--text-4)" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button style={{ width: "100%", marginTop: 16, padding: 12, background: "transparent", border: "1px solid var(--line-strong)", borderRadius: 12, color: "var(--ps-danger)", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
        Sign out
      </button>
    </MCShell>
  );
}

Object.assign(window, {
  MobileCustomerSuite,
  MobileCustomerBookingContact, MobileCustomerPayment, MobileCustomerConfirm,
  MobileCustomerBookings, MobileCustomerFilters, MobileCustomerProfile,
  MCShell, CustomerMobileNav,
});
