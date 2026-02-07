import type { GamePhase } from '../game/stateMachine';

export interface HudCallbacks {
  onPauseToggle(): void;
  onRestart(): void;
  onSpawnToggle(): void;
  onTrailsToggle(): void;
  onPreviewToggle(): void;
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
  private readonly spawnButton: HTMLButtonElement;
  private readonly trailsButton: HTMLButtonElement;
  private readonly previewButton: HTMLButtonElement;
  private readonly offlineBadge: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayTitle: HTMLHeadingElement;
  private readonly overlayMessage: HTMLParagraphElement;
  private readonly overlayPrimary: HTMLButtonElement;
  private readonly overlaySecondary: HTMLButtonElement;

  constructor(parent: HTMLElement, callbacks: HudCallbacks) {
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

    this.spawnButton = this.makeButton('Spawn', () => this.callbacks.onSpawnToggle());
    this.trailsButton = this.makeButton('Trails On', () => this.callbacks.onTrailsToggle());
    this.previewButton = this.makeButton('Preview On', () => this.callbacks.onPreviewToggle());

    this.topBar.append(this.levelLabel, this.orbitLabel, this.pauseButton, this.restartButton, this.offlineBadge);
    this.bottomBar.append(this.spawnButton, this.trailsButton, this.previewButton);

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
  }

  destroy(): void {
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

  setSpawnState(active: boolean, currentPlanets: number, maxPlanets: number): void {
    this.spawnButton.classList.toggle('active', active);
    this.spawnButton.textContent = `Spawn ${currentPlanets}/${maxPlanets}`;
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

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-pill';
    button.textContent = label;
    button.onclick = () => onClick();
    return button;
  }
}
