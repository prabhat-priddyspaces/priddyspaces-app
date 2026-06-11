// priddyspaces://booking/<id> etc. — mirrors web's deep-linkable surfaces.
export const linking = {
  prefixes: ["priddyspaces://"],
  config: {
    screens: {
      Main: {
        screens: {
          BookingDetail: "booking/:bookingId",
          Notifications: "notifications",
          Invoices: "invoices",
          MemberSubscriptions: "memberships",
          OwnerPayments: "owner/payments",
          OwnerCalendar: "owner/calendar",
        },
      },
    },
  },
};
