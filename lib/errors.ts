export class ChatError extends Error {
  messageId?: string;
  details?: any;

  constructor(message: string, messageId?: string, details?: any) {
    super(message);
    this.name = 'ChatError';
    this.messageId = messageId;
    this.details = details;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ChatError.prototype);
  }
}

export class ValidationError extends ChatError {
  constructor(message: string, messageId?: string, details?: any) {
    super(message, messageId, details);
    this.name = 'ValidationError';
  }
}

export class AutomationError extends ChatError {
  constructor(message: string, messageId?: string, details?: any) {
    super(message, messageId, details);
    this.name = 'AutomationError';
  }
}

export class StreamError extends ChatError {
  constructor(message: string, messageId?: string, details?: any) {
    super(message, messageId, details);
    this.name = 'StreamError';
  }
}
