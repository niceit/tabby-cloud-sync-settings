// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import winston, {QueryOptions} from 'winston'
import { PlatformService } from 'terminus-core'
import moment from "moment";

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

    getLogContents (date: string = moment().format('DD-MM-YYYY')): any {
        console.log('Getting log contents for ' + date)
        const options = {
            // @ts-ignore
            from: new Date() - (24 * 60 * 60 * 1000),
            until: new Date(),
            limit: 10,
            start: 0,
            order: 'desc',
            fields: ['message']
        } as any;
        return this.logger.query(options , (err, result) => {
            if (err) {
                /* TODO: handle me */
                throw err;
            }

            console.log('Log Contents', result)
            return result
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
