# System Architecture

## Component Communication Flow
```mermaid
graph TD
    A[User Interface] --> B[AI Processor]
    B --> C[Browser Controller]
    C --> D[Playwright MCP]
    D --> E[Browser Actions]
    E --> F[Result Handler]
    F --> A
```

## Message Processing Flow
```mermaid
sequenceDiagram
    User->>Interface: Send Message
    Interface->>AI: Process Input
    AI->>MCP: Detect Browser Action
    MCP->>Browser: Execute Command
    Browser->>MCP: Return Result
    MCP->>Interface: Display Output
    Interface->>User: Show Response
```

## Error Handling Flow
```mermaid
sequenceDiagram
    Browser->>MCP: Action Fails
    MCP->>Handler: Trigger Retry
    Handler->>Browser: Retry Action
    Browser->>MCP: Return Status
    MCP->>Interface: Show Result/Error
```

## Component Integration
```mermaid
graph LR
    A[Next.js App] --> B[Simple AI]
    A --> C[shadcn/ui]
    A --> D[Tailwind]
    A --> E[Playwright MCP]
    E --> F[Browser]