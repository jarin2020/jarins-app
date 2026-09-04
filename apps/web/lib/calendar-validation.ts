import { z } from "zod";

export const calendarEventInputSchema = z
  .object({
    sourceId: z.uuid(),
    title: z.string().trim().min(1).max(500),
    description: z.string().max(20000).optional().default(""),
    location: z.string().max(1000).optional().default(""),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    allDay: z.boolean().optional().default(false),
    timezone: z.string().trim().min(1).max(100).optional().default("UTC"),
    attendees: z
      .array(
        z.object({
          name: z.string().trim().max(160).optional(),
          address: z.email().max(320),
        }),
      )
      .max(100)
      .optional()
      .default([]),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "End time must be after start time.",
  });
