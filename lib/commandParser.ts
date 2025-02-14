import { z } from 'zod';
import browserAutomation from './browserAutomation';

// Define schemas for validation
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1)
});

const MessagesSchema = z.array(MessageSchema);

// Command patterns for parsing
const COMMAND_PATTERNS = {
  GREETING: /^(hi|hello|hey|greetings)$/i,
  NAVIGATION: /^(?:go to|open|navigate to)\s+(.+)$/i,
  SEARCH: /^search(?:\s+for)?\s+(.+)$/i,
  CLICK: /^click(?:\s+(?:the|on))?\s+(.+)$/i,
  TYPE: /^type\s+(?:in|into)?\s*(?:the\s+)?(.+?)\s*:\s*(.+)$/i
} as const;

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
      // Handle greetings
      if (COMMAND_PATTERNS.GREETING.test(content)) {
        return {
          success: true,
          content: "Greetings, user. Matrix connection established. Awaiting further instructions."
        };
      }

      // Handle navigation commands
      const navigationMatch = content.match(COMMAND_PATTERNS.NAVIGATION);
      if (navigationMatch) {
        const url = this.normalizeUrl(navigationMatch[1]);
        return {
          success: true,
          content: `Initiating navigation to ${url}...`,
          toolCall: {
            name: "run_browser_automation",
            arguments: {
              action: "navigate",
              url,
              visible: true
            }
          }
        };
      }

      // Handle search commands
      const searchMatch = content.match(COMMAND_PATTERNS.SEARCH);
      if (searchMatch) {
        const searchQuery = searchMatch[1];
        return {
          success: true,
          content: `Executing search for "${searchQuery}"...`,
          toolCall: {
            name: "run_browser_automation",
            arguments: {
              action: "type",
              selector: 'input[type="search"], input[type="text"], textarea[name="q"]',
              value: searchQuery,
              visible: true
            }
          }
        };
      }

      // Handle click commands
      const clickMatch = content.match(COMMAND_PATTERNS.CLICK);
      if (clickMatch) {
        const element = clickMatch[1];
        const selector = this.getElementSelector(element);
        return {
          success: true,
          content: `Executing click on ${element}...`,
          toolCall: {
            name: "run_browser_automation",
            arguments: {
              action: "click",
              selector,
              visible: true
            }
          }
        };
      }

      // Handle type commands
      const typeMatch = content.match(COMMAND_PATTERNS.TYPE);
      if (typeMatch) {
        const [, element, text] = typeMatch;
        const selector = this.getElementSelector(element);
        return {
          success: true,
          content: `Typing "${text}" into ${element}...`,
          toolCall: {
            name: "run_browser_automation",
            arguments: {
              action: "type",
              selector,
              value: text,
              visible: true
            }
          }
        };
      }

      // If no command pattern matches
      return {
        success: false,
        content: "Command not recognized. Please try rephrasing your request.",
        error: "UNRECOGNIZED_COMMAND"
      };
    } catch (error) {
      console.error('Command parsing error:', error);
      return {
        success: false,
        content: "An error occurred while processing your command. Please try again.",
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR"
      };
    }
  }

  private static normalizeUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  private static getElementSelector(element: string): string {
    // Map common element descriptions to selectors
    const selectorMap: Record<string, string> = {
      'search button': 'button[aria-label*="search" i], button[type="submit"]',
      'search box': 'input[type="search"], input[name="q"]',
      'submit button': 'button[type="submit"], input[type="submit"]'
    };

    // Try to find a predefined selector
    const selector = selectorMap[element.toLowerCase()];
    if (selector) {
      return selector;
    }

    // Generate a flexible selector based on the element description
    return [
      `[aria-label*="${element}" i]`,
      `[placeholder*="${element}" i]`,
      `button:has-text("${element}")`,
      `a:has-text("${element}")`,
      `input[name*="${element}" i]`
    ].join(', ');
  }
}
