import { readLocal, writeLocal } from './local';

export const AGENT_LOG_KEY = 'safqa.agentlog.v1';
export interface AgentLogEntry { id: string; agentId: string; at: string; ar: string; en: string; kind: 'moderation' | 'appeal' | 'deal' | 'notify' | 'ops' | 'community' | 'chat' | 'support' }

export function logAgent(e: Omit<AgentLogEntry, 'id' | 'at'> & { id?: string; at?: string }) {
  const list = readLocal<AgentLogEntry[]>(AGENT_LOG_KEY, []);
  const id = e.id ?? crypto.randomUUID();
  if (list.some((x) => x.id === id)) return;
  writeLocal(AGENT_LOG_KEY, [{ ...e, id, at: e.at ?? new Date().toISOString() }, ...list].slice(0, 400));
}
export const readAgentLog = () => readLocal<AgentLogEntry[]>(AGENT_LOG_KEY, []);
