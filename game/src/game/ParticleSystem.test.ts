import { describe, expect, it } from 'vitest';
import { DataTexture, InstancedBufferGeometry, Mesh, Scene, Vector3 } from 'three';
import { ParticleSystem } from './ParticleSystem';

const batchSnapshot = (particles: ParticleSystem) => particles.root.children.map((child) => {
  const geometry = (child as Mesh).geometry as InstancedBufferGeometry;
  const position = geometry.getAttribute('instancePosition');
  return {
    name: child.name,
    count: geometry.instanceCount,
    positions: Array.from(position.array).slice(0, geometry.instanceCount * 3),
  };
});

const firstNormalUvX = (particles: ParticleSystem): number => {
  const mesh = particles.root.children.find((child) => child.name === 'particle-effects-normal') as Mesh;
  return (mesh.geometry as InstancedBufferGeometry).getAttribute('instanceUvRect').getX(0);
};

const testTexture = (value: number): DataTexture => new DataTexture(
  new Uint8Array([value, 255 - value, 127, 255]),
  1,
  1,
);

describe('ParticleSystem', () => {
  it('recycles a bounded pool into at most two render batches', () => {
    const particles = new ParticleSystem(new Scene(), 5, 1);
    particles.emit('ink', new Vector3(1, 2, 3), 3);
    particles.emit('spark', new Vector3(), 4);
    expect(particles.activeCount).toBe(5);
    expect(Object.values(particles.counts()).reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(particles.root.children.map((child) => child.name)).toEqual([
      'particle-effects-normal',
      'particle-effects-additive',
    ]);
    expect(batchSnapshot(particles).reduce((sum, batch) => sum + batch.count, 0)).toBe(5);
  });

  it('advances deterministically and expires particles on fixed updates', () => {
    const first = new ParticleSystem(new Scene(), 8, 42);
    const second = new ParticleSystem(new Scene(), 8, 42);
    first.emit('paper', new Vector3(2, 1, -3), 4);
    second.emit('paper', new Vector3(2, 1, -3), 4);
    first.update(1 / 35);
    second.update(1 / 35);
    const seededSnapshot = batchSnapshot(first);
    expect(seededSnapshot).toEqual(batchSnapshot(second));
    first.clear();
    first.emit('paper', new Vector3(2, 1, -3), 4);
    first.update(1 / 35);
    expect(batchSnapshot(first)).toEqual(seededSnapshot);
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
    expect(batchSnapshot(particles).every((batch) => batch.count === 0)).toBe(true);
  });

  it('reserves capacity for critical cues and prevents ambient eviction', () => {
    const particles = new ParticleSystem(new Scene(), 16, 7);
    expect(particles.criticalReserve).toBe(2);
    expect(particles.ambientLimit).toBe(4);

    particles.emit('ink', new Vector3(), 100);
    expect(particles.activeCount).toBe(14);
    particles.emit('smoke', new Vector3(), 100, undefined, { priority: 'ambient' });
    expect(particles.activeCount).toBe(14);
    expect(particles.counts().smoke).toBe(0);

    particles.clear();
    particles.emit('smoke', new Vector3(), 100, undefined, { priority: 'ambient' });
    expect(particles.counts().smoke).toBe(4);
    particles.emit('deflection', new Vector3(), 2);
    particles.emit('ink', new Vector3(), 100);
    expect(particles.activeCount).toBe(16);
    expect(particles.counts().deflection).toBe(2);
    expect(particles.counts().ink).toBe(14);

    particles.emit('smoke', new Vector3(), 100, undefined, { priority: 'ambient' });
    expect(particles.counts().smoke).toBe(0);
    expect(particles.counts().deflection).toBe(2);
    expect(particles.counts().ink).toBe(14);

    particles.emit('spark', new Vector3(), 4, undefined, { priority: 'critical' });
    expect(particles.counts().deflection).toBe(2);
    expect(particles.counts().spark).toBe(4);
    expect(particles.activeCount).toBe(16);
  });

  it('reclaims atlas cells when catalog texture bindings are cleared', () => {
    const particles = new ParticleSystem(new Scene(), 4, 11);
    for (let index = 0; index < 63; index += 1) particles.setTexture('ink', testTexture(index));
    particles.setTexture('ink', testTexture(250));
    particles.emit('ink', new Vector3(), 1);
    expect(firstNormalUvX(particles)).toBeLessThan(.01);

    particles.clear();
    particles.clearTextureBindings();
    particles.setTexture('ink', testTexture(42));
    particles.emit('ink', new Vector3(), 1);
    expect(firstNormalUvX(particles)).toBeGreaterThan(.1);
  });
});
