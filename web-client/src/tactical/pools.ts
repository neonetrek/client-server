/**
 * Object pools for Three.js entities to avoid GC pressure.
 * Pre-allocates groups and manages acquire/release by entity ID.
 */

import * as THREE from 'three';

export class ObjectPool<T extends THREE.Object3D> {
  private pool: T[] = [];
  private active = new Map<number, T>();
  private factory: () => T;

  constructor(factory: () => T, preAllocate: number) {
    this.factory = factory;
    for (let i = 0; i < preAllocate; i++) {
      const obj = factory();
      obj.visible = false;
      this.pool.push(obj);
    }
  }

  /** Get all pre-allocated objects for adding to scene */
  getAll(): T[] {
    return [...this.pool, ...this.active.values()];
  }

  /** Acquire an object by ID. Returns existing if already active. */
  acquire(id: number): T {
    let obj = this.active.get(id);
    if (obj) return obj;

    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else {
      obj = this.factory();
    }
    obj.visible = true;
    this.active.set(id, obj);
    return obj;
  }

  /** Release an object back to pool */
  release(id: number) {
    const obj = this.active.get(id);
    if (!obj) return;
    obj.visible = false;
    this.active.delete(id);
    this.pool.push(obj);
  }

  /** Release all objects not in the given active set */
  sync(activeIds: Set<number>) {
    for (const [id, obj] of this.active) {
      if (!activeIds.has(id)) {
        obj.visible = false;
        this.pool.push(obj);
        this.active.delete(id);
      }
    }
  }

  /** Get active object by ID */
  get(id: number): T | undefined {
    return this.active.get(id);
  }

  /** Number of currently active objects */
  get activeCount(): number {
    return this.active.size;
  }
}
