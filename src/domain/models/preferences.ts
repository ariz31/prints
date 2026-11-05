import type { Orientation, PaperName } from "./sheet.ts";
import { isPaperName } from "./sheet.ts";

/** Distances are kept in millimeters internally, independent of presentation units. */
export type DisplayUnit = "mm" | "cm" | "in";
export const UNIT_MULTIPLIER: Record<DisplayUnit, number> = { mm: 1, cm: 10, in: 25.4 };

export interface UserPreferences {
  unit: DisplayUnit;
  defaultPaper: PaperName;
  defaultOrientation: Orientation;
  defaultMarginMm: number;
  defaultGapMm: number;
  defaultCutGuides: boolean;
  autoSave?: boolean;
  /** Snapshot allows deleted presets to remain usable in a saved default. */
  defaultCustomWidthMm?: number;
  defaultCustomHeightMm?: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  unit: "mm",
  defaultPaper: "A4",
  defaultOrientation: "portrait",
  defaultMarginMm: 5,
  defaultGapMm: 3,
  defaultCutGuides: true,
  autoSave: true,
  defaultCustomWidthMm: 210,
  defaultCustomHeightMm: 297,
};

export function isValidPreferences(v: unknown): v is UserPreferences {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  try {
    const p = v as Record<string, unknown>;
    const unit = p.unit;
    const defaultPaper = p.defaultPaper;
    const defaultOrientation = p.defaultOrientation;
    const defaultCutGuides = p.defaultCutGuides;
    const autoSave = p.autoSave;
    const customWidth = p.defaultCustomWidthMm;
    const customHeight = p.defaultCustomHeightMm;
    const margin = p.defaultMarginMm;
    const gap = p.defaultGapMm;

    return (
      typeof unit === "string" &&
      ["mm", "cm", "in"].includes(unit) &&
      isPaperName(defaultPaper) &&
      typeof defaultOrientation === "string" &&
      ["portrait", "landscape"].includes(defaultOrientation) &&
      typeof defaultCutGuides === "boolean" &&
      (autoSave === undefined || typeof autoSave === "boolean") &&
      (customWidth === undefined ||
        (typeof customWidth === "number" &&
          Number.isFinite(customWidth) &&
          customWidth > 0 &&
          customWidth <= 2000)) &&
      (customHeight === undefined ||
        (typeof customHeight === "number" &&
          Number.isFinite(customHeight) &&
          customHeight > 0 &&
          customHeight <= 2000)) &&
      typeof margin === "number" &&
      Number.isFinite(margin) &&
      margin >= 0 &&
      margin < 200 &&
      typeof gap === "number" &&
      Number.isFinite(gap) &&
      gap >= 0 &&
      gap < 200
    );
  } catch {
    return false;
  }
}
