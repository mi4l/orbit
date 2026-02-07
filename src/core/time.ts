import { GAME_CONFIG } from './config';

export class FixedStepClock {
  private readonly step: number;
  private readonly maxStepsPerFrame: number;
  private readonly maxDeltaTime: number;
  private accumulator = 0;

  constructor(
    step = GAME_CONFIG.physics.fixedTimeStep,
    maxStepsPerFrame = GAME_CONFIG.physics.maxStepsPerFrame,
    maxDeltaTime = GAME_CONFIG.physics.maxDeltaTime
  ) {
    this.step = step;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.maxDeltaTime = maxDeltaTime;
  }

  run(realDelta: number, timeScale: number, onStep: (dt: number) => void): number {
    const clampedDelta = Math.min(realDelta, this.maxDeltaTime);
    this.accumulator += clampedDelta * timeScale;

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxStepsPerFrame) {
      onStep(this.step);
      this.accumulator -= this.step;
      steps += 1;
    }

    if (steps === this.maxStepsPerFrame) {
      this.accumulator = 0;
    }

    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
