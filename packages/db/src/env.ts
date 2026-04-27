import { z } from "zod";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export function parseDatabaseEnv(source: Record<string, string | undefined>): DatabaseEnv {
  return databaseEnvSchema.parse(source);
}
