// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import winston, {QueryOptions} from 'winston'
import { PlatformService } from 'terminus-core'
import moment from "moment";
import fs from "fs";

const path = require('path')
export default class Logger {
    private platform: PlatformService
    private logger: winston.Logger

    constructor (platform: PlatformService) {
        this.platform = platform
        const loggerFile = this.getCurrentLoggerFile()

        this.logger  = winston.createLogger({
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: loggerFile }),
            ],
            format: winston.format.json(),
        })
    }

    getCurrentLoggerFile (): string {
        return path.dirname(this.platform.getConfigPath()) + '/tabby-sync/' + moment().format('DD-MM-YYYY') + '.log'
    }

    getLogContents (callback: any, date: string = moment().format('DD-MM-YYYY'), limit = 1000): any {
        const loggerFile =  path.dirname(this.platform.getConfigPath()) + '/tabby-sync/' + date + '.log'

        // check if the file exists
        if (!fs.existsSync(loggerFile)) {
            return callback(new Error('Log file is not exist.'), [])
        }

        const logger = winston.createLogger({
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: loggerFile }),
            ],
            format: winston.format.json(),
        })

        const options = {
            // @ts-ignore
            from: moment(date, 'DD-MM-YYYY').toDate(),
            until: moment(date, 'DD-MM-YYYY').toDate(),
            limit: limit,
            start: 0,
            order: 'desc',
            fields: ['message', 'level', 'time']
        } as any;

        return logger.query(options , (err, result) => {
            callback(err, result)
        })
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    log (content: any, level = 'info'): void {
        const time = new Date()
        this.logger.log({
            level: level,
            time: time.toLocaleString(),
            message: content,
        })
    }
}
