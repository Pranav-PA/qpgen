import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Node-environment unit tests over the pure logic the paper's correctness
 * rests on — selection, planning, crop trimming, answer resolution. Nothing
 * here touches the network, Supabase, or a browser: those paths are covered by
 * running the app, and a mock of them would only assert the mock.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
