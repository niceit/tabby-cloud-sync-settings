import { GistFile } from '../src/gist/Gist';
import GitLab from '../src/gist/GitLab'
import { gitlabToken } from './token'


test('id is invalid', async () => {

    const gitLab = new GitLab('123456');

    try {
        await gitLab.get('abc');
    } catch (error) {
        expect(error).toEqual('id is invalid');
    }

})

test('sync unauthorized', async () => {

    const gitLab = new GitLab('123456');

    try {
        await gitLab.sync(null, [new GistFile('test', 'test')]);
    } catch (error) {
        expect(error).toEqual('401 Unauthorized');
    }

})


test('del', async () => {

    const gitLab = new GitLab(gitlabToken);

    try {
        await gitLab.del('test')
    } catch (error) {
        expect(error).toEqual('id is invalid');
    }

    try {
        await gitLab.del('2144014')
    } catch (error) {
        expect(error).toEqual('Request failed with status code 404');
    }

})


test('add and get and del', async () => {

    const gitLab = new GitLab(gitlabToken);

    const id = await gitLab.sync(null, [new GistFile('test', 'test')]);

    expect(id).not.toBeNull();

    const gist = await gitLab.get(id);

    expect(gist.keys()).toContain('test');

    expect(await gitLab.del(id)).toBeTruthy();

})


test('update', async () => {

    const gitLab = new GitLab(gitlabToken);

    const id = await gitLab.sync(null, [new GistFile('test', 'test')]);

    expect(id).not.toBeNull();


    const id2 = await gitLab.sync(id, [new GistFile('test', 'test')]);

    expect(id).toEqual(id2);

    expect(await gitLab.del(id)).toBeTruthy();

})
