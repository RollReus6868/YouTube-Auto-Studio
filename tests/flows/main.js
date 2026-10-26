// Chay cac bai kiem luong tu dong (tests/flows/*.test.js) trong Electron that, voi
// may chu YouTube gia (tests/mock-yt). Moi bai nhan mot Page tren cua so an moi.
//   xvfb-run -a node tests/flows/run.js [ten-file-loc]
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Page } = require('../../src/studio/driver')
const { startMockYt } = require('../mock-yt/server')

const filter = process.argv.slice(2).find((a) => !a.startsWith('-')) || ''
app.commandLine.appendSwitch('disable-gpu')
app.on('window-all-closed', () => {}) // giua cac bai khong co cua so nao: dung thoat

app.whenReady().then(async () => {
  const mock = await startMockYt()
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort()
  let failed = 0, total = 0
  for (const f of files) {
    for (const [name, fn] of require(path.join(__dirname, f))) {
      total++
      const partition = `flowtest-${total}`
      const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { partition, backgroundThrottling: false } })
      const logs = []
      const page = new Page(win.webContents, { timeout: 5000, log: (l, m) => logs.push(`${l} ${m}`), shotDir: path.join(os.tmpdir(), 'ya-flow-shots') })
      mock.events.length = 0
      try {
        await fn({ page, mock, urls: mock.urls, win, logs, tmp: fs.mkdtempSync(path.join(os.tmpdir(), 'ya-flow-')) })
        console.log(`  ok   ${f} > ${name}`)
      } catch (e) {
        failed++
        console.log(`  FAIL ${f} > ${name}\n${e.stack}\n  url: ${page.url()}\n  buoc: ${e.step || page.step}\n  log: ${logs.slice(-8).join(' | ')}`)
        const shot = await page.snapshot('loi')
        if (shot) console.log(`  anh: ${shot}.png`)
      }
      win.destroy()
      await session.fromPartition(partition).clearStorageData().catch(() => {})
    }
  }
  await mock.close()
  console.log(failed ? `${failed}/${total} bai loi` : `ALL ${total} PASSED`)
  app.exit(failed ? 1 : 0)
}).catch((e) => { console.log(e.stack); app.exit(1) })
