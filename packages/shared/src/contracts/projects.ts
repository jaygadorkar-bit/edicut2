import { z } from "zod";
import { projectStatuses } from "./index.js";

export const projectInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(20).max(500),
  status: z.enum(projectStatuses),
  featured: z.boolean().default(false),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function slugifyProjectTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
