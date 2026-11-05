import { bundledFontById } from "./bundledFonts.ts";

/** Generated from the bundled TTF character maps; stable IDs are stored in projects.
 * The catalog test verifies these ranges against the distributed font bytes. */
const coverage: Record<string, string> = {
  "lato": "0,20-7e,a0-36f,374-375,37a-37e,384-38a,38c,38e-3a1,3a3-3ce,3d0-486,488-513,e3f,1d00-1dca,1dfe-1e9b,1e9e,1ea0-1ef9,1f00-1f15,1f18-1f1d,1f20-1f45,1f48-1f4d,1f50-1f57,1f59,1f5b,1f5d,1f5f-1f7d,1f80-1fb4,1fb6-1fc4,1fc6-1fd3,1fd6-1fdb,1fdd-1fef,1ff2-1ff4,1ff6-1ffe,2000-2010,2012-2022,2026,202f-2030,2032-2034,2039-203a,203c-203e,2044,205e-205f,2070-2071,2074-2094,20a0-20b5,20b8-20ba,20dd,2105,2113,2116-2117,2120,2122,2126,212e,2132,214d-214e,2153-215f,2183-2184,2190-2199,21a8,2202,220f,2211-2212,2215,2219-221a,221e-221f,2229,222b,2248,2260-2261,2264-2265,2302,2310,2320-2321,2460-2473,24ea-24f4,24ff-2500,2502,250c,2510,2514,2518,25a1,25aa-25ab,25ca-25cc,25cf,25e6,2600,263c,2669,2776-277f,2c60-2c6c,2c74-2c77,2e17,a717-a71a,a720-a721,f8ff,fb00-fb04,fe20-fe23,feff",
  "crimson-text": "d,20-7e,a0-ac,ae-148,14a-17e,189,1a0-1a1,1af-1b0,1cd-1d4,1d6-1dc,1e2-1e3,1fb-1ff,218-21b,232-233,237,256,2bc,2c6-2c7,2d8-2dd,300-30c,312,323,326-328,3bc,1e00-1e13,1e18-1e1b,1e1e-1e2b,1e2d-1e4b,1e4d-1e4f,1e54-1e5b,1e5d-1e64,1e66,1e68-1e77,1e79,1e7b-1e99,1ea0-1ef9,2010-2015,2018-201a,201c-201e,2020-2022,2024,2026,2030,2032-2033,2038-203a,203e,2044,2070,2074,2080-2084,20ac,2122,2190-2193,2202,2211-2213,2215,221a,221d-221e,2260,2264-2265,2619,2767,f890-f898,f89a-f89f,fb01-fb02",
  "abril-fatface": "20-7e,a0-17f,192,1fa-1ff,218-21b,237,2bc,2c6-2c7,2c9,2d8-2dd,394,3a9,3bc,3c0,1e80-1e85,1ef2-1ef3,2013-2014,2018-201a,201c-201e,2020-2022,2026,2030,2039-203a,2044,2074,20ac,2116,2122,2126,2202,2206,220f,2211-2212,2215,2219-221a,221e,222b,2248,2260,2264-2265,25ca,fb00-fb04",
  "pacifico": "0,d,20-7e,a0-131,134-17e,18f,192,1a0-1a1,1af-1b0,1c4-1cc,1e6-1e7,1ea-1eb,1fa-21b,22a-22d,230-233,237,259,2bc,2c6-2c7,2c9,2d8-2dd,300-304,306-30c,30f,311-312,31b,323-324,326-328,32e,331,394,3a9,3bc,3c0,400-45f,462-463,46a-46b,472-475,48a-4a5,4a8-4ff,510-513,51a-51d,524-529,52e-52f,1e80-1e85,1e9e,1ea0-1ef9,2013-2014,2018-201a,201c-201e,2020-2022,2026,2030,2039-203a,2044,2074,20a1,20a3-20a4,20a6-20a7,20a9,20ab-20ae,20b1-20b2,20b4-20b5,20b8-20ba,20bc-20bd,2116,2122,2202,220f,2211-2212,2215,2219-221a,221e,222b,2248,2260,2264-2265,25ca,fb01-fb02"
};
const parsed = new Map<string, readonly (readonly [number, number])[]>();

export function firstUnsupportedBundledCharacter(id: string, text: string): string | null {
  if (!bundledFontById(id) || !coverage[id]) throw new Error("Unknown bundled font.");
  let ranges = parsed.get(id);
  if (!ranges) {
    ranges = coverage[id].split(",").map(entry => {
      const [start,end] = entry.split("-").map(value => parseInt(value,16));
      return [start,end ?? start] as const;
    });
    parsed.set(id,ranges);
  }
  for (const character of text) {
    if (character === "\n") continue;
    const code = character.codePointAt(0)!;
    if (!ranges.some(([start,end]) => code >= start && code <= end)) return character;
  }
  return null;
}
