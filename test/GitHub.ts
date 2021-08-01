import { GistFile } from '../src/gist/Gist';
import GitHub from '../src/gist/GitHub'
import { githubToken } from './token'


test('get unauthorized', async () => {

    const github = new GitHub('123456');

    try {
        await github.get('abc');
    } catch (error) {
        expect(error).toEqual('Bad credentials');
    }

})


test('gist not exist', async () => {

    const github = new GitHub(githubToken);

    try {
        await github.get('abc');
    } catch (error) {
        expect(error).toEqual('Request failed with status code 404');
    }

})

test('sync unauthorized', async () => {

    const github = new GitHub('123456');

    try {
        await github.sync(null, [new GistFile('test', 'test')]);
    } catch (error) {
        expect(error).toEqual('Bad credentials');
    }

})


test('del', async () => {

    const github = new GitHub(githubToken);

    try {
        await github.del('test')
    } catch (error) {
        expect(error).toEqual('Request failed with status code 404');
    }

})


test('add and get and del', async () => {

    const github = new GitHub(githubToken);

    const id = await github.sync(null, [new GistFile('test', 'test')]);

    expect(id).not.toBeNull();

    const gist = await github.get(id);

    expect(gist.keys()).toContain('test');

    expect(await github.del(id)).toBeTruthy();

})
