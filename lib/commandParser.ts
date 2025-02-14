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

      // Execute all actions in sequence
      const responseMessages: string[] = [];
      const chainedActions = actions.map(action => {
        let actionMessage = '';
        switch (action.action) {
          case 'navigate':
            actionMessage = `Initiating navigation to ${action.url}...`;
            break;
          case 'click':
            actionMessage = `Executing click on specified element...`;
            break;
          case 'type':
            actionMessage = `Typing "${action.value}" into specified element...`;
            break;
        }
        responseMessages.push(actionMessage);
        return action;
      });

      // Set visible=true for all actions in the chain except the last one
      // This keeps the browser open between actions
      chainedActions.forEach((action, index) => {
        if (index < chainedActions.length - 1) {
          action.visible = true;
        }
      });

      return {
        success: true,
        content: responseMessages.join(' Then '),
        toolCall: {
          name: "run_browser_automation",
          arguments: {
            actions: chainedActions
          }
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
