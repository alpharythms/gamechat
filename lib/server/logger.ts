import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

// Privacy filter for production logs
const privacyFilter = winston.format((info: winston.Logform.TransformableInfo) => {
  if (process.env.NODE_ENV === 'production') {
    // Only allow specific metadata in production
    const allowedMetadata = [
      'status',
      'statusCode',
      'duration',
      'method',
      'path',
      'errorType',
      'timestamp'
    ]
    
    // Filter metadata if it exists
    const metadata = info.metadata as Record<string, any> | undefined
    if (metadata) {
      info.metadata = Object.fromEntries(
        Object.entries(metadata).filter(([key]) => allowedMetadata.includes(key))
      )
    }
    
    // Never log user data or character responses in production
    if ('responses' in info) delete info.responses
    if (typeof info.message === 'string' && info.message.includes('character response')) return false
    if ('content' in info) delete info.content
  }
  return info
})

// Development formatter with detailed logging
const devFormatter = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}`
  })
)

// Production formatter with minimal logging
const prodFormatter = winston.format.combine(
  winston.format.timestamp(),
  privacyFilter(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}`
  })
)

// Select formatter based on environment
const formatter = process.env.NODE_ENV === 'production' ? prodFormatter : devFormatter

// Ensure logs directory exists
import { mkdirSync, existsSync } from 'fs'
const logsDir = './logs'
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true })
}

// Configure file rotation based on environment
const fileRotateTransport = new DailyRotateFile({
  filename: './logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: process.env.NODE_ENV === 'production' ? '1m' : '5m', // Smaller files in production
  maxFiles: process.env.NODE_ENV === 'production' ? '1d' : '3d', // Shorter retention in production
  auditFile: './logs/audit.json',
  level: process.env.NODE_ENV === 'production' ? 'error' : 'debug', // Only errors in production
  zippedArchive: true,
  handleExceptions: true,
  json: false,
  createSymlink: true,
  symlinkName: 'current.log'
})

// Configure logger based on environment
const logger = winston.createLogger({
  levels: process.env.NODE_ENV === 'production' 
    ? { error: 0 } // Only error level in production
    : { error: 0, warn: 1, info: 2, debug: 3 },
  format: formatter,
  transports: [
    fileRotateTransport,
    // Console logging only in development
    ...(process.env.NODE_ENV !== 'production' 
      ? [new winston.transports.Console({
          format: formatter,
          level: 'debug',
        })]
      : [])
  ],
  // Additional production settings
  silent: process.env.NODE_ENV === 'production' && process.env.DISABLE_LOGGING === 'true',
  exitOnError: false
})

// Helper functions for different log levels
export const logError = (message: string, meta?: any) => {
  logger.error(message, meta)
}

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta)
}

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta)
}

export const logDebug = (message: string, meta?: any) => {
  // Only log debug in development or if explicitly enabled
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGS === 'true') {
    logger.debug(message, meta)
  }
}

export default logger
