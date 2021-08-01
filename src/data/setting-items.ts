const providerConstantItems = {
    BUILT_IN: 'builtin-tabby',
    S3: 'amazon-s3',
    WEBDAV: 'webdav',
    FTP: 'ftp',
}

const CloudSyncSettingsData = {
    values: providerConstantItems,
    serviceProvidersList: [
        { name: 'Builtin Tabby', value: providerConstantItems.BUILT_IN },
        { name: 'Amazon S3', value: providerConstantItems.S3 },
        { name: 'WebDav', value: providerConstantItems.WEBDAV },
        { name: 'FTP (less secure)', value: providerConstantItems.FTP },
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
        [providerConstantItems.WEBDAV]: {
            host: '',
            username: '',
            password: '',
            location: '',
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
