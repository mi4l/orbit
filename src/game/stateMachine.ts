export type GamePhase = 'playing' | 'paused' | 'win' | 'fail';

export class GameStateMachine {
  private phase: GamePhase = 'playing';
  private failReason = '';

  get current(): GamePhase {
    return this.phase;
  }

  get failureReason(): string {
    return this.failReason;
  }

  setPlaying(): void {
    this.phase = 'playing';
    this.failReason = '';
  }

  setPaused(): void {
    if (this.phase === 'playing') this.phase = 'paused';
  }

  togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      return;
    }
    if (this.phase === 'paused') {
      this.phase = 'playing';
    }
  }

  setWin(): void {
    this.phase = 'win';
  }

  setFail(reason: string): void {
    this.phase = 'fail';
    this.failReason = reason;
  }

  canSimulate(): boolean {
    return this.phase === 'playing';
  }
}
