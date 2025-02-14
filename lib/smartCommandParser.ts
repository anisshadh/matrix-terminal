import { z } from 'zod';
import { logger } from './logger';

// Action types that match browserAutomation's expectations
export interface AutomationAction {
  action: 'navigate' | 'click' | 'type';
  url?: string;
  selector?: string;
  value?: string;
  visible?: boolean;
  confidence?: number;
}

// Schema for validating parsed actions
const AutomationActionSchema = z.object({
  action: z.enum(['navigate', 'click', 'type']),
  url: z.string().url().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  visible: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional()
});

// Action-specific keyword sets
const navigationKeywords = {
  primary: ['go to', 'navigate to', 'open', 'visit'],
  secondary: ['browse', 'load', 'access']
};

const clickKeywords = {
  primary: ['click on', 'click the', 'press on', 'select the'],
  secondary: ['choose the', 'pick the']
};

const searchKeywords = {
  primary: ['search for', 'look up', 'find'],
  secondary: ['search', 'lookup', 'find']
};

const typeKeywords = {
  primary: ['type', 'enter', 'input'],
  secondary: ['write', 'fill']
};

// Negative keywords that should never trigger browser actions
const negativeKeywords = [
  'are you',
  'do you',
  'can you',
  'could you',
  'would you',
  'should you',
  'what is',
  'how to',
  'why is',
  'when is',
  'where is',
  'who is',
  'tell me',
  'explain',
  'help me',
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank you'
];

// Common website shortcuts with their full URLs
const websiteShortcuts: Record<string, string> = {
  'google': 'https://www.google.com',
  'youtube': 'https://www.youtube.com',
  'github': 'https://www.github.com',
  'twitter': 'https://www.twitter.com',
  'x': 'https://www.twitter.com',
  'facebook': 'https://www.facebook.com',
  'amazon': 'https://www.amazon.com',
  'wikipedia': 'https://www.wikipedia.org',
  'linkedin': 'https://www.linkedin.com',
  'reddit': 'https://www.reddit.com'
};

export class SmartCommandParser {
  /**
   * Calculate confidence score for a potential browser action
   */
  private static calculateConfidence(
    input: string,
    matchedKeywords: string[],
    hasContext: boolean,
    isNegative: boolean
  ): number {
    if (isNegative) return 0;

    let score = 0;

    // Base score from keyword matches
    const primaryMatches = matchedKeywords.filter(kw => 
      Object.values(navigationKeywords.primary).includes(kw) ||
      Object.values(clickKeywords.primary).includes(kw) ||
      Object.values(searchKeywords.primary).includes(kw) ||
      Object.values(typeKeywords.primary).includes(kw)
    ).length;

    const secondaryMatches = matchedKeywords.filter(kw =>
      Object.values(navigationKeywords.secondary).includes(kw) ||
      Object.values(clickKeywords.secondary).includes(kw) ||
      Object.values(searchKeywords.secondary).includes(kw) ||
      Object.values(typeKeywords.secondary).includes(kw)
    ).length;

    score += primaryMatches * 0.4;    // Primary keywords are worth more
    score += secondaryMatches * 0.2;   // Secondary keywords are worth less

    // Boost score if there's context (like a URL or specific element description)
    if (hasContext) {
      score += 0.3;
    }

    // Penalize very short inputs as they're more likely to be ambiguous
    if (input.split(' ').length < 3) {
      score *= 0.5;
    }

    // Cap the score at 1.0
    return Math.min(score, 1.0);
  }

  /**
   * Check if input contains any negative keywords that should prevent browser actions
   */
  private static containsNegativeKeywords(input: string): boolean {
    return negativeKeywords.some(keyword => 
      input.toLowerCase().startsWith(keyword) || 
      input.toLowerCase().includes(` ${keyword} `)
    );
  }

