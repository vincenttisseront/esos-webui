<template>
  <div class="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
    <AppSidebar />
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
      <ClientOnly>
        <SSHStatusBanner />
      </ClientOnly>
      <AppHeader />
      <NetworkRestartBanner />
      <main class="flex-1 overflow-y-auto p-6 flex flex-col">
        <slot />
      </main>
      <footer class="shrink-0 border-t border-gray-200 dark:border-gray-800 px-6 py-2 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-600 gap-1">
        <ClientOnly>
          <span v-if="appVersionStore.version" class="font-mono text-[10px]">
            {{ appVersionStore.fullLabel }}
          </span>
        </ClientOnly>
        <div class="flex items-center gap-1 ml-auto">
          <span>© 2026 Vincent TISSERONT</span>
          <span>·</span>
          <a
            href="https://github.com/vincenttisseront/esos-webui"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-gray-600 dark:hover:text-gray-400 transition-colors flex items-center gap-1"
          >
            <UIcon name="i-heroicons-code-bracket" class="w-3 h-3" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
const appVersionStore = useAppVersionStore()
</script>
