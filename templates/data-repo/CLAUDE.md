# career profile — мої дані

Приватний репозиторій даних для репозиторію коду career profile (`../my-career-profile`).
Скіли `resume-blocks`, `resume-render`, `resume-pdf`, `organize-by-status` живуть там і
читають ці файли через симлінки в корені репозиторію коду.

## Правила

- **Ніколи не пушити в публічний remote.** Лише приватний.
- Коду тут немає й не буде: скрипти та скіли належать репозиторію коду.
- `skills.csv` і `CV_Base.html` редагує тільки користувач. Агент їх лише читає.
- `out/` наповнюють `resume-render` і `resume-pdf`; `organize-by-status` розкладає його
  за статусами.
