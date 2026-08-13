#!/usr/bin/env node
/**
 * Довідник по skills.csv для агента. Нічого не вирішує за модель:
 * лише відповідає, яка оцінка в скіла і чи є він у базі взагалі.
 *
 *   node skills.mjs rate "React" "Next.js" "Rust"   — оцінки для вибраних термінів
 *   node skills.mjs search "state"                  — пошук назви в базі
 *   node skills.mjs list --min=4 --grep=test        — перегляд бази
 *
 * Спільні прапорці: --json, --csv=<шлях до іншого skills.csv>
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = resolve(HERE, '../../../skills.csv');

/** Мінімальна оцінка для звичайної згадки в резюме. */
const MIN_RATING = 3;
/** Оцінка 2 живе лише в хвості рядка блоку скілів і лише як вимога вакансії. */
const TAIL_RATING = 2;
/** Від цієї оцінки скіл вважається сильним. */
const CORE_RATING = 4;
/** Нижче цієї схожості збіг вважається непевним і потребує рішення моделі. */
const CONFIDENT = 0.82;

// ─────────────────────────────────────────── CSV

/** Розбирає рядок CSV з урахуванням лапок. */
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** Читає skills.csv у масив { name, rating } зі збереженням порядку файлу. */
function readSkills(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('skill');
  const ratingIdx = header.indexOf('rating');
  if (nameIdx === -1 || ratingIdx === -1) throw new Error(`У ${path} немає колонок skill/rating`);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const raw = (cells[ratingIdx] ?? '').trim();
    return { name: (cells[nameIdx] ?? '').trim(), rating: raw === '' ? null : Number(raw) };
  }).filter((s) => s.name !== '');
}

// ─────────────────────────────────────────── схожість назв

/** "Next.js / NextJS" → "next js"; спільна форма для порівняння написань. */
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
const compact = (s) => normalize(s).replace(/ /g, '');

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Технічний "шум" у кінці назви: Node ≈ Node.js, REST ≈ REST API. */
const TAIL_NOISE = /(js|css|sql|db|api|apis|ui|framework|library)$/;

/** 0..1: наскільки запит схожий на назву скіла. Без синонімів — лише написання. */
function similarity(query, name) {
  const q = normalize(query);
  const n = normalize(name);
  if (q === n) return 1;

  const qc = compact(query);
  const nc = compact(name);
  if (qc === nc) return 0.97;
  if (qc.replace(TAIL_NOISE, '') === nc.replace(TAIL_NOISE, '')) return 0.95;

  // "TanStack Query / React Query" — це кілька написань того самого скіла
  const parts = name.split('/').map((p) => p.trim()).filter((p) => p.length > 2);
  if (parts.length > 1) {
    const best = Math.max(...parts.map((p) => similarity(query, p)));
    if (best > 0.9) return Math.min(best, 0.95);
  }

  const qTokens = q.split(' ').filter(Boolean);
  const nTokens = n.split(' ').filter(Boolean);
  const shared = qTokens.filter((t) => nTokens.includes(t));

  let score = 0;
  if (shared.length > 0) {
    const jaccard = shared.length / new Set([...qTokens, ...nTokens]).size;
    // ті самі слова в іншому порядку — це часто інший скіл:
    // "design system" ≠ "System Design", тож упевненість занижуємо
    const sameOrder = shared.every((t, i, arr) => i === 0
      || qTokens.indexOf(t) > qTokens.indexOf(arr[i - 1]) === nTokens.indexOf(t) > nTokens.indexOf(arr[i - 1]));
    score = Math.max(score, (0.55 + 0.4 * jaccard) * (sameOrder ? 1 : 0.85));
  }
  if (nc.includes(qc) || qc.includes(nc)) {
    score = Math.max(score, 0.55 + 0.35 * (Math.min(qc.length, nc.length) / Math.max(qc.length, nc.length)));
  }
  const dist = levenshtein(qc, nc);
  const lev = 1 - dist / Math.max(qc.length, nc.length, 1);
  if (lev >= 0.8) score = Math.max(score, 0.6 + 0.35 * lev);

  return Math.min(score, 0.96);
}

/** Топ кандидатів на термін, від найкращого. */
function candidates(query, skills, limit = 4) {
  return skills
    .map((s) => ({ ...s, score: similarity(query, s.name) }))
    .filter((s) => s.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit);
}

