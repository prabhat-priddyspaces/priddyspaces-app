// customer-listing.jsx — listing detail with booking widget
function CustomerListing({ theme = "light" }) {
  return (
    <div className={`ps theme-${theme}`} style={{
      width: "100%", height: "100%",
      background: "var(--bg)", color: "var(--text)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <MarketplaceTopbar />

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>
          <a style={{ color: "var(--brand)", cursor: "pointer" }}>Discover</a>
          <Icons.chev_r size={11} />
          <span>Plantation, FL</span>
          <Icons.chev_r size={11} />
          <span>Conference rooms</span>
          <Icons.chev_r size={11} />
          <span style={{ color: "var(--text)", fontWeight: 500 }}>Riverside 3</span>
        </div>

        {/* Gallery */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, marginBottom: 20, height: 360 }}>
          <GalleryTile span="2/1" hero idx={0} />
          <GalleryTile idx={1} />
          <GalleryTile idx={2} />
          <GalleryTile idx={3} />
          <GalleryTile idx={4} showAll />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 28 }}>
          {/* Left content */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Riverside 3 · Plantation HQ</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13, color: "var(--text-3)" }}>
                  <Icons.pin size={13} /> 12301 W Sunrise Blvd, Plantation, FL 33323
                  <span>·</span>
                  <Icons.star size={13} fill="var(--ps-warning)" color="var(--ps-warning)" />
                  <strong style={{ color: "var(--text)" }}>4.92</strong>
                  <span>(218 reviews)</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="ps-btn ps-btn-sm ps-btn-ghost"><Icons.star size={13} /> Save</button>
                <button className="ps-btn ps-btn-sm ps-btn-ghost"><Icons.arrow_r size={13} /> Share</button>
              </div>
            </div>

            {/* Quick facts */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[
                { icon: Icons.users, label: "Up to 4" },
                { icon: Icons.clock, label: "1h minimum" },
                { icon: Icons.zap, label: "Instant book" },
                { icon: Icons.check, label: "Verified host" },
              ].map((f, i) => (
                <span key={i} className="ps-chip" style={{ height: 28, padding: "0 12px", background: "var(--surface)", border: "1px solid var(--line)" }}>
                  <f.icon size={12} sw={2} /> {f.label}
                </span>
              ))}
            </div>

            {/* Host */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
              <Avatar name="Plantation HQ" size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Hosted by Plantation HQ</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Superhost · 4 years on Priddyspaces · usually replies in 12 min</div>
              </div>
              <button className="ps-btn ps-btn-sm"><Icons.mail size={13} /> Message</button>
            </div>

            <hr className="ps-divider" style={{ margin: "20px 0" }} />

            {/* Description */}
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>About this space</h3>
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.65, marginBottom: 8 }}>
              A bright, glass-walled conference room on the third floor with a 65" 4K display, dual whiteboards, and Logitech Rally
              for hybrid meetings. Coffee bar and reception are 30 seconds away. Perfect for client pitches, vendor demos,
              and small offsites.
            </p>
            <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ color: "var(--brand)", padding: "0 4px" }}>Show more →</button>

            <hr className="ps-divider" style={{ margin: "24px 0" }} />

            {/* Amenities */}
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>What's included</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                [Icons.wifi, "Gigabit WiFi"],
                [Icons.coffee, "Coffee & tea bar"],
                [Icons.car, "Free parking · 30 spots"],
                [Icons.printer, "Color printer · A3/A4"],
                [Icons.zap, "Air conditioning"],
                [Icons.box, "65\" display · HDMI/AirPlay"],
                [Icons.doc, "Dual whiteboards"],
                [Icons.users, "Logitech Rally hybrid kit"],
                [Icons.globe, "Reception desk on-site"],
              ].map(([I, l], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <I size={16} color="var(--text-3)" sw={1.8} /> {l}
                </div>
              ))}
            </div>

            <hr className="ps-divider" style={{ margin: "24px 0" }} />

            {/* Hours */}
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Hours & access</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
              {[
                ["Monday", "9:00 AM – 5:00 PM"],
                ["Tuesday", "9:00 AM – 5:00 PM"],
                ["Wednesday", "9:00 AM – 5:00 PM", true],
                ["Thursday", "9:00 AM – 5:00 PM"],
                ["Friday", "9:00 AM – 5:00 PM"],
                ["Sat/Sun", "Closed", false, true],
              ].map(([d, h, today, off]) => (
                <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px dashed var(--line)", color: off ? "var(--text-4)" : "var(--text-2)", fontWeight: today ? 600 : 400 }}>
                  <span>{d}{today && <span className="ps-chip ps-chip-mint" style={{ marginLeft: 6, height: 16, fontSize: 9, padding: "0 5px" }}>Today</span>}</span>
                  <span className="ps-num">{h}</span>
                </div>
              ))}
            </div>

            <hr className="ps-divider" style={{ margin: "24px 0" }} />

            {/* Map preview */}
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Location</h3>
            <div style={{ borderRadius: 14, overflow: "hidden", height: 220, position: "relative", border: "1px solid var(--line)" }}>
              <MapMock />
              <div style={{ position: "absolute", bottom: 12, left: 12, padding: 10, background: "var(--surface)", borderRadius: 10, boxShadow: "var(--shadow-md)", display: "flex", alignItems: "center", gap: 8 }}>
                <Icons.pin size={14} color="var(--brand)" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Plantation HQ</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)" }}>Free parking · Brightline 8 min</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: booking widget */}
          <BookingWidget />
        </div>
      </div>
    </div>
  );
}

