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

    getSyncTextDateTime() {
        const dt = new Date()
        return "Tabby sync config " + dt.toLocaleString()
    }

    getDummyContent() {
        return 'tabby config will sync here.'
    }
}

export default Gist
