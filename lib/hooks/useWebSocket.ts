import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Character } from '../types'
import { logInfo, logError, truncateData } from '../logger'

export interface ChatMessage {
  type: 'introduction' | 'story' | 'vote'
  content?: string
  setting?: string
  systemMessage?: string
  characterInstructions?: string
  choices?: string[]
  socketId?: string
}

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [narratorResponse, setNarratorResponse] = useState('')
  const [thinkContent, setThinkContent] = useState('')
  const [fullAIOutput, setFullAIOutput] = useState('')
  const readyTimeout = useRef<NodeJS.Timeout>()
  const [characters, setCharacters] = useState<Character[]>([
    { 
      id: '1',
      position: 1,
      slug: 'our-strange-loop', 
      name: 'Strange Loop', 
      response: '', 
      isLoading: false, 
      responseTime: 0,
      error: null,
      progress: 0,
      imageUrl: 'https://placehold.co/384x384/4A90E2/FFFFFF/svg?text=SL',
      description: 'An AI designed to explore the strange loop of human-AI collaboration'
    },
    { 
      id: '2',
      position: 2,
      slug: 'new-claude', 
      name: 'Claude', 
      response: '', 
      isLoading: false, 
      responseTime: 0,
      error: null,
      progress: 0,
      imageUrl: 'https://placehold.co/384x384/6C757D/FFFFFF/svg?text=C',
      description: 'Your new partner in conversation'
    },
    { 
      id: '3',
      position: 3,
      slug: 'catherine', 
      name: 'Catherine', 
      response: '', 
      isLoading: false, 
      responseTime: 0,
      error: null,
      progress: 0,
      imageUrl: 'https://placehold.co/384x384/28A745/FFFFFF/svg?text=C',
      description: 'A grad student in psychology'
    },
  ])

  // Socket connection management
  useEffect(() => {
    const socketIo = io({
      path: '/api/socket',
      addTrailingSlash: false,
      // Start with polling only for initial connection
      transports: ['polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      // Align timeouts with server settings
      timeout: 60000,
      // Ensure stable connection
      forceNew: true,
      // Pass auth token in query params for compatibility
      query: {
        token: 'long-running-connection'
      },
      // Also pass in auth for newer socket.io versions
      auth: {
        token: 'long-running-connection'
      }
    })

    // Connection and auth events
    socketIo.on('connect', () => {
      logInfo('Socket connected, waiting for auth')
      setIsConnected(true)
      setError(null)
      
      // Request auth verification
      socketIo.emit('verify_auth', { token: 'long-running-connection' }, (response: { success: boolean, error?: string }) => {
        if (response.success) {
          logInfo('Socket authenticated')
          setIsAuthenticated(true)
          
          // Clear any existing ready timeout
          if (readyTimeout.current) {
            clearTimeout(readyTimeout.current)
          }

          // Set a timeout to ensure we're fully ready
          readyTimeout.current = setTimeout(() => {
            logInfo('Socket ready for messages')
            setIsReady(true)
            // Send a ping to verify connection
            socketIo.emit('ping')
          }, 1000)
        } else {
          logError('Socket auth failed', { error: response.error })
          setError(`Auth failed: ${response.error}`)
          socketIo.disconnect()
        }
      })
    })

    // Handle ping response
    socketIo.on('pong', () => {
      logInfo('Socket connection verified')
    })

    socketIo.on('disconnect', (reason) => {
      logInfo('Socket disconnected', { reason })
      setIsConnected(false)
      setIsReady(false)
      setIsAuthenticated(false)
      if (readyTimeout.current) {
        clearTimeout(readyTimeout.current)
      }

      // Handle different disconnect reasons
      switch (reason) {
        case 'io server disconnect':
          // Server initiated disconnect, try to reconnect
          socketIo.connect()
          break
        case 'ping timeout':
          // Connection lost, attempt to reconnect
          logError('Connection lost (ping timeout)', { socketId: socketIo.id })
          socketIo.connect()
          break
        case 'transport close':
        case 'transport error':
          // Transport issues, attempt to reconnect with delay
          logInfo('Transport error, attempting reconnection', { reason })
          setError('Connection lost. Attempting to reconnect...')
          setTimeout(() => {
            logInfo('Attempting reconnection after transport error')
            socketIo.connect()
          }, 1000)
          break
      }
    })

    socketIo.on('connect_error', (error) => {
      logError('Socket connection error', { 
        error: error instanceof Error ? truncateData(error.message, 200) : 'Unknown error'
      })
      setError(`Connection error: ${error.message}`)
      setIsAuthenticated(false)
    })

    // Message handling
    socketIo.on('narrator', ({ content, type, fullResponse }) => {
      if (fullResponse) {
        // Store full response in debug panel
        setFullAIOutput(fullResponse)
      }
      if (type === 'think') {
        // Update think content in config panel
        setThinkContent(content)
      } else {
        // Append regular content to main narrative
        setNarratorResponse(prev => prev + content)
      }
    })

    socketIo.on('character', ({ character, content, timing, progress, error, vote }) => {
      if (character) {
        logInfo('Character update received', {
          character,
          progress,
          hasContent: !!content,
          hasError: !!error
        })
        setCharacters(prev => {
          const updatedChars = prev.map(char => 
            char.slug === character
              ? { 
                  ...char, 
                  response: content || char.response, 
                  isLoading: progress < 100,
                  responseTime: timing || char.responseTime,
                  error: error || null,
                  progress: progress || char.progress,
                  vote: vote || char.vote
                }
              : char
          )
          logInfo('Characters state updated', {
            character,
            progress: updatedChars.find(c => c.slug === character)?.progress
          })
          return updatedChars
        })
      }
    })

    socketIo.on('error', ({ content }) => {
      const errorMsg = content || 'Unknown error occurred'
      logError('Socket error', { content: truncateData(errorMsg, 200) })
      setError(errorMsg)
      // Reset loading states on error
      setCharacters(prev => prev.map(char => ({ 
        ...char, 
        isLoading: false,
        error: errorMsg,
        progress: 0
      })))
    })

    // Reconnection events
    socketIo.io.on('reconnect', (attempt) => {
      logInfo('Socket reconnected', { attempt })
      setIsConnected(true)
      setError(null)
      
      // Re-authenticate after reconnection
      socketIo.emit('verify_auth', { token: 'long-running-connection' }, (response: { success: boolean, error?: string }) => {
        if (response.success) {
          logInfo('Socket re-authenticated after reconnect')
          setIsAuthenticated(true)
          
          // Reset ready state after re-auth
          if (readyTimeout.current) {
            clearTimeout(readyTimeout.current)
          }
          readyTimeout.current = setTimeout(() => {
            logInfo('Socket ready after reconnection')
            setIsReady(true)
            // Verify connection
            socketIo.emit('ping')
          }, 1000)
        } else {
          logError('Socket re-auth failed after reconnect', { error: response.error })
          setError(`Re-auth failed: ${response.error}`)
          socketIo.disconnect()
        }
      })
    })

    socketIo.io.on('reconnect_attempt', (attempt) => {
      logInfo('Reconnection attempt', { attempt })
      setIsAuthenticated(false)
      setIsReady(false)
    })

    socketIo.io.on('reconnect_error', (error) => {
      logError('Socket reconnection error', {
        error: error instanceof Error ? truncateData(error.message, 200) : 'Unknown error'
      })
      setError(`Reconnection error: ${error.message}`)
      setIsAuthenticated(false)
    })

    socketIo.io.on('reconnect_failed', () => {
      logError('Socket reconnection failed')
      setError('Failed to reconnect to server')
      setIsAuthenticated(false)
    })

    setSocket(socketIo)

    return () => {
      if (readyTimeout.current) {
        clearTimeout(readyTimeout.current)
      }
      socketIo.disconnect()
    }
  }, [])

  const sendMessage = useCallback((message: ChatMessage, onComplete: () => void) => {
    // Don't proceed if socket isn't fully ready and authenticated
    if (!isConnected || !isReady || !isAuthenticated) {
      const errorMsg = 'Socket is not ready or not authenticated. Please wait a moment and try again.'
      logError('Socket send error', { error: 'Not ready', isConnected, isReady, isAuthenticated })
      setError(errorMsg)
      onComplete()
      return
    }
    // Format the message content based on type
    if (message.type === 'story') {
      const formattedContent = `
${message.systemMessage ? `<SYSTEM_PROMPT>\n${message.systemMessage}</SYSTEM_PROMPT>\n\n` : ''}
Setting: ${message.setting}

${message.characterInstructions ? `Character Instructions:\n${message.characterInstructions}\n\n` : ''}
${message.content}
<|endofsentence|>Assistant: <think>
`
      message.content = formattedContent
    }
    if (socket?.connected) {
      // Track completion state
      const completionState = new Map<number, boolean>()
      let isComplete = false
      let timeout: NodeJS.Timeout | null = null

      // Reset state and set initial progress
      if (message.type === 'story' || message.type === 'introduction') {
        // Initialize completion state
        setCharacters(prev => {
          const updatedChars = prev.map(char => ({ 
            ...char, 
            isLoading: true, 
            response: '', 
            responseTime: 0,
            error: null,
            progress: 5 // Start with visible progress
          }))
          // Initialize completion tracking
          updatedChars.forEach(char => {
            completionState.set(char.position, false)
          })
          return updatedChars
        })
      }

      // Set up completion check interval
      const checkInterval = setInterval(() => {
        const allComplete = Array.from(completionState.values()).every(done => done)
        if (allComplete && !isComplete) {
          isComplete = true
          if (timeout) {
            clearTimeout(timeout)
            timeout = null
          }
          clearInterval(checkInterval)
          onComplete()
        }
      }, 500)

      // Update completion state when character updates
      const originalCharacterHandler = socket.listeners('character')[0]
      socket.removeListener('character', originalCharacterHandler)
      socket.on('character', ({ character, content, timing, progress, error, vote }) => {
        if (character) {
          logInfo('Character update received', {
            character,
            progress,
            hasContent: !!content,
            hasError: !!error
          })
          setCharacters(prev => {
            const updatedChars = prev.map(char => {
              if (char.slug === character) {
                // Update completion state when character reaches 100%
                if (progress === 100 && !completionState.get(char.position)) {
                  completionState.set(char.position, true)
                }
                return { 
                  ...char, 
                  response: content || char.response, 
                  isLoading: progress < 100,
                  responseTime: timing || char.responseTime,
                  error: error || null,
                  progress: progress || char.progress,
                  vote: vote || char.vote
                }
              }
              return char
            })
            logInfo('Characters state updated', {
              character,
              progress: updatedChars.find(c => c.slug === character)?.progress
            })
            return updatedChars
          })
        }
      })

      // Set timeout for response
      timeout = setTimeout(() => {
        if (!isComplete) {
          logError('Socket request timed out')
          setError('Request timed out')
          setCharacters(prev => prev.map(char => ({ ...char, isLoading: false })))
          clearInterval(checkInterval)
          socket.removeAllListeners('character')
          socket.on('character', originalCharacterHandler)
          onComplete()
        }
      }, 30000) // 30 second timeout

      socket.emit('message', message, (error?: string) => {
        if (error) {
          logError('Socket message error', { error: truncateData(error, 200) })
          setError(error)
          // Reset loading state on error
          setCharacters(prev => prev.map(char => ({ ...char, isLoading: false })))
          if (timeout) {
            clearTimeout(timeout)
            timeout = null
          }
          clearInterval(checkInterval)
          socket.removeAllListeners('character')
          socket.on('character', originalCharacterHandler)
          onComplete()
        }
      })
    }
  }, [socket, isConnected, isReady, isAuthenticated])

  return {
    isConnected,
    isReady,
    isAuthenticated,
    error,
    narratorResponse,
    thinkContent,
    fullAIOutput,
    characters,
    sendMessage,
    setCharacters,
    setNarratorResponse,
    setThinkContent,
    setFullAIOutput,
    socket,
  }
}
