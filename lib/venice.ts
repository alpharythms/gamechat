import { VeniceMessage, VeniceRequest } from './types'
import { logError, logInfo } from '@/lib/server/logger'

const VENICE_API_KEY = process.env.VENICE_API_KEY
const VENICE_TEXT_API_ENDPOINT = 'https://api.venice.ai/api/v1/chat/completions'

if (!VENICE_API_KEY) {
  throw new Error('VENICE_API_KEY is not set in environment variables')
}

export async function makeVeniceRequest(
  messages: VeniceMessage[],
  characterSlug?: string
): Promise<Response> {

  const data: VeniceRequest = characterSlug 
    ? {
        model: 'default',
        messages,
        venice_parameters: {
          character_slug: characterSlug,
        },
        stream: true
      }
    : {
        model: 'deepseek-r1-671b',
        messages,
        temperature: 0.6,
        stop: ['<|endofsentence|>'],
        stream: true
      }

  const startTime = Date.now()
  try {
    logInfo('Venice API request', {
      endpoint: VENICE_TEXT_API_ENDPOINT,
      character: characterSlug,
      messageCount: messages.length
    })
    
    const response = await fetch(VENICE_TEXT_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    logInfo('Venice API response', { 
      status: response.status, 
      character: characterSlug,
      time: Date.now() - startTime
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      logError('Venice API error', { 
        status: response.status, 
        error: errorText.substring(0, 200), // Truncate long error messages
        character: characterSlug,
        time: Date.now() - startTime
      })
      throw new Error(`Venice API error (${response.status}): ${errorText}`)
    }
    return response
  } catch (error) {
    logError('Venice API request failed', { 
      error: error instanceof Error ? error.message.substring(0, 200) : 'Unknown error',
      character: characterSlug,
      time: Date.now() - startTime
    })
    throw error
  }
}

interface StreamChunk {
  content: string
  timestamp: number
  sequence: number
}

interface StreamBuffer {
  chunks: StreamChunk[]
  lastSequence: number
  totalContent: string
}

export async function* processVeniceStream(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is null')
  }

  const decoder = new TextDecoder()
  let textBuffer = ''
  let sequence = 0
  const streamBuffer: StreamBuffer = {
    chunks: [],
    lastSequence: -1,
    totalContent: ''
  }

  const processChunk = (chunk: StreamChunk) => {
    // Only process chunks in sequence
    if (chunk.sequence !== streamBuffer.lastSequence + 1) {
      streamBuffer.chunks.push(chunk)
      return null
    }

    // Process this chunk and any subsequent chunks we have buffered
    let content = chunk.content
    streamBuffer.lastSequence = chunk.sequence
    streamBuffer.totalContent += content

    // Look for any buffered chunks that can now be processed
    streamBuffer.chunks.sort((a, b) => a.sequence - b.sequence)
    while (streamBuffer.chunks.length > 0 && 
           streamBuffer.chunks[0].sequence === streamBuffer.lastSequence + 1) {
      const nextChunk = streamBuffer.chunks.shift()!
      streamBuffer.lastSequence = nextChunk.sequence
      streamBuffer.totalContent += nextChunk.content
      content += nextChunk.content
    }

    return content
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      textBuffer += decoder.decode(value, { stream: true })
      const lines = textBuffer.split('\n')
      textBuffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.choices?.[0]?.delta?.content) {
              const chunk: StreamChunk = {
                content: data.choices[0].delta.content,
                timestamp: Date.now(),
                sequence: sequence++
              }
              
              const processedContent = processChunk(chunk)
              if (processedContent) {
                yield {
                  content: processedContent,
                  totalContent: streamBuffer.totalContent,
                  progress: Math.min(98, 30 + (sequence / (sequence + 10)) * 68)
                }
              }
            }
          } catch (e) {
            if (line.includes('[DONE]') || line.includes('"finish_reason":"stop"')) {
              // Process any remaining buffered chunks
              while (streamBuffer.chunks.length > 0) {
                streamBuffer.chunks.sort((a, b) => a.sequence - b.sequence)
                const chunk = streamBuffer.chunks.shift()!
                const processedContent = processChunk(chunk)
                if (processedContent) {
                  yield {
                    content: processedContent,
                    totalContent: streamBuffer.totalContent,
                    progress: 100
                  }
                }
              }
            } else if (!line.includes('usage')) {
              logError('Stream parse error', { 
                error: e instanceof Error ? e.message : 'Unknown error',
                sequence,
                bufferedChunks: streamBuffer.chunks.length
              })
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
