import { GistFile } from '../src/gist/Gist';
import Gitee from '../src/gist/Gitee'
import { giteeToken } from './token'


test('get unauthorized', async () => {

    const gitee = new Gitee('123456');

    try {
        await gitee.get('abc');
    } catch (error) {
        expect(error).toEqual('401 Unauthorized: Access token does not exist');
    }

})

test('sync unauthorized', async () => {

    const gitee = new Gitee('123456');

    try {
        await gitee.sync('abc', [new GistFile('test', 'test')]);
    } catch (error) {
        expect(error).toEqual('401 Unauthorized: Access token does not exist');
    }

})


test('del', async () => {

    const gitee = new Gitee(giteeToken);

    try {
        await gitee.del('test')
    } catch (error) {
        expect(error).toEqual('Request failed with status code 404');
    }

})


test('add and get and del', async () => {

    const gitee = new Gitee(giteeToken);

    const id = await gitee.sync(null, [new GistFile('test', 'test')]);

    expect(id).not.toBeNull();

    const gist = await gitee.get(id);

    expect(gist.keys()).toContain('test');

    expect(await gitee.del(id)).toBeTruthy();

})
