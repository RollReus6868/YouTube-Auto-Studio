// Cau noi voi tien trinh chinh cua Electron (src/preload.js gan window.ya).
export type Level = 'info' | 'ok' | 'warn' | 'error'
export type Update = {
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error'
  latest: string
  notes: string
  progress: number
  error: string
  manual: boolean // khong tu cai duoc -> chi mo trang tai ve
}
// Mau toi uu trong Studio (src/optimize-template.js); moi preset co mot mau rieng (preset.optimize)
type K3 = 'keep' | 'yes' | 'no'
export type OptimizeTemplate = {
  playlists: string[]
  paidPromotion: K3
  ai: K3
  tagsMode: 'keep' | 'title'
  extraTags: string[]
  location: string
  recordingDate: 'keep' | 'today' | 'publish'
  remix: 'keep' | 'all' | 'audio' | 'none'
  endScreen: 'keep' | 'latest'
  category: string
  language: string
  comments: 'keep' | 'on' | 'pause' | 'off'
  license: 'keep' | 'youtube' | 'creativeCommon'
  embeddable: K3
  like: boolean
  description: string
  comment: string
  pin: boolean
}
// giong defaultTemplate() trong src/optimize-template.js
export const defaultOptimizeTemplate = (): OptimizeTemplate => ({
  playlists: [], paidPromotion: 'no', ai: 'yes', tagsMode: 'title', extraTags: [], location: 'United States',
  recordingDate: 'today', remix: 'none', endScreen: 'latest', category: 'keep', language: '', comments: 'keep',
  license: 'keep', embeddable: 'keep', like: true, description: '', comment: '{tieu_de}', pin: true,
})
export type Schedule = { mode: 'now' | 'times' | 'interval'; times: string[]; intervalHours: number }
export type Preset = {
  id: string
  name: string
  title: string
  description: string
  tags: string[]
  categoryId: string
  language: string
  playlist: string
  madeForKids: boolean
  syntheticMedia: boolean
  license: 'youtube' | 'creativeCommon'
  embeddable: boolean
  notifySubscribers: boolean
  publicStatsViewable: boolean
  privacy: 'public' | 'unlisted' | 'private'
  schedule: Schedule
  optimizeAfterUpload?: boolean // sau khi dang: tu toi uu trong Studio bang preset.optimize
  optimize?: OptimizeTemplate // cac muc chi co trong Studio (ban cu chua co -> mau goc)
}
export type Settings = {
  root: string
  channel: string
  presets: Preset[]
  defaultPreset: string
  geminiModel: string
  replyStyle: string
  replyMode: 'review' | 'auto' | 'off'
  replyPerHour: number
  skipWords: string
  youtubeChannel: { id: string; title: string } | null
  apiChannels?: { id: string; title: string }[] // cac kenh da ket noi API (moi kenh mot token)
}
export type VideoMeta = {
  title: string
  description: string
  tags: string[]
  categoryId: string
  language: string
  playlist: string
  madeForKids: boolean
  privacy: Preset['privacy']
  publishAt: string | null
}
export type VideoItem = {
  id: string
  dir: string
  folder: string
  name: string
  size: number
  video: string
  thumbUrl: string
  subtitles: { file: string; lang: string }[]
  preset: string
  meta: VideoMeta
  errors: string[]
  warnings: string[]
}
export type PostItem = {
  id: string
  dir: string
  folder: string
  name: string
  date: string | null
  time: string | null
  text: string
  images: string[]
  errors: string[]
  warnings: string[]
  // trang Dang bai (src/features/posts.js)
  type?: 'text' | 'image' | 'poll' | 'image_poll' | 'quiz' | 'video'
  when?: string | null // ISO; null = dang ngay
  channel?: string // dong "Kenh:" trong noidung.txt
  video?: string
  options?: { text: string; image: string }[]
  answers?: { text: string; image: string; correct: boolean }[]
  explanation?: string
}
export type Job = { status: 'queued' | 'run' | 'done' | 'error' | 'stopped'; title?: string; step: string; progress: number; error: string; url: string; warnings?: string[] }
export type Comment = { id: string; videoId: string; videoTitle: string; author: string; text: string; publishedAt: string; likeCount: number; status: 'new' | 'ready' | 'sent' | 'skipped' | 'error'; kind: string; draft: string; error: string; note: string }
export type Draft = { id: string; text: string; loading: boolean; error: string }
export type State = {
  status: 'idle' | 'run' | 'update'
  version: string
  update: Update
  settings: Settings | null
  secrets: { gemini: boolean; geminiEncrypted: boolean; oauth: { project_id: string; client_id: string } | null }
  scan: { root: string; videos: VideoItem[]; posts: PostItem[]; errors: string[]; at: string }
  studio: { channelId: string; channelName?: string; url: string; visible: boolean }
  youtube: { channel: { id: string; title: string; thumb?: string } | null; busy: boolean }
  jobs: Record<string, Job>
  draft: Draft | null
  comments: { items: Comment[]; busy: boolean; at: string; sentLastHour: number }
  categories: [string, string][]
  logs: { t: string; level: Level; msg: string }[]
  f: Record<string, unknown> // trang thai rieng cua tung tinh nang (ui/src/pages)
}

