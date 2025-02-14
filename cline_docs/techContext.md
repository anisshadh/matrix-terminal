# Technical Context

## Technology Stack

### Core Technologies
- Next.js 14 (React Framework)
- TypeScript
- Playwright (Browser Automation)
- OpenAI API Integration
- ES Modules Support

### Development Tools
- Node.js
- npm (with legacy peer dependencies)
- VSCode
- ES Module Loaders

## Implementation Details

### Command Parsing System
The system uses a sophisticated natural language parsing system with confidence scoring:

#### Core Features
- Action-specific keyword sets with weighted scoring
- Negative keyword filtering
- Confidence scoring system
- Question pattern detection
- Enhanced contextual analysis
- Website shortcut resolution
- Chain parsing with confidence validation

#### Confidence Scoring Implementation
```typescript
interface ConfidenceFactors {
  primaryKeywords: number;    // 0.4 per match
  secondaryKeywords: number;  // 0.2 per match
  context: number;           // 0.3 for specific context
  length: number;            // 0.5 penalty for short inputs
}

// Minimum confidence threshold
const CONFIDENCE_THRESHOLD = 0.6;
```

### Browser Automation
The system uses Playwright's Chromium implementation with advanced state management and visibility control:

#### Core Features
- Quantum-safe execution queue
- Visual state verification system
- Focus management and event dispatching
- Temporal consistency validation
- DOM state snapshots with element tracking
- Comprehensive debugging capabilities
- ES modules compatibility
- Enhanced element property logging

#### Browser Management
```typescript
class BrowserAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private keepOpen: boolean = false;
  private currentSessionId: string | null = null;
  private static activeSessions = new Map<string, BrowserState>();
  private static readonly INACTIVITY_TIMEOUT = 300000; // 5 minutes
  private static readonly visualVerification = true;
  private static readonly elementPropertyLogging = true;
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
  elementProperties: Record<string, any>;
  visualVerification: {
    screenshot: string;
    timestamp: number;
    domSnapshot: {
      bodyClasses: string;
      visibleElements: number;
    };
  };
}
```

Key implementation aspects:
- Action-specific keyword sets for precise intent recognition
- Confidence scoring with contextual analysis
- Negative keyword filtering for false positives
- Question pattern detection for direct answers
- Quantum-safe execution pattern for thread safety
- Visual state management with temporal consistency
- Focus maintenance with event dispatching
- DOM state tracking and verification
- Resource cleanup with session management
- Error recovery with visual state capture
- ES modules compatibility
- Enhanced element property tracking
- Comprehensive visual verification

### API Integration
- OpenAI API for command interpretation
- Streaming responses for real-time feedback
- Error handling with detailed logging
- ES modules compatibility

## Configuration

### Command Parser Settings
```typescript
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

// Negative keywords
const negativeKeywords = [
  'are you', 'do you', 'can you', 'could you',
  'would you', 'should you', 'what is', 'how to',
  'why is', 'when is', 'where is', 'who is',
  'tell me', 'explain', 'help me'
];
```

### Browser Settings
- Viewport: 1920x1080 (Full HD)
- Default timeout: 15000ms
- Headless mode: Always false for reliability
- Focus maintenance: Active with event dispatching
- Window state: Maximized with proper focus
- Sandbox settings: Configured for security
- Visual verification: Enabled with element properties
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
- ES modules configuration:
  ```bash
  node --experimental-specifier-resolution=node --loader ts-node/esm
  ```
- Environment variables required:
  - GROQ_API_KEY for AI integration
  - Other configuration in .env.local (protected)

## Technical Constraints
- Command confidence scoring must be accurate
- Negative keyword filtering must prevent false positives
- Question detection must be reliable
- Visual state verification requires proper timing
- Focus management needs event synchronization
- DOM state tracking requires efficient hashing
- Temporal consistency checks must be reliable
- Resource cleanup needs proper session tracking
- Performance impact of visual verification
- Memory management in persistent sessions
- Thread safety in quantum execution
- ES modules compatibility requirements
- Element property tracking overhead

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
- Element property inspection
- Enhanced error context logging

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
- Advanced ES modules integration
- Enhanced element property analytics
- Real-time visual state monitoring
