import * as THREE from 'three';

/**
 * Компактные скопления звёзд: точки с гауссовским распределением в нескольких кластерах.
 * Каждое скопление — это Points с собственной текстурой и лёгким аддитивным свечением.
 */
export default class StarClusters {
  constructor({
    seed = 12345,
    clusters = 6,
    radius = 1500,
    clusterRadius = 80,
    pointsPerCluster = 400,
    size = 1.8,
  } = {}) {
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;

    const rng = StarClusters.makeRng(typeof seed === 'number' ? seed : StarClusters.stringToSeed(String(seed)));

    const dotTexture = StarClusters.createDotTexture();

    for (let c = 0; c < clusters; c += 1) {
      const dir = StarClusters.randomUnitVector(rng);
      const r = radius * (0.92 + 0.08 * rng());
      const center = new THREE.Vector3().copy(dir).multiplyScalar(r);

      const geometry = new THREE.BufferGeometry();
      const count = Math.floor(pointsPerCluster * (0.6 + 0.8 * rng()));
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);

      // Реалистичные звездные типы и цвета
      const starTypes = [
        { color: [0.6, 0.7, 1.0], weight: 0.76, name: 'M-class' }, // красные карлики
        { color: [1.0, 0.8, 0.6], weight: 0.12, name: 'K-class' }, // оранжевые
        { color: [1.0, 1.0, 0.9], weight: 0.08, name: 'G-class' }, // желтые как Солнце
        { color: [1.0, 1.0, 1.0], weight: 0.03, name: 'F-class' }, // белые
        { color: [0.8, 0.9, 1.0], weight: 0.006, name: 'A-class' }, // голубовато-белые
        { color: [0.7, 0.8, 1.0], weight: 0.003, name: 'B-class' }, // голубые
        { color: [0.6, 0.7, 1.0], weight: 0.001, name: 'O-class' }  // очень горячие голубые
      ];

      for (let i = 0; i < count; i += 1) {
        // 3D гауссово распределение (Box-Muller)
        const p = StarClusters.sampleGaussian3(rng).multiplyScalar(clusterRadius * (0.5 + 0.7 * rng()));
        const idx = i * 3;
        positions[idx + 0] = center.x + p.x;
        positions[idx + 1] = center.y + p.y;
        positions[idx + 2] = center.z + p.z;

        // Выбор типа звезды на основе реалистичного распределения
        const rand = rng();
        let cumulativeWeight = 0;
        let selectedType = starTypes[0];

        for (const type of starTypes) {
          cumulativeWeight += type.weight;
          if (rand <= cumulativeWeight) {
            selectedType = type;
            break;
          }
        }

        // Применение цвета с небольшими вариациями
        const baseColor = selectedType.color;
        const variation = 0.15; // меньше вариации для более реалистичного вида
        colors[idx + 0] = Math.max(0, Math.min(1, baseColor[0] * (1 + (rng() - 0.5) * variation)));
        colors[idx + 1] = Math.max(0, Math.min(1, baseColor[1] * (1 + (rng() - 0.5) * variation)));
        colors[idx + 2] = Math.max(0, Math.min(1, baseColor[2] * (1 + (rng() - 0.5) * variation)));

        // Размер звезды зависит от её типа и яркости
        let starSize = size;
        if (selectedType.name === 'O-class' || selectedType.name === 'B-class') {
          starSize *= 1.8 + rng() * 0.4; // большие горячие звезды
        } else if (selectedType.name === 'A-class' || selectedType.name === 'F-class') {
          starSize *= 1.3 + rng() * 0.3; // средние звезды
        } else if (selectedType.name === 'G-class') {
          starSize *= 1.0 + rng() * 0.2; // как Солнце
        } else if (selectedType.name === 'K-class') {
          starSize *= 0.8 + rng() * 0.2; // немного меньше
        } else { // M-class
          starSize *= 0.6 + rng() * 0.3; // красные карлики
        }
        sizes[i] = starSize;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          pointTexture: { value: dotTexture }
        },
        vertexShader: `
          attribute float size;
          varying vec3 vColor;
          varying float vSize;
          
          void main() {
            vColor = color;
            vSize = size;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            
            gl_PointSize = size;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D pointTexture;
          varying vec3 vColor;
          varying float vSize;
          
          void main() {
            vec2 coords = gl_PointCoord;
            vec4 texColor = texture2D(pointTexture, coords);
            
            // Более мягкое свечение для больших звезд
            float intensity = texColor.a;
            if (vSize > 2.0) {
              intensity = pow(texColor.a, 0.7);
            }
            
            gl_FragColor = vec4(vColor * intensity, intensity);
          }
        `,
        transparent: false,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      });
      material.alphaTest = 0.1;
      material.toneMapped = false;

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = -950;
      points.matrixAutoUpdate = false;
      this.group.add(points);
    }
  }

  static stringToSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  static makeRng(seed) {
    let x = (seed >>> 0) || 123456789;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return ((x >>> 0) / 4294967296);
    };
  }

  static randomUnitVector(rng) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sinPhi = Math.sin(phi);
    return new THREE.Vector3(
      sinPhi * Math.cos(theta),
      Math.cos(phi),
      sinPhi * Math.sin(theta)
    );
  }

  static sampleGaussian3(rng) {
    const gaussian = () => {
      // Box-Muller
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
    return new THREE.Vector3(gaussian(), gaussian(), gaussian());
  }

  static createDotTexture(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;

    // Основное свечение звезды
    const mainGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 0.4);
    mainGradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    mainGradient.addColorStop(0.1, 'rgba(255,255,255,0.9)');
    mainGradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    mainGradient.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    mainGradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Дополнительное внешнее свечение для больших звезд
    const outerGradient = ctx.createRadialGradient(centerX, centerY, size * 0.2, centerX, centerY, size * 0.5);
    outerGradient.addColorStop(0.0, 'rgba(255,255,255,0.0)');
    outerGradient.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    outerGradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  addTo(scene) {
    scene.add(this.group);
  }

  update(camera) {
    if (camera && camera.position) {
      this.group.position.copy(camera.position);
      this.group.updateMatrix();
    }

    this.group.children.forEach(points => {
      points.updateMatrix();
    });
  }
}


