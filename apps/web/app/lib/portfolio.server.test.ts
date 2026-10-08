import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSiteSetting: vi.fn() }));
vi.mock("./site-settings.server", () => ({ getSiteSetting: mocks.getSiteSetting }));

import { defaultPortfolioSections, getPortfolioSections } from "./portfolio.server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSiteSetting.mockResolvedValue(undefined);
});

describe("portfolio settings reads", () => {
  it("uses demo defaults only when no setting has been saved", async () => {
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).resolves.toBe(defaultPortfolioSections);
  });

  it("rejects empty or malformed saved settings in strict admin mutations", async () => {
    mocks.getSiteSetting.mockResolvedValue("");
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow("empty");

    mocks.getSiteSetting.mockResolvedValue("not valid json");
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow();

    mocks.getSiteSetting.mockResolvedValue("[]");
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow("could not be read");

    mocks.getSiteSetting.mockResolvedValue(JSON.stringify([defaultPortfolioSections[0], { id: "broken" }]));
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow("read safely");
  });

  it("keeps the public fallback behavior for empty saved settings", async () => {
    mocks.getSiteSetting.mockResolvedValue("");
    await expect(getPortfolioSections(null)).resolves.toBe(defaultPortfolioSections);
  });
});
