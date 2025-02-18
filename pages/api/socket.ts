import { Server as NetServer } from 'http'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { NextApiRequest } from 'next'
import { NextApiResponseWithSocket } from './types'
import { logInfo, logError } from '@/lib/server/logger'
import { truncateData } from '@/lib/logger'

interface CharacterResponse {
  response: string
  error?: string
  vote?: {
    choice: string
    reasoning: string
    timestamp: number
  }
}

interface ApiResponse {
  characters: Record<string, string | CharacterResponse>
  timing: {
    total: number
    characters: Record<string, number>
  }
}

interface ChatMessage {
  type: 'introduction' | 'story' | 'vote'
  content?: string
  setting?: string
  systemMessage?: string
  characterInstructions?: string
  choices?: string[]
  socketId?: string
}

interface SocketState {
  socket: Socket
  lastPing: number
  isProcessing: boolean
  initialized: boolean
  authSource: 'query' | 'event' | null
}

interface SocketRequest {
  url?: string
  headers: {
    host?: string
    [key: string]: string | string[] | undefined
  }
}

// Helper to extract think content from response
function extractThinkContent(text: string): { think: string, response: string } {
  const thinkMatch = text.match(/<think>([^]*?)<\/think>/)
  if (thinkMatch) {
    return {
      think: thinkMatch[1].trim(),
      response: text.replace(/<think>[^]*?<\/think>/, '').trim()
    }
  }
  return { think: '', response: text.trim() }
}

