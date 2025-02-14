import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { logger } from './logger';
import { eventStore } from './eventStore';

interface BrowserState {
  instance: Browser;
  context: BrowserContext;
  page: Page;
  lastAction: 'navigate' | 'click' | 'type' | null;
  actionChain: BrowserAutomationParams[];
  domHash: string;
  visualHash: string;
  timestamp: number;
}

interface BrowserAutomationParams {
  action: 'navigate' | 'click' | 'type';
  url?: string;
  selector?: string;
  value?: string;
  visible?: boolean;
}

// Execution queue for quantum-safe action sequencing
const executionQueue = new Map<string, Promise<void>>();

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
  private currentSessionId: string | null = null;
  private static activeSessions = new Map<string, BrowserState>();
  private static readonly INACTIVITY_TIMEOUT = 300000; // 5 minutes
  private static readonly VIDEO_RECORDING_ENABLED = false; // Disable video recording by default

  // Initialize cleanup daemon
  private static cleanupDaemon = setInterval(() => {
    const now = Date.now();
    BrowserAutomation.activeSessions.forEach((session, id) => {
      if (now - session.timestamp > BrowserAutomation.INACTIVITY_TIMEOUT) {
        session.instance.close().catch(console.error);
        BrowserAutomation.activeSessions.delete(id);
      }
    });
  }, 5000);

  private async generateStateHashes(page: Page): Promise<{ domHash: string; visualHash: string }> {
    // Import crypto using dynamic import for ES modules
    const crypto = await import('crypto');
    
    const domContent = await page.content();
    const screenshot = await page.screenshot({ 
      type: 'png',
      fullPage: true,
      animations: 'disabled'
    });
    
    return {
      domHash: crypto.createHash('sha256').update(domContent).digest('hex'),
      visualHash: crypto.createHash('sha256').update(screenshot).digest('hex')
    };
  }

  private async validateTemporalConsistency(
    current: BrowserState,
    previous: BrowserState | undefined
  ): Promise<void> {
    if (!previous) return;

    if (current.domHash === previous.domHash && 
        current.visualHash !== previous.visualHash) {
      throw new Error('Visual/DOM state mismatch detected');
    }

    if (current.actionChain.length < previous.actionChain.length) {
      throw new Error('Action chain length decreased - potential state corruption');
    }
  }

  private async quantumExecute<T>(
    sessionId: string, 
    task: () => Promise<T>
  ): Promise<T> {
    logger.debug('Starting quantum execution', {
      sessionId,
      queueSize: executionQueue.size,
      hasExistingTask: executionQueue.has(sessionId),
      timestamp: new Date().toISOString()
    });

    if (executionQueue.has(sessionId)) {
      logger.debug('Waiting for existing task to complete', { sessionId });
      await executionQueue.get(sessionId);
      logger.debug('Previous task completed', { sessionId });
    }

    const startTime = Date.now();
    const promise = task().finally(() => {
      const duration = Date.now() - startTime;
      logger.debug('Task execution completed', {
        sessionId,
        durationMs: duration,
        timestamp: new Date().toISOString()
      });
      executionQueue.delete(sessionId);
    });

    logger.debug('Adding task to execution queue', { 
      sessionId,
      newQueueSize: executionQueue.size + 1
    });
    
    executionQueue.set(sessionId, promise as Promise<any>);
    return promise;
  }

  private async initBrowser(sessionId: string, retryCount = 0, maxRetries = 3): Promise<void> {
    try {
      this.currentSessionId = sessionId;
      logger.debug('Starting browser initialization', { 
        sessionId,
        retryCount, 
        maxRetries,
        keepOpen: this.keepOpen,
        timestamp: new Date().toISOString()
      });
      
      eventStore.addEvent(sessionId, {
        type: 'INIT',
        data: { retryCount, keepOpen: this.keepOpen }
      });

      logger.debug('Checking for existing session', { sessionId });

      // Check for existing valid session
      const existingSession = BrowserAutomation.activeSessions.get(sessionId);
      if (existingSession) {
        logger.debug('Found existing session', {
          sessionId,
          sessionAge: Date.now() - existingSession.timestamp,
          timeout: BrowserAutomation.INACTIVITY_TIMEOUT
        });
        
        if (Date.now() - existingSession.timestamp < BrowserAutomation.INACTIVITY_TIMEOUT) {
          try {
            const isClosed = await Promise.resolve().then(() => existingSession.page.isClosed()).catch(() => true);
            const isConnected = await Promise.resolve().then(() => existingSession.instance.isConnected()).catch(() => false);
            
            logger.debug('Checking existing session state', {
              sessionId,
              isClosed,
              isConnected
            });
            
            if (!isClosed && isConnected) {
              this.browser = existingSession.instance;
              this.page = existingSession.page;
              await this.page.bringToFront();
              logger.debug('Successfully reused existing browser session', { sessionId });
              return;
            }
          } catch (error) {
            logger.debug('Error checking existing session', {
              sessionId,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined
            });
            BrowserAutomation.activeSessions.delete(sessionId);
          }
        } else {
          logger.debug('Existing session expired', {
            sessionId,
            age: Date.now() - existingSession.timestamp,
            timeout: BrowserAutomation.INACTIVITY_TIMEOUT
          });
          BrowserAutomation.activeSessions.delete(sessionId);
        }
      }

      // Close existing browser if it exists and we couldn't reuse it
      if (this.browser) {
        logger.debug('Attempting to close existing browser instance', { sessionId });
        try {
          await this.browser.close();
          logger.debug('Successfully closed existing browser instance', { sessionId });
        } catch (error) {
          logger.debug('Error closing existing browser', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
        this.browser = null;
        this.page = null;
      }

      logger.debug('Launching new browser instance', {
        sessionId,
        retryCount,
        maxRetries,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--start-maximized',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });
      
      try {
        const startTime = Date.now();
        this.browser = await chromium.launch({
          headless: false, // Always start visible for reliability
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
          ]
        });
        logger.debug('Browser instance launched successfully', {
          sessionId,
          launchTime: Date.now() - startTime,
          isConnected: await this.browser.isConnected()
        });
      } catch (error) {
        logger.error(
          'Browser launch failed',
          error instanceof Error ? error : new Error('Unknown error'),
          { sessionId, retryCount }
        );
        
        if (retryCount < maxRetries) {
          const retryDelay = 1000 * (retryCount + 1);
          logger.warn(`Retrying browser launch`, {
            sessionId,
            attempt: retryCount + 1,
            maxRetries,
            retryDelay
          });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return this.initBrowser(sessionId, retryCount + 1, maxRetries);
        }
        throw error;
      }

      if (!this.browser) {
        throw new Error('Failed to initialize browser');
      }
      
      const contextOptions: any = {
        viewport: { width: 1920, height: 1080 }, // Full HD resolution
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false
      };

      // Only enable video recording if explicitly enabled
      if (BrowserAutomation.VIDEO_RECORDING_ENABLED) {
        contextOptions.recordVideo = { dir: 'videos/' };
      }

      const context = await this.browser.newContext(contextOptions);
      
      // Create main page with focus handling
      this.page = await context.newPage();
      
      // Ensure window has focus and visibility
      await this.page.evaluate(() => {
        return new Promise<void>((resolve) => {
          // Store original focus method
          const originalHasFocus = document.hasFocus.bind(document);
          
          // Override focus methods
          Object.defineProperty(document, 'hasFocus', {
            value: () => true,
            configurable: true
          });
          
          Object.defineProperty(window, 'focus', {
            value: () => {
              if (!originalHasFocus()) {
                window.dispatchEvent(new Event('focus'));
              }
            },
            configurable: true
          });
          
          // Ensure focus is maintained
          const focusInterval = setInterval(() => {
            if (!originalHasFocus()) {
              window.dispatchEvent(new Event('focus'));
            }
          }, 1000);
          
          // Clean up interval if page is closed
          window.addEventListener('unload', () => {
            clearInterval(focusInterval);
          });
          
          resolve();
        });
      });
      
      // Bring window to front
      await this.page.bringToFront();
      logger.debug('Created new browser page');

      this.setupPageListeners(sessionId);

      // Generate initial state hashes
      const { domHash, visualHash } = await this.generateStateHashes(this.page);

      // Store new session state
      BrowserAutomation.activeSessions.set(sessionId, {
        instance: this.browser,
        context,
        page: this.page,
        lastAction: null,
        actionChain: [],
        domHash,
        visualHash,
        timestamp: Date.now()
      });
    } catch (error) {
      const errorMessage = `Failed to initialize browser: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined);
      throw new Error(errorMessage);
    }
  }

  private setupPageListeners(sessionId: string): void {
    if (!this.page) return;

    // Set default timeout
    this.page.setDefaultTimeout(15000);
    
    // Listen for console messages
    this.page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      logger.debug(`Browser console [${type}]:`, text);
      eventStore.addEvent(sessionId, {
        type: 'SUCCESS',
        data: { console: { type, text } }
      });
    });

    // Listen for errors
    this.page.on('pageerror', error => {
      logger.error('Browser page error:', error);
      eventStore.addEvent(sessionId, {
        type: 'ERROR',
        error: error.toString()
      });
    });
  }

  private async cleanup(sessionId: string): Promise<void> {
    try {
      eventStore.addEvent(sessionId, {
        type: 'CLEANUP',
        data: { keepOpen: this.keepOpen }
      });

      // Get the session state
      const sessionState = BrowserAutomation.activeSessions.get(sessionId);
      
      // Only cleanup if keepOpen is false
      if (!this.keepOpen) {
        if (sessionState) {
          logger.debug('Cleaning up browser instance');
          await sessionState.instance.close();
          BrowserAutomation.activeSessions.delete(sessionId);
        }
        this.browser = null;
        this.page = null;
      } else {
        // Update session timestamp to prevent timeout
        if (sessionState) {
          sessionState.timestamp = Date.now();
          BrowserAutomation.activeSessions.set(sessionId, sessionState);
        }
        logger.debug('Skipping cleanup due to keepOpen flag');
      }
    } catch (error) {
      logger.error('Error during browser cleanup:', error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  public async execute(sessionId: string, params: BrowserAutomationParams | { actions: BrowserAutomationParams[] }): Promise<AutomationResult> {
    logger.info('Executing browser automation', params);
    eventStore.createSession(sessionId);
    
    const executeTask = async (): Promise<AutomationResult> => {
      try {
        // Handle array of actions
        if ('actions' in params) {
          const results: AutomationResult[] = [];
          const isLastActionVisible = params.actions[params.actions.length - 1].visible === true;
          
          // Set keepOpen true for the entire chain if the last action is visible
          this.keepOpen = isLastActionVisible;
          
          // Initialize browser for the chain
          await this.initBrowser(sessionId);
          
          if (!this.page) {
            throw new Error('Failed to initialize browser page');
          }
          
          // Get current session state
          const sessionState = BrowserAutomation.activeSessions.get(sessionId);
          if (!sessionState) {
            throw new Error('Session state not found');
          }
          
          for (let i = 0; i < params.actions.length; i++) {
            const action = params.actions[i];
            const isLastAction = i === params.actions.length - 1;
            
            // Execute action with state validation
            const result = await this.executeSingleAction(sessionId, action, !isLastAction || isLastActionVisible);
            results.push(result);
            
            if (!result.success) {
              if (!this.keepOpen) {
                await this.cleanup(sessionId);
              }
              return result;
            }
            
            // Update session state after successful action
            const { domHash, visualHash } = await this.generateStateHashes(this.page);
            const updatedState: BrowserState = {
              ...sessionState,
              lastAction: action.action,
              actionChain: [...sessionState.actionChain, action],
              domHash,
              visualHash,
              timestamp: Date.now()
            };
            
            // Validate temporal consistency
            await this.validateTemporalConsistency(updatedState, sessionState);
            
            // Update session state
            BrowserAutomation.activeSessions.set(sessionId, updatedState);
          }
          
          if (!this.keepOpen) {
            await this.cleanup(sessionId);
          }
          
          return {
            success: true,
            message: results.map(r => r.message).join(' | ')
          };
        }
        
        // Handle single action
        this.keepOpen = params.visible === true;
        await this.initBrowser(sessionId);
        
        if (!this.page) {
          throw new Error('Failed to initialize browser page');
        }
        
        const result = await this.executeSingleAction(sessionId, params, false);
        
        if (!this.keepOpen) {
          await this.cleanup(sessionId);
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        eventStore.addEvent(sessionId, {
          type: 'ERROR',
          error: errorMessage
        });
        logger.error('Browser automation error:', error instanceof Error ? error : new Error(errorMessage));
        
        // Cleanup on error only if we're not in persistent mode
        if (!this.keepOpen) {
          await this.cleanup(sessionId);
        }
        
        return {
          success: false,
          message: 'Browser automation failed',
          error: errorMessage
        };
      }
    };

    return this.quantumExecute(sessionId, executeTask);
  }

  private async verifyVisualState(sessionId: string, action: string): Promise<void> {
    if (!this.page) return;

    try {
      // Take a screenshot after action
      const screenshot = await this.page.screenshot({
        type: 'png',
        fullPage: true,
        animations: 'disabled'
      });

      // Get current session state
      const sessionState = BrowserAutomation.activeSessions.get(sessionId);
      if (!sessionState) {
        throw new Error('Session state not found');
      }

      // Wait for network idle and animations
      await Promise.all([
        this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}),
        this.page.waitForTimeout(500)
      ]);

      // Ensure viewport is stable
      await this.page.evaluate(() => {
        return new Promise(resolve => {
          let lastHeight = document.documentElement.offsetHeight;
          const checkHeight = () => {
            const currentHeight = document.documentElement.offsetHeight;
            if (currentHeight === lastHeight) {
              resolve(true);
            } else {
              lastHeight = currentHeight;
              setTimeout(checkHeight, 100);
            }
          };
          setTimeout(checkHeight, 100);
        });
      });

      // Add screenshot and state info to event store for debugging
      eventStore.addEvent(sessionId, {
        type: 'VISUAL_VERIFICATION',
        data: {
          action,
          screenshot: screenshot.toString('base64'),
          timestamp: Date.now(),
          url: await this.page.url(),
          title: await this.page.title(),
          viewport: await this.page.viewportSize(),
          lastAction: sessionState.lastAction,
          actionChainLength: sessionState.actionChain.length,
          // Add DOM state verification
          domSnapshot: {
            bodyClasses: await this.page.evaluate(() => document.body.className),
            visibleElements: await this.page.evaluate(() => {
              const elements = document.querySelectorAll('*');
              return Array.from(elements)
                .filter(el => {
                  const style = window.getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         rect.width > 0 && 
                         rect.height > 0;
                })
                .length;
            })
          }
        }
      });
    } catch (error) {
      logger.warn('Visual verification failed:', error);
    }
  }

  private async executeSingleAction(sessionId: string, params: BrowserAutomationParams, isPartOfChain: boolean = false): Promise<AutomationResult> {
    try {
      // Validate required parameters
      this.validateParams(params);

      // Get current session state for validation
      const sessionState = BrowserAutomation.activeSessions.get(sessionId);
      if (!sessionState) {
        throw new Error('Session state not found');
      }

      switch (params.action) {
        case 'navigate':
          if (!params.url) {
            throw new Error('URL is required for navigate action');
          }
          eventStore.addEvent(sessionId, {
            type: 'NAVIGATE',
            data: { url: params.url }
          });
          logger.debug(`Navigating to URL: ${params.url}`);
          if (!this.page) {
            throw new Error('Browser page not initialized');
          }
          await this.page.goto(params.url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          await this.verifyVisualState(sessionId, 'navigate');
          eventStore.addEvent(sessionId, {
            type: 'SUCCESS',
            data: { action: 'navigate', url: params.url }
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
          eventStore.addEvent(sessionId, {
            type: 'CLICK',
            data: { selector: params.selector }
          });
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
          await this.verifyVisualState(sessionId, 'click');
          
          eventStore.addEvent(sessionId, {
            type: 'SUCCESS',
            data: { action: 'click', selector: params.selector }
          });
          logger.info(`Successfully clicked element: ${params.selector}`);
          return {
            success: true,
            message: `Successfully clicked element with selector: ${params.selector}`
          };

        case 'type':
          if (!params.selector || !params.value) {
            throw new Error('Selector and value are required for type action');
          }
          eventStore.addEvent(sessionId, {
            type: 'TYPE',
            data: { selector: params.selector, value: params.value }
          });
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
          await this.verifyVisualState(sessionId, 'type');
          
          // Optional: Press Enter if it's a search input
          if (params.selector.includes('search') || params.value.toLowerCase().includes('search')) {
            logger.debug('Search input detected, pressing Enter');
            if (!this.page) {
              throw new Error('Browser page not initialized');
            }
            await this.page.keyboard.press('Enter');
            // Wait for navigation if needed
            await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
              logger.debug('No navigation occurred after pressing Enter');
            });
          }
          
          eventStore.addEvent(sessionId, {
            type: 'SUCCESS',
            data: { action: 'type', selector: params.selector }
          });
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
      const errorDetails = {
        action: params.action,
        url: params.url,
        selector: params.selector,
        isPartOfChain,
        sessionId,
        pageUrl: this.page ? await Promise.resolve(this.page.url()).catch(() => 'unknown') : 'no page',
        pageTitle: this.page ? await Promise.resolve(this.page.title()).catch(() => 'unknown') : 'no page',
        timestamp: new Date().toISOString()
      };
      
      eventStore.addEvent(sessionId, {
        type: 'ERROR',
        error: errorMessage,
        data: errorDetails
      });
      
      logger.error(
        'Browser automation action failed',
        error instanceof Error ? error : new Error(errorMessage),
        errorDetails
      );
      
      return {
        success: false,
        message: 'Browser automation failed',
        error: errorMessage
      };
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
          params.url = "https://" + params.url;
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
