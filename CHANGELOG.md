# Changelog

Все значимые изменения проекта документируются в этом файле.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [1.3.0] - 2026-11-11

### Добавлено
- **Инструменты записи (9)**: `create_applicant`, `update_applicant`, `add_applicant_to_vacancy`, `change_applicant_status`, `add_applicant_comment`, `set_applicant_tags`, `create_vacancy`, `update_vacancy`, `set_vacancy_state`. Тела запросов сверены с OpenAPI-спекой. Удаление не реализовано намеренно.
- `HUNTFLOW_READ_ONLY=1` — не регистрировать инструменты записи.
- Аннотации инструментов (`readOnlyHint` / `destructiveHint` / `idempotentHint`), чтобы клиент отличал чтение от записи.

### Изменено
- `POST` повторяется только на `429`: повтор после `5xx`/обрыва сети мог создать дубль.
- Ответы без тела (`204`) обрабатываются корректно.
- Сетевая ошибка показывает настоящую причину (`err.cause`) и подсказку про `NODE_OPTIONS=--use-system-ca` при ошибке сертификата.

## [1.2.1] - 2026-11-11

### Исправлено
- **Сервер не стартовал через `npx`/симлинк bin** (Linux/macOS) и при другом регистре буквы диска (Windows): проверка «запущен напрямую» сравнивала пути без `realpath`, процесс молча завершался.
- **Текст ошибок API**: живой API отдаёт `{errors:[{type,title,detail}]}` — `detail`/`title` раньше терялись. Сообщение о 401 теперь содержит использованный хост и подсказку про `api.huntflow.ru` / `api.huntflow.ai`.
- **Токены из env очищаются** от пробелов, кавычек и префикса `Bearer ` (на искажённый токен API отвечает 404).
- **`list_vacancies`**: при заданном `state` больше не отправляется дефолтный `opened=true` (комбинация `state=CLOSED` + `opened=true` давала пустой список).

### Инфраструктура
- Скрипт `prepare` — сборка `dist/` при установке из git (`npx github:<user>/huntflow-mcp`).

## [1.2.0] - 2026-06-23

Крупное исправление корректности + расширение. Пути и параметры сверены с живой
OpenAPI-спекой `https://api.huntflow.ru/v2/openapi.json`.

### Исправлено (корректность API)
- **Обязательный заголовок `User-Agent`** — без него API отдавал `400 bad_user_agent` на каждый запрос. Теперь шлётся всегда (настраивается `HUNTFLOW_USER_AGENT`).
- **`list_stages`**: путь `/vacancy/statuses` → `/vacancies/statuses` (прежний возвращал 404).
- **`search_applicants`**: запрос перенесён на `/applicants/search` (у `/applicants` нет параметра `q` — поиск молча игнорировался). Добавлены фильтры `vacancy`/`status`/`tag`.
- **`get_applicant_resumes`**: больше не бьёт в несуществующий `/applicants/{id}/externals`; список резюме берётся из поля `external[]` объекта кандидата.
- **Пагинация**: во все списочные инструменты добавлен параметр `page`.
- **Ошибки инструментов** возвращаются как `{ isError: true }` (видны модели), а не как протокольные JSON-RPC-ошибки.
- **Скиллы** `skill-applicants` / `skill-vacancy-stats` теперь используют `list_vacancy_applicants` (раньше звали `search_applicants` без фильтра по вакансии — функция была сломана).
- Парсинг тела ошибок Huntflow (`{errors:[{type,value}]}` и OAuth-формы).
- Retry-политика: только `429/5xx`/таймаут/transient-сеть; backoff с jitter; учёт `Retry-After`.

### Добавлено
- **Авто-refresh токена** через `POST /token/refresh` при 401 с сохранением ротированной пары в файл состояния (`HUNTFLOW_TOKEN_FILE`), single-flight, fallback на перевыпущенную пару из env.
- Клиентский **rate limiter** 10 req/s (документированный лимит API).
- Новые инструменты: `list_vacancy_applicants`, `get_resume`, `list_coworkers`, `list_sources`, `list_rejection_reasons`, `list_divisions`, `list_tags` (7 → 14).
- **Курируемый вывод** списков + `structuredContent`/`outputSchema`; флаг `raw` для сырого ответа.
- **HTTP-hardening**: DNS-rebinding protection (`allowedHosts`), привязка к `127.0.0.1`, опциональный shared-secret (`HUNTFLOW_HTTP_SECRET`).

### Инфраструктура
- CI теперь запускает `typecheck`, `lint`, `format:check`, `build`, `test` на Node 18/20/22 (раньше — только `build`).
- Добавлены ESLint + Prettier, тесты клиента (retry/refresh/таймаут/токен) и интеграционный тест через in-memory MCP-транспорт.

## [1.1.x] - 2026-04

- Production-grade база: 7 инструментов, 2 скилла, stdio + Streamable HTTP, тесты, CI.

## [1.0.0]

- Первый релиз — 4 инструмента для HuntFlow ATS API.
