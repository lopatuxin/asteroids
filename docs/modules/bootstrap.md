# Модуль `bootstrap`

## Назначение
Точка входа приложения: HTML-страница и функция инициализации, которые собирают корневые объекты игры (canvas + 2D-контекст, `InputSystem`, `SceneManager`, `GameLoop`) и запускают игровой цикл со стартовой `MenuScene`. Без этого модуля проект физически не стартует — остальные подсистемы самодостаточны как классы, но кто-то должен создать их, связать между собой и подать первый кадр. Также здесь живёт минимальная конфигурация сборки (Vite, TypeScript, `package.json`), определяющая структуру исходников и итоговый артефакт.

## Ответственности
- Предоставить `index.html` с единственным `<canvas id="game">` и тегом `<script type="module" src="/src/main.ts">`, а также минимальный CSS (чёрный фон, центрирование канваса, отсутствие скроллбаров).
- В `src/main.ts` определить функцию `bootstrap()`, которая выполняет инициализацию в строго заданном порядке (см. «Ключевые потоки»).
- Получить DOM-узел канваса по `id="game"` и выставить `canvas.width` / `canvas.height` из `CANVAS.WIDTH` / `CANVAS.HEIGHT` модуля `config`.
- Получить `CanvasRenderingContext2D` и передать его в `GameLoop.onRender` через `SceneManager`.
- Создать и связать корневые синглтоны приложения: `InputSystem` (с `attach(window)`), `SceneManager`, `GameLoop`.
- Подложить в стек сцен стартовую `MenuScene`, передав ей зависимости (input, scene manager и всё, что нужно конкретной сцене).
- Запустить `GameLoop.start()` и оформить аккуратное завершение по `beforeunload` (`loop.stop()`, `input.detach()`).
- Владеть конфигурационными файлами сборки (`vite.config.ts`, `tsconfig.json`, `package.json`) и фиксировать файловую структуру `src/`.

### Не-ответственности
- Не содержит игровой логики: не апдейтит сущности, не рисует, не обрабатывает коллизии, не считает очки.
- Не владеет игровым состоянием (`World`, `Scoring`, `HighScoreStorage`) — всё это живёт внутри сцен.
- Не маппит клавиши и не интерпретирует события ввода — этим занят `InputSystem`.
- Не хранит ссылок на сцены кроме первой стартовой — дальше стек сцен управляется `SceneManager`.
- Не занимается рантайм-конфигурацией, feature-флагами, A/B-тестами — значения берёт из `config.ts`.
- Не регистрирует Service Worker, не инициализирует аналитику, не загружает внешние ассеты — их нет.

## Публичный интерфейс
Наружу модуль выставляет ровно одну точку входа и набор конфигурационных файлов проекта.

- `bootstrap(): void` — единственная экспортируемая функция из `src/main.ts`. Вызывается один раз при загрузке модуля; идемпотентна в том смысле, что повторный вызов не предполагается (если сделать — получится второй `GameLoop`, что явно ошибка вызывающей стороны).
- `index.html` — статическая страница с `<canvas id="game">` и подключением `src/main.ts` как ES-модуля. Не имеет программного API, но фиксирует контракт: DOM содержит canvas с конкретным id к моменту исполнения скрипта.
- `vite.config.ts` — конфигурация сборщика (минимальная: `base` для деплоя на GitHub Pages, всё остальное — дефолты Vite).
- `tsconfig.json` — конфигурация TypeScript (strict, ES2022, `moduleResolution: bundler`, `lib: ["DOM", "ES2022"]`).
- `package.json` — скрипты `dev` / `build` / `preview` и dev-зависимости (`typescript`, `vite`). Runtime-зависимостей нет.

## Модель данных
Модуль не владеет персистентными данными и не определяет сущностей. В рантайме внутри `bootstrap()` существует ровно одна «модель» — локальные ссылки на корневые объекты приложения, живущие в замыкании функции (и через обработчик `beforeunload`):

| Имя | Тип | Назначение |
|---|---|---|
| `canvas` | `HTMLCanvasElement` | DOM-узел игрового поля, получен по `id="game"` |
| `ctx` | `CanvasRenderingContext2D` | 2D-контекст канваса, передаётся в `draw` |
| `input` | `InputSystem` | Единственный инстанс системы ввода, приаттачен к `window` |
| `sceneManager` | `SceneManager` | Стек сцен, активная сцена сверху |
| `loop` | `GameLoop` | Цикл `requestAnimationFrame` с аккумулятором времени |

Все ссылки — приватны для `bootstrap()`. Наружу модуль ничего из этого не публикует, чтобы исключить доступ к синглтонам в обход сцен.

Из конфигурационных файлов:
- `package.json` — стандартная структура npm-манифеста; значимые поля: `type: "module"`, `scripts: { dev, build, preview }`, `devDependencies: { typescript, vite }`.
- `tsconfig.json` — `{ compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, lib: ["DOM", "ES2022"], noEmit: true, jsx: undefined } , include: ["src"] }`.

