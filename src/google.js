// Gemini API: viet mo ta video, tra loi binh luan. Video dang bang hop thoai tai len cua YouTube Studio
// (src/flows/upload.js), khong con dung YouTube Data API. Khong require('electron'): fetch va dia chi may chu duoc
// truyen vao, nen kiem thu duoc bang node voi may chu gia (tests/google-mock.js).

// YA_GOOGLE_MOCK=http://127.0.0.1:port -> Gemini tro ve may chu gia
function endpoints(mock = process.env.YA_GOOGLE_MOCK) {
  if (mock) return { gemini: `${mock}/gemini` }
  return { gemini: 'https://generativelanguage.googleapis.com/v1beta' }
}

class ApiError extends Error {
  constructor(msg, status = 0, reason = '') { super(msg); this.status = status; this.reason = reason }
}

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
    PERMISSION_DENIED: 'Google từ chối Gemini API key này (dự án chưa bật Gemini API hoặc key bị giới hạn).',
    RESOURCE_EXHAUSTED: 'Gemini báo hết hạn mức. Thử lại sau ít phút.',
  }
  return new ApiError(known[reason] || `Google báo lỗi ${status}${reason ? ` (${reason})` : ''}: ${message}`, status, reason)
}

// ---- Gemini -----------------------------------------------------------------
// Model Gemini API (ai.google.dev/gemini-api/docs/models, 28/10/2026); model dau tien la mac dinh.
const GEMINI_MODELS = [
  ['gemini-3.8-flash', 'Gemini 3.8 Flash (trợ giúp toàn diện)'],
  ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite (nhanh nhất, rẻ nhất)'],
  ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro (suy luận nâng cao, bản xem trước)'],
  ['gemini-4-argon', 'Gemini 4 Argon (nhiệm vụ phức tạp, mới)'],
]
const GEMINI_DEFAULT = GEMINI_MODELS[0][0]
// Cai dat cu (Gemini 2.5) -> model moi cung loai
const GEMINI_UPGRADE = { 'gemini-2.5-flash': 'gemini-3.8-flash', 'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite', 'gemini-2.5-pro': 'gemini-3.1-pro-preview' }
// Cap do tu duy (thinkingLevel): cac model 3.x / 4 deu nhan low | medium | high
const THINKING = ['low', 'medium', 'high']
const modern = (model) => !/^gemini-(1|2)\./.test(String(model || ''))

async function gemini({ key, model, prompt, system, json = false, thinking = '', fetchFn = fetch, ep = endpoints() }) {
  if (!key) throw new ApiError('Chưa nhập Gemini API key (Cài đặt).')
  // model 3.6 tro len bo qua (va se bao loi) temperature / topP / topK: chi gui cho model cu
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: modern(model) ? {} : { temperature: 0.8 } }
  if (modern(model) && THINKING.includes(thinking)) body.generationConfig.thinkingConfig = { thinkingLevel: thinking }
  if (json) body.generationConfig.responseMimeType = 'application/json'
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

// Loi nhac cho Gemini viet mo ta video. script: chu cua kich ban dinh kem (chi gui SCRIPT_MAX ky tu dau).
const SCRIPT_MAX = 30000
function descriptionPrompt({ title, name, notes, channel, language, current, script }) {
  let s = String(script || '').trim()
  const cut = s.length > SCRIPT_MAX
  if (cut) s = s.slice(0, SCRIPT_MAX)
  return [
    `Viết mô tả cho video YouTube${channel ? ` của kênh "${channel}"` : ''}. Ngôn ngữ: ${!language ? 'cùng ngôn ngữ với tiêu đề' : language === 'vi' ? 'tiếng Việt' : language}.`,
    `Tiêu đề: ${title || name}`,
    notes ? `Ghi chú của chủ kênh về nội dung: ${notes}` : '',
    current ? `Mô tả hiện tại (có thể dùng lại ý): ${current}` : '',
    s ? `Kịch bản của video (nội dung thật của video, nằm giữa hai dòng ===):\n===\n${s}\n===${cut ? '\n(Kịch bản dài, trên đây chỉ là phần đầu.)' : ''}` : '',
    'Yêu cầu: 2 đến 4 đoạn ngắn, mở đầu hấp dẫn trong 2 câu đầu (hiện trên kết quả tìm kiếm), có lời kêu gọi đăng ký kênh, kết thúc bằng 3 đến 5 hashtag liên quan.',
    s ? 'Viết dựa trên nội dung thật của kịch bản: nêu đúng chủ đề, nhân vật, sự kiện và ý chính có trong kịch bản, không chép nguyên văn đoạn dài. Không bịa thông tin không có trong kịch bản, tiêu đề hay ghi chú.' : '',
    `Không dùng dấu < hoặc >.${s ? '' : ' Không bịa thông tin không có trong tiêu đề hay ghi chú.'} Chỉ trả về nội dung mô tả, không giải thích thêm.`,
  ].filter(Boolean).join('\n')
}

