/** Stable IDs and curated names for the six seasonal frame collections.
 * Vector artwork is implemented by premiumFrameArt.ts.
 */
import type { FramePreset } from "./frames.ts";
type Season = "Christmas" | "Winter" | "Summer" | "Halloween" | "Spring" | "Autumn";
interface SeasonalDesign extends FramePreset {
  category: Season;
}
const designs: readonly SeasonalDesign[] = [
  { id: "christmas-holly", name: "Holly & berries", category: "Christmas" },
  { id: "christmas-evergreen", name: "Evergreen garland", category: "Christmas" },
  { id: "christmas-candy-cane", name: "Candy cane lane", category: "Christmas" },
  { id: "christmas-baubles", name: "Golden baubles", category: "Christmas" },
  { id: "christmas-wreaths", name: "Christmas wreaths", category: "Christmas" },
  { id: "winter-snowflakes", name: "Snowflake lace", category: "Winter" },
  { id: "winter-frost", name: "Frost crystals", category: "Winter" },
  { id: "winter-nordic", name: "Nordic knit", category: "Winter" },
  { id: "winter-ice", name: "Ice diamonds", category: "Winter" },
  { id: "winter-stars", name: "Winter constellations", category: "Winter" },
  { id: "summer-palms", name: "Tropical palms", category: "Summer" },
  { id: "summer-waves", name: "Ocean waves", category: "Summer" },
  { id: "summer-seashells", name: "Seashell shore", category: "Summer" },
  { id: "summer-sunshine", name: "Sunshine rays", category: "Summer" },
  { id: "summer-hibiscus", name: "Hibiscus bloom", category: "Summer" },
  { id: "halloween-pumpkins", name: "Haunted pumpkins", category: "Halloween" },
  { id: "halloween-bats", name: "Midnight bats", category: "Halloween" },
  { id: "halloween-webs", name: "Spiderweb corners", category: "Halloween" },
  { id: "halloween-ghosts", name: "Ghost parade", category: "Halloween" },
  { id: "halloween-witch", name: "Witching stars", category: "Halloween" },
  { id: "spring-cherry", name: "Cherry blossom", category: "Spring" },
  { id: "spring-butterflies", name: "Meadow butterflies", category: "Spring" },
  { id: "spring-tulips", name: "Tulip garden", category: "Spring" },
  { id: "spring-daisies", name: "Daisy chain", category: "Spring" },
  { id: "spring-easter-eggs", name: "Easter eggs", category: "Spring" },
  { id: "autumn-maple", name: "Maple leaves", category: "Autumn" },
  { id: "autumn-wheat", name: "Harvest wheat", category: "Autumn" },
  { id: "autumn-acorns", name: "Acorn woodland", category: "Autumn" },
  { id: "autumn-mushrooms", name: "Woodland mushrooms", category: "Autumn" },
  { id: "autumn-foliage", name: "Falling foliage", category: "Autumn" },
];
export const SEASONAL_FRAME_PRESETS: readonly FramePreset[] = designs.map(({ id, name, category }) => ({ id, name, category }));

