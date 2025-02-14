import { rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanupTests() {
  const projectRoot = join(__dirname, '..');
  const testFiles = [
    'test-failure.png',
    'automation-error.png',
    'playwright-report',
    'test-results',
    'tests/e2e/advanced-automation.test.ts'
  ];

  for (const file of testFiles) {
    try {
      const filePath = join(projectRoot, file);
      await rm(filePath, { recursive: true, force: true });
      console.log(`Cleaned up: ${file}`);
    } catch (error) {
      console.error(`Error cleaning up ${file}:`, error);
    }
  }
}

// Self-executing async function to run cleanup
(async () => {
  try {
    await cleanupTests();
    console.log('Test cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
})();
