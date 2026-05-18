/**
 * Public liveness probe only (Batch 2D). No auth — keep payload minimal.
 * Detailed metrics: GET /api/admin/health (admin + operator, RBAC).
 */
export default defineEventHandler((event) => {
  setResponseStatus(event, 200)
  return {
    status:    'ok',
    timestamp: new Date().toISOString(),
  }
})
