import { logixlysia } from 'logixlysia';

export const logger = logixlysia({
  config: {
    service: 'StalHub-backend',
    showStartupMessage: true,
    startupMessageFormat: 'banner',
    showContextTree: true,
    contextDepth: 2,
    slowThreshold: 500,
    verySlowThreshold: 1000,
    timestamp: {
      translateTime: 'yyyy-mm-dd HH:MM:ss.SSS',
    },
    ip: true,
  },
});