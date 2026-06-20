import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Table helpers ────────────────────────────────────────────────────────────

export async function createTable(tableId, gameState) {
  const { error } = await supabase
    .from('tables')
    .upsert({ id: tableId, state: gameState, updated_at: new Date().toISOString() });
  if (error) console.error('createTable:', error);
}

export async function updateTable(tableId, gameState) {
  const { error } = await supabase
    .from('tables')
    .update({ state: gameState, updated_at: new Date().toISOString() })
    .eq('id', tableId);
  if (error) console.error('updateTable:', error);
}

export async function getTable(tableId) {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('id', tableId)
    .single();
  if (error) return null;
  return data;
}

// Each call gets its OWN uniquely-named channel, even when subscribing to
// the same table. Supabase channels are matched by name — two separate
// components (e.g. JoinScreen and useGameState) both subscribing to
// "table:aone-main" at the same time collide and throw
// "cannot add postgres_changes callbacks... after subscribe()". A random
// suffix per call keeps every subscriber's channel independent.
let _channelCounter = 0;
export function subscribeToTable(tableId, onUpdate) {
  const channelName = `table:${tableId}:${Date.now()}:${_channelCounter++}`;
  return supabase
    .channel(channelName)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'tables',
      filter: `id=eq.${tableId}`,
    }, payload => {
      onUpdate(payload.new.state);
    })
    .subscribe();
}

// ─── Hand history ─────────────────────────────────────────────────────────────

export async function saveHandHistory(tableId, hand) {
  const { error } = await supabase
    .from('hand_history')
    .insert({ table_id: tableId, hand, created_at: new Date().toISOString() });
  if (error) console.error('saveHandHistory:', error);
}

export async function getHandHistory(tableId, limit = 50) {
  const { data, error } = await supabase
    .from('hand_history')
    .select('*')
    .eq('table_id', tableId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data;
}
