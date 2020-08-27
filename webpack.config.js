const path = require("path");
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const appDirectory = fs.realpathSync(process.cwd());

module.exports = {
    //context: __dirname,
    entry: path.resolve(appDirectory, "src/game.ts"),
    output: {
        filename: 'js/rooftopRampage.js'
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"]
    },
    devtool: 'eval-source-map',
    devServer: {
        host: '0.0.0.0',
        port: 3000,
        disableHostCheck: true,
        contentBase: path.resolve(appDirectory, "public"),
        publicPath: '/',
        hot: true
    },
    module: {
        rules: [
            {
              test: /\.tsx?$/,
              use: "ts-loader",
              exclude: /node_modules/
            },
        ]
    },
    plugins: [
        //new CopyWebpackPlugin({
        //    patterns: [
        //        { from: 'public' }
        //    ]
        //}),
        new HtmlWebpackPlugin({
            inject: true,
            template: path.resolve(appDirectory, "public/index.html")
        }),
        new CleanWebpackPlugin(),
    ],
    mode: "development",
    optimization: {
        usedExports: true,
    }
};