/**
 * Environment loading, kept in its own module so it runs first.
 *
 * ES module imports are hoisted: every `import` in a file executes before any
 * statement in that file's body. So calling dotenv's `config()` in the body of
 * server.ts happened AFTER `import app from "./app"` had already pulled in the
 * whole application — and modules that capture env at load time, like
 * lib/clerk.ts reading CLERK_SECRET_KEY into a const, saw undefined.
 *
 * The visible symptom was Clerk silently running in "not configured" mode
 * locally, so every authenticated route answered 401.
 *
 * Importing this module before ./app fixes the ordering, because imports run
 * in source order relative to each other.
 *
 * Only local development needs this. On Vercel the environment is already
 * populated in the process, and no .env.local exists.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
