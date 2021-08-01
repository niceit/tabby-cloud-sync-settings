const path = require('path')
const CleanWebpackPlugin = require('clean-webpack-plugin')

module.exports = {
  target: 'node',
  entry: 'src/index.ts',
  devtool: 'source-map',
  context: __dirname,
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    pathinfo: true,
    libraryTarget: 'umd',
    devtoolModuleFilenameTemplate: 'webpack-terminus-sync-config:///[resource-path]',
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
        }
      },
      {
        test: /\.scss$/,
        exclude: [/node_modules/, /\.global\.scss$/],
        use: ['to-string-loader', 'style-loader', 'css-loader', 'sass-loader'],
      },
      { test: /\.pug$/, use: ['apply-loader', 'pug-loader'] },
    ]
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
    new CleanWebpackPlugin(['dist'])
  ]
}
