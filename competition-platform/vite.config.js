import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const portalDependencies = fileURLToPath(new URL("./node_modules/", import.meta.url));

export default defineConfig({
  root: ".",
  resolve: {
    alias: [
      { find: /^three$/, replacement: resolve(portalDependencies, "three") },
      { find: /^gsap$/, replacement: resolve(portalDependencies, "gsap") }
    ]
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            proxyRequest.setHeader("x-dev-proxy-host", request.headers.host || "");
          });
        }
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");
          if (normalized.includes("/node_modules/three/")) return "three-vendor";
          if (normalized.includes("/node_modules/gsap/")) return "animation-vendor";
        }
      }
    }
  }
});
