/**
 * Root class for the Gist
 */
class Gist {
    protected baseRequestUrl: string
    protected id: string
    protected accessToken: string

    constructor(url: string, id: string, accessToken: string) {
        this.baseRequestUrl = url
        this.id = id
        this.accessToken = accessToken
    }
}

export default Gist