function GalleryTile({ idx = 0, hero, showAll }) {
  const gradients = [
    "linear-gradient(135deg, #C5BAFF, #9576FF)",
    "linear-gradient(135deg, #D2F4E6, #7FDDB8)",
    "linear-gradient(135deg, #FFE2C4, #FFB57A)",
    "linear-gradient(135deg, #F0D5FF, #B59FFF)",
    "linear-gradient(135deg, #CCE7FF, #8FBFFB)",
  ];
  return (
    <div style={{
      gridColumn: hero ? "1 / 2" : "auto",
      gridRow: hero ? "1 / 3" : "auto",
      borderRadius: hero ? "16px 4px 4px 16px" : showAll ? "4px 4px 16px 4px" : 4,
      background: gradients[idx % gradients.length],
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `radial-gradient(circle at 30% 70%, rgba(255,255,255,.4), transparent 50%), radial-gradient(circle at 70% 30%, rgba(0,0,0,.05), transparent 50%)`,
      }} />
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", opacity: 0.45 }}>
        <Icons.building size={hero ? 56 : 32} sw={1.2} />
      </div>
      {showAll && (
        <button className="ps-btn ps-btn-sm" style={{
          position: "absolute", bottom: 10, right: 10,
          background: "var(--surface)", boxShadow: "var(--shadow-sm)",
        }}>
          Show all 12 photos
        </button>
      )}
    </div>
  );
}

