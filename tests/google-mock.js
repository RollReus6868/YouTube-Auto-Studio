// May chu Gemini gia lap cho kiem thu (viet mo ta, tra loi binh luan).
//   const m = await startMock(); ... m.url, m.calls, m.lastGemini, m.opts ... m.close()
const http = require('http')

// PNG 1x1 (base64)
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
// bai mau theo loai (bai so n)
const POST = (type, n) => ({
  text: { type, text: `Post ${n}: What does Genesis teach about light? #bible` },
  image: { type, text: `Post ${n}: A picture of the garden. #eden`, imagePrompt: 'The garden of Eden at dawn' },
  poll: { type, text: `Post ${n}: Which story next?`, options: ['David and Goliath', 'Jonah', 'Daniel'] },
  quiz: { type, text: `Post ${n}: Who built the ark?`, answers: [{ text: 'Moses', correct: false }, { text: 'Noah', correct: true }, { text: 'Abraham', correct: false }], explanation: 'Genesis 6 tells of Noah.' },
  image_poll: { type, text: `Post ${n}: Pick a cover`, options: [{ text: 'Dark', imagePrompt: 'dark cover' }, { text: 'Light', imagePrompt: 'light cover' }] },
}[type] || { type: 'text', text: `Post ${n}` })

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
      const gc = m.lastGemini.generationConfig || {}
      // tao anh (bai dang Cong dong): tra PNG 1x1; opts.imageFail = ma loi
      if ((gc.responseModalities || []).includes('IMAGE')) {
        m.images = (m.images || 0) + 1
        if (m.opts.imageFail) return json(res, m.opts.imageFail, { error: { code: m.opts.imageFail, message: 'image quota' } })
        return json(res, 200, { candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: PNG1 } }] } }] })
      }
      // tra loi binh luan (che do JSON): khen / hoi tuy noi dung
      let text = m.opts.geminiReply
      if (gc.responseMimeType === 'application/json') {
        const c = m.lastGemini.contents[0].parts[0].text
        if (/You write Community posts/.test(c)) {
          // bai dang Cong dong: dung so bai + loai trong loi nhac
          const types = (/in this order of types: ([a-z_, ]+)\./.exec(c) || [, 'text'])[1].split(',').map((x) => x.trim())
          m.postPrompts = [...(m.postPrompts || []), c]
          text = m.opts.postsReply || JSON.stringify({ posts: types.map((t, i) => POST(t, i + (m.postPrompts.length - 1) * 10)) })
        } else text = /\?/.test(c) ? '{"loai":"hoi","tra_loi":"Tuần sau nhé bạn!"}' : '{"loai":"khen","tra_loi":"Cảm ơn bạn nhiều <3"}'
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
