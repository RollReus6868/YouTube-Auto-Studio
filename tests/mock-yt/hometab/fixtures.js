// Du lieu cho trang gia "Tuy chinh kenh → The Trang chu" (theo video quay cua nguoi dung).
const id = (s) => `UC${s}`.padEnd(24, '0')

// Kenh moi (nguon) va danh sach phat cua no
const NEW = { ucId: 'UC4Dzx9CFcLbO9OGWNBJkwBQ', handle: '@biblegenesis9999', name: 'Dark Bible Genesis', subs: '18' }
const PLAYLIST = { id: 'PLcWuSJdVMhk4xYz0123456789abcdEF', title: 'Dark Bible Genesis', count: 1 }

// "Mot kenh YouTube bat ky": kenh tim duoc
const CHANNEL_DB = [
  NEW,
  { ucId: id('darkBibleStudy'), handle: '@darkbiblestudy', name: 'Dark Bible Study', subs: '2,1 N' },
  { ucId: id('nutshell'), handle: '@biblenutshell', name: 'Dark Bible - in a Nutshell', subs: '5,4 N' },
  { ucId: id('realm'), handle: '@darkbiblicalrealm', name: 'Dark Biblical Realm', subs: '980' },
]
// "Danh sach phat bat ky tren YouTube"
const PLAYLIST_DB = [
  PLAYLIST,
  { id: 'PLbibleStudy0000000000000000000', title: 'Dark Bible Study', count: 7 },
]

const featured = (...channels) => ({ type: 'featured', channels })
const pl = (title, count) => ({ type: 'playlist', title, count })
const other = (title, count, note) => ({ type: 'other', title, count, note })
const tail = [other('Video', 21), other('Danh sách phát đã tạo', 2), other('Bài đăng', 0, 'Mục này sẽ xuất hiện sau khi bạn tạo bài đăng'), other('Video cộng tác', 0, 'Phần này sẽ hiển thị các dự án cộng tác của bạn')]

// Bo cuc ban dau cua tung kenh dich
const CHANNELS = {
  // Dark Grace dau video "them danh sach phat": 7 phan
  grace: { ucId: id('darkGrace'), name: 'Dark Grace', own: [{ title: 'Dark Grace', count: 26 }],
    sections: [featured('Dark Bible Study', 'Dark Bible - in a Nutshell', 'Dark Biblical Realm'), pl('Bible - in a Nutshell', 12), pl('Dark Bible Study', 7), ...tail] },
  // chua co "Kenh noi bat"
  nofeat: { ucId: id('noFeatured'), name: 'Dark Faith', own: [{ title: 'Dark Faith', count: 9 }],
    sections: [other('Ghi nhận hội viên', undefined, 'Ảnh hồ sơ của các hội viên được chọn ngẫu nhiên sẽ xuất hiện tại đây.'), pl('Bible - in a Nutshell', 12), other('Video', 40), other('Bài đăng', 3)] },
  // da co ca kenh moi lan danh sach phat
  already: { ucId: id('already'), name: 'Dark Bible Mysteries', own: [],
    sections: [featured('Dark Bible Study', 'Dark Bible Genesis'), pl('Dark Bible Genesis', 1), other('Video', 5)] },
  // da du 12 phan
  full: { ucId: id('full'), name: 'Bibelbotschaft', own: [],
    sections: [featured('Dark Bible Study'), ...Array.from({ length: 8 }, (_, i) => pl(`Bible ${i + 1}`, i + 2)), other('Video', 21), other('Video ngắn', 4), other('Bài đăng', 1)] },
  // bien the: danh sach sap xep bang chuot (khong co .maybe-draggable)
  mouse: { ucId: id('mouseDrag'), name: 'Dark Faith 2nd', own: [], dnd: 'mouse',
    sections: [featured('Dark Bible Study'), pl('Bible - in a Nutshell', 12), pl('Dark Bible Study', 7), other('Video', 21)] },
  // chinh la kenh moi
  self: { ucId: NEW.ucId, name: NEW.name, own: [{ title: 'Dark Bible Genesis', count: 1 }],
    sections: [pl('Dark Bible Genesis', 1), other('Video', 1)] },
}

module.exports = { NEW, PLAYLIST, CHANNEL_DB, PLAYLIST_DB, CHANNELS }
