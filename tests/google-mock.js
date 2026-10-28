// May chu Gemini gia lap cho kiem thu (viet mo ta, tra loi binh luan).
//   const m = await startMock(); ... m.url, m.calls, m.lastGemini, m.opts ... m.close()
const http = require('http')

function startMock(opts = {}) {
  const m = { calls: [], opts: { geminiReply: 'Mô tả do Gemini viết.\n\n#a #b #c', ...opts } }
  const json = (res, code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)) }
  const readBody = (req) => new Promise((r) => { const parts = []; req.on('data', (d) => parts.push(d)); req.on('end', () => r(Buffer.concat(parts))) })

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    const body = await readBody(req)
    m.calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, size: body.length })
    const p = u.pathname

    // danh sach model cua key (GET /models): co ca model nhung / giong noi phai bi bo
    if (p === '/gemini/models' && req.method === 'GET') {
      if (req.headers['x-goog-api-key'] !== 'gemini-ok') return json(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })
      const g = ['generateContent', 'countTokens']
      return json(res, 200, { models: [
        { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: g },
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: g },
        { name: 'models/gemini-4-argon', displayName: 'Gemini 4 Argon', supportedGenerationMethods: g },
        { name: 'models/gemini-5-flash', displayName: 'Gemini 5 Flash', supportedGenerationMethods: g },
        { name: 'models/gemini-3.8-flash-tts', displayName: 'TTS', supportedGenerationMethods: g },
        { name: 'models/gemini-embedding-002', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/imagen-5', displayName: 'Imagen', supportedGenerationMethods: ['predict'] },
      ] })
    }
    if (p.startsWith('/gemini/models/')) {
      if (req.headers['x-goog-api-key'] !== 'gemini-ok') return json(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })
      m.lastGemini = JSON.parse(body.toString())
      // tra loi binh luan (che do JSON): khen / hoi tuy noi dung
      let text = m.opts.geminiReply
      if (m.lastGemini.generationConfig.responseMimeType === 'application/json') {
        const c = m.lastGemini.contents[0].parts[0].text
        text = /\?/.test(c) ? '{"loai":"hoi","tra_loi":"Tuần sau nhé bạn!"}' : '{"loai":"khen","tra_loi":"Cảm ơn bạn nhiều <3"}'
      }
      return json(res, 200, { candidates: [{ content: { parts: [{ text }] } }] })
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
