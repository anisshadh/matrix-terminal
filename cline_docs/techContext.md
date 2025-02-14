# Technical Context

## Technology Stack

### Core Technologies
- Next.js 14 (React Framework)
- TypeScript
- Playwright (Browser Automation)
- OpenAI API Integration

### Development Tools
- Node.js
- npm (with legacy peer dependencies)
- VSCode

## Implementation Details

### Browser Automation
The system uses Playwright's Chromium implementation with advanced state management and visibility control:

#### Core Features
- Quantum-safe execution queue
- Visual state verification system
- Focus management and event dispatching
- Temporal consistency validation
- DOM state snapshots with element tracking
- Comprehensive debugging capabilities

#### Browser Management
```typescript
class BrowserAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private keepOpen: boolean = false;
  private currentSessionId: string | null = null;
  private static activeSessions = new Map<string, BrowserState>();
  private static readonly INACTIVITY_TIMEOUT = 30000;
}

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
```

Key implementation aspects:
- Quantum-safe execution pattern for thread safety
- Visual state management with temporal consistency
- Focus maintenance with event dispatching
- DOM state tracking and verification
- Resource cleanup with session management
- Error recovery with visual state capture

### API Integration
- OpenAI API for command interpretation
- Streaming responses for real-time feedback
- Error handling with detailed logging

## Configuration

### Browser Settings
- Viewport: 1920x1080 (Full HD)
- Default timeout: 15000ms
- Headless mode: Always false for reliability
- Focus maintenance: Active with event dispatching
- Window state: Maximized with proper focus
- Sandbox settings: Configured for security
- Browser args:
  ```typescript
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--start-maximized',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ]
  ```

### Development Setup
- Use `npm install --legacy-peer-deps` for package installation
- Environment variables required:
  - GROQ_API_KEY for AI integration
  - Other configuration in .env.local (protected)

## Technical Constraints
- Visual state verification requires proper timing
- Focus management needs event synchronization
- DOM state tracking requires efficient hashing
- Temporal consistency checks must be reliable
- Resource cleanup needs proper session tracking
- Performance impact of visual verification
- Memory management in persistent sessions
- Thread safety in quantum execution

## Debugging
- Visual state capture and verification
- DOM state snapshots with element counts
- Focus state monitoring and validation
- Temporal consistency checking
- Comprehensive logging system
- Browser console monitoring
- Error tracking with visual context
- Performance monitoring with state tracking
- Visual timeline capabilities

## Future Technical Considerations
- Visual diffing implementation
- Parallel action execution with state isolation
- Advanced focus management patterns
- Enhanced visual debugging tools
- State comparison capabilities
- Visual regression testing
- Performance optimization for visual verification
- Enhanced temporal consistency validation
- Resource optimization for persistent sessions
