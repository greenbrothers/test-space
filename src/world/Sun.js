import * as THREE from 'three';

export default class Sun {
  constructor({ radius = 10, color = 0xffcc33, lightColor = 0xffa000, lightIntensity = 5 } = {}) {
    this.group = new THREE.Group();

    // Сфера солнца (яркая «самосветящаяся»)
    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    const material = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.group.add(this.mesh);

    // Точечный источник света от Солнца
    this.light = new THREE.PointLight(lightColor, lightIntensity, 0, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.width = 2048;
    this.light.shadow.mapSize.height = 2048;
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = 1000;
    this.group.add(this.light);

    // Корона/сияние — два спрайта с аддитивным смешением
    const coronaTexture = Sun.createRadialGradientTexture('#ffcc33', '#ffaa00');
    const coronaMaterialOuter = new THREE.SpriteMaterial({
      map: coronaTexture,
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      alphaTest: 0.05,
    });
    const coronaMaterialInner = coronaMaterialOuter.clone();
    coronaMaterialInner.depthTest = true;
    coronaMaterialInner.alphaTest = 0.05;

    this.coronaOuter = new THREE.Sprite(coronaMaterialOuter);
    this.coronaInner = new THREE.Sprite(coronaMaterialInner);
    // Рисуем корону после геометрии, но уважаем z-buffer — планеты заслоняют
    this.coronaOuter.renderOrder = 10;
    this.coronaInner.renderOrder = 11;

    const outerScale = radius * 5;
    const innerScale = radius * 3.2;
    this.coronaOuter.scale.set(outerScale, outerScale, 1);
    this.coronaInner.scale.set(innerScale, innerScale, 1);

    this.group.add(this.coronaOuter);
    this.group.add(this.coronaInner);

    // Небольшое вращение поверхности
    this.rotationSpeed = 0.15; // рад/сек (визуальное)
  }

  static createRadialGradientTexture(innerColor, outerColor) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Прозрачный фон
    ctx.clearRect(0, 0, size, size);

    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.1,
      size / 2,
      size / 2,
      size * 0.5
    );
    // Ядро яркое, к краям прозрачность убывает до 0
    // Пример: 0.0 -> 1.0, 0.35 -> 0.35, 0.7 -> 0.06, 1.0 -> 0.0
    const hexToRgb = (hex) => {
      const c = typeof hex === 'number' ? `#${hex.toString(16).padStart(6, '0')}` : hex;
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return { r, g, b };
    };
    const toRgba = (hex, a) => {
      const { r, g, b } = hexToRgb(hex);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    gradient.addColorStop(0.0, toRgba(innerColor, 1.0));
    gradient.addColorStop(0.35, toRgba(innerColor, 0.35));
    gradient.addColorStop(0.7, toRgba(outerColor, 0.06));
    gradient.addColorStop(1.0, toRgba(outerColor, 0.0));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.premultiplyAlpha = true;
    return texture;
  }

  addTo(scene, position = new THREE.Vector3(0, 0, 0)) {
    this.group.position.copy(position);
    scene.add(this.group);
  }

  update(deltaSeconds) {
    this.mesh.rotation.y += this.rotationSpeed * deltaSeconds;
  }
}


