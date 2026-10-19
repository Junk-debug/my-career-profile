#!/usr/bin/env node
/**
 * Assembles a finished resume: a copy of CV_Base.html with its placeholders replaced
 * by the Title / Summary / Skills blocks. It decides nothing and edits no text —
 * it only inserts what it is given and makes sure no placeholder is left.
 *
 *   node render.mjs blocks.md                     — → out/<Position>/<resumeFileName>.html
 *   node render.mjs blocks.md --company="Acme"    — company in the vacancy folder name
 *   node render.mjs blocks.md --out=cv.html       — custom path (- = stdout)
 *   node render.mjs placeholders                  — which placeholders the base has
 *
 * Flags: --base=<path to the base html>, --force (overwrite an existing file)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const DEFAULT_BASE = resolve(ROOT, 'CV_Base.html');
const DEFAULT_OUT_DIR = resolve(ROOT, 'out');

/** Placeholders of the base resume. Key — block section, value — the bracketed text. */
const PLACEHOLDERS = {
  title: '[Position placeholder]',
  summary: '[Summary placeholder]',
  skills: '[skills placeholder]',
};

/** Google Docs classes in the base: c7 c4 — bold 10.5pt, c0 — regular, c14 — skills line paragraph.
 *  Google Docs renumbers them on every re-export — after replacing
 *  CV_Base.html, check these three values against the new CSS. */
const BOLD = 'c7 c4';
const PLAIN = 'c0';
const LINE = 'c14';

// ─────────────────────────────────────────── parsing blocks

const SECTIONS = ['title', 'summary', 'skills'];
/** "**Title:** ...", "Title: ...", "## Skills" — each of these starts a section. */
const HEADER = new RegExp(`^\\s*#*\\s*[*_]*\\s*(${SECTIONS.join('|')})\\s*[*_]*\\s*:?\\s*(.*)$`, 'i');

const stripMd = (s) => s.replace(/[*_`]/g, '').trim();

/**
 * Reads the output of the resume-blocks skill as is:
 *
 *   **Title:** Senior Frontend Developer
 *   **Summary:** ...sentences...
 *   **Skills:**
 *   Frontend: React, Next.js, TypeScript
 *   Backend & Data: Node.js (NestJS), GraphQL
 *
 * Anything after the skills block that does not look like a "Category: items" line
 * is treated as the agent's commentary and ignored.
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
      // an empty line closes a section; in skills — only once lines have started,
      // since an empty line between "**Skills:**" and the first category is perfectly normal
      if (current !== 'skills' || found.skills.length > 0) current = null;
      continue;
    }
    if (current === 'skills' && !line.includes(':')) {
      current = null; // prose after the block — not ours to parse
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
  if (!blocks.title) problems.push('no Title section');
  if (!blocks.summary) problems.push('no Summary section');
  if (blocks.skills.length === 0) problems.push('no "Category: items" line in Skills');
  if (blocks.title.includes('\n') || blocks.title.length > 80) problems.push('Title must be one short line');
  return problems;
}

// ─────────────────────────────────────────── inserting into html

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Skills block lines in the same markup as the neighboring lines of the base. */
function renderSkills(skills) {
  return skills
    .map(({ category, items }) => `<p class="${LINE}"><span class="${BOLD}">${escapeHtml(category)}</span>`
      + `<span class="${PLAIN}">: ${escapeHtml(items)}</span></p>`)
    .join('');
}

/** The paragraph the placeholder sits in (to replace the whole line, not just its text). */
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
    if (!html.includes(token)) throw new Error(`the base has no placeholder ${token}`);
    html = html.replace(token, escapeHtml(blocks[key]));
  }

  const at = html.indexOf(PLACEHOLDERS.skills);
  if (at === -1) throw new Error(`the base has no placeholder ${PLACEHOLDERS.skills}`);
  const paragraph = paragraphAround(html, at);
  if (!paragraph) throw new Error(`placeholder ${PLACEHOLDERS.skills} is not inside a <p>`);
  html = html.slice(0, paragraph.start) + renderSkills(blocks.skills) + html.slice(paragraph.end);

  const left = html.match(/\[[^\]]*placeholder[^\]]*\]/gi);
  if (left) throw new Error(`placeholders left in the result: ${[...new Set(left)].join(', ')}`);

  return html;
}

// ─────────────────────────────────────────── file name

const slug = (s) => s
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 60);

/**
 * The file always has the same name — it is what a recruiter sees in their downloads.
 * A leading "!" keeps it at the top of a Finder listing.
 */
const CONFIG_PATH = resolve(ROOT, 'resume-config.json');
const DEFAULT_CV_NAME = 'CV';

function readCvName() {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CV_NAME;
  const { resumeFileName } = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return resumeFileName ? resumeFileName.replace(/\.pdf$/i, '') : DEFAULT_CV_NAME;
}

const CV_NAME = readCvName();

/** out/<Company>-<Position>/<resumeFileName>.html — the vacancy goes in the folder, not the file name. */
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

const USAGE = `Usage:
  node render.mjs blocks.md                    blocks from a file (or "-" / stdin)
  node render.mjs blocks.md --company="Acme"   → out/Acme-<Position>/${CV_NAME}.html
  node render.mjs blocks.md --out=cv.html      custom path; --out=- prints the html to stdout
  node render.mjs placeholders                 show the placeholders of the base resume
Flags: --base=<path> --force

Blocks file format — the resume-blocks skill output as is:
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
    for (const p of found) console.log(`  ${p}${known.has(p) ? '' : '  ← the script does not fill it'}`);
    for (const [key, token] of Object.entries(PLACEHOLDERS)) {
      if (!found.includes(token)) console.log(`  MISSING ${token} (section ${key})`);
    }
    return;
  }

  const source = positional[0] && positional[0] !== '-' ? resolve(process.cwd(), positional[0]) : 0;
  const text = readFileSync(source, 'utf8');
  const blocks = parseBlocks(text);

  const problems = validate(blocks);
  if (problems.length) {
    console.error(`Blocks were read incompletely:\n${problems.map((p) => `- ${p}`).join('\n')}\n\n${USAGE}`);
    process.exit(2);
  }

  const html = fill(base, blocks);
  const target = outputPath(blocks, flags);

  if (target === '-') { process.stdout.write(html); return; }
  if (existsSync(target) && !flags.has('force')) {
    console.error(`${relative(ROOT, target)} already exists — add --force to overwrite`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');

  console.log(`${relative(ROOT, target)}`);
  console.log(`  Title:   ${blocks.title}`);
  console.log(`  Summary: ${blocks.summary.split(' ').length} words`);
  console.log(`  Skills:  ${blocks.skills.length} lines, ${blocks.skills.reduce((n, s) => n + s.items.split(',').length, 0)} items`);
}

main(process.argv);
