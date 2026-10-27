// Kiem thu src/hometab-input.js (khong can Electron):  node tests/hometab-test.js
const assert = require('assert')
const h = require('../src/hometab-input')

const tests = []
const test = (name, fn) => tests.push([name, fn])
const UC = 'UC4Dzx9CFcLbO9OGWNBJkwBQ'
const PL = 'PLcWuSJdVMhk4xYz0123456789abcdEF'

test('link kenh: UC url, studio url, UC tran', () => {
  for (const s of [
    `https://www.youtube.com/channel/${UC}`, `youtube.com/channel/${UC}/videos`, `  https://m.youtube.com/channel/${UC}?si=abc `,
    `https://studio.youtube.com/channel/${UC}/editing/profile`, UC, `<https://www.youtube.com/channel/${UC}>`,
  ]) {
    const r = h.parseChannelInput(s)
    assert.equal(r.ok, true, s)
    assert.equal(r.kind, 'uc')
    assert.equal(r.ucId, UC)
    assert.equal(r.url, `https://www.youtube.com/channel/${UC}`)
  }
  // ma 21 ky tu (doc tu khung hinh video) van nhan
  assert.equal(h.parseChannelInput('UCitoIKeXItD9AMFdyKdXZA').ok, true)
})

test('link kenh: @handle', () => {
  for (const s of ['@biblegenesis9999', 'https://www.youtube.com/@biblegenesis9999', 'youtube.com/@biblegenesis9999/featured']) {
    const r = h.parseChannelInput(s)
    assert.equal(r.ok, true, s)
    assert.equal(r.kind, 'handle')
    assert.equal(r.handle, '@biblegenesis9999')
    assert.equal(r.url, 'https://www.youtube.com/@biblegenesis9999')
  }
  assert.equal(h.parseChannelInput('@KênhHay.vn').ok, true, 'handle co dau')
})

test('link kenh: loi bang tieng Viet', () => {
  const err = (s) => h.parseChannelInput(s).error
  assert.match(err(''), /Chưa nhập link kênh/)
  assert.match(err(`https://www.youtube.com/playlist?list=${PL}`), /link danh sách phát, không phải link kênh/)
  assert.match(err('https://www.youtube.com/watch?v=abcdefghijk'), /link video/)
  assert.match(err('https://www.youtube.com/c/TenKenh'), /\/c\/ hoặc \/user\//)
  assert.match(err('https://example.com/channel/' + UC), /Không phải link YouTube/)
  assert.match(err('UC123'), /UC \+ 22 ký tự/)
  assert.match(err('@a'), /Handle không hợp lệ/)
  assert.match(err('https://www.youtube.com/channel/abc'), /thiếu mã UC/)
})

test('link danh sach phat', () => {
  for (const s of [
    `https://www.youtube.com/playlist?list=${PL}`, `youtube.com/playlist?list=${PL}&si=x`, `https://www.youtube.com/watch?v=abcdefghijk&list=${PL}&index=2`,
    `https://studio.youtube.com/playlist/${PL}/edit`, PL, `https://youtu.be/abcdefghijk?list=${PL}`,
  ]) {
    const r = h.parsePlaylistInput(s)
    assert.equal(r.ok, true, s)
    assert.equal(r.id, PL)
    assert.equal(r.url, `https://www.youtube.com/playlist?list=${PL}`)
  }
  assert.equal(h.parsePlaylistInput('OLAK5uy_kAbcdefghijklmnop').ok, true, 'album')
})

test('link danh sach phat: loi bang tieng Viet', () => {
  const err = (s) => h.parsePlaylistInput(s).error
  assert.match(err(' '), /Chưa nhập link danh sách phát/)
  assert.match(err(`https://www.youtube.com/channel/${UC}`), /link kênh, không phải/)
  assert.match(err('https://www.youtube.com/watch?v=abcdefghijk'), /thiếu "list="/)
  assert.match(err('https://www.youtube.com/watch?v=x&list=RDabcdefghijklmn'), /Mix/)
  assert.match(err('https://www.youtube.com/playlist?list=WL'), /Xem sau/)
  assert.match(err('XYZ123'), /không hợp lệ/)
  assert.match(err('https://vimeo.com/playlist?list=' + PL), /Không phải link YouTube/)
})

test('vi tri', () => {
  assert.deepEqual(h.parsePosition(''), { ok: true, value: 0 })
  assert.deepEqual(h.parsePosition('cuối'), { ok: true, value: 0 })
  assert.deepEqual(h.parsePosition(0), { ok: true, value: 0 })
  assert.deepEqual(h.parsePosition('4'), { ok: true, value: 4 })
  assert.match(h.parsePosition('13').error, /từ 1 đến 12/)
  assert.match(h.parsePosition('2.5').error, /số nguyên/)
})

test('kiem ca bo dau vao', () => {
  const ok = h.checkInput({ channelUrl: UC, playlistUrl: PL, position: 4 })
  assert.equal(ok.ok, true)
  assert.equal(ok.position.value, 4)
  const off = h.checkInput({ channelUrl: '', playlistUrl: PL, doChannel: false })
  assert.equal(off.ok, true, 'tat them kenh thi khong can link kenh')
  assert.equal(off.channel.error, '')
  const none = h.checkInput({ channelUrl: UC, playlistUrl: PL, doChannel: false, doPlaylist: false })
  assert.match(none.errors[0], /ít nhất một việc/)
  const bad = h.checkInput({ channelUrl: 'abc', playlistUrl: '' })
  assert.equal(bad.ok, false)
  assert.equal(bad.errors.length, 2)
})

test('kenh dich trung kenh moi', () => {
  assert.equal(h.sameChannel({ ucId: UC }, { ucId: UC }), true)
  assert.equal(h.sameChannel({ ucId: UC }, { ucId: 'UCitoIKeXItD9AMFdyKdXZAx' }), false)
  assert.equal(h.sameChannel({ handle: '@BibleGenesis9999' }, { ucId: 'UCx', handle: 'biblegenesis9999' }), true)
  assert.equal(h.sameChannel({ handle: '' }, { handle: '' }), false)
})

test('danh sach kenh cua tinh nang giu anh dai dien tu trang Tai khoan', () => {
  const img = 'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj'
  const accs = [{
    id: 'tk-1', channels: [
      { key: UC, ucId: UC, name: 'Dark Faith 2nd', handle: '@DarkFaith9999', subs: '49.300 người đăng ký', avatar: img },
      { name: '28k s', handle: '@28ks-p5n', subs: '' }, // ban cu: chua co truong avatar
    ],
  }]
  const ctx = { state: { f: {} }, accounts: { list: () => accs }, push() {}, log() {} }
  const f = require('../src/features/hometab')(ctx)
  f.start()
  const list = ctx.state.f.hometab.channels
  assert.deepEqual(list.map((c) => [c.key, c.avatar, c.subs, c.accountId]), [
    [UC, img, '49.300 người đăng ký', 'tk-1'],
    ['tk-1:28k s', '', '', 'tk-1'],
  ])
  // anh moi o trang Tai khoan -> hometab_refresh lay theo, khong tai lai
  accs[0].channels[1].avatar = img
  f.commands.hometab_refresh()
  assert.equal(ctx.state.f.hometab.channels[1].avatar, img)
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
