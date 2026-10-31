// Bai dang Cong dong do Gemini viet (trang "Dang bai" -> "Tu dong bang Gemini"): ham thuan, kiem bang node.
//   planSlots: chia so bai vao cac ngay + gio dang (moc 15 phut, bo gio da qua), xoay vong loai bai.
//   postsPrompt / parsePosts: loi nhac JSON cho Gemini va kiem / cat gon ket qua theo gioi han cua YouTube.
//   geminiImage: Gemini tao anh (model anh, tra ve PNG/JPEG base64) cho bai anh / tham do anh.
//   pickFolderImages: lay anh chua dung trong thu muc anh cua kenh.
const fs = require('fs')
const path = require('path')
const { ApiError, endpoints } = require('./google')

const TYPES = ['text', 'image', 'poll', 'quiz', 'image_poll']
const TYPE_LABEL = { text: 'Chữ', image: 'Ảnh', poll: 'Thăm dò', quiz: 'Câu đố', image_poll: 'Thăm dò ảnh' }
// Gioi han cua YouTube (scanner.js POLL / QUIZ, HTML that yt-12)
const LIMITS = { text: 1500, poll: { min: 2, max: 4, len: 65 }, imagePoll: { min: 2, max: 4, len: 36 }, quiz: { min: 2, max: 4, len: 100, explain: 350 } }
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
// Model tao anh cua Gemini API (ai.google.dev/gemini-api/docs/image-generation); model dau tien la mac dinh
const IMAGE_MODELS = [
  ['gemini-2.5-flash-image', 'Gemini 2.5 Flash Image (nhanh, rẻ)'],
  ['gemini-3-pro-image-preview', 'Gemini 3 Pro Image (đẹp hơn, chậm hơn)'],
]
const LANGS = { en: 'English', vi: 'Vietnamese (tiếng Việt)', es: 'Spanish', pt: 'Portuguese', fr: 'French' }

const p2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

// "08:00, 20:30 ; 9h" -> ['08:00', '20:30', '09:00'] (lam tron len moc 15 phut, bo trung, sap xep)
function parseTimes(s) {
  const out = new Set()
  for (const m of String(s || '').matchAll(/(\d{1,2})\s*(?:[:hg.]\s*(\d{1,2})?)?/gi)) {
    let h = Number(m[1])
    let mi = Number(m[2] || 0)
    if (h > 23 || mi > 59) continue
    mi = Math.ceil(mi / 15) * 15
    if (mi === 60) { mi = 0; h++ }
    if (h > 23) continue
    out.add(`${p2(h)}:${p2(mi)}`)
  }
  return [...out].sort()
}

// Lich dang: count bai (moi kenh) trong [from, to] (YYYY-MM-DD, gio may) vao cac gio `times`.
// now: bo cac moc truoc now + 20 phut (YouTube can gio trong tuong lai). from rong = hom nay.
// Tra ve { slots: [{ when: ISO, type }], warnings }
function planSlots({ count, from, to, times, types, now = new Date(), startIndex = 0 }) {
  const warnings = []
  const n = Math.max(0, Math.min(100, Math.floor(Number(count) || 0)))
  const ts = Array.isArray(times) ? times : parseTimes(times)
  const kinds = (types || []).filter((t) => TYPES.includes(t))
  if (!n) return { slots: [], warnings: ['Số bài phải lớn hơn 0.'] }
  if (!kinds.length) return { slots: [], warnings: ['Chọn ít nhất một loại bài.'] }
  if (!ts.length) return { slots: [], warnings: ['Nhập ít nhất một giờ đăng (vd 08:00, 20:00).'] }
  const day = (s, fb) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : fb }
  const start = day(from, new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  let end = day(to, start)
  if (end < start) { warnings.push('Ngày kết thúc trước ngày bắt đầu: chỉ đăng trong ngày bắt đầu.'); end = start }
  const all = []
  const soon = now.getTime() + 20 * 60e3
  for (let d = new Date(start); d <= end && all.length < 2000; d.setDate(d.getDate() + 1)) {
    for (const t of ts) {
      const [h, m] = t.split(':').map(Number)
      const w = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m)
      if (w.getTime() >= soon) all.push(w)
    }
  }
  if (!all.length) return { slots: [], warnings: [...warnings, 'Các giờ đăng trong khoảng ngày đã chọn đều đã qua.'] }
  let picks = all
  if (n < all.length) {
    // rai deu: moc dau tien + cach deu nhau
    picks = Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)])
  } else if (n > all.length) {
    warnings.push(`Chỉ có ${all.length} giờ đăng trong khoảng ngày đã chọn: tạo ${all.length} bài thay vì ${n}. Thêm giờ đăng hoặc kéo dài khoảng ngày.`)
  }
  const slots = picks.map((w, i) => ({ when: w.toISOString(), type: kinds[(startIndex + i) % kinds.length] }))
  return { slots, warnings }
}

