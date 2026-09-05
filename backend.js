import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.KK_SUPABASE_CONFIG || {};
export const backendEnabled = Boolean(config.url && config.anonKey);
export const supabase = backendEnabled
  ? createClient(config.url, config.anonKey)
  : null;

function normalizeProfile(user, data) {
  return {
    id: user.id,
    name:
      data?.username ||
      user.user_metadata?.username ||
      user.email?.split("@")[0] ||
      "Anonymous Eye",
    bestScore: data?.best_score || 0,
    bestLevel: data?.best_level || 0,
    history: [],
  };
}

async function profileWithRuns(user, profile) {
  const { data: runs } = await supabase
    .from("runs")
    .select("survival_seconds, level, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);
  const history = runs || [];
  return {
    ...normalizeProfile(user, profile),
    bestScore:
      Math.floor(
        Math.max(0, ...history.map((run) => Number(run.survival_seconds))),
      ) ||
      profile?.best_score ||
      0,
    bestLevel: Math.max(
      1,
      ...history.map((run) => run.level || 1),
      profile?.best_level || 1,
    ),
    history: history.map((run) => ({
      time: Number(run.survival_seconds),
      level: run.level,
      reason: run.reason,
      date: new Date(run.created_at).toLocaleDateString(),
    })),
  };
}

export async function currentBackendProfile() {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return profileWithRuns(user, data);
}

export async function registerBackend(email, password, username) {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  if (data.user)
    await supabase.from("profiles").upsert({ id: data.user.id, username });
  return data.user ? profileWithRuns(data.user, { username }) : null;
}

export async function loginBackend(email, password) {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();
  return profileWithRuns(data.user, profile);
}

export async function logoutBackend() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function saveBackendRun(run) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("runs").insert({
    user_id: user.id,
    survival_seconds: run.time,
    level: run.level,
    reason: run.reason,
  });
  if (error) throw error;
}

export async function getBackendLeaderboard() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_leaderboard");
  if (error) throw error;
  return data || [];
}
