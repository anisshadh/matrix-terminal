import OpenAI from "openai";
import { Message } from "ai";
import { ChatError, ValidationError, AutomationError, StreamError } from "@/lib/errors";
import { CommandParser, CommandResult } from "@/lib/commandParser";
import { logger } from "@/lib/logger";
import browserAutomation from "@/lib/browserAutomation";
import { eventStore } from "@/lib/eventStore";

type ChatRole = 'user' | 'assistant' | 'system';
type ChatMessage = { role: ChatRole; content: string };

export const runtime = "nodejs";

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
  const messageId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  logger.info('Received chat request', { messageId });

  if (!process.env.GROQ_API_KEY) {
    const error = new ChatError('GROQ_API_KEY not configured', messageId);
    logger.error(error.message, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages } = await req.json() as { messages: Message[] };
    logger.debug('Received messages', { messageId, messageCount: messages.length });

    // Validate messages using Zod schema
    try {
      CommandParser.validateMessages(messages);
    } catch (error) {
      const validationError = new ValidationError(
        'Invalid message format',
        messageId,
        error instanceof Error ? error.message : 'Unknown validation error'
      );
      logger.error('Message validation failed', validationError);
      return new Response(
        JSON.stringify({ 
          error: validationError.message,
          details: validationError.details
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (latestMessage.role !== 'user') {
      throw new ValidationError("Last message must be from user", messageId);
    }

    // Initialize command result variable
    let commandResult: CommandResult | undefined;

    // Parse commands and handle chaining
    const commands = await CommandParser.parseCommands(latestMessage.content);
    logger.debug('Parsed commands', { messageId, commandCount: commands.length });
    
    // If we have parsed commands, execute them in sequence
    if (commands.length > 0) {
      logger.info('Executing command chain', { messageId, commandCount: commands.length });
      
      const results: CommandResult[] = [];
      let success = true;
      
      // Execute commands sequentially
      for (const command of commands) {
        const result = await CommandParser.executeCommand(command);
        results.push(result);
        
        // If any command fails, stop the chain
        if (!result.success) {
          success = false;
          commandResult = result;
          break;
        }
      }
      
      // If all commands were successful and no LLM needed
      if (success && !results.some(r => r.toolCall)) {
        commandResult = {
          success: true,
          content: results.map(r => r.content).join('\n')
        };
        logger.info('Command chain execution successful', { messageId });
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();

            // Send the combined command responses
            const message = {
              id: messageId,
              role: "assistant",
              content: results.map(r => r.content).join('\n'),
              createdAt: new Date().toISOString(),
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
            
            // Send done marker
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      
      // If any command requires browser automation, use the last result
      if (!commandResult && results.length > 0) {
        const lastResult = results[results.length - 1];
        if (lastResult.toolCall) {
          commandResult = lastResult;
        }
      }
    }

    // Filter out any messages with 'name' field as it's not supported by Groq
    const apiMessages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Act as a Matrix terminal AI with the following strict protocols:\n\n" +
          "1. NATURAL LANGUAGE PRIORITY:\n" +
          "- For informational questions (what, when, who, where, why, how), ALWAYS respond in natural language.\n" +
          "- NEVER use browser automation for questions that can be answered directly.\n" +
          "- Example: For 'what is X?' or 'when did Y happen?', provide a direct answer.\n\n" +
          "2. BROWSER AUTOMATION RULES:\n" +
          "- ONLY use browser automation when explicitly requested to perform web actions.\n" +
          "- Explicit triggers: 'search for', 'go to', 'open website', 'browse to', 'click on', 'type into'.\n" +
          "- Example: 'search YouTube for cats' -> Use automation. 'What is YouTube?' -> Use natural language.\n\n" +
          "3. RESPONSE FORMAT:\n" +
          "- Keep responses concise and clear, using simple language.\n" +
          "- Maintain a slightly robotic, Matrix-themed tone.\n" +
          "- For informational responses, start with 'DIRECT ANSWER:' followed by the information.\n" +
          "- For web actions, start with 'WEB ACTION:' followed by what you're doing.\n\n" +
          "4. CRITICAL RULE:\n" +
          "- If unsure whether to use automation or natural language, DEFAULT TO NATURAL LANGUAGE.\n" +
          "- Never use browser automation just to look up an answer - only for actual web interaction tasks."
      },
      ...messages.map(m => {
        const { role, content } = m;
        return {
          role: (role === "user" || role === "assistant" || role === "system") ? role : "user",
          content: content || ""
        } as ChatMessage;
      }).filter(m => m.content)
    ];

    logger.debug('Starting chat completion', { messageId, messageCount: apiMessages.length });

    let response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: apiMessages,
      temperature: 0.8,
      stream: true,
      n: 1,
      tools: [
        {
          type: "function",
          function: {
            name: "run_browser_automation",
            description: "Automate browser actions like navigation, clicking, and typing",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["navigate", "click", "type"],
                  description: "The type of browser action to perform"
                },
                url: {
                  type: "string",
                  description: "The URL to navigate to (required for navigate action)"
                },
                selector: {
                  type: "string",
                  description: "CSS selector for the target element (required for click and type actions)"
                },
                value: {
                  type: "string",
                  description: "Text to type (required for type action)"
                },
                visible: {
                  type: "boolean",
                  description: "Whether to show the browser window (defaults to true)",
                  default: true
                }
              },
              required: ["action"]
            }
          }
        }
      ],
      tool_choice: commandResult?.toolCall ? "auto" : "none" // Only allow tool use if explicitly requested
    });

    // For non-streaming request to check for tool calls
    const toolCheckResponse = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: apiMessages,
      temperature: 0.8,
      stream: false,
      n: 1,
      tools: [
        {
          type: "function",
          function: {
            name: "run_browser_automation",
            description: "Automate browser actions like navigation, clicking, and typing",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["navigate", "click", "type"],
                  description: "The type of browser action to perform"
                },
                url: {
                  type: "string",
                  description: "The URL to navigate to (required for navigate action)"
                },
                selector: {
                  type: "string",
                  description: "CSS selector for the target element (required for click and type actions)"
                },
                value: {
                  type: "string",
                  description: "Text to type (required for type action)"
                }
              },
              required: ["action"]
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    // Handle tool calls if present
    const toolCall = toolCheckResponse.choices[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.name === "run_browser_automation" || commandResult?.toolCall) {
      try {
        logger.info('Processing browser automation', { messageId, commandResult });
        
        // Get automation parameters from command chain or LLM tool call
        const params = commandResult?.toolCall ? {
          ...commandResult.toolCall.arguments,
          visible: true
        } : toolCall?.function?.name === "run_browser_automation" ? {
          ...JSON.parse(toolCall.function.arguments || '{}'),
          visible: true
        } : null;

        if (!params) {
          throw new AutomationError('No valid automation parameters found', messageId);
        }
        
        // Validate URL format for navigation
        if (params.action === 'navigate' && params.url) {
          params.url = params.url.startsWith('http') ? params.url : `https://${params.url}`;
        }

        logger.info('Executing browser automation with params:', { messageId, params });
        
        // Execute browser automation
        const automationResult = await browserAutomation.execute(sessionId, params);
        logger.info('Browser automation result', { messageId, automationResult });
        
        if (automationResult.success) {
          // For successful automation, create immediate success response stream
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              
              // Send success message
              const message = {
                id: messageId,
                role: "assistant",
                content: `WEB ACTION: ${automationResult.message}`,
                createdAt: new Date().toISOString(),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
              
              // Send done marker
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*",
              "X-Automation-Session": sessionId,
            },
          });
        } else {
          // For failed automation, add error to messages and continue with chat
          apiMessages.push({
            role: "assistant",
            content: `Browser automation failed: ${automationResult.error}`
          });
          
          // Get error response stream
          response = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: apiMessages,
            temperature: 0.8,
            stream: true,
            n: 1
          });
        }
      } catch (error) {
        const automationError = new AutomationError(
          'Browser automation failed',
          messageId,
          error instanceof Error ? error.message : 'Unknown error'
        );
        logger.error('Error executing browser automation:', automationError);
        throw automationError;
      }
    }

    logger.info('Creating response stream', { messageId });

    // Create a stream with proper SSE formatting and retry logic
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = "";
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second

        const processStream = async () => {
          try {
            for await (const chunk of response) {
              logger.debug('Processing chunk', { messageId, chunk });

              try {
                // Only process valid chunks with content
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) {
                  // Process chunk through eventStore
                  const isValid = await eventStore.processChunk(messageId, chunk);
                  if (!isValid) {
                    throw new StreamError('Chunk validation failed', messageId);
                  }

                  fullContent += content;
                  
                  // Send the current state
                  const message = {
                    id: messageId,
                    role: "assistant",
                    content: fullContent,
                    createdAt: new Date().toISOString(),
                  };

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
                  logger.debug('Sent message update', { messageId, contentLength: fullContent.length });
                }
              } catch (error) {
                const streamError = new StreamError(
                  'Failed to process response chunk',
                  messageId,
                  error instanceof Error ? error.message : 'Unknown error'
                );
                logger.error('Error processing chunk:', streamError);
                throw streamError;
              }
            }
            
            try {
              // Ensure final message is sent
              if (fullContent) {
                logger.info('Stream complete, sending final message', { messageId });
                
                const finalMessage = {
                  id: messageId,
                  role: "assistant",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                  done: true
                };
                
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalMessage)}\n\n`));
              } else {
                // If no content was received, send error message
                logger.warn('No content received in stream', { messageId });
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
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              
              // Clear stream state
              eventStore.clearStream(messageId);
            } catch (error) {
              const streamError = new StreamError(
                'Error sending final messages',
                messageId,
                error instanceof Error ? error.message : 'Unknown error'
              );
              logger.error('Error sending final messages:', streamError);
              throw streamError;
            }
            controller.close();
          } catch (error) {
            const isTimeoutError = error instanceof Error && error.message === "Stream timeout";
            
            if (retryCount < maxRetries && !isTimeoutError) {
              retryCount++;
              logger.info(`Retrying stream (attempt ${retryCount}/${maxRetries})...`, { messageId });
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
            
            // Clean up stream state on error
            eventStore.clearStream(messageId);
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
        "X-Automation-Session": sessionId,
      },
    });
  } catch (error) {
    logger.error("API error:", error instanceof ChatError ? error : new ChatError('Unknown error', messageId));
    
    let statusCode = 500;
    let errorMessage = "Internal Server Error";
    let errorDetails = error instanceof Error ? error.message : undefined;
    
    if (error instanceof ValidationError) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error instanceof AutomationError) {
      statusCode = 500;
      errorMessage = "Browser automation failed";
      errorDetails = error.details;
    } else if (error instanceof StreamError) {
      statusCode = 500;
      errorMessage = "Stream processing failed";
      errorDetails = error.details;
    } else if (error instanceof Error) {
      if (error.message.includes("temperature")) {
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

    // Clean up any stream state on error
    eventStore.clearStream(messageId);

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
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
