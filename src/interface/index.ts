// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
export interface AmazonParams {
    endpointUrl: string,
    appId: string,
    appSecret: string,
    bucket: string,
    region: string,
    location: string,
}

export interface FtpParams {
    protocol: string,
    host: string,
    username: string,
    password: string,
    location: string,
}

export interface GistParams {
    type: string,
    name: string,
    id: string,
    accessToken: string
}

export interface WebDavParams {
    host: string,
    username: string,
    password: string,
    location: string,
    port: string,
}
