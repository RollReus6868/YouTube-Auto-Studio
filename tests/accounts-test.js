// Kiem thu src/accounts.js (danh sach tai khoan Google, kenh, token API theo kenh):  node tests/accounts-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Store } = require('../src/store')
const A = require('../src/accounts')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ya-tk-'))
const tests = []
const test = (name, fn) => tests.push([name, fn])
const fakeCrypt = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(`enc:${s}`), decryptString: (b) => b.toString().slice(4) }
const found = [
  { name: 'Dark Bible Room', handle: '@DarkRoom6868', subs: '415 người đăng ký', active: false },
  { name: 'Dark Faith 2nd', handle: '@DarkFaith9999', subs: '49.300 người đăng ký', active: true },
  { name: 'Justice Stories', handle: '', subs: '87 người đăng ký', active: false },
]

test('lan dau: tao "Tai khoan 1" (phien moi); co phien 0.3 thi dung lai persist:youtube', () => {
  const fresh = new A.Accounts(new Store(tmp()))
  assert.deepEqual(fresh.list().map((a) => [a.id, a.label, a.partition, a.status]), [['tk-1', 'Tài khoản 1', 'persist:yt-tk-1', 'unchecked']])
  const dir = tmp()
  const old = new A.Accounts(new Store(dir), { legacy: true })
  assert.equal(old.migrated, true)
  assert.equal(old.list()[0].partition, A.LEGACY_PARTITION)
  // lan mo sau: doc tu settings.json, khong di tru lai
  const again = new A.Accounts(new Store(dir), { legacy: true })
  assert(!again.migrated)
  assert.equal(again.list()[0].partition, 'persist:youtube')
  assert(!JSON.stringify(new Store(dir).settings).match(/password|mat ?khau/i))
})

test('them / doi ten / xoa; id tu ten goi nho, khong trung; phien rieng', () => {
  const m = new A.Accounts(new Store(tmp()))
  const a = m.add('Thắng A')
  const b = m.add('Thắng A')
  assert.equal(a.id, 'thang-a')
  assert.equal(b.id, 'thang-a-2')
  assert.equal(b.partition, 'persist:yt-thang-a-2')
  assert(m.rename(a.id, '  Nick chính '))
  assert.equal(m.get(a.id).label, 'Nick chính')
  assert(!m.rename(a.id, '  '))
  assert.equal(m.remove(b.id).id, 'thang-a-2')
  assert.equal(m.remove('khong-co'), null)
  assert.deepEqual(m.list().map((x) => x.id), ['tk-1', 'thang-a'])
  // phien cua tai khoan khong doi duoc tu ngoai (vd sua tay settings.json)
  assert.equal(m.clean({ id: 'x', partition: 'persist:khac' }).partition, 'persist:yt-x')
})

test('trang thai + email; dang xuat giu kenh va lua chon', () => {
  const m = new A.Accounts(new Store(tmp()))
  m.update('tk-1', { status: 'signed-in', email: 'a@b.c', name: 'Thắng A' })
  m.update('tk-1', { status: 'khong-hop-le' })
  const a = m.get('tk-1')
  assert.equal(a.status, 'signed-in')
  assert.equal(a.email, 'a@b.c')
  m.setChannels('tk-1', found)
  m.setEnabled('tk-1:Dark Faith 2nd', true)
  m.signedOut('tk-1')
  assert.equal(m.get('tk-1').status, 'needs-sign-in')
  assert.equal(m.get('tk-1').channels.length, 3)
  assert(m.get('tk-1').channels.find((c) => c.name === 'Dark Faith 2nd').enabled)
})

