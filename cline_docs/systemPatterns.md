# System Patterns and Architecture

## Command Processing Pipeline

### 1. Input Processing
- Normalize input text
- Check for negative keywords
- Split into separate commands
- Extract URLs and patterns

### 2. Command Recognition
```typescript
// Explicit command triggers
const COMMAND_TRIGGERS = {
  navigation: ['go to', 'navigate to', 'open', 'visit'],
  click: ['click on', 'click the', 'press on', 'select the'],
  search: ['search for', 'look up', 'find'],
  type: ['type', 'enter', 'input']
};

// Exact word matching for websites
const websiteShortcuts = {
  'google': 'https://www.google.com',
  'youtube': 'https://www.youtube.com',
  // ...
};
```

### 3. Confidence Calculation
- Base score from command matches (0.4 per match)
- Context boost (+0.3)
- Explicit command boost (+0.3)
- Minimum threshold of 0.6 required

### 4. Action Generation
- Navigation actions require explicit commands
- Search actions include automatic Google navigation
- Click actions use smart selector generation
- Type actions maintain context awareness

### 5. Validation
- Schema validation using Zod
- Confidence threshold checks
- Context verification
- Action chain validation

## Core Design Patterns

### 1. Command Pattern
- SmartCommandParser acts as command invoker
- Each action type (navigate, click, type) is a command
- Commands are validated before execution
- Chain of command for multi-step actions

### 2. Strategy Pattern
- Different strategies for different command types
- Flexible selector generation strategy
- Confidence calculation strategy
- URL matching strategy

### 3. Chain of Responsibility
- Command processing pipeline
- Multiple validation layers
- Error handling chain
- Event propagation

### 4. Factory Pattern
- Action object creation
- Selector generation
- URL construction
- Command chain building

## Error Handling

### 1. Validation Errors
- Schema validation
- Command validation
- Context validation
- Chain validation

### 2. Runtime Errors
- Navigation failures
- Command parsing errors
- Action execution errors
- State management errors

### 3. Recovery Strategies
- Graceful degradation
- Fallback mechanisms
- Error reporting
- State recovery

## State Management

### 1. Command State
- Input validation state
- Command parsing state
- Action generation state
- Execution state

### 2. Browser State
- Navigation state
- Page state
- Element state
- Action state

### 3. System State
- Parser state
- Validation state
- Execution state
- Recovery state

## Best Practices

### 1. Command Processing
- Always validate input
- Check for explicit commands
- Verify context
- Maintain confidence thresholds

### 2. Action Generation
- Generate complete actions
- Include all required parameters
- Validate before execution
- Maintain action chain integrity

### 3. Error Handling
- Catch all errors
- Provide meaningful messages
- Implement recovery strategies
- Maintain system stability

### 4. State Management
- Track all state changes
- Validate state transitions
- Recover from invalid states
- Maintain consistency

## Future Considerations

### 1. Extensibility
- New command types
- Additional triggers
- Enhanced validation
- Improved confidence calculation

### 2. Performance
- Command caching
- State optimization
- Validation optimization
- Action chain optimization

### 3. Reliability
- Enhanced error recovery
- Better state management
- Improved validation
- Stronger consistency checks

### 4. User Experience
- Better command recognition
- Improved error messages
- Enhanced feedback
- Smarter suggestions
