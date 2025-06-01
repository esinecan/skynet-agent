import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { sentryVitePlugin } from "@sentry/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      org: "eren-can-sinecan",
      project: "skynet",
      authToken: "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",
      sourcemaps: {
        assets: "./dist/**"
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:9000"
    }
  },
  build: {
    sourcemap: true // Enable source maps for Sentry
  }
})
