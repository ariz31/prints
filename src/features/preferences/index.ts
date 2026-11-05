export { default as PreferencesPanel } from "./components/PreferencesPanel.tsx";
export { default } from "./components/PreferencesPanel.tsx";

export {
  DEFAULT_PREFERENCES,
  isValidPreferences,
  readPreferences,
  savePreferences,
  defaultPrintSettings,
  type UserPreferences,
} from "./logic/preferences.ts";
