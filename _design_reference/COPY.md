# Copy — Verbatim user-facing strings

> Copy these exactly. Don't reword, don't auto-correct em-dashes, don't change punctuation. If a string seems off — ship it anyway and flag it as a separate issue.

---

## Owner sidebar — section labels

- `Overview` · Dashboard, Calendar, Requests
- `Operations` · Members, Locations, Inventory, Team
- `Growth` · Marketing, Loyalty, Analytics
- `Finance` · Payments, Invoices

## Customer sidebar

- `Workspace` · Discover, My bookings, Memberships, Invoices
- `Account` · Profile, Billing

## Sidebar search button

- Placeholder: `Search…`
- Shortcut hint: `⌘K`

---

## Owner Dashboard — populated

- Page badge: `Live · Plantation HQ`
- Greeting: `Good morning, Jane.`
- Sub: `4 requests waiting · 12 bookings today · occupancy peaking at 2pm.`
- AI strip chip: `AI summary ready`

### KPI labels
- `MTD Revenue` · `$48,260` · `vs. $42.9k last month`
- `Bookings` · `284` · `63 booked this week`
- `Occupancy` · `76%` · `Peak 2pm-4pm Wed`
- `Active members` · `142` · `3 churned this month`

### Today timeline panel
- Title: `Today · 5 locations · 18 rooms`
- Sub: `Wed, May 13 — 11:24am`
- View tabs: `Day` · `Week` · `Month`

### Pending requests panel
- Title: `Pending requests`
- Sub: `4 waiting · oldest 18m`
- CTA: `Open inbox →`

### Revenue panel
- Title: `Revenue · last 30 days`
- Sub: `Net of refunds & platform fees`
- Footer stats: `Gross` · `Refunded` · `Platform fees` · `Owner net`

### Locations panel
- Title: `Locations`
- Sub: `5 active · 1 onboarding`
- CTA: `Manage →`

---

## Owner Dashboard — empty / onboarding

- Page badge: `Onboarding`
- Hero title: `Welcome to Priddyspaces, Jane.`
- Hero body: `You're 4 steps from going live. We'll connect Stripe last so your first booking can pay.`
- Hero CTA: `Continue setup →`
- Progress steps: `Account` · `Organization` · `First location` · `Add a room` · `Connect Stripe` · `Invite team`

### Onboarding cards
1. `Add your first location` · `Address, hours, amenities — the public marketplace pulls from this.` · CTA: `Add location` · `~ 3 min`
2. `Set up rooms or desks` · `Pricing per hour / day / month, capacity, photos, buffer time.` · CTA: `Add a room` · `~ 5 min`
3. `Connect Stripe` · `Accept bookings and run subscriptions through your own Stripe account.` · CTA: `Connect Stripe` · `~ 2 min`

### Muted KPI subs
- `Connect Stripe to track`
- `Add a room to start`
- `We'll start measuring once you go live`
- `Invite or migrate`

### Resources section
- Title: `While you're setting up`
- Cards:
  - `Import existing members` · `Bring members from a CSV or Cobot export.`
  - `Publish to marketplace` · `Your location appears at priddyspaces.com once live.`
  - `Invite your team` · `Owners, admins, staff — each with their own access.`

---

## Calendar

- Page title: `Calendar`
- View pills: `Day · Week · Month · Timeline · List`
- Filter labels: `Locations` · `Type`
- Type chips: `Meeting room` · `Private office` · `Day pass`
- Search placeholder: `Search member, company, room…`
- Inspector empty state: pick a booking

---

## Requests

- Page title: `Requests`
- Page sub: `Review booking requests, capture operator notes, and decide what should be approved.`
- Tabs: `All` · `Pending` · `Approved` · `Payment failed` · `Rejected`
- Bulk bar: `N selected` · CTAs `Approve both` · `Message both` · `Reject` — explainer right-aligned: `Approves auto-charge cards on file`
- Empty state: `No requests yet.`
- Row chip for today: `Today`
- Action buttons: `Approve` · `Retry charge` · `View`

---

## Analytics

