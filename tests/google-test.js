// Kiem thu src/google.js (Gemini) va ban tra loi binh luan voi may chu Gemini gia lap:  node tests/google-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { endpoints, gemini, descriptionPrompt } = require('../src/google')
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
