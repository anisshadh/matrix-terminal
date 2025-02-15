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

export interface CommandResult {
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

  static async parseCommands(content: string): Promise<any[]> {
    try {
      // Use SmartCommandParser to parse the command
      const actions = await SmartCommandParser.parseCommand(content);
      return actions;
    } catch (error) {
      logger.error('Command parsing error:', error instanceof Error ? error : new Error('Unknown error'));
      return [];
    }
  }

  static async executeCommand(command: any): Promise<CommandResult> {
    try {
      // Special case for greetings
      if (typeof command === 'string' && /^(hi|hello|hey|greetings)$/i.test(command)) {
        return {
          success: true,
          content: "DIRECT ANSWER: Greetings, human interface established. I am ready to provide information or perform web actions as instructed."
        };
      }

      // Handle browser automation command
      if (command && command.confidence !== undefined) {
        // If confidence is too low, return without browser action
        if (command.confidence < 0.6) {
          return {
            success: true,
            content: "DIRECT ANSWER: I understand your message, but I'm not confident that you want me to perform a browser action. Could you please clarify if you'd like me to use the browser?"
          };
        }

        const actionMessage = this.getActionMessage(command);
        return {
          success: true,
          content: `WEB ACTION: ${actionMessage}`,
          toolCall: {
            name: "run_browser_automation",
            arguments: command
          }
        };
      }

      // For non-browser commands or unclear intent
      return {
        success: true,
        content: "DIRECT ANSWER: I understand your message. Please let me know if you'd like me to perform any specific browser actions."
      };
    } catch (error) {
      logger.error('Command execution error:', error instanceof Error ? error : new Error('Unknown error'));
      return {
        success: false,
        content: "An error occurred while executing your command. Please try again.",
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR"
      };
    }
  }

  private static getActionMessage(command: any): string {
    const confidenceNote = command.confidence ? ` (Confidence: ${Math.round(command.confidence * 100)}%)` : '';
    
    switch (command.action) {
      case 'navigate':
        return `Navigating to ${command.url}${confidenceNote}`;
      case 'click':
        return `Clicking on specified element${confidenceNote}`;
      case 'type':
        return `Typing "${command.value}" into specified element${confidenceNote}`;
      default:
        return `Executing command${confidenceNote}`;
    }
  }

  static async parseAndExecuteCommand(content: string): Promise<CommandResult> {
    try {
      // Special case for greetings
      if (/^(hi|hello|hey|greetings)$/i.test(content)) {
        return {
          success: true,
          content: "DIRECT ANSWER: Greetings, human interface established. I am ready to provide information or perform web actions as instructed."
        };
      }

      // Use SmartCommandParser to parse the command
      const actions = await SmartCommandParser.parseCommand(content);

      // If no actions were parsed
      if (actions.length === 0) {
        // Check if it's a negative keyword match
        const normalizedContent = content.trim().toLowerCase();
        const isQuestion = /^(are|do|can|could|would|should|what|how|why|when|where|who)\s/.test(normalizedContent);
        
        if (isQuestion) {
          return {
            success: true,
            content: "DIRECT ANSWER: I understand you're asking a question. I'll provide a direct response rather than performing any browser actions.",
          };
        }

        return {
          success: true,
          content: "DIRECT ANSWER: I understand your message, but I'm not confident about performing any browser actions. Please let me know specifically if you'd like me to use the browser.",
        };
      }

      // Check confidence of all actions
      const lowConfidenceActions = actions.filter(action => (action.confidence ?? 0) < 0.6);
      if (lowConfidenceActions.length > 0) {
        return {
          success: true,
          content: "DIRECT ANSWER: I'm not completely confident about the browser actions you want me to perform. Could you please clarify your request?"
        };
      }

      // Execute all actions in sequence
      const responseMessages: string[] = [];
      const chainedActions = actions.map(action => {
        const confidenceNote = action.confidence ? ` (Confidence: ${Math.round(action.confidence * 100)}%)` : '';
        let actionMessage = '';
        switch (action.action) {
          case 'navigate':
            actionMessage = `Navigating to ${action.url}${confidenceNote}`;
            break;
          case 'click':
            actionMessage = `Clicking on specified element${confidenceNote}`;
            break;
          case 'type':
            actionMessage = `Typing "${action.value}" into specified element${confidenceNote}`;
            break;
        }
        responseMessages.push(actionMessage);
        return action;
      });

      // Set visible=true for all actions to maintain window persistence
      chainedActions.forEach(action => {
        action.visible = true;
      });

      // Generate a unique chain ID
      const chainId = crypto.randomUUID();

      // Add chain metadata to each action
      chainedActions.forEach((action, index) => {
        action.chainId = chainId;
        action.chainIndex = index;
        action.isLastInChain = index === chainedActions.length - 1;
      });

      // Package actions with chain metadata
      return {
        success: true,
        content: `WEB ACTION: ${responseMessages.join(' Then ')}`,
        toolCall: {
          name: "run_browser_automation",
          arguments: {
            actions: chainedActions,
            chainMetadata: {
              id: chainId,
              totalActions: chainedActions.length,
              keepWindowOpen: true // Force window to stay open during chain execution
            }
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
