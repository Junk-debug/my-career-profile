import type { SaveState } from '../hooks/useSkills';
import { RATING_VALUES } from '../lib/types';

export type SeenFilter = 'all' | 'seen' | 'unseen';
export type RatingKey = 'none' | '0' | '1' | '2' | '3' | '4' | '5';
export type SortMode = 'file' | 'unrated' | 'name' | 'rating';

export interface Filters {
  query: string;
  ratings: ReadonlySet<RatingKey>;
  seen: SeenFilter;
  sort: SortMode;
}

export interface Stats {
  total: number;
  rated: number;
  average: number | null;
  byRating: Record<RatingKey, number>;
}

interface ToolbarProps {
  filters: Filters;
  stats: Stats;
  visible: number;
  saveState: SaveState;
  csvPath: string | null;
  onChange: (filters: Filters) => void;
  onReload: () => void;
}

const SEEN_OPTIONS: readonly { key: SeenFilter; label: string }[] = [
  { key: 'all', label: 'усі' },
  { key: 'seen', label: 'вже бачив' },
  { key: 'unseen', label: 'ще не бачив' },
];

const SORT_OPTIONS: readonly { key: SortMode; label: string }[] = [
  { key: 'file', label: 'як у файлі' },
  { key: 'unrated', label: 'спершу неоцінені' },
  { key: 'name', label: 'за алфавітом' },
  { key: 'rating', label: 'за оцінкою' },
];

function SaveIndicator({ state, onReload }: { state: SaveState; onReload: () => void }): React.JSX.Element {
  switch (state.status) {
    case 'saving':
      return <span className="save save--busy">Збереження…</span>;
    case 'saved':
      return <span className="save save--ok">✓ Записано в skills.csv</span>;
    case 'error':
      return (
        <span className="save save--error">
          {state.message}
          {state.conflict && (
            <button type="button" className="chip" onClick={onReload}>
              Перечитати файл
            </button>
          )}
        </span>
      );
    default:
      return <span className="save">Зміни пишуться в skills.csv автоматично</span>;
  }
}

export function Toolbar({
  filters,
  stats,
  visible,
  saveState,
  csvPath,
  onChange,
  onReload,
}: ToolbarProps): React.JSX.Element {
  const toggleRating = (key: RatingKey): void => {
    const next = new Set(filters.ratings);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...filters, ratings: next });
  };

  const progress = stats.total > 0 ? (stats.rated / stats.total) * 100 : 0;
  const filtersActive = filters.query !== '' || filters.ratings.size > 0 || filters.seen !== 'all';

  return (
    <header className="toolbar">
      <div className="toolbar__top">
        <div>
          <h1>Мої скіли</h1>
          <p className="toolbar__hint">
            Клік по зірках — оцінка. На рядку працюють клавіші <kbd>0</kbd>–<kbd>5</kbd>, <kbd>S</kbd> — «вже
            бачив», <kbd>Backspace</kbd> — прибрати оцінку, <kbd>↑</kbd>/<kbd>↓</kbd> — сусідній скіл.
            {csvPath !== null && <span className="toolbar__path"> · {csvPath}</span>}
          </p>
        </div>
        <SaveIndicator state={saveState} onReload={onReload} />
      </div>

      <div className="toolbar__stats">
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress}%` }} />
        </div>
        <span>
          Оцінено <strong>{stats.rated}</strong> з <strong>{stats.total}</strong>
          {stats.byRating.none > 0 && <> · без оцінки {stats.byRating.none}</>}
          {stats.average !== null && (
            <>
              {' '}
              · середнє <strong>{stats.average.toFixed(2)}</strong>
            </>
          )}
          {visible !== stats.total && <> · показано {visible}</>}
        </span>
      </div>

      <div className="toolbar__controls">
        <input
          type="search"
          className="search"
          placeholder="Пошук скіла…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />

        <label className="sort">
          Сортування
          <select
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as SortMode })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="chips" role="group" aria-label="Фільтр за оцінкою">
          <button
            type="button"
            className={`chip ${filters.ratings.has('none') ? 'is-on' : ''}`}
            onClick={() => toggleRating('none')}
          >
            без оцінки <span className="chip__count">{stats.byRating.none}</span>
          </button>
          {RATING_VALUES.map((value) => {
            const key = String(value) as RatingKey;
            return (
              <button
                key={key}
                type="button"
                className={`chip ${filters.ratings.has(key) ? 'is-on' : ''}`}
                onClick={() => toggleRating(key)}
              >
                {value} <span className="chip__count">{stats.byRating[key]}</span>
              </button>
            );
          })}
        </div>

        <div className="chips" role="group" aria-label="Фільтр за «вже бачив»">
          {SEEN_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`chip ${filters.seen === option.key ? 'is-on' : ''}`}
              onClick={() => onChange({ ...filters, seen: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filtersActive && (
          <button
            type="button"
            className="chip chip--reset"
            onClick={() => onChange({ ...filters, query: '', ratings: new Set(), seen: 'all' })}
          >
            Скинути фільтри
          </button>
        )}
      </div>
    </header>
  );
}
