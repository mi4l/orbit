import type { PlanetType } from '../game/planetTypes';
import type { StarType } from '../game/starTypes';
import type { GamePhase } from '../game/stateMachine';

interface ActivePaletteDrag {
  ghost: HTMLDivElement;
  pointerId: number;
  kind: 'planet' | 'star';
  typeId: string;
}

interface PaletteItem {
  kind: 'planet' | 'star';
  id: string;
  name: string;
  color: number;
  stat: string;
}

export interface HudCallbacks {
  onPauseToggle(): void;
  onRestart(): void;
  onTrailsToggle(): void;
  onPreviewToggle(): void;
  onPaletteDrop(kind: 'planet' | 'star', typeId: string, clientX: number, clientY: number): void;
  onNextLevel(): void;
  onRetry(): void;
}

export class Hud {
  private readonly callbacks: HudCallbacks;
  private readonly topBar: HTMLDivElement;
  private readonly bottomBar: HTMLDivElement;
  private readonly levelLabel: HTMLDivElement;
  private readonly orbitLabel: HTMLDivElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly trailsButton: HTMLButtonElement;
  private readonly previewButton: HTMLButtonElement;
  private readonly paletteStrip: HTMLDivElement;
  private readonly offlineBadge: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayTitle: HTMLHeadingElement;
  private readonly overlayMessage: HTMLParagraphElement;
  private readonly overlayPrimary: HTMLButtonElement;
  private readonly overlaySecondary: HTMLButtonElement;
  private activePaletteDrag: ActivePaletteDrag | null = null;

