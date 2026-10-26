// Bai kiem cho src/flows/inbox.js voi trang gia tests/mock-yt/inbox (theo video "Tra loi binh luan")
const assert = require('assert')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { openInbox, readComments, reply, parseAgo } = require('../../src/flows/inbox')

const UC = 'UCLBuhr6vMvZQPqZpTTslWaQ'
const OWN = '@DarkFaith9999'
const replies = (mock) => mock.events.filter((e) => e.type === 'reply')

module.exports = [
  ['doc hop thu: tab, bo loc, tai them khi cuon, ma on dinh', async ({ page, urls, logs }) => {
    await openInbox(page, UC, { urls, log: page.log })
    assert(/\/channel\/UCLBuhr6vMvZQPqZpTTslWaQ\/comments\/inbox\?filter=.*COMMENT_CATEGORY_NOT_ENGAGED/.test(decodeURIComponent(page.url())))
    assert.equal(await page.eval(() => document.querySelector('#comments-tab').getAttribute('aria-selected')), 'true')
    const list = await readComments(page, { max: 50, handle: OWN })
    assert.equal(list.length, 10, 'doc het ca phan tai them')
    const e = list[0]
    assert.equal(e.id, 'UgxEliz01')
    assert.equal(e.author, '@ElizabethBade-l7n')
    assert.equal(e.handle, '@ElizabethBade-l7n')
    assert.equal(e.ago, '43 phút trước')
    assert(e.text.endsWith('I love it. ❤️ 💜 ✝️'), e.text)
    assert.equal(e.contentType, 'video')
    assert(e.contentTitle.startsWith('Isaiah 61'))
    assert(Math.abs(Date.parse(e.publishedAt) - (Date.now() - 43 * 60e3)) < 60e3)
    const post = list.find((x) => x.author === '@SteveWilson9p')
    assert.equal(post.contentType, 'post')
    assert.equal(post.id, 'UgwSteve04', 'ma lay tu comment-id')
    assert(/^st_/.test(list.find((x) => x.author === '@gracefaith').id), 'khong co comment-id thi dung ma bam')
    assert.equal(list.find((x) => x.author === '@milliecook8852').contentType, 'video', 'Shorts: HTML that khong phan biet voi video')
    assert.deepEqual(list.find((x) => x.author === '@ruthann-k2').replies.map((r) => [r.author, r.owner]), [['@Beebo81420', false]])
    assert.equal(list.find((x) => x.author === '@LaDonnaWheeler-i6u').ownerReplied, true)
    assert.equal(list.filter((x) => x.ownerReplied).length, 1)
    assert.equal(new Set(list.map((x) => x.id)).size, 10, 'ma khong trung')
    // doc lai sau khi tai lai trang: cung ma
    await openInbox(page, UC, { urls })
    const again = await readComments(page, { max: 6, handle: OWN })
    assert.equal(again.length, 6)
    assert.deepEqual(again.map((x) => x.id), list.slice(0, 6).map((x) => x.id))
    assert(!logs.some((l) => l.startsWith('warn')), logs.join('\n'))
  }],

  ['them lai bo loc "Chua phan hoi" khi bi tat', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/channel/${UC}/comments/inbox`)
    await page.eval(() => localStorage.setItem('mockInbox.nofilter', '1'))
    await openInbox(page, UC, { urls })
    assert(await page.has('Trạng thái phản hồi: Chưa phản hồi'))
  }],

  ['tra loi co emoji: o tra loi, nut gui, thong bao, tra loi long nhau', async ({ page, mock, urls }) => {
    await openInbox(page, UC, { urls })
    const [e] = await readComments(page, { max: 3, handle: OWN })
    const r = await reply(page, e, 'Love ❤️', { uc: UC, handle: OWN, urls })
    assert.equal(r.status, 'sent')
    assert.deepEqual(replies(mock).map((x) => [x.id, x.text]), [['UgxEliz01', 'Love ❤️']])
    // tra loi hien long duoi binh luan, o tra loi da dong
    const row = (await readComments(page, { max: 3, handle: OWN })).find((x) => x.id === e.id)
    assert.equal(row.ownerReplied, true)
    assert.deepEqual(row.replies.map((x) => x.text), ['Love ❤️'])
    assert.equal(await page.has({ selector: 'textarea' }), false)
    // emoji dai + ky tu dac biet, binh luan tren bai dang (khong co lc=)
    const post = (await readComments(page, { max: 6, handle: OWN })).find((x) => x.contentType === 'post')
    const text = 'Cảm ơn bạn nhiều 🙏🏽 Chúa ban phước ✝️ 😊 "Amen" & 💜'
    assert.equal((await reply(page, post, text, { uc: UC, handle: OWN, urls })).status, 'sent')
    assert.equal(replies(mock)[1].text, text)
    assert.equal(replies(mock)[1].author, '@SteveWilson9p')
  }],

  ['khong tra loi hai lan', async ({ page, mock, urls }) => {
    await openInbox(page, UC, { urls })
    const list = await readComments(page, { max: 6, handle: OWN })
    // da co tra loi cua kenh tu truoc
    const done = list.find((x) => x.ownerReplied)
    assert.equal((await reply(page, done, 'Thank you!', { uc: UC, handle: OWN, urls })).status, 'already')
    // goi lai lan hai cho cung binh luan
    const a = list.find((x) => x.author === '@AgnesToppin')
    assert.equal((await reply(page, a, 'Amen ❤️', { uc: UC, handle: OWN, urls })).status, 'sent')
    assert.equal((await reply(page, a, 'Amen ❤️', { uc: UC, handle: OWN, urls })).status, 'already')
    assert.equal(replies(mock).length, 1)
    // sau khi tai lai: bo loc "Chua phan hoi" an binh luan da tra loi -> bao loi, khong gui
    await openInbox(page, UC, { urls })
    assert(!(await readComments(page, { max: 10, handle: OWN })).some((x) => x.id === a.id))
    await assert.rejects(reply(page, a, 'Amen ❤️', { uc: UC, handle: OWN, urls }), /Không còn thấy bình luận của @AgnesToppin/)
    assert.equal(replies(mock).length, 1)
  }],

  ['tim lai dung hang khi danh sach thay doi; hang bien mat sau khi tra loi', async ({ page, mock, urls }) => {
    await openInbox(page, UC, { urls })
    const list = await readComments(page, { max: 10, handle: OWN })
    const brenda = list.find((x) => x.author === '@brendatucker-boykins3402')
    const david = list.find((x) => x.author === '@david.o') // nam o phan tai them
    // danh sach doi thu tu + co binh luan moi o dau, va trang tai lai (chi con 6 hang dau)
    await page.eval(() => { window.__mock.reverse(); window.__mock.prepend({ key: 'new1', lc: 'UgxNew', author: '@newperson', ago: '0 giây trước', text: 'Mới xem xong!', c: ['Isaiah 61', '/yt/watch?v=isa61'] }) })
    assert.equal((await reply(page, brenda, 'God bless you 🙏', { uc: UC, handle: OWN, urls })).status, 'sent')
    await openInbox(page, UC, { urls })
    assert.equal((await reply(page, david, 'Hello Lagos! 🇳🇬', { uc: UC, handle: OWN, urls })).status, 'sent')
    assert.deepEqual(replies(mock).map((x) => [x.author, x.text]), [['@brendatucker-boykins3402', 'God bless you 🙏'], ['@david.o', 'Hello Lagos! 🇳🇬']])
    // hang Shorts bien mat ngay sau khi tra loi (bo loc) -> van nhan ra la da gui nho thong bao
    const millie = list.find((x) => x.author === '@milliecook8852')
    assert.equal((await reply(page, millie, 'Amen 🙏', { uc: UC, handle: OWN, urls })).status, 'sent')
    await page.waitGone('@milliecook8852')
    assert.equal(replies(mock).length, 3)
  }],

  ['khong gui khi Studio dang o kenh khac', async ({ page, mock, urls }) => {
    await openInbox(page, 'UCotherchannel0000000000', { urls })
    const [e] = await readComments(page, { max: 1, handle: OWN })
    await assert.rejects(reply(page, e, 'Hi', { uc: UC, handle: OWN, urls }), /Studio đang ở kênh UCotherchannel0000000000/)
    assert.equal(replies(mock).length, 0)
  }],

  // HTML that anh gui (ban rut gon, khong co script): doc dung hang, ma comment-id, tac gia, noi dung
  ['doc HTML that cua Studio (neu co file)', async ({ page }) => {
    const real = '/mnt/project-files/yt-auto-studio/html/yt-6-comments-inbox.html'
    if (!fs.existsSync(real)) return console.log('    (bo qua: khong co file HTML that)')
    await page.goto(pathToFileURL(real).href)
    const list = await readComments(page, { max: 50 })
    console.log('    ' + list.map((x) => `${x.id} ${x.author} ${x.ago} [${x.contentType}] ${x.text.slice(0, 30)} | ${x.contentTitle.slice(0, 30)} | tl:${x.replies.length}`).join('\n    '))
    assert(list.length >= 5, `chi doc duoc ${list.length} hang`)
    for (const x of list) {
      assert(/^Ug[\w-]+$/.test(x.id), `ma ${x.id}`)
      assert(/^@/.test(x.author) && x.text && x.ago && x.contentTitle, JSON.stringify(x))
    }
    assert(list.some((x) => x.replies.length), 'co hang co tra loi long nhau')
  }],
  ['doc "x phut truoc"', async () => {
    const now = Date.parse('2026-10-26T12:00:00Z')
    assert.equal(parseAgo('43 phút trước', now), '2026-10-26T11:17:00.000Z')
    assert.equal(parseAgo('16 giờ trước', now), '2026-10-25T20:00:00.000Z')
    assert.equal(parseAgo('2 days ago', now), '2026-10-24T12:00:00.000Z')
    assert.equal(parseAgo('1 tuần trước (đã chỉnh sửa)', now), '2026-10-19T12:00:00.000Z')
    assert.equal(parseAgo('', now), '')
  }],
]
