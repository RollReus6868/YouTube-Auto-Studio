// Chay that app voi Google gia lap: lay binh luan -> Gemini soan -> tu gui loi khen ->
// sua va gui cau tra loi cho cau hoi -> bo qua spam.
//   xvfb-run -a node tests/e2e-comments.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMock } = require('./google-mock')

const waitFor = async (fn, what, ms = 20000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}

;(async () => {
  const mock = await startMock()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-bl-'))
  run(9366, { YA_GOOGLE_MOCK: mock.url, YA_NO_UPDATE_CHECK: '1' }, async ({ ui }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    const oauth = path.join(tmp, 'client.json')
    fs.writeFileSync(oauth, JSON.stringify({ installed: { client_id: '1234567890ab-x.apps.googleusercontent.com', client_secret: 'x', project_id: 'p' } }))
    await call('oauth_import', oauth)
    await call('yt_login')
    await waitFor(async () => !!(await call('hello')).youtube.channel, 'dang nhap kenh')
    await call('gemini_set', 'gemini-ok')
    await call('settings_save', { replyMode: 'auto', skipWords: 'kiếm tiền' })

    await ui.getByRole('button', { name: 'Bình luận', exact: true }).click()
    await ui.getByRole('button', { name: 'Lấy bình luận mới' }).click()
    // cau hoi: cho duyet, co ban nhap
    const box = ui.getByLabel('Trả lời Minh')
    await box.waitFor()
    await waitFor(async () => (await box.inputValue()) === 'Tuần sau nhé bạn!', 'ban nhap Gemini')
    // loi khen: da tu gui
    await waitFor(() => mock.replies && mock.replies.some((r) => r.parentId === 'c1'), 'tu gui loi khen')
    assert.equal(mock.replies.find((r) => r.parentId === 'c1').textOriginal, 'Cảm ơn bạn nhiều ❤️')
    assert.equal(await ui.getByLabel('Trả lời Lan').count(), 0, 'loi khen da gui khong con o muc cho duyet')
    // binh luan cua kenh / da tra loi tren YouTube khong hien
    const st = await call('hello')
    assert.deepEqual(st.comments.items.map((c) => c.id).sort(), ['c1', 'c22', 'c333'])
    assert.equal(st.comments.items.find((c) => c.id === 'c333').status, 'skipped')
    // sua roi gui cau tra loi
    await box.fill('Thứ 5 tuần sau nha bạn!')
    await ui.getByRole('button', { name: 'Gửi', exact: true }).click()
    await waitFor(() => mock.replies.some((r) => r.parentId === 'c22'), 'gui tra loi')
    assert.equal(mock.replies.find((r) => r.parentId === 'c22').textOriginal, 'Thứ 5 tuần sau nha bạn!')
    await ui.getByText('Không có bình luận nào chờ trả lời').waitFor()
    await ui.getByRole('button', { name: 'Đã gửi' }).click()
    await ui.getByText('Thứ 5 tuần sau nha bạn!').waitFor()
    // lay lai: khong tra loi lai lan nua
    const before = mock.replies.length
    await ui.getByRole('button', { name: 'Lấy bình luận mới' }).click()
    await sleep(1500)
    await waitFor(async () => !(await call('hello')).comments.busy, 'lay lai xong')
    assert.equal(mock.replies.length, before)
    console.log('E2E COMMENTS PASSED')
  })
})()
