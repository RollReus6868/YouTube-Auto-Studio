// Bai kiem cho src/gemini-web.js (askOn / imageOn) voi trang Gemini gia tests/mock-yt/gemini
//   xvfb-run -a node tests/flows/run.js gemini
const assert = require('assert')
const fs = require('fs')
const { ask, imageOn, fullSizeUrl } = require('../../src/gemini-web')

// dat bien the trang gia + hang cau tra loi, chay fn, luon tra ve mac dinh
async function withMock(ctx, { flags = {}, queue = [] }, fn) {
  const s = ctx.mock.server
  s.geminiFlags = flags
  s.geminiQueue = queue.slice()
  s.geminiPrompts = []
  try { return await fn(`${ctx.mock.base}/gemini`) } finally { s.geminiFlags = {}; s.geminiQueue = [] }
}
const code = (c) => (e) => { assert.equal(e.code, c, `${e.code}: ${e.message}`); assert(/[ăâđêôơưàáạảãèéẹẻẽ]/i.test(e.message), `loi tieng Viet co dau: ${e.message}`); return true }

const ANSWER = [
  'Đoạn một, dòng A.\nDòng B của đoạn một.',
  'Đoạn hai có **chữ** thường.',
  '- mục một\n- mục hai',
  '```json\n{\n  "posts": [{ "type": "text", "text": "Xin chào {bạn}" }]\n}\n```',
  'Hết.',
].join('\n\n')

