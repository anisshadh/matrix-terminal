import { z } from 'zod';
import { logger } from './logger';

// Action types that match browserAutomation's expectations
export interface AutomationAction {
  action: 'navigate' | 'click' | 'type';
  url?: string;
  selector?: string;
  value?: string;
  visible?: boolean;
}

// Schema for validating parsed actions
const AutomationActionSchema = z.object({
  action: z.enum(['navigate', 'click', 'type']),
  url: z.string().url().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  visible: z.boolean().optional()
});

export class SmartCommandParser {
  /**
   * Parses natural language input into a sequence of automation actions
   */
  static async parseCommand(input: string): Promise<AutomationAction[]> {
    try {
      logger.debug('Parsing command:', input);
      
      // Normalize input
      const normalizedInput = input.trim().toLowerCase();
      
      // Extract potential URLs
      const urlPattern = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/i;
      const urls = normalizedInput.match(urlPattern);
      
      // Initialize actions array
      const actions: AutomationAction[] = [];
      
      // Common website shortcuts
      const websiteShortcuts: Record<string, string> = {
        'google': 'https://www.google.com',
        'youtube': 'https://www.youtube.com',
        'github': 'https://www.github.com',
        'twitter': 'https://www.twitter.com',
        'x': 'https://www.twitter.com'
      };

      // Helper function to determine if text implies a search action
      const impliesSearch = (text: string): boolean => {
        const searchKeywords = ['search', 'find', 'look up', 'lookup'];
        return searchKeywords.some(keyword => text.includes(keyword));
      };

      // Helper function to determine if text implies a click action
      const impliesClick = (text: string): boolean => {
        const clickKeywords = ['click', 'press', 'select', 'choose', 'open'];
        return clickKeywords.some(keyword => text.includes(keyword));
      };

      // Split input into separate commands
      const commandSeparators = /(?:then|and|,|;)/i;
      const commands = normalizedInput.split(commandSeparators).map(cmd => cmd.trim()).filter(Boolean);
      
      // Process each command separately
      for (const command of commands) {
        const commandActions: AutomationAction[] = [];
        
        // Extract URLs from this command
        const commandUrls = command.match(urlPattern);
        
        // Process navigation intents
        if (commandUrls?.length) {
          commandActions.push({
            action: 'navigate',
            url: commandUrls[0].startsWith('http') ? commandUrls[0] : `https://${commandUrls[0]}`,
            visible: true
          });
        } else {
          // Check for website shortcuts
          for (const [site, url] of Object.entries(websiteShortcuts)) {
            if (command.includes(site)) {
              commandActions.push({
                action: 'navigate',
                url,
                visible: true
              });
              break;
            }
          }
        }

        // Process search intents for this command
        if (impliesSearch(command)) {
          // Extract search query for this specific command
          const searchKeywords = ['search for', 'search', 'find', 'look up', 'lookup'];
          let searchQuery = '';
          
          for (const keyword of searchKeywords) {
            const index = command.indexOf(keyword);
            if (index !== -1) {
              searchQuery = command.slice(index + keyword.length).trim();
              break;
            }
          }

          if (searchQuery) {
            // If we haven't navigated anywhere in this command, assume Google search
            if (commandActions.length === 0) {
              commandActions.push({
                action: 'navigate',
                url: 'https://www.google.com',
                visible: true
              });
            }

            commandActions.push({
              action: 'type',
              selector: 'input[type="search"], input[name="q"], input[aria-label*="search" i]',
              value: searchQuery,
              visible: true
            });
          }
        }

        // Process click intents for this command
        if (impliesClick(command)) {
          const clickKeywords = ['click', 'press', 'select', 'choose', 'open'];
          let elementToClick = '';
          
          for (const keyword of clickKeywords) {
            const index = command.indexOf(keyword);
            if (index !== -1) {
              elementToClick = command.slice(index + keyword.length).trim();
              break;
            }
          }

          if (elementToClick) {
            commandActions.push({
              action: 'click',
              selector: this.generateSmartSelector(elementToClick),
              visible: true
            });
          }
        }

        // Add all actions from this command to the main actions array
        actions.push(...commandActions);
      }


      // Validate all actions
      const validatedActions = actions.map(action => {
        const result = AutomationActionSchema.safeParse(action);
        if (!result.success) {
          logger.warn('Invalid action:', action, result.error);
          return null;
        }
        return action;
      }).filter((action): action is AutomationAction => action !== null);

      logger.debug('Parsed actions:', validatedActions);
      return validatedActions;
    } catch (error) {
      logger.error('Error parsing command:', error instanceof Error ? error : new Error('Unknown error'));
      return [];
    }
  }

  /**
   * Generates a flexible selector based on natural language description
   */
  private static generateSmartSelector(description: string): string {
    const selectors = [
      // Exact matches
      `[aria-label="${description}"]`,
      `[title="${description}"]`,
      `[name="${description}"]`,
      
      // Case-insensitive partial matches
      `[aria-label*="${description}" i]`,
      `[title*="${description}" i]`,
      `[placeholder*="${description}" i]`,
      
      // Text content matches
      `text="${description}"`,
      `:text-is("${description}")`,
      
      // Common elements with matching text
      `button:has-text("${description}")`,
      `a:has-text("${description}")`,
      
      // Role-based selectors
      `[role="button"]:has-text("${description}")`,
      `[role="link"]:has-text("${description}")`,
      
      // Input fields
      `input[placeholder*="${description}" i]`,
      `textarea[placeholder*="${description}" i]`,
      
      // Data attributes
      `[data-testid*="${description}" i]`,
      `[data-cy*="${description}" i]`,
      `[data-test*="${description}" i]`
    ];

    // Join all selectors with commas for fallback behavior
    return selectors.join(', ');
  }
}