declare global {
  interface Window {
    ya?: { call: (cmd: string, payload?: unknown) => Promise<State>; onState: (cb: (s: State) => void) => void }
  }
}

export const isDemo = () => location.search.includes('demo')

const noUpdate: Update = { status: 'idle', latest: '', notes: '', progress: 0, error: '', manual: false }

export const CATEGORIES: [string, string][] = [
  ['1', 'Phim và hoạt hình'], ['2', 'Ô tô và xe cộ'], ['10', 'Âm nhạc'], ['15', 'Thú cưng và động vật'],
  ['17', 'Thể thao'], ['19', 'Du lịch và sự kiện'], ['20', 'Trò chơi'], ['22', 'Mọi người và blog'],
  ['23', 'Hài kịch'], ['24', 'Giải trí'], ['25', 'Tin tức và chính trị'], ['26', 'Hướng dẫn và phong cách'],
  ['27', 'Giáo dục'], ['28', 'Khoa học và công nghệ'], ['29', 'Tổ chức phi lợi nhuận và hoạt động xã hội'],
]

export const newPreset = (id: string, name: string): Preset => ({
  id, name,
  title: '{ten_video}',
  description: '{ten_video}\n\n{hashtag}',
  tags: [], categoryId: '22', language: 'vi', playlist: '',
  madeForKids: false, syntheticMedia: false, license: 'youtube', embeddable: true,
  notifySubscribers: true, publicStatsViewable: true, privacy: 'private',
  schedule: { mode: 'now', times: ['19:00'], intervalHours: 24 },
  optimizeAfterUpload: false,
  optimize: defaultOptimizeTemplate(),
})

const demoSettings: Settings = {
  root: 'D:\\YouTube-DangBai', channel: 'Kênh Của Tôi',
  presets: [
    { ...newPreset('mac-dinh', 'Video dài'), title: '{ten_video} | Tập {so_tap}', description: '{tieu_de}\n\nĐăng ngày {ngay} trên {ten_kenh}.\n\n{hashtag}', tags: ['phim hay', 'review phim', 'tóm tắt phim'], categoryId: '1', privacy: 'public', schedule: { mode: 'times', times: ['19:00'], intervalHours: 24 }, optimizeAfterUpload: true },
    { ...newPreset('shorts', 'Shorts'), title: '{ten_video} #shorts', tags: ['shorts'], privacy: 'public' },
  ],
  defaultPreset: 'mac-dinh', geminiModel: 'gemini-2.5-flash',
  replyStyle: 'Trả lời thân thiện, ngắn gọn (1–2 câu), xưng "mình", gọi khán giả là "bạn".',
  replyMode: 'review', replyPerHour: 20, skipWords: '', youtubeChannel: { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'Kênh Của Tôi' },
  apiChannels: [{ id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'Kênh Của Tôi' }, { id: 'UCC0AJ_NoUOq5718yK4_ehBw', title: 'Dark Bible Stories' }],
}

const meta = (title: string, publishAt: string | null): VideoMeta => ({
  title, description: `${title}\n\nĐăng ngày 28/10/2026 trên Kênh Của Tôi.\n\n#phimhay #reviewphim #tómtắtphim`,
  tags: ['phim hay', 'review phim', 'tóm tắt phim'], categoryId: '1', language: 'vi', playlist: 'Tóm tắt phim', madeForKids: false,
  privacy: publishAt ? 'private' : 'public', publishAt,
})

