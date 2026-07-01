import { build } from "vite";
import { startServer } from "../src/server/app";

await build();
await startServer({ openBrowser: true });
