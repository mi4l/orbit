import type { Vec2 } from '../core/math';

export interface InputCallbacks {
  toWorld(clientX: number, clientY: number): Vec2 | null;
  isSpawnMode(): boolean;
  pickSun(worldPos: Vec2): string | null;
  onSpawnTap(worldPos: Vec2): void;
  onSunDragStart(sunId: string, worldPos: Vec2): void;
  onSunDragMove(sunId: string, worldPos: Vec2): void;
  onSunDragEnd(sunId: string, worldPos: Vec2): void;
}

export class PointerInput {
  private readonly element: HTMLElement;
  private readonly callbacks: InputCallbacks;
  private dragPointerId: number | null = null;
  private dragSunId: string | null = null;

  constructor(element: HTMLElement, callbacks: InputCallbacks) {
    this.element = element;
    this.callbacks = callbacks;

    this.element.style.touchAction = 'none';
    this.element.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.element.addEventListener('pointermove', this.onPointerMove, { passive: false });
    this.element.addEventListener('pointerup', this.onPointerUp, { passive: false });
    this.element.addEventListener('pointercancel', this.onPointerCancel, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenu, { passive: false });
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerCancel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onPointerDown = (event: PointerEvent): void => {
    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (!worldPos) return;

    event.preventDefault();

    if (this.callbacks.isSpawnMode()) {
      this.callbacks.onSpawnTap(worldPos);
      return;
    }

    const pickedSun = this.callbacks.pickSun(worldPos);
    if (!pickedSun) return;

    this.dragPointerId = event.pointerId;
    this.dragSunId = pickedSun;
    this.element.setPointerCapture(event.pointerId);
    this.callbacks.onSunDragStart(pickedSun, worldPos);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragSunId) return;
    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (!worldPos) return;
    event.preventDefault();
    this.callbacks.onSunDragMove(this.dragSunId, worldPos);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragSunId) return;
    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (worldPos) {
      this.callbacks.onSunDragEnd(this.dragSunId, worldPos);
    }
    event.preventDefault();

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }

    this.dragPointerId = null;
    this.dragSunId = null;
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragSunId) return;

    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (worldPos) {
      this.callbacks.onSunDragEnd(this.dragSunId, worldPos);
    }

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }

    this.dragPointerId = null;
    this.dragSunId = null;
    event.preventDefault();
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
