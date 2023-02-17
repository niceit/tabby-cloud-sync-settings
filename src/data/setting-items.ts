// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import DevEnvConstants from '../services/dev-constants'
import DevMockData from '../utils/dev-mock-data'

const providerConstantItems = {
    BUILT_IN: 'builtin-tabby',
    S3: 'amazon-s3',
    WASABI: 'wasabi',
    DIGITAL_OCEAN: 'digital-ocean',
    BLACKBLAZE: 'blackblaze',
    S3_COMPATIBLE: 's3-compatible',
    WEBDAV: 'webdav',
    FTP: 'ftp',
    GIST: 'gists',
}

const amazonS3CompatibilityInstances = [
    providerConstantItems.S3, providerConstantItems.WASABI,
    providerConstantItems.DIGITAL_OCEAN, providerConstantItems.BLACKBLAZE,
    providerConstantItems.S3_COMPATIBLE,
]

const amazonCompatibilityEndpoints = {
    WASABI: 's3.wasabisys.com',
    DIGITAL_OCEAN: '{REGION}.digitaloceanspaces.com',
    BLACKBLAZE: 's3.{REGION}.backblazeb2.com',
    S3_COMPATIBLE: 'sample.s3.endpoint.com',
}

const DevEnv = DevEnvConstants
const CloudSyncSettingsData = {
    defaultSyncInterval: 20, // 20 seconds
    tabbySettingsFilename: '/config.yaml',
    storedSettingsFilename: '/sync-settings' + (DevEnv.ENABLE_DEBUG ? '-dev': '') + '.json',
    cloudSettingsFilename: '/tabby-settings' + (DevEnv.ENABLE_DEBUG ? '-dev': '') + '.json',
    tabbyLocalEncryptedFile: '/tabby-settings-encrypted.tmp',
    values: providerConstantItems,
    amazonEndpoints: amazonCompatibilityEndpoints,
    serviceProvidersList: [
        // { name: 'Builtin Tabby', value: providerConstantItems.BUILT_IN }, // TODO Tran Implement
        { name: 'Amazon S3', value: providerConstantItems.S3 },
        { name: 'Wasabi', value: providerConstantItems.WASABI },
        { name: 'DigitalOcean Space', value: providerConstantItems.DIGITAL_OCEAN },
        { name: 'Blackblaze', value: providerConstantItems.BLACKBLAZE },
        { name: 'S3 Compatible (Minio, etc...)', value: providerConstantItems.S3_COMPATIBLE },
        { name: 'WebDav', value: providerConstantItems.WEBDAV },
        { name: 'Gists', value: providerConstantItems.GIST },
        { name: 'FTP / FTPS', value: providerConstantItems.FTP },
    ],
    BuiltinLoginMode: {
        LOGIN: 'Login',
        RESET_PASSWORD: 'ResetPassword',
    },
    availablePluginVersions: [
        '1.5.2',
        '1.5.1',
        '1.5.0',
        '1.4.3',
        '1.4.2',
        '1.4.1',
        '1.4.0',
        '1.3.0',
        '1.2.21',
        '1.2.2',
        '1.2.1',
        '1.2.0',
        '1.1.3',
        '1.1.2',
        '1.1.1',
        '1.1.0',
        '1.0.6',
        '1.0.5',
        '1.0.4',
    ],
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
        [providerConstantItems.S3_COMPATIBLE]: {
            endpointUrl: '',
            appId: '',
            appSecret: '',
            location: '/',
            bucket: '',
            region: '',
        },
        [providerConstantItems.WEBDAV]: {
            host: DevEnv.ENABLE_DEBUG ? DevMockData.getWebDavMockData().host : '',
            username: DevEnv.ENABLE_DEBUG ? DevMockData.getWebDavMockData().username : '',
            password: DevEnv.ENABLE_DEBUG ? DevMockData.getWebDavMockData().password : '',
            location: DevEnv.ENABLE_DEBUG ? DevMockData.getWebDavMockData().location : '',
            port: DevEnv.ENABLE_DEBUG ? DevMockData.getWebDavMockData().port : '443',
        },
        [providerConstantItems.FTP]: {
            protocol: 'ftp',
            host: '',
            username: '',
            password: '',
            location: '/',
            port: 21,
        },
        [providerConstantItems.GIST]: {
            type: 'github',
            name: '',
            accessToken: '',
            id: '',
        },
    },
    external_urls: {
        ApiUrl: `https://${DevEnv.ENABLE_DEBUG ? 'dev.' : ''}ws.phprockets.com`,
        BlackBlazeHelp: 'https://tabby-cloud.tranit.co/how-to-get-blackblaze-regtion-code/',
        checkForUpdateUrl: `https://${DevEnv.ENABLE_DEBUG ? 'dev.' : ''}ws.phprockets.com/tabby-sync/check-for-updates`,
    },
    isCloudStorageS3Compatibility (provider: string): boolean {
        return amazonS3CompatibilityInstances.includes(provider)
    },
    gistUrls: {
        viewItems: {
            github: 'https://gist.github.com/',
            gitee: 'https://gist.github.com/',
            gitlab: 'https://gitlab.com/-/snippets/',
        },
        github: 'https://api.github.com/gists',
        gitee: 'https://gitee.com/api/v5/gists',
        gitlab: 'https://gitlab.com/api/v4/snippets',

    },
    donationUrl: 'https://donorbox.org/tabby-cloud-sync-settings-donation',
    pluginUrl: 'https://tabby-cloud.tranit.co',
}
export default CloudSyncSettingsData
