// Phien (partition) dang nhap Google cua tung tai khoan.
// Giu NGUYEN user agent that cua app (co chu "Electron/"), chi xin trang tieng Anh, nhu AI
// Automation Studio: bo chu "Electron" hay gia Chrome/Firefox thi Google bao "This browser or app
// may not be secure". Khong doi UA, khong xoa phien khi Google tu choi.
const { session } = require('electron')

const configured = new Set()
function googleSession(partition) {
  const ses = session.fromPartition(partition)
  if (!configured.has(partition)) {
    configured.add(partition)
    ses.setUserAgent(ses.getUserAgent(), 'en-US,en')
  }
  return ses
}

// Google tu choi dang nhap (trang "signin/rejected" hoac chu "may not be secure")
const REJECTED = /signin\/rejected|deniedsigninrejected/
const REJECTED_TEXT = /may not be secure|có thể không an toàn/i

module.exports = { googleSession, REJECTED, REJECTED_TEXT }
