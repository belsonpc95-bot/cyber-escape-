import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "three-vendor": ["three"],
          "animation-vendor": ["gsap"]
        }
      }
    }
  }
});
