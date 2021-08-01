import { Gist, GistFile } from "./Gist";
import axios, { AxiosResponse, AxiosRequestConfig } from "axios";
class GitLab extends Gist {

    private readonly baseUrl = "https://gitlab.com/api/v4/snippets";

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
                resolve(this._toMap(gist, res.data));
            }).catch(reject);
        });
    }

    sync(gist: string, gists: GistFile[]): Promise<string> {

        const data = {
            title: "sync terminus config",
            visibility: "private",
            files: gists.map(e => {
                let obj: any = { file_path: e.name, content: e.value };
                if (gist) {
                    obj.action = 'update';
                }
                return obj
            })
        };

        const url = gist ? `${this.baseUrl}/${gist}` : this.baseUrl;
        const method = gist ? 'PUT' : 'POST';

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

    raw(gist: string, path: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            this.request({
                method: 'GET',
                url: `${this.baseUrl}/${gist}/files/main/${path}/raw`,
                headers: {
                    Authorization: `Bearer ${this.token}`
                },
                responseType: 'text'
            }).then(res => {
                if (typeof res.data === 'object') {
                    resolve(JSON.stringify(res.data));
                } else {
                    resolve(res.data);
                }
            }).catch(reject);
        });
    }

    _toMap(gist: string, result): Promise<Map<string, GistFile>> {
        return new Promise(async (resolve, reject) => {
            const gists = new Map<string, GistFile>();

            try {

                for (const f of result.files) {
                    const content = await this.raw(gist, f.path);
                    gists.set(f.path, new GistFile(f.path, content));
                }

                resolve(gists);
            } catch (error) {
                reject(error);
            }
        });
    }

    request(request: AxiosRequestConfig): Promise<AxiosResponse> {
        return new Promise(async (resolve, reject) => {
            try {
                resolve(await axios.request(request));
            } catch (error) {
                if (error.response) {
                    if (error.response.status === 404) {
                        reject(error.message);
                    } else {
                        reject(error.response.data.message || error.response.data.error);
                    }
                } else {
                    reject(error.message);
                }
            }
        });
    }


}

export default GitLab