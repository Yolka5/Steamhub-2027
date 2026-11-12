import { supabase } from './supabase'

// Phone notifications. Everything that rings Steamhub's bell also reaches the phones people
// turned this on for: the send-push edge function sends each new notification (see
// CALENDAR.md, phase 0). The offline worker (sw/sw.js) shows it and opens its link on tap.
//
// iPhones only allow it once Steamhub is on the home screen (iOS 16.4 and later).

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !standalone() ? 'ios-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (!import.meta.env.PROD) return 'unsupported'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function publicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { key: true } })
  if (error || !data?.key) throw new Error("Phone notifications aren't set up on the server yet.")
  return data.key as string
}

async function save(sub: PushSubscription, userId: string) {
  const j = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

/** Asks the phone, subscribes, and stores it. Returns an error to show, or null. */
export async function turnOnPush(userId: string): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return permission === 'denied' ? 'Notifications are blocked for Steamhub. Allow them in the phone settings.' : 'Notifications stay off.'
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(await publicKey()) })
    await save(sub, userId)
    return null
  } catch (e) {
    return (e as Error).message || "Couldn't turn notifications on."
  }
}

export async function turnOffPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/**
 * On every app start: a phone that has notifications on keeps its subscription stored under the
 * person signed in now (the browser may have renewed it, or someone else signed in).
 */
export async function refreshPush(userId: string) {
  try {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await save(sub, userId)
  } catch {
    // Next start tries again.
  }
}

/** A notification to yourself, to see it arrive. */
export async function testPush(userId: string) {
  const { error } = await supabase.from('notifications').insert({ user_id: userId, kind: 'test', text: 'Phone notifications work', link: '/notifications' })
  return error?.message ?? null
}
