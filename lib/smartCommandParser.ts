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
  url: z.string().min(1).optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  visible: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional()
});

// Action-specific keyword sets
const COMMAND_TRIGGERS = {
  navigation: ['go to', 'navigate to', 'open', 'visit'],
  click: ['click on', 'click the', 'press on', 'select the'],
  search: ['search for', 'look up', 'find'],
  type: ['type', 'enter', 'input']
} as const;

// Secondary keywords are removed to prevent false positives

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

// Website shortcuts require exact word matches
const websiteShortcuts: Record<string, string> = {
  'google': 'https://www.google.com',
  'youtube': 'https://www.youtube.com',
  'github': 'https://www.github.com',
  'facebook': 'https://www.facebook.com',
  'amazon': 'https://www.amazon.com',
  'wikipedia': 'https://www.wikipedia.org',
  'linkedin': 'https://www.linkedin.com',
  'reddit': 'https://www.reddit.com'
};

export class SmartCommandParser {
  /**
   * Checks if input contains an explicit command trigger
   */
  private static hasExplicitCommand(input: string): boolean {
    return Object.values(COMMAND_TRIGGERS)
      .flat()
      .some(trigger => input.toLowerCase().includes(trigger));
  }

  /**
   * Checks if a website reference is an exact word match
   */
  private static isExactSiteMatch(input: string, site: string): boolean {
    const words = input.toLowerCase().split(/\s+/);
    return words.includes(site.toLowerCase());
  }

  /**
   * Calculate confidence score for a potential browser action
   */
  private static calculateConfidence(
    input: string,
    commandType: keyof typeof COMMAND_TRIGGERS,
    hasContext: boolean,
    isNegative: boolean
  ): number {
    if (isNegative) return 0;

    let score = 0;

    // Check if input contains any of the command triggers
    const matchCount = COMMAND_TRIGGERS[commandType].filter(trigger => 
      input.toLowerCase().includes(trigger)
    ).length;

    // Base score from command matches
    score += matchCount * 0.4;

    // Boost score if there's context
    if (hasContext) {
      score += 0.3;
    }

    // Boost score for explicit commands
    if (this.hasExplicitCommand(input)) {
      score += 0.3;
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
        if (commandUrls?.length || this.hasExplicitCommand(command)) {
          const url = commandUrls?.[0] || '';
          if (url || this.hasExplicitCommand(command)) {
            hasContext = true;
            const navigationAction: AutomationAction = {
              action: 'navigate',
              url: url.startsWith('http') ? url : `https://${url}`,
              visible: true
            };
            
            navigationAction.confidence = this.calculateConfidence(
              command,
              'navigation',
              true,
              false
            );
            
            if (navigationAction.confidence >= 0.6) {
              commandActions.push(navigationAction);
            }
          }
        }

        // Check for website shortcuts only with explicit navigation commands
        if (this.hasExplicitCommand(command)) {
          for (const [site, url] of Object.entries(websiteShortcuts)) {
            if (this.isExactSiteMatch(command, site)) {
              hasContext = true;
              const navigationAction: AutomationAction = {
                action: 'navigate',
                url,
                visible: true,
                confidence: 1.0 // Exact match = high confidence
              };
              commandActions.push(navigationAction);
              break;
            }
          }
        }

        // Process search intents
        const searchTriggers = COMMAND_TRIGGERS.search;
        const searchMatch = searchTriggers.find(trigger => command.includes(trigger));
        
        if (searchMatch) {
          const searchQuery = command.slice(command.indexOf(searchMatch) + searchMatch.length).trim();

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
              'search',
              hasContext,
              false
            );
            
            if (searchAction.confidence >= 0.6) {
              commandActions.push(searchAction);
            }
          }
        }

        // Process click intents
        const clickTriggers = COMMAND_TRIGGERS.click;
        const clickMatch = clickTriggers.find(trigger => command.includes(trigger));
        
        if (clickMatch) {
          const elementToClick = command.slice(command.indexOf(clickMatch) + clickMatch.length).trim();

          if (elementToClick) {
            hasContext = true;
            const clickAction: AutomationAction = {
              action: 'click',
              selector: this.generateSmartSelector(elementToClick),
              visible: true
            };
            
            clickAction.confidence = this.calculateConfidence(
              command,
              'click',
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
