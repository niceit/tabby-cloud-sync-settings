import axios, { AxiosResponse, AxiosRequestConfig } from "axios";

/**
 * 
 * github: https://docs.github.com/en/rest/reference/gists
 * 
 * gitee: https://gitee.com/api/v5/swagger#/getV5Gists
 * 
 * gitlab: https://docs.gitlab.com/ee/api/snippets.html
 * 
 */
class GistFile {

    /**
     * gist file name
     */
    readonly name: string;

    /**
    * gist file content
    */
    readonly value: string;

    constructor(name: string, value: string) {
        this.name = name;
        this.value = value;
    }
}

abstract class Gist {

    protected readonly token: string;

    constructor(token: string) {
        this.token = token;
    }

    /**
     * get a gist
     * @param gist gist id
     * @returns Array<GistFile>
     */
    abstract get(gist: string): Promise<Map<string, GistFile>>;

    /**
     * sync
     * @param gist gist id. if null then add.
     * @param gists  Array<GistFile>
     * @returns gist id
     */
    abstract sync(gist: string, gists: Array<GistFile>): Promise<string>;

    /**
     * del
     * @param gist gist id
     * @returns void
     */
    abstract del(gist: string): Promise<boolean>;


    request(request: AxiosRequestConfig): Promise<AxiosResponse> {
        return new Promise(async (resolve, reject) => {
            try {
                resolve(await axios.request(request));
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


    toFiles(gists: GistFile[]): object {

        const files = {};

        for (const gist of gists) {
            files[gist.name] = {
                content: gist.value
            };
        }

        return files;
    }

    toMap(result): Map<string, GistFile> {

        const files = result.files;
        const gists = new Map<string, GistFile>();


        for (const key of Object.keys(files)) {
            gists.set(key, new GistFile(key, files[key].content as string));
        }

        return gists;
    }

}

export {
    Gist,
    GistFile
}