## Ключевые потоки

1. **Холодный старт приложения.** Браузер загружает `index.html`, парсит его и встречает `<script type="module" src="/src/main.ts">`. Vite (в dev) или собранный бандл (в prod) подтягивает модуль; на верхнем уровне `main.ts` вызывается `bootstrap()`. Функция находит `document.getElementById('game')` как `HTMLCanvasElement`, если не находит — кидает осмысленную ошибку (страница без канваса — баг вёрстки). Далее выставляет `canvas.width = CANVAS.WIDTH`, `canvas.height = CANVAS.HEIGHT`, получает `ctx = canvas.getContext('2d')` и проверяет, что контекст получен. Создаёт `input = new InputSystem()`, вызывает `input.attach(window)` — теперь клавиатурные события слушаются. Создаёт `sceneManager = new SceneManager()`. Создаёт `loop = new GameLoop({ onUpdate: (dt) => { sceneManager.update(dt, input); input.clearFrame(); }, onRender: () => sceneManager.draw(ctx) })`. Вызывает `sceneManager.push(new MenuScene({ sceneManager, input, ctx }))`. Вызывает `loop.start()` — с этого момента начинают приходить тики `requestAnimationFrame`.

2. **Тик цикла (связка, за которую отвечает bootstrap).** `GameLoop` внутри себя считает аккумулятор времени; когда накопилось ≥ `SIMULATION.STEP`, вызывает `onUpdate(dt)`. Коллбек из `bootstrap` делегирует `sceneManager.update(dt, input)`, после чего дергает `input.clearFrame()` — это критично для edge-triggered состояний (только-что нажатых actions), иначе `Fire` «застревал» бы на несколько тиков подряд. Рендер вызывается один раз за кадр: `onRender` → `sceneManager.draw(ctx)`. Сам модуль в этом потоке — только роутер коллбеков, никакой логики.

3. **Завершение вкладки.** На `window` вешается обработчик `beforeunload`, который вызывает `loop.stop()` и `input.detach()`. Строго говоря, браузер всё равно выгрузит страницу и освободит ресурсы, но явная остановка — это гигиена: прекращает `requestAnimationFrame`-пинг и снимает слушатели с `window` до того, как DOM будет разрушен. Полезно и в dev-сервере с HMR — при горячей перезагрузке модуля.

4. **Сборка production-артефакта.** Разработчик запускает `npm run build`, Vite читает `vite.config.ts` (берёт `base` для GitHub Pages), транспилирует TS, минифицирует, раскладывает `index.html`, один JS-бандл и один CSS в `dist/`. Папка заливается на статический хостинг; на проде страница работает ровно тем же путём, что и в dev, только без HMR.

## Зависимости
Модуль по определению замыкает на себя весь граф зависимостей проекта — ему нужно создать корневые объекты. Явно импортируемые модули:

- `./config` — `CANVAS` (размеры канваса), косвенно транзитивно используется всеми подсистемами.
- `./systems/input` — класс `InputSystem` и метод `attach(window)` / `detach()` / `clearFrame()`.
- `./scenes/scene-manager` — класс `SceneManager` с `push` / `update(dt, input)` / `draw(ctx)`.
- `./scenes/menu` — класс `MenuScene`, создаётся как первая сцена в стеке.
- `./loop/game-loop` — класс `GameLoop` с конструктором, принимающим `{ onUpdate, onRender }`, и методами `start` / `stop`.

Внешние зависимости рантайма — только браузерные API: `document`, `window`, `HTMLCanvasElement`, `CanvasRenderingContext2D`, `requestAnimationFrame` (используется внутри `GameLoop`, не здесь напрямую). Dev-зависимости сборки — `vite` и `typescript`.

Структура директорий проекта, за которую отвечает bootstrap:

```
index.html
vite.config.ts
tsconfig.json
package.json
src/
  main.ts
  config.ts
  math/
    vec2.ts
  entities/
    entity.ts
    ship.ts
    asteroid.ts
    bullet.ts
    ufo.ts
    particle.ts
  systems/
    input.ts
    collision.ts
    wave.ts
    scoring.ts
    highscore.ts
  scenes/
    scene-manager.ts
    menu.ts
    game-scene.ts
    pause.ts
    gameover.ts
  render/
    renderer.ts
  loop/
    game-loop.ts
```

## Обработка ошибок
Bootstrap работает в «узком горлышке» жизненного цикла — большая часть ошибок здесь означает невалидную сборку/разметку и должна падать громко, а не деградировать молча.

