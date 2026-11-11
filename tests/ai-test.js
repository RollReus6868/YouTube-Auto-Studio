// Kiem thu src/ai.js (Gemini qua trinh duyet hoac API, du phong API, boc JSON):  node tests/ai-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createAi } = require('../src/ai')
const { extractJson, endpoints } = require('../src/google')
const { startMock } = require('./google-mock')

const tests = []
const test = (name, fn) => tests.push([name, fn])
const err = (message, code) => Object.assign(new Error(message), { code })

// ctx gia: cai dat, khoa API, nhat ky, ctx.geminiWeb gia dung hop dong (src/gemini-web.js)
function makeCtx({ settings = {}, key = '', web } = {}) {
  const logs = []
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-ai-test-'))
  const ctx = {
    logs, dir,
    log: (level, msg) => logs.push([level, msg]),
    logFile: (n) => path.join(dir, n),
    store: { settings: { aiProvider: 'web', aiFallbackApi: false, geminiModel: 'gemini-3.8-flash', geminiThinking: 'low', ...settings }, getSecret: (n) => (n === 'gemini' ? key : '') },
    geminiWeb: web === undefined ? fakeWeb() : web,
  }
  return ctx
}
function fakeWeb({ reply = 'Xin chào', fail = null, image } = {}) {
  const w = { asks: [], images: [] }
  w.ask = async (o) => { w.asks.push(o); if (o.shouldStop && o.shouldStop()) throw err('Đã dừng.', 'GEMINI_STOPPED'); if (fail) throw fail; return typeof reply === 'function' ? reply(o) : reply }
  w.image = async (o) => {
    w.images.push(o)
    if (fail) throw fail
    if (image) return image(o)
    const file = path.join(o.dir, 'gemini-web.png')
    fs.mkdirSync(o.dir, { recursive: true })
    fs.writeFileSync(file, 'PNGDATA')
    return { file, mime: 'image/png' }
  }
  w.open = () => { w.opened = (w.opened || 0) + 1 }
  w.status = () => ({ busy: false, accountId: 'a', signedIn: true, lastError: '' })
  return w
}
// ham API gia (ghi lai lan goi)
function fakeApi({ text = '{"ok":1}', fail = null } = {}) {
  const a = { texts: [], images: [] }
  a.apiText = async (o) => { a.texts.push(o); if (fail) throw fail; return text }
  a.apiImage = async (o) => { a.images.push(o); if (fail) throw fail; return { data: Buffer.from('APIIMG'), mime: 'image/jpeg', ext: '.jpg' } }
  return a
}

test('extractJson: khoi ```json, chu thua, ngoac trong chuoi, mang', () => {
  assert.equal(extractJson('Sure!\n```json\n{"a":"}"}\n```\nBye [x]'), '{"a":"}"}')
  assert.equal(extractJson('Đây: {"posts":[{"t":"[1]"}]} xong {nhé}'), '{"posts":[{"t":"[1]"}]}')
  assert.equal(extractJson('ket qua [1, 2, {"b": "c\\"}"}] het'), '[1, 2, {"b": "c\\"}"}]')
  // khoi code dau tien khong phai JSON -> tim tiep
  assert.equal(extractJson('```\nnot json\n```\n```json\n{"x":2}\n```'), '{"x":2}')
  assert.equal(extractJson('{loi} roi {"y":3}'), '{"y":3}')
  assert.equal(extractJson('khong co gi'), null)
})

test('web: ghep system vao dau prompt, json -> chi dan + boc JSON tu cau tra loi co chu thua', async () => {
  const web = fakeWeb({ reply: 'Chắc chắn rồi! Đây là kết quả:\n```json\n{"posts":[{"type":"text","text":"Hi"}]}\n```\nChúc bạn vui [!]' })
  const api = fakeApi()
  const ctx = makeCtx({ web })
  const ai = createAi(ctx, api)
  assert.equal(ai.provider(), 'web')
  const stop = () => false
  const out = await ai.text({ prompt: 'Viết bài', system: 'Bạn là chủ kênh.', json: true, label: 'bai-ai', shouldStop: stop })
  assert.equal(out, '{"posts":[{"type":"text","text":"Hi"}]}')
  assert.equal(web.asks.length, 1)
  const p = web.asks[0].prompt
  assert(p.startsWith('Bạn là chủ kênh.'), p)
  assert(p.indexOf('Viết bài') > p.indexOf('Bạn là chủ kênh.'))
  assert.match(p, /Chỉ trả lời bằng một khối JSON hợp lệ, không thêm chữ khác\.$/)
  assert.equal(web.asks[0].label, 'bai-ai')
  assert.equal(web.asks[0].shouldStop, stop)
  assert.equal(api.texts.length, 0, 'khong goi API')
  // json=false: tra nguyen chu (bo khoang trang dau / cuoi), khong them chi dan JSON
  web.asks.length = 0
  assert.equal(await ai.text({ prompt: 'Mô tả' }), 'Chắc chắn rồi! Đây là kết quả:\n```json\n{"posts":[{"type":"text","text":"Hi"}]}\n```\nChúc bạn vui [!]')
  assert(!/JSON/.test(web.asks[0].prompt))
  // json=true ma Gemini khong tra JSON: tra nguyen chu de ham doc bao loi ro
  const ai2 = createAi(makeCtx({ web: fakeWeb({ reply: '  Xin lỗi, tôi không làm được.  ' }) }), fakeApi())
  assert.equal(await ai2.text({ prompt: 'x', json: true }), 'Xin lỗi, tôi không làm được.')
})

