import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSiteSetting: vi.fn() }));
vi.mock("./site-settings.server", () => ({ getSiteSetting: mocks.getSiteSetting, saveSiteSetting: vi.fn() }));

import { configuredEditingPackage, configuredPublicEditingPackages, defaultPricingPackages, getPricingPackages, publicPricingPackages } from "./pricing.server";
import { REQUIRED_PACKAGE_STAFFING, STUDIO_PACKAGE_STAFFING } from "./subscriptions";

beforeEach(() => vi.clearAllMocks());

describe("configured public editing catalog", () => {
  it("publishes exactly three single-video and three monthly packages by default", () => {
    expect(defaultPricingPackages).toHaveLength(6);
    expect(configuredPublicEditingPackages(defaultPricingPackages).map((item) => item.packageType)).toEqual([
      "monthly", "monthly", "monthly", "single", "single", "single",
    ]);
    expect(configuredPublicEditingPackages(defaultPricingPackages).filter((item) => item.packageType === "monthly").map((item) => [item.editingHoursPerMonth, item.editingHoursPerWorkday])).toEqual([
      [88, 4], [110, 5], [110, 5],
    ]);
  });

  it("migrates saved legacy package settings and adds the three single-video offers", async () => {
    const previousPrices = new Map([["creator", "$249"], ["creator-plus", "$549"], ["creator-pro", "$1,099"]]);
    const saved = defaultPricingPackages.slice(0, 3).map((item) => ({
      ...item,
      price: previousPrices.get(item.slug)!,
      description: "Legacy video-count package",
      features: ["Old package feature"],
      active: item.slug !== "creator-plus",
    }));
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);

    expect(packages).toHaveLength(6);
    expect(packages.map((item) => item.slug)).toEqual(["creator", "creator-plus", "creator-pro", "single-creator", "single-studio", "single-feature"]);
    expect(packages.map((item) => item.price)).toEqual(["$2,149", "$2,649", "$3,149", "$109", "$179", "$189"]);
    expect(packages[0]).toMatchObject({ packageType: "monthly", editingHoursPerMonth: 88, editingHoursPerWorkday: 4 });
    expect(packages.find((item) => item.slug === "creator-plus")?.active).toBe(false);
    expect(packages.find((item) => item.slug === "creator-plus")?.features).not.toContain("Old package feature");
  });

  it("only migrates a complete historical monthly price set and preserves custom prices and ordering", async () => {
    const order = ["single-studio", "single-feature", "single-creator", "creator-pro", "creator-plus", "creator"];
    const oldMonthlyPrices = new Map([["creator", "$249"], ["creator-plus", "$549"], ["creator-pro", "$1,099"]]);
    const saved = defaultPricingPackages.map((item) => ({
      ...item,
      price: oldMonthlyPrices.get(item.slug) ?? (item.slug === "single-creator" ? "$239" : item.price),
      sortOrder: order.indexOf(item.slug) + 1,
    }));
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);

    expect(packages.map((item) => item.slug)).toEqual(order);
    expect(packages.find((item) => item.slug === "creator")?.price).toBe("$2,149");
    expect(packages.find((item) => item.slug === "single-creator")?.price).toBe("$239");
    expect(configuredPublicEditingPackages(packages).map((item) => item.slug)).toEqual(order);
  });

  it("preserves an admin price that happens to match one historical tier", async () => {
    const saved = defaultPricingPackages.map((item) => item.slug === "creator"
      ? { ...item, price: "$549", description: "Custom starter price" }
      : item);
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);

    expect(packages.find((item) => item.slug === "creator")).toMatchObject({
      price: "$549",
      description: "Custom starter price",
    });
  });

  it("normalizes invalid saved sort values to the package list order", async () => {
    const saved = defaultPricingPackages.map((item) => ({ ...item, sortOrder: null as unknown as number }));
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);

    expect(packages.map((item) => item.slug)).toEqual(defaultPricingPackages.map((item) => item.slug));
  });

  it("replaces a saved Short-form Edit with the new larger single-video tier", async () => {
    const saved = defaultPricingPackages.filter((item) => item.slug !== "single-feature").map((item) => ({
      ...item,
      ...(item.slug === "single-creator" ? { sortOrder: 5 } : {}),
      ...(item.slug === "single-studio" ? { sortOrder: 6 } : {}),
    }));
    saved.splice(3, 0, {
      ...defaultPricingPackages.find((item) => item.slug === "single-creator")!,
      name: "Short-form Edit",
      slug: "single-short",
      price: "$23",
      description: "A retired vertical short package.",
    });
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);
    const feature = configuredEditingPackage("single-feature", packages);

    expect(packages.map((item) => item.slug)).not.toContain("single-short");
    expect(packages.map((item) => item.slug)).toContain("single-feature");
    expect(feature).toMatchObject({ name: "Feature Video", basePrice: 189, finishedLength: "Up to 30 minutes" });
    expect(configuredEditingPackage("single-short", packages)).toBeNull();
  });

  it("uses the configured whole-dollar price in both public and checkout package data", () => {
    const configured = defaultPricingPackages.map((item) => item.slug === "single-creator" ? { ...item, price: "$119", name: "Creator Video Plus" } : item);
    const offer = configuredEditingPackage("single-creator", configured);
    expect(offer).toMatchObject({ packageType: "single", name: "Creator Video Plus", basePrice: 119 });
    expect(configuredEditingPackage("single-creator", configured.map((item) => item.slug === "single-creator" ? { ...item, active: false } : item))).toBeNull();
  });

  it("keeps required staffing visible when saved package copy predates the staffing offer", async () => {
    const saved = defaultPricingPackages.map((item) => ({
      ...item,
      features: ["66 reserved editing hours per month", "3 editing hours per standard workday", "Legacy saved feature"],
      deliverables: ["66 editing hours per month", "3 editing hours per workday across 22 working days", "Legacy saved deliverable"],
    }));
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);
    const publicPackages = publicPricingPackages(packages);
    const offer = configuredEditingPackage("creator-pro", packages);
    const studio = publicPackages.find((item) => item.slug === "creator-pro");

    expect(publicPackages[0]?.features).toEqual(expect.arrayContaining([...REQUIRED_PACKAGE_STAFFING]));
    expect(publicPackages[0]?.deliverables).toEqual(expect.arrayContaining([...REQUIRED_PACKAGE_STAFFING]));
    expect(publicPackages[0]?.features).not.toContain("66 reserved editing hours per month");
    expect(publicPackages[0]?.features).toContain("88 reserved editing hours per month");
    expect(studio?.features).toEqual(expect.arrayContaining([...STUDIO_PACKAGE_STAFFING]));
    expect(offer?.features).toContain("110 reserved editing hours per month shared by two editors");
    expect(offer?.features).not.toContain("Dedicated video editor");
    expect(offer?.features).toEqual(expect.arrayContaining([...STUDIO_PACKAGE_STAFFING]));
    expect(offer?.deliverables).toEqual(expect.arrayContaining([...STUDIO_PACKAGE_STAFFING]));
  });

  it("refreshes outdated default capacity copy without replacing an admin-set price", async () => {
    const saved = defaultPricingPackages.map((item) => item.slug === "creator" ? {
      ...item,
      price: "$2,999",
      description: "A focused hour of editing each workday, with clear monthly capacity for a lighter publishing schedule.",
      features: ["22 reserved editing hours per month", "1 editing hour per standard workday"],
      deliverables: ["22 editing hours per month", "1 editing hour per workday across 22 working days"],
    } : item);
    mocks.getSiteSetting.mockResolvedValue(JSON.stringify(saved));

    const packages = await getPricingPackages(null);
    const starter = packages.find((item) => item.slug === "creator");

    expect(starter?.price).toBe("$2,999");
    expect(starter?.description).toBe(defaultPricingPackages[0]?.description);
    expect(starter?.features).toContain("88 reserved editing hours per month");
    expect(starter?.features).not.toContain("22 reserved editing hours per month");
    expect(starter?.deliverables).toContain("4 editing hours per workday across 22 working days");
  });
});
