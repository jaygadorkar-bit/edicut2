import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channel = { httpSend: vi.fn() };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return {
    channel,
    client,
    getAdmin: vi.fn(() => client),
  };
});

vi.mock("../integrations/supabase/client.server", () => ({
  getSupabaseAdmin: mocks.getAdmin,
}));

import { sendWorkspaceReceiptInvalidation } from "./notification-realtime.server";

const viewer = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  admin: false,
};

describe("workspace receipt invalidations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channel.httpSend.mockResolvedValue({ success: true });
    mocks.client.removeChannel.mockResolvedValue("ok");
  });

  it("sends a private, content-free invalidation to the authenticated user's channel", async () => {
    const context = { cf: { env: { SUPABASE_SERVICE_ROLE_KEY: "test-only" } } };

    await expect(sendWorkspaceReceiptInvalidation(context, viewer)).resolves.toBe(true);

    expect(mocks.getAdmin).toHaveBeenCalledWith(context);
    expect(mocks.client.channel).toHaveBeenCalledWith(
      `edicut:user:${viewer.id}`,
      { config: { private: true, broadcast: { ack: false, self: false } } },
    );
    expect(mocks.channel.httpSend).toHaveBeenCalledWith(
      "workspace-invalidated",
      { source: "workspace" },
      { timeout: 3_000 },
    );
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });

  it("uses the authenticated admin's own channel", async () => {
    await sendWorkspaceReceiptInvalidation(undefined, { ...viewer, admin: true });

    expect(mocks.client.channel).toHaveBeenCalledWith(
      `edicut:admin:${viewer.id}`,
      expect.any(Object),
    );
  });

  it("does not attempt an invalid topic and keeps the receipt path best-effort", async () => {
    await expect(sendWorkspaceReceiptInvalidation(undefined, { id: "bad-id", admin: false })).resolves.toBe(false);
    expect(mocks.getAdmin).not.toHaveBeenCalled();

    mocks.channel.httpSend.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(sendWorkspaceReceiptInvalidation(undefined, viewer)).resolves.toBe(false);
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
