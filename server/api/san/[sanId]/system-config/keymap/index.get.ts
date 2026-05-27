import { readConsoleKeymapInfo } from '~~/server/utils/console-keymap'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  return await readConsoleKeymapInfo(sanId)
})

