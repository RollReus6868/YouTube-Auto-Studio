// Dang nhap Google (OAuth "Desktop app": loopback + PKCE) va goi YouTube Data API v3 /
// Gemini API. Khong require('electron'): fetch, mo trinh duyet va dia chi may chu duoc
// truyen vao, nen kiem thu duoc bang node voi may chu gia (tests/google-mock.js).
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const path = require('path')

// YA_GOOGLE_MOCK=http://127.0.0.1:port -> moi dia chi Google tro ve may chu gia
function endpoints(mock = process.env.YA_GOOGLE_MOCK) {
  if (mock) return { auth: `${mock}/auth`, token: `${mock}/token`, api: `${mock}/youtube/v3`, upload: `${mock}/upload/youtube/v3`, gemini: `${mock}/gemini` }
  return {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    api: 'https://www.googleapis.com/youtube/v3',
    upload: 'https://www.googleapis.com/upload/youtube/v3',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
  }
}

// youtube.force-ssl du cho: tai video, thumbnail, playlist, phu de, doc + tra loi binh luan
const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
const CHUNK = 8 * 1024 * 1024 // boi so cua 256 KB theo yeu cau cua API

class ApiError extends Error {
  constructor(msg, status = 0, reason = '') { super(msg); this.status = status; this.reason = reason }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Loi tu Google -> cau tieng Viet de hieu
function explain(status, body) {
  let reason = ''
  let message = ''
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body
    const e = j.error || {}
    reason = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || (typeof j.error === 'string' ? j.error : '')
    message = e.message || j.error_description || ''
  } catch (_) { message = String(body || '').slice(0, 200) }
  const known = {
    quotaExceeded: 'Đã hết hạn mức API hôm nay (mỗi video tốn khoảng 1.600 trên 10.000 đơn vị/ngày). Hạn mức đặt lại lúc 0h giờ Thái Bình Dương (khoảng 14–15h Việt Nam).',
    uploadLimitExceeded: 'Kênh đã chạm giới hạn số video được tải lên trong ngày của YouTube.',
    youtubeSignupRequired: 'Tài khoản Google này chưa có kênh YouTube.',
    forbidden: 'Google từ chối quyền truy cập. Hãy đăng nhập lại kênh.',
    invalid_grant: 'Phiên đăng nhập kênh đã hết hạn hoặc bị thu hồi. Hãy bấm "Đăng nhập kênh" lại.',
    invalidTitle: 'Tiêu đề không hợp lệ.',
    invalidDescription: 'Mô tả không hợp lệ.',
    invalidTags: 'Thẻ không hợp lệ.',
    invalidPublishAt: 'Giờ lên lịch không hợp lệ (phải ở tương lai).',
    mediaBodyRequired: 'Thiếu file.',
    uploadRateLimitExceeded: 'Tải lên quá nhanh, YouTube yêu cầu chờ một lúc.',
    accessNotConfigured: 'Dự án Google Cloud chưa bật YouTube Data API v3.',
  }
  return new ApiError(known[reason] || `Google báo lỗi ${status}${reason ? ` (${reason})` : ''}: ${message}`, status, reason)
}

class Google {
  // client: { client_id, client_secret }; tokens: { refresh_token, access_token, expires_at }
  constructor({ client, tokens = null, fetchFn = fetch, ep = endpoints(), onTokens = () => {} }) {
    this.client = client
    this.tokens = tokens
    this.fetch = fetchFn
    this.ep = ep
    this.onTokens = onTokens
  }

