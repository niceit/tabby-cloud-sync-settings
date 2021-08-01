import { Gist, GistFile } from "gist/Gist";
import Gitee from "gist/Gitee";
import GitHub from "gist/GitHub";
import GitLab from "gist/GitLab";


export function syncGist(type: 'Gitee' | 'GitHub' | 'GitLab', token: string, gistId: string, files: Array<GistFile>): Promise<string> {

    return new Promise(async (resolve, reject) => {
        try {
            let gist: Gist = null;

            if (type === 'Gitee') {
                gist = new Gitee(token);
            } else if (type === 'GitHub') {
                gist = new GitHub(token);
            } else if (type === 'GitLab') {
                gist = new GitLab(token);
            } else {
                throw "unknown the type " + type;
            }

            resolve(await gist.sync(gistId, files));

        } catch (error) {
            reject(error);
        }
    });
}

export function getGist(type: string, token: string, gistId: string): Promise<Map<string, GistFile>> {

    return new Promise(async (resolve, reject) => {
        try {
            let gist: Gist = null;

            if (type === 'Gitee') {
                gist = new Gitee(token);
            } else if (type === 'GitHub') {
                gist = new GitHub(token);
            } else if (type === 'GitLab') {
                gist = new GitLab(token);
            } else {
                throw "unknown the type " + type;
            }

            resolve(await gist.get(gistId));

        } catch (error) {
            reject(error);
        }
    });
}


export class Connection {
    host: string;
    port?: number;
    user: string;
    auth?: {
        password: string,
        encryptType: 'NONE' | 'AES',
    };
}