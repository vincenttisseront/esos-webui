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
        {{ t('terminal.ws.reconnect') }}
      </UButton>
    </div>

    <p v-if="missingSanId" class="text-sm text-amber-600 dark:text-amber-400 shrink-0">
      {{ t('terminal.ws.errors.san_missing') }}
    </p>

    <p v-if="authError" class="text-sm text-red-600 dark:text-red-400 shrink-0">
      {{ authError }}
    </p>

    <div
      ref="termContainer"
      class="flex-1 min-h-0 w-full rounded-lg border border-gray-200 bg-black p-2 dark:border-gray-800"
    />
  </div>
</template>

<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import {
  buildTerminalWsUrl,
  classifyTerminalWsClose,
  terminalHttpErrorKind,
} from '~/utils/terminal-ws-client'

const props = defineProps<{ sanId: string }>()

const { t } = useEsosI18n()

const missingSanId = computed(() => !props.sanId?.trim())

type WSStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
const wsStatus = ref<WSStatus>('idle')
const authError = ref<string | null>(null)

const statusLabel = computed<string>(() => ({
  idle:       t('terminal.ws.status.idle') as string,
  connecting: t('terminal.ws.status.connecting') as string,
  open:       t('terminal.ws.status.open') as string,
  closed:     t('terminal.ws.status.closed') as string,
  error:      t('terminal.ws.status.error') as string,
}[wsStatus.value]))

const termContainer = ref<HTMLElement | null>(null)

let term:           import('@xterm/xterm').Terminal    | null = null
let fitAddon:       import('@xterm/addon-fit').FitAddon | null = null
let socket:         WebSocket                          | null = null
let resizeObserver: ResizeObserver                   | null = null

function writeTerminalLine(msg: string, color: 'yellow' | 'red' = 'yellow') {
  const code = color === 'red' ? '31' : '33'
  term?.write(`\r\n\x1b[${code}m${msg}\x1b[0m\r\n`)
}

async function connect() {
  authError.value = null
  if (!props.sanId?.trim()) {
    wsStatus.value = 'error'
    return
  }
  if (!termContainer.value) return

  const { Terminal }      = await import('@xterm/xterm')
  const { FitAddon }      = await import('@xterm/addon-fit')
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

  wsStatus.value = 'connecting'

  let ticket = ''
  try {
    const res = await $fetch<{ ticket: string }>(
      `/api/san/${encodeURIComponent(props.sanId)}/terminal/ws-ticket`,
    )
    ticket = res.ticket
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    const kind   = status ? terminalHttpErrorKind(status) : 'ticket_failed'
    const key    = `terminal.ws.errors.${kind}` as const
    authError.value = t(key) as string
    writeTerminalLine(authError.value, 'red')
    wsStatus.value = 'error'
    return
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url   = buildTerminalWsUrl({
    host:     window.location.host,
    protocol: proto,
    sanId:    props.sanId.trim(),
    ticket,
  })

  socket = new WebSocket(url)
  let wasEverOpen = false

  socket.addEventListener('open', () => {
    wasEverOpen = true
    wsStatus.value = 'open'
    authError.value = null
    socket!.send(JSON.stringify({ type: 'init', cols: term!.cols, rows: term!.rows }))
  })
  socket.addEventListener('message', (ev) => {
    term?.write(typeof ev.data === 'string' ? ev.data : '')
  })
  socket.addEventListener('close', (ev) => {
    wsStatus.value = wasEverOpen ? 'closed' : 'error'
    const key = classifyTerminalWsClose({
      code: ev.code,
      reason: ev.reason,
      wasEverOpen,
    })
    const msg = t(key) as string
    authError.value = msg
    writeTerminalLine(msg, wasEverOpen ? 'yellow' : 'red')
  })
  socket.addEventListener('error', () => {
    if (!wasEverOpen) {
      wsStatus.value = 'error'
      if (!authError.value) {
        const msg = t('terminal.ws.errors.proxy_failure') as string
        authError.value = msg
        writeTerminalLine(msg, 'red')
      }
    }
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