module.exports = [
  ['ask: nhieu doan + danh sach + JSON trong khoi code, chat moi, dung loi nhac', async (ctx) => {
    await withMock(ctx, { queue: [{ text: ANSWER }] }, async (base) => {
      const text = await ask(ctx.page, { prompt: 'Viết 1 bài.\nDòng hai của lời nhắc.', base, stableMs: 1200 })
      assert.equal(text, ANSWER)
      assert.equal(ctx.mock.server.geminiPrompts.length, 1)
      assert.equal(ctx.mock.server.geminiPrompts[0], 'Viết 1 bài.\nDòng hai của lời nhắc.')
      assert.match(ctx.page.url(), /\/gemini\/app\/[0-9a-f]+$/, 'sau khi gui dia chi doi sang /app/<id>')
      // khoi code giu nguyen -> lay duoc JSON
      const json = /```json\n([\s\S]*?)\n```/.exec(text)[1]
      assert.equal(JSON.parse(json).posts[0].text, 'Xin chào {bạn}')
      // lan hai: mo chat moi (khong doc nham cau tra loi cu)
      const again = await ask(ctx.page, { prompt: 'Câu hỏi thứ hai', base, stableMs: 800 })
      assert.equal(again, 'Echo: Câu hỏi thứ hai')
      assert(ctx.mock.hits.filter((h) => /^GET \/gemini\/app$/.test(h)).length >= 2, 'moi yeu cau mo /app moi')
    })
  }],
  ['ask: trang khong duoc ve (aria-busy + .pending ket, innerText rong) van doc duoc chu', async (ctx) => {
    await withMock(ctx, { flags: { pendingStuck: true }, queue: [{ text: ANSWER }] }, async (base) => {
      const text = await ask(ctx.page, { prompt: 'Thử trang kẹt', base, stableMs: 1200 })
      assert.equal(text, ANSWER)
      const st = await ctx.page.eval(() => {
        const md = document.querySelector('model-response message-content div.markdown')
        return { busy: md.getAttribute('aria-busy'), inner: md.querySelector('p').innerText, pending: md.querySelectorAll('span.pending').length }
      })
      assert.equal(st.busy, 'true', 'aria-busy van ket o true')
      assert.equal(st.inner.trim(), '', 'innerText rong nhu trang khong duoc ve')
      assert(st.pending > 0)
    })
  }],
  ['ask: loi nhac dai 20.000 ky tu nhieu dong, go du', async (ctx) => {
    const lines = []
    for (let i = 0; lines.join('\n').length < 20000; i++) lines.push(`Dòng ${i}: Kinh Thánh nói về đức tin, hy vọng và tình yêu — "quote" {json} <tag> & ký tự đặc biệt ✝️ ${i % 7 ? '' : '\t'}`)
    const prompt = lines.join('\n').slice(0, 20000)
    await withMock(ctx, { queue: [{ text: 'OK dài' }] }, async (base) => {
      const text = await ask(ctx.page, { prompt, base, stableMs: 800 })
      assert.equal(text, 'OK dài')
      const got = ctx.mock.server.geminiPrompts[0]
      const g = got.replace(/\s+/g, ''), w = prompt.replace(/\s+/g, '')
      let at = 0
      while (at < Math.min(g.length, w.length) && g[at] === w[at]) at++
      assert(g === w, `trang nhan du chu: nhan ${g.length}/${w.length}, khac tu ${at}: "${g.slice(Math.max(0, at - 30), at + 40)}" / "${w.slice(Math.max(0, at - 30), at + 40)}"`)
      assert(got.split('\n').length >= lines.length - 1, `giu xuong dong (${got.split('\n').length}/${lines.length})`)
    })
  }],
  ['chua dang nhap (nut Sign in) -> GEMINI_SIGNIN, khong gui loi nhac', async (ctx) => {
    await withMock(ctx, { flags: { signedOut: true } }, async (base) => {
      await assert.rejects(ask(ctx.page, { prompt: 'Xin chào', base }), code('GEMINI_SIGNIN'))
      assert.equal(ctx.mock.server.geminiPrompts.length, 0)
    })
  }],
  ['hop thoai chan (dieu khoan) -> GEMINI_BLOCKED', async (ctx) => {
    await withMock(ctx, { flags: { blockedDialog: true } }, async (base) => {
      await assert.rejects(ask(ctx.page, { prompt: 'Xin chào', base }), (e) => code('GEMINI_BLOCKED')(e) && /Privacy Notice/.test(e.message))
      assert.equal(ctx.mock.server.geminiPrompts.length, 0)
    })
  }],
  ['het luot -> GEMINI_LIMIT (bien the limit va cau tra loi bao het luot)', async (ctx) => {
    await withMock(ctx, { flags: { limit: true } }, async (base) => {
      await assert.rejects(ask(ctx.page, { prompt: 'Viết bài', base, stableMs: 800 }), (e) => code('GEMINI_LIMIT')(e) && /reached your limit/.test(e.message))
    })
    await withMock(ctx, { queue: [{ error: 'limit' }] }, async (base) => {
      await assert.rejects(ask(ctx.page, { prompt: 'Viết bài', base, stableMs: 800 }), code('GEMINI_LIMIT'))
    })
    // bai viet dai co chu "limit" KHONG bi coi la het luot
    const long = `${'Faith has no limit when you reached the limit of your strength. '.repeat(40)}`.trim()
    await withMock(ctx, { queue: [{ text: long }] }, async (base) => {
      assert.equal(await ask(ctx.page, { prompt: 'Viết bài dài', base, stableMs: 800 }), long)
    })
  }],
  ['nguoi dung bam Dung -> GEMINI_STOPPED, bam nut Stop response cua Gemini', async (ctx) => {
    await withMock(ctx, { flags: { slow: 4000 } }, async (base) => {
      const t0 = Date.now()
      let stopAt = 0
      const shouldStop = () => { if (!stopAt && ctx.mock.server.geminiPrompts.length) stopAt = Date.now() + 500; return stopAt && Date.now() > stopAt }
      await assert.rejects(ask(ctx.page, { prompt: 'Viết chậm', base, shouldStop }), code('GEMINI_STOPPED'))
      assert(Date.now() - t0 < 4000, 'dung ngay, khong cho het cau tra loi')
      await new Promise((r) => setTimeout(r, 300))
      assert(ctx.mock.events.some((e) => e.type === 'gemini-stop'), 'da bam Stop response')
    })
    // dung truoc khi bat dau: khong mo trang
    await assert.rejects(ask(ctx.page, { prompt: 'x', base: `${ctx.mock.base}/gemini`, shouldStop: () => true }), code('GEMINI_STOPPED'))
  }],
  ['qua gio -> GEMINI_TIMEOUT; tra loi rong -> GEMINI_EMPTY', async (ctx) => {
    await withMock(ctx, { flags: { slow: 6000 } }, async (base) => {
      await assert.rejects(ask(ctx.page, { prompt: 'Rất chậm', base, timeoutMs: 3500 }), code('GEMINI_TIMEOUT'))
    })
    await withMock(ctx, { queue: [{ text: '' }] }, async (base) => {
      await assert.rejects(ask(ctx.page, { prompt: 'Trả lời rỗng', base, emptyMs: 1500 }), code('GEMINI_EMPTY'))
    })
  }],
  ['image: luu anh dung byte bang cookie cua phien', async (ctx) => {
    await withMock(ctx, { queue: [{ image: true }] }, async (base) => {
      const r = await imageOn(ctx.page, { prompt: 'Vẽ một ngọn hải đăng', dir: ctx.tmp, base, stableMs: 800 })
      assert.equal(r.mime, 'image/png')
      assert.match(r.file, /\.png$/)
      assert(r.file.startsWith(ctx.tmp))
      assert(fs.readFileSync(r.file).equals(ctx.mock.server.geminiImages[1]), 'dung byte anh')
      const hits = ctx.mock.server.geminiImgHits.filter((h) => h.n === 1)
      assert(hits.length >= 2 && hits.every((h) => h.cookie), 'tool tai anh kem cookie cua phien')
    })
  }],
  ['image: chua dang nhap ("Are you signed in?") -> GEMINI_SIGNIN; chi co chu -> loi kem chu', async (ctx) => {
    await withMock(ctx, { queue: [{ error: 'signin' }] }, async (base) => {
      await assert.rejects(imageOn(ctx.page, { prompt: 'Vẽ ảnh', dir: ctx.tmp, base, stableMs: 800 }), (e) => code('GEMINI_SIGNIN')(e) && /Are you signed in/.test(e.message))
    })
    await withMock(ctx, { queue: [{ text: 'Tôi không thể vẽ ảnh này.' }] }, async (base) => {
      await assert.rejects(imageOn(ctx.page, { prompt: 'Vẽ ảnh', dir: ctx.tmp, base, stableMs: 300 }), (e) => code('GEMINI_EMPTY')(e) && /Tôi không thể vẽ ảnh này/.test(e.message))
    })
  }],
  ['fullSizeUrl: anh googleusercontent lay co goc', async () => {
    assert.equal(fullSizeUrl('https://lh3.googleusercontent.com/gg/AbC-12_x=s1024-rj'), 'https://lh3.googleusercontent.com/gg/AbC-12_x=s0')
    assert.equal(fullSizeUrl('https://lh3.googleusercontent.com/gg/AbC'), 'https://lh3.googleusercontent.com/gg/AbC=s0')
    assert.equal(fullSizeUrl('http://127.0.0.1:5/gemini/__img/1.png'), 'http://127.0.0.1:5/gemini/__img/1.png')
  }],
]
