"use client"

import { useState } from "react"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronRight, Settings } from "lucide-react"

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
  const [mainAIOutput, setMainAIOutput] = useState<TextAreaState>({ content: "", height: "150px" })
  const [debugOutput, setDebugOutput] = useState<TextAreaState>({ content: "", height: "150px" })

  // Track open/closed state of collapsibles
  const [isCharacterInstructionsOpen, setIsCharacterInstructionsOpen] = useState(false)
  const [isPrimaryAIMessageOpen, setIsPrimaryAIMessageOpen] = useState(false)
  const [isMainAIOutputOpen, setIsMainAIOutputOpen] = useState(false)
  const [isDebugOutputOpen, setIsDebugOutputOpen] = useState(false)

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
                  value={mainAIOutput.content}
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
          {[1, 2, 3].map((num) => (
            <Card key={num}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-12 h-12">
                    <img
                      src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/defaultCharacterIcon-UfynZibO5HU8Indgh11rujIur6rQNl.png"
                      alt={`Character ${num}`}
                      className="object-cover"
                    />
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">Character {num}</h3>
                    <Textarea
                      placeholder="AI prompt Output, their thoughts on the last story generation segment and vote on what to do next."
                      className="min-h-[100px]"
                    />
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
              <Textarea
                className="min-h-[200px] mb-4"
                defaultValue={`I am the observer and story teller. Together we will weave a story of imagination. Tell me, where and perhaps how should our story begin?

Examples:
A tropical island.
A spaceship heading to mars.
A cafe in Paris.
A squid games arena fighting for our lives.`}
              />

              <Textarea
                className="min-h-[100px]"
                placeholder="User input box to send if they want to add additional context or direction above how the characters choose to proceed."
              />

              <div className="flex justify-end mt-4">
                <Button className="bg-neutral-900 text-white">Continue</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