// Chi dung khi xem thu giao dien trong trinh duyet (them ?demo vao dia chi).
export const demoState: State = {
  status: 'idle', version: '0.1.0',
  update: { ...noUpdate, status: 'available', latest: '0.2.0', notes: '- Đăng video qua API YouTube\n- Gemini viết mô tả' },
  settings: demoSettings,
  secrets: { gemini: true, geminiEncrypted: true, oauth: { project_id: 'tool-dang-youtube', client_id: '123456789012…apps.googleusercontent.com' } },
  scan: {
    root: demoSettings.root, errors: [], at: '2026-10-26T12:00:00Z',
    videos: [
      { id: 'v1', dir: '2026-10-28_bi-an-rung-sau-tap-1', folder: '', name: 'Bí ẩn rừng sâu tập 1', size: 734003200, video: 'video.mp4', thumbUrl: '', subtitles: [{ file: 'phude.vi.srt', lang: 'vi' }], preset: 'Video dài', meta: meta('Bí ẩn rừng sâu tập 1 | Tập 1', '2026-10-28T12:00:00.000Z'), errors: [], warnings: [] },
      { id: 'v2', dir: '2026-10-29_bi-an-rung-sau-tap-2', folder: '', name: 'Bí ẩn rừng sâu tập 2', size: 812003200, video: 'tap2.mp4', thumbUrl: '', subtitles: [], preset: 'Video dài', meta: meta('Bí ẩn rừng sâu tập 2 | Tập 2', '2026-10-29T12:00:00.000Z'), errors: [], warnings: ['Có 2 file video, tool dùng "tap2.mp4".'] },
      { id: 'v3', dir: '2026-10-30_video-thieu-file', folder: '', name: 'video thieu file', size: 0, video: '', thumbUrl: '', subtitles: [], preset: 'Video dài', meta: meta('video thieu file | Tập {so_tap}', null), errors: ['Không có file video trong thư mục.'], warnings: [] },
    ],
    posts: [
      { id: 'p1', dir: '2026-10-29_bai-hoi-y-kien', folder: '', name: 'bai hoi y kien', date: '2026-10-29', time: null, text: 'Các bạn muốn xem tập tiếp theo về chủ đề gì? Bình luận cho mình biết nhé!', images: [], errors: [], warnings: [] },
      { id: 'p2', dir: 'thong-bao-lich', folder: '', name: 'thong bao lich', date: null, time: null, text: 'Lịch ra video tuần này: thứ 3, thứ 5 và thứ 7 lúc 19h.', images: ['', ''], errors: [], warnings: [] },
    ],
  },
  studio: { channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx', url: 'https://studio.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx', visible: false },
  youtube: { channel: { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'Kênh Của Tôi' }, busy: false },
  jobs: {
    v1: { status: 'done', step: '', progress: 100, error: '', url: 'https://youtu.be/abc123' },
    v2: { status: 'run', step: 'upload', progress: 42, error: '', url: '' },
  },
  draft: null,
  comments: {
    busy: false, at: '2026-10-26T12:00:00Z', sentLastHour: 3,
    items: [
      { id: 'c1', videoId: 'v', videoTitle: 'Bí ẩn rừng sâu tập 1', author: 'Lan Nguyễn', text: 'Tập này hay quá, chờ tập sau mãi!', publishedAt: new Date(Date.now() - 25 * 60e3).toISOString(), likeCount: 4, status: 'ready', kind: 'khen', draft: 'Cảm ơn bạn đã theo dõi nhé, tập sau ra tối thứ 5 nha ❤️', error: '', note: '' },
      { id: 'c2', videoId: 'v', videoTitle: 'Bí ẩn rừng sâu tập 1', author: 'Minh Trần', text: 'Nhạc nền trong video tên gì vậy ad?', publishedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), likeCount: 1, status: 'ready', kind: 'hoi', draft: 'Mình dùng nhạc trong thư viện âm thanh của YouTube nhé bạn.', error: '', note: '' },
      { id: 'c3', videoId: 'v', videoTitle: 'Bí ẩn rừng sâu tập 2', author: 'Hoa', text: 'Giọng đọc hơi nhỏ so với nhạc.', publishedAt: new Date(Date.now() - 26 * 3600e3).toISOString(), likeCount: 0, status: 'new', kind: '', draft: '', error: '', note: '' },
      { id: 'c4', videoId: 'v', videoTitle: 'Bí ẩn rừng sâu tập 2', author: 'An', text: 'Hay!', publishedAt: new Date(Date.now() - 50 * 3600e3).toISOString(), likeCount: 0, status: 'sent', kind: 'khen', draft: 'Cảm ơn bạn nhiều!', error: '', note: '' },
    ],
  },
  categories: CATEGORIES, f: {},
  logs: [
    { t: '12:00:02', level: 'ok', msg: 'Thư mục gốc: D:\\YouTube-DangBai' },
    { t: '12:00:02', level: 'info', msg: 'Đã quét: 3 video (2 sẵn sàng), 2 bài cộng đồng.' },
    { t: '12:00:05', level: 'ok', msg: 'Đã vào YouTube Studio của kênh UCxxxxxxxxxxxxxxxxxxxxxx.' },
  ],
}

export const emptyState: State = {
  status: 'idle', version: '', update: noUpdate, settings: null,
  secrets: { gemini: false, geminiEncrypted: false, oauth: null },
  scan: { root: '', videos: [], posts: [], errors: [], at: '' },
  studio: { channelId: '', url: '', visible: false }, youtube: { channel: null, busy: false }, jobs: {}, draft: null,
  comments: { items: [], busy: false, at: '', sentLastHour: 0 },
  categories: CATEGORIES, logs: [], f: {},
}

export function call(cmd: string, payload?: unknown): Promise<State | null> {
  return window.ya ? window.ya.call(cmd, payload) : Promise.resolve(null)
}
