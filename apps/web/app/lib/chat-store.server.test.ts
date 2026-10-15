import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import { createChatStore, chatMigrationPaused } from "./chat-store.server";
import { chatD1Binding } from "./chat-d1-remote.server";
const actor={id:"10000000-0000-4000-8000-000000000001",key:"user:10000000-0000-4000-8000-000000000001",name:"Alex",role:"customer",admin:false};
afterEach(()=>vi.unstubAllEnvs());
describe("explicit chat backend and cutover safety",()=>{
  it("defaults to PostgreSQL",()=>{const store=createChatStore({} as DatabaseClient);expect(typeof store.sendChatMessage).toBe("function");expect(typeof store.getChatSnapshot).toBe("function");});
  it("rejects unknown backends",()=>{expect(()=>createChatStore({} as DatabaseClient,{cf:{env:{CHAT_BACKEND:"typo"}}})).toThrow(Response);});
  it("fails closed when D1 is selected without a binding",()=>{expect(()=>createChatStore({} as DatabaseClient,{cf:{env:{CHAT_BACKEND:"d1"}}})).toThrow(Response);});
  it("does not write during maintenance GETs",async()=>{const execute=vi.fn();const context={cf:{env:{CHAT_MAINTENANCE:"true"}}};expect(chatMigrationPaused(context)).toBe(true);await createChatStore({execute} as unknown as DatabaseClient,context).ensureClientChatRooms(actor);expect(execute).not.toHaveBeenCalled();});
  it("does not enable management-token REST access in production",()=>{vi.stubEnv("NODE_ENV","production");expect(chatD1Binding({cf:{env:{CHAT_D1_REMOTE:"true",CLOUDFLARE_CHAT_DEV_API_TOKEN:"private"}}})).toBeUndefined();});
  it("uses the native binding ahead of development REST",()=>{const binding={prepare:vi.fn()};expect(chatD1Binding({cf:{env:{CHAT_D1:binding}}})).toBe(binding);});
});
