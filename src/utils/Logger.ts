import winston from 'winston'
import { PlatformService } from 'terminus-core'
import moment from 'moment'
import fs from 'fs'

const path = require('path')

const DATE_FORMAT = 'DD-MM-YYYY'

/**
 * Thin wrapper around winston that writes a daily rotating log file next to the
 * Tabby config. Winston loggers are cached per log file so we do not rebuild the
 * transports (and re-open the file handle) on every `new Logger(platform)`,
 * which previously happened dozens of times per sync cycle.
 */
export default class Logger {
    private static loggerCache: Record<string, winston.Logger> = {}
    private platform: PlatformService
    private logger: winston.Logger

    constructor (platform: PlatformService) {
        this.platform = platform
        this.logger = Logger.getWinstonLogger(this.getCurrentLoggerFile())
    }

    /** Absolute path of today's log file. */
    getCurrentLoggerFile (): string {
        return this.getLoggerFileForDate(moment().format(DATE_FORMAT))
    }

    /** Absolute path of the log file for the given `DD-MM-YYYY` date string. */
    private getLoggerFileForDate (date: string): string {
        return path.dirname(this.platform.getConfigPath()) + '/tabby-sync/' + date + '.log'
    }

    /** Build or reuse a cached winston logger bound to `filename`. */
    private static getWinstonLogger (filename: string): winston.Logger {
        if (!Logger.loggerCache[filename]) {
            Logger.loggerCache[filename] = winston.createLogger({
                transports: [
                    new winston.transports.Console(),
                    new winston.transports.File({ filename }),
                ],
                format: winston.format.json(),
            })
        }

        return Logger.loggerCache[filename]
    }

    /**
     * Query the persisted log entries for a given day.
     *
     * @param callback Node-style `(err, result)` callback.
     * @param date Day to query in `DD-MM-YYYY` format (defaults to today).
     * @param limit Maximum number of entries to return.
     */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    getLogContents (callback: any, date: string = moment().format(DATE_FORMAT), limit = 1000): any {
        const loggerFile = this.getLoggerFileForDate(date)

        if (!fs.existsSync(loggerFile)) {
            return callback(new Error('Log file is not exist.'), [])
        }

        const logger = Logger.getWinstonLogger(loggerFile)
        const day = moment(date, DATE_FORMAT)
        const options = {
            from: day.startOf('day').toDate(),
            until: day.clone().endOf('day').toDate(),
            limit: limit,
            start: 0,
            order: 'desc',
            fields: ['message', 'level', 'time'],
        } as any

        return logger.query(options, (err, result) => {
            callback(err, result)
        })
    }

    /** Append a log entry at the given level (defaults to `info`). */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    log (content: any, level = 'info'): void {
        this.logger.log({
            level: level,
            time: new Date().toLocaleString(),
            message: content,
        })
    }
}
