// Gio Viet Nam (GMT+7) cho lich dang bai, khong phu thuoc mui gio cua may (giong src/ai-posts.js).
const OFF = 7 * 3600e3
const p2 = (n: number) => String(n).padStart(2, '0')
const vn = (d: Date) => new Date(d.getTime() + OFF) // doc bang getUTC*
export const vnYmd = (d: Date) => { const t = vn(d); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}` }
export const vnHm = (d: Date) => { const t = vn(d); return `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}` }
export const vnShort = (d: Date) => { const t = vn(d); return `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())} ${p2(t.getUTCDate())}/${p2(t.getUTCMonth() + 1)}` }
// "2026-11-14" + "00:00" (gio VN) -> ISO
export const vnIso = (day: string, time: string) => new Date(`${day}T${time}:00+07:00`).toISOString()
export const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}` }
