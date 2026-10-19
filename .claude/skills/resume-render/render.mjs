#!/usr/bin/env node
/**
 * Складає готове резюме: копія CV_Base.html, у якій плейсхолдери замінені
 * на блоки Title / Summary / Skills. Нічого не вирішує і не редагує текст —
 * лише вставляє те, що йому дали, і слідкує, щоб жоден плейсхолдер не лишився.
 *
 *   node render.mjs blocks.md                     — → out/<Посада>/<resumeFileName>.html
 *   node render.mjs blocks.md --company="Acme"    — компанія в імені папки вакансії
 *   node render.mjs blocks.md --out=cv.html       — свій шлях (- = у stdout)
 *   node render.mjs placeholders                  — які плейсхолдери є в базі
 *
 * Прапорці: --base=<шлях до базового html>, --force (перезаписати наявний файл)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const DEFAULT_BASE = resolve(ROOT, 'CV_Base.html');
const DEFAULT_OUT_DIR = resolve(ROOT, 'out');

/** Плейсхолдери базового резюме. Ключ — секція блоків, значення — текст у дужках. */
const PLACEHOLDERS = {
  title: '[Position placeholder]',
  summary: '[Summary placeholder]',
  skills: '[skills placeholder]',
};

/** Класи Google Docs у базі: c7 c4 — жирний 10.5pt, c0 — звичайний, c14 — абзац рядка скілів.
 *  Google Docs перенумеровує їх при кожному повторному експорті — після заміни
 *  CV_Base.html звіряй ці три значення з новим CSS. */
const BOLD = 'c7 c4';
const PLAIN = 'c0';
const LINE = 'c14';

// ─────────────────────────────────────────── розбір блоків

const SECTIONS = ['title', 'summary', 'skills'];
/** "**Title:** ...", "Title: ...", "## Skills" — усе це початок секції. */
const HEADER = new RegExp(`^\\s*#*\\s*[*_]*\\s*(${SECTIONS.join('|')})\\s*[*_]*\\s*:?\\s*(.*)$`, 'i');

