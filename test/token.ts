import fs from 'fs'


const giteeToken = fs.readFileSync('token/gitee.token', { encoding: 'utf-8' });
const githubToken = fs.readFileSync('token/github.token', { encoding: 'utf-8' });
const gitlabToken = fs.readFileSync('token/gitlab.token', { encoding: 'utf-8' });

export {
    giteeToken,
    githubToken,
    gitlabToken,

};