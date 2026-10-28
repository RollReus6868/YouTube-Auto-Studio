// Kiem thu src/google.js (Gemini) va ban tra loi binh luan voi may chu Gemini gia lap:  node tests/google-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { endpoints, gemini, geminiModels, GEMINI_MODELS, GEMINI_UPGRADE, descriptionPrompt } = require('../src/google')
const { startMock } = require('./google-mock')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ya-gt-'))
const tests = []
const test = (name, fn) => tests.push([name, fn])

// binh luan nhu hop thu Studio doc ra (src/flows/inbox.js)
const OWN = 'UCmock000000000000000000'
const cm = (commentId, author, text, authorChannelId, extra = {}) => ({
  commentId, videoId: 'vidA', author, authorChannelId, text, publishedAt: `2030-01-0${commentId.length}T00:00:00Z`, likeCount: 1, ...extra,
})
const COMMENTS = [
  cm('c1', 'Lan', 'Video hay quá, cảm ơn kênh!', 'UClan'),
  cm('c22', 'Minh', 'Tập sau khi nào ra vậy?', 'UCminh'),
  cm('c333', 'Spam', 'Kiếm tiền online tại www.lua.dao', 'UCspam'),
  cm('c4444', 'Chủ kênh', 'Cảm ơn mọi người', OWN),
  cm('c55555', 'Hoa', 'Đã xem', 'UChoa', { ownerReplied: true }),
]

test('gemini', async () => {
  const m = await startMock()
  try {
    const out = await gemini({ key: 'gemini-ok', model: 'model-x', prompt: 'viết đi', system: 'giọng vui', ep: endpoints(m.url) })
    assert.equal(out, 'Mô tả do Gemini viết.\n\n#a #b #c')
    assert.equal(m.lastGemini.systemInstruction.parts[0].text, 'giọng vui')
    await assert.rejects(gemini({ key: 'sai', model: 'x', prompt: 'a', ep: endpoints(m.url) }), /không đúng/)
    await assert.rejects(gemini({ key: '', model: 'x', prompt: 'a', ep: endpoints(m.url) }), /Chưa nhập/)
    const p = descriptionPrompt({ title: 'Bí ẩn', notes: 'rừng Amazon', channel: 'Kênh A', language: 'vi' })
    assert(p.includes('Bí ẩn') && p.includes('rừng Amazon') && p.includes('Kênh A') && p.includes('tiếng Việt'))
  } finally { await m.close() }
})

test('gemini moi: cap do tu duy, khong gui temperature; model cu giu nhu truoc; danh sach model cua key', async () => {
  const m = await startMock()
  try {
    await gemini({ key: 'gemini-ok', model: 'gemini-3.8-flash', prompt: 'a', thinking: 'high', ep: endpoints(m.url) })
    assert.deepEqual(m.lastGemini.generationConfig, { thinkingConfig: { thinkingLevel: 'high' } })
    await gemini({ key: 'gemini-ok', model: 'gemini-4-argon', prompt: 'a', thinking: 'xx', json: true, ep: endpoints(m.url) })
    assert.deepEqual(m.lastGemini.generationConfig, { responseMimeType: 'application/json' })
    await gemini({ key: 'gemini-ok', model: 'gemini-2.5-flash', prompt: 'a', thinking: 'low', ep: endpoints(m.url) })
    assert.deepEqual(m.lastGemini.generationConfig, { temperature: 0.8 }, '2.5 khong nhan thinkingLevel')
    const list = await geminiModels({ key: 'gemini-ok', ep: endpoints(m.url) })
    assert.deepEqual(list.map(([id]) => id), ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon', 'gemini-5-flash'])
    assert.equal(list[3][1], 'Gemini 5 Flash (gemini-5-flash)')
    await assert.rejects(geminiModels({ key: 'sai', ep: endpoints(m.url) }), /không đúng/)
    assert.equal(GEMINI_MODELS[0][0], 'gemini-3.8-flash')
    assert(Object.values(GEMINI_UPGRADE).every((id) => GEMINI_MODELS.some(([x]) => x === id)))
  } finally { await m.close() }
})

test('cai dat cu chon Gemini 2.5 -> model moi cung loai', () => {
  const { Store } = require('../src/store')
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ geminiModel: 'gemini-2.5-pro' }))
  const st = new Store(dir)
  assert.equal(st.settings.geminiModel, 'gemini-3.1-pro-preview')
  assert.equal(st.settings.geminiThinking, 'low')
  assert.equal(new Store(tmp()).settings.geminiModel, 'gemini-3.8-flash')
})

test('binh luan: loc, soan, gioi han, tu gui', async () => {
  const { CommentDesk } = require('../src/comments')
  const { replyPrompt, parseReply } = require('../src/google')
  const m = await startMock()
  try {
    const own = OWN
    const list = COMMENTS
    const titles = { vidA: 'Video A' }
    const dir = tmp()
    const desk = new CommentDesk(dir)
    assert.equal(desk.merge(list, { channelId: own, titles, skipWords: 'kiếm tiền' }), 3, 'bo binh luan cua kenh va da tra loi')
    assert.equal(desk.merge(list, { channelId: own, titles }), 0, 'khong them lai')
    assert.equal(desk.get('c333').status, 'skipped')
    assert.equal(desk.get('c1').videoTitle, 'Video A')
    assert.equal(new CommentDesk(dir).items.length, 3, 'luu lai sau khi mo lai')

    const p = replyPrompt({ style: 'xưng mình', channel: 'Kênh A', videoTitle: 'Video A', author: 'Lan', text: 'hay quá' })
    assert(p.system.includes('xưng mình') && p.prompt.includes('hay quá'))
    const r = parseReply(await gemini({ key: 'gemini-ok', model: 'x', ...p, json: true, ep: endpoints(m.url) }))
    assert.deepEqual(r, { kind: 'khen', reply: 'Cảm ơn bạn nhiều ❤️' })
    assert.equal(m.lastGemini.generationConfig.responseMimeType, 'application/json')
    assert.deepEqual(parseReply('```json\n{"loai":"spam","tra_loi":""}\n```'), { kind: 'spam', reply: '' })
    assert.equal(parseReply('{"loai":"la","tra_loi":"x"}').kind, 'hoi', 'loai la -> cho duyet tay')

    desk.update('c1', { status: 'ready', kind: 'khen', draft: 'Cảm ơn bạn!' })
    desk.update('c22', { status: 'ready', kind: 'hoi', draft: 'Tuần sau nhé' })
    assert(CommentDesk.autoOk(desk.get('c1')) && !CommentDesk.autoOk(desk.get('c22')))
    assert(!CommentDesk.autoOk({ kind: 'khen', draft: 'a'.repeat(300) }), 'loi khen dai cung cho duyet')
    const now = Date.now()
    desk.markSent('c1', 'Cảm ơn bạn!', now)
    assert(desk.canSend(2, now) && !desk.canSend(1, now))
    assert(desk.canSend(1, now + 3601e3), 'qua 1 gio thi gui tiep duoc')
    assert.equal(desk.get('c1').status, 'sent')
  } finally { await m.close() }
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
