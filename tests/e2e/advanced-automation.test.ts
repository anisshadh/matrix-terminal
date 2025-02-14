import { test, expect, Page } from '@playwright/test';
import { BrowserAutomation } from '../../lib/browserAutomation';

test.describe('Advanced Browser Automation', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test('should perform chained browser actions with feedback', async () => {
    console.log('Starting advanced browser automation test...');

    try {
      // Step 1: Navigate to Playwright docs
      console.log('Step 1: Navigating to Playwright docs...');
      await page.goto('https://playwright.dev');
      await page.waitForLoadState('networkidle');
      console.log('Step 1 Complete: Successfully navigated to Playwright docs');

      // Debug: Log all button elements
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');
        const className = await button.getAttribute('class');
        console.log('Found button:', { text, ariaLabel, className });
      }

      // Step 2: Click the search button (using a more general selector)
      console.log('Step 2: Opening search...');
      const searchButton = await page.getByRole('button', { name: /search/i });
      await searchButton.waitFor({ state: 'visible', timeout: 10000 });
      await searchButton.click();
      console.log('Step 2 Complete: Search opened');

      // Step 3: Type search query and wait for results
      console.log('Step 3: Typing search query...');
      const searchInput = await page.getByPlaceholder(/search/i);
      await searchInput.waitFor({ state: 'visible', timeout: 5000 });
      await searchInput.fill('test automation');
      
      // Debug: Log the search input state
      const inputValue = await searchInput.inputValue();
      console.log('Search input value:', inputValue);

      // Wait for search results to appear (using a more specific selector)
      console.log('Waiting for search results...');
      await page.waitForSelector('#docsearch-list[role="listbox"]', { 
        state: 'visible',
        timeout: 10000 
      });
      console.log('Step 3 Complete: Search query typed and results loaded');

      // Step 4: Click first search result
      console.log('Step 4: Clicking first search result...');
      const firstResult = await page.locator('#docsearch-list[role="listbox"] [role="option"]').first();
      
      // Debug: Log available results
      const results = await page.locator('#docsearch-list[role="listbox"] [role="option"]').all();
      console.log(`Found ${results.length} search results`);
      for (const result of results) {
        const text = await result.textContent();
        console.log('Result:', text);
      }

      const resultText = await firstResult.textContent();
      console.log('Selected result:', resultText);
      await firstResult.click();
      await page.waitForLoadState('networkidle');
      console.log('Step 4 Complete: Clicked first search result');

      // Verify we're on a new page
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);
      expect(currentUrl).not.toBe('https://playwright.dev');

      console.log('Advanced browser automation test completed successfully!');
    } catch (error) {
      console.error('Test failed with error:', error);
      // Take a screenshot on failure
      await page.screenshot({ path: 'test-failure.png', fullPage: true });
      throw error;
    }
  });

  test.afterEach(async () => {
    await page.close();
  });
});

// Test the chat interface integration with browser automation
test.describe('Chat Interface with Browser Automation', () => {
  test('should handle chat commands and trigger browser actions', async () => {
    console.log('Starting chat interface test...');

    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'go to playwright.dev' },
      { role: 'user', content: 'click the search button' },
      { role: 'user', content: 'search for test automation' }
    ];

    for (const message of messages) {
      console.log(`\nExecuting command: "${message.content}"`);
      
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: messages.slice(0, messages.indexOf(message) + 1) 
        })
      });

      expect(response.ok).toBe(true);
      console.log(`Chat command executed: "${message.content}"`);

      // For SSE responses, we need to read the stream
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(5);
                if (data === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.error) {
                    console.error('Error in response:', parsed.error);
                  } else {
                    console.log('Response:', parsed.content);
                  }
                } catch (e) {
                  // Ignore parse errors for non-JSON lines
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

      // Add a longer delay between messages to ensure completion
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('Chat interface test completed successfully!');
  });
});

// Cleanup after all tests
test.afterAll(async () => {
  console.log('Cleaning up test files...');
  // The test runner will handle browser cleanup
  // The test files will be deleted by our cleanup script
});
