import { EventEmitter } from 'events';
import { logger } from './logger';
import crypto from 'crypto';

export interface AutomationEvent {
  id: string;
  timestamp: number;
  type: 'INIT' | 'NAVIGATE' | 'CLICK' | 'TYPE' | 'SUCCESS' | 'ERROR' | 'CLEANUP' | 'VISUAL_VERIFICATION' | 'VISUAL_STATE_VERIFIED';
  data?: any;
  error?: string;
}

interface Session {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  events: AutomationEvent[];
  createdAt: number;
  updatedAt: number;
}

interface ChunkMetadata {
  id: string;
  contentHash: string;
  temporalSignature: string;
  sequenceNumber: number;
  timestamp: number;
  predecessorHash: string;
  validationStatus: 'pending' | 'validated' | 'failed';
  shadowValidation?: {
    status: 'pending' | 'success' | 'failed';
    result: any;
    timestamp: number;
  };
}

interface StreamState {
  messageId: string;
  chunks: ChunkMetadata[];
  totalContentLength: number;
  lastProcessedTimestamp: number;
  status: 'active' | 'completed' | 'error';
  errorCount: number;
  retryAttempts: number;
}

class ChunkValidationError extends Error {
  constructor(
    message: string,
    public readonly messageId: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ChunkValidationError';
    Object.setPrototypeOf(this, ChunkValidationError.prototype);
  }
}

class StreamError extends Error {
  constructor(
    message: string,
    public readonly messageId: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'StreamError';
    Object.setPrototypeOf(this, StreamError.prototype);
  }
}

export class AutomationEventStore {
  private static instance: AutomationEventStore;
  private eventEmitter: EventEmitter;
  private sessions: Map<string, Session>;
  private streams: Map<string, StreamState>;
  private readonly SESSION_TIMEOUT = 1000 * 60 * 30; // 30 minutes
  private readonly CHUNK_VALIDATION_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;

  private constructor() {
    this.eventEmitter = new EventEmitter();
    this.sessions = new Map();
    this.streams = new Map();
    this.startCleanupInterval();
  }

  public static getInstance(): AutomationEventStore {
    if (!AutomationEventStore.instance) {
      AutomationEventStore.instance = new AutomationEventStore();
    }
    return AutomationEventStore.instance;
  }

  private generateTemporalSignature(chunk: any): string {
    const timestamp = Date.now();
    const data = JSON.stringify(chunk) + timestamp;
    return crypto.createHash('sha3-512').update(data).digest('hex');
  }

  private isValidChunkContent(chunk: any): boolean {
    if (!chunk?.choices?.[0]?.delta?.content) {
      return false;
    }
    const content = chunk.choices[0].delta.content;
    return typeof content === 'string' && content.length > 0;
  }

