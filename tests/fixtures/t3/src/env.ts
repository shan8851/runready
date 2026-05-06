import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    REQUIRED_URL: z.string().url(),
    OPTIONAL_TOKEN: z.string().optional(),
    DEFAULT_REGION: z.string().default("eu")
  },
  runtimeEnv: {
    REQUIRED_URL: process.env.REQUIRED_URL,
    OPTIONAL_TOKEN: process.env.OPTIONAL_TOKEN,
    DEFAULT_REGION: process.env.DEFAULT_REGION
  }
});
