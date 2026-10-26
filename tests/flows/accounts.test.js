// Bai kiem cho src/flows/channels.js tren Studio gia (tests/mock-yt/accounts)
const assert = require('assert')
const flows = require('../../src/flows/channels')
const { ACCOUNTS, avatarUrl } = require('../mock-yt/accounts/routes')

const THANG = { ...ACCOUNTS['athang@versee.net'], channels: ACCOUNTS['athang@versee.net'].channels.filter((c) => !c.deleted) }
const ucOf = (name) => THANG.channels.find((c) => c.name === name).uc
// anh dai dien tren Studio gia: <base>/yt3/<UC>=s48-... ('' khi kenh khong co anh)
const avatarOf = (urls, name) => { const c = THANG.channels.find((x) => x.name === name); return c.noImg ? '' : new URL(avatarUrl(c), urls.studio).href }

// dang nhap Google gia trong phien cua bai kiem (nhu nguoi dung go email + "Tiep theo")
async function signIn(page, urls, email = 'athang@versee.net') {
  await page.goto(`${urls.studio}/`)
  await page.waitUrl(/\/signin/)
  await page.type({ selector: '#identifierId' }, email)
  await page.click('Tiếp theo')
  await page.waitUrl(/\/channel\/UC/, { timeout: 8000 })
}

