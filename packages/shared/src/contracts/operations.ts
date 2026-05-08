import { z } from "zod";

export const contactIntakeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  projectType: z.string().trim().max(120).optional(),
  monthlyVolume: z.string().trim().max(120).optional(),
  brief: z.string().trim().min(20).max(1200),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

export const passwordResetConsumeSchema = z.object({
  password: z.string().min(8).max(120),
  confirmPassword: z.string().min(8).max(120),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export const securitySettingsSchema = z.object({
  loginAlerts: z.boolean(),
  passwordRotationDays: z.number().int().min(1).max(365),
  mfaRollout: z.enum(["planned", "pilot", "enabled"]),
});

export const operationResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  runtime: z.string(),
  requestClass: z.string(),
});

export type ContactIntakeInput = z.infer<typeof contactIntakeSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConsumeInput = z.infer<typeof passwordResetConsumeSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
export type OperationResult = z.infer<typeof operationResultSchema>;
