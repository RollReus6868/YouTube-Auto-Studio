module.exports = [
  [/^\/studio\/driver-test/, 'driver-test.html'],
  // /studio/__flaky/<khoa>?n=N: N lan dau dong ket noi khong tra loi (Chromium bao ERR_EMPTY_RESPONSE), sau do tra trang thuong
  [/^\/studio\/__flaky\/(\w+)\?n=(\d+)$/, (req, res, m, server) => {
    const seen = (server.flaky = server.flaky || {})
    seen[m[1]] = (seen[m[1]] || 0) + 1
    if (seen[m[1]] <= Number(m[2])) return req.socket.destroy()
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><meta charset="utf-8"><button>Đã mở</button>')
  }],
]