// ─────────────────────────────────────────── вердикти

const VERDICT = {
  core: 'use freely',
  support: 'plain in skills block, hedged in prose',
  tail: 'skills block only, last on its line; never in prose',
  weak: 'NEVER claim',
  unrated: 'NEVER claim (no rating yet)',
  missing: 'NOT IN BASE — treat as unknown, never claim',
  unsure: 'ambiguous — pick the right row yourself, then re-check',
};

function verdictFor(rating) {
  if (rating === null) return 'unrated';
  if (rating >= CORE_RATING) return 'core';
  if (rating >= MIN_RATING) return 'support';
  if (rating === TAIL_RATING) return 'tail';
  return 'weak';
}

function rate(terms, skills) {
  return terms.map((term) => {
    const found = candidates(term, skills, 5);
    const best = found[0];
    if (!best) return { term, match: null, rating: null, verdict: 'missing', alternatives: [] };

    const alternatives = found.slice(1).map((c) => ({ name: c.name, rating: c.rating }));
    if (best.score < CONFIDENT) {
      return {
        term,
        match: null,
        rating: null,
        verdict: 'unsure',
        alternatives: found.map((c) => ({ name: c.name, rating: c.rating })),
      };
    }
    return { term, match: best.name, rating: best.rating, verdict: verdictFor(best.rating), alternatives };
  });
}

// ─────────────────────────────────────────── перевірка блоку скілів

/**
 * Витягує елементи з чернетки блоку "Category: a, b, c (d)".
 * Довгі шматки — це речення, а не назви скілів, тож їх пропускаємо.
 * Слеш ділить елементи ("React / Vue") лише тоді, коли цілий шматок
 * не є відомим скілом — інакше "CI/CD" розсипалось би на "CI" і "CD".
 */
function parseDraft(text, isKnown) {
  const items = [];
  const seen = new Set();

  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const category = line.slice(0, colon).replace(/[*_`]/g, '').trim();
    let pos = 0;
    const add = (term) => {
      const clean = term.replace(/[*_`]/g, '').trim();
      if (clean === '' || clean.split(/\s+/).length > 5 || seen.has(clean)) return;
      seen.add(clean);
      items.push({ term: clean, category, pos: pos += 1 });
    };

    for (const chunk of line.slice(colon + 1).split(/[,;|]/)) {
      for (const piece of chunk.split(/[()]/)) {
        const term = piece.trim();
        if (term.includes('/') && !isKnown(term)) for (const part of term.split('/')) add(part);
        else add(term);
      }
    }
  }
  return items;
}

/**
 * Звіряє чернетку блоку з вимогами вакансії: що з обов'язкового забули,
 * що заборонене просочилось і чи не стоять слабкі скіли (оцінка 2) не в хвості рядка.
 */
