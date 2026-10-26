// Du lieu kenh gia "Dark Bible Study" (lay tu video quay toi uu video). Dung chung cho cac trang.
window.OPT = {
  channel: { uc: 'UC6roez1tiwHbdhvLWBvLRmQ', name: 'Dark Bible Study', handle: '@DarkBibleStudy999' },
  playlists: [
    { id: 'PLa', name: 'Dark Bible Study' },
    { id: 'PLb', name: 'Dark Bible Study', podcast: true },
    { id: 'PLc', name: 'Bible Stories' },
  ],
  videos: [
    { id: 'Prem0000001', title: 'The Dead in Christ Shall Rise — Why Black Christians Say “Gone Home”', vis: 'Đang công chiếu', date: '26 thg 10, 2026', note: 'Đã lên lịch', views: 0, comments: 0, len: 'CÔNG CHIẾU' },
    { id: 'vyiSqHByq24', title: 'The Cost of Being Chosen by God - Matthew 22 Explained', vis: 'Công khai', date: '25 thg 10, 2026', note: 'Đã phát hành lần…', views: 30, comments: 0, len: '34:36' },
    { id: 'LostTribe01', title: "The Lost Tribes of Israel and Black America: Who Inherits God's Promise?", vis: 'Công khai', date: '23 thg 10, 2026', note: 'Đã phát hành lần…', views: 815, comments: 1, len: '44:52' },
    { id: 'NeverProp01', title: 'God Was Never Their Property: John 1 and Black Faith', vis: 'Công khai', date: '22 thg 10, 2026', note: 'Đã phát hành lần…', views: 119, comments: 2, len: '42:33' },
    { id: 'Maccabee001', title: 'Who Decides? The Maccabees on Keeping, Building and Handing Down a Faith', vis: 'Công khai', date: '21 thg 10, 2026', note: 'Đã phát hành lần…', views: 127, comments: 1, len: '49:26' },
    { id: 'TheCross001', title: 'The Cross Exposes the Religion That Calls Oppression Holy', vis: 'Công khai', date: '20 thg 10, 2026', note: 'Đã phát hành lần…', views: 205, comments: 4, len: '46:42' },
    { id: 'HonorPar001', title: 'What “Honor Your Parents” Really Means in Hebrew— Why Black Families Need It', vis: 'Công khai', date: '19 thg 10, 2026', note: 'Đã phát hành lần…', views: 141, comments: 1, len: '44:32' },
  ],
  // trang thai ban dau cua trang Chi tiet video (giong luc chua toi uu trong video quay)
  fresh: () => ({
    playlists: [], paid: '', ai: '', tags: ['Dark Bible Study'], language: 'Tiếng Anh (Hoa Kỳ)', titleLanguage: 'Tiếng Anh (Hoa Kỳ)',
    recDate: '', location: '', license: 'Giấy phép chuẩn của YouTube', licenseLocked: true, embed: true,
    remix: 'Cho phép phối lại video và âm thanh', category: 'Mọi người và blog', comments: 'Bật', endscreen: false,
  }),
  load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch (_) { return def } },
  save(key, v) { localStorage.setItem(key, JSON.stringify(v)) },
  log(evt) { return fetch('/__log', { method: 'POST', body: JSON.stringify(evt) }).catch(() => {}) },
  videoOf(id) { return this.videos.find((v) => v.id === id) || { id, title: 'Video ' + id, vis: 'Công khai', date: '24 thg 10, 2026', views: 0, comments: 0, len: '10:00' } },
  toast(text) {
    const t = document.createElement('div')
    t.className = 'toast'
    t.setAttribute('role', 'alert')
    t.textContent = text
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3000)
  },
  // ---- khoi dung giong the that cua Studio (xem /mnt/project-files/yt-auto-studio/html/yt-3..5) ----
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  // ytcp-button > ytcp-button-shape > button[aria-label] > div chu
  button(id, label, { disabled = false, cls = '' } = {}) {
    const d = disabled ? ' disabled="true" aria-disabled="true"' : ' aria-disabled="false"'
    return `<ytcp-button ${id ? `id="${id}"` : ''} class="${cls}" aria-disabled="${disabled}"><ytcp-button-shape><button aria-label="${this.esc(label)}"${d}><div class="ytcpButtonShapeImpl__button-text-content">${this.esc(label)}</div></button></ytcp-button-shape></ytcp-button>`
  },
  setDisabled(host, off) {
    host.setAttribute('aria-disabled', String(off))
    const b = host.querySelector('button')
    b.setAttribute('aria-disabled', String(off))
    if (off) b.setAttribute('disabled', 'true'); else b.removeAttribute('disabled')
  },
  // ytcp-dropdown-trigger[role=button] > div.container > .left-container > (.label-text) + span.dropdown-trigger-text
  trigger(label, value, attrs = '') {
    return `<ytcp-dropdown-trigger role="button" ${attrs}><div role="button" class="container"><div class="left-container">${label ? `<div class="label-area"><div class="label-text">${this.esc(label)}</div></div>` : ''}<span class="dropdown-trigger-text">${this.esc(value)}</span></div><div class="right-container">▾</div></div></ytcp-dropdown-trigger>`
  },
  radio(name, label, aria) {
    return `<tp-yt-paper-radio-button role="radio" name="${name}" aria-checked="false" aria-disabled="false"${aria ? ` aria-label="${this.esc(aria)}"` : ''}><div id="radioContainer"><div id="offRadio"></div><div id="onRadio"></div></div><div id="radioLabel">${this.esc(label)}</div></tp-yt-paper-radio-button>`
  },
  checkbox(id, label, on, disabled) {
    return `<ytcp-checkbox-lit ${id ? `id="${id}"` : ''}><div id="root-container"><div id="checkbox-container"><div id="checkbox" role="checkbox" aria-checked="${on}" aria-disabled="${!!disabled}" aria-label="${this.esc(label)}"><div id="checkmark"></div></div></div>${label ? `<div class="label">${this.esc(label)}</div>` : ''}</div></ytcp-checkbox-lit>`
  },
}
