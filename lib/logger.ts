type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  error?: Error;
}

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: LogLevel, message: string, data?: any, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      error
    };
  }

  private log(level: LogLevel, message: string, data?: any, error?: Error) {
    const entry = this.formatMessage(level, message, data, error);
    
    // Add to in-memory logs
    this.logs.push(entry);
    
    // Trim logs if they exceed maxLogs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console with appropriate styling
    const timestamp = `[${entry.timestamp}]`;
    switch (level) {
      case 'debug':
        console.debug(timestamp, message, data || '', error || '');
        break;
      case 'info':
        console.info(timestamp, message, data || '', error || '');
        break;
      case 'warn':
        console.warn(timestamp, message, data || '', error || '');
        break;
      case 'error':
        console.error(timestamp, message, data || '', error || '');
        break;
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any, error?: Error) {
    this.log('warn', message, data, error);
  }

  error(message: string, error?: Error, data?: any) {
    this.log('error', message, data, error);
  }

  getRecentLogs(count: number = 50, level?: LogLevel): LogEntry[] {
    let filteredLogs = this.logs;
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    return filteredLogs.slice(-count);
  }

  clearLogs() {
    this.logs = [];
  }

  // Get logs for a specific time range
  getLogsInRange(startTime: Date, endTime: Date, level?: LogLevel): LogEntry[] {
    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp);
      const isInRange = logTime >= startTime && logTime <= endTime;
      return level ? isInRange && log.level === level : isInRange;
    });
  }

  // Get logs related to browser automation
  getBrowserAutomationLogs(): LogEntry[] {
    return this.logs.filter(log => 
      log.message.includes('browser') || 
      log.message.includes('automation') ||
      log.message.includes('click') ||
      log.message.includes('type') ||
      log.message.includes('navigate')
    );
  }

  // Get logs related to chat/LLM interactions
  getChatLogs(): LogEntry[] {
    return this.logs.filter(log => 
      log.message.includes('chat') || 
      log.message.includes('message') ||
      log.message.includes('completion') ||
      log.message.includes('stream')
    );
  }

  // Get error logs with stack traces
  getErrorLogs(): LogEntry[] {
    return this.logs.filter(log => log.level === 'error' && log.error);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
