// Sync and audio server. Static files are served by Cloudflare directly; this code handles /api/* and /audio/*.
// It stores one learner's data in D1 and recorded audio in R2, and asks a language model for short explanations (explain.ts). The app signs in with Google (see auth.ts);
// the audio build script uses a secret key.
import { getAuth, isAllowed, type AuthEnv } from './auth'
import { explain, type ExplainEnv } from './explain'
import { mergeMeta, type SyncedMeta } from '../src/sync/merge'
import { LOG_PAGE, stampOf, type SyncRequest, type SyncResponse, type WireLog, type WireMem } from '../src/sync/protocol'

interface Env extends AuthEnv, ExplainEnv {
  AUDIO: R2Bucket
  /** For the audio build script. Set with `wrangler secret put SYNC_KEY`. */
  SYNC_KEY: string
}

const MAX_BODY = 4_000_000

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

/** Compares two secrets without leaking, through timing, how much of the guess was right. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const p = new Uint8Array(x)
  const q = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i]
  return diff === 0
}

async function counters(db: D1Database): Promise<{ rev: number; epoch: number }> {
  const { results } = await db.prepare('SELECT key, value FROM state').all<{ key: string; value: number }>()
  const get = (k: string) => results.find((r) => r.key === k)?.value ?? 0
  return { rev: get('rev'), epoch: get('epoch') }
}

const validMem = (m: WireMem) => typeof m?.id === 'string' && m.id.length <= 200 && typeof m.card === 'object' && m.card !== null && Number.isFinite(stampOf(m))
const validLog = (l: WireLog) => typeof l?.uid === 'string' && l.uid.length <= 64 && typeof l.id === 'string' && Number.isFinite(l.at)

async function sync(db: D1Database, req: SyncRequest): Promise<SyncResponse> {
  const { epoch } = await counters(db)
  // A device from an older generation (before a "Start over" elsewhere) must not bring old data back.
  const stale = req.epoch != null && req.epoch < epoch
  const current = req.epoch === epoch
  const memRev = current ? req.memRev : 0
  const logSeq = current ? req.logSeq : 0

  const memory = stale ? [] : (req.memory ?? []).filter(validMem)
  const log = stale ? [] : (req.log ?? []).filter(validLog)

  const saved = await db.prepare('SELECT data FROM meta WHERE id = 1').first<{ data: string }>()
  const serverMeta = saved ? (JSON.parse(saved.data) as SyncedMeta) : null
  const clientMeta = stale ? null : (req.meta as SyncedMeta | null)
  const meta = serverMeta && clientMeta ? mergeMeta(serverMeta, clientMeta) : (clientMeta ?? serverMeta)

  // One batch is one transaction, so the changes and the reads below see the same state.
  const writes: D1PreparedStatement[] = []
  if (memory.length) {
    writes.push(db.prepare("UPDATE state SET value = value + 1 WHERE key = 'rev'"))
    writes.push(
      db
        .prepare(
          `INSERT INTO memory (id, data, stamp, rev)
           SELECT json_extract(value, '$.id'), json_extract(value, '$.data'), json_extract(value, '$.stamp'),
                  (SELECT value FROM state WHERE key = 'rev')
           FROM json_each(?1) WHERE true
           ON CONFLICT (id) DO UPDATE SET data = excluded.data, stamp = excluded.stamp, rev = excluded.rev
           WHERE excluded.stamp > memory.stamp`,
        )
        .bind(JSON.stringify(memory.map((m) => ({ id: m.id, stamp: stampOf(m), data: m })))),
    )
  }
  if (log.length) {
    writes.push(db.prepare("INSERT OR IGNORE INTO log (uid, data) SELECT json_extract(value, '$.uid'), value FROM json_each(?1)").bind(JSON.stringify(log)))
  }
  if (clientMeta && meta) {
    writes.push(db.prepare('INSERT INTO meta (id, data) VALUES (1, ?1) ON CONFLICT (id) DO UPDATE SET data = excluded.data').bind(JSON.stringify(meta)))
  }

  const reads = [
    db.prepare('SELECT data, rev FROM memory WHERE rev > ?1').bind(memRev),
    db.prepare('SELECT seq, data FROM log WHERE seq > ?1 ORDER BY seq LIMIT ?2').bind(logSeq, LOG_PAGE + 1),
    db.prepare("SELECT value FROM state WHERE key = 'rev'"),
  ]
  const results = await db.batch([...writes, ...reads])
  const [memRows, logRows, revRows] = results.slice(writes.length) as [D1Result<{ data: string; rev: number }>, D1Result<{ seq: number; data: string }>, D1Result<{ value: number }>]

  // The device already has what it just sent.
  const sentMem = new Map(memory.map((m) => [m.id, stampOf(m)]))
  const sentLog = new Set(log.map((l) => l.uid))
  const page = logRows.results.slice(0, LOG_PAGE)
  const outMem = memRows.results.map((r) => JSON.parse(r.data) as WireMem).filter((m) => sentMem.get(m.id) !== stampOf(m))
  const outLog = page.map((r) => JSON.parse(r.data) as WireLog).filter((l) => !sentLog.has(l.uid))

  return {
    epoch,
    reset: stale,
    memRev: revRows.results[0]?.value ?? 0,
    logSeq: page.length ? page[page.length - 1].seq : logSeq,
    more: logRows.results.length > LOG_PAGE,
    memory: outMem,
    log: outLog,
    meta,
  }
}

/** "Start over": deletes everything and starts a new generation, so other devices drop their copies too. */
async function reset(db: D1Database, epoch: number): Promise<Response> {
  const now = await counters(db)
  if (!Number.isFinite(epoch) || epoch < now.epoch) return json({ error: 'A newer reset already happened' }, 409)
  if (epoch > now.epoch) {
    await db.batch([
      db.prepare('DELETE FROM memory'),
      db.prepare('DELETE FROM log'),
      db.prepare('DELETE FROM meta'),
      db.prepare("UPDATE state SET value = ?1 WHERE key = 'epoch'").bind(epoch),
    ])
  }
  return json({ epoch })
}

