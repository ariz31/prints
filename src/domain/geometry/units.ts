/** Distances are kept in millimeters internally, independent of presentation units. */
export type DisplayUnit = "mm" | "cm" | "in";
export const UNIT_MULTIPLIER: Record<DisplayUnit,number>={mm:1,cm:10,in:25.4};
export const MM_PER_INCH = 25.4;
export const PDF_POINTS_PER_MM = 72 / MM_PER_INCH;
export function parseLength(value: string, assumed: DisplayUnit = "mm"): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/,/g, ".");
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(mm|cm|in|inch|inches|"|''|″)?$/i.exec(text);
  if (!match) return null;
  const [numerator, denominator] = match[1].split(/\s*\/\s*/).map(Number);
  const number = denominator === undefined ? numerator : numerator / denominator;
  if (!Number.isFinite(number) || number < 0) return null;
  const defaultUnit: DisplayUnit = assumed === "in" || assumed === "cm" || assumed === "mm" ? assumed : "mm";
  const raw = (match[2] ?? defaultUnit).toLowerCase();
  const unit: DisplayUnit = raw === "mm" ? "mm" : raw === "cm" ? "cm" : "in";
  const mm = number * UNIT_MULTIPLIER[unit];
  return Number.isFinite(mm) && mm <= 100000 ? mm : null;
}

/**
 * Accurately round a number to a fixed decimal precision using symmetric
 * round-half-away-from-zero, avoiding IEEE 754 binary floating point under-rounding.
 */
function roundHalfAway(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const parts = abs.toString().split("e");
  const shifted = Math.round(Number(parts[0] + "e" + (parts[1] ? Number(parts[1]) + decimals : decimals)));
  const shiftedParts = shifted.toString().split("e");
  const result = Number(shiftedParts[0] + "e" + (shiftedParts[1] ? Number(shiftedParts[1]) - decimals : -decimals));
  return sign * result;
}

export function formatLength(mm: number, unit: DisplayUnit): string {
  const n = mm / UNIT_MULTIPLIER[unit];
  if (!Number.isFinite(n)) return "";
  const decimals = unit === "in" ? 4 : unit === "cm" ? 3 : 2;
  const rounded = roundHalfAway(n, decimals);
  return Number(rounded.toFixed(decimals)).toString();
}
