import { supabase } from './cloud';

/** Someone you're friends with, or a request either way. */
export interface Friend {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  status: 'pending' | 'accepted';
  /** true when they asked you. */
  incoming: boolean;
  since: string;
}

export type Found = Pick<Friend, 'id' | 'username' | 'display_name' | 'avatar_url' | 'avatar_color'>;

export async function listFriends(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('my_friends');
  if (error) throw error;
  return (data as Friend[]) ?? [];
}

export async function findUser(username: string): Promise<Found | null> {
  const { data, error } = await supabase.rpc('find_user', { name: username });
  if (error) throw error;
  return ((data as Found[]) ?? [])[0] ?? null;
}

export async function sendRequest(me: string, them: string) {
  const { error } = await supabase.from('friendships').insert({ requester: me, addressee: them });
  // Already asked (either way): nothing to do.
  if (error && error.code !== '23505') throw error;
}

export async function acceptRequest(me: string, them: string) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('requester', them)
    .eq('addressee', me);
  if (error) throw error;
}

/** Declines, cancels or unfriends, whichever way round it is. */
export async function removeFriend(me: string, them: string) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester.eq.${me},addressee.eq.${them}),and(requester.eq.${them},addressee.eq.${me})`);
  if (error) throw error;
}
