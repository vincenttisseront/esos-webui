<template>
  <div class="flex flex-col gap-3" style="height: calc(100vh - 230px); min-height: 480px">
    <div class="flex items-center justify-between shrink-0">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ statusLabel }}
      </p>
      <UButton
        icon="i-heroicons-arrow-path"
        size="xs"
        variant="soft"
        :disabled="wsStatus === 'connecting'"
        @click="reconnect"
      >
        Reconnecter
      </UButton>
    </div>

    <p v-if="missingSanId" class="text-sm text-amber-600 dark:text-amber-400 shrink-0">
      Identifiant SAN manquant — impossible d’ouvrir la console.
    </p>

    <div
      ref="termContainer"
      class="flex-1 min-h-0 w-full rounded-lg border border-gray-200 bg-black p-2 dark:border-gray-800"
    />
  </div>
</template>

<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{ sanId: string }>()

const missingSanId = computed(() => !props.sanId?.trim())

type WSStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
const wsStatus = ref<WSStatus>('idle')
const statusLabel = computed<string>(() => ({
  idle:       'Non connecté',
  connecting: 'Connexion…',
  open:       'Connecté à ESOS',
  closed:     'Déconnecté',
  error:      'Erreur de connexion',
}[wsStatus.value]))

const termContainer = ref<HTMLElement | null>(null)

let term:          import('@xterm/xterm').Terminal    | null = null
let fitAddon:      import('@xterm/addon-fit').FitAddon | null = null
let socket:        WebSocket                          | null = null
let resizeObserver: ResizeObserver                   | null = null

async function connect() {
  if (!props.sanId?.trim()) {
    wsStatus.value = 'error'
    return
  }
  if (!termContainer.value) return

  const { Terminal }     = await import('@xterm/xterm')
  const { FitAddon }     = await import('@xterm/addon-fit')
  const { WebLinksAddon } = await import('@xterm/addon-web-links')

  term?.dispose()
  term = new Terminal({
    cursorBlink: true,
    fontFamily:  'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize:    11,
    lineHeight:  1.2,
    theme:       { background: '#000000' },
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())
  await nextTick()
  term.open(termContainer.value)
  await nextTick()
  fitAddon.fit()

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url   = `${proto}://${window.location.host}/ws/terminal?sanId=${encodeURIComponent(props.sanId)}`
  wsStatus.value = 'connecting'
  socket = new WebSocket(url)

  socket.addEventListener('open', () => {
    wsStatus.value = 'open'
    // Premier message : dimensions réelles de xterm.js
    // Le serveur n'ouvrira le shell SSH qu'après réception de ce message,
    // évitant ainsi tout resize post-connect qui ferait planter la TUI ESOS
    socket!.send(JSON.stringify({ type: 'init', cols: term!.cols, rows: term!.rows }))
  })
  socket.addEventListener('message', (ev) => {
    term?.write(typeof ev.data === 'string' ? ev.data : '')
  })
  socket.addEventListener('close', () => {
    wsStatus.value = 'closed'
    term?.write('\r\n[connection closed]\r\n')
  })
  socket.addEventListener('error', () => {
    wsStatus.value = 'error'
    term?.write('\r\n\x1b[31m[WebSocket error]\x1b[0m\r\n')
  })

  term.onData((data) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(data)
  })

  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
    sendResize()
  })
  resizeObserver.observe(termContainer.value!)
}

function sendResize() {
  if (!term || socket?.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
}

function reconnect() {
  socket?.close()
  connect()
}

onMounted(() => connect())
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  socket?.close()
  term?.dispose()
})
</script>
