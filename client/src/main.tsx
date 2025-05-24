import * as Sentry from "@sentry/react";
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "development",
  release: import.meta.env.VITE_SENTRY_RELEASE || "skynet-agent-client@0.1.0",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: Number.parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || "1.0"),
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>An error has occurred in the Skynet Agent UI.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
