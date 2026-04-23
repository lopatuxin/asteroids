# Модуль — GameScene (World)

## Назначение
`GameScene` — центральная игровая сцена, реализующая контракт `Scene` и одновременно выступающая агрегатом `World` из архитектуры: она владеет всеми живыми сущностями текущей партии (корабль, астероиды, пули, НЛО, частицы) и координирует их жизненный цикл в одном тике. Без неё ни одна игровая механика не запускается: именно тут склеиваются ввод, физика, коллизии, волны, очки и переход в `GameOverScene`. Все остальные игровые модули (`Ship`, `Asteroid`, `CollisionSystem`, `WaveManager`, `Scoring`, `HighScoreStorage`) по отдельности ничего не делают — их связывает именно `GameScene`.

## Ответственности
- Хранит плоские списки сущностей партии: `ship`, `asteroids`, `bullets`, `ufos`, `particles`.
- Держит сателлитные объекты — `Scoring` (очки, жизни, номер волны) и `WaveManager` (прогрессия волн и спавн НЛО).
- Получает ссылку на `HighScoreStorage` и использует её только в момент game over (для передачи финального счёта в `GameOverScene`).
- Реализует интерфейс `Scene`: `enter() / exit() / update(dt, input) / draw(ctx) / handleInput(action)`.
- На каждом тике применяет ввод игрока к кораблю, обновляет все сущности, запускает `CollisionSystem.detect`, резолвит полученные события (урон, сплит, частицы, начисление очков, потерю жизни).
- Фильтрует списки сущностей по флагу `alive` — освобождает память от мёртвых объектов в конце тика.
- Отслеживает условие очистки волны и просит `WaveManager` запустить следующую.
- Спрашивает `WaveManager.maybeSpawnUfo` и добавляет возвращённый `Ufo` в список.
- Управляет респавном корабля: ведёт `respawnTimer`, при нуле возвращает корабль в центр с неуязвимостью; если жизней не осталось — переходит в `GameOverScene`.
- Рисует мир и HUD: счёт, число жизней (силуэтами кораблей), текущую волну.
- Ставит игру на паузу через `SceneManager.push(PauseScene)` по действию `Pause`.

### Не-ответственности
- Не реализует физику движения сущностей — это делают сами `Ship/Asteroid/Bullet/Ufo/Particle` в своих `update(dt)`.
- Не детектирует коллизии самостоятельно — обращается к `CollisionSystem.detect(this)`.
- Не решает, сколько астероидов на какой волне и когда появляется НЛО — это `WaveManager`.
- Не хранит биндинги клавиатуры и не читает `keydown` напрямую — только через `InputSystem`.
- Не отвечает за рендер-примитивы — использует утилиты `Renderer` (`clearScreen`, `withWrap`, `drawText`).
- Не пишет в `localStorage` — передаёт финальный счёт в `GameOverScene`, которая уже работает с `HighScoreStorage`.
- Не рисует меню, паузу, экран game over — это отдельные сцены.
- Не владеет игровым циклом — её `update/draw` вызывает `SceneManager`, которого двигает `GameLoop`.

## Публичный интерфейс
Класс `GameScene implements Scene`:

- `constructor(deps: { input: InputSystem, scoring: Scoring, waveManager: WaveManager, highScores: HighScoreStorage, sceneManager: SceneManager, canvasSize: {w:number,h:number} })` — все зависимости инжектятся снаружи (удобно для тестов и пересоздания сцены).
- `enter(): void` — инициализация партии: сбрасывает `Scoring`, спавнит корабль в центре с окном неуязвимости, `waveManager.startWave(1)` → заполняет `asteroids`, обнуляет остальные списки.
- `exit(): void` — освобождает ссылки на сущности (массивы очищаются), снимает таймеры.
- `update(dt: number, input: InputSystem): void` — полный тик симуляции (подробно — в разделе «Ключевые потоки»).
- `draw(ctx: CanvasRenderingContext2D): void` — отрисовка мира и HUD.
- `handleInput(action: Action): void` — зарезервировано для дискретных действий (например, `Pause`), если `SceneManager` прокидывает их напрямую; основное чтение ввода идёт через `input` внутри `update`.

