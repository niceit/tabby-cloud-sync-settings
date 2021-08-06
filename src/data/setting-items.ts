const providerConstantItems = {
    BUILT_IN: 'builtin-tabby',
    S3: 'amazon-s3',
    WEBDAV: 'webdav',
    FTP: 'ftp',
}

const CloudSyncSettingsData = {
    tabbySettingsFilename: '/config.yaml',
    storedSettingsFilename: '/sync-settings.json',
    cloudSettingsFilename: '/tabby-settings.json',
    values: providerConstantItems,
    serviceProvidersList: [
        { name: 'Builtin Tabby', value: providerConstantItems.BUILT_IN },
        { name: 'Amazon S3', value: providerConstantItems.S3 },
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
            appId: 'AKIAIHG7SWF3HJZEO6TQ',
            appSecret: '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',
            location: '/',
            bucket: 'trantest',
            region: '',
        },
        [providerConstantItems.WEBDAV]: {
            host: 'https://app.koofr.net',
            username: 'tranit1209@gmail.com',
            password: 'wg1l 1gtv 86ct zudl',
            location: '/dav/Koofr/AppSync/filezilla',
            port: '443',
        },
        [providerConstantItems.FTP]: {
            protocol: 'ftp',
            host: '139.162.29.82',
            username: 'tranitco',
            password: 'xy7YjkHH3;H0+1',
            location: '/',
        },
    },
}
export default CloudSyncSettingsData
