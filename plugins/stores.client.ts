import { shouldSkipAuthMeFetch } from '~/utils/auth-client'
import { startCoreAppPolling, stopAllAppPolling } from '~/utils/app-polling'
import { startRegisteredPollers } from '~/utils/polling-coordinator'

export default defineNuxtPlugin(async (nuxtApp) => {
  const sanSelector = useSelectedSan()
  const auth = useAuthStore()
  const appVersionStore = useAppVersionStore()
  const route = useRoute()

  appVersionStore.fetchVersion().catch(() => {})

  if (!auth.fetched && !shouldSkipAuthMeFetch(route.path)) {
    await auth.fetchMe(useRequestFetch())
  }

  if (auth.isAuthenticated) {
    if (!sanSelector.sans.value.length) {
      await sanSelector.fetchSans()
    }

    nuxtApp.hook('app:mounted', () => {
      if (auth.isAuthenticated) startCoreAppPolling()
    })
  }

  const router = useRouter()
  router.afterEach(() => {
    if (auth.isAuthenticated) startRegisteredPollers()
  })
})