test('web loi + du phong API bat + co key -> goi API, ghi nhat ky', async () => {
  const web = fakeWeb({ fail: err('Gemini báo hết lượt.', 'GEMINI_LIMIT') })
  const api = fakeApi({ text: '```json\n{"a":1}\n```' })
  const ctx = makeCtx({ web, key: 'AIza-key', settings: { aiFallbackApi: true, geminiModel: 'gemini-x', geminiThinking: 'high' } })
  const ai = createAi(ctx, api)
  assert.equal(await ai.text({ prompt: 'P', system: 'S', json: true }), '{"a":1}')
  assert.equal(api.texts.length, 1)
  assert.deepEqual([api.texts[0].key, api.texts[0].model, api.texts[0].thinking, api.texts[0].prompt, api.texts[0].system, api.texts[0].json], ['AIza-key', 'gemini-x', 'high', 'P', 'S', true])
  assert(ctx.logs.some(([l, m]) => l === 'warn' && /hết lượt/.test(m) && /Gemini API/.test(m)), JSON.stringify(ctx.logs))
  // anh: web loi -> API ve anh, luu vao dir
  const img = await ai.image({ prompt: 'a cat', aspect: '1:1', dir: ctx.dir, label: 'bai-1', model: 'img-model' })
  assert.equal(api.images.length, 1)
  assert.deepEqual([api.images[0].model, api.images[0].aspect, api.images[0].key], ['img-model', '1:1', 'AIza-key'])
  assert.equal(img.mime, 'image/jpeg')
  assert(img.file.startsWith(ctx.dir) && img.file.endsWith('.jpg'), img.file)
  assert.equal(fs.readFileSync(img.file, 'utf8'), 'APIIMG')
})

test('web loi + du phong tat (hoac khong co key) -> nem loi goc, khong goi API', async () => {
  const e = err('Chưa đăng nhập Google.', 'GEMINI_SIGNIN')
  for (const [settings, key] of [[{ aiFallbackApi: false }, 'AIza-key'], [{ aiFallbackApi: true }, '']]) {
    const api = fakeApi()
    const ai = createAi(makeCtx({ web: fakeWeb({ fail: e }), key, settings }), api)
    await assert.rejects(ai.text({ prompt: 'x' }), (x) => x === e)
    await assert.rejects(ai.image({ prompt: 'x' }), (x) => x === e)
    assert.equal(api.texts.length + api.images.length, 0)
  }
})

test('GEMINI_STOPPED (nguoi dung bam Dung) khong du phong API', async () => {
  const api = fakeApi()
  const ai = createAi(makeCtx({ web: fakeWeb(), key: 'AIza-key', settings: { aiFallbackApi: true } }), api)
  await assert.rejects(ai.text({ prompt: 'x', shouldStop: () => true }), { code: 'GEMINI_STOPPED' })
  assert.equal(api.texts.length, 0)
  // web loi khac nhung nguoi dung vua bam Dung -> cung khong goi API
  let stop = false
  const ai2 = createAi(makeCtx({ web: fakeWeb({ fail: err('quá giờ', 'GEMINI_TIMEOUT') }), key: 'AIza-key', settings: { aiFallbackApi: true } }), api)
  const p = ai2.text({ prompt: 'x', shouldStop: () => stop })
  stop = true
  await assert.rejects(p, { code: 'GEMINI_TIMEOUT' })
  assert.equal(api.texts.length, 0)
  // API: da dung truoc khi goi -> khong goi
  const ai3 = createAi(makeCtx({ settings: { aiProvider: 'api' }, key: 'k' }), api)
  await assert.rejects(ai3.text({ prompt: 'x', shouldStop: () => true }), { code: 'GEMINI_STOPPED' })
  assert.equal(api.texts.length, 0)
})

