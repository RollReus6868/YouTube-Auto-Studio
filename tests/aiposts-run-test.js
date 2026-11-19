// Bai kiem don vi cho viec dang cua src/features/aiposts.js (run): ctx gia, withChannel gia (khong mo trinh duyet).
//   node tests/aiposts-run-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-aiposts-run-'))
const logs = []
let stop = false
const calls = []
let script = {} // khoa kenh -> ham (lan goi thu n) => ket qua | nem loi
const ctx = {
  state: { f: {} }, push: () => {}, log: (level, msg) => logs.push(`${level} ${msg}`), logFile: (n) => path.join(tmp, n),
  store: { settings: { aiPosts: {} }, save() {} }, refreshSettings() {},
  stopped: () => stop, resetStop: () => { stop = false }, isBusy: () => false,
  ai: { provider: () => 'web' },
  accounts: { channels: () => ['A', 'B', 'C'].map((k) => ({ key: k, name: `Kênh ${k}`, ucId: `UC${k}` })) },
  withChannel: async (key) => {
    calls.push(key)
    const n = calls.filter((k) => k === key).length
    return script[key](n)
  },
}
const feature = require('../src/features/aiposts')(ctx)
const S = ctx.state.f.aiposts
const at = (d) => new Date(Date.now() + d * 86400e3).toISOString()
const draft = (id, channelKey, i) => ({ id, channelKey, type: 'text', text: `Bài ${id}`, status: 'draft', when: at(i + 1), images: [], options: [], answers: [] })
const ok = (n) => ({ status: 'scheduled', url: `https://www.youtube.com/post/Ugkx${n}`, line: 'ok', mismatch: '' })

;(async () => {
  // A: bai 1 loi thoang qua (khung len lich chua hien) -> cuoi luot thu lai -> xong
  // B: 2 bai lien tiep loi "Khong mo duoc" -> tam dung 2 bai con lai cua B, khong thu lai B
  // C: OWNER_VERIFY -> dung cac bai con lai cua C ngay
  S.drafts = [draft('a1', 'A', 0), draft('b1', 'B', 0), draft('a2', 'A', 1), draft('b2', 'B', 1), draft('c1', 'C', 0), draft('b3', 'B', 2), draft('c2', 'C', 1), draft('b4', 'B', 3)]
  script = {
    A: (n) => { if (n === 1) throw new Error('Quá 10 giây vẫn chưa thấy ô chọn ngày giờ đăng.'); return ok(`A${n}`) },
    B: () => { throw new Error("Không mở được https://studio.youtube.com/: ERR_FAILED (-2) loading 'https://studio.youtube.com/'") },
    C: () => { throw Object.assign(new Error('YouTube không cho đăng bài lên kênh "Kênh C": Channel owner needs to verify'), { code: 'OWNER_VERIFY' }) },
  }
  await feature.commands.aipost_run({ ids: S.drafts.map((d) => d.id) })
  const st = Object.fromEntries(S.drafts.map((d) => [d.id, d.status]))
  assert.deepEqual(st, { a1: 'done', a2: 'done', b1: 'error', b2: 'error', b3: 'error', b4: 'error', c1: 'error', c2: 'error' }, JSON.stringify(st))
  assert.deepEqual(calls.filter((k) => k === 'A').length, 3, 'A: 2 bai + 1 lan thu lai')
  assert.deepEqual(calls.filter((k) => k === 'B').length, 2, 'B: dung sau 2 bai loi lien tiep')
  assert.deepEqual(calls.filter((k) => k === 'C').length, 1, 'C: OWNER_VERIFY dung ngay')
  assert.match(S.drafts.find((d) => d.id === 'b3').error, /lỗi 2 bài liên tiếp/)
  assert.match(S.drafts.find((d) => d.id === 'c2').error, /chủ sở hữu kênh/)
  assert(logs.some((l) => /thử lại 1 bài vừa lỗi/.test(l)), logs.join('\n'))
  assert(logs.some((l) => /lỗi 2 bài liên tiếp, tạm dừng 2 bài còn lại/.test(l)), logs.join('\n'))
  assert(logs.some((l) => /xong 2\/8 bài/.test(l)), logs.join('\n'))

  // kenh A loi mot bai roi bai sau xong: dem loi lien tiep tro ve 0 (khong tam dung kenh)
  calls.length = 0
  logs.length = 0
  S.drafts = [draft('x1', 'A', 0), draft('x2', 'A', 1), draft('x3', 'A', 2)]
  script = { A: (n) => { if (n === 1 || n === 3) throw new Error('Quá 20 giây vẫn chưa thấy nút "Đăng".'); return ok(`X${n}`) } }
  await feature.commands.aipost_run({ ids: ['x1', 'x2', 'x3'] })
  assert.deepEqual(S.drafts.map((d) => d.status), ['done', 'done', 'done'], logs.join('\n'))
  assert.equal(calls.length, 5, 'x1 loi, x2 xong, x3 loi, thu lai x1 + x3')
  console.log('aiposts-run-test: OK')
})().catch((e) => { console.error(e); process.exit(1) })
