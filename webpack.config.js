// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const path = require('path')
const CleanWebpackPlugin = require('clean-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const webpack = require('webpack')

const dropboxAppKey = (process.env.DROPBOX_APP_KEY || '').trim()
const buildId = new Date().toISOString()

console.log(`[terminus-cloud-settings-sync] Build ${buildId}: DROPBOX_APP_KEY present=${dropboxAppKey.length > 0}, length=${dropboxAppKey.length}`)

module.exports = {
    target: 'node',
    entry: 'src/index.ts',
    devtool: 'eval',
    context: __dirname,
    mode: 'production',
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        pathinfo: true,
        libraryTarget: 'umd',
        devtoolModuleFilenameTemplate: 'webpack-terminus-cloud-sync-settings:///[resource-path]',
    },
    resolve: {
        modules: ['.', 'src', 'node_modules'].map(x => path.join(__dirname, x)),
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    configFile: path.resolve(__dirname, 'tsconfig.json'),
                },
            },
            {
                test: /\.scss$/,
                exclude: [/node_modules/, /\.global\.scss$/],
                use: ['to-string-loader', 'style-loader', 'css-loader', 'sass-loader'],
            },
            { test: /\.pug$/, use: ['apply-loader', 'pug-loader'] },
        ],
    },
    externals: [
        'keytar',
        'fs',
        'ngx-toastr',
        /^rxjs/,
        /^@angular/,
        /^@ng-bootstrap/,
        /^terminus-/,
    ],
    plugins: [
        new CleanWebpackPlugin(['dist'], {
            verbose: false,
        }),
        new webpack.DefinePlugin({
            'process.env.DROPBOX_APP_KEY': JSON.stringify(dropboxAppKey),
            'process.env.TABBY_CLOUD_SYNC_BUILD_ID': JSON.stringify(buildId),
        }),
    ],
}
