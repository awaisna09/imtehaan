const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    main: './js/chat.js', // Main entry point
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'js/[name].bundle.js',
    clean: true,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: '*.html',
          to: '[name][ext]',
          noErrorOnMissing: true,
        },
        {
          from: '*.css',
          to: '[name][ext]',
          noErrorOnMissing: true,
        },
        {
          from: 'css',
          to: 'css',
          noErrorOnMissing: true,
        },
        {
          from: 'js',
          to: 'js',
          noErrorOnMissing: true,
        },
        {
          from: '*.{png,jpg,jpeg,gif}',
          to: '[name][ext]',
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
        },
        extractComments: false,
      }),
    ],
  },
  performance: {
    maxAssetSize: 4000000,
    maxEntrypointSize: 4000000,
  },
};
