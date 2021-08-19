import DevEnvConstants from "../services/dev-constants";

const providerConstantItems = {
    BUILT_IN: 'builtin-tabby',
    S3: 'amazon-s3',
    WASABI: 'wasabi',
    WEBDAV: 'webdav',
    FTP: 'ftp',
}

const amazonCompatibilityEndpoints = {
    WASABI: 's3.wasabisys.com'
}

const DevEnv = DevEnvConstants
const CloudSyncSettingsData = {
    tabbySettingsFilename: '/config.yaml',
    storedSettingsFilename: '/sync-settings' + (DevEnv.ENABLE_DEBUG ? '-dev': '') + '.json',
    cloudSettingsFilename: '/tabby-settings' + (DevEnv.ENABLE_DEBUG ? '-dev': '') + '.json',
    tabbyLocalEncryptedFile: '/tabby-settings-encrypted.tmp',
    values: providerConstantItems,
    amazonEndpoints: amazonCompatibilityEndpoints,
    serviceProvidersList: [
        // { name: 'Builtin Tabby', value: providerConstantItems.BUILT_IN },
        { name: 'Amazon S3', value: providerConstantItems.S3 },
        { name: 'Wasabi', value: providerConstantItems.WASABI },
        { name: 'WebDav', value: providerConstantItems.WEBDAV },
        { name: 'FTP', value: providerConstantItems.FTP },
    ],
    BuiltinLoginMode: {
        LOGIN: 'Login',
        RESET_PASSWORD: 'ResetPassword',
    },
    formData: {
        [providerConstantItems.BUILT_IN]: {
            email: '',
            password: '',
            reset_password_email: '',
        },
        [providerConstantItems.S3]: {
            appId: '',
            appSecret: '',
            location: '/',
            bucket: '',
            region: '',
        },
        [providerConstantItems.WASABI]: {
            appId: '',
            appSecret: '',
            location: '/',
            bucket: '',
            region: '',
        },
        [providerConstantItems.WEBDAV]: {
            host: '',
            username: '',
            password: '',
            location: '',
            port: '443',
        },
        [providerConstantItems.FTP]: {
            protocol: 'ftp',
            host: '',
            username: '',
            password: '',
            location: '/',
        },
    },
}
export default CloudSyncSettingsData
