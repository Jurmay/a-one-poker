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

export function subscribeToTable(tableId, onUpdate) {
  return supabase
    .channel(`table:${tableId}`)
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