function check(draftText, vacancyTerms, skills) {
  const resolve = (term) => {
    const best = candidates(term, skills, 1)[0];
    return best && best.score >= CONFIDENT ? best : null;
  };

  const draftRows = parseDraft(draftText, (term) => resolve(term) !== null)
    .map((item) => ({ ...item, hit: resolve(item.term) }));
  const covered = new Set(draftRows.filter((r) => r.hit).map((r) => r.hit.name));

  // вимоги вакансії: ≥3 обов'язкові, 2 — дозволені в хвості рядка
  const required = [];
  const optional = [];
  const askedFor = new Set();
  const unresolved = [];
  for (const term of vacancyTerms) {
    const hit = resolve(term);
    if (!hit) { unresolved.push(term); continue; }
    askedFor.add(hit.name);
    if (hit.rating === null) continue;
    if (hit.rating >= MIN_RATING) required.push(hit);
    else if (hit.rating === TAIL_RATING) optional.push(hit);
  }

  const absent = (list) => {
    const seen = new Set();
    return list.filter((s) => {
      if (covered.has(s.name) || seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
  };

  // у кожному рядку слабкий скіл має стояти після всіх сильних
  const lastStrongInLine = new Map();
  for (const r of draftRows) {
    if (r.hit && r.hit.rating !== null && r.hit.rating >= MIN_RATING) {
      lastStrongInLine.set(r.category, Math.max(lastStrongInLine.get(r.category) ?? 0, r.pos));
    }
  }
  const weakRows = draftRows.filter((r) => r.hit && r.hit.rating === TAIL_RATING);

  return {
    total: draftRows.length,
    requiredCount: new Set(required.map((s) => s.name)).size,
    missing: absent(required),
    optionalMissing: absent(optional),
    forbidden: draftRows
      .filter((r) => r.hit && (r.hit.rating === null || r.hit.rating < TAIL_RATING))
      .map((r) => ({ term: r.term, name: r.hit.name, rating: r.hit.rating, category: r.category })),
    weakNotRequired: weakRows
      .filter((r) => !askedFor.has(r.hit.name))
      .map((r) => ({ term: r.term, name: r.hit.name, category: r.category })),
    misplaced: weakRows
      .filter((r) => askedFor.has(r.hit.name) && r.pos < (lastStrongInLine.get(r.category) ?? 0))
      .map((r) => ({ term: r.term, category: r.category })),
    unknown: draftRows.filter((r) => !r.hit).map((r) => r.term),
    unresolvedVacancyTerms: unresolved,
  };
}

// ─────────────────────────────────────────── вивід

const ratingCell = (r) => (r === null ? '—' : String(r));

function renderRate(rows) {
  const out = ['| term from vacancy | skills.csv | rating | verdict |', '| --- | --- | --- | --- |'];
  for (const r of rows) {
    out.push(`| ${r.term} | ${r.match ?? '—'} | ${ratingCell(r.rating)} | ${VERDICT[r.verdict]} |`);
  }
  const notes = rows.filter((r) => r.alternatives.length > 0 && (r.verdict === 'unsure' || r.rating === null));
  if (notes.length) {
    out.push('', 'Кандидати для непевних термінів:');
    for (const r of notes) {
      out.push(`- ${r.term} → ${r.alternatives.map((a) => `${a.name} (${ratingCell(a.rating)})`).join(', ')}`);
    }
  }
  out.push('', `Правило: ${CORE_RATING}–5 вільно · ${MIN_RATING} у прозі з хеджем · ${TAIL_RATING} лише в хвості рядка блоку скілів`);
  out.push('і лише якщо цього просить вакансія · ≤1, без оцінки й "не в базі" — не писати ніде.');
  return `${out.join('\n')}\n`;
}

function renderCheck(r) {
  const out = [`Елементів у блоці: ${r.total} · вимог вакансії з оцінкою ≥${MIN_RATING}: ${r.requiredCount}`];

  out.push('', '## MISSING — вимоги вакансії з оцінкою ≥3, яких немає в блоці (додати обов’язково)');
  out.push(r.missing.length ? r.missing.map((s) => `- ${s.name} (${ratingCell(s.rating)})`).join('\n') : '_нічого не забуто_');

  out.push('', '## FORBIDDEN — у блоці є те, що оцінене ≤1 або не оцінене (прибрати)');
  out.push(r.forbidden.length ? r.forbidden.map((f) => `- ${f.term} → ${f.name} (${ratingCell(f.rating)}) у "${f.category}"`).join('\n') : '_чисто_');

  if (r.weakNotRequired.length) {
    out.push('', '## WEAK, НЕ З ВАКАНСІЇ — оцінка 2 без запиту вакансії (прибрати)');
    out.push(r.weakNotRequired.map((f) => `- ${f.term} → ${f.name} у "${f.category}"`).join('\n'));
  }
  if (r.misplaced.length) {
    out.push('', '## ПОРЯДОК — оцінка 2 стоїть не в кінці свого рядка (перенести в хвіст)');
    out.push(r.misplaced.map((f) => `- ${f.term} у "${f.category}"`).join('\n'));
  }
  if (r.optionalMissing.length) {
    out.push('', '## OPTIONAL — вимоги вакансії з оцінкою 2, яких немає в блоці');
    out.push('Можна додати в кінець відповідного рядка, щоб покрити ключове слово без акценту.');
    out.push(r.optionalMissing.map((s) => `- ${s.name} (${ratingCell(s.rating)})`).join('\n'));
  }

  if (r.unknown.length) {
    out.push('', '## UNKNOWN — не впізнано в базі');
    out.push('ATS-дублікати (TS, JS) і формулювання категорій — норма. Решту перевір сам.');
    out.push(r.unknown.map((t) => `- ${t}`).join('\n'));
  }
  if (r.unresolvedVacancyTerms.length) {
    out.push('', '## Терміни вакансії, не зіставлені з базою однозначно');
    out.push('Прожени через `rate`/`search` і виріши сам: або це інша назва відомого скіла,');
    out.push('або справжня прогалина, про яку треба сказати користувачу.');
    out.push(r.unresolvedVacancyTerms.map((t) => `- ${t}`).join('\n'));
  }
  return `${out.join('\n')}\n`;
}

function renderList(rows) {
  const out = ['| skill | rating |', '| --- | --- |'];
  for (const s of rows) out.push(`| ${s.name} | ${ratingCell(s.rating)} |`);
  out.push('', `${rows.length} скілів`);
  return `${out.join('\n')}\n`;
}

// ─────────────────────────────────────────── main

const USAGE = `Використання:
  node skills.mjs rate "React" "Next.js" "Rust"    оцінки для термінів, які ти вибрав із вакансії
  node skills.mjs search "state management"        як скіл названий у базі
  node skills.mjs list --min=4 --grep=test         перегляд бази
  node skills.mjs check draft.txt "React" "Kafka"  чернетка блоку скілів проти вимог вакансії
Прапорці: --json --csv=<шлях> --limit=<n> --min=<n> --max=<n> --grep=<текст>`;

function main(argv) {
  const args = argv.slice(2);
  const flags = new Map(args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v = 'true'] = a.slice(2).split('=');
    return [k, v];
  }));
  const positional = args.filter((a) => !a.startsWith('--'));
  const command = positional[0];
  const rest = positional.slice(1);

  if (!command || flags.has('help')) { console.log(USAGE); process.exit(command ? 0 : 2); }

  const skills = readSkills(flags.has('csv') ? resolve(process.cwd(), flags.get('csv')) : DEFAULT_CSV);
  const asJson = flags.has('json');
  const limit = Number(flags.get('limit') ?? 12);

  if (command === 'rate') {
    // терміни можна передати аргументами або по одному в рядку через stdin
    const terms = rest.length > 0 ? rest : readFileSync(0, 'utf8').split('\n').map((t) => t.trim()).filter(Boolean);
    if (terms.length === 0) { console.error(USAGE); process.exit(2); }
    const rows = rate(terms, skills);
    process.stdout.write(asJson ? `${JSON.stringify(rows, null, 2)}\n` : renderRate(rows));
    return;
  }

  if (command === 'check') {
    const [draftPath, ...vacancyTerms] = rest;
    if (!draftPath || vacancyTerms.length === 0) { console.error(USAGE); process.exit(2); }
    const draft = readFileSync(resolve(process.cwd(), draftPath), 'utf8');
    const report = check(draft, vacancyTerms, skills);
    process.stdout.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : renderCheck(report));
    const blocking = report.missing.length + report.forbidden.length
      + report.weakNotRequired.length + report.misplaced.length;
    process.exit(blocking > 0 ? 1 : 0);
  }

  if (command === 'search') {
    const query = rest.join(' ');
    if (!query) { console.error(USAGE); process.exit(2); }
    const found = candidates(query, skills, limit);
    const rows = found.length ? found : skills.filter((s) => normalize(s.name).includes(normalize(query))).slice(0, limit);
    process.stdout.write(asJson ? `${JSON.stringify(rows, null, 2)}\n` : renderList(rows));
    return;
  }

  if (command === 'list') {
    const min = flags.has('min') ? Number(flags.get('min')) : null;
    const max = flags.has('max') ? Number(flags.get('max')) : null;
    const grep = flags.get('grep');
    const rows = skills.filter((s) => {
      if (min !== null && (s.rating === null || s.rating < min)) return false;
      if (max !== null && (s.rating === null || s.rating > max)) return false;
      if (grep && !normalize(s.name).includes(normalize(grep))) return false;
      return true;
    });
    process.stdout.write(asJson ? `${JSON.stringify(rows, null, 2)}\n` : renderList(rows));
    return;
  }

  console.error(USAGE);
  process.exit(2);
}

main(process.argv);
