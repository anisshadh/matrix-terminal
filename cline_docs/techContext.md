# Technical Context

## Development Environment
- Next.js 14+ with App Router
- TypeScript for type safety
- Node.js runtime environment
- VSCode as primary IDE

## Core Technologies

### Frontend
1. Framework & Language
   - Next.js with TypeScript
   - React 18+ with hooks
   - ES6+ JavaScript features

2. Styling & UI
   - Tailwind CSS for styling
   - shadcn/ui component library
   - Custom Matrix theme effects
   - GeistMono and Geist fonts

3. Build Tools
   - PostCSS for CSS processing
   - ESLint for code quality
   - TypeScript compiler

### Backend
1. API Integration
   - Next.js API routes
   - Groq API integration
     - LLaMA 3.3 70B model
     - Enhanced streaming response system
       - Buffer management
       - State reconciliation
       - Cleanup handlers
     - Comprehensive error handling
       - Visual error states
       - Type-safe error processing
       - Recovery mechanisms
     - Message state management
       - Real-time updates
       - State consistency
   - Simple AI platform integration

2. Browser Automation
   - Playwright MCP server
   - Chromium browser support
   - Custom error retry system

## Project Structure
```
/
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   │   └── chat/      # Chat endpoint
│   ├── fonts/          # Custom fonts
│   └── globals.css     # Global styles
├── components/         # React components
│   └── ui/            # UI components
├── lib/               # Utility functions
├── docs/              # Documentation
└── cline_docs/        # Memory Bank
```

## Dependencies
1. Production Dependencies
   - next
   - react
   - react-dom
   - tailwindcss
   - typescript
   - shadcn/ui components
   - Simple AI components
   - openai (for Groq API)

2. Development Dependencies
   - eslint
   - postcss
   - typescript compiler
   - tailwind plugins

## Technical Constraints
1. Browser Support
   - Modern browsers only
   - Chromium-based browsers for automation

2. Performance Requirements
   - Smooth animations (60fps target)
   - Responsive UI interactions
   - Efficient state management
   - Low-latency streaming responses
   - Memory-efficient stream processing
   - Optimized message reconciliation

3. Security Considerations
   - API key management
   - Safe browser automation
   - Input validation
   - CORS configuration
   - Error message sanitization
   - State management security

## Development Workflow
1. Local Development
   - `npm run dev` for development server
   - Hot module replacement enabled
   - TypeScript type checking
   - Environment variables required:
     - GROQ_API_KEY

2. Build Process
   - TypeScript compilation
   - CSS processing
   - Code optimization

3. Deployment
   - Production build generation
   - Static asset optimization
   - Environment configuration
