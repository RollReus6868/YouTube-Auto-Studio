// Bai kiem cho src/flows/post.js voi trang gia tests/mock-yt/posts (tab Bai dang cua kenh)
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { createPost } = require('../../src/flows/post')

// PNG that (giai ma duoc) kich thuoc w x h, mot mau
function png(file, w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  return file
}
const CH = { ucId: 'UCC0AJ_NoUOq5718yK4_ehBw', handle: '@BibleStoriies', name: 'Dark Bible Stories' }
const run = (ctx, input) => createPost(ctx.page, { channel: CH, ...input }, { urls: ctx.urls, log: (l, m) => ctx.logs.push(`${l} ${m}`) })
const db = (mock) => (mock.server.postsDb = mock.server.postsDb || [])
const fresh = (mock, rows = []) => { mock.server.postsDb = rows }
const inDays = (d, h, m = 0) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, m, 0, 0); return t }

module.exports = [
  ['bai chu nhieu dong, co @, dang ngay -> lay duong dan bai', async (ctx) => {
    fresh(ctx.mock)
    const r = await run(ctx, { type: 'text', text: 'Lịch ra video tuần này 🎬\nThứ 3 và thứ 5 lúc 19h, nhớ ghé @BibleStoriies' })
    assert.equal(r.status, 'posted')
    assert.match(r.url, /\/yt\/post\/UgkxMock0001$/)
    const [p] = db(ctx.mock)
    assert.deepEqual([p.type, p.text, p.scheduledAt], ['text', 'Lịch ra video tuần này 🎬\nThứ 3 và thứ 5 lúc 19h, nhớ ghé @BibleStoriies', null])
    assert(ctx.mock.hits.some((h) => h.startsWith('GET /yt/channel/UCC0AJ_NoUOq5718yK4_ehBw/posts')), 'mo bang /channel/UC.../posts')
  }],
  ['bai anh (3 anh) + chu', async (ctx) => {
    fresh(ctx.mock)
    const files = [png(path.join(ctx.tmp, '1.png'), 64, 64), png(path.join(ctx.tmp, '2.png'), 80, 48), png(path.join(ctx.tmp, '3.png'), 40, 90)]
    const r = await run(ctx, { type: 'image', text: 'Bìa mới', images: files })
    assert.equal(r.status, 'posted')
    assert.deepEqual(db(ctx.mock)[0].images, ['1.png', '2.png', '3.png'])
    assert.equal(db(ctx.mock)[0].text, 'Bìa mới')
  }],
  ['bai anh khong chu: lay duong dan theo link /post/ moi', async (ctx) => {
    fresh(ctx.mock, [{ id: 'UgkxCu', type: 'text', text: 'bài cũ', scheduledAt: null }])
    const r = await run(ctx, { type: 'image', text: '', images: [png(path.join(ctx.tmp, 'a.png'), 50, 50)] })
    assert.equal(r.status, 'posted')
    assert.match(r.url, /UgkxMock0002$/)
  }],
  ['anh sai ty le -> trang bao loi, khong dang', async (ctx) => {
    fresh(ctx.mock)
    await assert.rejects(run(ctx, { type: 'image', text: 'x', images: [png(path.join(ctx.tmp, 'dai.png'), 300, 40)] }), /YouTube báo: .*tỷ lệ/)
    assert.equal(db(ctx.mock).length, 0)
  }],
  ['qua 10 anh -> loi truoc khi mo trang', async (ctx) => {
    const files = Array.from({ length: 11 }, (_, i) => path.join(ctx.tmp, `${i}.png`))
    const n = ctx.mock.hits.length
    await assert.rejects(run(ctx, { type: 'image', text: 'x', images: files }), /11 ảnh, YouTube chỉ cho tối đa 10/)
    assert.equal(ctx.mock.hits.length, n, 'khong mo trang nao')
  }],
  ['tham do van ban 3 lua chon', async (ctx) => {
    fresh(ctx.mock)
    const r = await run(ctx, { type: 'poll', text: 'Bạn thích bìa nào?', options: [{ text: 'Bìa A' }, { text: 'Bìa B' }, { text: 'Bìa C' }] })
    assert.equal(r.status, 'posted')
    assert.deepEqual(db(ctx.mock)[0].options, ['Bìa A', 'Bìa B', 'Bìa C'])
    assert.equal(db(ctx.mock)[0].type, 'poll')
  }],
  ['tham do 5 lua chon -> loi (toi da 4)', async (ctx) => {
    fresh(ctx.mock)
    await assert.rejects(run(ctx, { type: 'poll', text: 'Hỏi?', options: ['a', 'b', 'c', 'd', 'e'].map((text) => ({ text })) }), /Không thêm được lựa chọn thứ 5/)
    assert.equal(db(ctx.mock).length, 0)
    assert.equal(await ctx.page.has({ regex: '^Thêm lựa chọn$' }), false, 'da bam Huy de khung soan sach')
  }],
  ['tham do anh 3 lua chon co anh', async (ctx) => {
    fresh(ctx.mock)
    const options = ['Bìa A', 'Bìa B', 'Bìa C'].map((text, i) => ({ text, image: png(path.join(ctx.tmp, `${i + 1}.png`), 60, 60) }))
    const r = await run(ctx, { type: 'image_poll', text: 'Chọn bìa', options })
    assert.equal(r.status, 'posted')
    assert.deepEqual(db(ctx.mock)[0].options, [{ text: 'Bìa A', image: '1.png' }, { text: 'Bìa B', image: '2.png' }, { text: 'Bìa C', image: '3.png' }])
  }],
  ['do vui: cau dung thu 2, anh cho cau 3 (o chon file tao khi bam), giai thich', async (ctx) => {
    fresh(ctx.mock)
    const answers = [{ text: 'Áp-ra-ham' }, { text: 'Môi-se', correct: true }, { text: 'Đa-vít', image: png(path.join(ctx.tmp, 'dv.png'), 50, 50) }]
    const r = await run(ctx, { type: 'quiz', text: 'Ai dẫn dân ra khỏi Ai Cập?', answers, explanation: 'Môi-se dẫn dân Israel.' })
    assert.equal(r.status, 'posted')
    const p = db(ctx.mock)[0]
    assert.deepEqual(p.answers, [{ text: 'Áp-ra-ham', image: '', correct: false }, { text: 'Môi-se', image: '', correct: true }, { text: 'Đa-vít', image: 'dv.png', correct: false }])
    assert.equal(p.explanation, 'Môi-se dẫn dân Israel.')
  }],
  ['chia se video qua hop tim kiem (dan URL)', async (ctx) => {
    fresh(ctx.mock)
    const r = await run(ctx, { type: 'video', text: 'Xem tập mới!', video: 'ZyXwVuTsRqP' })
    assert.equal(r.status, 'posted')
    assert.deepEqual([db(ctx.mock)[0].type, db(ctx.mock)[0].video], ['video', 'ZyXwVuTsRqP'])
  }],
  ['len lich: lich + o gio 15 phut -> the trong DA LEN LICH', async (ctx) => {
    fresh(ctx.mock)
    const at = inDays(3, 19, 0)
    const r = await run(ctx, { type: 'text', text: 'Bài hẹn giờ', when: at.toISOString() })
    assert.equal(r.status, 'scheduled')
    const p2 = (n) => String(n).padStart(2, '0')
    assert.equal(db(ctx.mock)[0].scheduledAt, `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())}T19:00`)
    assert.match(r.line, new RegExp(`Đã lên lịch đăng vào 19:00 ${at.getDate()} thg ${at.getMonth() + 1}, ${at.getFullYear()}`))
    assert.match(r.signal, /Đã lên lịch đăng bài của bạn|trống/)
    assert.match(ctx.page.url(), /pvf=CAE/)
  }],
  ['len lich anh, gio le 07:10 lam tron 07:15, ngay mai (mac dinh) khong can mo lich', async (ctx) => {
    fresh(ctx.mock)
    const at = inDays(1, 7, 10)
    const r = await run(ctx, { type: 'image', text: 'Ảnh hẹn giờ', images: [png(path.join(ctx.tmp, 'h.png'), 64, 64)], when: at.toISOString() })
    assert.equal(r.status, 'scheduled')
    assert.match(db(ctx.mock)[0].scheduledAt, /T07:15$/)
  }],
  // Loi 0.6.2 tren YouTube that: "Khong chon duoc gio 9:00 AM (o gio dang la 12:00 AM)" - danh sach mo, chuot
  // bam vao muc nhung khong chon. Ba bien the: danh sach dang hieu ung mo (khong nhan chuot), chuot that bi bo qua,
  // chi API select() cua paper-listbox chon duoc.
  ...[['timeAnim', { timeAnim: 1500 }, null], ['chuot that bi bo qua', { timeClick: 'trusted-ignored' }, /bấm bằng mã/], ['chi API select()', { timeClick: 'none' }, /chọn qua danh sách/]].map(([name, flags, via]) => [
    `len lich: chon gio khi danh sach gio ${name} -> van chon dung 9:00 PM`, async (ctx) => {
      fresh(ctx.mock)
      ctx.mock.server.postsFlags = flags
      try {
        const at = inDays(2, 21, 0)
        const r = await run(ctx, { type: 'text', text: `Hẹn giờ (${name})`, when: at.toISOString() })
        assert.equal(r.status, 'scheduled')
        assert.match(db(ctx.mock)[0].scheduledAt, /T21:00$/)
        const fb = ctx.logs.filter((l) => /Đã chọn giờ 9:00 PM \(cách dự phòng/.test(l))
        if (via) assert(fb.length === 1 && via.test(fb[0]), ctx.logs.join('\n'))
        else assert.equal(fb.length, 0, 'chuot that chon duoc thi khong can du phong')
      } finally { ctx.mock.server.postsFlags = {} }
    }]),
  // Loi 0.7.0 tren YouTube that: go ngay + Enter doi nhan ngay nhung bai len lich ngay cu (gia thuyet: o nhap chua "chot").
  // Nay bam o ngay trong lich (nhu nguoi dung); cac bien the nhan thang (tieng Anh / Viet / khong doc duoc).
  ...[['go + Enter chi doi nhan', { dateCommit: 'lag' }, 5], ['nhan thang tieng Viet', { calLabel: 'vi', dateCommit: 'lag' }, 9], ['nhan thang rong (theo o hom nay)', { calLabel: 'none', dateCommit: 'lag' }, 12], ['ngay o thang sau', { dateCommit: 'lag' }, 45]].map(([name, flags, days]) => [
    `len lich: chon ngay bang o trong lich (${name}) -> dung ngay, khong bao lech`, async (ctx) => {
      fresh(ctx.mock)
      ctx.mock.server.postsFlags = flags
      try {
        const at = inDays(days, 20, 0)
        const r = await run(ctx, { type: 'text', text: `Hẹn ngày (${name})`, when: at.toISOString() })
        const p2 = (n) => String(n).padStart(2, '0')
        assert.equal(db(ctx.mock)[0].scheduledAt, `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())}T20:00`)
        assert.equal(r.mismatch, '', r.mismatch)
        assert(!ctx.logs.some((l) => /cách dự phòng: gõ ngày|khác giờ mong muốn/.test(l)), ctx.logs.join('\n'))
      } finally { ctx.mock.server.postsFlags = {} }
    }]),
  // Loi that 11 + 13/11/2026: bai thu 2 tro di len lich theo ngay cua bai truoc (khung soan nho gio 00:00, doi ngay chi
  // doi nhan, chi chon gio moi "chot" ngay). Nay luon chon lai gio (moc ke ben truoc neu o gio da dung gio muon).
  ['len lich nhieu bai 00:00 lien tiep, YouTube chi chot ngay khi chon gio -> moi bai dung ngay', async (ctx) => {
    fresh(ctx.mock)
    ctx.mock.server.postsFlags = { commitOnTime: true }
    try {
      const p2 = (n) => String(n).padStart(2, '0')
      const key = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
      const want = [inDays(3, 0, 0), inDays(4, 0, 0), inDays(6, 0, 0), inDays(7, 23, 45)]
      for (let i = 0; i < want.length; i++) {
        const r = await run(ctx, { type: 'text', text: `Bài hẹn giờ số ${i + 1}`, when: want[i].toISOString() })
        assert.equal(r.mismatch, '', r.mismatch)
      }
      assert.deepEqual(db(ctx.mock).map((p) => p.scheduledAt), want.map(key))
    } finally { ctx.mock.server.postsFlags = {} }
  }],
  // Loi that 13/11/2026: khung trinh duyet rong 394 px -> bo cuc hep, khong bam duoc "Cau hoi". main.js gia lap man hinh
  // rong 1100 px roi thu nho (src/studio/fit.js); driver nhan toa do chuot voi ty le.
  ['khung hep (gia lap man hinh rong, thu nho): dang do vui hen gio van bam dung', async (ctx) => {
    fresh(ctx.mock)
    const { fitView } = require('../../src/studio/fit')
    ctx.win.setContentSize(420, 860)
    const fit = () => fitView(ctx.page.wc, 420, 860)
    ctx.page.wc.on('did-navigate', fit)
    assert.equal(fit(), 1, 'chua tai trang: chua gia lap (Electron SIGSEGV)')
    await ctx.page.goto(`${ctx.urls.youtube}/channel/${CH.ucId}/posts`)
    assert(ctx.page.wc._yaScale < 0.4, String(ctx.page.wc._yaScale))
    const at = inDays(5, 8, 30)
    const r = await run(ctx, {
      type: 'quiz', text: 'Ai viết sách Công vụ?', when: at.toISOString(),
      answers: [{ text: 'Lu-ca', correct: true }, { text: 'Phao-lô' }, { text: 'Phi-e-rơ' }], explanation: 'Truyền thống cho là Lu-ca.',
    })
    assert.equal(r.status, 'scheduled')
    assert.equal(r.mismatch, '')
    assert.equal(await ctx.page.eval(() => innerWidth), 1100, 'gia lap van con sau khi tai trang')
    const p = db(ctx.mock)[0]
    assert.equal(p.type, 'quiz')
    assert.deepEqual(p.answers.map((a) => a.text), ['Lu-ca', 'Phao-lô', 'Phi-e-rơ'])
  }],
  ['len lich: bam o ngay khong an -> du phong go ngay, van dung ngay', async (ctx) => {
    fresh(ctx.mock)
    ctx.mock.server.postsFlags = { dateClick: 'none' }
    try {
      const at = inDays(6, 9, 0)
      const r = await run(ctx, { type: 'text', text: 'Gõ ngày', when: at.toISOString() })
      assert.match(db(ctx.mock)[0].scheduledAt, new RegExp(`-${String(at.getDate()).padStart(2, '0')}T09:00$`))
      assert.equal(r.mismatch, '')
      assert(ctx.logs.some((l) => /cách dự phòng: gõ ngày/.test(l)), ctx.logs.join('\n'))
    } finally { ctx.mock.server.postsFlags = {} }
  }],
  ['len lich: YouTube ghi ngay khac ngay muon -> bao loi lech gio (khong coi la xong)', async (ctx) => {
    fresh(ctx.mock)
    ctx.mock.server.postsFlags = { dateClick: 'none', dateCommit: 'lag' } // nhan doi nhung ngay that van la ngay mai
    try {
      const at = inDays(4, 9, 0)
      const r = await run(ctx, { type: 'text', text: 'Ngày bị lệch', when: at.toISOString() })
      assert.equal(r.status, 'scheduled')
      assert.match(r.mismatch, /YouTube lên lịch bài lúc 09:00 .*khác giờ mong muốn 09:00/)
      assert(ctx.logs.some((l) => /^error .*khác giờ mong muốn/.test(l)), ctx.logs.join('\n'))
    } finally { ctx.mock.server.postsFlags = {} }
  }],
  ['len lich, giao dien tieng Anh: doc dong "Scheduled for Nov 12, 2026, 12:00 AM" -> khong bao lech', async (ctx) => {
    fresh(ctx.mock)
    ctx.mock.server.postsFlags = { schedEn: true }
    try {
      const at = inDays(3, 0, 0)
      const r = await run(ctx, { type: 'poll', text: 'Which one?', options: [{ text: 'A' }, { text: 'B' }], when: at.toISOString() })
      assert.match(r.line, /Scheduled for \w{3} \d{1,2}, \d{4}, 12:00\s?AM \(local time\)$/)
      assert.equal(r.mismatch, '')
      assert(!ctx.logs.some((l) => /khác giờ mong muốn|Không đọc được giờ/.test(l)), ctx.logs.join('\n'))
    } finally { ctx.mock.server.postsFlags = {} }
  }],
  ['len lich, danh sach khong co the rieng tung bai: khong lay nham gio cua bai khac', async (ctx) => {
    fresh(ctx.mock, [{ id: 'UgkxOld1', type: 'text', text: 'Bài cũ đã hẹn', scheduledAt: '2030-01-01T08:00' }])
    ctx.mock.server.postsFlags = { flatList: true }
    try {
      const at = inDays(2, 10, 0)
      const r = await run(ctx, { type: 'text', text: 'Bài mới hẹn giờ', when: at.toISOString() })
      assert.equal(r.status, 'scheduled')
      assert.equal(r.mismatch, '', 'khong bao lech nham')
      assert(!/2030/.test(r.line), r.line)
    } finally { ctx.mock.server.postsFlags = {} }
  }],
  // HTML that 11/2026: sau vai bai, YouTube hien "Channel owner needs to verify" thay vi dang (0.7.0 cho 45 giay moi bai)
  ['YouTube hien "Channel owner needs to verify" -> loi OWNER_VERIFY ngay, dong hop thoai, khong dang', async (ctx) => {
    fresh(ctx.mock)
    ctx.mock.server.postsFlags = { verifyAfter: 0 }
    try {
      const t0 = Date.now()
      await assert.rejects(run(ctx, { type: 'text', text: 'Bị khoá', when: inDays(2, 9, 0).toISOString() }), (e) => e.code === 'OWNER_VERIFY' && /Channel owner needs to verify/.test(e.message) && /không tự xác minh/.test(e.message))
      assert(Date.now() - t0 < 30000, 'khong cho het 45 giay')
      assert.equal(db(ctx.mock).length, 0)
      assert.equal(await ctx.page.eval(() => !!document.querySelector('ytw-feature-enablement-info-renderer')), false, 'da bam Got it')
    } finally { ctx.mock.server.postsFlags = {} }
  }],
  ['gio dang da qua -> dang ngay', async (ctx) => {
    fresh(ctx.mock)
    const r = await run(ctx, { type: 'text', text: 'Muộn rồi', when: new Date(Date.now() - 3600e3).toISOString() })
    assert.equal(r.status, 'posted')
    assert.equal(db(ctx.mock)[0].scheduledAt, null)
    assert(ctx.logs.some((l) => /đã qua hoặc quá gần, đăng ngay/.test(l)))
  }],
  ['trung bai DA DANG -> khong dang lai', async (ctx) => {
    fresh(ctx.mock, [{ id: 'UgkxCu1', type: 'text', text: 'Lịch ra video   tuần này\nThứ 3', scheduledAt: null }])
    const r = await run(ctx, { type: 'text', text: 'Lịch ra video tuần này\nThứ 3' })
    assert.deepEqual([r.status, db(ctx.mock).length], ['duplicate', 1])
    assert.match(r.url, /UgkxCu1$/)
  }],
  ['trung bai DA LEN LICH -> khong dang lai', async (ctx) => {
    fresh(ctx.mock, [{ id: 'UgkxCu2', type: 'poll', text: 'Bạn thích bìa nào?', options: ['A', 'B'], scheduledAt: '2030-01-01T08:00' }])
    const r = await run(ctx, { type: 'poll', text: 'Bạn thích bìa nào?', options: [{ text: 'A' }, { text: 'B' }] })
    assert.deepEqual([r.status, db(ctx.mock).length], ['duplicate', 1])
    assert.match(r.line, /Đã lên lịch đăng vào 08:00 1 thg 1, 2030/)
  }],
  ['chi co @handle -> mo /@handle/posts', async (ctx) => {
    fresh(ctx.mock)
    const r = await createPost(ctx.page, { type: 'text', text: 'Qua handle', channel: { handle: 'BibleStoriies' } }, { urls: ctx.urls })
    assert.equal(r.status, 'posted')
    assert(ctx.mock.hits.some((h) => h.startsWith('GET /yt/@BibleStoriies/posts')))
  }],
  ['kenh khong phai cua minh -> bao loi ro rang', async (ctx) => {
    fresh(ctx.mock)
    await assert.rejects(createPost(ctx.page, { type: 'text', text: 'x', channel: { ucId: 'UCKHACkhackhackhac' } }, { urls: ctx.urls }), /không phải chủ kênh/)
  }],
]