// Loi nhac cho Gemini tra loi binh luan. Gemini tra ve JSON { loai, tra_loi }.
const KINDS = ['khen', 'hoi', 'gop_y', 'nhay_cam', 'spam']
function replyPrompt({ style, channel, videoTitle, author, text }) {
  return {
    system: [
      `Bạn là chủ kênh YouTube${channel ? ` "${channel}"` : ''}, đang trả lời bình luận của khán giả.`,
      `Quy tắc của chủ kênh: ${style || 'Trả lời thân thiện, ngắn gọn.'}`,
      'Trả lời bằng ngôn ngữ của bình luận. Không bịa thông tin về kênh hay video. Không dùng dấu < hoặc >.',
      'Phân loại bình luận vào đúng một nhóm: khen (khen ngợi, cảm ơn, cảm xúc tích cực), hoi (câu hỏi), gop_y (góp ý, phê bình), nhay_cam (chính trị, tôn giáo, xúc phạm, tranh cãi, thông tin cá nhân), spam (quảng cáo, link lạ, vô nghĩa).',
      'Với spam thì tra_loi để rỗng.',
      'Chỉ trả về JSON dạng {"loai": "...", "tra_loi": "..."}.',
    ].join('\n'),
    prompt: `Video: ${videoTitle || '(không rõ)'}\nNgười bình luận: ${author}\nBình luận: ${text}`,
  }
}

function parseReply(out) {
  const m = /\{[\s\S]*\}/.exec(out)
  let j = {}
  try { j = JSON.parse(m ? m[0] : out) } catch (_) { return { kind: 'hoi', reply: out.trim().replace(/[<>]/g, '') } }
  const kind = KINDS.includes(j.loai) ? j.loai : 'hoi'
  return { kind, reply: String(j.tra_loi || '').trim().replace(/<3/g, '❤️').replace(/[<>]/g, '') }
}

// Danh sach model Gemini ma API key nay dung duoc (viet chu): [[id, ten]]. Bo model nhung / giong noi / anh / truc tiep.
async function geminiModels({ key, fetchFn = fetch, ep = endpoints() }) {
  if (!key) throw new ApiError('Chưa nhập Gemini API key (Cài đặt).')
  let res
  try {
    res = await fetchFn(`${ep.gemini}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } })
  } catch (e) { throw new ApiError(`Không gọi được Gemini: ${e.message}`) }
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 400 && /API key not valid|API_KEY_INVALID/.test(text)) throw new ApiError('Gemini API key không đúng.', 400, 'badKey')
    throw explain(res.status, text)
  }
  const list = (JSON.parse(text).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => [String(m.name || '').replace(/^models\//, ''), m.displayName || ''])
    .filter(([id]) => /^gemini-/.test(id) && !/(embedding|tts|image|live|audio|robotics|computer-use|native)/.test(id))
  return list.map(([id, name]) => [id, name && name !== id ? `${name} (${id})` : id])
}

module.exports = { ApiError, endpoints, explain, gemini, geminiModels, GEMINI_MODELS, GEMINI_DEFAULT, GEMINI_UPGRADE, THINKING, SCRIPT_MAX, descriptionPrompt, replyPrompt, parseReply, KINDS }
