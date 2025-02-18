import { Server as NetServer, Socket } from 'net'
import { NextApiResponse } from 'next'
import { Server as SocketIOServer } from 'socket.io'

export interface VeniceMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface VeniceRequest {
  model: string
  messages: VeniceMessage[]
  temperature?: number
  stop?: string[]
  stream?: boolean
  venice_parameters?: {
    character_slug?: string
  }
}

export interface VeniceCharacter {
  id: string
  name: string
  slug: string
  webEnabled: boolean
  createdAt: string
  updatedAt: string
  tags: string[]
  stats: {
    imports: number
  }
  description: string
  modelId: string
  adult: boolean
  ownerId: string
  shareUrl: string
}

export interface CharacterConfig {
  position: number  // 1, 2, 3 etc.
  slug: string
  name: string
  imageUrl: string
  description: string
}

export interface Character {
  id: string
  slug: string
  name: string
  response: string
  isLoading: boolean
  responseTime: number
  error: string | null
  progress: number
  imageUrl: string
  description: string
  position: number
  vote?: {
    choice: string
    reasoning: string
    timestamp: number
  }
}

export interface VoteResult {
  winningChoice: string
  votes: {
    [characterSlug: string]: {
      choice: string
      reasoning: string
      timestamp: number
    }
  }
}

export interface SocketServer extends NetServer {
  io?: SocketIOServer
}

export interface SocketWithIO extends Socket {
  server: SocketServer
}

export interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO
}
