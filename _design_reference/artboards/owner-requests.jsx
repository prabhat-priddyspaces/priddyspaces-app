// owner-requests.jsx — booking requests inbox
function OwnerRequests({ theme = "light" }) {
  const requests = [
    { id: 1, name: "Maya Chen", company: "Northwind Studio", email: "maya@northwind.studio", space: "Conf · Riverside 3", date: "Today · 2:00 – 4:00 pm", value: 120, status: "pending", note: "Demo for vendor — whiteboard ready if possible.", payment: "On file", avatar: "MC", urgent: true, age: "18m ago" },
    { id: 2, name: "Ben Larkin", company: "Atlas Labs", email: "ben@atlas.dev", space: "Day pass · 4 desks", date: "Tomorrow", value: 196, status: "pending", note: "Quiet area preferred.", payment: "On file", age: "1h ago" },
    { id: 3, name: "Priya Shah", company: "Foundry Co.", email: "priya@foundry.co", space: "Private office · 12B", date: "May 16 · all day", value: 320, status: "pending", note: "Returning member; same setup as last week.", payment: "Invoice", age: "3h ago" },
    { id: 4, name: "Carlos Vela", company: "Loop", email: "c@loop.so", space: "Conf · Coral Springs", date: "May 17 · 9:00 – 11:00 am", value: 110, status: "approved", note: "—", payment: "Card · paid", age: "Yesterday" },
    { id: 5, name: "Hana Park", company: "—", email: "hp@gmail.com", space: "Day pass · 1 desk", date: "May 18", value: 49, status: "failed", note: "Stripe declined card — retry sent.", payment: "Failed", age: "2d ago" },
    { id: 6, name: "Diego Rivera", company: "Saltworks", email: "diego@salt.work", space: "Conf · Brickell A", date: "May 20 · 10:00 am – 12:00 pm", value: 240, status: "rejected", note: "Owner: dates overlap private event.", payment: "—", age: "3d ago" },
  ];

  const tabs = [
    { id: "all", label: "All", count: 24 },
    { id: "pending", label: "Pending", count: 4, active: true },
    { id: "approved", label: "Approved", count: 18 },
    { id: "failed", label: "Payment failed", count: 1, urgent: true },
    { id: "rejected", label: "Rejected", count: 2 },
  ];

  return (
    <PSShell theme={theme} sidebar="owner"
      title="Requests"
      breadcrumb={["Owner", "Inbox"]}
      actions={<>
        <button className="ps-btn"><Icons.filter size={14} /> Filters</button>
        <button className="ps-btn"><Icons.doc size={14} /> Export</button>
      </>}>

      <div style={{ marginBottom: 14, color: "var(--text-3)", fontSize: 13 }}>
        Review booking requests, capture operator notes, and decide what should be approved.
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--line)" }}>
        {tabs.map(t => (
          <button key={t.id} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 14px",
            background: "transparent", border: "none", cursor: "pointer",
            borderBottom: t.active ? "2px solid var(--brand)" : "2px solid transparent",
            color: t.active ? "var(--text)" : "var(--text-3)",
            fontSize: 13, fontWeight: t.active ? 600 : 500,
            marginBottom: -1,
          }}>
            {t.label}
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 999,
              background: t.urgent ? "var(--ps-danger-bg)" : t.active ? "var(--brand-soft)" : "var(--surface-2)",
              color: t.urgent ? "var(--ps-danger)" : t.active ? "var(--brand)" : "var(--text-3)",
            }}>{t.count}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="ps-btn ps-btn-sm ps-btn-ghost">Newest <Icons.chev_d size={11} /></button>
      </div>

      {/* Bulk bar */}
      <div className="ps-card" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, background: "var(--brand-soft)", borderColor: "var(--brand)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" defaultChecked style={{ accentColor: "var(--brand)" }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>2 selected</span>
        </div>
        <div style={{ height: 16, width: 1, background: "var(--brand)" }} />
        <button className="ps-btn ps-btn-sm" style={{ background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>
          <Icons.check size={12} sw={2.5} /> Approve both
        </button>
        <button className="ps-btn ps-btn-sm"><Icons.mail size={12} /> Message both</button>
        <button className="ps-btn ps-btn-sm" style={{ color: "var(--ps-danger)" }}><Icons.x size={12} sw={2.5} /> Reject</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>Approves auto-charge cards on file</span>
      </div>

      {/* Requests list */}
      <div className="ps-card" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "32px 1.6fr 1.2fr 1fr 110px 110px 120px", padding: "10px 16px", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--surface-2)" }}>
          <div />
          <div>Requester</div>
          <div>Space & time</div>
          <div>Note</div>
          <div>Payment</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>
        {requests.map((r, i) => (
          <div key={r.id} style={{
            display: "grid", gridTemplateColumns: "32px 1.6fr 1.2fr 1fr 110px 110px 120px",
            padding: "12px 16px", alignItems: "center", gap: 8,
            borderTop: i === 0 ? "none" : "1px solid var(--line)",
            background: i < 2 ? "rgba(124,91,245,.03)" : "var(--surface)",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <input type="checkbox" defaultChecked={i < 2} style={{ accentColor: "var(--brand)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <Avatar name={r.name} size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                  {r.urgent && <span className="ps-chip ps-chip-warning" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>Today</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.company || r.email}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{r.space}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r.date}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.note === "—" ? <span style={{ color: "var(--text-4)" }}>No note</span> : r.note}
            </div>
            <div className="ps-num" style={{ fontSize: 13, fontWeight: 600 }}>
              ${r.value}
              <div style={{ fontSize: 10, color: r.payment === "Failed" ? "var(--ps-danger)" : "var(--text-3)", fontFamily: "var(--f-sans)", fontWeight: 400, marginTop: 1 }}>{r.payment}</div>
            </div>
            <div>
              <StatusBadge status={r.status === "rejected" ? "canceled" : r.status === "approved" ? "confirmed" : r.status === "failed" ? "failed" : "pending"} />
              <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 4 }}>{r.age}</div>
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              {r.status === "pending" && (
                <>
                  <button className="ps-btn ps-btn-sm" style={{ height: 28, padding: "0 10px", background: "var(--ps-success)", color: "#fff", borderColor: "var(--ps-success)" }}>
                    <Icons.check size={12} sw={2.5} /> Approve
                  </button>
                  <button className="ps-btn ps-btn-sm ps-btn-ghost" style={{ width: 28, padding: 0, justifyContent: "center" }}>
                    <Icons.more size={14} />
                  </button>
                </>
              )}
              {r.status === "approved" && <button className="ps-btn ps-btn-sm ps-btn-ghost">View</button>}
              {r.status === "failed" && <button className="ps-btn ps-btn-sm" style={{ borderColor: "var(--ps-danger)", color: "var(--ps-danger)" }}>Retry charge</button>}
              {r.status === "rejected" && <button className="ps-btn ps-btn-sm ps-btn-ghost">View</button>}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, fontSize: 12, color: "var(--text-3)" }}>
        <div>Showing 6 of 24 requests</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="ps-btn ps-btn-sm ps-btn-ghost"><Icons.arrow_l size={12} /></button>
          <button className="ps-btn ps-btn-sm" style={{ background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand-soft)" }}>1</button>
          <button className="ps-btn ps-btn-sm ps-btn-ghost">2</button>
          <button className="ps-btn ps-btn-sm ps-btn-ghost">3</button>
          <button className="ps-btn ps-btn-sm ps-btn-ghost">4</button>
          <button className="ps-btn ps-btn-sm ps-btn-ghost"><Icons.arrow_r size={12} /></button>
        </div>
      </div>
    </PSShell>
  );
}

Object.assign(window, { OwnerRequests });
