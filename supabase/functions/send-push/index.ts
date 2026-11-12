// Phone notifications. Two jobs:
//   { id }   called by the notify_push trigger for every new notification: sends it to every
//            phone its person turned notifications on for, once (notifications.pushed_at).
//   { key }  the app asks for the public VAPID key before subscribing. The key pair is made here
//            on first use and kept in Supabase Vault, so nobody has to handle keys by hand.
// Deployed with verify_jwt off: the trigger has no user token. Nothing here can be abused beyond
// re-checking a notification that was already sent (it's claimed once) or reading a public key.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function keys(): Promise<{ publicKey: string; privateKey: string }> {
  const { data } = await db.rpc('push_keys')
  if (data?.public && data?.private) return { publicKey: data.public, privateKey: data.private }
  const made = webpush.generateVAPIDKeys()
  // Two first calls at once: the database keeps whichever pair landed first, and both read it back.
  await db.rpc('push_keys_init', { pub: made.publicKey, priv: made.privateKey })
  const { data: again } = await db.rpc('push_keys')
  return { publicKey: again.public, privateKey: again.private }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let body: { id?: number; key?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Send JSON' }, 400)
  }

  if (body.key) return json({ key: (await keys()).publicKey })

  if (!body.id) return json({ error: 'No notification id' }, 400)
  // Claim it: only a fresh, unsent notification goes out.
  const { data: note } = await db
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', body.id)
    .is('pushed_at', null)
    .gt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .select('id, user_id, kind, text, link')
    .maybeSingle()
  if (!note) return json({ sent: 0 })

  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', note.user_id)
  if (!subs?.length) return json({ sent: 0 })

  const k = await keys()
  webpush.setVapidDetails('https://steamhub2027.vercel.app', k.publicKey, k.privateKey)
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', note.user_id).is('read_at', null)
  const payload = JSON.stringify({ title: 'Steamhub', body: note.text, url: note.link ?? '/notifications', tag: `${note.kind}-${note.id}`, badge: count ?? 0 })

  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        // The phone unsubscribed or the browser was reset: forget it.
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
        else console.error('push failed', code, (e as Error).message)
      }
    }),
  )
  return json({ sent })
})
