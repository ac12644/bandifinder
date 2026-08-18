/**
 * Local development server using @hono/node-server
 */
// Must precede every other import: see loadEnv.ts. Imports execute in source
// order, so this populates process.env before ./app and ./instrument read it.
import "./loadEnv";
import "./instrument";

import { serve } from "@hono/node-server";
import app from "./app";

const port = Number(process.env.PORT) || 3001;

console.log(`🚀 Bandifinder API running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
