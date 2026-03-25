export const stepElevation = (current: number, delta: number, direction: 'up' | 'down'): number =>
  current + (direction === 'up' ? delta : -delta)
