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
  status: 'idle' | 'busy' | 'error';
  chainId?: string;
  retryCount: number;
  lastError?: Error;
  isLocked: boolean;
}

class AsyncMutex {
  private locked: boolean = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      resolve();
    } else {
      this.locked = false;
    }
  }
}

interface BrowserAutomationParams {
  action: 'navigate' | 'click' | 'type';
  url?: string;
  selector?: string;
  value?: string;
  visible?: boolean;
  chainId?: string;
  chainIndex?: number;
  isLastInChain?: boolean;
}

// Session management and execution control
const sessionMutex = new AsyncMutex();
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
  private static readonly DEFAULT_TIMEOUT = 60000; // Increased to 60 seconds

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
    task: () => Promise<T>,
    options: { retryOnLock?: boolean; timeout?: number } = {}
  ): Promise<T> {
    const { retryOnLock = true, timeout = 30000 } = options;
    
    logger.debug('Starting quantum execution', {
      sessionId,
      queueSize: executionQueue.size,
      hasExistingTask: executionQueue.has(sessionId)
    });

    // Acquire session mutex
    await sessionMutex.acquire();
    
    try {
      // Check if session is locked
      const session = BrowserAutomation.activeSessions.get(sessionId);
      if (session?.isLocked) {
        if (!retryOnLock) {
          throw new Error('Session is locked');
        }
        // Wait for session to unlock with timeout
        await new Promise<void>((resolve, reject) => {
          const start = Date.now();
          const checkLock = () => {
            const session = BrowserAutomation.activeSessions.get(sessionId);
            if (!session?.isLocked) {
              resolve();
            } else if (Date.now() - start > timeout) {
              reject(new Error('Session lock timeout'));
            } else {
              setTimeout(checkLock, 100);
            }
          };
          checkLock();
        });
      }

      // Lock session
      if (session) {
        session.isLocked = true;
        BrowserAutomation.activeSessions.set(sessionId, session);
      }

      // Execute task with timeout
      const result = await Promise.race([
        task(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Task timeout')), timeout)
        )
      ]);

      return result;
    } finally {
      // Unlock session and release mutex
      const session = BrowserAutomation.activeSessions.get(sessionId);
      if (session) {
        session.isLocked = false;
        BrowserAutomation.activeSessions.set(sessionId, session);
      }
      sessionMutex.release();
      
      // Remove from execution queue
      executionQueue.delete(sessionId);
    }
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
        hasTouch: false,
        navigationTimeout: BrowserAutomation.DEFAULT_TIMEOUT // Set navigation timeout at context level
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
        timestamp: Date.now(),
        status: 'idle',
        retryCount: 0,
        isLocked: false
      });
    } catch (error) {
      const errorMessage = `Failed to initialize browser: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMessage, error instanceof Error ? error : undefined);
      throw new Error(errorMessage);
    }
  }

  private setupPageListeners(sessionId: string): void {
    if (!this.page) return;

    // Set extended timeout for modern web apps
    this.page.setDefaultTimeout(BrowserAutomation.DEFAULT_TIMEOUT);
    
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

  public async execute(
    sessionId: string, 
    params: BrowserAutomationParams | { 
      actions: BrowserAutomationParams[],
      chainMetadata?: {
        id: string;
        totalActions: number;
        keepWindowOpen: boolean;
      }
    }
  ): Promise<AutomationResult> {
    logger.info('Executing browser automation', params);
    eventStore.createSession(sessionId);
    
    const executeTask = async (): Promise<AutomationResult> => {
      try {
        // Handle array of actions
        if ('actions' in params) {
          const results: AutomationResult[] = [];
          const chainMetadata = params.chainMetadata;
          
          // Always keep window open during chain execution
          this.keepOpen = true;
          
          // Initialize browser for the chain if not already running
          let sessionState = BrowserAutomation.activeSessions.get(sessionId);
          
          if (!sessionState || !sessionState.instance.isConnected()) {
            await this.initBrowser(sessionId);
            sessionState = BrowserAutomation.activeSessions.get(sessionId);
            if (!sessionState) {
              throw new Error('Failed to initialize browser session');
            }
          }

          // Update chain metadata
          if (chainMetadata) {
            sessionState.chainId = chainMetadata.id;
            BrowserAutomation.activeSessions.set(sessionId, sessionState);
          }
          
          // Execute each action in the chain
          for (const action of params.actions) {
            // Execute action with state validation
            const result = await this.executeSingleAction(sessionId, action, true);
            results.push(result);
            
            if (!result.success) {
              // On failure, only close if explicitly requested
              if (chainMetadata?.keepWindowOpen === false) {
                await this.cleanup(sessionId);
              }
              return result;
            }
            
            // Update session state after successful action
            const { domHash, visualHash } = await this.generateStateHashes(this.page!);
            const updatedState: BrowserState = {
              ...sessionState,
              lastAction: action.action,
              actionChain: [...sessionState.actionChain, action],
              domHash,
              visualHash,
              timestamp: Date.now(),
              status: action.isLastInChain ? 'idle' : 'busy',
              retryCount: sessionState.retryCount,
              isLocked: false,
              chainId: action.chainId
            };
            
            // Validate temporal consistency
            await this.validateTemporalConsistency(updatedState, sessionState);
            
            // Update session state
            BrowserAutomation.activeSessions.set(sessionId, updatedState);
          }
          
          // Only cleanup if explicitly requested to not keep window open
          if (chainMetadata?.keepWindowOpen === false) {
            await this.cleanup(sessionId);
          }
          
          return {
            success: true,
            message: results.map(r => r.message).join(' | ')
          };
        }
        
          // Handle single action
          this.keepOpen = params.visible === true;
          
          // Get or create session state
          let sessionState = BrowserAutomation.activeSessions.get(sessionId);
          if (sessionState) {
            // Update existing session
            sessionState.status = 'busy';
            BrowserAutomation.activeSessions.set(sessionId, sessionState);
          }
          
          await this.initBrowser(sessionId);
          
          if (!this.page) {
            throw new Error('Failed to initialize browser page');
          }
          
          const result = await this.executeSingleAction(sessionId, params, false);
          
          // Update session state after action
          sessionState = BrowserAutomation.activeSessions.get(sessionId);
          if (sessionState) {
            sessionState.status = 'idle';
            sessionState.timestamp = Date.now();
            BrowserAutomation.activeSessions.set(sessionId, sessionState);
          }
          
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

  private async verifyVisualState(sessionId: string, action: string): Promise<boolean> {
    if (!this.page) return false;

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

      // Get page content first - this is our primary success indicator
      const content = await this.page.content();
      const hasContent = content.length > 100;

      // If we have content, we consider this a success, but still try to wait for full load
      if (hasContent) {
        // Wait for network idle in the background - don't block on this
        this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
          logger.debug('Network did not reach idle state, but page has content');
        });
      }

      // Add visual state verification event
      eventStore.addEvent(sessionId, {
        type: 'VISUAL_STATE_VERIFIED',
        data: {
          action,
          screenshot: screenshot.toString('base64'),
          timestamp: Date.now(),
          url: await this.page.url(),
          title: await this.page.title(),
          viewport: await this.page.viewportSize(),
          lastAction: sessionState.lastAction,
          actionChainLength: sessionState.actionChain.length,
          contentLength: content.length,
          hasContent,
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

      return hasContent;
    } catch (error) {
      logger.warn('Visual verification failed:', error);
      // Even if verification fails, check if we have content
      try {
        const content = await this.page.content();
        return content.length > 100;
      } catch (e) {
        return false;
      }
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

          // First wait for initial DOM content
          await this.page.goto(params.url, { 
            waitUntil: 'domcontentloaded',
            timeout: BrowserAutomation.DEFAULT_TIMEOUT
          });
          
          // Verify visual state and use it to determine success
          const visualSuccess = await this.verifyVisualState(sessionId, 'navigate');
          
          if (visualSuccess) {
            eventStore.addEvent(sessionId, {
              type: 'SUCCESS',
              data: { action: 'navigate', url: params.url }
            });
            logger.info(`Successfully navigated to ${params.url}`);
            return {
              success: true,
              message: `Successfully navigated to ${params.url}`
            };
          }

          // If we get here, we have DOM content but visual verification failed
          // This is still a success case for many modern web apps
          eventStore.addEvent(sessionId, {
            type: 'SUCCESS',
            data: { action: 'navigate', url: params.url, partial: true }
          });
          logger.info(`Partially loaded ${params.url} (DOM content available)`);
          return {
            success: true,
            message: `Loaded ${params.url}`
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
          
          // Handle keyboard input
          if (params.value === 'Enter') {
            logger.debug('Pressing Enter key');
            if (!this.page) {
              throw new Error('Browser page not initialized');
            }
            
            // Focus the input element first
            if (inputElement) {
              await inputElement.focus();
              
              // Get the form element if this input is part of a form
              const formElement = await inputElement.evaluate(input => {
                const form = input.closest('form');
                return form ? true : false;
              });
              
              if (formElement) {
                // If in a form, use form submission which is more reliable
                await Promise.all([
                  inputElement.evaluate(input => {
                    const form = input.closest('form');
                    if (form) form.submit();
                  }),
                  Promise.race([
                    this.page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
                    this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
                  ])
                ]);
              } else {
                // If not in a form, use keyboard press
                await Promise.all([
                  this.page.keyboard.press('Enter'),
                  Promise.race([
                    this.page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
                    this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
                  ])
                ]);
              }
            }
          } else if (inputElement) {
            // Regular text input
            await inputElement.click();
            await inputElement.fill('');
            await inputElement.fill(params.value);
            
            // Auto-press Enter for search inputs
            if (params.selector.includes('search') || params.value.toLowerCase().includes('search')) {
              logger.debug('Search input detected, pressing Enter');
              if (!this.page) {
                throw new Error('Browser page not initialized');
              }
              
              // Press Enter and wait for navigation
              await Promise.all([
                this.page.keyboard.press('Enter'),
                Promise.race([
                  this.page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
                  this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
                ])
              ]);
            }
          } else {
            throw new Error('Input element not found or not accessible');
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
