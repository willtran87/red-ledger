import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { ParticleSystem } from './ParticleSystem';

describe('ParticleSystem', () => {
  it('recycles a bounded pool and reports live effects by kind', () => {
    const particles = new ParticleSystem(new Scene(), 5, 1);
    particles.emit('ink', new Vector3(1, 2, 3), 3);
    particles.emit('spark', new Vector3(), 4);
    expect(particles.activeCount).toBe(5);
    expect(Object.values(particles.counts()).reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(particles.root.children).toHaveLength(5);
  });

  it('advances deterministically and expires particles on fixed updates', () => {
    const first = new ParticleSystem(new Scene(), 8, 42);
    const second = new ParticleSystem(new Scene(), 8, 42);
    first.emit('paper', new Vector3(2, 1, -3), 4);
    second.emit('paper', new Vector3(2, 1, -3), 4);
    first.update(1 / 35);
    second.update(1 / 35);
    expect(first.root.children.map((child) => child.position.toArray())).toEqual(second.root.children.map((child) => child.position.toArray()));
    for (let index = 0; index < 40; index += 1) first.update(1 / 35);
    expect(first.activeCount).toBe(0);
  });

  it('clears all effects without reallocating the pool', () => {
    const particles = new ParticleSystem(new Scene(), 6);
    particles.emit('approval', new Vector3(), 6);
    const children = [...particles.root.children];
    particles.clear();
    expect(particles.activeCount).toBe(0);
    expect(particles.root.children).toEqual(children);
  });
});
