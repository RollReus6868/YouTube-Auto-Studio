// Kiem thu src/ai-posts.js (bai dang Cong dong do Gemini viet):  node tests/aiposts-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const AI = require('../src/ai-posts')
const { endpoints } = require('../src/google')
const { startMock } = require('./google-mock')

const tests = []
const test = (name, fn) => tests.push([name, fn])
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi)

test('parseTimes: nhieu kieu go, lam tron moc 15 phut, bo trung', () => {
  assert.deepEqual(AI.parseTimes('08:00, 20:30; 9h, 7g10, 20:30'), ['07:15', '08:00', '09:00', '20:30'])
  assert.deepEqual(AI.parseTimes('23:50'), [])
  assert.deepEqual(AI.parseTimes(''), [])
})

test('planSlots: rai deu so bai vao cac ngay + gio, xoay vong loai bai', () => {
  const now = at(2026, 11, 1, 6, 0)
  const r = AI.planSlots({ count: 4, from: '2026-11-01', to: '2026-11-04', times: '08:00, 20:00', types: ['text', 'poll'], now })
  assert.deepEqual(r.warnings, [])
  assert.deepEqual(r.slots.map((s) => [new Date(s.when).getDate(), new Date(s.when).getHours(), s.type]), [[1, 8, 'text'], [2, 8, 'poll'], [3, 8, 'text'], [4, 8, 'poll']])
  // bo gio da qua (va trong 20 phut toi)
  const r2 = AI.planSlots({ count: 3, from: '2026-11-01', to: '2026-11-01', times: '06:10, 08:00, 20:00', types: ['quiz'], now })
  assert.deepEqual(r2.slots.map((s) => new Date(s.when).getHours()), [8, 20])
  assert.match(r2.warnings[0], /Chỉ có 2 giờ đăng/)
  // startIndex: tiep noi vong loai bai
  assert.equal(AI.planSlots({ count: 1, from: '2026-11-02', times: '9:00', types: ['text', 'image'], now, startIndex: 1 }).slots[0].type, 'image')
  // thieu thong tin
  assert.match(AI.planSlots({ count: 0, times: '9:00', types: ['text'], now }).warnings[0], /lớn hơn 0/)
  assert.match(AI.planSlots({ count: 2, times: '', types: ['text'], now }).warnings[0], /giờ đăng/)
  assert.match(AI.planSlots({ count: 2, times: '9:00', types: [], now }).warnings[0], /loại bài/)
  assert.match(AI.planSlots({ count: 2, from: '2026-10-01', to: '2026-10-02', times: '9:00', types: ['text'], now }).warnings[0], /đã qua/)
})

test('postsPrompt: yeu cau cua kenh, ngon ngu, thu tu loai bai, bai cu, video gan day', () => {
  const p = AI.postsPrompt({ channel: { name: 'Dark Bible Stories', handle: '@BibleStoriies' }, request: 'Bible stories for adults, dark tone', language: 'en', types: ['text', 'poll', 'quiz'], recent: ['Old post about Noah'], videos: ['Who Was Jesus to Give Orders to the Dead'], hashtags: false, emoji: false })
  assert.match(p, /Dark Bible Stories/)
  assert.match(p, /Bible stories for adults, dark tone/)
  assert.match(p, /Language of every post: English/)
  assert.match(p, /in this order of types: text, poll, quiz\./)
  assert.match(p, /Old post about Noah/)
  assert.match(p, /Who Was Jesus to Give Orders/)
  assert.match(p, /Do not use hashtags/)
  assert.match(p, /"type":"quiz"/)
  assert(!/"type":"image_poll"/.test(p), 'chi mo ta loai bai can dung')
})

