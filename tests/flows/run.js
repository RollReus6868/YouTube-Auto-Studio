// Mo Electron chay tests/flows/main.js:  node tests/flows/run.js [loc]
const { spawnSync } = require('child_process')
const path = require('path')
const args = [path.join(__dirname, 'main.js'), ...process.argv.slice(2)].concat(process.platform === 'linux' ? ['--no-sandbox'] : [])
// Linux khong co locale UTF-8 (LANG rong): Chromium khong chon duoc file co dau ("Bí ẩn tập 7.mp4") qua DOM.setFileInputFiles
const utf8 = /utf-?8/i.test(process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '') ? {} : { LC_ALL: 'C.UTF-8' }
const r = spawnSync(require('electron'), args, { stdio: 'inherit', env: { ...process.env, ...utf8 } })
process.exit(r.status === null ? 1 : r.status)