  // ---- dang nhap ------------------------------------------------------------
  // Mo trinh duyet mac dinh toi trang dang nhap Google, cho Google chuyen ve
  // http://127.0.0.1:<cong>/ kem ma, doi ma lay token. openUrl(url) do main.js mo.
  async login(openUrl, { timeoutMs = 5 * 60e3 } = {}) {
    const verifier = b64url(crypto.randomBytes(32))
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
    const stateTok = b64url(crypto.randomBytes(16))
    const server = http.createServer()
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const redirect = `http://127.0.0.1:${server.address().port}/`
    try {
      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new ApiError('Hết thời gian chờ đăng nhập (5 phút). Hãy thử lại.')), timeoutMs)
        server.on('request', (req, res) => {
          const u = new URL(req.url, redirect)
          if (u.pathname !== '/') { res.statusCode = 404; return res.end() }
          const done = (ok, text) => {
            res.setHeader('content-type', 'text/html; charset=utf-8')
            res.end(`<!doctype html><meta charset="utf-8"><title>YT Auto Studio</title><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${ok ? '✅' : '❌'} ${text}</h2><p>Bạn có thể đóng tab này và quay lại YT Auto Studio.</p></body>`)
          }
          if (u.searchParams.get('state') !== stateTok) { done(false, 'Yêu cầu đăng nhập không hợp lệ.'); return }
          clearTimeout(timer)
          if (u.searchParams.get('error')) {
            done(false, 'Bạn đã hủy đăng nhập.')
            reject(new ApiError(u.searchParams.get('error') === 'access_denied' ? 'Bạn đã từ chối cấp quyền cho tool.' : `Google báo lỗi: ${u.searchParams.get('error')}`))
          } else {
            done(true, 'Đã đăng nhập kênh.')
            resolve(u.searchParams.get('code'))
          }
        })
        const q = new URLSearchParams({
          client_id: this.client.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
          access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state: stateTok,
        })
        Promise.resolve(openUrl(`${this.ep.auth}?${q}`)).catch(reject)
      })
      const t = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier })
      if (!t.refresh_token) throw new ApiError('Google không trả về refresh token. Hãy gỡ quyền của app trong tài khoản Google rồi đăng nhập lại.')
      this.setTokens(t)
      return this.tokens
    } finally {
      server.close()
    }
  }

  async tokenRequest(params) {
    const res = await this.fetch(this.ep.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.client.client_id, client_secret: this.client.client_secret, ...params }).toString(),
    })
    const text = await res.text()
    if (!res.ok) throw explain(res.status, text)
    return JSON.parse(text)
  }

  setTokens(t) {
    this.tokens = {
      refresh_token: t.refresh_token || (this.tokens && this.tokens.refresh_token),
      access_token: t.access_token,
      expires_at: Date.now() + (Number(t.expires_in) || 3600) * 1000,
    }
    this.onTokens(this.tokens)
  }

  async accessToken() {
    if (!this.tokens || !this.tokens.refresh_token) throw new ApiError('Chưa đăng nhập kênh YouTube.')
    if (this.tokens.access_token && this.tokens.expires_at - 60e3 > Date.now()) return this.tokens.access_token
    this.setTokens(await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token }))
    return this.tokens.access_token
  }

  // ---- goi API --------------------------------------------------------------
  async request(method, url, { json, body, headers = {}, raw = false } = {}) {
    for (let attempt = 0; ; attempt++) {
      const h = { authorization: `Bearer ${await this.accessToken()}`, ...headers }
      if (json !== undefined) h['content-type'] = 'application/json'
      let res
      try {
        res = await this.fetch(url, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body })
      } catch (e) {
        if (attempt < 3) { await sleep(1000 * 2 ** attempt); continue }
        throw new ApiError(`Mất kết nối mạng: ${e.message}`)
      }
      if (res.status === 401 && attempt === 0) { this.tokens.access_token = ''; continue }
      if (res.status >= 500 && attempt < 3) { await sleep(1000 * 2 ** attempt); continue }
      if (raw) return res
      const text = await res.text()
      if (!res.ok) throw explain(res.status, text)
      return text ? JSON.parse(text) : {}
    }
  }

  api(method, p, opts) { return this.request(method, `${this.ep.api}/${p}`, opts) }

  async myChannel() {
    const r = await this.api('GET', 'channels?part=snippet&mine=true')
    const c = r.items && r.items[0]
    if (!c) throw new ApiError('Tài khoản Google này chưa có kênh YouTube.', 0, 'youtubeSignupRequired')
    return { id: c.id, title: c.snippet.title, thumb: (c.snippet.thumbnails && c.snippet.thumbnails.default && c.snippet.thumbnails.default.url) || '' }
  }

  // ---- tai video (resumable upload) --------------------------------------------
  // meta: ket qua buildVideoMeta. Tra ve tai nguyen video Google tra ve ({ id, status, ... }).
  async uploadVideo(file, meta, { onProgress = () => {}, shouldStop = () => false } = {}) {
    const size = fs.statSync(file).size
    const snippet = { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId }
    if (meta.language) { snippet.defaultLanguage = meta.language; snippet.defaultAudioLanguage = meta.language }
    const status = {
      privacyStatus: meta.privacy, selfDeclaredMadeForKids: !!meta.madeForKids, license: meta.license || 'youtube',
      embeddable: meta.embeddable !== false, publicStatsViewable: meta.publicStatsViewable !== false,
      containsSyntheticMedia: !!meta.syntheticMedia,
    }
    if (meta.publishAt) status.publishAt = meta.publishAt
    const q = new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status', notifySubscribers: String(meta.notifySubscribers !== false) })
    const start = await this.request('POST', `${this.ep.upload}/videos?${q}`, {
      json: { snippet, status },
      headers: { 'x-upload-content-length': String(size), 'x-upload-content-type': mimeOf(file) },
      raw: true,
    })
    if (!start.ok) throw explain(start.status, await start.text())
    const session = start.headers.get('location')
    if (!session) throw new ApiError('Google không trả về địa chỉ tải lên.')

    let offset = 0
    let fails = 0
    const fd = fs.openSync(file, 'r')
    try {
      while (offset < size) {
        if (shouldStop()) throw new ApiError('Đã dừng theo yêu cầu.', 0, 'stopped')
        const len = Math.min(CHUNK, size - offset)
        const buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, offset)
        let res
        try {
          res = await this.request('PUT', session, { body: buf, headers: { 'content-range': `bytes ${offset}-${offset + len - 1}/${size}` }, raw: true })
        } catch (e) {
          res = null
          if (++fails > 5) throw e
        }
        if (res && (res.status === 200 || res.status === 201)) {
          onProgress(100)
          return JSON.parse(await res.text())
        }
        if (res && res.status === 308) {
          const range = res.headers.get('range') // "bytes=0-12345"
          offset = range ? Number(range.split('-')[1]) + 1 : 0
          fails = 0
        } else {
          if (res && res.status < 500 && res.status !== 404) throw explain(res.status, await res.text())
          if (++fails > 5) throw new ApiError(`Tải lên bị gián đoạn nhiều lần (HTTP ${res ? res.status : 'mạng'}).`)
          await sleep(1000 * 2 ** fails)
          offset = await this.uploadedBytes(session, size)
        }
        onProgress(Math.min(99, Math.floor((offset * 100) / size)))
      }
      // tep rong hoac da gui het ma chua nhan ket qua: hoi lai
      const res = await this.request('PUT', session, { body: Buffer.alloc(0), headers: { 'content-range': `bytes */${size}` }, raw: true })
      if (res.status === 200 || res.status === 201) return JSON.parse(await res.text())
      throw explain(res.status, await res.text())
    } finally {
      fs.closeSync(fd)
    }
  }

  // Hoi Google da nhan bao nhieu byte (de tai tiep sau khi rot mang)
  async uploadedBytes(session, size) {
    const res = await this.request('PUT', session, { body: Buffer.alloc(0), headers: { 'content-range': `bytes */${size}` }, raw: true })
    if (res.status === 308) {
      const range = res.headers.get('range')
      return range ? Number(range.split('-')[1]) + 1 : 0
    }
    if (res.status === 200 || res.status === 201) return size
    throw explain(res.status, await res.text())
  }

  async setThumbnail(videoId, file) {
    return this.request('POST', `${this.ep.upload}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      body: fs.readFileSync(file), headers: { 'content-type': mimeOf(file) },
    })
  }

  // Tim playlist theo ten (khong phan biet hoa thuong), khong co thi tao moi. Tra ve id.
  async ensurePlaylist(title, privacy = 'public') {
    if (/^PL[\w-]{10,}$/.test(title)) return title // nguoi dung dien san id
    let page = ''
    for (let i = 0; i < 20; i++) {
      const r = await this.api('GET', `playlists?part=snippet&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`)
      const hit = (r.items || []).find((p) => p.snippet.title.trim().toLowerCase() === title.trim().toLowerCase())
      if (hit) return hit.id
      if (!(page = r.nextPageToken)) break
    }
    const created = await this.api('POST', 'playlists?part=snippet,status', { json: { snippet: { title }, status: { privacyStatus: privacy } } })
    return created.id
  }

  addToPlaylist(playlistId, videoId) {
    return this.api('POST', 'playlistItems?part=snippet', { json: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } } })
  }

  // Phu de .srt/.vtt: multipart (phan dau JSON, phan sau la file)
  async addCaption(videoId, file, language) {
    const boundary = `ya${crypto.randomBytes(8).toString('hex')}`
    const meta = JSON.stringify({ snippet: { videoId, language, name: '' } })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
      fs.readFileSync(file),
      Buffer.from(`\r\n--${boundary}--`),
    ])
    return this.request('POST', `${this.ep.upload}/captions?uploadType=multipart&part=snippet`, { body, headers: { 'content-type': `multipart/related; boundary=${boundary}` } })
  }
}

const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.webm': 'video/webm', '.m4v': 'video/x-m4v', '.wmv': 'video/x-ms-wmv', '.flv': 'video/x-flv', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg', '.3gp': 'video/3gpp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'
const sleep = (ms) => new Promise((r) => setTimeout(r, process.env.YA_FAST_RETRY ? 10 : ms))

// ---- Gemini -----------------------------------------------------------------
async function gemini({ key, model, prompt, system, fetchFn = fetch, ep = endpoints() }) {
  if (!key) throw new ApiError('Chưa nhập Gemini API key (Cài đặt).')
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8 } }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  let res
  try {
    res = await fetchFn(`${ep.gemini}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
    })
  } catch (e) { throw new ApiError(`Không gọi được Gemini: ${e.message}`) }
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 400 && /API key not valid|API_KEY_INVALID/.test(text)) throw new ApiError('Gemini API key không đúng.', 400, 'badKey')
    if (res.status === 429) throw new ApiError('Gemini báo hết hạn mức hoặc gọi quá nhanh. Thử lại sau ít phút.', 429, 'quota')
    if (res.status === 404) throw new ApiError(`Không có model "${model}". Chọn model khác trong Cài đặt.`, 404, 'model')
    throw explain(res.status, text)
  }
  const j = JSON.parse(text)
  const out = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim()
  if (!out) throw new ApiError('Gemini không trả lời (có thể bị bộ lọc an toàn chặn).')
  return out
}

// Loi nhac cho Gemini viet mo ta video
function descriptionPrompt({ title, name, notes, channel, language, current }) {
  return [
    `Viết mô tả cho video YouTube${channel ? ` của kênh "${channel}"` : ''}. Ngôn ngữ: ${language === 'vi' || !language ? 'tiếng Việt' : language}.`,
    `Tiêu đề: ${title || name}`,
    notes ? `Ghi chú của chủ kênh về nội dung: ${notes}` : '',
    current ? `Mô tả hiện tại (có thể dùng lại ý): ${current}` : '',
    'Yêu cầu: 2 đến 4 đoạn ngắn, mở đầu hấp dẫn trong 2 câu đầu (hiện trên kết quả tìm kiếm), có lời kêu gọi đăng ký kênh, kết thúc bằng 3 đến 5 hashtag liên quan.',
    'Không dùng dấu < hoặc >. Không bịa thông tin không có trong tiêu đề hay ghi chú. Chỉ trả về nội dung mô tả, không giải thích thêm.',
  ].filter(Boolean).join('\n')
}

module.exports = { Google, ApiError, endpoints, explain, gemini, descriptionPrompt, mimeOf, SCOPE, CHUNK }