const SPEC = {
  text: '{"type":"text","text":"<the full post>"}',
  image: '{"type":"image","text":"<post caption>","imagePrompt":"<English prompt for ONE square illustration that matches the post, no text/letters in the image>"}',
  poll: `{"type":"poll","text":"<question / intro>","options":["<2-4 short answers, each max ${LIMITS.poll.len} characters>"]}`,
  quiz: `{"type":"quiz","text":"<quiz question>","answers":[{"text":"<answer, max ${LIMITS.quiz.len} chars>","correct":true|false}],"explanation":"<why the right answer is right, max ${LIMITS.quiz.explain} chars>"}`,
  image_poll: `{"type":"image_poll","text":"<question>","options":[{"text":"<max ${LIMITS.imagePoll.len} chars>","imagePrompt":"<English prompt for a square illustration of this option, no text>"}]}`,
}

// Loi nhac: mot lan goi Gemini cho ca loat bai cua mot kenh (dung thu tu loai bai trong `types`)
function postsPrompt({ channel = {}, request = '', style = '', language = 'en', types = [], recent = [], hashtags = true, emoji = true, videos = [], when = [] }) {
  const lang = LANGS[language] || language || 'English'
  const lines = [
    `You write Community posts for the YouTube channel "${channel.name || ''}"${channel.handle ? ` (${channel.handle})` : ''}.`,
    request ? `What the channel is about and what the owner wants (follow this closely):\n${String(request).trim()}` : 'Write posts that fit the channel name and engage its audience.',
    style ? `Writing style: ${String(style).trim()}` : '',
    `Language of every post: ${lang}.`,
    `Write exactly ${types.length} posts, in this order of types: ${types.join(', ')}.`,
    'Rules:',
    `- Each post stands alone, is engaging, invites comments, and is at most ${LIMITS.text} characters (most posts 200-600 characters).`,
    hashtags ? '- End each post text with 2-3 relevant hashtags.' : '- Do not use hashtags.',
    emoji ? '- A few fitting emoji are welcome.' : '- Do not use emoji.',
    '- Do not invent facts, quotes or links. No URLs. Keep it respectful.',
    '- Every post must be different from the others and from the recent posts below (different topic or angle).',
    '- Polls and quizzes: short clear options; a quiz has exactly one correct answer.',
    videos.length ? `Recent videos of the channel (you may reference their topics, never invent new titles):\n${videos.slice(0, 8).map((v) => `- ${v}`).join('\n')}` : '',
    when.length ? `Posting dates (one per post, same order; mention a day/season only if it fits): ${when.join(', ')}` : '',
    recent.length ? `Recent posts already published (do NOT repeat them):\n${recent.slice(0, 40).map((t) => `- ${String(t).replace(/\s+/g, ' ').slice(0, 160)}`).join('\n')}` : '',
    'Reply with JSON only: {"posts":[ ... ]} where each item has one of these shapes:',
    ...[...new Set(types)].map((t) => SPEC[t]),
  ]
  return lines.filter(Boolean).join('\n')
}

