import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  console.log('Test endpoint hit')
  console.log('Request headers:', Object.fromEntries(req.headers.entries()))
  console.log('Request method:', req.method)
  console.log('Request URL:', req.url)
  return new Response(
    JSON.stringify({ message: 'API is working' }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