const AUDIO_PATH = /^\/audio\/([a-z0-9-]{1,40}\/[0-9a-f]{20}\.mp3)$/

/** Recorded audio is public and never changes: a new recording gets a new name. */
async function audio(env: Env, name: string): Promise<Response> {
  const object = await env.AUDIO.get(name)
  if (!object) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  return new Response(object.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=31536000, immutable', etag: object.httpEtag } })
}

/** Names of all recordings of one voice, so the build script uploads only what is missing. */
async function audioList(env: Env, voice: string): Promise<string[]> {
  const names: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.AUDIO.list({ prefix: `${voice}/`, cursor })
    names.push(...page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return names
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const file = pathname.match(AUDIO_PATH)?.[1]
    if (pathname.startsWith('/audio/')) return file && request.method === 'GET' ? audio(env, file) : new Response('Not found', { status: 404 })
    if (!pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })

    if (pathname.startsWith('/api/auth/')) return getAuth(env).handler(request)

    // Recordings are uploaded by scripts/build-audio.ts, which has the secret key and no browser session.
    if (pathname.startsWith('/api/audio')) {
      const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      if (!env.SYNC_KEY || !(await sameSecret(given, env.SYNC_KEY))) return json({ error: 'Wrong key' }, 401)

      const upload = pathname.match(/^\/api(\/audio\/.+)$/)?.[1].match(AUDIO_PATH)?.[1]
      if (upload && request.method === 'PUT') {
        const body = await request.arrayBuffer()
        if (body.byteLength > MAX_BODY) return json({ error: 'File too large' }, 413)
        await env.AUDIO.put(upload, body, { httpMetadata: { contentType: 'audio/mpeg' } })
        return json({ ok: true })
      }
      if (pathname === '/api/audio-list' && request.method === 'POST') {
        const { voice } = (await request.json().catch(() => ({}))) as { voice?: string }
        return json(await audioList(env, String(voice)))
      }
      return json({ error: 'Not found' }, 404)
    }

    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405)
    // The session is a cookie, so refuse requests that another website made the browser send.
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Wrong origin' }, 403)
    const session = await getAuth(env).api.getSession({ headers: request.headers })
    if (!session || !isAllowed(env, session.user.email)) return json({ error: 'Not signed in' }, 401)

    const text = await request.text()
    if (text.length > MAX_BODY) return json({ error: 'Too much data in one request' }, 413)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: 'Not JSON' }, 400)
    }

    if (pathname === '/api/sync') return json(await sync(env.DB, body as SyncRequest))
    if (pathname === '/api/reset') return reset(env.DB, (body as { epoch: number }).epoch)
    if (pathname === '/api/explain') {
      const { status, ...rest } = await explain(env, body)
      return json(rest, status)
    }
    return json({ error: 'Not found' }, 404)
  },
} satisfies ExportedHandler<Env>
