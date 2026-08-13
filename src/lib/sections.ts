import type { Skill } from './types';

/** Стабільний якір для навігації сайдбаром. */
export function sectionAnchorId(section: string): string {
  return `section-${encodeURIComponent(section).replaceAll('%', '_')}`;
}

export interface SectionGroup {
  section: string;
  skills: Skill[];
}

/** Групує скіли, зберігаючи порядок секцій із CSV. */
export function groupBySection(skills: readonly Skill[]): SectionGroup[] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const bucket = groups.get(skill.section);
    if (bucket === undefined) groups.set(skill.section, [skill]);
    else bucket.push(skill);
  }
  return [...groups].map(([section, items]) => ({ section, skills: items }));
}