- Page title: `Analytics`
- Page sub: `Occupancy, revenue, retention, and peak hours across your portfolio.`
- Tabs: `Overview` · `Occupancy` · `Revenue` · `Members` · `Peak hours`

### KPI labels
- `Revenue (owner net)` · `vs prior period`
- `Bookings` · `63 this week`
- `Occupancy` · `Peak 2pm-4pm`
- `Active members` · `3 churned`

### Charts
- `Revenue · daily` · sub `Net of refunds & platform fees · $48,260 last 30d`
- Range pills: `Daily` · `Weekly` · `Monthly`
- `By space type` · sub `Revenue mix`
- `Peak hours · all locations` · sub `Darker means more bookings. Tap a cell to drill in.`
- Heatmap legend: `Less` · `More` · `Peak: Wed 2–4pm`
- `Top members` · `By revenue, last 30d`

### Bottom strip cards
- `Retention` · `Returning vs prior window`
- `Avg booking value` · `vs $163 last period`
- `Cancellations` · `As % of confirmed` · `9 cancellations · 1 no-show`

---

## Locations

- Page title: `Locations`
- Page sub: `Manage locations and the rooms available at each site. Public marketplace pulls from this directly.`
- Status chips: `Live` · `Onboarding` · `Primary`
- Card metric labels: `Rooms` · `Occupancy` · `MTD net`
- Card actions: `Manage rooms` · `Edit`
- Add-card title: `Add a new location`
- Add-card body: `Address, hours, amenities — appears on the marketplace once you add rooms.`

---

## Settings

- Page title: `Settings`
- Save button: `Save changes`

### Section nav groups
`Organization` · `Operations` · `Growth` · `Platform`

### Items
- `Profile` · `Branding & domain` · `Team & roles`
- `Amenities` · `Pricing rules` · `Tax` · `Cancellation policies`
- `Promo codes` · `Membership plans` · `Loyalty`
- `Stripe` · `AI assistant` · `Feature flags`

### Organization profile section
- Title: `Organization profile`
- Sub: `The name members see at checkout and on receipts.`
- Field labels: `Display name` · `Public slug` · `Support email` · `Public phone`
- Display-name hint: `Appears on the marketplace.`

### Amenities section
- Title: `Amenities`
- Sub: `Members filter by these on the marketplace.`
- Custom-amenity button: `Custom amenity`

### Pricing rules section
- Title: `Pricing rules`
- Sub: `Override hourly / daily / monthly base rates per space, weekday, or time-of-day.`
- Add button: `Add rule`

### Stripe section
- Title: `Stripe`
- Sub: `Accept bookings and process subscriptions through your own Stripe account.`
- Badge: `Connected`
- Account row: `Stripe · acct_1Q8r…fX2` · `Live mode · USD · payouts to BoA •••• 4982`
- Buttons: `Open dashboard` · `Disconnect`
- Stat labels: `Platform fee` (`2.9% + $0.30`) · `Payout schedule` (`Daily, T+2`) · `Statement descriptor` (`PRIDDY · PLANTATION`)

### AI assistant policies section
- Title: `AI assistant policies`
- Sub: `What the assistant is allowed to do without owner approval.`
- Toggles:
  - `Auto-approve recurring members under $200`
  - `Send confirmation emails on owner's behalf`
  - `Suggest pricing changes weekly`
  - `Auto-cancel no-shows after 30 min`
  - `Reply to FAQ inquiries (read-only)`

---

## Customer Marketplace

- Top nav: `Discover` · `How it works` · `For hosts` · `Help` · `List your space` · `Sign in` · `Get started`
- Hero title: `Find a workspace by the hour, day, or month.`
- Hero sub: `3,240 spaces · 124 cities · book in under 60 seconds`

### Category pills
- `Coworking` / `Day passes`
- `Meeting rooms` / `Hourly`
- `Private offices` / `Monthly`
- `Event spaces` / `Half-day`

### Search bar field labels
`Where` · `When` · `Capacity` · CTA: `Search`

### Filter chip examples
`Under $50/hr` · `WiFi` · `Coffee` · `Parking` · `AC` · `Whiteboard` · `Open today` · `All filters`

