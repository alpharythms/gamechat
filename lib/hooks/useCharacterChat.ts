import { useState, useCallback, useEffect, useRef } from 'react'
import { useWebSocket, ChatMessage } from './useWebSocket'
import { VoteResult } from '../types'
import { logInfo, logError } from '../logger'

export function useCharacterChat() {
  // Track story mode vs intro mode
  const [mode, setMode] = useState<'intro' | 'story'>('intro')

  // State for loading and status
  const {
    error,
    narratorResponse,
    characters,
    isConnected,
    isReady,
    isAuthenticated,
    sendMessage,
    setNarratorResponse,
    setCharacters,
    fullAIOutput,
    setFullAIOutput,
    socket,
  } = useWebSocket()

  const [status, setStatus] = useState<'idle' | 'loading' | 'timeout' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [completedResponses, setCompletedResponses] = useState(0)
  const isLoadingRef = useRef(false)

  // Track states
  const [isComplete, setIsComplete] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Helper to clear all timers
  const clearAllTimers = useCallback(() => {
    if (responseTracker.current.interval) {
      clearInterval(responseTracker.current.interval)
      responseTracker.current.interval = undefined
    }
    if (responseTracker.current.timeout) {
      clearTimeout(responseTracker.current.timeout)
      responseTracker.current.timeout = undefined
    }
  }, [])

  // Reset all states
  const resetStates = useCallback(() => {
    setIsComplete(false)
    setIsInitialized(false)
    clearAllTimers()
  }, [clearAllTimers])

  // Reset states when mode changes
  useEffect(() => {
    if (mode === 'intro') {
      resetStates()
    }
  }, [mode, resetStates])

  // Track completion state
  useEffect(() => {
    // Update completed responses count
    const completed = characters.filter(char => {
      const hasResponse = !!char.response && char.response.trim().length > 0
      const isFullyLoaded = !char.isLoading && char.progress === 100
      const hasNoError = !char.error
      return hasResponse && isFullyLoaded && hasNoError
    }).length
    setCompletedResponses(completed)

    // Check if all characters are truly complete
    const allComplete = characters.every(char => {
      const hasResponse = !!char.response && char.response.trim().length > 0
      const isFullyLoaded = !char.isLoading && char.progress === 100
      const hasNoError = !char.error
      return hasResponse && isFullyLoaded && hasNoError
    })

    if (allComplete && !isComplete) {
      logInfo('All characters truly completed', {
        characters: characters.map(char => ({
          slug: char.slug,
          response: !!char.response && char.response.trim().length > 0,
          isLoading: char.isLoading,
          progress: char.progress,
          error: char.error
        }))
      })
      clearAllTimers()
      setIsComplete(true)
      setIsInitialized(true)
    }
  }, [characters, isComplete, clearAllTimers])

  // Handle mode transition
  useEffect(() => {
    if (isComplete && isInitialized && mode === 'intro') {
      logInfo('Transitioning to story mode')
      setMode('story')
    }
  }, [isComplete, isInitialized, mode, setMode])

  // Update status message when responses complete
  useEffect(() => {
    if (status === 'loading') {
      if (mode === 'intro') {
        const totalCharacters = characters.length
        setStatusMessage(`Loading character introductions (${completedResponses}/${totalCharacters})...`)
      } else {
        setStatusMessage('Generating story...')
      }
    }
  }, [completedResponses, status, mode, characters.length])

  // Helper to extract think content from response
  const extractThinkContent = (text: string): { think: string, response: string } => {
    const thinkMatch = text.match(/<think>([^]*?)<\/think>/)
    if (thinkMatch) {
      return {
        think: thinkMatch[1].trim(),
        response: text.replace(/<think>[^]*?<\/think>/, '').trim()
      }
    }
    return { think: '', response: text.trim() }
  }

  const getIntroductions = useCallback(async () => {
    if (isLoadingRef.current) {
      logInfo('Already loading, skipping request')
      return
    }

    try {
      isLoadingRef.current = true
      setStatus('loading')
      setCompletedResponses(0)
      setNarratorResponse('')
      
      // Reset character states
      setCharacters(prev => prev.map(char => ({ 
        ...char, 
        response: '', 
        isLoading: true, 
        responseTime: 0,
        error: null,
        progress: 5 // Start with visible progress
      })))

      await new Promise<void>((resolve, reject) => {
        sendMessage({ 
          type: 'introduction',
          socketId: socket?.id 
        }, () => {
          resolve()
        })
      })

      setStatus('success')
      setStatusMessage('')
      isLoadingRef.current = false
    } catch (error) {
      console.error('Error:', error)
      isLoadingRef.current = false
      setStatus('error')
      setStatusMessage('Failed to get character introductions. Please try again.')
      
      // Reset character states on error
      setCharacters(prev => prev.map(char => ({ 
        ...char, 
        isLoading: false,
        error: 'Failed to get introduction'
      })))
    }
  }, [sendMessage, setNarratorResponse, setCharacters, socket, isAuthenticated])

  // Track initialization state
  const initialized = useRef(false)
  const initializationAttempts = useRef(0)
  const MAX_INIT_ATTEMPTS = 3
  const responseTracker = useRef<{interval?: NodeJS.Timeout, timeout?: NodeJS.Timeout}>({})

  // Handle initialization
  useEffect(() => {
    // Only proceed if socket is ready, authenticated, and we haven't initialized yet
    if (!initialized.current && isConnected && isReady && isAuthenticated && socket?.connected) {
      const initializeChat = async () => {
        logInfo('Starting initial character introductions', {
          attempt: initializationAttempts.current + 1,
          maxAttempts: MAX_INIT_ATTEMPTS
        })

        // Clear any existing timers
        if (responseTracker.current.interval) {
          clearInterval(responseTracker.current.interval)
        }
        if (responseTracker.current.timeout) {
          clearTimeout(responseTracker.current.timeout)
        }

        try {
          // Reset any existing state
          setCharacters(prev => prev.map(char => ({ 
            ...char, 
            isLoading: true, 
            response: '', 
            responseTime: 0,
            error: null,
            progress: 5 
          })))
          setStatus('loading')
          
          // Send introduction message
          logInfo('Sending introduction message')
          await new Promise<void>((resolve, reject) => {
          // Reset states before starting
          resetStates()

          // Set up response tracking before sending message
          responseTracker.current.interval = setInterval(() => {
            // Let the useEffect handle completion tracking
            // Just check if we're complete to resolve
            if (isComplete) {
              clearAllTimers()
              resolve()
            }
          }, 500)

            // Set timeout for response
            responseTracker.current.timeout = setTimeout(() => {
              if (responseTracker.current.interval) {
                clearInterval(responseTracker.current.interval)
              }
              reject(new Error('Introduction request timed out'))
            }, 30000)

            // Send the message after setting up tracking
            socket.emit('message', { 
              type: 'introduction',
              socketId: socket.id 
            }, (error?: string) => {
              if (error) {
                if (responseTracker.current.interval) {
                  clearInterval(responseTracker.current.interval)
                }
                if (responseTracker.current.timeout) {
                  clearTimeout(responseTracker.current.timeout)
                }
                reject(new Error(error))
              }
            })
          })

          logInfo('Introduction completed successfully')
          initialized.current = true
          setIsInitialized(true)
          setStatus('success')
          setStatusMessage('')
          initializationAttempts.current = 0

        } catch (error) {
          logError('Failed to initialize chat', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            attempt: initializationAttempts.current + 1
          })

          // Increment attempt counter
          initializationAttempts.current++

          if (initializationAttempts.current < MAX_INIT_ATTEMPTS) {
            // Reset initialization flag to allow retry
            initialized.current = false
            setStatus('error')
            setStatusMessage('Retrying initialization...')
            // Schedule retry
            setTimeout(initializeChat, 1000)
          } else {
            setStatus('error')
            setStatusMessage('Failed to start introductions. Please refresh the page.')
          }
          
          // Reset character states on error
          setCharacters(prev => prev.map(char => ({ 
            ...char, 
            isLoading: false,
            error: 'Failed to initialize'
          })))
        }
      }

      initializeChat()
    }

    return () => {
      // Clean up any remaining timers
      if (responseTracker.current.interval) {
        clearInterval(responseTracker.current.interval)
      }
      if (responseTracker.current.timeout) {
        clearTimeout(responseTracker.current.timeout)
      }
    }
  }, [isConnected, isReady, isAuthenticated, socket])

  // Function to send story to narrator
  const sendToNarrator = useCallback(async (content: string, systemMessage: string) => {
    if (isLoadingRef.current) {
      logInfo('Already loading, skipping request')
      return
    }

    try {
      isLoadingRef.current = true
      setStatus('loading')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'story',
          content,
          systemMessage,
        }),
      })

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }

      const result = await response.json()
      const narratorResponse = result.characters.narrator
      
      // Store full response in debug panel
      setFullAIOutput(narratorResponse)

      // Extract and set main response
      const { response: mainResponse } = extractThinkContent(narratorResponse)
      setNarratorResponse(mainResponse)

      setStatus('success')
      setStatusMessage('')
      isLoadingRef.current = false
    } catch (error) {
      console.error('Error:', error)
      isLoadingRef.current = false
      setStatus('error')
      setStatusMessage('Failed to get narrator response. Please try again.')
    }
  }, [setFullAIOutput, setNarratorResponse, isAuthenticated])

  return {
    error,
    narratorResponse,
    characters,
    status,
    statusMessage,
    getIntroductions,
    setNarratorResponse,
    completedResponses,
    fullAIOutput,
    sendMessage,
    setCharacters,
    mode,
    setMode,
    sendToNarrator,
    isInitialized,
  }
}
