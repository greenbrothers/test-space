import * as THREE from 'three';

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

    // Геометрия планеты
    const geometry = new THREE.SphereGeometry(radius, 48, 32);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      emissive: 0x000000,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.rotation.z = tilt; // наклон оси

    // Базовая эмиссия для подсветки
    this.baseEmissive = new THREE.Color(0x000000);
    this.highlightEmissive = new THREE.Color(0xffffaa);
    this.isHighlighted = false;

    // Размещаем планету внутри bodyGroup; позиция будет обновляться каждый кадр
    this.bodyGroup.add(this.mesh);

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

    // Атмосфера отключена
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

  setLightPosition(lightPosition) {}

  setCameraPosition(cameraPosition) {}

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
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
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

        void main() {
          vec3 N = normalize(vNormalW);
          vec3 L = normalize(uLightPos - vWorldPos);
          vec3 V = normalize(uCameraPos - vWorldPos);

          float ndl = max(dot(N, L), 0.0);
          // Ночная сторона: когда ndl маленький
          float night = smoothstep(0.45, 0.05, ndl);

          // Fresnel по взгляду — свечение у лимба
          float fres = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);

          // Уменьшаем свечение на освещённой стороне и ограничиваем максимум
          float dayDamp = smoothstep(0.0, 0.75, 1.0 - ndl); // ближе к дню -> меньше вклад
          float glow = (night * 0.45 + fres * dayDamp * 0.8) * uIntensity;
          glow = min(glow, 0.35);

          vec3 col = uColor * glow;
          gl_FragColor = vec4(col, clamp(glow, 0.0, 1.0));
        }
      `,
    });
  }
}


