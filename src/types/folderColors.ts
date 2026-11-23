/** Preset accents for conversation folders (readable on the dark UI). */
export const FOLDER_COLOR_OPTIONS = [
  { id: "slate", label: "Slate", swatch: "#b0b0b0" },
  { id: "blue", label: "Blue", swatch: "#4f9cf0" },
  { id: "teal", label: "Teal", swatch: "#2ec4b6" },
  { id: "green", label: "Green", swatch: "#57c26b" },
  { id: "amber", label: "Amber", swatch: "#f0b429" },
  { id: "coral", label: "Coral", swatch: "#ff7a59" },
  { id: "rose", label: "Rose", swatch: "#f06292" },
  { id: "violet", label: "Violet", swatch: "#a78bfa" },
] as const;

export type FolderColorId = (typeof FOLDER_COLOR_OPTIONS)[number]["id"];

export const DEFAULT_FOLDER_COLOR: FolderColorId = "slate";

export function isFolderColorId(value: unknown): value is FolderColorId {
  return (
    typeof value === "string" &&
    FOLDER_COLOR_OPTIONS.some((option) => option.id === value)
  );
}

export function normalizeFolderColor(value: unknown): FolderColorId {
  return isFolderColorId(value) ? value : DEFAULT_FOLDER_COLOR;
}

export function getFolderColor(color: string | null | undefined) {
  const id = normalizeFolderColor(color);
  return (
    FOLDER_COLOR_OPTIONS.find((option) => option.id === id) ??
    FOLDER_COLOR_OPTIONS[0]
  );
}

/** Rotate through presets when creating folders so neighbors differ. */
export function nextFolderColor(existingCount: number): FolderColorId {
  const index = Math.max(0, existingCount) % FOLDER_COLOR_OPTIONS.length;
  return FOLDER_COLOR_OPTIONS[index].id;
}
