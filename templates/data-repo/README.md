# Особисті дані для career profile

Приватна половина career profile. Код і скіли живуть в окремому репозиторії; тут — лише те,
що стосується однієї людини.

| Файл | Що це |
| --- | --- |
| `skills.csv` | оцінки скілів 0–5 — джерело, з якого `resume-blocks` пише резюме під вакансію |
| `CV_Base.html` | базове резюме (експорт Google Docs) з плейсхолдерами `[Position placeholder]`, `[Summary placeholder]`, `[skills placeholder]` |
| `resume-config.json` | `resumeFileName` — ім'я файлу резюме, яке побачить рекрутер (без нього — `CV.pdf`) |
| `out/` | згенеровані резюме, одна папка на вакансію |

## Як підключити

Обидва репозиторії лежать поруч в одній робочій папці:

```text
<workspace>/
├── my-career-profile/        ← код
└── my-career-profile-data/   ← цей репозиторій
```

1. Скопіюй `templates/data-repo/` з репозиторію коду в `../my-career-profile-data` і зроби там `git init`.
2. Перейменуй `skills.example.csv` → `skills.csv`, `CV_Base.example.html` → `CV_Base.html` і
   `resume-config.example.json` → `resume-config.json` та заміни їх своїми. Приклади названі інакше, щоб агент, шукаючи файл за назвою, не взяв вигадану людину
   замість справжньої.
3. У корені репозиторію коду створи симлінки (вони в `.gitignore`):

```bash
ln -s ../my-career-profile-data/skills.csv skills.csv
ln -s ../my-career-profile-data/CV_Base.html CV_Base.html
ln -s ../my-career-profile-data/resume-config.json resume-config.json
ln -s ../my-career-profile-data/out out
```

Відкривай Claude Code у робочій папці, а не в репозиторії коду: тоді агент бачить обидва
репозиторії й не питає дозволу на кожне читання чи запис через симлінк.

## Правила

- Тільки приватний remote або жодного. Тут контакти, досвід і всі резюме, які пішли роботодавцям.
- Коду тут не буває — скрипти й скіли належать репозиторію коду.
- Класи `c7 c4`, `c0`, `c14` у `CV_Base.html` мають збігатися з константами в
  `.claude/skills/resume-render/render.mjs` репозиторію коду: Google Docs перенумеровує їх при
  кожному експорті.
