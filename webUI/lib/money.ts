export type MoneyValue = number | string;

export function moneyToNumber(value: MoneyValue | null | undefined): number | null {
  if (value == null || value === "") return null;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : null;
}

export function moneyInputValue(value: MoneyValue | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

export function formatUsd(value: MoneyValue | null | undefined, suffix = ""): string {
  const amount = moneyToNumber(value);
  if (amount == null) return "";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted}${suffix}`;
}
