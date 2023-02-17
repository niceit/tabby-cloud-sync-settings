const DevEnvConstants = {
    ENABLE_DEBUG: typeof process.env.TABBY_DEV !== 'undefined' && process.env.TABBY_DEV === '1',
}
export default DevEnvConstants
