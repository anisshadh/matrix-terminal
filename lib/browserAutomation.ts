import { chromium, Browser, Page } from 'playwright';
import { logger } from './logger';

interface BrowserAutomationParams {
  action: 'navigate' | 'click' | 'type';
  url?: string;
  selector?: string;
  value?: string;
  visible?: boolean;
}

interface AutomationResult {
  success: boolean;
  message: string;
  error?: string;
}

interface ElementProperties {
  isVisible: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Array<{ name: string; value: string }>;
}

export class BrowserAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private keepOpen: boolean = false;

  private async initBrowser(retryCount = 0, maxRetries = 3): Promise<void> {
    try {
      logger.debug('Initializing browser automation', { retryCount });

      // Always close existing browser instance before creating a new one
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }

      logger.debug('Launching new browser instance', { headless: !this.keepOpen });
      try {
        this.browser = await chromium.launch({
          headless: !this.keepOpen,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      } catch (error) {
        if (retryCount < maxRetries) {
          logger.warn(`Browser launch failed, retrying (${retryCount + 1}/${maxRetries})...`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return this.initBrowser(retryCount + 1, maxRetries);
        }
        throw error;
      }

      if (!this.browser) {
        throw new Error('Failed to initialize browser');
      }
      
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 }
      });
      this.page = await context.newPage();
      logger.debug('Created new browser page');

      // Set default timeout
      this.page.setDefaultTimeout(15000);
      
      // Listen for console messages
      this.page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        logger.debug(`Browser console [${type}]:`, text);
      });

      // Listen for errors
      this.page.on('pageerror', error => {
        logger.error('Browser page error:', error);
      });
    } catch (error) {
      const errorMessage = `Failed to initialize browser: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined);
      throw new Error(errorMessage);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.browser && !this.keepOpen) {
        logger.debug('Cleaning up browser instance');
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch (error) {
      logger.error('Error during browser cleanup:', error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  public async execute(params: BrowserAutomationParams): Promise<AutomationResult> {
    logger.info('Executing browser automation', params);
    
    try {
      // Validate required parameters
      this.validateParams(params);
      
      // Set keepOpen based on the visible parameter
      this.keepOpen = params.visible === true;
      
      await this.initBrowser();
      
      if (!this.page) {
        throw new Error('Failed to initialize browser page');
      }

      switch (params.action) {
        case 'navigate':
          if (!params.url) {
            throw new Error('URL is required for navigate action');
          }
          logger.debug(`Navigating to URL: ${params.url}`);
          await this.page.goto(params.url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          logger.info(`Successfully navigated to ${params.url}`);
          return {
            success: true,
            message: `Successfully navigated to ${params.url}`
          };

        case 'click':
          if (!params.selector) {
            throw new Error('Selector is required for click action');
          }
          logger.debug(`Attempting to click element: ${params.selector}`);
          
          // Try each selector until we find a visible element
          const clickElement = await this.findElement(params.selector);
          if (!clickElement) {
            throw new Error(`Element not found: ${params.selector}`);
          }
          
          // Log element properties for debugging
          const elementProperties = await clickElement.evaluate((el: HTMLElement): ElementProperties => {
            const rect = el.getBoundingClientRect();
            return {
              isVisible: window.getComputedStyle(el).display !== 'none' && 
                        window.getComputedStyle(el).visibility !== 'hidden',
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              attributes: Array.from(el.attributes).map(attr => ({
                name: attr.name,
                value: attr.value
              }))
            };
          });
          logger.debug('Element properties:', elementProperties);
          
          await clickElement.scrollIntoViewIfNeeded();
          await clickElement.click();
          
          logger.info(`Successfully clicked element: ${params.selector}`);
          return {
            success: true,
            message: `Successfully clicked element with selector: ${params.selector}`
          };

        case 'type':
          if (!params.selector || !params.value) {
            throw new Error('Selector and value are required for type action');
          }
          logger.debug(`Attempting to type into element: ${params.selector}`);
          
          // Find and interact with input element
          const inputElement = await this.findElement(params.selector);
          if (!inputElement) {
            throw new Error('No matching element found for any selector');
          }

          // Clear existing text and type new value
          await inputElement.click();
          await inputElement.fill('');
          await inputElement.fill(params.value);
          
          // Optional: Press Enter if it's a search input
          if (params.selector.includes('search') || params.value.toLowerCase().includes('search')) {
            logger.debug('Search input detected, pressing Enter');
            await this.page.keyboard.press('Enter');
            // Wait for navigation if needed
            await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
              logger.debug('No navigation occurred after pressing Enter');
            });
          }
          
          logger.info(`Successfully typed text into element: ${params.selector}`);
          return {
            success: true,
            message: `Successfully typed text into element with selector: ${params.selector}`
          };

        default:
          throw new Error(`Unsupported action: ${params.action}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Browser automation error:', error instanceof Error ? error : new Error(errorMessage));
      
      // Take a screenshot on error if page is available
      if (this.page) {
        try {
          const screenshotPath = 'automation-error.png';
          await this.page.screenshot({ 
            path: screenshotPath,
            fullPage: true 
          });
          logger.info(`Error screenshot saved to: ${screenshotPath}`);
        } catch (screenshotError) {
          logger.error('Failed to capture error screenshot:', screenshotError instanceof Error ? screenshotError : new Error('Unknown error'));
        }
      }
      
      return {
        success: false,
        message: 'Browser automation failed',
        error: errorMessage
      };
    } finally {
      await this.cleanup();
    }
  }

  private validateParams(params: BrowserAutomationParams): void {
    logger.debug('Validating automation parameters', params);
    
    if (!params.action) {
      throw new Error('Action is required');
    }

    switch (params.action) {
      case 'navigate':
        if (!params.url) {
          throw new Error('URL is required for navigate action');
        }
        if (!params.url.startsWith('http://') && !params.url.startsWith('https://')) {
          throw new Error('URL must start with http:// or https://');
        }
        break;

      case 'click':
        if (!params.selector) {
          throw new Error('Selector is required for click action');
        }
        break;

      case 'type':
        if (!params.selector) {
          throw new Error('Selector is required for type action');
        }
        if (!params.value) {
          throw new Error('Value is required for type action');
        }
        break;
    }
  }

  private async findElement(selector: string) {
    if (!this.page) {
      throw new Error('Browser page not initialized');
    }

    // Split multiple selectors and try each one
    const selectors = selector.split(',').map(s => s.trim());
    
    for (const singleSelector of selectors) {
      try {
        const element = await this.page.waitForSelector(singleSelector, {
          state: 'visible',
          timeout: 5000
        });
        if (element) {
          logger.debug(`Found element with selector: ${singleSelector}`);
          return element;
        }
      } catch (error) {
        logger.debug(`Selector not found: ${singleSelector}`);
        continue;
      }
    }
    
    return null;
  }
}

// Create a singleton instance
const browserAutomation = new BrowserAutomation();
export default browserAutomation;
