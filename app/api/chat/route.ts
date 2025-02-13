import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"

export const runtime = "edge"

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = streamText({
    model: openai("gpt-4-turbo"),
    messages,
    system:
      "You are an AI assistant in the Matrix Control Center. Respond in a style reminiscent of the Matrix movie, using tech jargon and cryptic references when appropriate.",
  })
  return result.toDataStreamResponse()
}

