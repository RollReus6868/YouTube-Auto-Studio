// YouTube Studio gia cho tai khoan / kenh: dang nhap Google (cookie MOCK_SID), trang tong quan
// kenh, menu avatar -> "Chuyen doi tai khoan" voi cac kenh cua tai khoan (giong khung hinh video
// "chuyen doi nick youtube"). Kenh dang chon nho trong cookie MOCK_CH.
const fs = require('fs')
const path = require('path')

const uc = (seed) => `UC${(seed.replace(/[^\w-]/g, '') + '0'.repeat(22)).slice(0, 22)}`
const ACCOUNTS = {
  'athang@versee.net': {
    name: 'Thắng A',
    personal: 'Thắng A', // tai khoan ca nhan "Khong co kenh"
    def: 'Dark Faith 2nd',
    channels: [
      { name: 'Dark Bible Room', handle: '@DarkRoom6868', subs: '415 người đăng ký', uc: uc('DarkRoom6868') },
      { name: 'Dark Bible - in a Nutshell', handle: '@Bible-inaNutshell999', subs: '220 người đăng ký', uc: uc('Nutshell999') },
      // kenh khong co anh dai dien (chi chu cai): tool luu avatar ''
      { name: '28k s', handle: '@28ks-p5n', subs: 'Không có người đăng ký', uc: uc('28ksp5n'), noImg: true },
      { name: 'Dark Faith 2nd', handle: '@DarkFaith9999', subs: '49.300 người đăng ký', uc: uc('DarkFaith9999') },
      { name: 'Dark Bible Study', handle: '@DarkBibleStudy999', subs: '362 người đăng ký', uc: uc('DarkBibleStudy999') },
      // UC co dinh (cac bai kiem dung UCmock...)
      { name: 'Dark Bible Stories', handle: '@BibleStoriies', subs: '207.000 người đăng ký', uc: 'UCmock000000000000000000' },
      { name: 'Simple Bible Animation', handle: '@BibleSimpleAnimation68', subs: '579 người đăng ký', uc: uc('BibleSimpleAnimation68') },
      // kenh da xoa nhung van la nguoi quan ly (co trong HTML that): khong duoc chon
      { name: 'Black America TV', handle: '@BlackAmericaTV9999', subs: 'Đã xoá kênh • Bạn là người quản lý', uc: uc('BlackAmericaTV9999'), deleted: true },
    ],
  },
  'rollreus94@gmail.com': {
    name: 'Leo Nguyen',
    def: 'Leo Nguyen',
    channels: [
      { name: 'Leo Nguyen', handle: '@leonguyen94', subs: 'Không có người đăng ký', uc: uc('LeoNguyen94') },
      { name: 'Dark Bible Room', handle: '@DarkRoom6868', subs: '415 người đăng ký', uc: uc('DarkRoom6868') },
      { name: 'Justice Stories', handle: '@JusticeStories', subs: '87 người đăng ký', uc: uc('JusticeStories') },
    ],
  },
}

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => {
  const i = c.indexOf('=')
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]
}))
const session = (req) => {
  const c = cookies(req)
  const acc = ACCOUNTS[c.MOCK_SID]
  if (!acc) return null
  const active = acc.channels.find((x) => x.uc === c.MOCK_CH) || acc.channels.find((x) => x.name === acc.def)
  return { email: c.MOCK_SID, acc, active, plain: c.MOCK_PLAIN === '1' }
}
// anh dai dien gia, dia chi giong yt3.ggpht.com: /yt3/<UC>=s48-c-k-c0x00ffffff-no-rj (khong ra mang)
const avatarUrl = (c) => (c.noImg ? '' : `/yt3/${c.uc}=s48-c-k-c0x00ffffff-no-rj`)
const avatarSvg = (res, ucId) => {
  const c = Object.values(ACCOUNTS).flatMap((a) => a.channels).find((x) => x.uc === ucId)
  const name = c ? c.name : ucId // anh cua real-switcher.html: mau theo id
  const hue = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360
  res.setHeader('content-type', 'image/svg+xml')
  res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="hsl(${hue},60%,35%)"/><circle cx="24" cy="19" r="9" fill="hsl(${hue},70%,75%)"/><path d="M8 46c2-11 9-16 16-16s14 5 16 16z" fill="hsl(${hue},70%,75%)"/></svg>`)
}
const redirect = (res, to) => { res.statusCode = 302; res.setHeader('location', to); res.end() }
const html = (res, file, data) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  let s = fs.readFileSync(path.join(__dirname, file), 'utf8')
  if (data) s = s.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'))
  res.end(s)
}

module.exports = [
  [/^\/yt3\/([\w/-]+)=s\d+/, (req, res, m) => avatarSvg(res, m[1])],
  // doan HTML that (khung "Chuyen doi tai khoan" dang mo) de kiem cach doc dong kenh
  [/^\/studio\/real-switcher/, 'real-switcher.html'],
  // trang dang nhap Google gia: nhap email -> cookie MOCK_SID
  [/^\/studio\/signin/, (req, res) => html(res, 'signin.html', { emails: Object.keys(ACCOUNTS) })],
  [/^\/studio\/__login\?email=([^&]+)/, (req, res, m) => {
    const email = decodeURIComponent(m[1])
    if (!ACCOUNTS[email]) { res.statusCode = 400; return res.end('khong co tai khoan') }
    res.setHeader('set-cookie', [`MOCK_SID=${encodeURIComponent(email)}; Path=/; Max-Age=86400`, 'MOCK_CH=; Path=/; Max-Age=0'])
    res.end('ok')
  }],
  [/^\/studio\/__logout/, (req, res) => {
    res.setHeader('set-cookie', ['MOCK_SID=; Path=/; Max-Age=0', 'MOCK_CH=; Path=/; Max-Age=0'])
    redirect(res, '/studio/signin')
  }],
  [/^\/studio\/__switch\?uc=([\w-]+)/, (req, res, m, server) => {
    const s = session(req)
    const ch = s && s.acc.channels.find((x) => x.uc === m[1])
    if (!ch) { res.statusCode = 403; return res.end('khong quan ly kenh nay') }
    server.events.push({ type: 'switch', email: s.email, uc: ch.uc, name: ch.name })
    res.setHeader('set-cookie', `MOCK_CH=${ch.uc}; Path=/; Max-Age=86400`)
    res.end('ok')
  }],
  // studio.youtube.com: chua dang nhap -> trang dang nhap; da dang nhap -> qua trang trung gian
  // "YouTube Creator Studio" (~0,7 s, khong co UC trong dia chi) roi toi kenh dang chon
  [/^\/studio\/?(\?.*)?$/, (req, res, m, server) => {
    server.events.push({ type: 'studio', ua: req.headers['user-agent'] || '', lang: req.headers['accept-language'] || '' })
    const s = session(req)
    if (!s) return redirect(res, '/studio/signin')
    html(res, 'interstitial.html', { to: `/studio/channel/${s.active.uc}` })
  }],
  [/^\/studio\/channel\/(UC[\w-]{22})(\/[^?]*)?/, (req, res, m) => {
    const s = session(req)
    if (!s) return redirect(res, '/studio/signin')
    if (m[1] !== s.active.uc) return redirect(res, `/studio/channel/${s.active.uc}`) // kenh khac: ve kenh dang chon
    const other = Object.entries(ACCOUNTS).find(([e]) => e !== s.email)
    html(res, 'dashboard.html', {
      plain: s.plain,
      account: { name: s.acc.name, email: s.email, personal: s.acc.personal || '' },
      active: s.active,
      channels: s.acc.channels.map((c) => ({ ...c, avatar: avatarUrl(c) })),
      others: other ? { email: other[0], channels: other[1].channels.map((c) => ({ name: c.name, subs: c.subs, avatar: avatarUrl(c) })) } : null,
    })
  }],
]
module.exports.ACCOUNTS = ACCOUNTS
module.exports.avatarUrl = avatarUrl
