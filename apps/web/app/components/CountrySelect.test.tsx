import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHECKOUT_COUNTRIES, countryCallingCode, updatePhoneForCountryChange } from "../lib/checkout-contact";
import { CountrySelect, filterCountries } from "./CountrySelect";

describe("custom country menu", () => {
  it("starts empty with a required searchable combobox and ISO country form field", () => {
    const html = renderToStaticMarkup(createElement(CountrySelect));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('required=""');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('name="country" value=""');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<select");
    expect(html).not.toContain('role="listbox"');
  });
  it("prefills a saved country using its name and submits its ISO code", () => {
    const html = renderToStaticMarkup(createElement(CountrySelect, { defaultValue: "BD" }));
    expect(html).toContain('value="Bangladesh"');
    expect(html).toContain('name="country" value="BD"');
  });
  it("does not accept an unknown initial country", () => {
    expect(renderToStaticMarkup(createElement(CountrySelect, { defaultValue: "XX" }))).toContain('name="country" value=""');
  });
  it("searches names, codes, accents and ignores surrounding whitespace", () => {
    expect(filterCountries("  bangla ").map(country => country.code)).toEqual(["BD"]);
    expect(filterCountries("bd").map(country => country.code)).toEqual(["BD"]);
    expect(filterCountries("aland").some(country => country.code === "AX")).toBe(true);
    expect(filterCountries("not-a-real-country")).toEqual([]);
    expect(filterCountries("")).toHaveLength(249);
  });
  it("shows international calling prefixes for every listed country", () => {
    expect(countryCallingCode("BD")).toBe("+880");
    expect(countryCallingCode("BS")).toBe("+1");
    expect(countryCallingCode("GB")).toBe("+44");
    expect(countryCallingCode("XX")).toBe("");
    expect(CHECKOUT_COUNTRIES.every(country => countryCallingCode(country.code).startsWith("+"))).toBe(true);
  });
  it("prefills the new calling prefix and preserves any phone digits already typed", () => {
    expect(updatePhoneForCountryChange("", "", "BD")).toBe("+880 ");
    expect(updatePhoneForCountryChange("+880 1712 345678", "BD", "US")).toBe("+1 1712 345678");
    expect(updatePhoneForCountryChange("1712345678", "", "BD")).toBe("+880 1712345678");
    expect(updatePhoneForCountryChange("+880", "BD", "US")).toBe("+1 ");
    expect(updatePhoneForCountryChange("+442071234567", "GB", "US")).toBe("+1 2071234567");
    expect(updatePhoneForCountryChange("+442071234567", "", "US")).toBe("+442071234567");
  });
});
