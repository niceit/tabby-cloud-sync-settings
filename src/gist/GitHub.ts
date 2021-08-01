import { Gist, GistFile } from "./Gist";

class GitHub extends Gist {

    private readonly baseUrl = "https://api.github.com/gists";

    get(gist: string): Promise<Map<string, GistFile>> {
        const url = `${this.baseUrl}/${gist}`;

        return new Promise(async (resolve, reject) => {
            this.request({
                method: 'GET',
                url,
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }).then(res => {
                resolve(this.toMap(res.data));
            }).catch(reject);
        });

    }

    sync(gist: string, gists: GistFile[]): Promise<string> {

        const data = {
            files: this.toFiles(gists),
            description: "sync terminus config",
            public: false
        };

        const url = gist ? `${this.baseUrl}/${gist}` : this.baseUrl;
        const method = gist ? 'PATCH' : 'POST';

        return new Promise(async (resolve, reject) => {
            this.request({
                method,
                url,
                data,
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }).then(res => {
                resolve(res.data.id);
            }).catch(reject);
        });

    }

    del(gist: string): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            this.request({
                method: 'DELETE',
                url: `${this.baseUrl}/${gist}`,
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            }).then(() => {
                resolve(true);
            }).catch(reject);
        });
    }

}

export default GitHub;