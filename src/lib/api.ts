import type { SkillRecord } from './types';

const ENDPOINT = '/api/skills';

/** Файл змінили поза застосунком — потрібно перечитати, щоб не затерти чужі правки. */
export class ConflictError extends Error {}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
  } catch {
    // тіло не JSON — лишаємо статус
  }
  return `HTTP ${response.status}`;
}

export interface SkillsResponse {
  skills: SkillRecord[];
  revision: string;
  path: string;
}

export async function fetchSkills(): Promise<SkillsResponse> {
  const response = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as SkillsResponse;
}

export async function saveSkills(
  skills: readonly SkillRecord[],
  revision: string | null,
): Promise<{ revision: string }> {
  const response = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skills, revision }),
  });
  if (response.status === 409) throw new ConflictError(await errorMessage(response));
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as { revision: string };
}