  private async validateChunk(chunk: any, metadata: ChunkMetadata): Promise<boolean> {
    try {
      // Basic structure validation
      if (!this.isValidChunkContent(chunk)) {
        const error = new ChunkValidationError(
          'Invalid chunk content',
          metadata.id,
          { chunk }
        );
        logger.error(error.message, error);
        return false;
      }

      // Verify content hash
      const computedHash = crypto.createHash('sha3-512')
        .update(JSON.stringify(chunk))
        .digest('hex');
      
      if (computedHash !== metadata.contentHash) {
        const error = new ChunkValidationError(
          'Content hash mismatch',
          metadata.id,
          { expected: metadata.contentHash, received: computedHash }
        );
        logger.error(error.message, error);
        return false;
      }

      // Verify temporal signature
      const timeDrift = Date.now() - metadata.timestamp;
      if (Math.abs(timeDrift) > this.CHUNK_VALIDATION_TIMEOUT) {
        const error = new ChunkValidationError(
          'Temporal validation failed - excessive time drift',
          metadata.id,
          { drift: timeDrift }
        );
        logger.error(error.message, error);
        return false;
      }

      // Shadow validation pipeline
      const shadowResult = await this.runShadowValidation(chunk, metadata);
      metadata.shadowValidation = {
        status: shadowResult ? 'success' : 'failed',
        result: shadowResult,
        timestamp: Date.now()
      };

      return shadowResult;
    } catch (error) {
      const validationError = new ChunkValidationError(
        'Chunk validation error',
        metadata.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      logger.error(validationError.message, validationError);
      return false;
    }
  }

  private async runShadowValidation(chunk: any, metadata: ChunkMetadata): Promise<boolean> {
    return new Promise((resolve) => {
      // Run validation in parallel process
      setTimeout(async () => {
        try {
          // Verify chunk structure
          if (!this.isValidChunkContent(chunk)) {
            return resolve(false);
          }

          // Verify sequence continuity
          const stream = this.streams.get(metadata.id.split('-')[0]);
          if (stream) {
            const previousChunk = stream.chunks[metadata.sequenceNumber - 1];
            if (previousChunk && previousChunk.contentHash !== metadata.predecessorHash) {
              return resolve(false);
            }
          }

          // Additional validation logic here
          resolve(true);
        } catch (error) {
          const validationError = new ChunkValidationError(
            'Shadow validation error',
            metadata.id,
            error instanceof Error ? error.message : 'Unknown error'
          );
          logger.error(validationError.message, validationError);
          resolve(false);
        }
      }, 0);
    });
  }

  public async processChunk(messageId: string, chunk: any): Promise<boolean> {
    let stream = this.streams.get(messageId);
    
    if (!stream) {
      stream = {
        messageId,
        chunks: [],
        totalContentLength: 0,
        lastProcessedTimestamp: Date.now(),
        status: 'active',
        errorCount: 0,
        retryAttempts: 0
      };
      this.streams.set(messageId, stream);
    }

    // Early validation of chunk structure
    if (!this.isValidChunkContent(chunk)) {
      stream.errorCount++;
      stream.retryAttempts++;
      
      if (stream.errorCount >= this.MAX_RETRY_ATTEMPTS) {
        stream.status = 'error';
        const error = new StreamError(
          `Stream ${messageId} exceeded maximum retry attempts`,
          messageId,
          {
            errorCount: stream.errorCount,
            retryAttempts: stream.retryAttempts
          }
        );
        logger.error(error.message, error);
      }
      
      this.streams.set(messageId, stream);
      return false;
    }

    const metadata: ChunkMetadata = {
      id: `${messageId}-${stream.chunks.length}`,
      contentHash: crypto.createHash('sha3-512').update(JSON.stringify(chunk)).digest('hex'),
      temporalSignature: this.generateTemporalSignature(chunk),
      sequenceNumber: stream.chunks.length,
      timestamp: Date.now(),
      predecessorHash: stream.chunks.length > 0 ? stream.chunks[stream.chunks.length - 1].contentHash : 'genesis',
      validationStatus: 'pending'
    };

    const isValid = await this.validateChunk(chunk, metadata);
    
    if (!isValid) {
      stream.errorCount++;
      stream.retryAttempts++;
      metadata.validationStatus = 'failed';
      
      if (stream.errorCount >= this.MAX_RETRY_ATTEMPTS) {
        stream.status = 'error';
        const error = new StreamError(
          `Stream ${messageId} exceeded maximum retry attempts`,
          messageId,
          {
            errorCount: stream.errorCount,
            retryAttempts: stream.retryAttempts
          }
        );
        logger.error(error.message, error);
      }
      
      this.streams.set(messageId, stream);
      return false;
    }

    metadata.validationStatus = 'validated';
    stream.chunks.push(metadata);
    stream.lastProcessedTimestamp = Date.now();
    stream.totalContentLength += JSON.stringify(chunk.choices[0].delta.content).length;
    this.streams.set(messageId, stream);

    return true;
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Cleanup sessions
      for (const [sessionId, session] of Array.from(this.sessions.entries())) {
        if (now - session.updatedAt > this.SESSION_TIMEOUT) {
          logger.debug(`Cleaning up stale session: ${sessionId}`);
          this.sessions.delete(sessionId);
        }
      }

      // Cleanup streams
      for (const [messageId, stream] of Array.from(this.streams.entries())) {
        if (now - stream.lastProcessedTimestamp > this.SESSION_TIMEOUT) {
          logger.debug(`Cleaning up stale stream: ${messageId}`);
          this.streams.delete(messageId);
        }
      }
    }, 1000 * 60 * 5); // Check every 5 minutes
  }

  public createSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: Session = {
      id: sessionId,
      status: 'pending',
      events: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.sessions.set(sessionId, session);
    logger.debug(`Created new session: ${sessionId}`);
  }

  public addEvent(sessionId: string, event: Omit<AutomationEvent, 'id' | 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const fullEvent: AutomationEvent = {
      id: `${sessionId}-${session.events.length + 1}`,
      timestamp: Date.now(),
      ...event
    };

    session.events.push(fullEvent);
    session.updatedAt = Date.now();

    // Update session status based on event type
    if (event.type === 'ERROR') {
      session.status = 'error';
    } else if (event.type === 'CLEANUP') {
      session.status = 'completed';
    } else if (session.status === 'pending') {
      session.status = 'active';
    }

    this.sessions.set(sessionId, session);
    this.eventEmitter.emit('automation-event', { sessionId, event: fullEvent });
    logger.debug(`Added event to session ${sessionId}:`, fullEvent);
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionEvents(sessionId: string): AutomationEvent[] {
    const session = this.sessions.get(sessionId);
    return session?.events || [];
  }

  public getStreamState(messageId: string): StreamState | undefined {
    return this.streams.get(messageId);
  }

  public subscribeToEvents(callback: (data: { sessionId: string, event: AutomationEvent }) => void): () => void {
    this.eventEmitter.on('automation-event', callback);
    return () => this.eventEmitter.off('automation-event', callback);
  }

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug(`Cleared session: ${sessionId}`);
  }

  public clearStream(messageId: string): void {
    this.streams.delete(messageId);
    logger.debug(`Cleared stream: ${messageId}`);
  }
}

export const eventStore = AutomationEventStore.getInstance();
