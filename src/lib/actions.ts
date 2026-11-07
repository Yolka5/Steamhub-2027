import { supabase } from './supabase'
import { KERF, type Piece } from './stock'

// Every change goes through here so it always gets a history row.

interface Who {
  userId: string
  name: string
}

async function log(pieceId: string, action: string, who: Who, details?: object) {
  await supabase.from('piece_events').insert({ piece_id: pieceId, action, by_id: who.userId, by_name: who.name, details })
}

/** Only succeeds if the piece is still available, so two people can't take the same one. */
export async function reservePiece(id: string, who: Who, forWhat: string, plannedLength: number | null, subsystemId: string | null = null) {
  const { data, error } = await supabase
    .from('pieces')
    .update({
      status: 'reserved',
      reserved_by: who.userId,
      reserved_by_name: who.name,
      reserved_for: forWhat || null,
      planned_length: plannedLength,
      reserved_at: new Date().toISOString(),
      subsystem_id: subsystemId,
    })
    .eq('id', id)
    .eq('status', 'available')
    .select()
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Someone just took this piece. Pick another one.' }
  await log(id, 'reserved', who, { for: forWhat, planned_length: plannedLength })
  return { piece: data as Piece }
}

export async function releasePiece(id: string, who: Who) {
  const { data, error } = await supabase
    .from('pieces')
    .update({ status: 'available', reserved_by: null, reserved_by_name: null, reserved_for: null, planned_length: null, reserved_at: null, subsystem_id: null })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  await log(id, 'released', who)
  return { piece: data as Piece }
}

export async function markUsed(id: string, who: Who) {
  const { data, error } = await supabase.from('pieces').update({ status: 'used' }).eq('id', id).select().single()
  if (error) return { error: error.message }
  await log(id, 'used', who)
  return { piece: data as Piece }
}

/**
 * The part is made: cut `final` mm off. Whatever is left (minus the saw kerf) goes back to
 * Available under the same ID, because nothing is ever thrown out. Only succeeds if the piece
 * still has the length the person saw, so a double tap can't cut it twice.
 */
export async function cutPiece(piece: Piece, final: number, who: Who) {
  const leftover = Math.round((piece.length - final - KERF) * 10) / 10
  const patch =
    leftover > 0
      ? { status: 'available', length: leftover, reserved_by: null, reserved_by_name: null, reserved_for: null, planned_length: null, reserved_at: null, subsystem_id: null }
      : { status: 'used' }
  const { data, error } = await supabase.from('pieces').update(patch).eq('id', piece.id).eq('length', piece.length).select().maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'This piece changed while you were cutting. Reload and try again.' }
  await log(piece.id, 'cut', who, { final, leftover: Math.max(0, leftover), for: piece.reserved_for, from: piece.length })
  return { piece: data as Piece, leftover: Math.max(0, leftover) }
}

export async function updatePiece(id: string, patch: Partial<Piece>, who: Who) {
  const { data, error } = await supabase.from('pieces').update(patch).eq('id', id).select().single()
  if (error) return { error: error.message }
  await log(id, 'edited', who, patch)
  return { piece: data as Piece }
}

/** Permanently removes a piece and its history. The UI asks twice before calling this. */
export async function deletePiece(id: string) {
  const { error } = await supabase.from('pieces').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

export async function nextId(prefix: string): Promise<string> {
  const { data } = await supabase.rpc('next_piece_id', { prefix })
  return (data as string) ?? `${prefix}-001`
}

export async function addPiece(row: Partial<Piece> & { id: string }, who: Who) {
  const { data, error } = await supabase
    .from('pieces')
    .insert({ ...row, created_by_name: who.name })
    .select()
    .single()
  if (error) return { error: error.code === '23505' ? 'duplicate' : error.message }
  await log(row.id, 'added', who)
  return { piece: data as Piece }
}

/** Shrinks the photo on the phone first, so uploads are quick on workshop wifi. */
export async function uploadPhoto(id: string, file: File): Promise<{ url?: string; error?: string }> {
  const blob = await shrink(file, 1600)
  const path = `${id}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) return { error: error.message }
  return { url: supabase.storage.from('photos').getPublicUrl(path).data.publicUrl }
}

async function shrink(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82))
}
