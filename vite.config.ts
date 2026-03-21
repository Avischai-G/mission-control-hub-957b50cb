import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { localFileServicePlugin } from "./scripts/local-file-service-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["host.docker.internal", "127.0.0.1", "localhost"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    localFileServicePlugin(path.resolve(__dirname)),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
