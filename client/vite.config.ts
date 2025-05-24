import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { sentryVitePlugin } from "@sentry/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    // Sentry plugin for source maps and release management
    sentryVitePlugin({
      org: "esinecan",
      project: "skynet-agent-client",
      authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
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
