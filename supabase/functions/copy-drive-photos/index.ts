// Copies stock photos from Google Drive into the Steamhub `photos` bucket, so photos keep working
// even if the Drive folder stops being shared. Runs in small batches; call it until `remaining` is 0.
// Only signed-in team members can run it. Safe to run twice: it only touches Drive links.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Who's asking. The service key is only used after this check.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(token)
  const user = auth?.user
  if (!user) return json({ error: 'Sign in first.' }, 401)
  const name = (user.user_metadata?.full_name as string) ?? user.email ?? 'Someone'

  const { batch = 10 } = await req.json().catch(() => ({}))
  const { data: pieces, error } = await admin
    .from('pieces')
    .select('id, photo_url')
    .like('photo_url', '%drive.google.com%')
    .order('id')
    .limit(Math.min(Math.max(1, Number(batch) || 10), 25))
  if (error) return json({ error: error.message }, 500)

  const copied: string[] = []
  const failed: { id: string; reason: string }[] = []
  for (const p of pieces ?? []) {
    const fileId = p.photo_url.match(/\/d\/([^/?]+)/)?.[1] ?? p.photo_url.match(/[?&]id=([^&]+)/)?.[1]
    if (!fileId) {
      failed.push({ id: p.id, reason: 'not a Drive file link' })
      continue
    }
    try {
      // The same endpoint the site uses to show Drive photos today, at a size good enough for the site.
      const res = await fetch(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`, { redirect: 'follow' })
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) throw new Error(`Drive answered ${res.status} ${type || 'no type'}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      const path = `${p.id}-drive.jpg`
      const up = await admin.storage.from('photos').upload(path, bytes, { contentType: type, upsert: true })
      if (up.error) throw new Error(up.error.message)
      const url = admin.storage.from('photos').getPublicUrl(path).data.publicUrl
      // Only replace the link if nobody changed the photo meanwhile.
      const { data: updated, error: upErr } = await admin.from('pieces').update({ photo_url: url }).eq('id', p.id).eq('photo_url', p.photo_url).select('id')
      if (upErr) throw new Error(upErr.message)
      if (updated?.length) {
        await admin.from('piece_events').insert({ piece_id: p.id, action: 'photo_copied', by_id: user.id, by_name: name, details: { from: p.photo_url } })
        copied.push(p.id)
      }
    } catch (e) {
      failed.push({ id: p.id, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  const { count } = await admin.from('pieces').select('id', { count: 'exact', head: true }).like('photo_url', '%drive.google.com%')
  return json({ copied, failed, remaining: count ?? 0 })
})