// Helper to extract vote from character response
function extractVote(response: string, choices: string[]): { choice: string, reasoning: string } | null {
  // Look for a clear choice statement at the end of the response
  const lines = response.split('\n').map(line => line.trim()).filter(Boolean)
  const lastLines = lines.slice(-3) // Look at last few lines for the choice

  for (const line of lastLines) {
    // Look for exact matches of choices
    for (const choice of choices) {
      if (line.toLowerCase().includes(`i choose ${choice.toLowerCase()}`) || 
          line.toLowerCase().includes(`my choice is ${choice.toLowerCase()}`)) {
        return {
          choice,
          reasoning: lines.slice(0, -1).join('\n') // Everything before the choice line
        }
      }
    }
  }

  return null
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

const ioHandler = async (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  if (!res.socket.server.io) {
    const httpServer: NetServer = res.socket.server as any
    const io = new SocketIOServer(httpServer, {
      path: '/api/socket',
      addTrailingSlash: false,
      // Start with polling for initial connection
      transports: ['polling', 'websocket'],
      // Ensure stable connection
      pingTimeout: 30000,
      pingInterval: 25000,
      connectTimeout: 60000,
      // Allow cross-origin
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      // Enable backwards compatibility
      allowEIO3: true,
      // Handshake settings
      allowUpgrades: true,
      upgradeTimeout: 10000,
      // Handle auth for long-running connections
      allowRequest: (req: SocketRequest, callback: (err: string | null, success: boolean) => void) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`)
        const queryToken = url.searchParams.get('token')
        const authHeader = req.headers.authorization
        const authToken = typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined
        const token = queryToken || authToken

        if (token === 'long-running-connection') {
          // Will set authSource after socket is created
          callback(null, true)
        } else {
          logInfo('Socket connection without valid auth token', { 
            headers: req.headers,
            query: Object.fromEntries(url.searchParams)
          })
          callback(null, true)
        }
      }
    })

    // Store active sockets and their state
    const activeSockets = new Map<string, SocketState>()

    // Ping check interval
    const pingInterval = setInterval(() => {
      const now = Date.now()
      activeSockets.forEach((state, socketId) => {
        if (now - state.lastPing > 35000) { // Slightly longer than pingTimeout
          logError('Socket ping timeout detected', { socketId })
          state.socket.disconnect(true)
          activeSockets.delete(socketId)
        }
      })
    }, 5000)

    // Clean up on server shutdown
    const cleanup = () => {
      clearInterval(pingInterval)
      activeSockets.forEach((state) => {
        state.socket.disconnect(true)
      })
      activeSockets.clear()
    }

    process.on('SIGTERM', cleanup)
    process.on('SIGINT', cleanup)

    io.on('connection', (socket: Socket) => {
      logInfo('Socket connected', { 
        id: socket.id,
        auth: socket.handshake.auth,
        query: socket.handshake.query,
        transport: socket.conn.transport.name
      })

      // Initialize socket state
      const url = new URL(socket.handshake.url, `http://${socket.handshake.headers.host}`)
      const queryToken = url.searchParams.get('token')
      const authHeader = socket.handshake.headers.authorization
      const authToken = typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined
      const token = queryToken || authToken

      activeSockets.set(socket.id, {
        socket,
        lastPing: Date.now(),
        isProcessing: false,
        initialized: token === 'long-running-connection',
        authSource: token === 'long-running-connection' ? 'query' : null
      })

      // Handle transport upgrade
      socket.conn.on('upgrade', () => {
        const socketState = activeSockets.get(socket.id)
        if (socketState) {
          logInfo('Socket transport upgraded', {
            id: socket.id,
            transport: socket.conn.transport.name
          })
        }
      })

      // Handle auth verification
      socket.on('verify_auth', ({ token }: { token: string }, callback: (response: { success: boolean, error?: string }) => void) => {
        const socketState = activeSockets.get(socket.id)
        if (!socketState) {
          callback({ success: false, error: 'Socket state not found' })
          return
        }

        // Skip if already authenticated via query
        if (socketState.authSource === 'query') {
          callback({ success: true })
          return
        }

        if (token === 'long-running-connection') {
          logInfo('Socket authenticated via event', { id: socket.id })
          socketState.initialized = true
          socketState.authSource = 'event'
          callback({ success: true })
        } else {
          logError('Socket auth failed', { id: socket.id, token })
          callback({ success: false, error: 'Invalid auth token' })
        }
      })

      // Handle ping messages
      socket.on('ping', () => {
        const socketState = activeSockets.get(socket.id)
        if (socketState) {
          socketState.lastPing = Date.now()
          socket.emit('pong')
          logInfo('Ping received and updated', { 
            id: socket.id,
            lastPing: socketState.lastPing
          })
        }
      })

      socket.on('disconnect', (reason: string) => {
        const socketState = activeSockets.get(socket.id)
        if (socketState) {
          logInfo('Socket disconnected', { 
            id: socket.id, 
            reason,
            wasProcessing: socketState.isProcessing,
            timeSinceLastPing: Date.now() - socketState.lastPing
          })
          // Clean up socket state
          activeSockets.delete(socket.id)
        }
      })

      socket.on('message', async (message: ChatMessage, callback: (error?: string | null) => void) => {
        try {
          const socketState = activeSockets.get(socket.id)
          if (!socketState?.initialized) {
            throw new Error('Socket not authenticated')
          }

          logInfo('Socket message received', { 
            type: message.type,
            socketId: message.socketId || socket.id,
            messageData: JSON.stringify(message)
          })

          const protocol = req.headers['x-forwarded-proto'] || 'http'
          const host = req.headers['x-forwarded-host'] || req.headers.host
          const baseUrl = `${protocol}://${host}`
          
          logInfo('Making API request', { 
            url: `${baseUrl}/api/chat`,
            socketId: socket.id 
          })

          // Add timeout to fetch request
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 30000)

          const response = await fetch(`${baseUrl}/api/chat`, {
            signal: controller.signal,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              ...message,
              socketId: socket.id // Always use the current socket ID
            }),
          }).catch(error => {
            logError('Fetch error', { 
              error: error instanceof Error ? error.message : 'Unknown error',
              socketId: socket.id 
            })
            throw error
          })

          clearTimeout(timeout)

          if (!response.ok) {
            const error = await response.text().catch(() => 'Failed to read error response')
            logError('Socket API error', { 
              error: truncateData(error, 200),
              socketId: socket.id,
              status: response.status,
              statusText: response.statusText
            })
            socket.emit('error', { content: `API Error: ${error}` })
            if (callback) callback(`API Error: ${error}`)
            return
          }

          logInfo('API response received', { 
            socketId: socket.id,
            status: response.status
          })

          const result = await response.json().catch(error => {
            logError('JSON parse error', { 
              error: error instanceof Error ? error.message : 'Unknown error',
              socketId: socket.id 
            })
            throw new Error('Failed to parse API response')
          }) as ApiResponse

          if (!result || !result.characters) {
            throw new Error('Invalid API response format')
          }

          // Get the socket state
          if (!socketState) {
            throw new Error('Socket not found')
          }

          // Mark as processing
          socketState.isProcessing = true
          socketState.lastPing = Date.now() // Reset ping timer during processing

          try {
            // Track character responses
            const characterResponses = new Map()
            
            // Emit individual character responses with any error information
            Object.entries(result.characters).forEach(([slug, content]) => {
              characterResponses.set(slug, true)
              if (slug === 'narrator') {
                // Extract think content and main response
                const contentStr = typeof content === 'string' ? content : content.response
                const { think, response } = extractThinkContent(contentStr)
                socketState.socket.emit('narrator', { 
                  content: response,
                  type: 'response',
                  fullResponse: contentStr
                })
                if (think) {
                  socketState.socket.emit('narrator', { 
                    content: think,
                    type: 'think'
                  })
                }
              } else {
                const characterContent = typeof content === 'string' ? content : content.response
                const characterError = typeof content === 'string' ? null : content.error
                
                // For vote type messages, extract vote from response
                let vote = undefined
                if (message.type === 'vote' && message.choices && characterContent) {
                  const extractedVote = extractVote(characterContent, message.choices)
                  if (extractedVote) {
                    vote = {
                      ...extractedVote,
                      timestamp: Date.now()
                    }
                  }
                }

                socketState.socket.emit('character', { 
                  character: slug, 
                  content: characterContent,
                  timing: result.timing.characters[slug],
                  error: characterError,
                  progress: 100,
                  vote
                })
              }
            })

            // Only call callback once all characters have responded
            if (characterResponses.size === Object.keys(result.characters).length) {
              if (callback) callback(null)
            }
          } finally {
            // Mark as no longer processing
            socketState.isProcessing = false
            socketState.lastPing = Date.now() // Reset ping timer after processing
          }
        } catch (error) {
          logError('Socket message error', { 
            error: error instanceof Error ? truncateData(error.message, 200) : 'Unknown error',
            socketId: socket.id 
          })
          const errorMessage = error instanceof Error ? error.message : 'An error occurred'
          socket.emit('error', { content: errorMessage })
          
          // Reset character states on error
          const defaultCharacters = [
            { slug: 'our-strange-loop', name: 'Strange Loop' },
            { slug: 'new-claude', name: 'Claude' },
            { slug: 'catherine', name: 'Catherine' },
          ]

          activeSockets.forEach((state) => {
            defaultCharacters.forEach(character => {
              state.socket.emit('character', {
                character: character.slug,
                content: '',
                timing: 0,
                error: errorMessage,
                progress: 0
              })
            })
          })
          
          if (callback) callback(errorMessage)
        }
      })

      socket.on('error', (error: Error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logError('Socket error', { 
          error: truncateData(errorMessage, 200),
          socketId: socket.id 
        })
        // Emit error to client
        socket.emit('error', { 
          content: `Connection error: ${errorMessage}. Please refresh the page if issues persist.`
        })
      })

      socket.on('ping timeout', () => {
        logError('Socket ping timeout', { id: socket.id })
        socket.disconnect()
      })
    })

    res.socket.server.io = io
  }

  res.end()
}

export default ioHandler
