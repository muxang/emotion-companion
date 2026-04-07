import type {
  ConversationMode,
  MessageDTO,
  SessionDTO,
} from '@emotion/shared';
import { fetchJson } from './client.js';

export async function listSessions(): Promise<SessionDTO[]> {
  const data = await fetchJson<{ sessions: SessionDTO[] }>('/api/sessions');
  return data.sessions;
}

export async function createSession(input: {
  title?: string;
  mode?: ConversationMode;
}): Promise<SessionDTO> {
  const data = await fetchJson<{ session: SessionDTO }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.session;
}

export async function getSession(
  id: string
): Promise<{ session: SessionDTO; messages: MessageDTO[] }> {
  return fetchJson<{ session: SessionDTO; messages: MessageDTO[] }>(
    `/api/sessions/${id}`
  );
}

export async function deleteSession(id: string): Promise<void> {
  await fetchJson<{ deleted: boolean }>(`/api/sessions/${id}`, {
    method: 'DELETE',
  });
}

/** 修改会话标题（PATCH /api/sessions/:id） */
export async function renameSession(
  id: string,
  title: string
): Promise<SessionDTO> {
  const data = await fetchJson<{ session: SessionDTO }>(
    `/api/sessions/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }
  );
  return data.session;
}
