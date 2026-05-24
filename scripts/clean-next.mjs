import { rm } from "node:fs/promises";
import { join } from "node:path";

const nextDir = join(process.cwd(), ".next");

await rm(nextDir, { recursive: true, force: true });
console.log("Removed .next cache");
