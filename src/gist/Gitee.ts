import axios from "axios";
import { Gist, GistFile } from "./Gist";

class Gitee extends Gist {

    private readonly baseUrl = "https://gitee.com/api/v5/gists";

    get(gist: string): Promise<Map<string, GistFile>> {

        const url = `${this.baseUrl}/${gist}`;

        const data = {
            access_token: this.token,
            id: gist
        };

        return new Promise(async (resolve, reject) => {
            try {
                const result = await axios.request({
                    method: 'PATCH',
                    url,
                    data,
                })
                resolve(this.toMap(result.data));
            } catch (error) {
                if (error.response) {
                    if (error.response.status === 404) {
                        reject(error.message);
                    } else {
                        reject(error.response.data.message);
                    }
                } else {
                    reject(error.message);
                }
            }
        });
    }

    sync(gist: string, gists: GistFile[]): Promise<string> {
        const data = {
            access_token: this.token,
            files: this.toFiles(gists),
            description: "sync terminus config",
            public: false,
            id: gist || ''
        };
        const method = gist ? 'PATCH' : 'POST';
        const url = gist ? `${this.baseUrl}/${gist}` : this.baseUrl;

        return new Promise(async (resolve, reject) => {
            try {
                const result = await axios.request({
                    method,
                    url,
                    data,
                })
                resolve(result.data.id);
            } catch (error) {
                if (error.response) {
                    if (error.response.status === 404) {
                        reject(error.message);
                    } else {
                        reject(error.response.data.message);
                    }
                } else {
                    reject(error.message);
                }
            }
        });
    }


    del(gist: string): Promise<boolean> {

        const data = {
            access_token: this.token,
            id: gist
        };

        return new Promise(async (resolve, reject) => {
            this.request({
                method: 'DELETE',
                url: `${this.baseUrl}/${gist}`,
                data
            }).then(() => {
                resolve(true);
            }).catch(reject);
        });
    }

}

export default Gitee;