Внутренние (не публичные снаружи) методы, используемые в тике:

- `private applyInputToShip(input: InputSystem): void`.
- `private updateEntities(dt: number): void`.
- `private resolveCollisions(events: CollisionEvent[]): void`.
- `private compactEntities(): void` — фильтрация по `alive`.
- `private checkWaveCleared(): void`.
- `private tickRespawn(dt: number): void`.
- `private spawnExplosion(at: Vec2, intensity: number): void`.
- `private drawHud(ctx): void`.

## Модель данных
Поля экземпляра `GameScene`:

| Поле | Тип | Назначение |
|---|---|---|
| `ship` | `Ship \| null` | Текущий корабль игрока; `null` на время между смертью и респауном. |
| `asteroids` | `Asteroid[]` | Активные астероиды всех размеров. |
| `bullets` | `Bullet[]` | Все пули в воздухе — и игрока, и НЛО; различаются по `bullet.source`. |
| `ufos` | `Ufo[]` | Активные НЛО (в MVP — 0 или 1 одновременно, но массив по единообразию). |
| `particles` | `Particle[]` | Частицы взрывов, короткоживущие. |
| `scoring` | `Scoring` | Очки, жизни, текущая волна, бонусные жизни. |
| `waveManager` | `WaveManager` | Генератор волн и спавнер НЛО. |
| `highScores` | `HighScoreStorage` | Передаётся далее в `GameOverScene`. |
| `input` | `InputSystem` | Источник состояний клавиш и свежих нажатий. |
| `sceneManager` | `SceneManager` | Нужен для `push(PauseScene)` и `replace(GameOverScene)`. |
| `respawnTimer` | `number` | Секунды до респауна корабля после его гибели; `0`, пока корабль жив. |
| `canvasSize` | `{w:number,h:number}` | Размер мира (для центра при респауне и wrap-around в `draw`). |

Связи: `GameScene` агрегирует все сущности «по значению» — они не существуют вне сцены. `Scoring` и `WaveManager` живут столько же, сколько сцена (пересоздаются в `enter`). `HighScoreStorage`, `InputSystem`, `SceneManager` — переживают сцену и приходят снаружи.

## Ключевые потоки

### 1. Вход в сцену — `enter()`
1. Сбрасывает `scoring` в начальное состояние (очки 0, жизни по `config.STARTING_LIVES`, волна 1).
2. Очищает все списки сущностей.
3. Спавнит `ship` в центре экрана с нулевой скоростью и окном неуязвимости (`invulnUntil = now + config.RESPAWN_INVULN`).
4. Вызывает `waveManager.startWave(1, ship.position)` и кладёт возвращённые астероиды в `asteroids`.
5. Обнуляет `respawnTimer`.

### 2. Игровой тик — `update(dt, input)`
Последовательность строго фиксирована:

1. **Ввод → корабль.** Если `ship` не `null`:
   - `input.isDown(RotateLeft)` → `ship.rotate(-1, dt)`.
   - `input.isDown(RotateRight)` → `ship.rotate(+1, dt)`.
   - `input.isDown(Thrust)` → `ship.setThrust(true)`; иначе `ship.setThrust(false)`.
   - `input.wasPressed(Fire)` → `const b = ship.fire()`; если не `null` — `bullets.push(b)`.
   - `input.wasPressed(Hyperspace)` → `ship.hyperspace()`.
   - `input.wasPressed(Pause)` → `sceneManager.push(new PauseScene())` и немедленный `return` из `update` (текущий тик не доигрываем, чтобы пауза ощущалась мгновенной).
