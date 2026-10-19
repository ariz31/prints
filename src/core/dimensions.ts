/** Named physical sizes; no automatic regional or government-ID compliance claim. */
export const PRINT_SIZE_PRESETS = [
  { id: "photo-1x1", label: "Photo 1 × 1 in", widthMm: 25.4, heightMm: 25.4 },
  { id: "photo-2x2", label: "Photo 2 × 2 in", widthMm: 50.8, heightMm: 50.8 },
  { id: "id-1", label: "ID-1 / CR80 (card)", widthMm: 85.6, heightMm: 53.98 },
  { id: "business-90x50", label: "Business card 90 × 50 mm", widthMm: 90, heightMm: 50 },
  { id: "business-85x55", label: "Business card 85 × 55 mm", widthMm: 85, heightMm: 55 },
  { id: "photo-4x6", label: "Photo 4 × 6 in", widthMm: 101.6, heightMm: 152.4 },
  { id: "a6", label: "A6 105 × 148 mm", widthMm: 105, heightMm: 148 },
] as const;

export function lookupPrintSize(id: string): { widthMm: number; heightMm: number } {
  const preset = PRINT_SIZE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error("Unknown print product size.");
  return { widthMm: preset.widthMm, heightMm: preset.heightMm };
}