const stripMd = (s) => s.replace(/[*_`]/g, '').trim();

/**
 * Читає вивід скіла resume-blocks як є:
 *
 *   **Title:** Senior Frontend Developer
 *   **Summary:** ...речення...
 *   **Skills:**
 *   Frontend: React, Next.js, TypeScript
 *   Backend & Data: Node.js (NestJS), GraphQL
 *
 * Усе, що йде після блоку скілів і не схоже на рядок "Категорія: елементи",
 * вважається коментарем агента й ігнорується.
 */
function parseBlocks(text) {
  const found = { title: [], summary: [], skills: [] };
  let current = null;

  for (const raw of text.split(/\r?\n/)) {
    const header = raw.match(HEADER);
    if (header) {
      current = header[1].toLowerCase();
      const inline = stripMd(header[2]);
      if (inline) found[current].push(inline);
      continue;
    }
    if (!current) continue;

    const line = stripMd(raw);
    if (line === '') {
      // порожній рядок закриває секцію; у скілах — лише коли рядки вже пішли,
      // бо між "**Skills:**" і першою категорією порожній рядок цілком нормальний
      if (current !== 'skills' || found.skills.length > 0) current = null;
      continue;
    }
    if (current === 'skills' && !line.includes(':')) {
      current = null; // пішла проза після блоку — далі вже не наша справа
      continue;
    }
    found[current].push(line);
  }

  const skills = found.skills.map((line) => {
    const colon = line.indexOf(':');
    return { category: line.slice(0, colon).trim(), items: line.slice(colon + 1).trim() };
  }).filter((s) => s.category !== '' && s.items !== '');

  return {
    title: found.title.join(' ').trim(),
    summary: found.summary.join(' ').replace(/\s+/g, ' ').trim(),
    skills,
  };
}

function validate(blocks) {
  const problems = [];
  if (!blocks.title) problems.push('немає секції Title');
  if (!blocks.summary) problems.push('немає секції Summary');
  if (blocks.skills.length === 0) problems.push('немає жодного рядка "Категорія: елементи" в Skills');
  if (blocks.title.includes('\n') || blocks.title.length > 80) problems.push('Title має бути одним коротким рядком');
  return problems;
}

// ─────────────────────────────────────────── вставка в html

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Рядки блоку скілів у тій самій розмітці, що й сусідні рядки бази. */
function renderSkills(skills) {
  return skills
    .map(({ category, items }) => `<p class="${LINE}"><span class="${BOLD}">${escapeHtml(category)}</span>`
      + `<span class="${PLAIN}">: ${escapeHtml(items)}</span></p>`)
    .join('');
}

/** Абзац, усередині якого сидить плейсхолдер (щоб замінити рядок цілком, а не текст у ньому). */
function paragraphAround(html, index) {
  const start = html.lastIndexOf('<p', index);
  const end = html.indexOf('</p>', index);
  if (start === -1 || end === -1) return null;
  return { start, end: end + '</p>'.length };
}

function fill(base, blocks) {
  let html = base;

  for (const key of ['title', 'summary']) {
    const token = PLACEHOLDERS[key];
    if (!html.includes(token)) throw new Error(`у базі немає плейсхолдера ${token}`);
    html = html.replace(token, escapeHtml(blocks[key]));
  }

  const at = html.indexOf(PLACEHOLDERS.skills);
  if (at === -1) throw new Error(`у базі немає плейсхолдера ${PLACEHOLDERS.skills}`);
  const paragraph = paragraphAround(html, at);
  if (!paragraph) throw new Error(`плейсхолдер ${PLACEHOLDERS.skills} не всередині <p>`);
  html = html.slice(0, paragraph.start) + renderSkills(blocks.skills) + html.slice(paragraph.end);

  const left = html.match(/\[[^\]]*placeholder[^\]]*\]/gi);
  if (left) throw new Error(`у результаті лишились плейсхолдери: ${[...new Set(left)].join(', ')}`);

  return html;
}

// ─────────────────────────────────────────── ім'я файлу

const slug = (s) => s
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 60);

/**
 * Файл завжди називається однаково — це те, що побачить рекрутер у себе в завантаженнях.
 * "!" на початку тримає його вгорі списку у Finder.
 */
const CONFIG_PATH = resolve(ROOT, 'resume-config.json');
const DEFAULT_CV_NAME = 'CV';

function readCvName() {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CV_NAME;
  const { resumeFileName } = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return resumeFileName ? resumeFileName.replace(/\.pdf$/i, '') : DEFAULT_CV_NAME;
}

const CV_NAME = readCvName();

/** out/<Компанія>-<Посада>/<resumeFileName>.html — вакансія в папці, не в імені файлу. */
function outputPath(blocks, flags) {
  if (flags.has('out')) {
    const value = flags.get('out');
    return value === '-' ? '-' : resolve(process.cwd(), value);
  }
  const company = flags.get('company');
  const folder = [company && slug(company), slug(blocks.title)].filter(Boolean).join('-');
  return resolve(DEFAULT_OUT_DIR, folder, `${CV_NAME}.html`);
}

// ─────────────────────────────────────────── main

const USAGE = `Використання:
  node render.mjs blocks.md                    блоки з файлу (або "-" / stdin)
  node render.mjs blocks.md --company="Acme"   → out/Acme-<Посада>/${CV_NAME}.html
  node render.mjs blocks.md --out=cv.html      свій шлях; --out=- друкує html у stdout
  node render.mjs placeholders                 показати плейсхолдери базового резюме
Прапорці: --base=<шлях> --force

Формат файлу блоків — вивід скіла resume-blocks як є:
  **Title:** Senior Frontend Developer
  **Summary:** ...
  **Skills:**
  Frontend: React, Next.js, TypeScript`;

function main(argv) {
  const args = argv.slice(2);
  const flags = new Map(args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v = 'true'] = a.slice(2).split('=');
    return [k, v];
  }));
  const positional = args.filter((a) => !a.startsWith('--'));

  if (flags.has('help')) { console.log(USAGE); return; }

  const basePath = flags.has('base') ? resolve(process.cwd(), flags.get('base')) : DEFAULT_BASE;
  const base = readFileSync(basePath, 'utf8');

  if (positional[0] === 'placeholders') {
    const found = base.match(/\[[^\]]*placeholder[^\]]*\]/gi) ?? [];
    const known = new Set(Object.values(PLACEHOLDERS));
    console.log(`${relative(ROOT, basePath)}:`);
    for (const p of found) console.log(`  ${p}${known.has(p) ? '' : '  ← скрипт його не заповнює'}`);
    for (const [key, token] of Object.entries(PLACEHOLDERS)) {
      if (!found.includes(token)) console.log(`  ВІДСУТНІЙ ${token} (секція ${key})`);
    }
    return;
  }

  const source = positional[0] && positional[0] !== '-' ? resolve(process.cwd(), positional[0]) : 0;
  const text = readFileSync(source, 'utf8');
  const blocks = parseBlocks(text);

  const problems = validate(blocks);
  if (problems.length) {
    console.error(`Блоки прочитані неповністю:\n${problems.map((p) => `- ${p}`).join('\n')}\n\n${USAGE}`);
    process.exit(2);
  }

  const html = fill(base, blocks);
  const target = outputPath(blocks, flags);

  if (target === '-') { process.stdout.write(html); return; }
  if (existsSync(target) && !flags.has('force')) {
    console.error(`${relative(ROOT, target)} вже існує — додай --force, щоб перезаписати`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');

  console.log(`${relative(ROOT, target)}`);
  console.log(`  Title:   ${blocks.title}`);
  console.log(`  Summary: ${blocks.summary.split(' ').length} слів`);
  console.log(`  Skills:  ${blocks.skills.length} рядків, ${blocks.skills.reduce((n, s) => n + s.items.split(',').length, 0)} елементів`);
}

main(process.argv);
