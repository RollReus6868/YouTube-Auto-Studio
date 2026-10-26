// Kiem thu src/google.js voi may chu Google gia lap:  node tests/google-test.js
process.env.YA_FAST_RETRY = '1'
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Google, ApiError, endpoints, gemini, descriptionPrompt, CHUNK } = require('../src/google')
const { startMock } = require('./google-mock')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ya-gt-'))
const client = { client_id: 'cid.apps.googleusercontent.com', client_secret: 'sec' }
// "trinh duyet" gia: mo dia chi dang nhap, di theo chuyen huong ve may chu loopback cua app
const browser = async (url) => {
  const r = await fetch(url, { redirect: 'manual' })
  await fetch(r.headers.get('location')).then((x) => x.text())
}
const tests = []
const test = (name, fn) => tests.push([name, fn])

const META = {
  title: 'Tiêu đề', description: 'Mô tả', tags: ['a', 'b c'], categoryId: '27', language: 'vi', privacy: 'private',
  publishAt: '2030-01-01T12:00:00.000Z', madeForKids: false, syntheticMedia: true, license: 'youtube', embeddable: true,
  publicStatsViewable: false, notifySubscribers: false,
}

test('dang nhap OAuth (loopback + PKCE) va lam moi token', async () => {
  const m = await startMock()
  try {
    let saved = null
    const g = new Google({ client, ep: endpoints(m.url), onTokens: (t) => { saved = t } })
    await g.login(browser)
    assert.equal(m.lastAuth.code_challenge_method, 'S256')
    assert.match(m.lastAuth.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/$/)
    assert.equal(m.lastAuth.access_type, 'offline')
    assert.match(m.lastAuth.scope, /youtube\.force-ssl/)
    assert.equal(saved.refresh_token, 'ref-1')
    assert.deepEqual(await g.myChannel(), { id: 'UCmock000000000000000000', title: 'Kênh Giả Lập', thumb: '' })
    // token het han -> tu lam moi bang refresh token
    g.tokens.expires_at = 0
    await g.myChannel()
    assert.equal(m.lastToken.grant_type, 'refresh_token')
    assert.notEqual(saved.access_token, 'acc-1')
    // token bi thu hoi
    const bad = new Google({ client, ep: endpoints(m.url), tokens: { refresh_token: 'cu' } })
    await assert.rejects(bad.myChannel(), /hết hạn hoặc bị thu hồi/)
    // nguoi dung tu choi
    m.opts.deny = true
    await assert.rejects(new Google({ client, ep: endpoints(m.url) }).login(browser), /từ chối cấp quyền/)
    await assert.rejects(new Google({ client, ep: endpoints(m.url) }).myChannel(), /Chưa đăng nhập/)
  } finally { await m.close() }
})

test('tai video nhieu doan + thumbnail + playlist + phu de', async () => {
  const m = await startMock({ failChunkOnce: true })
  try {
    const g = new Google({ client, ep: endpoints(m.url), tokens: { refresh_token: 'ref-1' } })
    const d = tmp()
    const file = path.join(d, 'video.mp4')
    const data = Buffer.alloc(CHUNK * 2 + 12345, 7)
    fs.writeFileSync(file, data)
    const seen = []
    const r = await g.uploadVideo(file, META, { onProgress: (p) => seen.push(p) })
    const id = r.id
    assert.equal(r.status.privacyStatus, 'private')
    const v = m.videos[0]
    assert.equal(id, 'vid1')
    assert.equal(v.bytes, data.length)
    assert.equal(v.type, 'video/mp4')
    assert.deepEqual(v.snippet, { title: 'Tiêu đề', description: 'Mô tả', tags: ['a', 'b c'], categoryId: '27', defaultLanguage: 'vi', defaultAudioLanguage: 'vi' })
    assert.deepEqual(v.status, { privacyStatus: 'private', publishAt: '2030-01-01T12:00:00.000Z', selfDeclaredMadeForKids: false, license: 'youtube', embeddable: true, publicStatsViewable: false, containsSyntheticMedia: true })
    assert.equal(v.query.notifySubscribers, 'false')
    assert.equal(seen[seen.length - 1], 100)
    assert(seen.length >= 3, 'co bao tien do giua chung')
    assert.equal(m.opts.failChunkOnce, false, 'da gap loi 503 giua chung va tai tiep')

    const thumb = path.join(d, 'thumbnail.png')
    fs.writeFileSync(thumb, Buffer.alloc(500))
    await g.setThumbnail(id, thumb)
    assert.deepEqual(m.thumbs[0], { videoId: 'vid1', size: 500, type: 'image/png' })

    assert.equal(await g.ensurePlaylist('có sẵn'), 'PLcosan0000000', 'tim theo ten, khong phan biet hoa thuong')
    const fresh = await g.ensurePlaylist('Danh sách mới', 'unlisted')
    assert.equal(m.playlists.find((p) => p.id === fresh).privacy, 'unlisted')
    assert.equal(await g.ensurePlaylist('PLabcdefghijkl'), 'PLabcdefghijkl', 'id dien san')
    await g.addToPlaylist(fresh, id)
    assert.deepEqual(m.items[0], { playlistId: fresh, resourceId: { kind: 'youtube#video', videoId: 'vid1' } })

    const srt = path.join(d, 'phude.vi.srt')
    fs.writeFileSync(srt, '1\n00:00:01,000 --> 00:00:02,000\nXin chào\n')
    await g.addCaption(id, srt, 'vi')
    assert.match(m.captions[0].text, /"language":"vi"/)
    assert.match(m.captions[0].text, /Xin chào/)
  } finally { await m.close() }
})

test('het han muc + dung giua chung', async () => {
  const m = await startMock({ quota: true })
  try {
    const g = new Google({ client, ep: endpoints(m.url), tokens: { refresh_token: 'ref-1' } })
    const file = path.join(tmp(), 'v.mov')
    fs.writeFileSync(file, Buffer.alloc(CHUNK + 10))
    await assert.rejects(g.uploadVideo(file, META), (e) => e instanceof ApiError && /hạn mức API/.test(e.message))
    m.opts.quota = false
    let n = 0
    await assert.rejects(g.uploadVideo(file, META, { shouldStop: () => ++n > 1 }), /Đã dừng/)
    assert.equal(m.videos.length, 0)
  } finally { await m.close() }
})

test('gemini', async () => {
  const m = await startMock()
  try {
    const out = await gemini({ key: 'gemini-ok', model: 'gemini-2.5-flash', prompt: 'viết đi', system: 'giọng vui', ep: endpoints(m.url) })
    assert.equal(out, 'Mô tả do Gemini viết.\n\n#a #b #c')
    assert.equal(m.lastGemini.systemInstruction.parts[0].text, 'giọng vui')
    await assert.rejects(gemini({ key: 'sai', model: 'x', prompt: 'a', ep: endpoints(m.url) }), /không đúng/)
    await assert.rejects(gemini({ key: '', model: 'x', prompt: 'a', ep: endpoints(m.url) }), /Chưa nhập/)
    const p = descriptionPrompt({ title: 'Bí ẩn', notes: 'rừng Amazon', channel: 'Kênh A', language: 'vi' })
    assert(p.includes('Bí ẩn') && p.includes('rừng Amazon') && p.includes('Kênh A') && p.includes('tiếng Việt'))
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
