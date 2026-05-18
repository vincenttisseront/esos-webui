// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  // Production: DevTools off unless explicitly enabled (Batch 2D)
  devtools: {
    enabled: process.env.NODE_ENV === 'development' || process.env.NUXT_DEVTOOLS === 'true',
  },
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@pinia/nuxt', '@nuxtjs/i18n'],
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'fr',
    locales: [
      { code: 'fr', name: 'Français', file: 'fr.json', language: 'fr-FR' },
      { code: 'en', name: 'English',  file: 'en.json', language: 'en-US' },
    ],
    lazy: true,
    bundle: { optimizeTranslationDirective: false },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'esos_locale',
      cookieSecure: true,
      cookieCrossOrigin: false,
      alwaysRedirect: false,
      redirectOn: 'no prefix',
      fallbackLocale: 'fr',
    },
    vueI18n: '~/i18n/i18n.config.ts',
  },
  css: ['~/assets/css/main.css'],
  ssr: true,
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  runtimeConfig: {
    // Server-only — never exposed to the client.
    sshHost: process.env.NUXT_SSH_HOST || '',
    sshPort: process.env.NUXT_SSH_PORT || '22',
    sshUser: process.env.NUXT_SSH_USER || '',
    sshPrivateKey: process.env.NUXT_SSH_PRIVATE_KEY || '',
    sshPassword: process.env.NUXT_SSH_PASSWORD || '',
    sshKeyPath: process.env.NUXT_SSH_KEY_PATH || '',
  },
  nitro: {
    experimental: {
      websocket: true,
    },
    // better-sqlite3 ships a native .node binding — must stay external
    // (bundling would break the require() of the prebuilt binary).
    externals: {
      external: ['better-sqlite3', 'argon2'],
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
