// Utility function to sanitize sensitive data
export const sanitizeData = (data: any): any => {
  if (!data) return data
  
  const sensitiveKeys = ['authorization', 'password', 'token', 'key', 'secret']
  const sanitized = { ...data }

  Object.keys(sanitized).forEach(key => {
    // Check if key contains any sensitive words
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]'
    }
    // Recursively sanitize nested objects
    else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeData(sanitized[key])
    }
  })

  return sanitized
}

// Utility function to truncate large response data
export const truncateData = (data: any, maxLength: number = 500): any => {
  if (typeof data === 'string') {
    return data.length > maxLength 
      ? `${data.substring(0, maxLength)}... [truncated ${data.length - maxLength} characters]`
      : data
  }
  
  if (Array.isArray(data)) {
    // Only keep first 10 items in arrays
    if (data.length > 10) {
      return [...data.slice(0, 10).map(item => truncateData(item, maxLength)), `... [truncated ${data.length - 10} items]`]
    }
    return data.map(item => truncateData(item, maxLength))
  }
  
  if (typeof data === 'object' && data !== null) {
    const truncated: any = {}
    Object.entries(data).forEach(([key, value]) => {
      truncated[key] = truncateData(value, maxLength)
    })
    return truncated
  }
  
  return data
}

// Production-safe metadata filter
const filterProductionMetadata = (meta?: any) => {
  if (!meta || process.env.NODE_ENV !== 'production') return meta

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

  if (typeof meta === 'object') {
    const filtered = Object.fromEntries(
      Object.entries(meta).filter(([key]) => allowedMetadata.includes(key))
    )
    return Object.keys(filtered).length ? filtered : undefined
  }

  return undefined
}

// Simple browser-safe logger
const logger = {
  error: (message: string, meta?: any) => {
    // Always log errors, but sanitize in production
    const sanitizedMeta = process.env.NODE_ENV === 'production'
      ? filterProductionMetadata(meta)
      : sanitizeData(meta)
    console.error(`[ERROR] ${message}`, sanitizedMeta || '')
  },
  warn: (message: string, meta?: any) => {
    // Only log warnings in development
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[WARN] ${message}`, sanitizeData(meta) || '')
    }
  },
  info: (message: string, meta?: any) => {
    // Only log info in development
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[INFO] ${message}`, sanitizeData(meta) || '')
    }
  },
  debug: (message: string, meta?: any) => {
    // Only log debug in development
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${message}`, sanitizeData(meta) || '')
    }
  }
}

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
  logger.debug(message, meta)
}

// Export a production-safe API logger
export const apiLogger = {
  request: (method: string, url: string, headers: any, body?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      // Full logging in development
      logDebug(`API Request: ${method} ${url}`, {
        headers: sanitizeData(headers),
        body: truncateData(body)
      })
    }
  },
  
  response: (url: string, status: number, headers: any, body?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      // Full logging in development
      logDebug(`API Response: ${url} (${status})`, {
        headers: sanitizeData(headers),
        body: truncateData(body)
      })
    } else if (status >= 400) {
      // Only log errors in production with minimal info
      logError(`API Error: ${status}`, {
        path: url,
        statusCode: status
      })
    }
  },
  
  error: (url: string, error: any) => {
    if (process.env.NODE_ENV === 'production') {
      // Minimal error logging in production
      logError(`API Error`, {
        path: url,
        errorType: error.name || 'UnknownError'
      })
    } else {
      // Full error logging in development
      logError(`API Error: ${url}`, {
        message: error.message,
        stack: error.stack
      })
    }
  }
}

export default logger
