import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9001,
    proxy: {
      "/api": "http://localhost:3000"
    }
  }
})
