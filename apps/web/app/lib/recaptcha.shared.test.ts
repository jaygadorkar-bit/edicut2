import { describe, expect, it } from "vitest";
import { isLocalDevelopmentHostname } from "./recaptcha.shared";

describe("local CAPTCHA hosts", () => {
  it.each(["localhost", "preview.localhost", "127.0.0.1", "[::1]"])(
    "recognizes loopback development host %s",
    (hostname) => expect(isLocalDevelopmentHostname(hostname)).toBe(true),
  );

  it.each(["edicut.com", "www.edicut.com", "localhost.example.com"])(
    "keeps public host %s protected by CAPTCHA",
    (hostname) => expect(isLocalDevelopmentHostname(hostname)).toBe(false),
  );
});
