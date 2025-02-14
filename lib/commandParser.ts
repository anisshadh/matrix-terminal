import { z } from 'zod';
import browserAutomation from './browserAutomation';
import { logger } from './logger';
import { SmartCommandParser } from './smartCommandParser';

// Define schemas for validation
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1)
});

const MessagesSchema = z.array(MessageSchema);

interface CommandResult {
  success: boolean;
  content: string;
  error?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
}

export class CommandParser {
  static validateMessages(messages: unknown): z.infer<typeof MessagesSchema> {
    return MessagesSchema.parse(messages);
  }

  static async parseAndExecuteCommand(content: string): Promise<CommandResult> {
    try {
      // Special case for greetings
      if (/^(hi|hello|hey|greetings)$/i.test(content)) {
        return {
          success: true,
          content: "Greetings, user. Matrix connection established. Awaiting further instructions."
        };
      }

      // Use SmartCommandParser to parse the command
      const actions = await SmartCommandParser.parseCommand(content);

      // If no actions were parsed
      if (actions.length === 0) {
        return {
          success: false,
          content: "Command not recognized. Please try rephrasing your request.",
          error: "UNRECOGNIZED_COMMAND"
        };
      }

      // For now, we'll execute the first action and queue the rest
      // In a future update, we can implement proper action chaining
      const firstAction = actions[0];
      
      // Generate appropriate response message
      let responseMessage = '';
      switch (firstAction.action) {
        case 'navigate':
          responseMessage = `Initiating navigation to ${firstAction.url}...`;
          break;
        case 'click':
          responseMessage = `Executing click on specified element...`;
          break;
        case 'type':
          responseMessage = `Typing "${firstAction.value}" into specified element...`;
          break;
      }

      // If there are additional actions, add a note
      if (actions.length > 1) {
        responseMessage += ` (${actions.length - 1} additional actions queued)`;
      }

      return {
        success: true,
        content: responseMessage,
        toolCall: {
          name: "run_browser_automation",
          arguments: firstAction
        }
      };
    } catch (error) {
      logger.error('Command parsing error:', error instanceof Error ? error : new Error('Unknown error'));
      return {
        success: false,
        content: "An error occurred while processing your command. Please try again.",
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR"
      };
    }
  }
}
