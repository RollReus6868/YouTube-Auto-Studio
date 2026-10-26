// May chu gia lap Google (OAuth, YouTube Data API, Gemini) cho kiem thu.
//   const m = await startMock(); ... m.url, m.calls, m.videos, m.opts (tiem loi) ... m.close()
const http = require('http')

function startMock(opts = {}) {
  const m = {
    calls: [], videos: [], playlists: [{ id: 'PLcosan0000000', title: 'Có sẵn' }], items: [], captions: [], thumbs: [],
    sessions: {}, opts: { failChunkOnce: false, quota: false, geminiReply: 'Mô tả do Gemini viết.\n\n#a #b #c', ...opts },
    tokens: { access: 'acc-1', refresh: 'ref-1' },
  }
  const json = (res, code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)) }
  const readBody = (req) => new Promise((r) => { const parts = []; req.on('data', (d) => parts.push(d)); req.on('end', () => r(Buffer.concat(parts))) })
  const authed = (req, res) => {
    if (req.headers.authorization !== `Bearer ${m.tokens.access}`) { json(res, 401, { error: { code: 401, message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } }); return false }
    return true
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    const body = await readBody(req)
    m.calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, size: body.length })
    const p = u.pathname

    if (p === '/auth') { // nguoi dung bam "Cho phep" ngay lap tuc
      const back = new URL(u.searchParams.get('redirect_uri'))
      back.searchParams.set('state', u.searchParams.get('state'))
      if (m.opts.deny) back.searchParams.set('error', 'access_denied')
      else back.searchParams.set('code', 'ma-xac-nhan')
      m.lastAuth = Object.fromEntries(u.searchParams)
      res.writeHead(302, { location: back.href })
      return res.end()
    }
    if (p === '/token') {
      const f = new URLSearchParams(body.toString())
      m.lastToken = Object.fromEntries(f)
      if (f.get('grant_type') === 'authorization_code') {
        if (f.get('code') !== 'ma-xac-nhan' || !f.get('code_verifier')) return json(res, 400, { error: 'invalid_grant' })
        return json(res, 200, { access_token: m.tokens.access, refresh_token: m.tokens.refresh, expires_in: 3600 })
      }
      if (f.get('grant_type') === 'refresh_token') {
        if (f.get('refresh_token') !== m.tokens.refresh) return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
        m.tokens.access = `acc-${m.calls.length}`
        return json(res, 200, { access_token: m.tokens.access, expires_in: 3600 })
      }
      return json(res, 400, { error: 'unsupported_grant_type' })
    }
    if (p.startsWith('/gemini/models/')) {
      if (req.headers['x-goog-api-key'] !== 'gemini-ok') return json(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })
      m.lastGemini = JSON.parse(body.toString())
      return json(res, 200, { candidates: [{ content: { parts: [{ text: m.opts.geminiReply }] } }] })
    }

    if (!authed(req, res)) return
    if (p === '/youtube/v3/channels') return json(res, 200, { items: [{ id: 'UCmock000000000000000000', snippet: { title: 'Kênh Giả Lập', thumbnails: { default: { url: '' } } } }] })
    if (p === '/youtube/v3/playlists' && req.method === 'GET') {
      return json(res, 200, { items: m.playlists.map((x) => ({ id: x.id, snippet: { title: x.title } })) })
    }
    if (p === '/youtube/v3/playlists' && req.method === 'POST') {
      const j = JSON.parse(body.toString())
      const pl = { id: `PLmoi${m.playlists.length}000000000`, title: j.snippet.title, privacy: j.status.privacyStatus }
      m.playlists.push(pl)
      return json(res, 200, { id: pl.id })
    }
    if (p === '/youtube/v3/playlistItems') { m.items.push(JSON.parse(body.toString()).snippet); return json(res, 200, { id: 'item' }) }
    if (p === '/upload/youtube/v3/thumbnails/set') { m.thumbs.push({ videoId: u.searchParams.get('videoId'), size: body.length, type: req.headers['content-type'] }); return json(res, 200, {}) }
    if (p === '/upload/youtube/v3/captions') { m.captions.push({ text: body.toString() }); return json(res, 200, { id: 'cap' }) }
    if (p === '/upload/youtube/v3/videos' && req.method === 'POST') {
      if (m.opts.quota) return json(res, 403, { error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } })
      const id = `s${Object.keys(m.sessions).length + 1}`
      m.sessions[id] = { meta: JSON.parse(body.toString()), query: Object.fromEntries(u.searchParams), total: Number(req.headers['x-upload-content-length']), got: 0, type: req.headers['x-upload-content-type'] }
      res.writeHead(200, { location: `http://127.0.0.1:${server.address().port}/session/${id}` })
      return res.end()
    }
    if (p.startsWith('/session/') && req.method === 'PUT') {
      const s = m.sessions[p.split('/').pop()]
      const range = req.headers['content-range'] || ''
      const finish = () => {
        const vid = { id: `vid${m.videos.length + 1}`, ...s.meta, query: s.query, bytes: s.got, type: s.type }
        m.videos.push(vid)
        return json(res, 200, { id: vid.id, status: { ...s.meta.status, privacyStatus: m.opts.lockPrivate ? 'private' : s.meta.status.privacyStatus } })
      }
      if (range.startsWith('bytes */')) {
        if (s.got >= s.total) return finish()
        res.writeHead(308, s.got ? { range: `bytes=0-${s.got - 1}` } : {})
        return res.end()
      }
      const [, a, , total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(range)
      if (m.opts.failChunkOnce && Number(a) > 0) { m.opts.failChunkOnce = false; return json(res, 503, { error: { code: 503, message: 'backend error' } }) }
      if (Number(a) !== s.got) { res.writeHead(308, { range: `bytes=0-${s.got - 1}` }); return res.end() }
      s.got += body.length
      if (s.got >= Number(total)) return finish()
      res.writeHead(308, { range: `bytes=0-${s.got - 1}` })
      return res.end()
    }
    json(res, 404, { error: { code: 404, message: `khong co ${req.method} ${p}` } })
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => {
    m.url = `http://127.0.0.1:${server.address().port}`
    m.close = () => new Promise((c) => { server.closeAllConnections && server.closeAllConnections(); server.close(c) })
    r(m)
  }))
}

module.exports = { startMock }