test("provider 'api': dung ham API (khong dung trinh duyet); anh luu vao thu muc", async () => {
  const web = fakeWeb()
  const api = fakeApi({ text: 'Mô tả API' })
  const ctx = makeCtx({ web, key: 'AIza-key', settings: { aiProvider: 'api' } })
  const ai = createAi(ctx, api)
  assert.equal(ai.provider(), 'api')
  assert.equal(await ai.text({ prompt: 'P' }), 'Mô tả API')
  const img = await ai.image({ prompt: 'p', label: 'Bài ảnh: Đức tin' })
  assert.equal(web.asks.length + web.images.length, 0)
  assert.equal(api.images[0].aspect, '1:1', 'mac dinh 1:1')
  assert.equal(path.dirname(img.file), ctx.logFile(path.join('ai-posts', 'anh')), 'thu muc mac dinh')
  assert.match(path.basename(img.file), /^Bai-anh-Duc-tin-[\w]+\.jpg$/)
  // API loi -> nem loi API (khong thu trinh duyet)
  const ai2 = createAi(makeCtx({ web, settings: { aiProvider: 'api', aiFallbackApi: true } }), fakeApi({ fail: err('Chưa nhập Gemini API key (Cài đặt).') }))
  await assert.rejects(ai2.text({ prompt: 'x' }), /API key/)
  assert.equal(web.asks.length, 0)
})

test('web anh: nho Gemini tao anh (khong chi mo ta), truyen thu muc + nhan', async () => {
  const web = fakeWeb()
  const ctx = makeCtx({ web })
  const ai = createAi(ctx, fakeApi())
  const shouldStop = () => false
  const r = await ai.image({ prompt: 'Noah ark at dawn', aspect: '16:9', label: 'ai1-1', shouldStop })
  assert.equal(web.images.length, 1)
  const o = web.images[0]
  assert.match(o.prompt, /image/i)
  assert.match(o.prompt, /16:9/)
  assert.match(o.prompt, /Noah ark at dawn/)
  assert.deepEqual([o.dir, o.label, o.shouldStop], [ctx.logFile(path.join('ai-posts', 'anh')), 'ai1-1', shouldStop])
  assert.deepEqual(r, { file: path.join(o.dir, 'gemini-web.png'), mime: 'image/png' })
})

test('web: chua co ctx.geminiWeb -> loi ro rang (va du phong API neu bat)', async () => {
  const ai = createAi(makeCtx({ web: null }), fakeApi())
  await assert.rejects(ai.text({ prompt: 'x' }), { code: 'GEMINI_UNAVAILABLE' })
  const api = fakeApi({ text: 'ok' })
  const ai2 = createAi(makeCtx({ web: null, key: 'k', settings: { aiFallbackApi: true } }), api)
  assert.equal(await ai2.text({ prompt: 'x' }), 'ok')
  // tra loi rong
  const ai3 = createAi(makeCtx({ web: fakeWeb({ reply: '   ' }) }), fakeApi())
  await assert.rejects(ai3.text({ prompt: 'x' }), { code: 'GEMINI_EMPTY' })
})

test('web loi + API du phong cung loi -> bao ca hai, giu ma loi trinh duyet', async () => {
  const ai = createAi(makeCtx({ web: fakeWeb({ fail: err('Hộp thoại chặn.', 'GEMINI_BLOCKED') }), key: 'k', settings: { aiFallbackApi: true } }), fakeApi({ fail: err('Gemini báo hết hạn mức.') }))
  await assert.rejects(ai.text({ prompt: 'x' }), (e) => e.code === 'GEMINI_BLOCKED' && /Hộp thoại chặn/.test(e.message) && /hết hạn mức/.test(e.message))
})

test("provider 'api' that: goi may chu Gemini gia qua src/google.js", async () => {
  const m = await startMock()
  try {
    const ai = createAi(makeCtx({ key: 'gemini-ok', settings: { aiProvider: 'api' } }), { ep: endpoints(m.url) })
    assert.equal(await ai.text({ prompt: 'Viết mô tả' }), 'Mô tả do Gemini viết.\n\n#a #b #c')
    const img = await ai.image({ prompt: 'x' })
    assert.equal(fs.readFileSync(img.file).subarray(1, 4).toString(), 'PNG')
  } finally { await m.close() }
})

;(async () => {
  let fail = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { fail++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(fail ? `${fail}/${tests.length} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(fail ? 1 : 0)
})()
