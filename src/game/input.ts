import type { Vec2 } from '../core/math';

export interface DragTarget {
  kind: 'sun' | 'planet';
  id: string;
}

export interface InputCallbacks {
  toWorld(clientX: number, clientY: number): Vec2 | null;
  isSpawnMode(): boolean;
  pickDragTarget(worldPos: Vec2): DragTarget | null;
  onSpawnTap(worldPos: Vec2): void;
  onDragStart(target: DragTarget, worldPos: Vec2): void;
  onDragMove(target: DragTarget, worldPos: Vec2): void;
  onDragEnd(target: DragTarget, worldPos: Vec2): void;
}

export class PointerInput {
  private readonly element: HTMLElement;
  private readonly callbacks: InputCallbacks;
  private dragPointerId: number | null = null;
  private dragTarget: DragTarget | null = null;

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

    const pickedTarget = this.callbacks.pickDragTarget(worldPos);
    if (!pickedTarget) return;

    this.dragPointerId = event.pointerId;
    this.dragTarget = pickedTarget;
    this.element.setPointerCapture(event.pointerId);
    this.callbacks.onDragStart(pickedTarget, worldPos);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragTarget) return;
    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (!worldPos) return;
    event.preventDefault();
    this.callbacks.onDragMove(this.dragTarget, worldPos);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragTarget) return;
    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (worldPos) {
      this.callbacks.onDragEnd(this.dragTarget, worldPos);
    }
    event.preventDefault();

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }

    this.dragPointerId = null;
    this.dragTarget = null;
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragTarget) return;

    const worldPos = this.callbacks.toWorld(event.clientX, event.clientY);
    if (worldPos) {
      this.callbacks.onDragEnd(this.dragTarget, worldPos);
    }

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }

    this.dragPointerId = null;
    this.dragTarget = null;
    event.preventDefault();
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
