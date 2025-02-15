# Technical Context

## Core Technologies

### TypeScript/JavaScript
- TypeScript for type safety and better developer experience
- ES6+ features for modern JavaScript functionality
- Strict type checking enabled

### API Integration
- OpenRouter AI for language model
- OpenAI-compatible API
- Streaming support
- Function calling capabilities

### Browser Automation
- Playwright for browser control
- Puppeteer-compatible API
- Headless/headful mode support

### Command Processing
```typescript
// Command trigger system
const COMMAND_TRIGGERS = {
  navigation: ['go to', 'navigate to', 'open', 'visit'],
  click: ['click on', 'click the', 'press on', 'select the'],
  search: ['search for', 'look up', 'find'],
  type: ['type', 'enter', 'input']
} as const;
```

### Validation
- Zod for runtime type checking
- Schema validation for commands
- Input validation for user commands
- State validation for browser actions

## Architecture

### Command Parser
- Smart command recognition
- Confidence calculation
- Action generation
- Chain validation

### Browser Controller
- State management
- Action execution
- Error handling
- Recovery strategies

### Event System
- Event propagation
- State tracking
- Error reporting
- Recovery management

## Development Setup

### Required Tools
- Node.js 18+
- TypeScript 5+
- Playwright
- Zod

### Environment Variables
- OPENROUTER_API_KEY for API access
- SITE_URL for OpenRouter configuration
- Other configuration in .env.local

### Development Commands
```bash
npm run dev     # Start development server
npm run build   # Build production version
npm run test    # Run test suite
```

## Key Components

### SmartCommandParser
- Natural language processing
- Command recognition
- Action generation
- Validation

### BrowserAutomation
- Browser control
- State management
- Action execution
- Error handling

### EventStore
- Event tracking
- State management
- Error reporting
- Recovery

## Technical Constraints

### Browser Automation
- Must handle navigation failures
- Must validate all actions
- Must maintain state consistency
- Must recover from errors

### Command Processing
- Must validate all input
- Must check for explicit commands
- Must maintain confidence thresholds
- Must handle action chains

### State Management
- Must track all state changes
- Must validate transitions
- Must handle recovery
- Must maintain consistency

## Recent Updates

### API Integration
- Switched to OpenRouter AI
- Enhanced streaming reliability
- Improved error handling
- Added required headers

### Command Processing
- Added explicit command triggers
- Enhanced confidence calculation
- Improved validation
- Better error messages

### Event System
- Better event tracking
- Enhanced state management
- Improved error reporting
- Better recovery strategies

## Future Considerations

### Technical Debt
- None currently after API migration
- System is clean and maintainable
- Well-documented patterns
- Strong type safety

### Potential Improvements
- Command caching
- Performance optimization
- Enhanced validation
- Better error messages

### Scalability
- System can handle increased load
- Well-structured for extensions
- Clean architecture
- Strong patterns

### Maintenance
- Regular updates needed
- Monitor for edge cases
- Track performance
- Update documentation
