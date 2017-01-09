#!/bin/bash
// >&/dev/null;exec node --harmony-async-await $0 $@
// vi:syntax=javascript

var childProcess = require('child_process')
var argv = require('optimist').argv
var type = argv._[0] || 'patch'

if (['patch', 'minor', 'major'].indexOf(type) < 0) {
  console.error('Must provide either "major", "minor" or "patch" when releasing!')
  process.exit(1)
}

var proc = childProcess.spawn('./node_modules/.bin/releasy', [
  type,
  '--stable'
], {
  stdio: 'inherit'
})

proc.on('exit', (code) => {
  if (code !== 0) {
    return
  }

  childProcess.spawn('./node_modules/.bin/slipway-release', [], {
    stdio: 'inherit'
  })
})
