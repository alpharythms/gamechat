# Chat Application

## Logging System

The application uses a privacy-focused logging system that behaves differently in development and production environments.

### Development Environment

In development, the logger provides detailed information to assist with debugging:

- All log levels enabled (debug, info, warn, error)
- Full request/response logging
- Character responses and user messages
- Detailed error stacks
- Socket connection events
- API timing information
- Log rotation: 5MB file size, 3-day retention

### Production Environment

In production, logging is minimal to protect user privacy:

- Only error-level logging enabled
- No logging of user messages or character responses
- No request/response bodies
- Limited metadata logging:
  - HTTP status codes
  - Request duration
  - HTTP method
  - Path information
  - Error types
  - Timestamps
- Log rotation: 1MB file size, 1-day retention
- Compressed archives

### Log File Locations

- Development: `./logs/app-[DATE].log`
- Production: `./logs/app-[DATE].log` (minimal content)
- Current log symlink: `./logs/current.log`
- Audit file: `./logs/audit.json`

### Environment Variables

- `NODE_ENV`: Controls logging behavior ('development' or 'production')
- `DISABLE_LOGGING`: Set to 'true' to completely disable logging in production
- `ENABLE_DEBUG_LOGS`: Set to 'true' to enable debug logs even in production (not recommended)

### Utility Functions

- `sanitizeData()`: Redacts sensitive information (passwords, tokens, etc.)
- `truncateData()`: Limits large data (500 char limit, 10 items for arrays)
- `filterProductionMetadata()`: Ensures only allowed metadata is logged in production

### Browser Console Logging

- Development: All log levels shown
- Production: Only errors shown with minimal metadata
- API errors always logged with safe metadata

### Best Practices

1. Never log user messages or character responses in production
2. Use error logging for system errors only
3. Keep metadata minimal in production
4. Use appropriate log levels:
   - debug: Detailed debugging (dev only)
   - info: General operational events (dev only)
   - warn: Warning conditions (dev only)
   - error: Error conditions (both dev and prod)