### Result count text
`12 spaces within 25 mi · 3 available now`
Sort default: `Recommended`

### Map pin preview
- Status chip: `Open now`
- Format: `From $30/hr · 4.92 ★`
- CTA: `View`

---

## Customer Listing

- Breadcrumb: `Discover › Plantation, FL › Conference rooms › Riverside 3`
- Title: `Riverside 3 · Plantation HQ`
- Quick facts: `Up to 4` · `1h minimum` · `Instant book` · `Verified host`
- Host: `Hosted by Plantation HQ` · `Superhost · 4 years on Priddyspaces · usually replies in 12 min` · CTA `Message`
- About header: `About this space`
- About body: `A bright, glass-walled conference room on the third floor with a 65" 4K display, dual whiteboards, and Logitech Rally for hybrid meetings. Coffee bar and reception are 30 seconds away. Perfect for client pitches, vendor demos, and small offsites.`
- Amenities header: `What's included`
- Hours header: `Hours & access`
- Map header: `Location`

### Booking widget
- Top: `$30 / hour` + rating `4.92 (218)`
- Rate toggle: `Hourly` · `Day rate` · `Monthly`
- Field labels: `Date` · `Start` · `End`
- Available section: `Available today`
- Estimate rows: `$30 × 2 hours` · `Service fee` · `Tax (7%)` · `Estimated total`
- CTA: `Reserve · $68.69`
- Microcopy under CTA: `You won't be charged yet. Free cancellation up to 24h before.`
- Trust strip: `Verified host · payments by Stripe` · `Your booking is protected by our resolution policy.`

---

## Booking flow

- Step header: `Sign in` (done) · `Your info` (active) · `Payment` · `Confirm`
- Title: `Tell us about your booking`
- Sub: `Plantation HQ will use this to greet you and prepare the space.`
- Contact card title: `Contact`
- Fields: `Full name` · `Email` · `Phone (optional)` · `Company (optional)` · `Message to host (optional)`
- Phone hint: `We'll text you a 30-min reminder.`
- Message hint: `Whiteboard prefs, A/V needs, accessibility notes…`

### Add-ons
- Card title: `Add-ons`
- Card sub: `Optional extras — added to your total.`
- Items:
  - `Coffee & pastry tray` · `Serves 4 · arrives 10 min before` · `+$28`
  - `Tech setup` · `Host preps display & confirms A/V` · `Free`
  - `Print package` · `20 color, 50 b/w prints` · `+$12`
  - `Reserved parking` · `Spot held at front entrance` · `+$8`

### Cancellation card
- Title: `Cancellation`
- Body: **`Flexible.`** ` Full refund up to 24h before. 50% refund up to 4h before. No refund after that — but you can reschedule once for free.`

### Loyalty strip
- `Earn 100 points · $5 off your next booking`

### Footer buttons
- `← Back` · `Continue to payment →`

---

## Command palette

- Input placeholder: `Search bookings, members, settings…`
- Footer hints: `↑↓ Navigate` · `↵ Select` · `⌘↵ Open in new tab` · `Powered by Priddy AI`
- Group labels: `Quick actions` · `Pending requests` · `Navigation` · `Help`
- Sample items:
  - `Approve all pending requests` · `4 pending · auto-charge cards`
  - `New booking` · `Pick a member, space, and time` · kbd `⌘N`
  - `Ask the assistant: 'approve requests under $200 from returning members'`

---

## Mobile

### Owner bottom nav
`Home` · `Calendar` · `Inbox` · `Insights`

### Customer bottom nav
`Discover` · `Bookings` · `Saved` · `Profile`

### Mobile listing sticky bar
`$60` (with sub `2 hrs · before fees`) · CTA `Reserve`

---

## Empty / error states (must implement)

- Calendar with nothing booked: `No bookings in this range. Try a different week or location.`
- Requests inbox empty: `No requests yet.`
- Analytics empty (no period data): `No data` (centered)
- Search no results: `No spaces matched. Try widening your radius or removing filters.`
- Network failure (any list page): `We couldn't load that. Retry?` with a retry button.
