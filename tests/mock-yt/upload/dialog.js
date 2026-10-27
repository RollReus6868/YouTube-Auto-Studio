// Gia lap hop thoai "Tai video len" cua YouTube Studio (src/flows/upload.js), theo cac buoc nguoi dung quay
// (Studio tieng Viet, thg 10/2026): "Tai video len" -> Chon tep -> Chi tiet (tieu de = ten tep, mo ta co san cua kenh,
// Hinh thu nho "Tai tep len", Danh sach phat "Chon", tre em, Hien them: quang cao tra tien, Su dung AI, the (co san ten kenh),
// ngon ngu "Tieng Anh (Hoa Ky)", ngay quay, vi tri, giay phep, nhung, thong bao, phoi lai Shorts, danh muc, binh luan)
// -> Cac thanh phan cua video (Phu de, Man hinh ket thuc [Nhap tu video][Them], The, Bai kiem tra) -> Kiem tra ban dau
// -> Che do hien thi (Rieng tu / Khong cong khai / Cong khai, Len lich) -> Luu -> "Chung toi van dang kiem tra noi dung
// cua ban" [Quay lai][Van xuat ban] -> hop thoai dong khi video con dang tai (tien do o goc trang) -> chia se.
// Cac o trong trang Chi tiet chep tu trang Chi tiet video that (html/yt-3..5, tests/mock-yt/optimize/chi-tiet-video.html);
// khung hop thoai, cac buoc, che do hien thi, lich, tien do, phu de: chua co HTML that (doan theo Studio).
// Dung o: /studio/channel/UC.../videos/upload?d=ud (upload.html) va trang tong quan kenh (accounts/dashboard.html: nut
// tai len #upload-icon, nut Tao). Can /__file/optimize/data.js (OPT). window.__UP = { uc, cookieCh } do trang chu dat.
// Bien the (localStorage 'up-<ten>' = true): en (Studio tieng Anh), slow (tai len cham), noid (khong co duong lien ket
// trong hop thoai), limit (gioi han tai len hang ngay), failmid (loi giua chung), nothumb (kenh chua xac minh), nosubs
// (khong co muc phu de), monet (them buoc Kiem tien), checkswait (buoc Kiem tra khoa nut Tiep 2,5 giay), noshare (khong
// hien hop thoai chia se), nocheckwarn (kiem tra xong ngay: khong hoi "Van xuat ban"), hidelabel (khong co chu tien do
// trong hop thoai; sau khi dong chi con o tien do goc trang), morepl (kenh co them 2 danh sach phat).
(() => {
  const F = (k) => OPT.load('up-' + k, false)
  const EN = F('en')
  const T = (vi, en) => (EN ? en : vi)
  const esc = OPT.esc
  const $ = (s, r = document) => r.querySelector(s)
  const D = () => window.__UP || { uc: '', cookieCh: '' }
  const log = (e) => OPT.log({ ...e, uc: D().uc })

  const css = document.createElement('style')
  css.textContent = `
  [hidden] { display: none !important }
  ytcp-uploads-dialog, ytcp-uploads-file-picker, ytcp-stepper, ytcp-uploads-details, ytcp-uploads-video-elements, ytcp-uploads-checks,
  ytcp-uploads-review, ytcp-uploads-monetization, ytcp-video-metadata-editor, ytcp-video-metadata-editor-basics, ytcp-video-metadata-editor-advanced,
  ytcp-social-suggestions-textbox, ytcp-thumbnail-uploader, ytcp-thumbnail-editor, ytcp-video-metadata-playlists, ytcp-text-dropdown-trigger,
  tp-yt-paper-radio-group, ytcp-form-input-container, ytcp-free-text-chip-bar, ytcp-chip-bar, ytcp-form-language-input, ytcp-form-select, ytcp-select,
  ytcp-form-checkbox, ytcp-video-info, ytcp-visibility-scheduler, ytcp-text-menu, tp-yt-paper-listbox, ytcp-playlist-dialog, ytcp-checkbox-group,
  ytcp-date-picker, ytve-modal-host, ytcp-video-share-dialog, ytcp-playlist-creation-dialog, ytcp-playlist-metadata-editor, tp-yt-paper-input,
  ytcp-paid-product-placement-select, ytkp-altered-content-select, ytcp-form-location, ytcp-form-autocomplete, ytcp-video-metadata-remix-settings,
  ytcp-comment-moderation-settings, ytcp-prechecks-warning-dialog, ytcp-multi-progress-monitor, ytve-editor, ytve-endscreen-editor-options-panel { display: block }
  ytcp-button, ytcp-button-shape, ytcp-checkbox-lit, ytcp-icon-button, ytcp-video-upload-progress, ytcp-badge { display: inline-block }
  ytcp-uploads-dialog button, ytcp-playlist-dialog button, ytve-modal-host button, ytcp-prechecks-warning-dialog button, ytcp-video-share-dialog button, ytcp-playlist-creation-dialog button { background: #3e3e3e; color: #fff; border: 0; border-radius: 18px; padding: 8px 14px; font-weight: 500; cursor: pointer }
  ytcp-uploads-dialog button[disabled] { opacity: .4 }
  ytcp-uploads-dialog > tp-yt-paper-dialog { position: fixed; z-index: 20; left: 40px; top: 20px; width: 980px; height: 660px; display: flex; flex-direction: column; background: #282828; color: #fff; border: 1px solid #555; border-radius: 12px; font: 13px Roboto, Arial, sans-serif }
  #up-title-row { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #3e3e3e } #dialog-title { flex: 1; font-size: 20px; margin: 0 } #save-status { color: #aaa }
  #up-body { flex: 1; overflow: auto; padding: 0 20px }
  ytcp-uploads-file-picker { text-align: center; padding-top: 120px }
  .error-short { color: #ff6b6b; margin: 12px }
  ytcp-stepper { display: flex; gap: 40px; justify-content: center; padding: 10px } ytcp-stepper .step { background: none !important; border-radius: 0 !important } ytcp-stepper .step[active] { border-bottom: 2px solid #3ea6ff !important }
  .up-cols { display: grid; grid-template-columns: 580px 300px; gap: 24px }
  #dialog-buttons { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid #3e3e3e } #dialog-buttons .sp { flex: 1 }
  ytcp-uploads-dialog .input-container { margin: 16px 0 } .section-label, .section-label-with-description { font-weight: 600; font-size: 14px } .description, .section-description { color: #aaa; font-size: 12px }
  ytcp-uploads-dialog #textbox, ytcp-playlist-creation-dialog #textbox { border: 1px solid #555; border-radius: 4px; padding: 8px; min-height: 20px; white-space: pre-wrap }
  ytcp-dropdown-trigger { display: block; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; width: 220px; position: relative; cursor: pointer }
  .label-text { font-size: 11px; color: #aaa } .dropdown-trigger-text { font-size: 14px } .right-container { position: absolute; right: 8px; top: 8px } .right-icon::after { content: "▾" }
  ytcp-text-menu { position: absolute; z-index: 60; left: 0; top: 100% } ytcp-text-menu tp-yt-paper-dialog { display: block; background: #1f1f1f; border: 1px solid #555; min-width: 220px; max-height: 240px; overflow: auto }
  tp-yt-paper-item { display: block; padding: 8px 12px; cursor: pointer } tp-yt-paper-item:hover { background: #333 }
  tp-yt-paper-radio-button { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer }
  #radioContainer { width: 14px; height: 14px; border: 2px solid #aaa; border-radius: 50% } tp-yt-paper-radio-button[aria-checked=true] #radioContainer { background: #3ea6ff }
  ytcp-checkbox-lit #root-container { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer }
  #checkbox { width: 14px; height: 14px; border: 2px solid #aaa } #checkbox[aria-checked=true] { background: #3ea6ff }
  ytcp-chip { display: inline-flex; gap: 4px; background: #3e3e3e; border-radius: 12px; padding: 4px 8px; margin: 2px }
  #tags-container { border: 1px solid #555; border-radius: 4px; padding: 6px } #text-input, #location input { background: transparent; border: 0; color: #fff; width: 200px }
  #preview img { width: 120px; height: 68px; object-fit: cover }
  .up-backdrop { position: fixed; inset: 0; background: #0009; z-index: 30 }
  ytcp-playlist-dialog > tp-yt-paper-dialog { position: fixed; z-index: 40; left: 260px; top: 140px; width: 320px; min-height: 240px; display: flex; flex-direction: column; background: #1f1f1f; color: #fff; border: 1px solid #555; border-radius: 8px; padding: 12px }
  ytcp-playlist-dialog ul { flex: 1; list-style: none; padding: 0; margin: 0 } ytcp-playlist-dialog li.pl-row { display: flex; align-items: center; gap: 6px } ytcp-playlist-dialog li.pl-row label { display: flex; align-items: center; gap: 6px; flex: 1; cursor: pointer } ytcp-badge { background: #444; font-size: 11px; padding: 2px 6px }
  .action-buttons { display: flex; justify-content: space-between; position: relative }
  ytcp-playlist-creation-dialog > tp-yt-paper-dialog { position: fixed; z-index: 50; left: 300px; top: 180px; width: 320px; display: block; background: #1f1f1f; color: #fff; border: 1px solid #555; border-radius: 8px; padding: 12px }
  ytcp-date-picker tp-yt-paper-dialog { position: fixed; z-index: 40; left: 300px; top: 300px; width: 280px; display: block; background: #1f1f1f; color: #fff; border: 1px solid #555; padding: 12px }
  ytve-modal-host tp-yt-paper-dialog { position: fixed; z-index: 40; left: 120px; top: 60px; width: 640px; height: 460px; display: block; background: #1f1f1f; color: #fff; border: 1px solid #555; border-radius: 8px; padding: 16px }
  #video-editor-modal-host-header { display: flex; gap: 12px; align-items: center } #video-editor-modal-host-title { flex: 1; font-size: 18px; font-weight: 600 }
  .templates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px } .template { display: block; border: 1px solid #555; border-radius: 6px; padding: 30px 8px 8px; cursor: pointer }
  ytcp-video-share-dialog tp-yt-paper-dialog, ytcp-prechecks-warning-dialog tp-yt-paper-dialog { position: fixed; z-index: 45; left: 300px; top: 200px; width: 440px; display: block; background: #1f1f1f; color: #fff; border: 1px solid #555; border-radius: 8px; padding: 16px }
  ytcp-uploads-dialog .el-row { display: flex; align-items: center; justify-content: space-between; border: 1px solid #3e3e3e; border-radius: 8px; padding: 12px; margin: 10px 0 }
  #time-of-day-container input { background: transparent; color: #fff; border: 1px solid #555; padding: 6px; width: 90px }
  ytcp-multi-progress-monitor { position: fixed; right: 16px; bottom: 16px; background: #333; color: #fff; padding: 10px 14px; border-radius: 8px; z-index: 15 }`
  document.head.appendChild(css)

  const LANGS = EN ? ['None', 'Vietnamese', 'English', 'English (United States)', 'English (United Kingdom)', 'Japanese', 'French'] : ['Không có', 'Tiếng Việt', 'Tiếng Anh', 'Tiếng Anh (Hoa Kỳ)', 'Tiếng Anh (Vương quốc Anh)', 'Tiếng Nhật', 'Tiếng Pháp']
  const CATS = EN ? ['Film & Animation', 'Music', 'Education', 'People & Blogs', 'Entertainment', 'News & Politics'] : ['Phim và hoạt hình', 'Âm nhạc', 'Giáo dục', 'Mọi người và blog', 'Giải trí', 'Tin tức và chính trị']
  const LICS = [T('Giấy phép chuẩn của YouTube', 'Standard YouTube License'), T('Creative Commons - Ghi công', 'Creative Commons - Attribution')]
  const COMMENTS = [T('Bật', 'On'), T('Tạm dừng', 'Pause'), T('Tắt', 'Off')]
  const REMIX = [T('Cho phép phối lại video và âm thanh', 'Allow video and audio remixing'), T('Chỉ cho phép phối lại âm thanh', 'Allow only audio remixing'), T('Không cho phép phối lại', "Don't allow remixing")]
  const PAID = [T('Có, video của tôi có chứa nội dung được trả tiền để quảng cáo', 'Yes, my video contains paid promotion like a product placement, sponsorship, or endorsement'), T('Không, video của tôi không chứa nội dung được trả tiền để quảng cáo', 'No, my video does not contain paid promotion')]
  // danh sach phat cua kenh (giong kenh trong video quay: 2 danh sach cung ten, mot cai la Podcast)
  const PLAYLISTS = [{ id: 'PLup000001', name: 'Bible - in a Nutshell' }, { id: 'PLup000002', name: 'Bible - in a Nutshell', podcast: true }]
    .concat(F('morepl') ? [{ id: 'PLup000003', name: 'Sermons' }, { id: 'PLup000004', name: 'Dark Bible Study' }] : [])
  const CHANNEL_DESC = 'Donate to Us: https://example.org/donate\nGet the ebook here: https://example.org/ebook'
  const CHANNEL_TAG = 'Bible in a Nutshell'
  const PLACES = [['Unicar VN', T('Đường Trần Huy Liệu, Nghệ An', 'Tran Huy Lieu Street, Nghe An')], ['United States', T('Quốc gia', 'Country')], ['United Kingdom', T('Quốc gia', 'Country')], ['Unishop Vinh', 'Nghệ An'], ['Vietnam', T('Quốc gia', 'Country')]]

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const fmtDate = (d) => (EN ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}`)
  function parseDate(s) {
    s = String(s || '').trim()
    let m = /^(\d{1,2}) thg (\d{1,2}), (\d{4})$/.exec(s)
    if (m && !EN) return new Date(+m[3], +m[2] - 1, +m[1])
    m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(s)
    if (m && EN && MONTHS.includes(m[1])) return new Date(+m[3], MONTHS.indexOf(m[1]), +m[2])
    return null
  }
  const p2 = (n) => String(n).padStart(2, '0')
  function parseTime(s) {
    s = String(s || '').trim()
    const m = EN ? /^(\d{1,2}):(\d{2}) ?(AM|PM)$/i.exec(s) : /^(\d{1,2}):(\d{2})$/.exec(s)
    if (!m) return null
    let h = +m[1]
    if (EN) { if (h < 1 || h > 12) return null; h = (h % 12) + (/pm/i.test(m[3]) ? 12 : 0) } else if (h > 23) return null
    if (+m[2] > 59) return null
    return EN ? `${(h % 12) || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}` : `${p2(h)}:${m[2]}`
  }
  // chu trong o soan thao nhu Studio doc: moi <div> la mot dong (Chrome tach dong khi go "\n" vao contenteditable)
  function ceText(el) {
    let out = ''
    for (const n of el.childNodes) {
      if (n.nodeType === 3) out += n.data
      else if (n.nodeName === 'BR') out += '\n'
      else if (n.nodeName === 'DIV' || n.nodeName === 'P') out += (out ? '\n' : '') + (n.textContent || '')
    }
    return out.replace(/\n$/, '')
  }

  // ---- trang thai video dang tai ----
  let W = null
  const fresh = () => ({
    file: '', size: 0, title: '', desc: CHANNEL_DESC, thumb: '', playlists: [], kids: '', paid: '', ai: '', tags: [CHANNEL_TAG],
    language: LANGS[3], titleLanguage: LANGS[3], recDate: '', location: '', license: LICS[0], embed: true, notify: true,
    remix: REMIX[0], category: CATS[3], comments: COMMENTS[0], showLikes: true, endscreen: '', subs: [], vis: '', date: fmtDate(new Date()),
    time: T('09:00', '9:00 AM'), id: '', pct: 0, uploaded: false, checked: false, failed: '', step: 0, earlyDone: false, anyway: false, published: false,
  })
  const STEPS = () => [['details', T('Chi tiết', 'Details')]].concat(F('monet') ? [['monetization', T('Kiếm tiền', 'Monetization')]] : [], [['video-elements', T('Các thành phần của video', 'Video elements')], ['checks', T('Kiểm tra ban đầu', 'Checks')], ['review', T('Chế độ hiển thị', 'Visibility')]])

  // ---- o tha xuong: ytcp-text-menu > tp-yt-paper-dialog > tp-yt-paper-listbox > tp-yt-paper-item ----
  let openMenu = null
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null } }
  function menu(host, options, cur, onPick) {
    closeMenu()
    const m = document.createElement('ytcp-text-menu')
    m.innerHTML = `<tp-yt-paper-dialog role="dialog"><tp-yt-paper-listbox role="listbox">${options.map((o, i) => `<tp-yt-paper-item role="option" id="text-item-${i}" aria-selected="${o === cur}">${esc(o)}</tp-yt-paper-item>`).join('')}</tp-yt-paper-listbox></tp-yt-paper-dialog>`
    m.addEventListener('click', (e) => { const it = e.target.closest('tp-yt-paper-item'); if (!it) return; e.stopPropagation(); closeMenu(); onPick(it.textContent) })
    setTimeout(() => { host.style.position = 'relative'; host.appendChild(m); openMenu = m }, 150)
  }
  document.addEventListener('click', (e) => { if (openMenu && openMenu.parentElement && !openMenu.parentElement.contains(e.target)) closeMenu() })
  const select = (tag, idAttr, key, label, options) => `<${tag} id="${idAttr}" data-k="${key}" data-opts="${esc(JSON.stringify(options))}">${OPT.trigger(label, '')}</${tag}>`
  const radios = (key, items) => `<tp-yt-paper-radio-group role="radiogroup" data-k="${key}">${items.map(([name, label, aria]) => OPT.radio(name, label, aria).replace('<tp-yt-paper-radio-button', `<tp-yt-paper-radio-button data-v="${esc(label)}"`)).join('')}</tp-yt-paper-radio-group>`
  const section = (id, label, desc, body) => `<div ${id ? `id="${id}"` : ''} class="input-container"><div class="section-label-with-description">${label}</div>${desc ? `<div class="section-description">${desc}</div>` : ''}${body}</div>`

  // ---- nut Tao (thanh tren cung) -> Tai video len ----
  function createButton(host) {
    host.innerHTML = OPT.button('', T('Tạo', 'Create')).replace('<ytcp-button ', '<ytcp-button icon="yt-sys-icons:video_call" ')
    $('ytcp-button', host).onclick = () => menu(host, [T('Tải video lên', 'Upload videos'), T('Phát trực tiếp', 'Go live'), T('Tạo bài đăng', 'Create post')], '', (v) => { if (v === T('Tải video lên', 'Upload videos')) openDialog() })
  }

  // ---- hop thoai tai len ----
  let dlg = null
  function openDialog() {
    if (dlg) return
    W = fresh()
    log({ type: 'upload-open' })
    dlg = document.createElement('ytcp-uploads-dialog')
    dlg.innerHTML = `<tp-yt-paper-dialog id="dialog" role="dialog" aria-label="${T('Tải video lên', 'Upload videos')}">
      <div id="up-title-row"><h1 id="dialog-title">${T('Tải video lên', 'Upload videos')}</h1><span id="save-status"></span><ytcp-icon-button id="close-button" role="button" aria-label="${T('Đóng', 'Close')}">✕</ytcp-icon-button></div>
      <div id="up-body"><ytcp-uploads-file-picker><div id="content"><p class="label">${T('Kéo và thả tệp video để tải lên', 'Drag and drop video files to upload')}</p>
        <p class="description">${T('Các video của bạn sẽ ở chế độ riêng tư cho đến khi bạn xuất bản.', 'Your videos will be private until you publish them.')}</p>
        <div class="error-area"></div>${OPT.button('select-files-button', T('Chọn tệp', 'Select files'))}<input type="file" name="Filedata" hidden accept="video/*"></div></ytcp-uploads-file-picker></div>
      </tp-yt-paper-dialog>`
    document.body.appendChild(dlg)
    $('#close-button', dlg).onclick = () => { log({ type: 'upload-closed' }); dlg.remove(); dlg = null }
    const input = $('input[name=Filedata]', dlg)
    $('#select-files-button', dlg).onclick = () => input.click()
    input.addEventListener('change', () => {
      const f = input.files[0]
      if (!f) return
      W.file = f.name; W.size = f.size
      if (F('limit')) {
        $('.error-area', dlg).innerHTML = `<div class="error-short">${T('Đã đạt đến giới hạn tải lên hằng ngày', 'Daily upload limit reached')}</div>`
        log({ type: 'upload-limit', file: f.name })
        return
      }
      setTimeout(details, 500)
    })
  }

  function details() {
    const thumb = F('nothumb')
      ? `<ytcp-thumbnail-uploader><ytcp-thumbnail-editor><button id="select-button" aria-label="${T('Tải tệp lên', 'Upload file')}" disabled aria-disabled="true"><span id="select-text">${T('Tải tệp lên', 'Upload file')}</span></button></ytcp-thumbnail-editor><div class="description">${T('Để tải hình thu nhỏ tùy chỉnh lên, bạn cần xác minh tài khoản.', 'To upload custom thumbnails, verify your account.')}</div></ytcp-thumbnail-uploader>`
      : `<ytcp-thumbnail-uploader><ytcp-thumbnail-editor><button id="select-button" aria-label="${T('Tải tệp lên', 'Upload file')}"><span id="select-text">${T('Tải tệp lên', 'Upload file')}</span></button> <button>${T('Chọn trong video', 'Auto-generated')}</button> <button>${T('Thử nghiệm A/B', 'Test & compare')}</button><div id="preview"></div></ytcp-thumbnail-editor><input id="file-loader" hidden type="file" accept="image/jpeg,image/png"></ytcp-thumbnail-uploader>`
    const kids = `<tp-yt-paper-radio-group role="radiogroup" id="kids">${OPT.radio('VIDEO_MADE_FOR_KIDS_MFK', T('Có, nội dung này dành cho trẻ em', "Yes, it's made for kids"))}${OPT.radio('VIDEO_MADE_FOR_KIDS_NOT_MFK', T('Không, nội dung này không dành cho trẻ em', "No, it's not made for kids"))}</tp-yt-paper-radio-group>`
    const priv = (name, vi, en) => OPT.radio(name, T(vi, en))
    const row = (title, desc, buttons) => `<div class="el-row"><div><div class="section-label">${title}</div><div class="description">${desc}</div></div><div>${buttons}</div></div>`
    $('#up-body', dlg).innerHTML = `
      <ytcp-stepper id="stepper">${STEPS().map(([, label], i) => `<button id="step-badge-${i}" class="step" ${i === 0 ? 'active state="active"' : 'state="pending"'}>${esc(label)}</button>`).join('')}</ytcp-stepper>
      <ytcp-uploads-details><div class="up-cols"><div>
        <h2>${T('Chi tiết', 'Details')}</h2>
        <ytcp-video-metadata-editor><ytcp-video-metadata-editor-basics>
          <ytcp-social-suggestions-textbox id="title-textarea" label="${T('Tiêu đề', 'Title')}"><div id="label"><span id="label-text">${T('Tiêu đề (bắt buộc)', 'Title (required)')}</span></div>
            <div id="textbox" slot="input" contenteditable="true" role="textbox" aria-required="true" aria-label="${T('Thêm tiêu đề để mô tả video của bạn (nhập ký tự @ để đề cập tên một kênh)', 'Add a title that describes your video (type @ to mention a channel)')}"></div><div role="status" id="title-count">0/100</div></ytcp-social-suggestions-textbox>
          <ytcp-social-suggestions-textbox id="description-textarea"><div id="label"><span id="label-text">${T('Mô tả', 'Description')}</span></div>
            <div id="textbox" slot="input" contenteditable="true" role="textbox" aria-label="${T('Giới thiệu về video của bạn cho người xem (nhập ký tự @ để đề cập tên một kênh)', 'Tell viewers about your video (type @ to mention a channel)')}">${esc(W.desc)}</div></ytcp-social-suggestions-textbox>
          <div class="input-container"><div class="section-label">${T('Hình thu nhỏ', 'Thumbnail')}</div>${thumb}</div>
          ${section('', T('Danh sách phát', 'Playlists'), T('Thêm video của bạn vào danh sách phát để sắp xếp nội dung cho người xem.', 'Add your video to one or more playlists to organize your content for viewers.'),
            `<ytcp-video-metadata-playlists aria-label="${T('Thêm vào danh sách phát', 'Add to playlist')}"><ytcp-text-dropdown-trigger placeholder="${T('Chọn', 'Select')}">${OPT.trigger('', T('Chọn', 'Select'), `aria-label="${T('Chọn danh sách phát', 'Select playlists')}" id="pl-trigger"`)}</ytcp-text-dropdown-trigger></ytcp-video-metadata-playlists>`)}
          <div id="audience" class="input-container"><div class="section-label">${T('Đối tượng người xem', 'Audience')}</div><div class="description">${T('Video này có phải là nội dung dành cho trẻ em không? (bắt buộc)', 'Is this video made for kids? (required)')}</div>${kids}<div class="error-short" id="kids-error" hidden>${T('Bạn cần chọn đối tượng người xem', 'Audience selection is required')}</div></div>
        </ytcp-video-metadata-editor-basics>
        <div class="toggle-section">${OPT.button('toggle-button', T('Hiện thêm', 'Show more'))}</div>
        <p class="description" id="more-hint">${T('Nội dung được trả tiền để quảng cáo, cộng tác và các lựa chọn khác', 'Paid promotion, tags, subtitles, and more')}</p>
        <ytcp-video-metadata-editor-advanced id="advanced" hidden></ytcp-video-metadata-editor-advanced>
        </ytcp-video-metadata-editor>
      </div><ytcp-video-info><div style="width:280px;height:158px;background:#444">player</div>
        <div class="label description">${T('Đường liên kết của video', 'Video link')}</div><span class="video-url-fadeable" id="link-host">${T('Đang tải lên...', 'Uploading...')}</span>
        <div class="label description">${T('Tên tệp', 'Filename')}</div><div id="filename">${esc(W.file)}</div></ytcp-video-info></div></ytcp-uploads-details>
      ${F('monet') ? `<ytcp-uploads-monetization hidden><h2>${T('Kiếm tiền', 'Monetization')}</h2><p>${T('Kiếm tiền: Bật', 'Monetization: On')}</p></ytcp-uploads-monetization>` : ''}
      <ytcp-uploads-video-elements hidden><h2>${T('Các thành phần của video', 'Video elements')}</h2>
        ${F('nosubs') ? '' : row(T('Phụ đề', 'Subtitles'), T('Tiếp cận nhiều người xem hơn bằng cách thêm phụ đề vào video', 'Reach a broader audience by adding subtitles to your video') + '<div id="subs-status"></div>', OPT.button('subtitles-button', T('Thêm', 'Add')))}
        ${row(T('Màn hình kết thúc', 'End screen'), T('Quảng bá nội dung có liên quan ở cuối video', 'Promote related content at the end of your video') + '<div id="es-status"></div>', OPT.button('import-endscreen-from-video-button', T('Nhập từ video', 'Import from video')) + ' ' + OPT.button('endscreens-button', T('Thêm', 'Add')))}
        ${row(T('Thẻ', 'Cards'), T('Quảng bá nội dung có liên quan trong video', 'Promote related content during your video'), OPT.button('cards-button', T('Thêm', 'Add')))}
        ${row(T('Bài kiểm tra', 'Quiz'), T('Thêm câu hỏi kiểm tra cho người xem', 'Add a quiz for viewers'), OPT.button('quiz-button', T('Thêm', 'Add')))}</ytcp-uploads-video-elements>
      <ytcp-uploads-checks hidden><h2>${T('Kiểm tra ban đầu', 'Checks')}</h2><p id="checks-text"></p></ytcp-uploads-checks>
      <ytcp-uploads-review hidden><h2>${T('Chế độ hiển thị', 'Visibility')}</h2>
        <div id="first-container" class="el-row" style="display:block"><div class="section-label">${T('Lưu hoặc xuất bản', 'Save or publish')}</div>
          <tp-yt-paper-radio-group id="privacy-radios" role="radiogroup">${priv('PRIVATE', 'Riêng tư', 'Private')}${priv('UNLISTED', 'Không công khai', 'Unlisted')}${priv('PUBLIC', 'Công khai', 'Public')}</tp-yt-paper-radio-group>
          <div id="instant-premiere" style="margin-left:24px">${OPT.checkbox('enable-premiere-checkbox', T('Đặt ở chế độ Công chiếu ngay', 'Set as instant Premiere'), false)}</div></div>
        <div id="second-container" class="el-row" style="display:block"><ytcp-icon-button id="second-container-expand-button" role="button" aria-label="${T('Lên lịch', 'Schedule')}">⌄</ytcp-icon-button> <span class="section-label">${T('Lên lịch', 'Schedule')}</span>
          <div class="description">${T('Đặt lịch chuyển sang chế độ công khai', 'Select a date to make your video public')}</div>
          <ytcp-visibility-scheduler id="scheduler" hidden><div style="display:flex;gap:12px;align-items:center">
            <ytcp-text-dropdown-trigger id="datepicker-trigger">${OPT.trigger('', W.date)}</ytcp-text-dropdown-trigger>
            <div id="time-of-day-container"><tp-yt-paper-input id="textbox" aria-label="${T('Giờ', 'Time')}"><input value="${esc(W.time)}" autocomplete="off"></tp-yt-paper-input></div>
            <span class="description">${T('Múi giờ', 'Time zone')}: GMT+07:00</span></div>
            ${OPT.checkbox('schedule-premiere', T('Đặt làm video Công chiếu', 'Set as Premiere'), false)}</ytcp-visibility-scheduler></div></ytcp-uploads-review>`
    const btns = document.createElement('div')
    btns.id = 'dialog-buttons'
    btns.innerHTML = `<ytcp-video-upload-progress><span class="progress-label"></span></ytcp-video-upload-progress><span class="sp"></span>
      ${OPT.button('back-button', T('Quay lại', 'Back'))} ${OPT.button('next-button', T('Tiếp', 'Next'))} <span id="done-host" hidden>${OPT.button('done-button', T('Lưu', 'Save'), { disabled: true })}</span>`
    $('tp-yt-paper-dialog', dlg).appendChild(btns)
    $('#back-button', dlg).hidden = true
    bind()
    progress()
    saving()
    // Studio tu dien ten file (bo duoi) vao tieu de, hoi tre
    setTimeout(() => { const t = $('#title-textarea #textbox', dlg); if (t && !t.textContent) { t.textContent = W.file.replace(/\.[^.]+$/, ''); W.title = t.textContent; count() } }, 400)
    if (!F('noid')) setTimeout(() => { if (!dlg) return; W.id = W.id || newId(); $('#link-host', dlg).innerHTML = `<a class="ytcp-video-info" href="https://youtu.be/${W.id}" target="_blank">https://youtu.be/${W.id}</a>` }, 800)
  }
  const newId = () => 'Up' + Array.from({ length: 9 }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789_-'[Math.floor(Math.random() * 58)]).join('')
  const count = () => { $('#title-count', dlg).textContent = `${[...W.title].length}/100` }
  // dau trang hop thoai: "Dang luu..." roi "Da luu o che do rieng tu" moi khi co thay doi
  function saving() {
    if (!dlg) return
    $('#save-status', dlg).textContent = T('Đang lưu...', 'Saving...')
    clearTimeout(saving.t)
    saving.t = setTimeout(() => { if (dlg) $('#save-status', dlg).textContent = T('Đã lưu ở chế độ riêng tư', 'Saved as private') }, 600)
  }

  // tai len gia: "Da tai duoc N% ... Con N phut" -> "Da tai len xong" -> kiem tra -> "Da kiem tra xong"
  function progress() {
    // hidelabel: tai len rat cham, chi xong 5 giay sau khi bam Luu (de kiem tool giu trang toi khi tai xong)
    const total = F('slow') ? 7000 : F('hidelabel') ? 600000 : 1500
    let t0 = Date.now()
    W.finishIn = (ms) => { if (!W.uploaded) t0 = Math.min(t0, Date.now() - total + ms) }
    const label = () => (dlg ? $('.progress-label', dlg) : null)
    const mini = () => $('ytcp-multi-progress-monitor')
    const show = (text) => { const l = label(); if (l && !F('hidelabel')) l.textContent = text; const m = mini(); if (m) m.textContent = text }
    const tick = () => {
      if (W.closed) return
      const pct = Math.min(100, Math.floor(((Date.now() - t0) / total) * 100))
      W.pct = pct
      if (F('failmid') && pct >= 50) {
        W.failed = T('Tải lên không thành công. Đã xảy ra lỗi mạng.', 'Upload failed. A network error occurred.')
        show(W.failed)
        log({ type: 'upload-failed', file: W.file })
        return
      }
      const left = Math.max(1, Math.ceil((total - (Date.now() - t0)) / 1000))
      if (pct < 100) { show(T(`Đã tải được ${pct}% ... Còn ${left} phút`, `Uploading ${pct}% ... ${left} minutes left`)); setTimeout(tick, 150); return }
      W.uploaded = true
      log({ type: 'upload-finished', file: W.file, published: W.published })
      show(T('Đã tải lên xong ... Đang kiểm tra', 'Upload complete ... Checking'))
      setTimeout(() => {
        W.checked = true
        show(T('Đã kiểm tra xong. Không phát hiện vấn đề nào.', 'Checks complete. No issues found.'))
        const m = mini(); if (m) setTimeout(() => m.remove(), 1500)
      }, F('nocheckwarn') ? 0 : 60000) // kiem tra ban dau lau: bam Luu truoc khi xong -> hoi "Van xuat ban"
    }
    tick()
  }

  function showStep(i) {
    const steps = STEPS()
    W.step = i
    steps.forEach(([k], j) => { const el = $(`ytcp-uploads-${k}`, dlg); if (el) el.hidden = j !== i })
    steps.forEach((_, j) => { const b = $(`#step-badge-${j}`, dlg); if (j === i) { b.setAttribute('active', ''); b.setAttribute('state', 'active') } else { b.removeAttribute('active'); b.setAttribute('state', j < i ? 'done' : 'pending') } })
    const last = i === steps.length - 1
    $('#next-button', dlg).hidden = last
    $('#done-host', dlg).hidden = !last
    $('#back-button', dlg).hidden = i === 0
    OPT.setDisabled($('#next-button', dlg), false)
    if (steps[i][0] === 'checks') {
      $('#checks-text', dlg).textContent = W.checked ? T('Bản quyền: Không phát hiện thấy vấn đề nào', 'Copyright: No issues found') : T('Đang kiểm tra... Bạn có thể tiếp tục trong khi chúng tôi kiểm tra', 'Checking... You can continue while we check')
      if (F('checkswait')) {
        OPT.setDisabled($('#next-button', dlg), true)
        setTimeout(() => { if (dlg) OPT.setDisabled($('#next-button', dlg), false) }, 2500)
      }
    }
    paintDone()
  }

  function paintDone() {
    const b = $('#done-button', dlg)
    if (!b) return
    const text = W.vis === 'SCHEDULE' ? T('Lên lịch', 'Schedule') : W.vis === 'PUBLIC' ? T('Xuất bản', 'Publish') : T('Lưu', 'Save')
    $('.ytcpButtonShapeImpl__button-text-content', b).textContent = text
    $('button', b).setAttribute('aria-label', text)
    OPT.setDisabled(b, !W.vis)
  }

  function bind() {
    const title = $('#title-textarea #textbox', dlg)
    title.addEventListener('input', () => { W.title = title.textContent; count(); saving() })
    const desc = $('#description-textarea #textbox', dlg)
    desc.addEventListener('input', () => { W.desc = ceText(desc); saving() })
    const thumbIn = $('#file-loader', dlg)
    if (thumbIn) {
      $('#select-button', dlg).onclick = () => thumbIn.click()
      thumbIn.addEventListener('change', () => {
        const f = thumbIn.files[0]
        if (!f) return
        setTimeout(() => { W.thumb = f.name; $('#preview', dlg).innerHTML = `<img id="img-with-fallback" src="${URL.createObjectURL(f)}">`; $('ytcp-thumbnail-uploader', dlg).setAttribute('selected', ''); saving() }, 400)
      })
    }
    $('ytcp-video-metadata-playlists', dlg).onclick = playlistDialog
    $('#kids', dlg).addEventListener('click', (e) => {
      const r = e.target.closest('tp-yt-paper-radio-button'); if (!r) return
      for (const x of $('#kids', dlg).children) x.setAttribute('aria-checked', String(x === r))
      W.kids = r.getAttribute('name').replace('VIDEO_MADE_FOR_KIDS_', '')
      $('#kids-error', dlg).hidden = true
    })
    const MORE = T('Hiện thêm', 'Show more'), LESS = T('Ẩn bớt', 'Show less')
    $('#toggle-button button', dlg).setAttribute('aria-label', MORE)
    $('#toggle-button', dlg).onclick = () => {
      const adv = $('#advanced', dlg)
      const label = $('#toggle-button .ytcpButtonShapeImpl__button-text-content', dlg)
      if (label.textContent === MORE) {
        if (!adv.innerHTML) { adv.innerHTML = advanced(); bindAdvanced(adv) }
        adv.hidden = false; label.textContent = LESS; $('#more-hint', dlg).hidden = true
      } else { adv.hidden = true; label.textContent = MORE; $('#more-hint', dlg).hidden = false }
      $('#toggle-button button', dlg).setAttribute('aria-label', label.textContent)
      paintAdv()
    }
    $('#next-button', dlg).onclick = () => { if ($('#next-button', dlg).getAttribute('aria-disabled') !== 'true' && W.step < STEPS().length - 1) showStep(W.step + 1) }
    $('#back-button', dlg).onclick = () => { if (W.step > 0) showStep(W.step - 1) }
    const radiosEl = $('#privacy-radios', dlg)
    radiosEl.addEventListener('click', (e) => {
      const r = e.target.closest('tp-yt-paper-radio-button'); if (!r) return
      for (const x of radiosEl.children) x.setAttribute('aria-checked', String(x === r))
      W.vis = r.getAttribute('name')
      $('#scheduler', dlg).hidden = true
      paintDone()
    })
    $('#second-container-expand-button', dlg).onclick = () => {
      const s = $('#scheduler', dlg)
      s.hidden = !s.hidden
      if (!s.hidden) { W.vis = 'SCHEDULE'; for (const x of radiosEl.children) x.setAttribute('aria-checked', 'false') } else if (W.vis === 'SCHEDULE') W.vis = ''
      paintDone()
    }
    $('#datepicker-trigger', dlg).onclick = () => datePicker(W.date, (v) => { W.date = v; $('#datepicker-trigger .dropdown-trigger-text', dlg).textContent = v })
    const time = $('#time-of-day-container input', dlg)
    const setTime = () => { const v = parseTime(time.value); if (v) { W.time = v; time.value = v } else time.value = W.time }
    time.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTime() })
    time.addEventListener('change', setTime)
    if (!F('nosubs')) $('#subtitles-button', dlg).onclick = subtitlesDialog
    $('#endscreens-button', dlg).onclick = endScreen
    $('#done-button', dlg).onclick = publish
    showStep(0)
  }

  function advanced() {
    return `
    <div id="paid-promotion" class="input-container paid-promotion"><ytcp-paid-product-placement-select><div class="section-label">${T('Nội dung được trả tiền để quảng cáo', 'Paid promotion')}</div>
      <div class="description">${T('Bạn phải cho chúng tôi biết video của bạn có chứa nội dung được trả tiền để quảng cáo hay không…', 'If you accepted anything of value from a third party to make your video, you must let us know…')}</div>
      ${radios('paid', [['VIDEO_PAID_PRODUCT_PLACEMENT_NOTIFY', PAID[0]], ['VIDEO_PAID_PRODUCT_PLACEMENT_NO', PAID[1]]])}</ytcp-paid-product-placement-select></div>
    ${section('brand-links-section', T('Hợp tác với thương hiệu', 'Brand partnerships'), '', OPT.button('brand-partner-shared-code-button', T('Chia sẻ mã truy cập', 'Share access code')))}
    ${section('altered-content', T('Sử dụng AI', 'Altered content'), '', `<ytkp-altered-content-select><div class="altered-content-prompt-heading">${T('Bạn có sử dụng AI để tạo hoặc chỉnh sửa nội dung theo bất kỳ cách nào sau đây không?', 'Do any of the following describe your content?')}</div>
      ${radios('ai', [['VIDEO_HAS_ALTERED_CONTENT_YES', T('Có', 'Yes'), T('Có, đã dùng AI', 'Yes, altered')], ['VIDEO_HAS_ALTERED_CONTENT_NO', T('Không', 'No'), T('Không, không dùng AI', 'No, not altered')]])}</ytkp-altered-content-select>`)}
    ${section('collaboration-container', T('Cộng tác', 'Collaboration'), '', OPT.button('', T('Mời cộng sự', 'Invite collaborator')))}
    ${section('', T('Phân cảnh tự động', 'Automatic chapters'), '', OPT.checkbox('', T('Cho phép dùng phân cảnh tự động', 'Allow automatic chapters'), true))}
    ${section('', T('Địa điểm nổi bật', 'Featured places'), '', OPT.checkbox('', T('Cho phép chèn địa điểm tự động', 'Allow automatic places'), true))}
    ${section('', T('Khái niệm tự động', 'Automatic concepts'), '', OPT.checkbox('', T('Cho phép dùng khái niệm tự động', 'Allow automatic concepts'), true))}
    ${section('', T('Thẻ (từ khóa)', 'Tags'), T('Thẻ có thể giúp ích cho bạn nếu nội dung trong video của bạn thường dễ bị viết sai chính tả.', 'Tags can be useful if content in your video is commonly misspelled.'),
      `<ytcp-form-input-container id="tags-container"><div id="outer"><div id="child-input"><ytcp-free-text-chip-bar><ytcp-chip-bar id="chip-bar"><span id="chips"></span><input id="text-input" class="text-input" aria-label="${T('Thẻ (từ khóa)', 'Tags')}"></ytcp-chip-bar></ytcp-free-text-chip-bar></div></div>
      <div class="description">${T('Nhập dấu phẩy sau mỗi thẻ', 'Enter a comma after each tag')}</div></ytcp-form-input-container>`)}
    ${section('', T('Ngôn ngữ và chứng nhận phụ đề', 'Language and captions certification'), '',
      `<ytcp-form-language-input id="language-input">${select('ytcp-select', 'lang-select', 'language', T('Ngôn ngữ video', 'Video language'), LANGS)}</ytcp-form-language-input>
       ${select('ytcp-form-select', 'title-language', 'titleLanguage', T('Ngôn ngữ của tiêu đề và nội dung mô tả', 'Title and description language'), LANGS)}`)}
    ${section('recording-date-location', T('Ngày và địa điểm quay video', 'Recording date and location'), '',
      `<div style="display:flex;gap:12px"><ytcp-text-dropdown-trigger id="recorded-date">${OPT.trigger(T('Ngày quay', 'Recording date'), '')}</ytcp-text-dropdown-trigger>
       <ytcp-form-location id="location"><ytcp-form-autocomplete><ytcp-dropdown-trigger><div role="button" class="container"><div class="left-container"><div class="label-area"><div class="label-text">${T('Vị trí video', 'Video location')}</div></div>
         <input aria-haspopup="false" aria-label="${T('Vị trí video', 'Video location')}" placeholder="${T('Không có', 'None')}"></div></div></ytcp-dropdown-trigger></ytcp-form-autocomplete></ytcp-form-location></div>`)}
    ${section('', T('Giấy phép', 'License'), '', `${select('ytcp-form-select', 'license', 'license', T('Giấy phép', 'License'), LICS)}
      <div class="checkbox-list"><ytcp-form-checkbox id="allow-embed" data-k="embed">${OPT.checkbox('', T('Cho phép nhúng', 'Allow embedding'), true)}</ytcp-form-checkbox>
      <span data-k="notify">${OPT.checkbox('notify-subscribers', T('Xuất bản lên trang Kênh đăng ký và thông báo đến người đăng ký', 'Publish to subscriptions feed and notify subscribers'), true)}</span></div>`)}
    ${section('content-remixing-container', T('Phối lại cho Shorts', 'Shorts remixing'), '',
      `<ytcp-video-metadata-remix-settings>${radios('remix', [['REMIX_SOURCE_OPTION_OPT_IN', REMIX[0]], ['REMIX_SOURCE_OPTION_VISUAL_OPT_OUT_AND_PERFORM_ACTIONS', REMIX[1]], ['REMIX_SOURCE_OPTION_OPT_OUT_AND_MUTE_DERIVATIVES', REMIX[2]]])}</ytcp-video-metadata-remix-settings>`)}
    ${section('category-container', T('Danh mục', 'Category'), '', select('ytcp-form-select', 'category', 'category', '', CATS))}
    ${section('', T('Bình luận và mức phân loại', 'Comments and ratings'), '', `<ytcp-comment-moderation-settings>
      ${select('ytcp-select', 'enablement-state-select', 'comments', T('Bình luận', 'Comments'), COMMENTS)} ${select('ytcp-select', 'allowed-commenter-mode-select', 'who', T('Người có thể bình luận', 'Who can comment'), [T('Bất kỳ ai', 'Anyone')])}
      ${select('ytcp-select', 'sort-order-select', 'sort', T('Sắp xếp theo', 'Sort by'), [T('Hàng đầu', 'Top')])}</ytcp-comment-moderation-settings>
      <span data-k="showLikes">${OPT.checkbox('', T('Hiện số người xem thích video này', 'Show how many viewers like this video'), true)}</span>`)}`
  }

  function paintAdv() {
    const adv = $('#advanced', dlg)
    if (!adv || !adv.innerHTML) return
    for (const g of adv.querySelectorAll('tp-yt-paper-radio-group[data-k]')) for (const r of g.children) r.setAttribute('aria-checked', String(W[g.dataset.k] === r.dataset.v))
    for (const s of adv.querySelectorAll('[data-opts]')) s.querySelector('.dropdown-trigger-text').textContent = W[s.dataset.k] !== undefined ? W[s.dataset.k] : JSON.parse(s.dataset.opts)[0]
    $('#allow-embed #checkbox', adv).setAttribute('aria-checked', String(W.embed))
    $('#notify-subscribers #checkbox', adv).setAttribute('aria-checked', String(W.notify))
    $('[data-k="showLikes"] #checkbox', adv).setAttribute('aria-checked', String(W.showLikes))
    $('#recorded-date .dropdown-trigger-text', adv).textContent = W.recDate || T('Không chọn', 'None')
    const loc = $('#location input', adv)
    if (document.activeElement !== loc) loc.value = W.location
    $('#chips', adv).innerHTML = W.tags.map((t, i) => `<ytcp-chip role="button" id="chip-${i}" aria-label="${esc(t)}. ${T('Nhấn phím Enter để chỉnh sửa', 'Press Enter to edit')}"><div id="chip-text" class="text">${esc(t)}</div><ytcp-icon-button id="delete-icon" role="button" aria-label="${T('Xóa', 'Delete')}" data-i="${i}">✕</ytcp-icon-button></ytcp-chip>`).join('')
    saving()
  }

  function bindAdvanced(adv) {
    for (const g of adv.querySelectorAll('tp-yt-paper-radio-group[data-k]')) g.addEventListener('click', (e) => { const r = e.target.closest('tp-yt-paper-radio-button'); if (r) { W[g.dataset.k] = r.dataset.v; paintAdv() } })
    for (const s of adv.querySelectorAll('[data-opts]')) s.querySelector('ytcp-dropdown-trigger').addEventListener('click', (e) => { if (!openMenu || !openMenu.contains(e.target)) menu(s, JSON.parse(s.dataset.opts), W[s.dataset.k], (v) => { W[s.dataset.k] = v; paintAdv() }) })
    for (const c of adv.querySelectorAll('ytcp-checkbox-lit')) {
      c.addEventListener('click', () => {
        const k = c.closest('[data-k]') && c.closest('[data-k]').dataset.k
        if (k) W[k] = !W[k]
        else { const cb = c.querySelector('#checkbox'); cb.setAttribute('aria-checked', String(cb.getAttribute('aria-checked') !== 'true')) }
        paintAdv()
      })
    }
    $('#recorded-date', adv).onclick = () => datePicker(W.recDate || fmtDate(new Date()), (v) => { W.recDate = v; paintAdv() })
    const inp = $('#text-input', adv)
    const addTags = (s) => { for (const t of s.split(',').map((x) => x.trim()).filter(Boolean)) if (!W.tags.includes(t)) W.tags.push(t); inp.value = ''; paintAdv() }
    // nhu Studio that: chi tao the khi BAM phim Enter / dau phay
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTags(inp.value) } })
    $('#chips', adv).addEventListener('click', (e) => { const x = e.target.closest('#delete-icon'); if (x) { W.tags.splice(+x.dataset.i, 1); paintAdv() } })
    $('#location input', adv).addEventListener('input', (e) => places(e.target.value))
  }

  // ---- goi y dia diem: ytcp-text-menu#search-results ----
  let placeTimer = 0
  function places(q) {
    clearTimeout(placeTimer)
    const old = $('#search-results'); if (old) old.remove()
    if (!q) return
    placeTimer = setTimeout(() => {
      const m = document.createElement('ytcp-text-menu'); m.id = 'search-results'
      const hits = PLACES.filter(([n]) => n.toLowerCase().includes(q.toLowerCase().slice(0, 3)))
      m.innerHTML = `<tp-yt-paper-dialog role="dialog"><tp-yt-paper-listbox id="paper-list" role="listbox"><tp-yt-paper-item role="option" data-n="">${T('Không có', 'None')}</tp-yt-paper-item>` +
        hits.map(([n, a]) => `<tp-yt-paper-item role="option" data-n="${esc(n)}"><b>${esc(n)}</b> <span class="description">${esc(a)}</span></tp-yt-paper-item>`).join('') + '</tp-yt-paper-listbox></tp-yt-paper-dialog>'
      m.addEventListener('click', (e) => { const o = e.target.closest('tp-yt-paper-item'); if (!o) return; W.location = o.dataset.n; $('#location input', dlg).value = o.dataset.n; m.remove(); paintAdv() })
      const host = $('#location', dlg); host.style.position = 'relative'; host.appendChild(m)
    }, 400)
  }

  // ---- hop thoai danh sach phat (giong yt-4) + tao danh sach phat moi ----
  function playlistDialog() {
    const sel = new Set(W.playlists)
    const d = document.createElement('ytcp-playlist-dialog')
    const bg = document.createElement('tp-yt-iron-overlay-backdrop'); bg.className = 'up-backdrop'
    const paint = () => {
      d.innerHTML = `<tp-yt-paper-dialog id="dialog" role="dialog" aria-label="${T('Chọn danh sách phát', 'Select playlists')}"><ytcp-checkbox-group id="playlists-list"><ul>
        ${PLAYLISTS.map((p, i) => `<li class="pl-row"><label id="checkbox-item-${i}">${OPT.checkbox(`checkbox-${i}`, '', sel.has(p.id)).replace('<ytcp-checkbox-lit', `<ytcp-checkbox-lit test-id="${p.id}"`).replace(/aria-label="[^"]*"/, 'aria-label=""')}<span id="checkbox-label-${i}" class="checkbox-label"><span class="label label-text">${esc(p.name)}</span></span></label>${p.podcast ? '<ytcp-badge class="badge"><div class="container"><div class="label">Podcast</div></div></ytcp-badge>' : ''}</li>`).join('')}
        </ul></ytcp-checkbox-group><div class="action-buttons">${OPT.button('', T('Danh sách phát mới', 'New playlist'), { cls: 'new-playlist-button' })}${OPT.button('', T('Xong', 'Done'), { cls: 'done-button' })}</div></tp-yt-paper-dialog>`
    }
    paint()
    d.addEventListener('click', (e) => {
      const lab = e.target.closest('li.pl-row label')
      if (lab) { e.preventDefault(); const cb = lab.querySelector('#checkbox'); const on = cb.getAttribute('aria-checked') !== 'true'; cb.setAttribute('aria-checked', String(on)); const id = lab.querySelector('ytcp-checkbox-lit').getAttribute('test-id'); if (on) sel.add(id); else sel.delete(id) }
      if (e.target.closest('.new-playlist-button')) menu($('.action-buttons', d), [T('Danh sách phát mới', 'New playlist'), T('Podcast mới', 'New podcast')], '', (v) => { if (v === T('Danh sách phát mới', 'New playlist')) newPlaylist((p) => { PLAYLISTS.push(p); sel.add(p.id); paint() }) })
      if (e.target.closest('.done-button')) { W.playlists = PLAYLISTS.filter((p) => sel.has(p.id)).map((p) => p.id); d.remove(); bg.remove(); paintPl(); saving() }
    })
    bg.onclick = () => { d.remove(); bg.remove() }
    setTimeout(() => document.body.append(bg, d), 300)
  }
  function paintPl() {
    const t = $('#pl-trigger .dropdown-trigger-text', dlg)
    t.textContent = !W.playlists.length ? T('Chọn', 'Select') : W.playlists.length === 1 ? PLAYLISTS.find((p) => p.id === W.playlists[0]).name : T(`${W.playlists.length} danh sách phát`, `${W.playlists.length} playlists`)
  }
  function newPlaylist(done) {
    const c = document.createElement('ytcp-playlist-creation-dialog')
    c.innerHTML = `<tp-yt-paper-dialog role="dialog" aria-label="${T('Tạo danh sách phát', 'Create playlist')}"><h3>${T('Danh sách phát mới', 'New playlist')}</h3>
      <ytcp-playlist-metadata-editor><ytcp-social-suggestions-textbox id="title-textarea"><div id="label"><span id="label-text">${T('Tiêu đề (bắt buộc)', 'Title (required)')}</span></div><div id="textbox" contenteditable="true" role="textbox" aria-label="${T('Thêm tiêu đề', 'Add title')}"></div></ytcp-social-suggestions-textbox></ytcp-playlist-metadata-editor>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">${OPT.button('cancel-button', T('Hủy', 'Cancel'))}${OPT.button('create-button', T('Tạo', 'Create'))}</div></tp-yt-paper-dialog>`
    document.body.appendChild(c)
    $('#cancel-button', c).onclick = () => c.remove()
    $('#create-button', c).onclick = () => {
      const name = $('#textbox', c).textContent.trim()
      if (!name) return
      const p = { id: 'PLnew' + String(PLAYLISTS.length).padStart(5, '0'), name }
      log({ type: 'playlist-created', name })
      setTimeout(() => { c.remove(); done(p) }, 400)
    }
  }

  // ---- chon ngay (giong o ngay quay: ytcp-date-picker > form > tp-yt-paper-input#textbox input) ----
  function datePicker(cur, onPick) {
    const bg = document.createElement('div'); bg.className = 'up-backdrop'
    const d = document.createElement('ytcp-date-picker')
    d.innerHTML = `<tp-yt-paper-dialog id="dialog" role="dialog"><form id="form"><tp-yt-paper-input id="textbox" aria-label="${T('Nhập ngày', 'Enter date')}"><input autocomplete="off" value="${esc(cur)}"></tp-yt-paper-input></form></tp-yt-paper-dialog>`
    const close = () => { d.remove(); bg.remove() }
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault()
      const dt = parseDate(d.querySelector('input').value)
      if (!dt) { d.querySelector('input').style.borderColor = 'red'; return }
      onPick(fmtDate(dt))
      close()
    })
    bg.onclick = close
    document.body.append(bg, d)
  }

  // ---- phu de: Them -> Tai tep len -> Co thoi gian -> Tiep tuc (mo o chon file) -> Xong ----
  function subtitlesDialog() {
    const host = document.createElement('ytve-modal-host')
    host.innerHTML = `<div class="up-backdrop"></div><tp-yt-paper-dialog role="dialog" aria-label="${T('Phụ đề', 'Subtitles')}"><h3>${T('Phụ đề', 'Subtitles')}</h3><div id="sub-body">
      <p>${T('Chọn cách thêm phụ đề', 'Select how to add subtitles')}</p>${OPT.button('choose-upload-file', T('Tải tệp lên', 'Upload file'))} ${OPT.button('', T('Tự động đồng bộ hóa', 'Auto-sync'))} ${OPT.button('', T('Nhập thủ công', 'Type manually'))}</div>
      <div style="margin-top:20px">${OPT.button('discard-button', T('Hủy thay đổi', 'Discard changes'))}</div></tp-yt-paper-dialog>`
    document.body.appendChild(host)
    const body = $('#sub-body', host)
    $('#discard-button', host).onclick = () => host.remove()
    $('#choose-upload-file', host).onclick = () => {
      body.innerHTML = `<p>${T('Chọn loại tệp', 'Select file type')}</p><tp-yt-paper-radio-group role="radiogroup" id="timing">${OPT.radio('UPLOAD_TIMED', T('Có thời gian', 'With timing'))}${OPT.radio('UPLOAD_UNTIMED', T('Không có thời gian', 'Without timing'))}</tp-yt-paper-radio-group>${OPT.button('confirm-button', T('Tiếp tục', 'Continue'))}`
      let timing = ''
      $('#timing', body).addEventListener('click', (e) => { const r = e.target.closest('tp-yt-paper-radio-button'); if (!r) return; for (const x of $('#timing', body).children) x.setAttribute('aria-checked', String(x === r)); timing = r.getAttribute('name') })
      $('#confirm-button', body).onclick = () => {
        if (!timing) return
        // o chon file chi duoc tao khi bam "Tiep tuc" (mo hop thoai cua he dieu hanh)
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.srt,.vtt,.sbv'; inp.hidden = true
        body.appendChild(inp)
        inp.addEventListener('change', () => {
          const f = inp.files[0]; if (!f) return
          body.innerHTML = `<p>${esc(f.name)}</p><p class="description">1 00:00:01,000 --> 00:00:02,000 ...</p><div>${OPT.button('done-button', T('Xong', 'Done'), { disabled: true })}</div>`
          setTimeout(() => OPT.setDisabled($('#done-button', host), false), 300)
          $('#done-button', host).onclick = () => {
            if ($('#done-button', host).getAttribute('aria-disabled') === 'true') return
            W.subs.push({ name: f.name, timing })
            $('#subs-status', dlg).textContent = `${W.language} · ${f.name}`
            host.remove()
          }
        })
        inp.click()
      }
    }
  }

  // ---- trinh chinh man hinh ket thuc (giong trang Chi tiet video, yt-5): o mau "Lay man hinh ket thuc cua video gan day nhat" ----
  function endScreen() {
    const host = document.createElement('ytve-modal-host'); host.id = 'host'
    host.innerHTML = `<div class="up-backdrop"></div><ytcp-dialog id="dialog"><tp-yt-paper-dialog id="dialog" role="dialog">
      <div id="video-editor-modal-host-header"><div id="video-editor-modal-host-title">${T('Màn hình kết thúc', 'End screen')}</div>
        ${OPT.button('discard-button', T('Hủy thay đổi', 'Discard changes'))}<span id="save-container">${OPT.button('save-button', T('Lưu', 'Save'), { disabled: true })}</span></div>
      <div id="content"><ytve-editor><div id="es-body">${T('Đang tải…', 'Loading…')}</div></ytve-editor></div></tp-yt-paper-dialog></ytcp-dialog>`
    document.body.appendChild(host)
    const close = () => host.remove()
    const elements = `<div class="element-header"><span class="element-label">${T('Thành phần "Đăng ký"', 'Subscribe element')}</span></div><div class="entityName">${T('Đăng ký', 'Subscribe')}: Bible in a Nutshell</div><div class="entityName">Video</div><div class="entityName">${T('Danh sách phát', 'Playlist')}</div>`
    const head = `<div class="header">${OPT.button('add-element-menu-button', T('Thành phần', 'Element'))} ${OPT.button('', T('Nhập từ video', 'Import from video'))}</div>`
    setTimeout(() => {
      const body = $('#es-body', host)
      body.innerHTML = `<ytve-endscreen-editor-options-panel>${head}` + (W.endscreen ? elements
        : `<div class="templates"><div class="template" role="button">${T('Lấy màn hình kết thúc của video gần đây nhất', 'Import from latest video')}</div><div class="template" role="button">${T('1 video, 1 đăng ký', '1 video, 1 subscribe')}</div><div class="template" role="button">${T('2 video', '2 videos')}</div></div>`) + '</ytve-endscreen-editor-options-panel>'
      for (const t of body.querySelectorAll('.template')) t.onclick = () => { body.querySelector('ytve-endscreen-editor-options-panel').innerHTML = head + elements; OPT.setDisabled($('#save-button', host), false); host.dataset.tile = t.textContent }
    }, 700)
    $('#discard-button', host).onclick = close
    $('#save-button', host).onclick = () => {
      if ($('#save-button', host).getAttribute('aria-disabled') === 'true') return
      $('#es-body', host).innerHTML = T('Đang lưu…', 'Saving…')
      setTimeout(() => { W.endscreen = host.dataset.tile; $('#es-status', dlg).textContent = T('Đã thêm 3 thành phần', '3 elements added'); close() }, 500)
    }
  }

  // ---- Luu / Xuat ban / Len lich ----
  function publish() {
    if ($('#done-button', dlg).getAttribute('aria-disabled') === 'true') return
    if (!W.kids) { showStep(0); $('#kids-error', dlg).hidden = false; return }
    if (!W.title.trim()) { showStep(0); return }
    if (!W.checked && !W.anyway && !F('nocheckwarn')) return checksWarning()
    if (!W.uploaded) W.earlyDone = true
    W.id = W.id || newId()
    W.published = true
    if (F('hidelabel')) W.finishIn(5000)
    const u = {
      id: W.id, uc: D().uc, cookieCh: D().cookieCh, file: W.file, size: W.size, title: W.title, description: W.desc, thumbnail: W.thumb,
      playlists: W.playlists.map((id) => { const p = PLAYLISTS.find((x) => x.id === id); return p.podcast ? `${p.name} (Podcast)` : p.name }), kids: W.kids,
      paid: W.paid === PAID[1] ? 'no' : W.paid === PAID[0] ? 'yes' : '', ai: W.ai === T('Có', 'Yes') ? 'yes' : W.ai === T('Không', 'No') ? 'no' : '', tags: W.tags,
      language: W.language, titleLanguage: W.titleLanguage, recDate: W.recDate, location: W.location, category: W.category, license: W.license, embed: W.embed, notify: W.notify,
      remix: W.remix, comments: W.comments, showLikes: W.showLikes, endscreen: W.endscreen, subtitles: W.subs, visibility: W.vis, scheduleDate: W.vis === 'SCHEDULE' ? W.date : '',
      scheduleTime: W.vis === 'SCHEDULE' ? W.time : '', earlyDone: W.earlyDone, anyway: W.anyway, lang: EN ? 'en' : 'vi',
    }
    fetch('/studio/__upload/done', { method: 'POST', body: JSON.stringify(u) }).then(() => {
      dlg.remove(); dlg = null
      // tai len chua xong: hop thoai dong, tien do hien o goc trang toi khi xong
      if (!W.uploaded && !W.failed) { const m = document.createElement('ytcp-multi-progress-monitor'); m.textContent = T(`Đang tải lên 1 video... ${W.pct}%`, `Uploading 1 video... ${W.pct}%`); document.body.appendChild(m) }
      if (F('noshare')) return
      const s = document.createElement('ytcp-video-share-dialog')
      const head = u.visibility === 'SCHEDULE' ? T('Đã lên lịch video', 'Video scheduled') : u.visibility === 'PRIVATE' ? T('Đã lưu video ở chế độ riêng tư', 'Video saved as private') : T('Đã xuất bản video', 'Video published')
      s.innerHTML = `<tp-yt-paper-dialog role="dialog"><h2>${head}</h2><div class="description">${T('Đường liên kết của video', 'Video link')}</div><a id="share-url" href="https://youtu.be/${u.id}" target="_blank">https://youtu.be/${u.id}</a><div style="margin-top:16px">${OPT.button('close-button', T('Đóng', 'Close'))}</div></tp-yt-paper-dialog>`
      document.body.appendChild(s)
      $('#close-button', s).onclick = () => { log({ type: 'share-closed', id: u.id }); s.remove() }
    })
  }
  // "Chung toi van dang kiem tra noi dung cua ban" [Quay lai] [Van xuat ban]
  function checksWarning() {
    const w = document.createElement('ytcp-prechecks-warning-dialog')
    w.innerHTML = `<tp-yt-paper-dialog role="dialog"><h2>${T('Chúng tôi vẫn đang kiểm tra nội dung của bạn', "We're still checking your content")}</h2>
      <p class="description">${T('Nếu phát hiện thấy vấn đề, bạn có thể cần phải thay đổi để video không bị hạn chế.', 'If we find issues, you may need to make changes to avoid restrictions.')}</p>
      <div style="display:flex;justify-content:flex-end;gap:8px">${OPT.button('secondary-action-button', T('Quay lại', 'Go back'))}${OPT.button('primary-action-button', T('Vẫn xuất bản', 'Publish anyway'))}</div></tp-yt-paper-dialog>`
    document.body.appendChild(w)
    log({ type: 'checks-warning' })
    $('#secondary-action-button', w).onclick = () => w.remove()
    $('#primary-action-button', w).onclick = () => { w.remove(); W.anyway = true; publish() }
  }

  window.UPLOAD = { open: openDialog, createButton }
})()
