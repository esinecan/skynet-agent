/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string
  readonly VITE_SENTRY_ENVIRONMENT: string
  readonly VITE_SENTRY_RELEASE: string
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE: string
  // add more env variables here...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
