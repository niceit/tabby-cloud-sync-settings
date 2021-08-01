import { Injectable } from '@angular/core';
import { Connection } from 'api';
import * as keytar from 'keytar'


function getKey(conn: Connection) {
    let key = `ssh@${conn.host}`
    if (conn.port) {
        key = `ssh@${conn.host}:${conn.port}`
    }
    return key;
}

/**
 * https://github.com/Eugeny/terminus/blob/bd46b08c9d909603eca4f1ca149d9a2d0155117f/terminus-ssh/src/services/passwordStorage.service.ts
 */
@Injectable({ providedIn: 'root' })
export class PasswordStorageService {

    async savePassword(conn: Connection): Promise<void> {
        return keytar.setPassword(getKey(conn), conn.user, conn.auth.password)
    }

    async deletePassword(conn: Connection): Promise<void> {
        await keytar.deletePassword(getKey(conn), conn.user)
    }

    async loadPassword(conn: Connection): Promise<string | null> {
        return keytar.getPassword(getKey(conn), conn.user)
    }

}