2. **Обновление сущностей.** Для каждого элемента всех списков вызывается `entity.update(dt)`. Для НЛО дополнительно: `const b = ufo.tryFire(ship?.position)`; если не `null` — `bullets.push(b)`. Если `ship` `null`, НЛО передаёт `undefined`/`null` и сам решает, стрелять ли.
3. **Коллизии.** `const events = CollisionSystem.detect(this)` — возвращает массив событий с полем `kind`.
4. **Резолюция событий.** По каждому событию — см. раздел «Обработка ошибок / резолюция коллизий» ниже.
5. **Компакция.** Каждый список фильтруется по `alive`: `asteroids = asteroids.filter(a => a.alive)` и т.д. Если `ship && !ship.alive` — `ship = null` (дополнительно к тому, что уже сделано в резолюции).
6. **Волна.** Если `asteroids.length === 0 && ufos.length === 0`:
   - `scoring.nextWave()` — инкрементирует номер волны и, возможно, выдаёт бонусную жизнь.
   - `const next = scoring.snapshot().wave`.
   - `const spawned = waveManager.startWave(next, ship?.position ?? center)` → `asteroids.push(...spawned)`.
7. **Спавн НЛО.** `const ufo = waveManager.maybeSpawnUfo(dt, this)`. Если не `null` — `ufos.push(ufo)`.
8. **Респаун / game over.** Если `ship === null && respawnTimer > 0`: `respawnTimer -= dt`; при `respawnTimer <= 0`:
   - Если `scoring.isGameOver()` → `sceneManager.replace(new GameOverScene(scoring.snapshot(), highScores))`.
   - Иначе — заспавнить новый `Ship` в центре с окном неуязвимости, `respawnTimer = 0`.

### 3. Отрисовка — `draw(ctx)`
1. `Renderer.clearScreen(ctx, canvasSize)` — заливка чёрным.
2. Для каждой сущности: `Renderer.withWrap(ctx, entity.position, entity.radius, canvasSize, (offsetCtx) => entity.draw(offsetCtx))`. Это рисует сущность у обоих краёв экрана, когда она «переезжает» границу.
3. Порядок рисования: `particles` → `asteroids` → `ufos` → `bullets` → `ship` (сверху — активные объекты игрока).
4. HUD: `drawHud(ctx)` — счёт числом слева сверху, номер волны справа сверху, жизни — ряд маленьких силуэтов корабля под счётом (`scoring.snapshot().lives` штук). Всё через `Renderer.drawText` и примитивы.

### 4. Резолюция коллизий
`CollisionSystem` возвращает события вида `{ a, b, kind }`, где `kind` ∈ `{ bulletAsteroid, bulletUfo, bulletShip, shipAsteroid, shipUfo }`. Поле `a.source` у пули различает `bulletShip` vs `bulletUfo`.

- **bullet(ship) ↔ Asteroid.** `bullet.alive = false`; `ship?.onBulletExpired()` (корабль может учитывать, что пуля освободила слот перезарядки); `asteroid.alive = false`; `asteroids.push(...asteroid.split())` (для `small` вернёт `[]`); `spawnExplosion(asteroid.position, asteroid.size)`; `scoring.addKill(asteroid.size)`.
- **bullet(ship) ↔ Ufo.** `bullet.alive = false`; `ship?.onBulletExpired()`; `ufo.alive = false`; `spawnExplosion(ufo.position, 'ufo')`; `scoring.addKill(ufo.kind)`.
- **bullet(ufo) ↔ Ship.** Если `ship && !ship.isInvulnerable()`: `bullet.alive = false`; `ship.alive = false`; `spawnExplosion(ship.position, 'ship')`; `scoring.loseLife()`; `ship = null`; `respawnTimer = config.RESPAWN_DELAY`.
- **Ship ↔ Asteroid.** Если `!ship.isInvulnerable()`: `ship.alive = false`; `asteroid.alive = false`; `asteroids.push(...asteroid.split())`; `spawnExplosion` по обоим; `scoring.loseLife()`; `ship = null`; `respawnTimer = config.RESPAWN_DELAY`. Начислять ли очки за астероид, снёсший игрока — нет (см. «Открытые вопросы»).
- **Ship ↔ Ufo.** Если `!ship.isInvulnerable()`: оба `alive = false`; `spawnExplosion` по обоим; `scoring.loseLife()`; `ship = null`; `respawnTimer = config.RESPAWN_DELAY`.

