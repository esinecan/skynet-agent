// instrument.ts
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || "development",
  release: process.env.SENTRY_RELEASE || "skynet-agent@0.1.0",
  
  // Add integrations if needed, for example, for profiling:
  integrations: [
    nodeProfilingIntegration(),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "1.0"),

  // Set profilesSampleRate to 1.0 to profile 100%
  // of sampled transactions.
  // We recommend adjusting this value in production.
  profilesSampleRate: Number.parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || "1.0"),

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events.
  sendDefaultPii: true,
});