const clip = (s, n) => { s = String(s || '').replace(/\r/g, '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s }
const one = (s, n) => clip(String(s || '').replace(/\s+/g, ' '), n)

// Kiem tung bai theo loai da hen; bai hong (thieu lua chon...) -> bai chu (canh bao), khong co chu -> null
function cleanPost(raw, type) {
  const r = raw && typeof raw === 'object' ? raw : { text: String(raw || '') }
  const text = clip(r.text || r.content || r.question || '', LIMITS.text)
  const warn = []
  const asText = (why) => { warn.push(why); return text ? { type: 'text', text, warnings: warn } : null }
  if (type === 'text' || !TYPES.includes(type)) return text ? { type: 'text', text, warnings: warn } : null
  if (type === 'image') {
    const imagePrompt = one(r.imagePrompt || r.image_prompt || r.image || '', 600)
    return text ? { type, text, imagePrompt: imagePrompt || one(text, 300), warnings: warn } : null
  }
  if (type === 'poll') {
    const options = [...new Set((r.options || []).map((o) => one(typeof o === 'string' ? o : o && o.text, LIMITS.poll.len)).filter(Boolean))].slice(0, LIMITS.poll.max)
    if (options.length < LIMITS.poll.min) return asText('Gemini không đưa đủ lựa chọn cho thăm dò: đăng thành bài chữ.')
    return { type, text, options: options.map((t) => ({ text: t, image: '' })), warnings: warn }
  }
  if (type === 'image_poll') {
    const options = (r.options || []).map((o) => ({ text: one(typeof o === 'string' ? o : o && o.text, LIMITS.imagePoll.len), imagePrompt: one(o && (o.imagePrompt || o.image_prompt), 600) }))
      .filter((o) => o.text).slice(0, LIMITS.imagePoll.max)
    if (options.length < LIMITS.imagePoll.min) return asText('Gemini không đưa đủ lựa chọn cho thăm dò ảnh: đăng thành bài chữ.')
    return { type, text, options: options.map((o) => ({ text: o.text, image: '', imagePrompt: o.imagePrompt || o.text })), warnings: warn }
  }
  if (type === 'quiz') {
    let answers = (r.answers || r.options || []).map((a) => ({ text: one(typeof a === 'string' ? a : a && a.text, LIMITS.quiz.len), image: '', correct: !!(a && typeof a === 'object' && (a.correct === true || a.correct === 'true')) }))
      .filter((a) => a.text).slice(0, LIMITS.quiz.max)
    if (answers.length < LIMITS.quiz.min) return asText('Gemini không đưa đủ đáp án cho câu đố: đăng thành bài chữ.')
    const right = answers.findIndex((a) => a.correct)
    answers = answers.map((a, i) => ({ ...a, correct: i === (right < 0 ? 0 : right) }))
    if (right < 0) warn.push('Gemini không đánh dấu đáp án đúng: tool chọn đáp án đầu tiên, hãy xem lại.')
    return { type, text, answers, explanation: clip(r.explanation || '', LIMITS.quiz.explain), warnings: warn }
  }
  return null
}

// out: chu JSON cua Gemini; types: loai bai da hen (cung thu tu)
function parsePosts(out, types) {
  let j
  const s = String(out || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { j = JSON.parse(s) } catch (_) {
    const m = /[[{][\s\S]*[\]}]/.exec(s)
    try { j = m ? JSON.parse(m[0]) : null } catch (_) { j = null }
  }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.posts) ? j.posts : null
  if (!list) throw new Error('Gemini không trả về danh sách bài đúng dạng JSON.')
  // ghep theo thu tu; Gemini tra du loai khac thu tu thi lay bai cung loai con lai truoc
  const pool = list.slice()
  return types.map((t) => {
    const i = pool.findIndex((x) => x && x.type === t)
    const raw = i >= 0 ? pool.splice(i, 1)[0] : pool.shift()
    return raw ? cleanPost(raw, t) : null
  })
}

// Gemini tao anh. Tra ve { data: Buffer, mime, ext }
async function geminiImage({ key, model = IMAGE_MODELS[0][0], prompt, aspect = '1:1', fetchFn = fetch, ep = endpoints() }) {
  if (!key) throw new ApiError('Chưa nhập Gemini API key (Cài đặt).')
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } },
  }
  let res
  try {
    res = await fetchFn(`${ep.gemini}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
    })
  } catch (e) { throw new ApiError(`Không gọi được Gemini tạo ảnh: ${e.message}`) }
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 429) throw new ApiError('Gemini tạo ảnh báo hết hạn mức hoặc gọi quá nhanh (tài khoản miễn phí thường không tạo ảnh được). Thử lại sau, hoặc dùng thư mục ảnh.', 429, 'quota')
    if (res.status === 404) throw new ApiError(`Không có model tạo ảnh "${model}". Chọn model khác.`, 404, 'model')
    if (res.status === 400 && /API key not valid|API_KEY_INVALID/.test(text)) throw new ApiError('Gemini API key không đúng.', 400, 'badKey')
    let msg = text.slice(0, 200)
    try { msg = JSON.parse(text).error.message || msg } catch (_) { /* giu chu goc */ }
    throw new ApiError(`Gemini tạo ảnh lỗi ${res.status}: ${msg}`, res.status)
  }
  const j = JSON.parse(text)
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []
  const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data)
  if (!img) throw new ApiError('Gemini không trả về ảnh (có thể bị bộ lọc an toàn chặn).')
  const mime = img.mimeType || img.mime_type || 'image/png'
  return { data: Buffer.from(img.data, 'base64'), mime, ext: /jpe?g/.test(mime) ? '.jpg' : /webp/.test(mime) ? '.webp' : '.png' }
}

// Loi nhac anh: mo ta cua Gemini + phong cach anh cua kenh
const imagePrompt = (desc, style) => [
  String(desc || '').trim(),
  style ? `Style: ${String(style).trim()}.` : 'Style: cinematic, high quality digital painting.',
  'Square 1:1 composition. Do not put any text, letters, captions, logos or watermarks in the image.',
].filter(Boolean).join('\n')

// Anh trong thu muc (khong de quy), bo anh da dung (used: Set duong dan); het anh moi thi dung lai tu dau
function pickFolderImages(folder, n, used = new Set()) {
  if (!folder || !fs.existsSync(folder)) throw new Error(folder ? `Không thấy thư mục ảnh ${folder}.` : 'Chưa chọn thư mục ảnh cho kênh.')
  const all = fs.readdirSync(folder).filter((f) => IMAGE_EXT.includes(path.extname(f).toLowerCase())).sort().map((f) => path.join(folder, f))
  if (!all.length) throw new Error(`Thư mục ${folder} không có ảnh (.jpg, .png, .webp).`)
  const fresh = all.filter((f) => !used.has(f))
  const src = fresh.length >= n ? fresh : [...fresh, ...all.filter((f) => used.has(f))]
  return { files: src.slice(0, n), reused: fresh.length < n }
}

module.exports = { TYPES, TYPE_LABEL, LIMITS, IMAGE_MODELS, LANGS, parseTimes, planSlots, postsPrompt, parsePosts, cleanPost, geminiImage, imagePrompt, pickFolderImages, ymd }
