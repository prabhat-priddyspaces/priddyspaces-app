import { StyleSheet } from "react-native";

import { colors, fontSizes, radii, shadows } from "../../theme";

export function titleize(value?: string | null): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

export const accessStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: fontSizes.pageTitle,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: fontSizes.body,
    color: colors.text2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: 16,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: fontSizes.cardTitle,
    fontWeight: "700",
    color: colors.text,
  },
  label: {
    marginTop: 10,
    fontSize: fontSizes.caption,
    fontWeight: "700",
    color: colors.text4,
  },
  value: {
    marginTop: 3,
    fontSize: fontSizes.small,
    color: colors.text,
    fontWeight: "600",
  },
  muted: {
    marginTop: 4,
    fontSize: fontSizes.small,
    color: colors.text3,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.brandSoft,
  },
  badgeText: {
    color: colors.brandStrong,
    fontSize: fontSizes.caption,
    fontWeight: "700",
  },
  button: {
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: colors.brand,
    alignItems: "center",
  },
  secondaryButton: {
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  buttonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: fontSizes.small,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: fontSizes.small,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
  },
  message: {
    marginTop: 12,
    fontSize: fontSizes.small,
    color: colors.danger,
  },
  empty: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: 20,
  },
  emptyTitle: {
    fontSize: fontSizes.cardTitle,
    fontWeight: "700",
    color: colors.text,
  },
});
