import * as THREE from 'three';

/**
 * Большие туманности как аддитивные спрайты c процедурной текстурой из полупрозрачных «облаков».
 * Держим группу центрированной на камере, чтобы фон казался бесконечным.
 */
export default class Nebulae {
  constructor({
    seed = 12345,
    count = 5,
    radius = 1600,
    minScale = 300, // уменьшили минимальный размер
    maxScale = 900, // увеличили максимальный для большей вариации
    hueBase = 220, // синий-фиолетовый диапазон по умолчанию
  } = {}) {

    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;

    const rng = Nebulae.makeRng(typeof seed === 'number' ? seed : Nebulae.stringToSeed(String(seed)));

    for (let i = 0; i < count; i += 1) {
      const dir = Nebulae.randomUnitVector(rng);
      const r = radius * (0.94 + 0.06 * rng()); // тонкая сферическая оболочка
      const pos = new THREE.Vector3().copy(dir).multiplyScalar(r);

      // Больше цветового разнообразия
      const hue = (hueBase + rng() * 120 - 60 + i * 15) % 360;
      const saturation = 0.4 + 0.5 * rng();
      const lightness = 0.3 + 0.4 * rng();
      const texture = Nebulae.createNebulaTexture(1024, rng, hue, saturation, lightness);
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.premultiplyAlpha = false; // отключаем для лучшего контроля альфы
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // избегаем переворота
      texture.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        transparent: false,
        opacity: 0.25 + 0.15 * rng(),
        side: THREE.DoubleSide,
      });
      // Убираем alphaTest чтобы не было резких краев
      material.dithering = true;

