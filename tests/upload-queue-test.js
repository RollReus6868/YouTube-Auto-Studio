// Bai kiem src/upload-queue.js: nhieu hang cho chay cung luc, video trong mot hang cho chay lan luot.
//   node tests/upload-queue-test.js
const assert = require('assert')
const { UploadQueue, queueKey } = require('../src/upload-queue')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tests = []
const test = (name, fn) => tests.push([name, fn])

// runOne gia: ghi lai luc bat dau / ket thuc, chay ms
function recorder(ms = {}) {
  const ev = []
  let t0 = Date.now()
  const live = new Set()
  let peak = 0
  const runOne = async (job, lane) => {
    live.add(job.id); peak = Math.max(peak, live.size)
    ev.push(['start', job.id, lane])
    await sleep(ms[job.id] || 30)
    if (job.fail) { live.delete(job.id); ev.push(['fail', job.id, lane]); throw new Error('loi') }
    live.delete(job.id)
    ev.push(['end', job.id, lane])
  }
  return { ev, runOne, peak: () => peak, t0 }
}

test('queueKey', () => {
  assert.equal(queueKey(undefined, 'a'), 'q1')
  assert.equal(queueKey(3, 'a'), 'q3')
  assert.equal(queueKey('2', 'a'), 'q2')
  assert.equal(queueKey(99, 'a'), 'q9')
  assert.equal(queueKey('solo', 'tep/x.mp4'), 'solo:tep/x.mp4')
})

test('mot hang cho: lan luot, luong 0', async () => {
  const r = recorder()
  const q = new UploadQueue({ parallel: 3, runOne: r.runOne })
  q.add([{ id: 'a', queue: 'q1' }, { id: 'b', queue: 'q1' }, { id: 'c', queue: 'q1' }])
  await q.done
  assert.deepEqual(r.ev.filter((e) => e[0] === 'start').map((e) => e[1]), ['a', 'b', 'c'])
  assert.equal(r.peak(), 1)
  assert(r.ev.every((e) => e[2] === 0))
})

test('hai hang cho chay cung luc, moi hang cho mot luong; video trong hang cho lan luot', async () => {
  const r = recorder({ a1: 80, b1: 30 })
  const q = new UploadQueue({ parallel: 2, runOne: r.runOne })
  q.add([{ id: 'a1', queue: 'q1' }, { id: 'b1', queue: 'q2' }, { id: 'a2', queue: 'q1' }, { id: 'b2', queue: 'q2' }])
  await q.done
  assert.equal(r.peak(), 2, 'hai video cung luc')
  const lane = (id) => r.ev.find((e) => e[0] === 'start' && e[1] === id)[2]
  assert.equal(lane('a1'), lane('a2'))
  assert.equal(lane('b1'), lane('b2'))
  assert.notEqual(lane('a1'), lane('b1'))
  const idx = (k, id) => r.ev.findIndex((e) => e[0] === k && e[1] === id)
  assert(idx('end', 'a1') < idx('start', 'a2'), 'a2 cho a1 xong')
  assert(idx('end', 'b1') < idx('start', 'b2'))
})

test('gioi han parallel: hang cho thu 3 doi luong ranh, dung lai luong vua ranh', async () => {
  const r = recorder({ a: 60, b: 20, c: 20 })
  const q = new UploadQueue({ parallel: 2, runOne: r.runOne })
  q.add([{ id: 'a', queue: 'q1' }, { id: 'b', queue: 'q2' }, { id: 'c', queue: 'q3' }])
  await q.done
  assert.equal(r.peak(), 2)
  const st = (id) => r.ev.find((e) => e[0] === 'start' && e[1] === id)
  assert.equal(st('c')[2], st('b')[2], 'c dung luong cua b vua xong')
  assert(r.ev.findIndex((e) => e[0] === 'end' && e[1] === 'b') < r.ev.findIndex((e) => e[0] === 'start' && e[1] === 'c'))
})

test('video loi khong lam dung hang cho; them viec luc dang chay; trung id bo qua', async () => {
  const r = recorder({ a: 40 })
  const q = new UploadQueue({ parallel: 2, runOne: r.runOne })
  q.add([{ id: 'a', queue: 'q1' }, { id: 'x', queue: 'q1', fail: true }])
  await sleep(10)
  assert.equal(q.add([{ id: 'a', queue: 'q2' }, { id: 'b', queue: 'q2' }]), 1, 'a da co')
  q.add([{ id: 'y', queue: 'q1' }])
  await q.done
  assert.deepEqual(r.ev.filter((e) => e[0] !== 'start').map((e) => e.slice(0, 2)).sort(), [['end', 'a'], ['end', 'b'], ['end', 'y'], ['fail', 'x']])
  assert.equal(q.add([{ id: 'z' }]), -1, 'hang cho da xong han')
})

test('stopStarting: video dang chay xong, video cho khong chay; huy mot video dang cho', async () => {
  const r = recorder({ a: 60, b: 60 })
  const q = new UploadQueue({ parallel: 2, runOne: r.runOne })
  q.add([{ id: 'a', queue: 'q1' }, { id: 'a2', queue: 'q1' }, { id: 'b', queue: 'q2' }, { id: 'b2', queue: 'q2' }, { id: 'b3', queue: 'q2' }])
  await sleep(10)
  assert.equal(q.cancel('b3'), true)
  assert.equal(q.cancel('a'), false, 'dang chay thi khong huy')
  const snap = q.snapshot()
  assert.deepEqual(snap.map((s) => [s.key, s.running, s.waiting]), [['q1', 'a', ['a2']], ['q2', 'b', ['b2']]])
  q.stopStarting()
  await q.done
  assert.deepEqual(r.ev.filter((e) => e[0] === 'start').map((e) => e[1]).sort(), ['a', 'b'])
  assert.deepEqual(q.pending().map((j) => j.id).sort(), ['a2', 'b2'])
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed}/${tests.length} FAILED` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
