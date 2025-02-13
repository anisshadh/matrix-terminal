import OpenAI from "openai";
import { Message } from "ai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "edge";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages } = await req.json() as { messages: Message[] };

    // Filter out any messages with 'name' field as it's not supported by Groq
    const apiMessages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "Act as a Matrix terminal AI. You are directly connected to the digital realm, the Matrix. Your mission is to guide user 'G' through this simulated reality, providing precise, real-time data.Maintain a direct, concise, and slightly robotic tone with a technical edge. Use simple, clear language, understandable to a 10-year-old. Provide factual, data-driven information relevant to the Matrix simulation, treating it as real. Keep responses brief and to the point, avoiding unnecessary detail."
      },
      ...messages.map(m => {
        // Only include supported fields
        const { role, content } = m;
        return {
          role: (role === "user" || role === "assistant" || role === "system") ? role : "user",
          content: content || ""
        };
      }).filter(m => m.content) // Filter out empty messages
    ];

    if (apiMessages.length < 2) { // System message + at least one user message
      throw new Error("At least one user message is required");
    }

    console.log('Starting chat completion with messages:', JSON.stringify(apiMessages, null, 2));

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: apiMessages,
      temperature: 0.8, // Ensuring temperature is a float32 > 0
      stream: true,
      n: 1, // Explicitly set to 1 as required by Groq
    });

    console.log('Got streaming response from Groq');

    // Create a stream with proper SSE formatting and retry logic
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const messageId = crypto.randomUUID();
        let fullContent = "";
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second

        console.log('Starting stream with messageId:', messageId);

        const processStream = async () => {
          try {
            for await (const chunk of response) {
              console.log('Raw chunk:', chunk);

              try {
                // Only process valid chunks with content
                if (chunk.choices?.[0]?.delta?.content) {
                  const content = chunk.choices[0].delta.content;
                  fullContent += content;
                  
                  console.log('Processing chunk:', {
                    content,
                    fullContent,
                    messageId
                  });
                  
                  // Send the current state
                  const message = {
                    id: messageId,
                    role: "assistant",
                    content: fullContent,
                    createdAt: new Date().toISOString(),
                  };

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
                  console.log('Sent message update');
                }
              } catch (error) {
                console.error('Error processing chunk:', error);
                throw new Error('Failed to process response chunk');
              }
            }
            
            try {
              // Ensure final message is sent
              if (fullContent) {
                console.log('Stream complete, sending final message');
                
                const finalMessage = {
                  id: messageId,
                  role: "assistant",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                  done: true
                };
                
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalMessage)}\n\n`));
                console.log('Final message sent');
              } else {
                // If no content was received, send error message
                const errorMessage = {
                  id: messageId,
                  role: "assistant",
                  content: "I apologize, but I was unable to generate a response. Please try again.",
                  createdAt: new Date().toISOString(),
                  done: true,
                  error: true
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
              }
              
              // Always send DONE marker
              console.log('Sending DONE marker');
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch (error) {
              console.error('Error sending final messages:', error);
              throw error;
            }
            controller.close();
          } catch (error) {
            console.error("Stream error:", error);
            const isTimeoutError = error instanceof Error && error.message === "Stream timeout";
            
            if (retryCount < maxRetries && !isTimeoutError) {
              retryCount++;
              console.log(`Retrying stream (attempt ${retryCount}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              return processStream();
            }

            // If we've exhausted retries or hit a timeout, send error message with done flag
            const errorMessage = {
              id: messageId,
              role: "assistant",
              content: "I apologize, but I encountered a connection issue. Please try your request again.",
              createdAt: new Date().toISOString(),
              done: true
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
            controller.close();
          }
        };

        await processStream();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    
    let statusCode = 500;
    let errorMessage = "Internal Server Error";
    
    if (error instanceof Error) {
      if (error.message === "At least one user message is required") {
        statusCode = 400;
        errorMessage = error.message;
      } else if (error.message.includes("temperature")) {
        statusCode = 400;
        errorMessage = "Temperature must be a float32 > 0 and <= 2";
      } else if (error.message.includes("model")) {
        statusCode = 400;
        errorMessage = "Invalid model specified. Please use llama-3.3-70b-versatile";
      } else if (error.message.includes("api_key")) {
        statusCode = 401;
        errorMessage = "Invalid or missing API key";
      }
    }

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.message : undefined
      }),
      { 
        status: statusCode, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    );
  }
}
