import { describe, expect, it } from "vitest";
import { isSameSiteMutation, readMutationForm } from "./mutation-request.server";

const url = "https://edicut.com/dashboard/projects";
describe("panel mutation boundaries", () => {
  it("accepts local POST forms and rejects foreign origins, metadata, and other methods", () => {
    expect(isSameSiteMutation(new Request(url, { method: "POST" }))).toBe(true);
    expect(isSameSiteMutation(new Request(url, { method: "POST", headers: { Origin: "https://edicut.com" } }))).toBe(true);
    expect(isSameSiteMutation(new Request(url, { method: "POST", headers: { Origin: "https://foreign.test" } }))).toBe(false);
    expect(isSameSiteMutation(new Request(url, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } }))).toBe(false);
    expect(isSameSiteMutation(new Request(url))).toBe(false);
  });
  it("reads URL-encoded forms including multilingual text", async () => {
    const form = await readMutationForm(new Request(url, { method: "POST", body: new URLSearchParams({ intent: "save-profile", name: "বাংলা" }) }), 4096);
    expect(form?.get("name")).toBe("বাংলা");
  });
  it("preserves multipart fields and files", async () => {
    const body = new FormData();
    body.set("intent", "upload-images");
    body.set("imageFiles", new File(["sample"], "sample.png", { type: "image/png" }));
    const form = await readMutationForm(new Request(url, { method: "POST", body }), 4096);
    expect(form?.get("intent")).toBe("upload-images");
    expect(await (form?.get("imageFiles") as File).text()).toBe("sample");
  });
  it("bounds streamed data even when Content-Length is absent", async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("name=" + "a".repeat(5000))); controller.close(); } });
    const request = new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, duplex: "half" } as RequestInit & { duplex: "half" });
    expect(request.headers.has("Content-Length")).toBe(false);
    expect(await readMutationForm(request, 4096)).toBeNull();
  });
  it("bounds multipart overhead and handles malformed forms without throwing", async () => {
    const body = new FormData(); body.set("file", new File(["a".repeat(4096)], "a.txt"));
    expect(await readMutationForm(new Request(url, { method: "POST", body }), 4096)).toBeNull();
    expect(await readMutationForm(new Request(url, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=missing" }, body: "broken" }), 4096)).toBeNull();
  });
  it("rejects unsupported form media types", async () => {
    expect(await readMutationForm(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), 4096)).toBeNull();
  });
});