function BookingWidget() {
  return (
    <div style={{ position: "sticky", top: 20 }}>
      <div className="ps-card" style={{ padding: 22, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
          <span className="ps-num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em" }}>$30</span>
          <span style={{ fontSize: 14, color: "var(--text-3)" }}>/ hour</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-3)" }}>
            <Icons.star size={12} fill="var(--ps-warning)" color="var(--ps-warning)" />
            <strong style={{ color: "var(--text)" }}>4.92</strong>
            <span>(218)</span>
          </div>
        </div>

        {/* Rate toggle */}
        <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--surface-2)", borderRadius: 10, marginBottom: 12 }}>
          {["Hourly", "Day rate", "Monthly"].map((r, i) => (
            <button key={r} className="ps-btn ps-btn-sm" style={{
              flex: 1, height: 32, justifyContent: "center",
              background: i === 0 ? "var(--surface)" : "transparent",
              boxShadow: i === 0 ? "var(--shadow-xs)" : "none",
              border: "1px solid transparent",
              fontWeight: i === 0 ? 600 : 500,
              color: i === 0 ? "var(--text)" : "var(--text-3)",
            }}>{r}</button>
          ))}
        </div>

        {/* Date */}
        <div style={{ border: "1px solid var(--line-strong)", borderRadius: 12, padding: 12, marginBottom: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 4 }}>Date</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.calendar size={14} color="var(--brand)" />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Wed, May 13, 2026</span>
          </div>
        </div>

        {/* Time row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 0 }}>
          <div style={{ border: "1px solid var(--line-strong)", borderTopWidth: 0, borderRight: "none", borderRadius: "0 0 0 12px", padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 4 }}>Start</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.clock size={14} color="var(--text-3)" />
              <span style={{ fontSize: 14, fontWeight: 500 }} className="ps-num">2:00 pm</span>
              <Icons.chev_d size={11} color="var(--text-3)" />
            </div>
          </div>
          <div style={{ border: "1px solid var(--line-strong)", borderTopWidth: 0, borderRadius: "0 0 12px 0", padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 4 }}>End</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.clock size={14} color="var(--text-3)" />
              <span style={{ fontSize: 14, fontWeight: 500 }} className="ps-num">4:00 pm</span>
              <Icons.chev_d size={11} color="var(--text-3)" />
            </div>
          </div>
        </div>

        {/* Available slots */}
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 8 }}>Available today</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
            {[
              { t: "9am", on: true },
              { t: "10am", on: false },
              { t: "11am", on: true },
              { t: "12pm", on: true },
              { t: "1pm", on: false },
              { t: "2pm", sel: true },
              { t: "3pm", sel: true },
              { t: "4pm", on: true },
            ].map(s => (
              <div key={s.t} style={{
                height: 30, borderRadius: 7,
                background: s.sel ? "var(--brand)" : s.on ? "var(--surface)" : "var(--surface-2)",
                color: s.sel ? "#fff" : s.on ? "var(--text-2)" : "var(--text-4)",
                border: s.on || s.sel ? "1px solid " + (s.sel ? "var(--brand)" : "var(--line-strong)") : "1px dashed var(--line)",
                display: "grid", placeItems: "center",
                fontSize: 11, fontWeight: 600,
                textDecoration: !s.on && !s.sel ? "line-through" : "none",
                cursor: s.on || s.sel ? "pointer" : "not-allowed",
                fontFamily: "var(--f-mono)",
              }}>{s.t}</div>
            ))}
          </div>
        </div>

        {/* Estimate */}
        <div style={{ background: "var(--brand-soft)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-2)" }}>$30 × 2 hours</span>
            <span className="ps-num">$60.00</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
            <span style={{ color: "var(--text-2)" }}>Service fee</span>
            <span className="ps-num">$4.20</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
            <span style={{ color: "var(--text-2)" }}>Tax (7%)</span>
            <span className="ps-num">$4.49</span>
          </div>
          <hr style={{ height: 1, border: 0, background: "var(--line)", margin: "8px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
            <span>Estimated total</span>
            <span className="ps-num">$68.69</span>
          </div>
        </div>

        <button className="ps-btn ps-btn-primary" style={{ width: "100%", height: 46, justifyContent: "center", fontSize: 14 }}>
          <Icons.zap size={14} sw={2.5} /> Reserve · $68.69
        </button>
        <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", marginTop: 10 }}>
          You won't be charged yet. Free cancellation up to 24h before.
        </div>
      </div>

      {/* Trust strip */}
      <div className="ps-card" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--ps-success-bg)", color: "var(--ps-success)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
            <Icons.check size={14} sw={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>Verified host · payments by Stripe</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Your booking is protected by our resolution policy.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CustomerListing, BookingWidget, GalleryTile });
