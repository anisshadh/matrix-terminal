import { EventEmitter } from 'events';
import { logger } from './logger';

export interface AutomationEvent {
  id: string;
  timestamp: number;
  type: 'INIT' | 'NAVIGATE' | 'CLICK' | 'TYPE' | 'SUCCESS' | 'ERROR' | 'CLEANUP';
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

export class AutomationEventStore {
  private static instance: AutomationEventStore;
  private eventEmitter: EventEmitter;
  private sessions: Map<string, Session>;
  private readonly SESSION_TIMEOUT = 1000 * 60 * 30; // 30 minutes

  private constructor() {
    this.eventEmitter = new EventEmitter();
    this.sessions = new Map();
    this.startCleanupInterval();
  }

  public static getInstance(): AutomationEventStore {
    if (!AutomationEventStore.instance) {
      AutomationEventStore.instance = new AutomationEventStore();
    }
    return AutomationEventStore.instance;
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of Array.from(this.sessions.entries())) {
        if (now - session.updatedAt > this.SESSION_TIMEOUT) {
          logger.debug(`Cleaning up stale session: ${sessionId}`);
          this.sessions.delete(sessionId);
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

  public subscribeToEvents(callback: (data: { sessionId: string, event: AutomationEvent }) => void): () => void {
    this.eventEmitter.on('automation-event', callback);
    return () => this.eventEmitter.off('automation-event', callback);
  }

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug(`Cleared session: ${sessionId}`);
  }
}

export const eventStore = AutomationEventStore.getInstance();
