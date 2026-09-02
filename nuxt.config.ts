// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  // Production: DevTools off unless explicitly enabled (Batch 2D)
  devtools: {
    enabled: process.env.NODE_ENV === 'development' || process.env.NUXT_DEVTOOLS === 'true',
  },
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@pinia/nuxt', '@nuxtjs/i18n'],
  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storage: 'cookie',
    storageKey: 'esos_theme',
  },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'fr',
    locales: [
      { code: 'fr', name: 'Français', file: 'fr.json', language: 'fr-FR' },
      { code: 'en', name: 'English',  file: 'en.json', language: 'en-US' },
    ],
    lazy: true,
    bundle: { optimizeTranslationDirective: false },
    // Cookie-only detection: avoids client-only navigator.language switching
    // after SSR (fr default), which causes hydration text mismatches.
    detectBrowserLanguage: false,
    vueI18n: '~/i18n/i18n.config.ts',
  },
  css: ['~/assets/css/main.css'],
  ssr: true,
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  runtimeConfig: {
    public: {
      sshStatusPollMs: Number(process.env.NUXT_PUBLIC_SSH_STATUS_POLL_MS) || 30_000,
    },
    // Server-only — never exposed to the client.
    sshHost: process.env.NUXT_SSH_HOST || '',
    githubToken: process.env.NUXT_GITHUB_TOKEN || '',
    sshPort: process.env.NUXT_SSH_PORT || '22',
    sshUser: process.env.NUXT_SSH_USER || '',
    sshPrivateKey: process.env.NUXT_SSH_PRIVATE_KEY || '',
    sshPassword: process.env.NUXT_SSH_PASSWORD || '',
    sshKeyPath: process.env.NUXT_SSH_KEY_PATH || '',
    esosBinariesDir: process.env.ESOS_BINARIES_DIR || '/opt/esos-webui/binaries',
    deploymentCatalogDir: process.env.ESOS_DEPLOYMENT_CATALOG_DIR || '/app/data/deployment-binaries',
    deploymentMaxBytes: Number(process.env.NUXT_DEPLOYMENT_MAX_BYTES) || 524_288_000,
  },
  nitro: {
    experimental: {
      websocket: true,
      legacyExternals: true,
    },
    // Native bindings (.node) must stay external — bundling breaks require().
    externals: {
      external: ['better-sqlite3', 'argon2', 'ssh2', 'cpu-features'],
      traceInclude: [
        'node_modules/ssh2/**',
        'node_modules/cpu-features/**',
      ],
    },
    rollupConfig: {
      external: ['ssh2', 'cpu-features', 'better-sqlite3', 'argon2'],
    },
  },
  app: {
    head: {
      title: 'ESOS WebUI',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'ESOS SAN visualization interface' },
      ],
    },
  },
})
