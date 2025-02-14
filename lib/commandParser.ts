import { z } from 'zod';
import browserAutomation from './browserAutomation';

// Define schemas for validation
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1)
});

const MessagesSchema = z.array(MessageSchema);

// Keywords for command detection
const KEYWORDS = {
  GREETING: ['hi', 'hello', 'hey', 'greetings'],
  NAVIGATION: ['go', 'open', 'navigate', 'visit', 'browse', 'load', 'show'],
  SEARCH: ['search', 'find', 'lookup', 'look up'],
  CLICK: ['click', 'press', 'select', 'choose'],
  TYPE: ['type', 'enter', 'input', 'write']
} as const;

// URL pattern for detecting web addresses
const URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/i;

// Command patterns for parsing
const COMMAND_PATTERNS = {
  GREETING: new RegExp(`^(${KEYWORDS.GREETING.join('|')})$`, 'i'),
  NAVIGATION: new RegExp(`(?:${KEYWORDS.NAVIGATION.join('|')})(?:\\s+(?:to|on|at|in))??\\s*(.+)`, 'i'),
  SEARCH: new RegExp(`(?:${KEYWORDS.SEARCH.join('|')})(?:\\s+(?:for|about))?\\s+(.+)`, 'i'),
  CLICK: new RegExp(`(?:${KEYWORDS.CLICK.join('|')})(?:\\s+(?:the|on|at))?\\s+(.+)`, 'i'),
  TYPE: new RegExp(`(?:${KEYWORDS.TYPE.join('|')})(?:\\s+(?:in|into|to))?\\s*(?:the\\s+)?(.+?)\\s*:\\s*(.+)`, 'i')
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
        // Extract URL from the matched content
        const urlMatch = navigationMatch[1].match(URL_PATTERN);
        if (!urlMatch) {
          return {
            success: false,
            content: "Could not detect a valid URL in the command. Please include a website address.",
            error: "INVALID_URL"
          };
        }
        const url = this.normalizeUrl(urlMatch[0]);
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