Все события из одного тика применяются за один проход; дубли по одной и той же паре недопустимы (гарантия на стороне `CollisionSystem`). После резолюции идёт компакция списков.

## Зависимости
- **`Ship`** — создание/респаун, вызовы `rotate / setThrust / fire / hyperspace / isInvulnerable / onBulletExpired`, чтение `position`, `alive`.
- **`Asteroid`** — чтение `alive`, `position`, `size`; вызов `split()`.
- **`Bullet`** — чтение `alive`, `source`; пополнение списка.
- **`Ufo`** — чтение `alive`, `position`, `kind`; вызов `tryFire(shipPos?)`.
- **`Particle`** — создание пачки в `spawnExplosion`, хранение и обновление.
- **`InputSystem`** — `isDown(action)`, `wasPressed(action)`; источник ввода для `ship`.
- **`CollisionSystem`** — `detect(scene) → CollisionEvent[]`; единственная точка детекции пересечений.
- **`WaveManager`** — `startWave(n, shipPos) → Asteroid[]`, `maybeSpawnUfo(dt, scene) → Ufo | null`, опц. `isCleared(scene)`.
- **`Scoring`** — `addKill(kind) / loseLife() / isGameOver() / nextWave() / snapshot()`.
- **`HighScoreStorage`** — передаётся только в `GameOverScene` при финише; сцена сама не вызывает её методы.
- **`SceneManager`** — `push(PauseScene)`, `replace(GameOverScene)`.
- **`Renderer`** — `clearScreen`, `withWrap`, `drawText`, примитивы для иконок жизней.
- **`config`** — константы `STARTING_LIVES`, `RESPAWN_DELAY`, `RESPAWN_INVULN`, размеры канваса.
- **`PauseScene` / `GameOverScene`** — классы-пункты назначения переходов.

## Обработка ошибок
Ситуации, которые могут возникнуть в штатной работе сцены, и реакция:

- **Ввод при мёртвом корабле.** Любые действия игрока (`Fire`, `Thrust`, `RotateLeft/Right`, `Hyperspace`) игнорируются, пока `ship === null`. `Pause` работает в любое время.
- **`ship.fire()` вернул `null`** (перезарядка или достигнут лимит одновременно летящих пуль). Сцена просто не добавляет пулю, без ошибок.
- **НЛО стреляет, корабля нет.** `ufo.tryFire(undefined)` — НЛО сам не стреляет или стреляет в случайную сторону (решение внутри `Ufo`). Сцена не обязана гарантировать цель.
- **Коллизия с неуязвимым кораблём.** Событие `shipAsteroid` / `shipUfo` / `bulletShip` отбрасывается: `ship.isInvulnerable()` защищает. Астероид/пуля при этом остаются живыми — то есть неуязвимость не «съедает» врагов.
- **Одновременная смерть корабля и переход на новую волну.** Порядок строгий: сперва полная резолюция коллизий → компакция → затем проверка очистки волны → затем обработка респауна. Даже если корабль умер, уничтожив последний астероид, следующая волна стартует сразу, а респаун сработает по таймеру.
- **`respawnTimer` истёк, но жизней нет.** Переход в `GameOverScene` через `sceneManager.replace`. Сцена не пытается «откатить» счёт.
- **Исключение внутри `entity.update` / `entity.draw`.** Не ловится локально: верхнеуровневый `try/catch` в `GameLoop` (см. архитектуру) прервёт кадр и вернёт в `MenuScene`. Сцена не пытается продолжить с полуразрушенным состоянием.
- **Пауза поверх сцены.** Пока `PauseScene` в стеке, `GameScene.update` не вызывается (отвечает `SceneManager`), но `draw` может вызываться — сцена рисует последний кадр. Внутренних таймеров, которые продолжили бы тикать во время паузы, у сцены нет — все они обновляются только в `update`.
- **Лимит пуль игрока.** Гарантируется на стороне `Ship.fire()` (возвращает `null`). Сцена не считает пули сама.
- **Корабль после гиперпространства появляется внутри астероида.** Сцена обнаружит это на ближайшем тике через обычную коллизию `shipAsteroid`. Никакой спец-обработки не требуется.

