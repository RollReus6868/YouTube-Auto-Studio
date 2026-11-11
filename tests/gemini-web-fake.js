// Gemini tren trinh duyet GIA cho bai kiem (dung hop dong cua src/gemini-web.js: ask / image / open / status).
// Bat bang YA_GEMINI_WEB_FAKE=<dia chi tests/google-mock.js> (src/ai.js nap file nay thay ctx.geminiWeb).
// May chu gia quyet dinh cau tra loi / loi (m.opts.webFail = 'GEMINI_SIGNIN' ...), ghi lai loi nhac (m.webPrompts).
const fs = require('fs')
const path = require('path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const err = (message, code) => Object.assign(new Error(message), { code })

module.exports = (ctx, base) => {
  const st = { busy: false, accountId: '', signedIn: null, lastError: '' }
  const account = () => {
    const want = (ctx.store && ctx.store.settings && ctx.store.settings.geminiAccount) || ''
    const list = ctx.accounts ? ctx.accounts.list() : []
    return (list.find((a) => a.id === want) || list[0] || { id: want }).id || ''
  }
  const show = () => { st.accountId = account(); if (ctx.state) { ctx.state.geminiWeb = { ...st }; if (ctx.push) ctx.push() } }
  let chain = Promise.resolve()
  // mot yeu cau mot luc; shouldStop duoc xem moi 100 ms trong luc cho
  const run = (kind, o) => {
    const job = chain.then(async () => {
      if (o.shouldStop && o.shouldStop()) throw err('Đã dừng theo yêu cầu.', 'GEMINI_STOPPED')
      st.busy = true
      show()
      try {
        const req = fetch(`${base}/gemini-web/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: o.prompt, label: o.label || '', account: account() }) })
        let res
        req.then((r) => { res = r }, (e) => { res = e })
        while (!res) {
          if (o.shouldStop && o.shouldStop()) throw err('Đã dừng theo yêu cầu.', 'GEMINI_STOPPED')
          await sleep(100)
        }
        if (res instanceof Error) throw err(`Không mở được Gemini: ${res.message}`, 'GEMINI_TIMEOUT')
        if (!res.ok) {
          const j = await res.json()
          if (j.code === 'GEMINI_SIGNIN') st.signedIn = false
          throw err(j.message, j.code)
        }
        st.signedIn = true
        st.lastError = ''
        if (kind === 'ask') return (await res.json()).text
        const dir = o.dir || ctx.logFile(path.join('ai-posts', 'anh'))
        fs.mkdirSync(dir, { recursive: true })
        const file = path.join(dir, `gemini-web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.png`)
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
        return { file, mime: 'image/png' }
      } catch (e) {
        st.lastError = e.message
        throw e
      } finally {
        st.busy = false
        show()
      }
    })
    chain = job.catch(() => {})
    return job
  }
  show()
  return {
    ask: (o) => run('ask', o),
    image: (o) => run('image', o),
    open: () => { fetch(`${base}/gemini-web/open`, { method: 'POST' }).catch(() => {}) },
    status: () => ({ ...st, accountId: account() }),
  }
}
