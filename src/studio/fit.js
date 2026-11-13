// Khung trinh duyet hep (cua so nho / man hinh nho): YouTube doi sang bo cuc hep, khung soan bai bi cat (loi that
// 13/11/2026: khung rong 394 px, nut "Cau hoi" bi che -> "Qua 20 giay van chua thay Cau tra loi 1"). Gia lap man hinh
// rong minW px va thu nho cho vua khung (enableDeviceEmulation: rieng cho webContents nay, khong anh huong cua so khac).
// Gia lap mat moi lan tai trang -> goi lai sau moi lan dieu huong (did-navigate). Driver (src/studio/driver.js) nhan
// toa do chuot voi wc._yaScale.
const MIN_W = 1100

function fitView(wc, width, height, minW = MIN_W) {
  if (!wc || wc.isDestroyed()) return 1
  // chua tai trang nao (vua tao): Electron 44 SIGSEGV neu gia lap luc nay -> doi did-navigate goi lai
  if (!wc.getURL()) return wc._yaScale || 1
  const w = Math.round(width || 0)
  const h = Math.round(height || 0)
  if (w < 50 || h < 50 || w >= minW) {
    if (wc._yaScale && wc._yaScale !== 1) wc.disableDeviceEmulation()
    wc._yaScale = 1
    return 1
  }
  const s = w / minW
  const size = { width: minW, height: Math.round(h / s) }
  wc.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: size, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 0, viewSize: size, scale: s })
  wc._yaScale = s
  return s
}

module.exports = { fitView, MIN_W }
