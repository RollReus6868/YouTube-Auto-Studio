// Doc chu tu file kich ban (.txt / .md / .srt / .docx) de Gemini viet mo ta theo kich ban.
// .docx la file zip: doc muc luc (central directory), giai nen word/document.xml bang zlib (khong them thu vien),
// moi <w:p> thanh mot dong, chu nam trong <w:t>. Khong require('electron') nen kiem thu duoc bang node.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SCRIPT_EXT = ['.txt', '.md', '.docx', '.srt'] // chon tay (hop thoai mo file)
const SCRIPT_AUTO_EXT = ['.txt', '.md', '.docx'] // tu nhan canh video (.srt cung ten la phu de)

// Lay mot file trong zip theo ten. Tra ve Buffer, khong co thi null.
function unzipEntry(buf, name) {
  // End of central directory: 22 byte + ghi chu (toi da 65535), tim tu cuoi file
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('file không phải .docx (không đọc được nội dung zip)')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('mục lục zip hỏng')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const entry = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (entry !== name) continue
    if (size === 0xffffffff || local === 0xffffffff) throw new Error('file .docx quá lớn (zip64)')
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('zip hỏng')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + size)
    if (method === 0) return Buffer.from(data)
    if (method === 8) return zlib.inflateRawSync(data)
    throw new Error(`kiểu nén zip ${method} chưa hỗ trợ`)
  }
  return null
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const decodeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    try { return String.fromCodePoint(code) } catch (_) { return m }
  }
  return ENTITIES[e] !== undefined ? ENTITIES[e] : m
})

// word/document.xml -> chu: het doan (</w:p>) = xuong dong, <w:tab/> = tab, <w:br/> = xuong dong
function docxXmlText(xml) {
  let out = ''
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:p>|<w:p\/>/g
  let m
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) out += decodeXml(m[1])
    else if (m[0] === '<w:tab/>') out += '\t'
    else out += '\n'
  }
  return tidy(out)
}

// Bo khoang trang cuoi dong, gop nhieu dong trong lien tiep
const tidy = (s) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()

function docxText(buf) {
  const xml = unzipEntry(buf, 'word/document.xml')
  if (!xml) throw new Error('file .docx không có word/document.xml')
  return docxXmlText(xml.toString('utf8'))
}

// Phu de .srt: bo so thu tu va dong thoi gian, giu loi thoai
const srtText = (s) => tidy(s.split(/\r?\n/).filter((l) => !/^\s*\d+\s*$/.test(l) && !/-->/.test(l)).join('\n'))

// Doc file kich ban thanh chu (UTF-8, bo BOM). Loi -> nem Error tieng Viet.
function readScript(file) {
  const e = path.extname(file).toLowerCase()
  if (!SCRIPT_EXT.includes(e)) throw new Error(`không đọc được kịch bản dạng ${e || '(không có đuôi)'} (dùng .txt, .md, .docx hoặc .srt)`)
  const buf = fs.readFileSync(file)
  if (e === '.docx') return docxText(buf)
  const text = buf.toString('utf8').replace(/^﻿/, '')
  return e === '.srt' ? srtText(text) : tidy(text)
}

module.exports = { SCRIPT_EXT, SCRIPT_AUTO_EXT, unzipEntry, docxXmlText, docxText, readScript, decodeXml }
