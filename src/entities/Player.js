import * as THREE from 'three';

export default class Player {
  constructor(scene) {
    this.mesh = new THREE.Object3D();
    this.mesh.position.set(0, 1.7, 0);
    scene.add(this.mesh);
  }
}


