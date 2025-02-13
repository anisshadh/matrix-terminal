import { chromium, Browser, Page } from 'playwright';

interface BrowserAutomationParams {
  action: 'navigate' | 'click' | 'type';
  url?: string;
  selector?: string;
  value?: string;
  visible?: boolean; // New flag to control browser visibility
}

interface AutomationResult {
  success: boolean;
  message: string;
  error?: string;
}

export class BrowserAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private keepOpen: boolean = false;

  private async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: !this.keepOpen, // Use non-headless mode when keepOpen is true
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    if (!this.page) {
      const context = await this.browser.newContext();
      this.page = await context.newPage();
    }
  }

  private async cleanup() {
    // Only cleanup if we're not keeping the browser open
    if (this.browser && !this.keepOpen) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async execute(params: BrowserAutomationParams): Promise<AutomationResult> {
    try {
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
          await this.page.goto(params.url, { waitUntil: 'networkidle' });
          return {
            success: true,
            message: `Successfully navigated to ${params.url}`
          };

        case 'click':
          if (!params.selector) {
            throw new Error('Selector is required for click action');
          }
          await this.page.waitForSelector(params.selector);
          await this.page.click(params.selector);
          return {
            success: true,
            message: `Successfully clicked element with selector: ${params.selector}`
          };

        case 'type':
          if (!params.selector || !params.value) {
            throw new Error('Selector and value are required for type action');
          }
          await this.page.waitForSelector(params.selector);
          // Using fill instead of type for better reliability
          await this.page.fill(params.selector, params.value);
          return {
            success: true,
            message: `Successfully typed text into element with selector: ${params.selector}`
          };

        default:
          throw new Error(`Unsupported action: ${params.action}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: 'Browser automation failed',
        error: errorMessage
      };
    } finally {
      await this.cleanup();
    }
  }
}

// Create a singleton instance
const browserAutomation = new BrowserAutomation();
export default browserAutomation;