test('kenh: ghep danh sach moi giu tick + UC; hoc UC luc chuyen kenh; khoa doi sang UC', () => {
  const m = new A.Accounts(new Store(tmp()))
  m.setChannels('tk-1', found)
  assert.deepEqual(m.channels(), [], 'kenh moi chua tick')
  assert(m.setEnabled('tk-1:Dark Faith 2nd', true))
  assert(m.setEnabled('tk-1:Justice Stories', true))
  assert.deepEqual(m.channels().map((c) => c.key), ['tk-1:Dark Faith 2nd', 'tk-1:Justice Stories'])
  const uc = 'UCLBuhr6vMvZQPqZpTTslWaQ'
  const l = m.learn('tk-1', { ucId: uc, name: 'Dark Faith 2nd', handle: '@DarkFaith9999' })
  assert.equal(l.key, uc)
  assert.equal(m.find(uc).name, 'Dark Faith 2nd')
  assert.equal(m.find('tk-1:Dark Faith 2nd').ucId, uc, 'khoa cu van tim duoc')
  assert.equal(m.find(uc).accountId, 'tk-1')
  assert.equal(m.byUc(uc).channel.name, 'Dark Faith 2nd')
  assert.equal(m.learn('tk-1', { ucId: 'khong-phai-uc', name: 'x' }), null)
  // lam moi kenh: doi ten nhung cung @handle -> giu tick + UC; kenh bien mat -> bo
  m.setChannels('tk-1', [{ name: 'Dark Faith (moi)', handle: '@DarkFaith9999', subs: '50.000 người đăng ký' }, found[0]])
  const df = m.find(uc)
  assert.equal(df.name, 'Dark Faith (moi)')
  assert(df.enabled)
  assert.equal(m.find('tk-1:Justice Stories'), null)
  assert.deepEqual(m.channels().map((c) => c.key), [uc])
  // kenh chua co trong danh sach (vd. Studio mo thang kenh do): them vao
  const n = m.learn('tk-1', { ucId: 'UCC0AJ_NoUOq5718yK4_ehBw', name: 'Dark Bible Stories' })
  assert.equal(n.name, 'Dark Bible Stories')
  assert.equal(m.get('tk-1').channels.filter((c) => c.active).length, 1)
  // luu lai qua lan mo app
  const again = new A.Accounts(new Store(m.store.dir))
  assert.equal(again.find(uc).name, 'Dark Faith (moi)')
})

test('hai kenh trung ten (khac @handle): khoa rieng, tick rieng', () => {
  const m = new A.Accounts(new Store(tmp()))
  m.setChannels('tk-1', [{ name: 'Thắng Nguyễn', handle: '@ThắngNguyễn-d3i1l', subs: 'Không có người đăng ký' }, { name: 'Thắng Nguyễn', handle: '@ThangNguyen-mi4hf', subs: 'Không có người đăng ký' }, found[0]])
  const keys = m.list()[0].channels.map((c) => c.key)
  assert.deepEqual(keys, ['tk-1:Thắng Nguyễn @ThắngNguyễn-d3i1l', 'tk-1:Thắng Nguyễn @ThangNguyen-mi4hf', 'tk-1:Dark Bible Room'])
  assert(m.setEnabled(keys[1], true))
  assert.deepEqual(m.channels().map((c) => c.handle), ['@ThangNguyen-mi4hf'])
  assert.equal(m.find(keys[0]).handle, '@ThắngNguyễn-d3i1l')
})

test('tai khoan chi co mot kenh: tu tick', () => {
  const m = new A.Accounts(new Store(tmp()))
  m.setChannels('tk-1', [found[1]])
  assert.equal(m.channels().length, 1)
})

test('token API ban 0.3 -> token cua kenh; kiem dung kenh sau khi dang nhap', () => {
  const s = new Store(tmp(), fakeCrypt)
  s.save({ youtubeChannel: { id: 'UCmock000000000000000000', title: 'Kênh A' } })
  s.setSecret('youtubeToken', '{"refresh_token":"r"}')
  assert(A.migrateApiToken(s))
  assert(!s.hasSecret('youtubeToken'))
  assert.equal(s.getSecret(A.tokenName('UCmock000000000000000000')), '{"refresh_token":"r"}')
  assert.deepEqual(s.settings.apiChannels, [{ id: 'UCmock000000000000000000', title: 'Kênh A' }])
  assert(!A.migrateApiToken(s))
  const fresh = new Store(tmp(), fakeCrypt)
  A.migrateApiToken(fresh)
  assert.deepEqual(fresh.settings.apiChannels, [])

  assert.equal(A.checkApiChannel({ id: 'UCa', title: 'A' }, null), null)
  assert.equal(A.checkApiChannel({ id: 'UCa', title: 'A' }, { ucId: 'UCa', name: 'A' }), null)
  assert.match(A.checkApiChannel({ id: 'UCb', title: 'Kênh B' }, { ucId: 'UCa', name: 'Kênh A' }), /chọn kênh "Kênh B".*không phải kênh "Kênh A"/)
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
