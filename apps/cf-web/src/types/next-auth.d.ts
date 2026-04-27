import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "customer" | "affiliate" | "editor" | "project_manager" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    role: "customer" | "affiliate" | "editor" | "project_manager" | "admin";
  }
}
