import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Teach the test runner the "@/..." path alias from tsconfig.json. Without this
// a test can only import modules that happen to use relative imports, which
// left the aliased half of the codebase untestable.
register(new URL("./alias-hooks.mjs", import.meta.url), pathToFileURL("./"));
