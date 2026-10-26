// Mo Electron chay tests/flows/main.js:  node tests/flows/run.js [loc]
const { spawnSync } = require('child_process')
const path = require('path')
const args = [path.join(__dirname, 'main.js'), ...process.argv.slice(2)].concat(process.platform === 'linux' ? ['--no-sandbox'] : [])
const r = spawnSync(require('electron'), args, { stdio: 'inherit' })
process.exit(r.status === null ? 1 : r.status)