## Стек и библиотеки
- **Язык и парадигма:** TypeScript, ES-класс `GameScene`, реализующий интерфейс `Scene`. Без внешних библиотек.
- **Канвас:** `CanvasRenderingContext2D` — все вызовы идут через утилиты `Renderer`, сцена сама не трогает низкоуровневые API.
- **Состояние:** плоские массивы и примитивы — никаких observable/state-менеджеров; каждая игра начинается с «чистого» экземпляра сцены (через `enter`), что упрощает инварианты.
- **Валидация/DI:** конструкторный DI через объект `deps` — делает сцену тестируемой и переиспользуемой (например, для «нового забега» достаточно создать новую сцену с теми же `input`/`highScores`).
- **Таймеры:** собственное поле `respawnTimer` в секундах, декрементируемое `dt` в `update`. Никаких `setTimeout` — всё через игровой тик, чтобы корректно замораживаться на паузе.

## Конфигурация
Сцена сама не читает переменные окружения. Все настройки берутся из модуля `config.ts` и/или через DI:

| Имя | Назначение | Значение по умолчанию |
|---|---|---|
| `config.STARTING_LIVES` | Число жизней в начале партии. | `3` |
| `config.RESPAWN_DELAY` | Секунды между смертью корабля и респауном. | `2.0` |
| `config.RESPAWN_INVULN` | Секунды неуязвимости после респауна. | `2.5` |
| `config.CANVAS_WIDTH` / `config.CANVAS_HEIGHT` | Размер игрового поля (центр и wrap). | `800 / 600` |
| `config.HUD_MARGIN` | Отступ HUD от края канваса. | `16` |
| `config.LIFE_ICON_SCALE` | Масштаб силуэта корабля в HUD. | `0.6` |
| `import.meta.env.DEV` | Включает диагностический оверлей (FPS, количество сущностей). | зависит от сборки |

Секретов у сцены нет.

## Открытые вопросы
- Начислять ли очки за астероид, который убил игрока в столкновении `shipAsteroid` (оригинал не начислял — сейчас выбран этот вариант, но стоит подтвердить тюнингом).
- Должен ли таймер `maybeSpawnUfo` продолжать тикать, пока корабль в состоянии респауна, или приостанавливаться — влияет на ощущение «честности».
- Корректное поведение паузы при `ship === null` и активном `respawnTimer` — размораживать ли таймер после выхода из паузы ровно с того же значения (сейчас — да, так как `update` просто не вызывается на паузе).
- Нужна ли отдельная коллизия `bulletShip ↔ bulletUfo` (взаимное уничтожение пуль) — в оригинале её нет, у нас тоже не планируется, но стоит зафиксировать.
- Формат передачи финального счёта в `GameOverScene`: полный `snapshot()` или расширенный объект с историей (например, максимальной достигнутой волной) — решится при проектировании `GameOverScene`.
- Сохранять ли состояние между `exit()` и повторным `enter()` (например, кнопкой «Retry» из `GameOverScene`), или всегда создавать новую `GameScene` — текущее предположение: всегда новый экземпляр.
