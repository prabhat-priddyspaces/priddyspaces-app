// app.jsx — design canvas composition

function App() {
  return (
    <DesignCanvas
      title="Priddyspaces · UI/UX Redesign"
      subtitle="Premium soft violet · light + dark · empty + populated"
      bg="#EDE9E2"
    >
      <DCSection id="foundations" title="01 · Foundations" subtitle="Brand, type, color, spacing, components. The system every screen draws from.">
        <DCArtboard id="found-light" label="System · Light" width={1100} height={1240}>
          <FoundationsArtboard theme="light" />
        </DCArtboard>
        <DCArtboard id="found-dark" label="System · Dark" width={1100} height={1240}>
          <FoundationsArtboard theme="dark" />
        </DCArtboard>
      </DCSection>

      <DCSection id="owner-dashboard" title="02 · Owner dashboard" subtitle="The first thing operators see — empty-state onboarding through to populated portfolio view.">
        <DCArtboard id="dash-empty" label="Empty · onboarding · light" width={1440} height={1000}>
          <OwnerDashboardEmpty theme="light" />
        </DCArtboard>
        <DCArtboard id="dash-pop" label="Populated · light" width={1440} height={1100}>
          <OwnerDashboardPopulated theme="light" />
        </DCArtboard>
        <DCArtboard id="dash-pop-dark" label="Populated · dark" width={1440} height={1100}>
          <OwnerDashboardPopulated theme="dark" />
        </DCArtboard>
      </DCSection>

      <DCSection id="owner-calendar" title="03 · Calendar" subtitle="Two variants — week-grid and per-room timeline. Inspector pinned right.">
        <DCArtboard id="cal-week" label="Week view · light" width={1440} height={920}>
          <OwnerCalendar theme="light" view="week" />
        </DCArtboard>
        <DCArtboard id="cal-timeline" label="Timeline view · dark" width={1440} height={920}>
          <OwnerCalendar theme="dark" view="timeline" />
        </DCArtboard>
      </DCSection>

      <DCSection id="owner-ops" title="04 · Requests, analytics, locations" subtitle="The operator loop — approvals, what to do about it, where it happens.">
        <DCArtboard id="requests" label="Requests · inbox" width={1440} height={920}>
          <OwnerRequests theme="light" />
        </DCArtboard>
        <DCArtboard id="analytics" label="Analytics · overview" width={1440} height={1380}>
          <OwnerAnalytics theme="light" />
        </DCArtboard>
        <DCArtboard id="locations" label="Locations · cards" width={1440} height={1080}>
          <OwnerLocations theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="owner-settings" title="05 · Settings · every sub-page" subtitle="The current product piled everything onto one scroll. Each Settings item gets its own dedicated screen — same shell, focused content.">
        <DCArtboard id="settings-profile" label="Profile + amenities + pricing + Stripe + AI" width={1440} height={1620}>
          <OwnerSettings theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-team" label="Team & roles" width={1440} height={1620}>
          <OwnerSettingsTeamRoles theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-branding" label="Branding & domain" width={1440} height={1480}>
          <OwnerSettingsBranding theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-tax" label="Tax" width={1440} height={1100}>
          <OwnerSettingsTax theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-cancel" label="Cancellation policies" width={1440} height={1180}>
          <OwnerSettingsCancellation theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-promos" label="Promo codes" width={1440} height={1240}>
          <OwnerSettingsPromos theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-plans" label="Membership plans" width={1440} height={1240}>
          <OwnerSettingsPlans theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-loyalty" label="Loyalty" width={1440} height={1340}>
          <OwnerSettingsLoyalty theme="light" />
        </DCArtboard>
        <DCArtboard id="settings-flags" label="Feature flags" width={1440} height={1280}>
          <OwnerSettingsFlags theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="customer" title="06 · Public marketplace" subtitle="Public-facing booking flow — the part guests and members touch first.">
        <DCArtboard id="market" label="Search + map" width={1440} height={920}>
          <CustomerMarketplace theme="light" />
        </DCArtboard>
        <DCArtboard id="listing" label="Listing detail" width={1440} height={1500}>
          <CustomerListing theme="light" />
        </DCArtboard>
        <DCArtboard id="booking" label="Booking flow · step 2" width={1440} height={1080}>
          <BookingFlow theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="mobile-customer-pub" title="07 · Mobile · customer marketplace" subtitle="Public-facing screens, thumb-reachable. Bottom nav, sticky CTAs, drawers replace tables.">
        <DCArtboard id="mobile-views" label="Discover · listing · owner home" width={1200} height={820}>
          <MobileViews theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="mobile-customer-flow" title="08 · Mobile · customer booking flow + account" subtitle="From form to payment to receipt, plus my-bookings, filters sheet, and profile.">
        <DCArtboard id="mobile-customer" label="Booking flow + bookings + filters + profile" width={1200} height={1600}>
          <MobileCustomerSuite theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="mobile-owner" title="09 · Mobile · owner workspace" subtitle="Operators run the business from the phone — calendar, inbox, analytics, locations, settings, members.">
        <DCArtboard id="mobile-owner" label="Calendar · requests · analytics · locations · settings · members" width={1200} height={1600}>
          <MobileOwnerSuite theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="patterns" title="10 · Patterns · command palette" subtitle="⌘K is the spine — fast actions, deep nav, AI hand-off.">
        <DCArtboard id="palette-light" label="Palette · open" width={1440} height={1000}>
          <CommandPaletteArtboard theme="light" />
        </DCArtboard>
        <DCArtboard id="palette-dark" label="Palette · dark" width={1440} height={1000}>
          <CommandPaletteArtboard theme="dark" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
