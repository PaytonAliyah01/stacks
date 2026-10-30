import type { Book, Challenge, ChallengeMeasure, Reading } from '../types';
import { supabase } from './cloud';
import { progressOf } from './challenges';

/** A reading challenge with friends: one goal, everyone's progress side by side. */
export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  status: 'invited' | 'joined';
  progress: number;
  latest: string | null;
  updated_at: string;
}

export interface GroupChallenge {
  id: string;
  owner: string;
  name: string;
  measure: ChallengeMeasure;
  goal: number;
  start_on: string;
  end_on: string;
  created_at: string;
  members: GroupMember[];
}

const notSetUp = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(e.message ?? '');
export class GroupsNotReady extends Error {
  constructor() {
    super('Challenges with friends aren’t set up on the server yet (run supabase/07-group-challenges.sql).');
  }
}
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (notSetUp(error)) throw new GroupsNotReady();
  throw error;
}

export async function listGroupChallenges(): Promise<GroupChallenge[]> {
  const { data, error } = await supabase.rpc('my_group_challenges');
  check(error);
  return (data as GroupChallenge[]) ?? [];
}

export interface NewGroupChallenge {
  name: string;
  measure: ChallengeMeasure;
  goal: number;
  start_on: string;
  end_on: string;
}

export async function startGroupChallenge(uid: string, c: NewGroupChallenge, friendIds: string[], mine: Progress): Promise<string> {
  const { data, error } = await supabase
    .from('group_challenges')
    .insert({ owner: uid, ...c, name: c.name.trim() })
    .select('id')
    .single();
  check(error);
  const id = (data as { id: string }).id;
  const { error: e2 } = await supabase.from('group_challenge_members').insert([
    { challenge_id: id, user_id: uid, status: 'joined', progress: mine.progress, latest: mine.latest },
    ...friendIds.map((f) => ({ challenge_id: id, user_id: f, status: 'invited' })),
  ]);
  check(e2);
  return id;
}

export async function inviteToGroup(id: string, friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase.from('group_challenge_members').insert(friendIds.map((f) => ({ challenge_id: id, user_id: f, status: 'invited' })));
  if (error && error.code !== '23505') check(error);
}

export async function joinGroup(id: string, uid: string, mine: Progress) {
  const { error } = await supabase
    .from('group_challenge_members')
    .update({ status: 'joined', progress: mine.progress, latest: mine.latest, updated_at: new Date().toISOString() })
    .eq('challenge_id', id)
    .eq('user_id', uid);
  check(error);
}

/** Decline an invite, or leave. */
export async function leaveGroup(id: string, uid: string) {
  const { error } = await supabase.from('group_challenge_members').delete().eq('challenge_id', id).eq('user_id', uid);
  check(error);
}

export async function deleteGroup(id: string) {
  const { error } = await supabase.from('group_challenges').delete().eq('id', id);
  check(error);
}

export async function sendGroupProgress(id: string, uid: string, mine: Progress) {
  const { error } = await supabase
    .from('group_challenge_members')
    .update({ progress: mine.progress, latest: mine.latest, updated_at: new Date().toISOString() })
    .eq('challenge_id', id)
    .eq('user_id', uid);
  check(error);
}

export interface Progress {
  progress: number;
  latest: string | null;
}

/** Your progress in a group challenge, worked out from your own reading. */
export function myProgress(g: Pick<GroupChallenge, 'measure' | 'goal' | 'start_on' | 'end_on'>, readings: Reading[], byId: Map<string, Book>): Progress {
  const c: Challenge = { id: '', name: '', measure: g.measure, goal: g.goal, startOn: g.start_on, endOn: g.end_on, badges: {}, createdAt: '', updatedAt: '' };
  const p = progressOf(c, readings, byId);
  const last = p.reads[p.reads.length - 1];
  return { progress: Math.round(p.done), latest: last ? last.book.title.slice(0, 200) : null };
}

export const memberName = (m: Pick<GroupMember, 'display_name' | 'username'>) => m.display_name || `@${m.username}`;

/** How far along the calendar the challenge is, 0–1. */
export function timePassed(g: Pick<GroupChallenge, 'start_on' | 'end_on'>, now = new Date()): number {
  const s = Date.parse(`${g.start_on}T00:00:00`);
  const e = Date.parse(`${g.end_on}T23:59:59`);
  return Math.max(0, Math.min(1, (now.getTime() - s) / (e - s)));
}
