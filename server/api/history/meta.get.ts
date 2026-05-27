import { defineEventHandler } from 'h3'
import { buildHistoryMeta, parseHistoryQuery } from '../../utils/history-metrics'

export default defineEventHandler(async (event) => {
  const scope = parseHistoryQuery(event)
  return buildHistoryMeta(scope)
})
