import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATERIAL_SYMBOLS_FONT_URL, materialSymbolNames } from "./material-symbols";

describe("Material Symbols stylesheet", () => {
  it("uses the same-origin, versioned symbol font", () => {
    const font = new URL(MATERIAL_SYMBOLS_FONT_URL, "https://edicut.com");

    expect(font.origin).toBe("https://edicut.com");
    expect(font.pathname).toBe("/assets/material-symbols-v383.woff2");
    expect(materialSymbolNames).toHaveLength(137);
    expect(new Set(materialSymbolNames).size).toBe(materialSymbolNames.length);
    expect(materialSymbolNames).toEqual([...materialSymbolNames].sort());
    expect(materialSymbolNames).toContain("confirmation_number");
    expect(materialSymbolNames).toContain("language");
    expect(materialSymbolNames).toContain("smart_toy");
    expect(materialSymbolNames).toContain("error");
    expect(materialSymbolNames).toContain("route");
    expect(materialSymbolNames).toContain("bug_report");
    expect(materialSymbolNames).toContain("security");
    expect(materialSymbolNames).toContain("system_update_alt");
    expect(materialSymbolNames).toContain("tune");
  });

  it("defines optional-display ligatures in the main stylesheet", () => {
    const fontPath = new URL("../../public/assets/material-symbols-v383.woff2", import.meta.url);
    const stylesheetPath = new URL("../styles/global.css", import.meta.url);
    const stylesheet = readFileSync(stylesheetPath, "utf8");

    expect(existsSync(fontPath)).toBe(true);
    expect(stylesheet).toContain("font-display: optional;");
    expect(stylesheet).toContain(`url("${MATERIAL_SYMBOLS_FONT_URL}")`);
    expect(stylesheet).toContain("-webkit-font-feature-settings: \"liga\"");
  });
});