  /**
   * Parses natural language input into a sequence of automation actions
   */
  static async parseCommand(input: string): Promise<AutomationAction[]> {
    try {
      logger.debug('Parsing command:', input);
      
      // Normalize input
      const normalizedInput = input.trim().toLowerCase();

      // Check for negative keywords first
      if (this.containsNegativeKeywords(normalizedInput)) {
        logger.debug('Command contains negative keywords, skipping browser actions');
        return [];
      }
      
      // Extract potential URLs
      const urlPattern = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/i;
      const urls = normalizedInput.match(urlPattern);
      
      // Initialize actions array
      const actions: AutomationAction[] = [];

      // Split input into separate commands
      const commandSeparators = /(?:then|and|,|;)/i;
      const commands = normalizedInput.split(commandSeparators)
        .map(cmd => cmd.trim())
        .filter(Boolean);
      
      // Process each command separately
      for (const command of commands) {
        const commandActions: AutomationAction[] = [];
        
        // Extract URLs from this command
        const commandUrls = command.match(urlPattern);
        
        // Track matched keywords for confidence scoring
        const matchedKeywords: string[] = [];
        let hasContext = false;

        // Process navigation intents
        if (commandUrls?.length) {
          hasContext = true;
          const navigationAction: AutomationAction = {
            action: 'navigate',
            url: commandUrls[0].startsWith('http') ? commandUrls[0] : `https://${commandUrls[0]}`,
            visible: true
          };
          
          // Calculate confidence for navigation
          navigationAction.confidence = this.calculateConfidence(
            command,
            [...navigationKeywords.primary, ...navigationKeywords.secondary],
            true,
            false
          );
          
          if (navigationAction.confidence >= 0.6) {
            commandActions.push(navigationAction);
          }
        } else {
          // Check for website shortcuts
          for (const [site, url] of Object.entries(websiteShortcuts)) {
            if (command.includes(site)) {
              hasContext = true;
              const navigationAction: AutomationAction = {
                action: 'navigate',
                url,
                visible: true
              };
              
              navigationAction.confidence = this.calculateConfidence(
                command,
                [...navigationKeywords.primary, ...navigationKeywords.secondary],
                true,
                false
              );
              
              if (navigationAction.confidence >= 0.6) {
                commandActions.push(navigationAction);
                break;
              }
            }
          }
        }

        // Process search intents
        const searchMatches = searchKeywords.primary.concat(searchKeywords.secondary)
          .filter(keyword => command.includes(keyword));
        
        if (searchMatches.length > 0) {
          matchedKeywords.push(...searchMatches);
          let searchQuery = '';
          
          // Extract search query using the longest matching keyword
          const matchedKeyword = searchMatches
            .sort((a, b) => b.length - a.length)[0];
          const index = command.indexOf(matchedKeyword);
          if (index !== -1) {
            searchQuery = command.slice(index + matchedKeyword.length).trim();
          }

          if (searchQuery) {
            hasContext = true;
            // If we haven't navigated anywhere, assume Google search
            if (commandActions.length === 0) {
              const navigationAction: AutomationAction = {
                action: 'navigate',
                url: 'https://www.google.com',
                visible: true,
                confidence: 0.8 // High confidence for Google search
              };
              commandActions.push(navigationAction);
            }

            const searchAction: AutomationAction = {
              action: 'type',
              selector: 'input[type="search"], input[name="q"], input[aria-label*="search" i]',
              value: searchQuery,
              visible: true
            };
            
            searchAction.confidence = this.calculateConfidence(
              command,
              matchedKeywords,
              hasContext,
              false
            );
            
            if (searchAction.confidence >= 0.6) {
              commandActions.push(searchAction);
            }
          }
        }

        // Process click intents
        const clickMatches = clickKeywords.primary.concat(clickKeywords.secondary)
          .filter(keyword => command.includes(keyword));
        
        if (clickMatches.length > 0) {
          matchedKeywords.push(...clickMatches);
          let elementToClick = '';
          
          // Extract element description using the longest matching keyword
          const matchedKeyword = clickMatches
            .sort((a, b) => b.length - a.length)[0];
          const index = command.indexOf(matchedKeyword);
          if (index !== -1) {
            elementToClick = command.slice(index + matchedKeyword.length).trim();
          }

          if (elementToClick) {
            hasContext = true;
            const clickAction: AutomationAction = {
              action: 'click',
              selector: this.generateSmartSelector(elementToClick),
              visible: true
            };
            
            clickAction.confidence = this.calculateConfidence(
              command,
              matchedKeywords,
              hasContext,
              false
            );
            
            if (clickAction.confidence >= 0.6) {
              commandActions.push(clickAction);
            }
          }
        }

        // Add all actions from this command to the main actions array if they have sufficient confidence
        actions.push(...commandActions.filter(action => (action.confidence ?? 0) >= 0.6));
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
