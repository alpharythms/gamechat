"use client"

import { useState, useEffect } from "react"
import { useCharacterChat } from "@/lib/hooks/useCharacterChat"
import { useAutoScroll } from "@/lib/hooks/useAutoScroll"
import { Character } from "@/lib/types"
import { ChatMessage } from "@/lib/hooks/useWebSocket"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronRight, Settings } from "lucide-react"
import { logInfo } from "@/lib/logger"

interface TextAreaState {
  content: string
  height: string
}

export default function AICharacterChat() {
  const [showDebug, setShowDebug] = useState(false)
  const [characterInstructions, setCharacterInstructions] = useState<TextAreaState>({
    content:
      "You are a journey with 2 other characters. Each user input will contain what has happened so far, and two choices for how to proceed. Please comment with 50-150 words on the situation and your vote on which choice to take.",
    height: "150px",
  })
  const [primaryAIMessage, setPrimaryAIMessage] = useState<TextAreaState>({
    content:
      "You are the observer an expert narrator and storyteller. The user will identify a setting and 3 AI driven characters that will take part in our story. Using that seed craft an elaborate narrative that incorporates all 3 characters and present a choice with two options to the user / 3 characters.",
    height: "150px",
  })
  const {
    error,
    narratorResponse,
    characters,
    status,
    statusMessage,
    getIntroductions,
    setNarratorResponse,
    completedResponses,
    fullAIOutput,
    mode,
    setMode,
    sendToNarrator,
    isInitialized,
  } = useCharacterChat()

  const [userInput, setUserInput] = useState('')
  const [mainAIOutput, setMainAIOutput] = useState<TextAreaState>({ content: "", height: "150px" })
  const [debugOutput, setDebugOutput] = useState<TextAreaState>({ content: "", height: "150px" })

  // Track open/closed state of collapsibles
  const [isCharacterInstructionsOpen, setIsCharacterInstructionsOpen] = useState(false)
  const [isPrimaryAIMessageOpen, setIsPrimaryAIMessageOpen] = useState(false)
  const [isMainAIOutputOpen, setIsMainAIOutputOpen] = useState(false)
  const [isDebugOutputOpen, setIsDebugOutputOpen] = useState(false)

  // Auto-scroll refs
  const narratorRef = useAutoScroll<HTMLDivElement>([narratorResponse])
  const characterRefs = characters.map(char => useAutoScroll<HTMLDivElement>([char.response]))

  // Update debug output when errors change
  useEffect(() => {
    setDebugOutput(prev => ({
      ...prev,
      content: error ? `Error: ${error}` : ''
    }))
  }, [error])

  // Update main AI output when narrator responds
  useEffect(() => {
    setMainAIOutput(prev => ({
      ...prev,
      content: narratorResponse
    }))
  }, [narratorResponse])


  const handleTextAreaResize = (
    element: HTMLTextAreaElement,
    setter: (state: TextAreaState) => void,
    content: string,
  ) => {
    setter({
      content,
      height: `${element.scrollHeight}px`,
    })
  }

  const handleMainAction = async () => {
    if (mode === 'intro') {
      await getIntroductions()
    } else {
      // Story mode - send to narrator
      if (userInput.trim()) {
        const defaultPrompt = `I am the observer and story teller. Together we will weave a story of imagination. Tell me, where and perhaps how should our story begin?

Examples:
A tropical island.
A spaceship heading to mars.
A cafe in Paris.
A squid games arena fighting for our lives.`

        // Format character introductions
        const characterIntros = characters
          .map(char => `${char.name}:\n${char.response}`)
          .join('\n\n')

        // Build complete context
        const fullContext = `${defaultPrompt}\n\n${userInput}\n\n${characterIntros}`
        
        // Send to narrator with system message
        await sendToNarrator(fullContext, primaryAIMessage.content)
        setUserInput('') // Clear input after sending
      }
    }
  }

  // Update mode when initialization is complete
  useEffect(() => {
    if (mode === 'intro' && isInitialized && !status.includes('loading')) {
      logInfo('Transitioning to story mode', {
        mode,
        isInitialized,
        status,
        completedResponses
      })
      // All characters have truly initialized
      setMode('story')
    }
  }, [mode, isInitialized, status, setMode, completedResponses])

  return (
    <div className="container mx-auto p-4 max-w-7xl relative">
      <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={() => setShowDebug(!showDebug)}>
        <Settings className="h-6 w-6" />
      </Button>

      {showDebug && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-4">
            <h2 className="text-lg font-semibold">Debug and Settings</h2>

            <Collapsible open={isMainAIOutputOpen} onOpenChange={setIsMainAIOutputOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 font-semibold">
                {isMainAIOutputOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Main AI Full - Output
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Textarea
                  className="mt-2"
                  placeholder="This is a debugging tool, to look at the full output of the main AI..."
                  value={fullAIOutput}
                  style={{ height: mainAIOutput.height }}
                  onChange={(e) => handleTextAreaResize(e.target, setMainAIOutput, e.target.value)}
                />
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={isDebugOutputOpen} onOpenChange={setIsDebugOutputOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 font-semibold">
                {isDebugOutputOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Debug Output
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Textarea
                  className="mt-2"
                  placeholder="Output for debug message to help a user..."
                  value={debugOutput.content}
                  style={{ height: debugOutput.height }}
                  onChange={(e) => handleTextAreaResize(e.target, setDebugOutput, e.target.value)}
                />
              </CollapsibleContent>
            </Collapsible>

            <div>
              <label className="block text-sm font-medium mb-1">Primary Model Selector</label>
              <Select defaultValue="deepseek">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="defaults to DeepSeek R1" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek R1</SelectItem>
                  <SelectItem value="gpt4">GPT-4</SelectItem>
                  <SelectItem value="claude">Claude 2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Image Generation Model</label>
              <Select defaultValue="stable">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="defaults StableDiffusion 3.5" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">StableDiffusion 3.5</SelectItem>
                  <SelectItem value="dalle">DALL-E 3</SelectItem>
                  <SelectItem value="midjourney">Midjourney v5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
        {/* Left Column - Character Cards */}
        <div className="space-y-4">
          {/* Character Instructions */}
          <Collapsible open={isCharacterInstructionsOpen} onOpenChange={setIsCharacterInstructionsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 font-semibold">
              {isCharacterInstructionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Character Instructions
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea
                className="mt-2"
                placeholder="Editable Box with default..."
                value={characterInstructions.content}
                style={{ height: characterInstructions.height }}
                onChange={(e) => handleTextAreaResize(e.target, setCharacterInstructions, e.target.value)}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Character Cards */}
          {characters.map((character: Character, index) => (
            <Card key={character.slug}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3 group">
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      <img
                        src={character.imageUrl}
                        alt={character.name}
                        className="object-cover"
                        onError={(e) => {
                          // Fallback to default image on error
                          e.currentTarget.src = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/defaultCharacterIcon-UfynZibO5HU8Indgh11rujIur6rQNl.png"
                        }}
                      />
                    </Avatar>
                    {character.description && (
                      <div className="absolute left-0 w-48 p-2 text-xs bg-white border rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 -bottom-20 z-10">
                        {character.description}
                      </div>
                    )}
                  </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2">{character.name}</h3>
                      <div className="space-y-2" ref={characterRefs[index]}>
                        <Textarea
                          value={character.response}
                          readOnly
                          placeholder={character.isLoading ? "Thinking..." : "AI prompt Output, their thoughts on the last story generation segment and vote on what to do next."}
                          className={`min-h-[100px] overflow-y-auto ${character.isLoading ? 'opacity-50' : ''} ${character.error ? 'border-red-500' : ''}`}
                        />
                        <div className="space-y-1">
                          {character.isLoading && (
                            <div className="w-full bg-neutral-200 rounded-full h-2">
                              <div 
                                className="bg-neutral-900 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${character.progress}%` }}
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm text-neutral-500">
                            {character.isLoading ? (
                              <div className="flex items-center gap-2">
                                <span>
                                  {character.progress <= 10 ? 'Initializing...' :
                                   character.progress <= 20 ? 'Preparing request...' :
                                   character.progress <= 40 ? 'Contacting API...' :
                                   character.progress < 100 ? `Generating response... ${character.progress}%` :
                                   'Finalizing...'}
                                </span>
                              </div>
                            ) : character.error ? (
                              <span className="text-red-500">{character.error}</span>
                            ) : character.responseTime > 0 ? (
                              <span>Response time: {(character.responseTime / 1000).toFixed(1)}s</span>
                            ) : null}
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right Column - Main Content */}
        <div className="space-y-4">
          {/* Primary AI System Message */}
          <Collapsible open={isPrimaryAIMessageOpen} onOpenChange={setIsPrimaryAIMessageOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 font-semibold">
              {isPrimaryAIMessageOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Primary AI - System Message
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea
                className="mt-2"
                placeholder="Editable Box with default..."
                value={primaryAIMessage.content}
                style={{ height: primaryAIMessage.height }}
                onChange={(e) => handleTextAreaResize(e.target, setPrimaryAIMessage, e.target.value)}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Main Context */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">The narration - Main Context</h3>
              <div className="space-y-2 mb-4" ref={narratorRef}>
                <Textarea
                  className="min-h-[200px] overflow-y-auto"
                  value={narratorResponse || `I am the observer and story teller. Together we will weave a story of imagination. Tell me, where and perhaps how should our story begin?

Examples:
A tropical island.
A spaceship heading to mars.
A cafe in Paris.
A squid games arena fighting for our lives.`}
                  readOnly
                  disabled={status === 'loading'}
                />
                {status === 'loading' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-900"></div>
                        <span className="ml-2 text-sm text-neutral-600">{statusMessage}</span>
                      </div>
                      <span className="text-sm text-neutral-500">{completedResponses}/3 responses</span>
                    </div>
                    <div className="text-xs text-neutral-500 space-y-1">
                      {characters.map(char => (
                        <div key={char.slug} className="flex justify-between items-center">
                          <span className="flex items-center gap-2">
                            {char.name}
                            {char.isLoading && (
                              <div className="w-20 h-1 bg-neutral-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-neutral-900 transition-all duration-300"
                                  style={{ width: `${char.progress}%` }}
                                />
                              </div>
                            )}
                          </span>
                          <span>
                            {char.isLoading ? (
                              char.progress < 100 ? 
                                `${char.progress.toFixed(1)}%` :
                                `${(char.responseTime / 1000).toFixed(1)}s...`
                            ) : char.responseTime > 0 ? (
                              `Done in ${(char.responseTime / 1000).toFixed(1)}s`
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Textarea
                  className="min-h-[100px]"
                  placeholder={mode === 'intro' 
                    ? "Enter a setting to begin your story..." 
                    : "Enter your response to continue the story..."}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  disabled={status === 'loading'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (userInput.trim()) {
                        handleMainAction()
                      }
                    }
                  }}
                />
                <p className="text-sm text-neutral-500">Press Enter to submit, Shift+Enter for new line</p>
              </div>

              <div className="flex justify-end mt-4">
                <Button 
                  className="bg-neutral-900 text-white"
                  onClick={handleMainAction}
                  disabled={status === 'loading' || !userInput.trim()}
                >
                  {status === 'loading' 
                    ? statusMessage || 'Loading...' 
                    : mode === 'intro' 
                      ? completedResponses === 3 
                        ? 'Continue' 
                        : 'Start'
                      : 'Continue'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
