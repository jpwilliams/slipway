// "release": "./node_modules/.bin/releasy --stable",
//     "release": "./node_modules/release/scripts/process.js"

var childProcess = require('child_process')
var argv = process.argv
var type = argv[2] || 'patch'

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

  childProcess.spawn('./node_modules/.bin/release', [], {
    stdio: 'inherit'
  })
})
