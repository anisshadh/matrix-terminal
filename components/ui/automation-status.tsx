import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

interface AutomationEvent {
  id: string;
  timestamp: number;
  type: 'INIT' | 'NAVIGATE' | 'CLICK' | 'TYPE' | 'SUCCESS' | 'ERROR' | 'CLEANUP';
  data?: any;
  error?: string;
}

interface AutomationStatusProps {
  sessionId: string | null;
  className?: string;
}

export function AutomationStatus({ sessionId, className = '' }: AutomationStatusProps) {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`/api/automation-stream?session=${sessionId}`);
    
    eventSource.onopen = () => {
      setConnected(true);
      logger.debug('Connected to automation stream');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          logger.debug('Received connection confirmation');
          return;
        }
        setEvents(prev => [...prev, data]);
      } catch (error: unknown) {
        logger.error('Error parsing event:', error instanceof Error ? error : new Error(String(error)));
      }
    };

    eventSource.onerror = (error: Event) => {
      logger.error('EventSource error:', new Error('EventSource connection failed'));
      setConnected(false);
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [sessionId]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'INIT':
        return '🚀';
      case 'NAVIGATE':
        return '🌐';
      case 'CLICK':
        return '🖱️';
      case 'TYPE':
        return '⌨️';
      case 'SUCCESS':
        return '✅';
      case 'ERROR':
        return '❌';
      case 'CLEANUP':
        return '🧹';
      default:
        return '📝';
    }
  };

  const getEventMessage = (event: AutomationEvent) => {
    switch (event.type) {
      case 'INIT':
        return 'Initializing browser...';
      case 'NAVIGATE':
        return `Navigating to ${event.data?.url}`;
      case 'CLICK':
        return `Clicking element: ${event.data?.selector}`;
      case 'TYPE':
        return `Typing into element: ${event.data?.selector}`;
      case 'SUCCESS':
        if (event.data?.action) {
          return `Successfully ${event.data.action}d`;
        }
        if (event.data?.console) {
          return `Console ${event.data.console.type}: ${event.data.console.text}`;
        }
        return 'Action completed successfully';
      case 'ERROR':
        return `Error: ${event.error}`;
      case 'CLEANUP':
        return 'Cleaning up...';
      default:
        return 'Unknown event';
    }
  };

  if (!sessionId || events.length === 0) return null;

  return (
    <div className={`rounded-lg bg-black/10 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-400">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="space-y-2">
        {events.map((event, index) => (
          <div
            key={event.id || index}
            className={`flex items-start gap-2 text-sm ${
              event.type === 'ERROR' ? 'text-red-400' : 'text-gray-200'
            }`}
          >
            <span className="flex-shrink-0">{getEventIcon(event.type)}</span>
            <span>{getEventMessage(event)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
