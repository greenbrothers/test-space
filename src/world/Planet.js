import * as THREE from 'three';
import TextureUtils from './TextureUtils.js';

export default class Planet {
  constructor({
    name = 'Planet',
    radius = 1,
    color = 0x888888,
    orbitRadius = 20,
    orbitSpeed = 0.5, // рад/сек
    rotationSpeed = 0.8, // рад/сек
    tilt = 0, // наклон оси вращения планеты (радианы)
    // Орбитальные элементы
    eccentricity = 0.0,
    inclination = 0.0, // наклон плоскости орбиты (радианы)
    ascendingNode = 0.0, // долгота восходящего узла Ω (радианы)
    argPeriapsis = 0.0, // аргумент перицентра ω (радианы)
    initialAnomaly = 0.0, // начальная средняя аномалия M0 (радианы)
    ring = null, // { innerRadius, outerRadius, color, opacity }
    atmosphere = null, // { thickness, color, intensity, fresnelPower }
    planetType = 'rocky', // 'rocky', 'gas', 'ice'
    seed = Math.random() * 1000, // для генерации кратеров
  } = {}) {
    this.name = name;
    this.orbitRadius = orbitRadius; // большая полуось a
    this.orbitSpeed = orbitSpeed;   // используем как среднее движение n
    this.rotationSpeed = rotationSpeed;
    this.eccentricity = THREE.MathUtils.clamp(eccentricity, 0, 0.95);
    this.inclination = inclination;
    this.ascendingNode = ascendingNode;
    this.argPeriapsis = argPeriapsis;
    this.meanAnomaly = initialAnomaly;

    // Корневая группа в центре звезды
    this.pivot = new THREE.Group();
    // Группа для поворота по долготе восходящего узла (вращение вокруг Y)
    this.orbitGroup = new THREE.Group();
    this.orbitGroup.rotation.y = this.ascendingNode;
    this.pivot.add(this.orbitGroup);

    // Группа наклона плоскости орбиты
    this.inclinationGroup = new THREE.Group();
    this.inclinationGroup.rotation.x = this.inclination; // наклон относительно X
    this.orbitGroup.add(this.inclinationGroup);

    // Группа ориентации перицентра в плоскости орбиты
    this.periapsisGroup = new THREE.Group();
    this.periapsisGroup.rotation.y = this.argPeriapsis;
    this.inclinationGroup.add(this.periapsisGroup);

    // Группа тела планеты (позиция вдоль эллипса)
    this.bodyGroup = new THREE.Group();
    this.periapsisGroup.add(this.bodyGroup);

    // Сохраняем параметры для создания материала
    this.radius = radius;
    this.color = color;
    this.planetType = planetType;
    this.seed = seed;

    // Геометрия планеты с большим количеством сегментов для деталей
    const geometry = new THREE.SphereGeometry(radius, 128, 64);

    // Создаем материал в зависимости от типа планеты
    const material = this.createPlanetMaterial();

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.rotation.z = tilt; // наклон оси

    // Базовая эмиссия для подсветки
    this.baseEmissive = new THREE.Color(0x000000);
    this.highlightEmissive = new THREE.Color(0xffffaa);
    this.isHighlighted = false;

    // Размещаем планету внутри bodyGroup; позиция будет обновляться каждый кадр
    this.bodyGroup.add(this.mesh);

    // Атмосфера
    if (atmosphere || planetType === 'gas') {
      this.createAtmosphere(atmosphere);
    }

    // Кольца (например, для Сатурна)
    if (ring) {
      const ringGeo = new THREE.RingGeometry(ring.innerRadius, ring.outerRadius, 64);
      // Поворачиваем UV, чтобы внутренняя часть была более прозрачна при желании
      const ringMat = new THREE.MeshBasicMaterial({
        color: ring.color ?? 0xffffff,
        transparent: true,
        opacity: ring.opacity ?? 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2; // лежит в плоскости локальной орбитальной плоскости
      this.bodyGroup.add(ringMesh);
      this.ringMesh = ringMesh;
    }

    // Линия орбиты (эллиптическая)
    this.orbit = Planet.createEllipticalOrbitLine(this.orbitRadius, this.eccentricity);
    this.periapsisGroup.add(this.orbit);
  }

  // Создание материала планеты в зависимости от типа
  createPlanetMaterial() {
    const baseColor = new THREE.Color(this.color);

    switch (this.planetType) {
      case 'gas':
        return this.createGasGiantMaterial(baseColor);
      case 'ice':
        return this.createIcePlanetMaterial(baseColor);
      case 'rocky':
      default:
        return this.createRockyPlanetMaterial(baseColor);
    }
  }

  // Материал для каменистых планет с кратерами
  createRockyPlanetMaterial(baseColor) {
    // Создаем процедурные текстуры для кратеров
    const craterTexture = this.generateCraterTexture();
    const normalTexture = this.generateNormalTexture();

    return new THREE.MeshStandardMaterial({
      color: baseColor,
      map: craterTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 1.0, // полностью матовая поверхность
      metalness: 0.0, // никакого металлического блеска
      bumpMap: craterTexture,
      bumpScale: 0.02,
    });
  }

  // Материал для газовых гигантов с полосами
  createGasGiantMaterial(baseColor) {
    const bandsTexture = this.generateGasGiantTexture();

    return new THREE.MeshStandardMaterial({
      color: baseColor,
      map: bandsTexture,
      roughness: 0.8, // менее блестящая поверхность
      metalness: 0.0, // никакого металлического блеска
      emissive: baseColor.clone().multiplyScalar(0.02), // слабое свечение
    });
  }

  // Материал для ледяных планет
  createIcePlanetMaterial(baseColor) {
    const iceTexture = this.generateIceTexture();

    return new THREE.MeshStandardMaterial({
      color: baseColor.clone().lerp(new THREE.Color(0xaaccff), 0.3),
      map: iceTexture,
      roughness: 0.4, // менее блестящий лед
      metalness: 0.0, // убираем металлический блеск
      transparent: true,
      opacity: 0.95,
    });
  }

  // Генерация текстуры кратеров
  generateCraterTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Базовый цвет поверхности с небольшими вариациями
    const baseColor = new THREE.Color(this.color);
    const rng = this.createSeededRandom(this.seed);

    // Добавляем базовую текстуру поверхности
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const variation = 0.9 + rng() * 0.2; // небольшие вариации цвета
        const surfaceColor = baseColor.clone().multiplyScalar(variation);
        ctx.fillStyle = `rgb(${Math.floor(surfaceColor.r * 255)}, ${Math.floor(surfaceColor.g * 255)}, ${Math.floor(surfaceColor.b * 255)})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Генерируем кратеры разных размеров
    const craterSizes = [
      { count: 8, minRadius: 20, maxRadius: 40, depth: 0.2 },  // большие кратеры
      { count: 15, minRadius: 10, maxRadius: 25, depth: 0.3 }, // средние кратеры
      { count: 25, minRadius: 3, maxRadius: 12, depth: 0.4 }   // маленькие кратеры
    ];

    craterSizes.forEach(craterType => {
      for (let i = 0; i < craterType.count; i++) {
        const x = rng() * size;
        const y = rng() * size;
        const radius = craterType.minRadius + rng() * (craterType.maxRadius - craterType.minRadius);

        // Создаем более реалистичный градиент для кратера
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const depthFactor = craterType.depth;
        const centerColor = baseColor.clone().multiplyScalar(0.2 + depthFactor * 0.3);
        const wallColor = baseColor.clone().multiplyScalar(0.4 + depthFactor * 0.2);
        const rimColor = baseColor.clone().multiplyScalar(1.1 + depthFactor * 0.3);

        gradient.addColorStop(0, `rgb(${Math.floor(centerColor.r * 255)}, ${Math.floor(centerColor.g * 255)}, ${Math.floor(centerColor.b * 255)})`);
        gradient.addColorStop(0.3, `rgb(${Math.floor(centerColor.r * 255)}, ${Math.floor(centerColor.g * 255)}, ${Math.floor(centerColor.b * 255)})`);
        gradient.addColorStop(0.7, `rgb(${Math.floor(wallColor.r * 255)}, ${Math.floor(wallColor.g * 255)}, ${Math.floor(wallColor.b * 255)})`);
        gradient.addColorStop(0.85, `rgb(${Math.floor(rimColor.r * 255)}, ${Math.floor(rimColor.g * 255)}, ${Math.floor(rimColor.b * 255)})`);
        gradient.addColorStop(1, `rgb(${Math.floor(baseColor.r * 255)}, ${Math.floor(baseColor.g * 255)}, ${Math.floor(baseColor.b * 255)})`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
  }

  // Генерация карты нормалей для кратеров
  generateNormalTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Базовый нормальный цвет (128, 128, 255) = (0, 0, 1) в нормализованном виде
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, size, size);

    const rng = this.createSeededRandom(this.seed + 100);
    const numCraters = Math.floor(20 + rng() * 30);

    for (let i = 0; i < numCraters; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const radius = 5 + rng() * 25;

      // Создаем градиент для нормалей кратера
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgb(128, 128, 200)'); // углубление
      gradient.addColorStop(0.7, 'rgb(128, 128, 220)');
      gradient.addColorStop(0.9, 'rgb(128, 128, 280)'); // возвышение края
      gradient.addColorStop(1, 'rgb(128, 128, 255)'); // нормальная поверхность

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
  }

  // Генерация текстуры для газовых гигантов
  generateGasGiantTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const baseColor = new THREE.Color(this.color);
    const rng = this.createSeededRandom(this.seed + 200);

    // Создаем горизонтальные полосы с шумом
    const numBands = 8 + Math.floor(rng() * 12);
    const bandHeight = size / numBands;

    for (let i = 0; i < numBands; i++) {
      const y = i * bandHeight;
      const variation = 0.3 + rng() * 0.4;
      const bandColor = baseColor.clone().multiplyScalar(variation);

      // Добавляем шум к полосам для более реалистичного вида
      for (let x = 0; x < size; x++) {
        for (let py = y; py < y + bandHeight; py++) {
          const noiseValue = TextureUtils.noise2D(x * 0.02, py * 0.01, rng);
          const turbulence = TextureUtils.noise2D(x * 0.05, py * 0.03, rng) * 0.3;

          const finalColor = bandColor.clone();
          finalColor.multiplyScalar(0.8 + (noiseValue + turbulence) * 0.4);

          ctx.fillStyle = `rgb(${Math.floor(finalColor.r * 255)}, ${Math.floor(finalColor.g * 255)}, ${Math.floor(finalColor.b * 255)})`;
          ctx.fillRect(x, py, 1, 1);
        }
      }

      // Добавляем большие вихри (Большое красное пятно на Юпитере)
      if (rng() < 0.3) {
        const vortexX = rng() * size;
        const vortexY = y + rng() * bandHeight;
        const vortexRadius = 20 + rng() * 50;

        const vortexGradient = ctx.createRadialGradient(vortexX, vortexY, 0, vortexX, vortexY, vortexRadius);
        const vortexColor = baseColor.clone().multiplyScalar(0.5 + rng() * 0.8);
        const vortexColorStr = `rgb(${Math.floor(vortexColor.r * 255)}, ${Math.floor(vortexColor.g * 255)}, ${Math.floor(vortexColor.b * 255)})`;

        vortexGradient.addColorStop(0, vortexColorStr);
        vortexGradient.addColorStop(0.6, `rgba(${Math.floor(vortexColor.r * 255)}, ${Math.floor(vortexColor.g * 255)}, ${Math.floor(vortexColor.b * 255)}, 0.5)`);
        vortexGradient.addColorStop(1, 'transparent');

        ctx.fillStyle = vortexGradient;
        ctx.beginPath();
        ctx.arc(vortexX, vortexY, vortexRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 1);
    return texture;
  }

  // Генерация текстуры для ледяных планет
  generateIceTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const baseColor = new THREE.Color(this.color).lerp(new THREE.Color(0xaaccff), 0.5);
    ctx.fillStyle = `rgb(${Math.floor(baseColor.r * 255)}, ${Math.floor(baseColor.g * 255)}, ${Math.floor(baseColor.b * 255)})`;
    ctx.fillRect(0, 0, size, size);

    const rng = this.createSeededRandom(this.seed + 300);

    // Добавляем ледяные трещины
    for (let i = 0; i < 15; i++) {
      ctx.strokeStyle = `rgba(${Math.floor(baseColor.r * 150)}, ${Math.floor(baseColor.g * 150)}, ${Math.floor(baseColor.b * 200)}, 0.7)`;
      ctx.lineWidth = 1 + rng() * 3;
      ctx.beginPath();

      const startX = rng() * size;
      const startY = rng() * size;
      ctx.moveTo(startX, startY);

      const segments = 3 + Math.floor(rng() * 5);
      for (let j = 0; j < segments; j++) {
        const endX = startX + (rng() - 0.5) * 100;
        const endY = startY + (rng() - 0.5) * 100;
        ctx.lineTo(endX, endY);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
  }

  // Создание атмосферы
  createAtmosphere(atmosphereConfig) {
    const config = atmosphereConfig || {
      thickness: this.radius * 0.12, // оптимальная толщина для мягкого эффекта
      color: this.planetType === 'gas' ? this.color : 0x88ccff,
      intensity: this.planetType === 'gas' ? 0.5 : 0.7,
      fresnelPower: 2.2 // оптимальный fresnel для мягких краев
    };

    // Создаем один основной слой атмосферы
    const atmosphereRadius = this.radius + config.thickness;
    const atmosphereGeometry = new THREE.SphereGeometry(atmosphereRadius, 64, 32);
    const atmosphereMaterial = Planet.createAtmosphereMaterial(config);

    this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    this.atmosphereMesh.renderOrder = 1;
    this.bodyGroup.add(this.atmosphereMesh);

    // Для газовых гигантов добавляем дополнительный внешний слой
    if (this.planetType === 'gas') {
      const outerRadius = this.radius + config.thickness * 1.6;
      const outerGeometry = new THREE.SphereGeometry(outerRadius, 64, 32);
      const outerConfig = {
        ...config,
        intensity: config.intensity * 0.3,
        fresnelPower: config.fresnelPower + 0.8
      };

      const outerMaterial = Planet.createAtmosphereMaterial(outerConfig);
      const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
      outerMesh.renderOrder = 2;
      this.bodyGroup.add(outerMesh);
    }
  }

  // Создание генератора случайных чисел с сидом
  createSeededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    x = x - Math.floor(x);
    return function () {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };
  }

  static createOrbitLine(radius, segments = 256, color = 0x444444) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i += 1) {
      const t = (i / segments) * Math.PI * 2;
      const x = Math.cos(t) * radius;
      const z = Math.sin(t) * radius;
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const line = new THREE.LineLoop(geometry, material);
    line.renderOrder = -1;
    return line;
  }

  static createEllipticalOrbitLine(a, e, segments = 512, color = 0x444444) {
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i += 1) {
      const E = (i / segments) * Math.PI * 2; // эксцентрическая аномалия
      const x = a * (Math.cos(E) - e);
      const z = b * Math.sin(E);
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const line = new THREE.LineLoop(geometry, material);
    line.renderOrder = -1;
    return line;
  }

  addTo(scene, origin = new THREE.Vector3(0, 0, 0)) {
    this.pivot.position.copy(origin);
    scene.add(this.pivot);
  }

  update(deltaSeconds) {
    // Средняя аномалия (упрощённо — постоянная угловая скорость)
    this.meanAnomaly += this.orbitSpeed * deltaSeconds;
    this.meanAnomaly = (this.meanAnomaly % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    // Решаем уравнение Кеплера: M = E - e sin E (Ньютон)
    const M = this.meanAnomaly;
    let E = this.eccentricity < 0.8 ? M : Math.PI;
    for (let i = 0; i < 6; i += 1) {
      const f = E - this.eccentricity * Math.sin(E) - M;
      const f1 = 1 - this.eccentricity * Math.cos(E);
      E -= f / f1;
    }

    // Положение в плоскости орбиты (фокус в начале координат)
    const a = this.orbitRadius;
    const b = a * Math.sqrt(Math.max(0, 1 - this.eccentricity * this.eccentricity));
    const x = a * (Math.cos(E) - this.eccentricity);
    const z = b * Math.sin(E);
    this.bodyGroup.position.set(x, 0, z);

    // Собственное вращение планеты
    this.mesh.rotation.y += this.rotationSpeed * deltaSeconds;
  }

  setHighlighted(flag) {
    // Оставляем только состояние, без изменения материала — свечения не будет
    this.isHighlighted = flag;
  }

  setLightPosition(lightPosition) {
    if (this.atmosphereMesh && this.atmosphereMesh.material.uniforms) {
      this.atmosphereMesh.material.uniforms.uLightPos.value.copy(lightPosition);
    }
  }

  setCameraPosition(cameraPosition) {
    if (this.atmosphereMesh && this.atmosphereMesh.material.uniforms) {
      this.atmosphereMesh.material.uniforms.uCameraPos.value.copy(cameraPosition);
    }
  }

  static createAtmosphereMaterial({ color = 0x88ccff, intensity = 1.0, fresnelPower = 3.0 }) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: intensity },
        uFresnelPower: { value: fresnelPower },
        uLightPos: { value: new THREE.Vector3(0, 0, 0) },
        uCameraPos: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vDistanceFromCenter;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          
          // Вычисляем расстояние от центра сферы для градиента плотности
          vec3 centerPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vDistanceFromCenter = distance(worldPos.xyz, centerPos);
          
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uFresnelPower;
        uniform vec3 uLightPos;
        uniform vec3 uCameraPos;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vDistanceFromCenter;

        void main() {
          vec3 N = normalize(vNormalW);
          vec3 L = normalize(uLightPos - vWorldPos);
          vec3 V = normalize(vViewDir);

          // Освещение от звезды
          float ndl = max(dot(N, L), 0.0);
          
          // Fresnel эффект - сильнее на краях
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);
          
          // Рассеяние света в атмосфере
          float scattering = pow(ndl, 0.4) * 0.8 + 0.2;
          
          // Мягкий переход от дня к ночи
          float dayNightTransition = smoothstep(-0.3, 0.3, ndl);
          
          // Основное свечение атмосферы
          float atmosphereGlow = fresnel * scattering * dayNightTransition;
          
          // Добавляем базовое свечение для ночной стороны
          atmosphereGlow += fresnel * 0.15 * (1.0 - dayNightTransition);
          
          // Применяем интенсивность
          atmosphereGlow *= uIntensity;
          
          // Создаем градиент плотности - плотнее у поверхности, разреженнее к краям
          // Инвертируем fresnel для этого эффекта
          float densityGradient = 1.0 - pow(fresnel, 0.8);
          atmosphereGlow *= densityGradient;
          
          // Ограничиваем максимальное значение
          atmosphereGlow = clamp(atmosphereGlow, 0.0, 0.8);
          
          // Альфа-канал с мягкими краями - сильнее в центре, слабее на краях
          float alpha = atmosphereGlow * (1.0 - pow(fresnel, 1.5));
          alpha = clamp(alpha, 0.0, 0.7);
          
          vec3 finalColor = uColor * atmosphereGlow;
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide, // Рендерим внешние поверхности
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }
}


