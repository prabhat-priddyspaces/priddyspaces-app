export const colors = {
  bg: "#F7F3EC",
  bgElev: "#FFFCF8",
  bgSunken: "#EFE7DC",
  surface: "#FFFFFF",
  surface2: "#F3EDE4",
  surface3: "#E9DED1",
  line: "#E2D8CB",
  lineStrong: "#CDBFAC",
  text: "#1F2320",
  text2: "#5E625B",
  text3: "#817C72",
  text4: "#AAA295",
  brand: "#2F5D50",
  brandHover: "#23463D",
  brandSoft: "#EEF4EF",
  brandStrong: "#1F3F37",
  accent: "#B8753A",
  accentSoft: "#F3E4D4",
  success: "#2F6B4F",
  successSoft: "#EDF7F0",
  warning: "#9A5E2F",
  warningSoft: "#FAF1E8",
  danger: "#B42318",
  dangerSoft: "#FDEDEA",
  info: "#356899",
  infoSoft: "#EEF4F8",
  white: "#FFFFFF",
} as const;

export const fontSizes = {
  caption: 12,
  small: 13,
  body: 14,
  bodyLg: 15,
  cardTitle: 17,
  heading: 24,
  pageTitle: 28,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.text,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
