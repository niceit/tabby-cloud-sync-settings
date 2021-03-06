import winston from "winston";
import {PlatformService} from "terminus-core";
import DevConstants from "../services/dev-constants";

const path = require('path')
export default class Logger {
    platform;
    logger;

    constructor(platform: PlatformService) {
        this.platform = platform
        const date = new Date()
        const loggerFile = path.dirname(this.platform.getConfigPath()) + '/tabby-sync/' + ([date.getDate(), date.getMonth() + 1, date.getFullYear()].join('-')) + '.log'

        this.logger  = winston.createLogger({
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: loggerFile })
            ]
        })
    }

    log (content, level = 'info') {
        const time = new Date()
        if (DevConstants.ENABLE_DEBUG) {
            console.log(time.toString() + ' ', content);
        }

        this.logger.log({
            level: level,
            time: time.toLocaleString(),
            message: content
        });
    }
}
