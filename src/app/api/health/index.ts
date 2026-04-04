import { createElysia } from '@/utils/elysia'

export const routeHealth = createElysia()
  .get('/health', () => ({
    status: 'ok',
    uptime: (process.uptime()).toFixed(0),
    timestamp: new Date().toISOString()
  }))