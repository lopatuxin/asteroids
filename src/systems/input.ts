import { INPUT_BINDINGS, INPUT_PREVENT_DEFAULT_CODES, type Action } from '../config';

export class InputSystem {
  private bindings: Readonly<Record<string, Action>>;
  private down: Set<Action> = new Set();
  private pressed: Set<Action> = new Set();
  private attached: boolean = false;
  private target: Window | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyupHandler: ((e: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;

  constructor(bindings: Readonly<Record<string, Action>> = INPUT_BINDINGS) {
    this.bindings = bindings;
  }

  attach(target: Window): void {
    if (this.attached) return;
    this.target = target;
    this.keydownHandler = (e: KeyboardEvent) => {
      const action = this.bindings[e.code];
      if (!action) return;
      if (INPUT_PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.down.add(action);
        this.pressed.add(action);
      } else {
        this.down.add(action);
      }
    };
    this.keyupHandler = (e: KeyboardEvent) => {
      const action = this.bindings[e.code];
      if (!action) return;
      if (INPUT_PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
      this.down.delete(action);
    };
    this.blurHandler = () => {
      this.down.clear();
      this.pressed.clear();
    };
    target.addEventListener('keydown', this.keydownHandler);
    target.addEventListener('keyup', this.keyupHandler);
    target.addEventListener('blur', this.blurHandler);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached || !this.target) return;
    if (this.keydownHandler) this.target.removeEventListener('keydown', this.keydownHandler);
    if (this.keyupHandler) this.target.removeEventListener('keyup', this.keyupHandler);
    if (this.blurHandler) this.target.removeEventListener('blur', this.blurHandler);
    this.keydownHandler = null;
    this.keyupHandler = null;
    this.blurHandler = null;
    this.target = null;
    this.attached = false;
    this.down.clear();
    this.pressed.clear();
  }

  isDown(action: Action): boolean {
    return this.down.has(action);
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  clearFrame(): void {
    this.pressed.clear();
  }
}