test('parsePosts: cat gon theo gioi han YouTube, ha cap bai hong, sua dap an dung', () => {
  const out = '```json\n' + JSON.stringify({ posts: [
    { type: 'poll', text: 'Which?', options: ['A'.repeat(80), 'B', 'B', 'C', 'D', 'E'] },
    { type: 'quiz', text: 'Who?', answers: [{ text: 'x' }, { text: 'y' }] },
    { type: 'image_poll', text: 'Pick', options: [{ text: 'Only one' }] },
    { type: 'text', text: 'Hello' },
  ] }) + '\n```'
  const [poll, quiz, ip, text, missing] = AI.parsePosts(out, ['poll', 'quiz', 'image_poll', 'text', 'image'])
  assert.equal(poll.type, 'poll')
  assert.equal(poll.options.length, 4) // bo trung, toi da 4
  assert(poll.options[0].text.length <= 65)
  assert.equal(quiz.answers.filter((a) => a.correct).length, 1)
  assert.match(quiz.warnings[0], /không đánh dấu đáp án đúng/)
  assert.equal(ip.type, 'text') // thieu lua chon -> bai chu
  assert.match(ip.warnings[0], /thăm dò ảnh/)
  assert.equal(text.text, 'Hello')
  assert.equal(missing, null)
  assert.throws(() => AI.parsePosts('xin loi', ['text']), /JSON/)
  // Gemini tra sai thu tu: ghep theo loai
  const [a, b] = AI.parsePosts(JSON.stringify([{ type: 'quiz', text: 'Q', answers: [{ text: '1', correct: true }, { text: '2' }] }, { type: 'text', text: 'T' }]), ['text', 'quiz'])
  assert.deepEqual([a.type, b.type], ['text', 'quiz'])
})

test('geminiImage: goi model anh, tra ve PNG; loi han muc -> bao ro', async () => {
  const m = await startMock()
  try {
    const img = await AI.geminiImage({ key: 'gemini-ok', prompt: AI.imagePrompt('Noah ark', 'oil painting'), ep: endpoints(m.url) })
    assert.equal(img.ext, '.png')
    assert.deepEqual([...img.data.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG')
    assert.deepEqual(m.lastGemini.generationConfig.responseModalities, ['TEXT', 'IMAGE'])
    assert.equal(m.lastGemini.generationConfig.imageConfig.aspectRatio, '1:1')
    assert.match(m.lastGemini.contents[0].parts[0].text, /oil painting[\s\S]*Do not put any text/)
    assert(m.calls.some((c) => c.path === '/gemini/models/gemini-2.5-flash-image:generateContent'))
    m.opts.imageFail = 429
    await assert.rejects(AI.geminiImage({ key: 'gemini-ok', prompt: 'x', ep: endpoints(m.url) }), /hết hạn mức/)
    await assert.rejects(AI.geminiImage({ key: '', prompt: 'x', ep: endpoints(m.url) }), /Chưa nhập Gemini API key/)
  } finally { await m.close() }
})

test('pickFolderImages: lay anh chua dung, het thi dung lai', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-ai-'))
  for (const f of ['b.jpg', 'a.png', 'note.txt', 'c.webp']) fs.writeFileSync(path.join(dir, f), 'x')
  const r = AI.pickFolderImages(dir, 2, new Set([path.join(dir, 'a.png')]))
  assert.deepEqual(r.files.map((f) => path.basename(f)), ['b.jpg', 'c.webp'])
  assert.equal(r.reused, false)
  const r2 = AI.pickFolderImages(dir, 2, new Set([path.join(dir, 'a.png'), path.join(dir, 'b.jpg')]))
  assert.deepEqual(r2.files.map((f) => path.basename(f)), ['c.webp', 'a.png'])
  assert.equal(r2.reused, true)
  assert.throws(() => AI.pickFolderImages(path.join(dir, 'khong-co'), 1), /Không thấy thư mục/)
  assert.throws(() => AI.pickFolderImages('', 1), /Chưa chọn thư mục ảnh/)
})

;(async () => {
  let fail = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { fail++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(fail ? `${fail}/${tests.length} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(fail ? 1 : 0)
})()
