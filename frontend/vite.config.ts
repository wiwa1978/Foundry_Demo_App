import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.{ts,tsx}", "../usecases_media/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "../usecases_media/**/*.test.{ts,tsx}",
        "src/components/ui/**",
        "src/test/**",
        "src/**/types.ts",
        "src/app/workspace/contracts.ts",
        "src/features/voice/TextToSpeechAvatarWorkspace.tsx",
        "src/features/voice/useTextToSpeechAvatar.ts",
        "../usecases_media/language_learning/module.ts",
        "../usecases_media/text_to_speech_avatar/frontend.ts",
        "../usecases_media/text_to_speech_avatar/module.ts",
        "src/**/*worklet*",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        statements: 19,
        branches: 77.4,
        functions: 63,
        lines: 19,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@media": path.resolve(__dirname, "../usecases_media"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        ws: true,
      },
    },
  },
});
