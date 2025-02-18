import { makeVeniceRequest, processVeniceStream } from '@/lib/venice'
import { VeniceMessage, NextApiResponseWithSocket, SocketWithIO } from '@/lib/types'
import { NextApiRequest } from 'next'
import { logInfo, logError } from '@/lib/server/logger'
import { truncateData } from '@/lib/logger'

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
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

interface RequestWithSocket extends NextApiRequest {
  socket: SocketWithIO
}

export default async function handler(req: RequestWithSocket, res: NextApiResponseWithSocket) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const startTime = Date.now()
  try {
      logInfo('Chat request received', { 
        type: req.body?.type,
        socketId: req.body?.socketId,
        body: JSON.stringify(req.body)
      })

      if (!req.body) {
        logError('No request body received')
        return res.status(400).json({ error: 'No request body received' })
      }

    // Check if VENICE_API_KEY is set
    if (!process.env.VENICE_API_KEY) {
      console.error('VENICE_API_KEY is not set')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const message = req.body as ChatMessage
    if (!message || !message.type) {
      return res.status(400).json({ error: 'Invalid request body' })
    }

    if (message.type === 'introduction') {
      // Handle character introductions
      const characters = [
        { slug: 'our-strange-loop', name: 'Strange Loop' },
        { slug: 'new-claude', name: 'Claude' },
        { slug: 'catherine', name: 'Catherine' },
      ]

      const characterResponses: Record<string, string> = {}
      const characterTimes: Record<string, number> = {}

      logInfo('Starting character introductions')
      
      // Process all characters in parallel
      const characterPromises = characters.map(async character => {
        const charStartTime = Date.now()
        
      // Function to emit character progress
      const emitProgress = (progress: number, content?: string, error?: string) => {
        const io = req.socket.server.io
        if (io) {
          logInfo('Emitting progress', {
            character: character.slug,
            progress,
            hasContent: !!content,
            hasError: !!error,
            socketId: message.socketId
          })

          // Broadcast progress to all sockets
          io.emit('character', {
            character: character.slug,
            content,
            timing: Date.now() - charStartTime,
            progress,
            error
          })
        }
      }
        
        try {
          let retryCount = 0
          const MAX_RETRIES = 2
          let response = null
          let finalContent = ''
          
          while (retryCount <= MAX_RETRIES) {
            try {
              // Emit initial progress
              emitProgress(5, 'Initializing connection...')
              await new Promise(resolve => setTimeout(resolve, 200))
              
              const characterMessages: VeniceMessage[] = [
                {
                  role: 'user' as const,
                  content: 'Introduce yourself'
                }
              ]

              // Emit preparation progress
              emitProgress(15, 'Preparing request...')
              await new Promise(resolve => setTimeout(resolve, 200))

              response = await makeVeniceRequest(characterMessages, character.slug)
              const apiResponseTime = Date.now()
              
              // Emit API connection progress
              emitProgress(30, 'Connecting to API...')
              await new Promise(resolve => setTimeout(resolve, 200))

              if (!response.ok) {
                throw new Error(`Venice API returned ${response.status}: ${response.statusText}`)
              }

              // If we get here, the request was successful
              break
            } catch (error) {
              retryCount++
              if (retryCount <= MAX_RETRIES) {
                logError(`Retrying character request (attempt ${retryCount})`, {
                  character: character.slug,
                  error: error instanceof Error ? error.message : 'Unknown error'
                })
                emitProgress(5, `Retrying request (attempt ${retryCount})...`)
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)) // Exponential backoff
                continue
              }
              throw error // If we've exhausted retries, rethrow the error
            }
          }

          if (!response || !response.ok) {
            throw new Error('Failed to get valid response from Venice API')
          }

          try {
            let chunkCount = 0
            let lastProgressUpdate = 30
            let lastChunkTime = Date.now()
            
            let lastEmitTime = Date.now()
            const MIN_EMIT_INTERVAL = 100 // Minimum time between emits in ms
            
            for await (const { content, totalContent, progress } of processVeniceStream(response)) {
              const now = Date.now()
              const timeSinceLastEmit = now - lastEmitTime
              
              // Update final content with latest total
              finalContent = totalContent
              
              // Only emit if enough time has passed or it's the first/last chunk
              if (timeSinceLastEmit >= MIN_EMIT_INTERVAL || progress === 100 || progress === 30) {
                lastEmitTime = now
                emitProgress(Math.floor(progress), totalContent)
                
                // Small delay after each emit to prevent overwhelming the socket
                if (progress < 100) {
                  await new Promise(resolve => setTimeout(resolve, 20))
                }
              }
            }
          } catch (error) {
            logError('Error processing character stream', {
              character: character.slug,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
            throw error
          }
          
          const streamEndTime = Date.now()

          // Emit final state with a small delay
          await new Promise(resolve => setTimeout(resolve, 100))
          emitProgress(100, finalContent)
          const totalTime = streamEndTime - charStartTime

          return {
            slug: character.slug,
            response: finalContent,
            time: totalTime
          }
        } catch (error) {
          const errorTime = Date.now()
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
          
          logError(`Error getting response for character ${character.slug}`, {
            error: errorMessage,
            timeToError: errorTime - charStartTime
          })

          // Emit error state with more detailed message
          emitProgress(100, '', `Error: ${errorMessage}. The system will automatically retry.`)

          // Return error state instead of throwing
          return {
            slug: character.slug,
            response: '',
            time: errorTime - charStartTime,
            error: errorMessage
          }
        }
      })

      // Wait for all character responses
      const results = await Promise.all(characterPromises)

      // Store results
      results.forEach(result => {
        characterResponses[result.slug] = result.response
        characterTimes[result.slug] = result.time
      })

      const endTime = Date.now()
      logInfo('Characters processed', {
        totalTime: endTime - startTime,
        responses: Object.entries(characterResponses).reduce((acc, [slug, response]) => ({
          ...acc,
          [slug]: truncateData(response, 100)
        }), {})
      })

      return res.status(200).json({ 
        characters: characterResponses,
        timing: {
          total: endTime - startTime,
          characters: characterTimes
        }
      })
    } else if (message.type === 'story') {
      // Handle narrator story generation
      const narratorStartTime = Date.now()

      // Construct narrator message
      const narratorMessages: VeniceMessage[] = [
        {
          role: 'system' as const,
          content: message.systemMessage || ''
        },
        {
          role: 'user' as const,
          content: message.content || ''
        }
      ]

      // Get narrator response
      const narratorResponse = await makeVeniceRequest(narratorMessages, 'narrator')
      if (!narratorResponse.ok) {
        throw new Error(`Venice API returned ${narratorResponse.status}: ${narratorResponse.statusText}`)
      }

      let narratorText = ''
      for await (const { content, totalContent } of processVeniceStream(narratorResponse)) {
        narratorText = totalContent
      }

      const narratorEndTime = Date.now()
      const narratorTime = narratorEndTime - narratorStartTime

      return res.status(200).json({
        characters: {
          narrator: narratorText
        },
        timing: {
          total: narratorEndTime - startTime,
          characters: {
            narrator: narratorTime
          }
        }
      })
    }

    return res.status(400).json({ error: 'Invalid message type' })
  } catch (error) {
    const errorTime = Date.now()
    logError('API error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timeToError: errorTime - startTime
    })
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
