import * as THREE from 'three';

/**
 * Звёздное небо как точки в большом сферическом объёме.
 * Держим группу звёзд центрированной на камере, чтобы фон казался бесконечным.
 */
export default class Stars {
  constructor({
    seed = 12345,
    count = 7000,
    radius = 1800,
    sizeNear = 3.5,
    sizeFar = 2.5,
    nearFraction = 0.35,
  } = {}) {
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;

    const rng = Stars.makeRng(typeof seed === 'number' ? seed : Stars.stringToSeed(String(seed)));

    // Текстура круглой точки
    const dotTexture = Stars.createDotTexture();

    // Два слоя — дальний и ближний (немного крупнее и ярче)
    const farCount = Math.floor(count * (1 - nearFraction));
    const nearCount = Math.max(0, count - farCount);

    const farPoints = this.createLayer({
      rng,
      count: farCount,
      radius,
      size: sizeFar,
      texture: dotTexture,
      baseOpacity: 0.95,
    });

    const nearPoints = this.createLayer({
      rng,
      count: nearCount,
      radius: radius * 0.66,
      size: sizeNear,
      texture: dotTexture,
      baseOpacity: 1.0,
    });

    if (farPoints) this.group.add(farPoints);
    if (nearPoints) this.group.add(nearPoints);

    // Без автоматического вращения — звёзды статичны
    this.autoSlowRotation = false;
    this.rotationSpeed = 0.0;
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
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; // xorshift32
      return ((x >>> 0) / 4294967296);
    };
  }

  static createDotTexture(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;

    // Основное ядро звезды
    const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 0.15);
    coreGradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    coreGradient.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    coreGradient.addColorStop(1.0, 'rgba(255,255,255,0.8)');

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Основное свечение
    const mainGradient = ctx.createRadialGradient(centerX, centerY, size * 0.1, centerX, centerY, size * 0.4);
    mainGradient.addColorStop(0.0, 'rgba(255,255,255,0.7)');
    mainGradient.addColorStop(0.3, 'rgba(255,255,255,0.4)');
    mainGradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    mainGradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Внешнее мягкое свечение для ярких звезд
    const outerGradient = ctx.createRadialGradient(centerX, centerY, size * 0.3, centerX, centerY, size * 0.5);
    outerGradient.addColorStop(0.0, 'rgba(255,255,255,0.0)');
    outerGradient.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    outerGradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.premultiplyAlpha = true;
    return texture;
  }

  /**
   * Создаёт слой точек, равномерно раскиданных по поверхности сферы с небольшой толщиной.
   */
  createLayer({ rng, count, radius, size, texture, baseOpacity }) {
    if (count <= 0) return null;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    // Реалистичные звездные типы с правильным распределением
    const starTypes = [
      { color: [0.6, 0.7, 1.0], weight: 0.76, sizeMultiplier: 0.8, name: 'M-class' }, // красные карлики
      { color: [1.0, 0.8, 0.6], weight: 0.12, sizeMultiplier: 1.0, name: 'K-class' }, // оранжевые
      { color: [1.0, 1.0, 0.9], weight: 0.08, sizeMultiplier: 1.2, name: 'G-class' }, // желтые как Солнце
      { color: [1.0, 1.0, 1.0], weight: 0.03, sizeMultiplier: 1.5, name: 'F-class' }, // белые
      { color: [0.8, 0.9, 1.0], weight: 0.006, sizeMultiplier: 1.8, name: 'A-class' }, // голубовато-белые
      { color: [0.7, 0.8, 1.0], weight: 0.003, sizeMultiplier: 2.1, name: 'B-class' }, // голубые
      { color: [0.6, 0.7, 1.0], weight: 0.001, sizeMultiplier: 2.5, name: 'O-class' }  // очень горячие голубые
    ];

    for (let i = 0; i < count; i += 1) {
      // Направление равномерно по сфере
      const u = rng();
      const v = rng();
      const theta = 2 * Math.PI * u; // азимут
      const phi = Math.acos(2 * v - 1); // полярный
      const r = radius * (0.98 + 0.04 * rng()); // тонкая сферическая «скорлупа»

      const sinPhi = Math.sin(phi);
      const x = r * sinPhi * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * sinPhi * Math.sin(theta);

      const idx = i * 3;
      positions[idx + 0] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

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
      const variation = 0.12; // небольшие вариации для естественности
      colors[idx + 0] = Math.max(0, Math.min(1, baseColor[0] * (1 + (rng() - 0.5) * variation)));
      colors[idx + 1] = Math.max(0, Math.min(1, baseColor[1] * (1 + (rng() - 0.5) * variation)));
      colors[idx + 2] = Math.max(0, Math.min(1, baseColor[2] * (1 + (rng() - 0.5) * variation)));

      // Размер звезды зависит от её типа с дополнительной случайностью
      const starSize = size * selectedType.sizeMultiplier * (1.0 + 0.5 * rng());
      sizes[i] = starSize;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: texture },
        baseOpacity: { value: baseOpacity }
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
        uniform float baseOpacity;
        varying vec3 vColor;
        varying float vSize;
        
        void main() {
          vec2 coords = gl_PointCoord;
          vec4 texColor = texture2D(pointTexture, coords);
          
          // Более мягкое свечение для ярких звезд
          float intensity = texColor.a * baseOpacity;
          if (vSize > 2.5) {
            intensity = pow(texColor.a, 0.8) * baseOpacity;
          }
          
          gl_FragColor = vec4(vColor * intensity, intensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });
    material.alphaTest = 0.1;
    material.toneMapped = false; // яркость звёзд не гасим тон-маппингом

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // не отсекать, чтобы не мерцало
    points.renderOrder = -1000; // рисуем стабильно до остального
    points.matrixAutoUpdate = false;
    return points;
  }

  addTo(scene) {
    scene.add(this.group);
  }

  /**
   * Центрируем звёзды на камере.
   */
  update(camera, _deltaTime) {
    if (camera && camera.position) {
      this.group.position.copy(camera.position);
      this.group.updateMatrix();
    }

    this.group.children.forEach(points => {
      points.updateMatrix();
    });
  }
}