module.exports = [
  ['chua dang nhap: openStudio bao signedOut', async ({ page, urls }) => {
    const r = await flows.openStudio(page, { urls, timeout: 8000 })
    assert.equal(r.signedOut, true)
    await assert.rejects(flows.listChannels(page, { urls }), /chưa đăng nhập/)
  }],
  ['doc danh sach kenh: bo "Khong co kenh" va "Cac tai khoan khac"', async ({ page, urls }) => {
    await signIn(page, urls)
    const r = await flows.listChannels(page, { urls })
    assert.equal(r.email, 'athang@versee.net')
    assert.equal(r.account, 'Thắng A')
    assert.deepEqual(r.channels.map((c) => c.name), THANG.channels.map((c) => c.name))
    const df = r.channels.find((c) => c.name === 'Dark Faith 2nd')
    assert.deepEqual(df, { name: 'Dark Faith 2nd', handle: '@DarkFaith9999', subs: '49.300 người đăng ký', active: true, avatar: avatarOf(urls, 'Dark Faith 2nd') })
    // anh nap muon (Studio gia dat src sau 0,4 giay): phai cho doc du; kenh khong co anh -> ''
    assert.deepEqual(r.channels.map((c) => c.avatar), THANG.channels.map((c) => avatarOf(urls, c.name)))
    assert.equal(r.channels.find((c) => c.name === '28k s').avatar, '')
    assert.equal(r.channels.filter((c) => c.active).length, 1)
    assert.equal(r.channels.find((c) => c.name === '28k s').subs, 'Không có người đăng ký')
    assert(!r.channels.some((c) => ['Justice Stories', 'Leo Nguyen', 'Thắng A', 'Black America TV'].includes(c.name)))
    assert.deepEqual(r.current, { ucId: ucOf('Dark Faith 2nd'), name: 'Dark Faith 2nd' })
  }],
  ['chuyen kenh (theo ten, chua biet UC) roi kiem; qua trang trung gian khong co UC', async ({ page, urls, mock }) => {
    await signIn(page, urls)
    // dong nam cuoi danh sach cuon: phai cuon toi moi bam duoc
    const r = await flows.switchChannel(page, { name: 'Simple Bible Animation', handle: '@BibleSimpleAnimation68' }, { urls })
    assert.deepEqual(r, { ucId: ucOf('Simple Bible Animation'), name: 'Simple Bible Animation' })
    assert(mock.hits.some((h) => /^GET \/studio\/$/.test(h)), 'di qua studio.youtube.com')
    // biet UC: chuyen tiep, va dang o kenh do thi khong mo menu
    const r2 = await flows.switchChannel(page, { name: 'Dark Bible Stories', handle: '@BibleStoriies', ucId: 'UCmock000000000000000000' }, { urls })
    assert.equal(r2.ucId, 'UCmock000000000000000000')
    const n = mock.events.filter((e) => e.type === 'switch').length
    await flows.switchChannel(page, { name: 'Dark Bible Stories', ucId: 'UCmock000000000000000000' }, { urls })
    assert.equal(mock.events.filter((e) => e.type === 'switch').length, n)
    // kenh khong co @handle: tim theo ten
    const r3 = await flows.switchChannel(page, { name: 'Dark Bible - in a Nutshell' }, { urls })
    assert.equal(r3.ucId, ucOf('Dark Bible - in a Nutshell'))
    assert(!mock.events.some((e) => ['other-account-click', 'create-channel-click', 'deleted-click'].includes(e.type)))
    await assert.rejects(flows.switchChannel(page, { name: 'Black America TV', handle: '@BlackAmericaTV9999' }, { urls }), /Không thấy kênh "Black America TV"/)
  }],
  ['kenh dang chon (dau ✓) nhung chua biet UC: khong bam, hoc UC tu dia chi', async ({ page, urls, mock }) => {
    await signIn(page, urls)
    const r = await flows.switchChannel(page, { name: 'Dark Faith 2nd' }, { urls })
    assert.equal(r.ucId, ucOf('Dark Faith 2nd'))
    assert(!mock.events.some((e) => e.type === 'switch'))
  }],
  ['sai UC / kenh khong co: bao loi ro rang', async ({ page, urls }) => {
    await signIn(page, urls)
    await assert.rejects(flows.switchChannel(page, { name: 'Justice Stories' }, { urls }), /Không thấy kênh "Justice Stories"/)
    // UC da luu khong khop kenh that (vd. nham kenh): kiem lai phai bat duoc
    await assert.rejects(flows.switchChannel(page, { name: 'Dark Bible Study', ucId: 'UCkhongphaikenhnay000000' }, { urls, timeout: 4000 }), /không phải kênh|Studio chuyển sang kênh/)
  }],
  ['giao dien la (khong co the/id quen thuoc): doan theo chu', async ({ page, urls }) => {
    await signIn(page, urls)
    await page.eval(() => { document.cookie = 'MOCK_PLAIN=1; path=/' })
    await page.goto(page.url())
    const r = await flows.listChannels(page, { urls })
    assert.equal(r.channels.length, 7)
    assert.equal(r.email, 'athang@versee.net')
    assert.deepEqual(r.channels[3], { name: 'Dark Faith 2nd', handle: '@DarkFaith9999', subs: '49.300 người đăng ký', active: true, avatar: avatarOf(urls, 'Dark Faith 2nd') })
    assert.equal(r.current.name, 'Dark Faith 2nd')
    const s = await flows.switchChannel(page, { name: 'Dark Bible Study', handle: '@DarkBibleStudy999' }, { urls })
    assert.deepEqual(s, { ucId: ucOf('Dark Bible Study'), name: 'Dark Bible Study' })
  }],
  ['HTML that cua Studio (yt-1-trang-chu): doc dong kenh, bo kenh da xoa va "Cac tai khoan khac"', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/real-switcher`)
    const r = await page.eval(flows.readRows, flows.SEL, flows.LABELS)
    assert.equal(r.email, 'nguyentatthang191@gmail.com')
    assert.equal(r.account, 'Thắng Nguyễn')
    assert.deepEqual(r.channels.map((c) => `${c.name} ${c.handle}${c.active ? ' ✓' : ''}`), [
      'Thắng Nguyễn @ThắngNguyễn-d3i1l', 'Dark Bible Movie @DarkBibleMovie ✓', 'Dark Biblical Wisdom @OldBiblicalWisdom6688',
      'Thắng Nguyễn @ThangNguyen-mi4hf', 'Kenh chuyen doi @Kenhchuyendoi-g2q', 'Immersive Bible Stories @ImmersiveBibleStories',
    ])
    assert.equal(r.channels[1].subs, '31.500 người đăng ký')
    assert.equal(r.channels[0].subs, 'Không có người đăng ký')
    // anh dai dien: <yt-img-shadow><img id="img" src> trong #contentIcon
    assert.equal(r.channels[1].avatar, new URL('/yt3/Niz-Imk-TW8EQvjciue1d6VtWSQKCT1wAuIsCI5adgF6VlemE0r5xsaa4pTDNR6RrGycocebxQ=s48-c-k-c0x00ffffff-no-rj', urls.studio).href)
    assert(r.channels.every((c) => /\/yt3\/[\w/-]+=s48-/.test(c.avatar)))
    assert.equal(flows.bigAvatar(r.channels[1].avatar.replace(/^http:\/\/[^/]+\/yt3/, 'https://yt3.ggpht.com')), 'https://yt3.ggpht.com/Niz-Imk-TW8EQvjciue1d6VtWSQKCT1wAuIsCI5adgF6VlemE0r5xsaa4pTDNR6RrGycocebxQ=s88-c-k-c0x00ffffff-no-rj')
    assert.equal(await page.eval(flows.readSidebar, flows.SEL, flows.LABELS), 'Dark Bible Movie')
  }],
]
