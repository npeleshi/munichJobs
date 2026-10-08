// Lets plain Node (with --experimental-strip-types) resolve the app's "@/…" alias
// and extensionless TypeScript imports, so pure modules can be tested without a build.
import { register } from "node:module";
register(new URL("./resolve-hook.mjs", import.meta.url));