- **Невалидный ввод (DOM).** `document.getElementById('game')` вернул `null` или это не `HTMLCanvasElement` — `bootstrap()` кидает `Error('Canvas #game not found in document')`. То же для `canvas.getContext('2d') === null` (теоретически возможно на экзотических браузерах без 2D) — `Error('Canvas 2D context unavailable')`. Эти ошибки не ловим, они всплывают в консоль и прекращают инициализацию — без канваса играть невозможно.
- **Сбой в подсистеме при инициализации.** Если конструктор `InputSystem` / `SceneManager` / `GameLoop` бросил — `bootstrap()` не ловит, ошибка всплывает в консоль. Игра не стартует, что корректно: частично живое состояние хуже, чем отсутствующее.
- **Сбой внутри тика цикла.** Ответственность не bootstrap — её несёт `GameLoop` (верхнеуровневый `try/catch` вокруг вызова `onUpdate` / `onRender`, см. раздел «Обработка ошибок» в архитектуре). Bootstrap здесь только предоставляет сцены, которые цикл может вернуть в безопасное состояние (например, `sceneManager.replace(new MenuScene(...))`).
- **Частичный успех.** Не применим: либо `bootstrap()` завершилась полностью и все корневые объекты созданы, либо выброшено исключение и страница остаётся «пустой».
- **Повторный вызов `bootstrap()`.** Не предусмотрен; защитных проверок нет (модуль исполняется один раз при загрузке). Если вызвать вручную — получится второй `GameLoop` и двойная обработка ввода; это явный баг вызывающей стороны.

## Стек и библиотеки
- **TypeScript (строгий режим)** — язык задан архитектурой; здесь фиксируется `strict: true`, `target/module: ES2022`, `moduleResolution: bundler`, `lib: ["DOM", "ES2022"]`. Bundler-resolution нужен, чтобы корректно работать с Vite (он обслуживает импорты сам).
- **Vite** — сборщик и dev-сервер. Выбран архитектурой; в этом модуле — минимальный `vite.config.ts`: только `base` для корректных путей при деплое на GitHub Pages (`/asteroids/`) и, по желанию, `root` по умолчанию. Никаких плагинов: для одного TS-файла и одного HTML плагины избыточны.
- **Никаких runtime-зависимостей.** Ни React, ни какой-либо UI-библиотеки — всё рендерится на Canvas 2D. `package.json` содержит только `devDependencies: typescript + vite` и скрипты `dev / build / preview`.
- **CSS — инлайн в `<style>` в `index.html`**, около 10 строк: `body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }` и `canvas { display: block; }`. Отдельный `.css`-файл на это не выделяем — слишком мало.

## Конфигурация
Модуль сам по себе — инфраструктурный, его «конфигурация» — это конфигурационные файлы проекта и константы, которые он читает.

| Имя | Назначение | Значение по умолчанию |
|---|---|---|
| `CANVAS.WIDTH` (из `config.ts`) | Ширина канваса, выставляется в `bootstrap()` | `960` |
| `CANVAS.HEIGHT` (из `config.ts`) | Высота канваса | `720` |
| `vite.config.ts: base` | Базовый URL для статических путей при продакшен-сборке | `'/asteroids/'` (под GitHub Pages; в dev игнорируется) |
| `tsconfig.json: compilerOptions.strict` | Строгий режим TS | `true` |
| `tsconfig.json: compilerOptions.target` | Целевая версия JS | `ES2022` |
| `tsconfig.json: compilerOptions.module` | Модульная система | `ES2022` |
| `tsconfig.json: compilerOptions.moduleResolution` | Разрешение модулей | `bundler` |
| `tsconfig.json: compilerOptions.lib` | Доступные типы окружения | `["DOM", "ES2022"]` |
| `package.json: scripts.dev` | Запуск dev-сервера | `vite` |
| `package.json: scripts.build` | Продакшен-сборка | `tsc --noEmit && vite build` |
| `package.json: scripts.preview` | Превью собранного артефакта | `vite preview` |

Environment-переменных, секретов и `.env`-файлов нет. Все значения известны на этапе сборки.

## Открытые вопросы
- Нужна ли защита от двойного вызова `bootstrap()` (например, в случае каких-то dev-сценариев HMR), или достаточно соглашения «вызывать ровно один раз из `main.ts`». Пока — второй вариант.
- Точное значение `base` в `vite.config.ts` зависит от того, на какой хостинг и под каким путём деплоимся; для локального запуска и preview подходит `'./'` (относительные пути), для GitHub Pages — `'/asteroids/'`. Решение отложено до момента реального деплоя.
- Стоит ли завести CSS-файл отдельно (`src/styles.css`) вместо инлайн-стилей в `index.html` — пока объём стилей не оправдывает отдельный файл, но при добавлении оверлеев (dev HUD, game over) может пересмотреться.
- Ловить ли ошибки `bootstrap()` верхнеуровневым `try/catch` и показывать пользователю «страницу ошибки» вместо белого экрана — для учебного проекта кажется избыточным, в консоли ошибка и так видна; открыто для будущих итераций.
- Нужен ли `DOMContentLoaded`-guard перед чтением canvas или достаточно того, что `<script type="module">` исполняется после парсинга DOM (так и есть по спецификации defer-семантики модулей). Текущее решение — без guard, полагаемся на семантику модульных скриптов.