  constructor(
    parent: HTMLElement,
    callbacks: HudCallbacks,
    planetTypes: ReadonlyArray<PlanetType>,
    starTypes: ReadonlyArray<StarType>
  ) {
    this.callbacks = callbacks;

    this.topBar = document.createElement('div');
    this.topBar.className = 'hud-top';

    this.bottomBar = document.createElement('div');
    this.bottomBar.className = 'hud-bottom';

    this.levelLabel = document.createElement('div');
    this.levelLabel.className = 'hud-pill hud-grow';
    this.levelLabel.textContent = 'Level';

    this.orbitLabel = document.createElement('div');
    this.orbitLabel.className = 'hud-pill';
    this.orbitLabel.textContent = 'Orbit 0/0';

    this.pauseButton = this.makeButton('Pause', () => this.callbacks.onPauseToggle());
    this.restartButton = this.makeButton('Restart', () => this.callbacks.onRestart());

    this.offlineBadge = document.createElement('div');
    this.offlineBadge.className = 'hud-pill warn';
    this.offlineBadge.textContent = 'Offline';
    this.offlineBadge.style.display = 'none';

    this.trailsButton = this.makeButton('Trails On', () => this.callbacks.onTrailsToggle());
    this.previewButton = this.makeButton('Preview On', () => this.callbacks.onPreviewToggle());

    this.paletteStrip = document.createElement('div');
    this.paletteStrip.className = 'planet-palette';

    const paletteItems: PaletteItem[] = [
      ...starTypes.map((type) => ({
        kind: 'star' as const,
        id: type.id,
        name: type.name,
        color: type.color,
        stat: `m${type.mass} g${type.gravityRadius}`
      })),
      ...planetTypes.map((type) => ({
        kind: 'planet' as const,
        id: type.id,
        name: type.name,
        color: type.color,
        stat: `r${type.radius.toFixed(1)} d${type.density.toFixed(1)}`
      }))
    ];

    for (const item of paletteItems) {
      this.paletteStrip.appendChild(this.createPaletteCard(item));
    }

    const controlsCluster = document.createElement('div');
    controlsCluster.className = 'palette-controls';
    controlsCluster.append(this.trailsButton, this.previewButton);

    this.topBar.append(this.levelLabel, this.orbitLabel, this.pauseButton, this.restartButton, this.offlineBadge);
    this.bottomBar.append(this.paletteStrip, controlsCluster);

    this.overlay = document.createElement('div');
    this.overlay.className = 'status-overlay';

    const card = document.createElement('div');
    card.className = 'status-card';

    this.overlayTitle = document.createElement('h2');
    this.overlayTitle.className = 'status-title';

    this.overlayMessage = document.createElement('p');
    this.overlayMessage.className = 'status-message';

    const actions = document.createElement('div');
    actions.className = 'status-actions';

    this.overlayPrimary = this.makeButton('Next', () => this.callbacks.onNextLevel());
    this.overlaySecondary = this.makeButton('Restart', () => this.callbacks.onRetry());

    actions.append(this.overlayPrimary, this.overlaySecondary);
    card.append(this.overlayTitle, this.overlayMessage, actions);
    this.overlay.append(card);

    parent.append(this.topBar, this.bottomBar, this.overlay);

    window.addEventListener('pointermove', this.onPalettePointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPalettePointerUp, { passive: false });
    window.addEventListener('pointercancel', this.onPalettePointerCancel, { passive: false });
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPalettePointerMove);
    window.removeEventListener('pointerup', this.onPalettePointerUp);
    window.removeEventListener('pointercancel', this.onPalettePointerCancel);
    this.clearPaletteDrag();
    this.topBar.remove();
    this.bottomBar.remove();
    this.overlay.remove();
  }

  setLevel(index: number, total: number, name: string): void {
    this.levelLabel.textContent = `Level ${index + 1}/${total}: ${name}`;
  }

  setOrbitProgress(stable: number, target: number, secondsLeft: number): void {
    const remaining = Math.max(0, secondsLeft);
    this.orbitLabel.textContent = `Orbit ${stable}/${target} | ${remaining.toFixed(1)}s`;
  }

  setPauseState(phase: GamePhase): void {
    this.pauseButton.textContent = phase === 'paused' ? 'Resume' : 'Pause';
  }

  setTrailsState(enabled: boolean): void {
    this.trailsButton.classList.toggle('active', enabled);
    this.trailsButton.textContent = enabled ? 'Trails On' : 'Trails Off';
  }

  setPreviewState(enabled: boolean): void {
    this.previewButton.classList.toggle('active', enabled);
    this.previewButton.textContent = enabled ? 'Preview On' : 'Preview Off';
  }

  setOffline(offline: boolean): void {
    this.offlineBadge.style.display = offline ? 'inline-flex' : 'none';
  }

  showWin(hasNextLevel: boolean): void {
    this.overlay.classList.add('visible');
    this.overlayTitle.textContent = 'Level Complete';
    this.overlayMessage.textContent = hasNextLevel
      ? 'Stable orbit achieved. Continue to the next challenge.'
      : 'All levels complete. Restart to play again.';
    this.overlayPrimary.textContent = hasNextLevel ? 'Next Level' : 'Restart';
    this.overlayPrimary.onclick = hasNextLevel
      ? () => this.callbacks.onNextLevel()
      : () => this.callbacks.onRetry();
    this.overlaySecondary.textContent = 'Restart';
    this.overlaySecondary.onclick = () => this.callbacks.onRetry();
  }

  showFail(message: string): void {
    this.overlay.classList.add('visible');
    this.overlayTitle.textContent = 'Level Failed';
    this.overlayMessage.textContent = message;
    this.overlayPrimary.textContent = 'Try Again';
    this.overlayPrimary.onclick = () => this.callbacks.onRetry();
    this.overlaySecondary.textContent = 'Restart';
    this.overlaySecondary.onclick = () => this.callbacks.onRetry();
  }

  hideOverlay(): void {
    this.overlay.classList.remove('visible');
  }

  private createPaletteCard(item: PaletteItem): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `planet-card ${item.kind === 'star' ? 'star-card' : ''}`;
    button.setAttribute('aria-label', `Drag ${item.name} into playfield`);
    button.dataset.typeId = item.id;
    button.dataset.kind = item.kind;

    const icon = document.createElement('img');
    icon.className = 'planet-card-icon';
    icon.alt = item.name;
    icon.src = this.makeBodyIcon(item.color, item.kind === 'star');

    const label = document.createElement('span');
    label.className = 'planet-card-label';
    label.textContent = item.name;

    const stat = document.createElement('span');
    stat.className = 'planet-card-stat';
    stat.textContent = item.stat;

    button.append(icon, label, stat);
    button.addEventListener('pointerdown', (event) => this.onPalettePointerDown(event, item));

    return button;
  }

  private makeBodyIcon(color: number, isStar: boolean): string {
    const ringColor = isStar ? '#ffd78a66' : '#ffffff44';
    const coreColor = `#${color.toString(16).padStart(6, '0')}`;
    const bg = isStar ? '#2e1e11' : '#101624';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#ffffffcc"/><stop offset="42%" stop-color="${coreColor}"/><stop offset="100%" stop-color="${bg}"/></radialGradient></defs><rect width="64" height="64" fill="transparent"/><circle cx="32" cy="32" r="20" fill="url(#g)"/><circle cx="32" cy="32" r="21.5" fill="none" stroke="${ringColor}" stroke-width="2"/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private onPalettePointerDown(event: PointerEvent, item: PaletteItem): void {
    event.preventDefault();

    this.clearPaletteDrag();

    const ghost = document.createElement('div');
    ghost.className = 'planet-drag-ghost';
    ghost.textContent = item.name;
    ghost.style.borderColor = `#${item.color.toString(16).padStart(6, '0')}`;

    document.body.appendChild(ghost);
    this.positionGhost(ghost, event.clientX, event.clientY);

    this.activePaletteDrag = {
      ghost,
      pointerId: event.pointerId,
      kind: item.kind,
      typeId: item.id
    };
  }

  private onPalettePointerMove = (event: PointerEvent): void => {
    if (!this.activePaletteDrag || event.pointerId !== this.activePaletteDrag.pointerId) return;
    event.preventDefault();
    this.positionGhost(this.activePaletteDrag.ghost, event.clientX, event.clientY);
  };

  private onPalettePointerUp = (event: PointerEvent): void => {
    if (!this.activePaletteDrag || event.pointerId !== this.activePaletteDrag.pointerId) return;
    event.preventDefault();
    this.callbacks.onPaletteDrop(
      this.activePaletteDrag.kind,
      this.activePaletteDrag.typeId,
      event.clientX,
      event.clientY
    );
    this.clearPaletteDrag();
  };

  private onPalettePointerCancel = (event: PointerEvent): void => {
    if (!this.activePaletteDrag || event.pointerId !== this.activePaletteDrag.pointerId) return;
    event.preventDefault();
    this.clearPaletteDrag();
  };

  private positionGhost(ghost: HTMLDivElement, clientX: number, clientY: number): void {
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY}px`;
  }

  private clearPaletteDrag(): void {
    if (!this.activePaletteDrag) return;
    this.activePaletteDrag.ghost.remove();
    this.activePaletteDrag = null;
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-pill';
    button.textContent = label;
    button.onclick = () => onClick();
    return button;
  }
}
