import winston from 'winston';
import * as path from 'path';
import { app } from 'electron';

class Logger {
    private logger: winston.Logger;
    private prefix: string;
  
    constructor(prefix: string = '') {
      this.prefix = prefix;

      const logDir = app.getPath('userData');
      const logFile = path.join(logDir, 'app.log');

      this.logger = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] [${level}] [${this.prefix}] ${message}`;
          })
        ),
        transports: [
          new winston.transports.File({ 
            filename: logFile,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
          new winston.transports.Console()
        ]
      });  
    }
  
    log(...args: any[]): void {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        this.logger.info(message);
    }
  
    error(...args: any[]): void {
        const message = args.join(' ');
        this.logger.error(message);
    }
  
    warn(...args: any[]): void {
        const message = args.join(' ');
        this.logger.warn(message);
    }
  
    debug(...args: any[]): void {
        const message = args.join(' ');
        this.logger.debug(message);
    }
  
    // Create a new logger with an extended prefix
    createChild(additionalPrefix: string): Logger {
      const newPrefix = this.prefix ? `${this.prefix}:${additionalPrefix}` : additionalPrefix;
      return new Logger(newPrefix);
    }
  }
  
  export default Logger;