      // Создаем плоскую геометрию вместо спрайта для лучшего контроля
      const geometry = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geometry, material);

      // Неравномерное масштабирование для более естественной формы
      const baseScale = THREE.MathUtils.lerp(minScale, maxScale, rng());
      const scaleVariation = 0.7 + 0.6 * rng(); // от 0.7 до 1.3
      const scaleX = baseScale * scaleVariation;
      const scaleY = baseScale * (0.7 + 0.6 * rng()); // независимая вариация по Y

      mesh.scale.set(scaleX, scaleY, 1);
      mesh.position.copy(pos);
      mesh.renderOrder = -800; // рисуем после звезд, но до планет

      // Случайная ориентация для большего разнообразия
      mesh.rotation.z = rng() * Math.PI * 2;



      // Убираем поворот к камере - туманности статичны

      this.group.add(mesh);
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
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; // xorshift32
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

  /**
   * Рисуем «дымку» из множества мягких кругов с разной прозрачностью и цветом.
   * Выглядит как приближённая фрактальная туманность, но без тяжёлого шума.
   */
  static createNebulaTexture(size, rng, hue, saturation, lightness) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;

    // Слои «тумана»: от крупных размытых к мелким, более неправильной формы
    const layers = 6 + Math.floor(rng() * 5);
    for (let l = 0; l < layers; l += 1) {
      const blobs = 120 + Math.floor(rng() * 100); // меньше блобов для более неправильной формы
      const layerHue = (hue + (rng() - 0.5) * 40) % 360; // больше вариации цвета
      const layerSat = Math.min(1, Math.max(0.2, saturation + (rng() - 0.5) * 0.3));
      const layerLight = Math.min(0.8, Math.max(0.15, lightness + (rng() - 0.5) * 0.3));

      for (let i = 0; i < blobs; i += 1) {
        // Создаем кластеры вместо равномерного распределения
        const clusterX = rng() * size;
        const clusterY = rng() * size;
        const clusterSpread = size * (0.1 + 0.3 * rng());

        const x = clusterX + (rng() - 0.5) * clusterSpread;
        const y = clusterY + (rng() - 0.5) * clusterSpread;

        // Более вытянутые и неправильные формы
        const baseRad = (size * (0.15 + 0.35 * rng())) * (1 - l * 0.08);
        const radX = baseRad * (0.6 + 0.8 * rng());
        const radY = baseRad * (0.6 + 0.8 * rng());

        const alpha = 0.005 + 0.015 * rng(); // еще более тонкие
        const distFromCenter = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY)) / (size * 0.5);
        const centerBias = Math.max(0, 1 - distFromCenter);
        const a = alpha * (0.3 + 0.7 * rng()) * centerBias;

        // Эллиптический градиент для более реалистичной формы
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.scale(radX / baseRad, radY / baseRad);

        const grd = ctx.createRadialGradient(0, 0, baseRad * 0.02, 0, 0, baseRad);
        grd.addColorStop(0, `hsla(${layerHue}, ${Math.round(layerSat * 100)}%, ${Math.round(layerLight * 100)}%, ${a})`);
        grd.addColorStop(0.7, `hsla(${layerHue}, ${Math.round(layerSat * 100)}%, ${Math.round(layerLight * 100)}%, ${a * 0.3})`);
        grd.addColorStop(1, `hsla(${layerHue}, ${Math.round(layerSat * 100)}%, ${Math.round(layerLight * 100)}%, 0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, baseRad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Тонкие яркие области — очень деликатные акценты
    const cores = 3 + Math.floor(rng() * 4); // меньше ярких областей
    for (let i = 0; i < cores; i += 1) {
      const x = size * (0.3 + 0.4 * rng()); // ближе к центру
      const y = size * (0.3 + 0.4 * rng());
      const rad = size * (0.05 + 0.08 * rng()); // меньший размер

      // Неправильная форма для ярких областей
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI * 2);
      ctx.scale(0.7 + 0.6 * rng(), 0.7 + 0.6 * rng());

      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      const coreHue = (hue + (rng() - 0.5) * 25) % 360;
      const coreAlpha = 0.04 + 0.08 * rng(); // еще более тонкие ядра
      grd.addColorStop(0, `hsla(${coreHue}, ${Math.round(saturation * 100)}%, ${Math.round((lightness + 0.15) * 100)}%, ${coreAlpha})`);
      grd.addColorStop(0.5, `hsla(${coreHue}, ${Math.round(saturation * 100)}%, ${Math.round((lightness + 0.1) * 100)}%, ${coreAlpha * 0.4})`);
      grd.addColorStop(1, `hsla(${coreHue}, ${Math.round(saturation * 100)}%, ${Math.round((lightness + 0.1) * 100)}%, 0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Создаем очень мягкую маску с множественными градиентами для полного исчезновения краев
    ctx.globalCompositeOperation = 'destination-in';

    // Основная круглая маска
    const mainMask = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 0.5);
    mainMask.addColorStop(0.0, 'rgba(255,255,255,1)');
    mainMask.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    mainMask.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    mainMask.addColorStop(0.8, 'rgba(255,255,255,0.2)');
    mainMask.addColorStop(0.95, 'rgba(255,255,255,0.05)');
    mainMask.addColorStop(1.0, 'rgba(255,255,255,0)');

    ctx.fillStyle = mainMask;
    ctx.fillRect(0, 0, size, size);

    // Дополнительные случайные мягкие маски для неправильной формы
    for (let i = 0; i < 3; i++) {
      const maskX = centerX + (rng() - 0.5) * size * 0.3;
      const maskY = centerY + (rng() - 0.5) * size * 0.3;
      const maskRadius = size * (0.3 + 0.4 * rng());

      const softMask = ctx.createRadialGradient(maskX, maskY, 0, maskX, maskY, maskRadius);
      softMask.addColorStop(0.0, 'rgba(255,255,255,0.8)');
      softMask.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      softMask.addColorStop(0.8, 'rgba(255,255,255,0.1)');
      softMask.addColorStop(1.0, 'rgba(255,255,255,0)');

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = softMask;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'destination-in';
    }

    ctx.globalCompositeOperation = 'source-over';



    return new THREE.CanvasTexture(canvas);
  }

  addTo(scene) {
    scene.add(this.group);
  }

  update(camera) {
    if (camera && camera.position) {
      this.group.position.copy(camera.position);
    }
  }
}


