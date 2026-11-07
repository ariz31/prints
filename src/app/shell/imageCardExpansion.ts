/** UI-only per-image disclosure preferences. Never part of print geometry or export data. */
export type ImageCardOverrides = Record<string, boolean>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const STORAGE_PREFIX = "prints:image-card-disclosure:v1:";
const MAX_OVERRIDES = 250;

export function imageCardScope(projectId: string | null, workspaceKey: string): string {
  return projectId ? "project:" + projectId : "draft:" + workspaceKey;
}

export function isImageCardExpanded(
  imageId: string,
  imageCount: number,
  overrides: ImageCardOverrides,
): boolean {
  return typeof overrides[imageId] === "boolean" ? overrides[imageId] : imageCount <= 2;
}

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function validatedOverrides(value: unknown): ImageCardOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, expanded]) =>
      id.length > 0 && id.length <= 200 && typeof expanded === "boolean"
    ).slice(-MAX_OVERRIDES),
  );
}

export function readImageCardOverrides(scope: string, storage?: StorageLike): ImageCardOverrides {
  try {
    const raw = storageOrNull(storage)?.getItem(STORAGE_PREFIX + scope);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) return {};
    return validatedOverrides((parsed as { overrides?: unknown }).overrides);
  } catch {
    return {};
  }
}

export function writeImageCardOverrides(
  scope: string,
  overrides: ImageCardOverrides,
  storage?: StorageLike,
): void {
  try {
    storageOrNull(storage)?.setItem(
      STORAGE_PREFIX + scope,
      JSON.stringify({ version: 1, overrides: validatedOverrides(overrides) }),
    );
  } catch {
    // Browsers denying local storage still allow in-memory card interaction.
  }
}

export function moveImageCardOverrides(
  oldScope: string,
  newScope: string,
  activeOverrides: ImageCardOverrides,
  storage?: StorageLike,
): ImageCardOverrides {
  const next = { ...readImageCardOverrides(newScope, storage), ...activeOverrides };
  writeImageCardOverrides(newScope, next, storage);
  try {
    storageOrNull(storage)?.removeItem(STORAGE_PREFIX + oldScope);
  } catch {
    // Failure to clean up a stale draft key must not discard the current UI state.
  }
  return next;
}
