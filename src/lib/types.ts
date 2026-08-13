/** Оцінка скіла: 0–5, або `null` якщо ще не оцінено (порожня клітинка в CSV). */
export type Rating = 0 | 1 | 2 | 3 | 4 | 5 | null;

/** Один рядок skills.csv у нормалізованому вигляді. */
export interface SkillRecord {
  name: string;
  rating: Rating;
  /** Колонка `already_seen`. */
  seen: boolean;
  /** Секція — лише якщо у файлі є така колонка; інакше порожній рядок. */
  section: string;
  /** Значення колонок, яких застосунок не знає, — щоб запис їх не втратив. */
  extra?: Record<string, string>;
}

/** Те саме, але зі стабільним ідентифікатором для React/фокуса. */
export interface Skill extends SkillRecord {
  uid: string;
}

export const RATING_VALUES = [0, 1, 2, 3, 4, 5] as const;

export function isRating(value: number): value is Exclude<Rating, null> {
  return Number.isInteger(value) && value >= 0 && value <= 5;
}
