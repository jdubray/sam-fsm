const path = require('path')
const babel = require('rollup-plugin-babel')
const resolve = require('rollup-plugin-node-resolve')

module.exports = {
  input: path.resolve(__dirname, 'index.js'),
  output: {
    file: path.resolve(__dirname, 'dist/fsm.js'),
    format: 'umd',
    name: 'tpFSM'
  },
  plugins: [
    resolve(),
    babel({
      exclude: 'node_modules/**',
      runtimeHelpers: true
    })
  ]
}
