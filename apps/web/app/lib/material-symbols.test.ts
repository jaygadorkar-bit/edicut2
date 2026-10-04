import { describe, expect, it } from "vitest";
import { getMaterialSymbolsStylesheetUrl, materialSymbolNames } from "./material-symbols";

describe("Material Symbols stylesheet", () => {
  it("requests only a unique, alphabetically sorted icon set with block display", () => {
    const stylesheet = new URL(getMaterialSymbolsStylesheetUrl());
    const icons = stylesheet.searchParams.get("icon_names")?.split(",") ?? [];

    expect(stylesheet.origin).toBe("https://fonts.googleapis.com");
    expect(stylesheet.searchParams.get("display")).toBe("block");
    expect(icons).toEqual([...materialSymbolNames].sort());
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons).toHaveLength(119);
  });
});
