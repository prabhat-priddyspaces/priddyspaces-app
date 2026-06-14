import { StyleSheet } from "react-native";

import { colors, fontSizes, radii, shadows } from "../../theme";

// Shared look for the admin list screens.
export const adminStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    padding: 20,
    gap: 12
  },
  title: {
    fontSize: fontSizes.pageTitle,
    fontWeight: "700",
    color: colors.text
  },
  subtitle: {
    marginTop: 4,
    fontSize: fontSizes.body,
    color: colors.text2
  },
  sectionTitle: {
    fontSize: fontSizes.cardTitle,
    fontWeight: "700",
    color: colors.text
  },
  searchRow: {
    flexDirection: "row",
    gap: 8
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: fontSizes.body,
    color: colors.text,
    backgroundColor: colors.surface
  },
  searchButton: {
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  searchButtonText: {
    color: colors.white,
    fontSize: fontSizes.caption,
    fontWeight: "700"
  },
  list: {
    gap: 12
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 3,
    ...shadows.card
  },
  cardTitle: {
    fontSize: fontSizes.small,
    fontWeight: "700",
    color: colors.text
  },
  mutedText: {
    fontSize: fontSizes.caption,
    color: colors.text3
  },
  message: {
    color: colors.danger,
    fontSize: fontSizes.caption
  }
});
