import DevEnvConstants from "../services/dev-constants";

const providerConstantItems = {
    BUILT_IN: 'builtin-tabby',
    S3: 'amazon-s3',
    WASABI: 'wasabi',
    DIGITAL_OCEAN: 'digital-ocean',
    BLACKBLAZE: 'blackblaze',
    WEBDAV: 'webdav',
    FTP: 'ftp',
}

const amazonS3CompatibilityInstances = [
    providerConstantItems.S3, providerConstantItems.WASABI,
    providerConstantItems.DIGITAL_OCEAN, providerConstantItems.BLACKBLAZE
]

const amazonCompatibilityEndpoints = {
    WASABI: 's3.wasabisys.com',
    DIGITAL_OCEAN: '{REGION}.digitaloceanspaces.com',
    BLACKBLAZE: 's3.{REGION}.backblazeb2.com',
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
        { name: 'DigitalOcean Space', value: providerConstantItems.DIGITAL_OCEAN },
        { name: 'Blackblaze', value: providerConstantItems.BLACKBLAZE },
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
        [providerConstantItems.DIGITAL_OCEAN]: {
            appId: '',
            appSecret: '',
            location: '/',
            bucket: '',
            region: '',
        },
        [providerConstantItems.BLACKBLAZE]: {
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
    external_urls: {
        BlackBlazeHelp: 'https://tabby-cloud.tranit.co/how-to-get-blackblaze-regtion-code/'
    },
    isCloudStorageS3Compatibility(provider: string) {
        return amazonS3CompatibilityInstances.includes(provider)
    }
}
export default CloudSyncSettingsData
