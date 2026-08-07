import { supabase } from './client.js';

export interface UserRow {
  id: number;
  telegram_chat_id: number;
  created_at: string;
}

export async function getUserByChatId(chatId: number): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as UserRow | null;
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as UserRow | null;
}

export async function getOrCreateUser(chatId: number): Promise<UserRow> {
  const existing = await getUserByChatId(chatId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ telegram_chat_id: chatId })
    .select()
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error('Failed to create user');
  }

  return data;
}
