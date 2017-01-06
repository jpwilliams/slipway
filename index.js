var childProcess = require('child_process')
var argv = process.argv

if (['patch', 'minor', 'major'].indexOf(argv[2]) < 0) {
  console.error('Must provide either "major", "minor" or "patch" when releasing!')
  process.exit(1)
}

console.log(argv[2])

var proc = childProcess.spawn('./node_modules/.bin/releasy', [
  argv[2],
  '--dry-run',
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
