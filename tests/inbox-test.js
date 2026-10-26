// Kiem thu src/features/inbox.js bang node: ctx gia, thay cac ham luong (src/flows/inbox.js) bang ham gia.
//   node tests/inbox-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
process.env.YA_INBOX_GAP_MS = '0'
const flow = require('../src/flows/inbox')
const { CommentDesk } = require('../src/comments')

const tests = []
const test = (name, fn) => tests.push([name, fn])

const CHANNELS = [
  { key: 'UCaaaaaaaaaaaaaaaaaaaaaa', accountId: 'a1', ucId: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Dark Faith 2nd', handle: '@DarkFaith9999' },
  { key: 'a1:Dark Bible Room', accountId: 'a1', ucId: '', name: 'Dark Bible Room', handle: '@DarkRoom6868' },
]
const row = (id, author, text, more = {}) => ({ id, author, handle: author, text, ago: '1 giờ trước', publishedAt: new Date().toISOString(), contentTitle: 'Video A', contentType: 'video', ownerReplied: false, replies: [], ...more })

function setup({ withChannel = true, settings = {}, inbox = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-inbox-'))
  const logs = []
  const calls = { open: [], reply: [], gemini: 0, switched: [] }
  let saved = { replyMode: 'auto', replyPerHour: 20, skipWords: 'kiếm tiền', replyStyle: '', inboxChannels: [], ...settings }
  const ctx = {
    state: { f: {}, comments: { sentLastHour: 0 } },
    push: () => {},
    log: (level, msg) => logs.push(`${level} ${msg}`),
    urls: { studio: 'https://studio.example', youtube: '' },
    store: { get settings() { return saved }, save: (p) => { saved = { ...saved, ...p } }, hasSecret: () => true },
    desk: new CommentDesk(dir),
    gemini: async ({ prompt }) => {
      calls.gemini++
      if (/Bình luận: .*(hay|love|amen)/i.test(prompt)) return '{"loai":"khen","tra_loi":"Cảm ơn bạn ❤️"}'
      if (/spam/i.test(prompt)) return '{"loai":"spam","tra_loi":""}'
      return '{"loai":"hoi","tra_loi":"Tuần sau nhé bạn!"}'
    },
    accounts: { channels: () => CHANNELS, find: (k) => CHANNELS.find((c) => c.key === k || c.ucId === k) || null },
    withChannel: withChannel ? async (key, fn) => {
      const ch = CHANNELS.find((c) => c.key === key)
      calls.switched.push(ch.name)
      return fn({ url: () => `https://studio.example/channel/${ch.ucId || 'UCbbbbbbbbbbbbbbbbbbbbbb'}/` })
    } : null,
  }
  flow.openInbox = async (page, uc) => { calls.open.push(uc) }
  flow.readComments = async (page, { handle }) => (inbox[handle] || [])
  flow.reply = async (page, c, text, opts) => {
    calls.reply.push({ id: c.id, text, uc: opts.uc, handle: opts.handle })
    return { status: c.id === 'already' ? 'already' : 'sent' }
  }
  const f = require('../src/features/inbox')(ctx)
  return { ctx, f, logs, calls, S: ctx.state.f.inbox, run: (cmd, p) => f.commands[cmd](p) }
}

test('chua co tai khoan: bao bang tieng Viet', async () => {
  const t = setup({ withChannel: false })
  await t.run('inbox_fetch', { channelKeys: ['UCaaaaaaaaaaaaaaaaaaaaaa'] })
  assert(t.logs.some((l) => l.includes('Chưa có tài khoản Google nào (trang Tài khoản).')), t.logs.join('\n'))
})

test('chua chon kenh', async () => {
  const t = setup()
  await t.run('inbox_fetch')
  assert(t.logs.some((l) => l.includes('Chọn ít nhất một kênh')))
})

test('qua tung kenh: soan nhap, tu gui loi khen, cau hoi cho duyet, bo binh luan cua kenh', async () => {
  const t = setup({
    inbox: {
      '@DarkFaith9999': [row('Ug1', '@lan', 'Video hay quá!'), row('Ug2', '@minh', 'Khi nào có tập 2?'), row('Ug3', '@DarkFaith9999', 'Ghim: cảm ơn mọi người'), row('Ug4', '@x', 'Đã có trả lời', { ownerReplied: true }), row('Ug5', '@y', 'kiếm tiền online tại đây')],
      '@DarkRoom6868': [row('Ug6', '@hoa', 'Amen 🙏')],
    },
  })
  t.run('inbox_channels', ['UCaaaaaaaaaaaaaaaaaaaaaa', 'a1:Dark Bible Room'])
  assert.deepEqual(t.S.channels, ['UCaaaaaaaaaaaaaaaaaaaaaa', 'a1:Dark Bible Room'])
  await t.run('inbox_fetch')
  assert.deepEqual(t.calls.switched.slice(0, 1), ['Dark Faith 2nd'])
  assert(t.calls.switched.includes('Dark Bible Room'))
  const ids = t.S.items.map((x) => x.id).sort()
  assert.deepEqual(ids, ['Ug1', 'Ug2', 'Ug5', 'Ug6'], 'khong lay binh luan cua kenh / da tra loi')
  const get = (id) => t.S.items.find((x) => x.id === id)
  assert.equal(get('Ug1').status, 'sent')
  assert.equal(get('Ug6').status, 'sent')
  assert.equal(get('Ug2').status, 'ready')
  assert.equal(get('Ug2').draft, 'Tuần sau nhé bạn!')
  assert.equal(get('Ug5').status, 'skipped')
  assert.equal(get('Ug1').source, 'studio')
  assert.equal(get('Ug6').channelName, 'Dark Bible Room')
  assert.deepEqual(t.calls.reply.map((r) => [r.id, r.text, r.uc, r.handle]), [
    ['Ug1', 'Cảm ơn bạn ❤️', 'UCaaaaaaaaaaaaaaaaaaaaaa', '@DarkFaith9999'],
    ['Ug6', 'Cảm ơn bạn ❤️', 'UCbbbbbbbbbbbbbbbbbbbbbb', '@DarkRoom6868'],
  ])
  assert.equal(t.S.sentLastHour, 2)
  assert.equal(t.ctx.state.comments.sentLastHour, 2, 'gioi han chung voi trang Binh luan')
  // lay lai: khong them, khong gui lai
  const before = t.calls.reply.length
  await t.run('inbox_fetch')
  assert.equal(t.calls.reply.length, before)
  assert.equal(t.S.items.length, 4)
})

test('duyet tay: sua roi gui; gui lan hai khong lam gi; kenh da tra loi tren YouTube', async () => {
  const inbox = { '@DarkFaith9999': [row('Ug2', '@minh', 'Khi nào có tập 2?'), row('Ug7', '@an', 'Nhạc tên gì vậy?')] }
  const t = setup({ settings: { replyMode: 'review', inboxChannels: ['UCaaaaaaaaaaaaaaaaaaaaaa'] }, inbox })
  await t.run('inbox_fetch')
  assert.equal(t.calls.reply.length, 0, 'che do duyet tay khong tu gui')
  await t.run('inbox_send', { id: 'Ug2', text: 'Thứ 5 tuần sau nha <bạn> 😊' })
  assert.deepEqual(t.calls.reply.map((r) => r.text), ['Thứ 5 tuần sau nha bạn 😊'])
  assert.equal(t.S.items.find((x) => x.id === 'Ug2').status, 'sent')
  await t.run('inbox_send', { id: 'Ug2', text: 'lan nua' })
  assert.equal(t.calls.reply.length, 1)
  // tra loi tay tren YouTube -> binh luan cho duyet thanh bo qua
  inbox['@DarkFaith9999'][1].ownerReplied = true
  await t.run('inbox_fetch')
  const it = t.S.items.find((x) => x.id === 'Ug7')
  assert.equal(it.status, 'skipped')
  assert.match(it.note, /đã trả lời/)
})

test('gioi han moi gio va hang da co tra loi', async () => {
  const t = setup({
    settings: { replyPerHour: 1, inboxChannels: ['UCaaaaaaaaaaaaaaaaaaaaaa'] },
    inbox: { '@DarkFaith9999': [row('Ug1', '@lan', 'Hay quá'), row('Ug8', '@b', 'Love it')] },
  })
  await t.run('inbox_fetch')
  assert.equal(t.calls.reply.length, 1, 'chi gui 1 trong 1 gio')
  const pending = t.S.items.find((x) => x.status === 'ready')
  await t.run('inbox_send', { id: pending.id, text: 'Cảm ơn' })
  assert.equal(t.calls.reply.length, 1)
  assert(t.logs.some((l) => l.includes('Đã gửi đủ 1 trả lời trong 1 giờ qua')))
  // flow bao "already" -> danh dau bo qua, khong tinh vao gioi han
  const t2 = setup({ settings: { replyMode: 'review', inboxChannels: ['UCaaaaaaaaaaaaaaaaaaaaaa'] }, inbox: { '@DarkFaith9999': [row('already', '@c', 'Câu hỏi?')] } })
  await t2.run('inbox_fetch')
  await t2.run('inbox_send', { id: 'already', text: 'Trả lời' })
  assert.equal(t2.S.items[0].status, 'skipped')
  assert.equal(t2.S.sentLastHour, 0)
})

test('che do Tat: hen gio khong chay, bam tay van lay nhung khong soan', async () => {
  const t = setup({ settings: { replyMode: 'off', inboxChannels: ['UCaaaaaaaaaaaaaaaaaaaaaa'] }, inbox: { '@DarkFaith9999': [row('Ug1', '@lan', 'Hay quá')] } })
  await t.run('inbox_fetch')
  assert.equal(t.calls.gemini, 0)
  assert.equal(t.S.items[0].status, 'new')
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
