import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import Player from '../entities/Player.js';
import Input from './Input.js';
import Sun from '../world/Sun.js';
import Planet from '../world/Planet.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { generateSystem } from '../world/SystemGenerator.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import Stars from '../world/Stars.js';
import Nebulae from '../world/Nebulae.js';
import StarClusters from '../world/StarClusters.js';

export default class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      90, // угол обзора 
      window.innerWidth / window.innerHeight,
      0.1,
      100000
    );
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('c'),
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    // Физически корректный рендер и тон-маппинг
    this.renderer.physicallyCorrectLights = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Включаем тени для более реалистичного вида
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      if (this.ssaoPass) {
        this.ssaoPass.setSize(window.innerWidth, window.innerHeight);
      }
      if (this.outlinePass) {
        this.outlinePass.setSize(window.innerWidth, window.innerHeight);
      }
    });

    this.controls = new PointerLockControls(this.camera, document.body);
    // Снимаем возможные ограничения по горизонтали (если поддерживаются в текущей версии)
    if ('minAzimuthAngle' in this.controls) {
      this.controls.minAzimuthAngle = -Infinity;
    }
    if ('maxAzimuthAngle' in this.controls) {
      this.controls.maxAzimuthAngle = Infinity;
    }
    // Снимаем ограничения по вертикали (PointerLockControls использует min/maxPolarAngle)
    if ('minPolarAngle' in this.controls) {
      this.controls.minPolarAngle = -Infinity;
    }
    if ('maxPolarAngle' in this.controls) {
      this.controls.maxPolarAngle = Infinity;
    }
    // Отключаем внутреннюю обработку мыши и реализуем свою, без ограничений
    this.controls.enabled = false;
    this.lookSensitivity = 0.002;
    this._pitchLimit = Math.PI / 2 - 1e-4; // чуть меньше 90°, чтобы избежать сингулярности
    this._onMouseMoveLook = (e) => {
      if (!this.controls.isLocked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;

      // Инкрементальная YAW вокруг локальной оси Y камеры
      const yawDelta = -dx * this.lookSensitivity;
      if (yawDelta !== 0) {
        this.camera.rotateOnAxis(new THREE.Vector3(0, 1, 0), yawDelta);
      }

      // Инкрементальная PITCH вокруг локальной оси X камеры с клампом
      const rawPitchDelta = -dy * this.lookSensitivity;
      if (rawPitchDelta !== 0) {
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd).normalize();
        const currentPitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
        const targetPitch = THREE.MathUtils.clamp(
          currentPitch + rawPitchDelta,
          -this._pitchLimit,
          this._pitchLimit
        );
        const clampedDelta = targetPitch - currentPitch;
        if (clampedDelta !== 0) {
          this.camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), clampedDelta);
        }
      }
    };
    window.addEventListener('mousemove', this._onMouseMoveLook);
    this.scene.add(this.controls.getObject());

    this.clock = new THREE.Clock();
    this.timeScale = 0.01; // замедление вращения/орбит планет в 100 раз от реального (ещё в 10 раз медленнее текущего)

    // Постобработка Bloom
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.2,   // strength
      0.6,   // radius
      0.1    // threshold
    );
    this.composer.addPass(this.renderPass);

    // SSAO для контактных теней
    this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    this.ssaoPass.kernelRadius = 8;
    this.ssaoPass.minDistance = 2;
    this.ssaoPass.maxDistance = 50;
    this.composer.addPass(this.ssaoPass);

    // Контур выделения
    this.outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene, this.camera);
    this.outlinePass.edgeStrength = 2.0;
    this.outlinePass.edgeThickness = 0.6; // тонкий контур
    this.outlinePass.pulsePeriod = 0.0;
    this.outlinePass.visibleEdgeColor.set(0xffffaa);
    this.outlinePass.hiddenEdgeColor.set(0x000000);
    this.outlinePass.selectedObjects = [];
    this.composer.addPass(this.outlinePass);

    this.composer.addPass(this.bloomPass);

    this.player = new Player(this.scene);
    // стартовая позиция выбирается setViewMode

    this.initListeners();

    this.input = new Input(window);
    this.flySpeed = 1400; // увеличена базовая скорость W/S в 2 раза
    // Параметры разгона/торможения для W/S
    this.currentForwardSpeed = 0; // текущая скорость (со знаком)
    this.lastMoveDir = new THREE.Vector3(0, 0, -1); // последнее направление движения
    this.accelerationTime = 2.0; // до макс. скорости
    this.decelerationTime = 2.0; // до полной остановки

    // HUD для названия
    this.hudEl = document.getElementById('hud-name');
    if (this.hudEl) {
      this.hudEl.style.zIndex = '1000';
    }
    this.crosshairEl = document.getElementById('crosshair');
    this.currentHighlighted = null;
    this.followEnabled = false;
    this.followTarget = null;

    // Случайная система по сиду из URL или поля ввода
    const urlSeed = new URLSearchParams(location.search).get('seed');
    const system = generateSystem(urlSeed ?? undefined);
    this.sun = new Sun({
      radius: system.sun.radius,
      color: system.sun.color,
      lightColor: system.sun.lightColor,
      lightIntensity: system.sun.lightIntensity,
    });
    this.sun.addTo(this.scene, new THREE.Vector3(0, 0, 0));

    // Звёздный фон + туманности + скопления
    // Радиус держим меньше дальной плоскости камеры (1000), чтобы не отсекались
    const bgRadius = Math.min(900, Math.max(500, system.maxOrbit * 6));
    this.stars = new Stars({ seed: system.seed, count: 5000, radius: bgRadius });
    this.stars.addTo(this.scene);

    this.nebulae = new Nebulae({ 
      seed: system.seed * 31 + 7, 
      count: 8, // увеличиваем количество туманностей
      radius: bgRadius * 0.95,
      minScale: 400, // увеличиваем минимальный размер
      maxScale: 1200, // увеличиваем максимальный размер
      hueBase: 220 // синий-фиолетовый диапазон
    });
    this.nebulae.addTo(this.scene);

    this.starClusters = new StarClusters({
      seed: system.seed * 53 + 11,
      clusters: 6,
      radius: bgRadius * 0.9,
      clusterRadius: 90,
      pointsPerCluster: 420,
      size: 2.0,
    });
    this.starClusters.addTo(this.scene);

    // Диффузное глобальное освещение (небо/земля)
    this.hemisphere = new THREE.HemisphereLight(0x223355, 0x110a00, 0.15);
    this.scene.add(this.hemisphere);

    // Планеты по сгенерированным параметрам
    this.planets = system.planets.map((cfg) => new Planet(cfg));
    this.planets.forEach((p) => p.addTo(this.scene));

    // Базовая дистанция для разных видов камеры
    this.baseDistance = Math.max(60, system.maxOrbit + 20);

    // Режимы вида камеры и стартовый режим
    this.viewModes = ['side', 'top'];
    this.currentViewModeIdx = 1; // top по умолчанию
    this.setViewMode(this.viewModes[this.currentViewModeIdx]);

    // Инициализация UI seed
    this.initSeedUI(system.seed);

    // Инициализация UI follow
    this.initFollowUI();

    // FPS overlay
    this._fpsFrameCount = 0;
    this._fpsElapsed = 0;
    this.fpsEl = document.getElementById('fps');
    if (!this.fpsEl) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.id = 'fps';
      Object.assign(this.fpsEl.style, {
        position: 'fixed',
        left: '16px',
        bottom: '16px',
        padding: '6px 8px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, Helvetica, sans-serif',
        fontSize: '12px',
        letterSpacing: '0.3px',
        zIndex: '1001',
        backdropFilter: 'blur(6px)'
      });
      this.fpsEl.textContent = 'FPS: —';
      document.body.appendChild(this.fpsEl);
    }
  }

  initSeedUI(seedValue) {
    const input = document.getElementById('seed-input');
    const applyBtn = document.getElementById('seed-apply');
    const randomBtn = document.getElementById('seed-random');
    const info = document.getElementById('seed-info');

    if (input) input.value = String(seedValue ?? '');
    if (info) info.textContent = seedValue ? `sid=${seedValue}` : '';

    const reloadWithSeed = (seedStr) => {
      const params = new URLSearchParams(location.search);
      if (seedStr && seedStr.length > 0) params.set('seed', seedStr);
      else params.delete('seed');
      const url = `${location.pathname}?${params.toString()}`;
      location.assign(url);
    };

    if (applyBtn) {
      applyBtn.addEventListener('click', () => reloadWithSeed(input ? input.value.trim() : ''));
    }
    if (randomBtn) {
      randomBtn.addEventListener('click', () => reloadWithSeed(String(Date.now())));
    }
  }

  setViewMode(mode) {
    const yawObject = this.controls.getObject();
    const pitchObject = yawObject.children && yawObject.children[0] ? yawObject.children[0] : null;
    const resetRotations = () => {
      if (pitchObject && pitchObject.rotation) pitchObject.rotation.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      yawObject.rotation.set(0, 0, 0);
    };

    const d = this.baseDistance || 80;
    switch (mode) {
      case 'side': {
        resetRotations();
        yawObject.position.set(0, 2, d);
        break;
      }
      case 'top': {
        // Перемещаемся вверх над плоскостью орбит и смотрим на Солнце, без Euler
        resetRotations();
        yawObject.position.set(0, d, 0);
        const targetPos = new THREE.Vector3();
        if (this.sun && this.sun.group) this.sun.group.getWorldPosition(targetPos);
        this.camera.lookAt(targetPos);
        break;
      }
      default: {
        resetRotations();
        yawObject.position.set(0, 2, d);
        break;
      }
    }
    this.player.mesh.position.copy(yawObject.position);

    // UI текст
    const btn = document.getElementById('view-toggle');
    if (btn) {
      btn.textContent = `Вид: ${mode === 'top' ? 'сверху' : 'сбоку'} (V)`;
    }
  }

  initListeners() {
    document.body.addEventListener('click', () => {
      this.controls.lock();
    });

    // Переключение вида камеры: V
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV') {
        this.currentViewModeIdx = (this.currentViewModeIdx + 1) % this.viewModes.length;
        this.setViewMode(this.viewModes[this.currentViewModeIdx]);
      } else if (e.code === 'KeyF') {
        this.toggleFollow();
      }
    });

    // Кнопка UI
    const btn = document.getElementById('view-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        this.currentViewModeIdx = (this.currentViewModeIdx + 1) % this.viewModes.length;
        this.setViewMode(this.viewModes[this.currentViewModeIdx]);
        btn.textContent = `Вид: ${this.viewModes[this.currentViewModeIdx] === 'top' ? 'сверху' : 'сбоку'} (V)`;
      });
    }
  }

  initFollowUI() {
    const btn = document.getElementById('follow-toggle');
    const refreshLabel = () => {
      if (!btn) return;
      const state = this.followEnabled ? 'вкл' : 'выкл';
      btn.textContent = `Следовать: ${state} (F)`;
    };
    refreshLabel();
    if (btn) {
      btn.addEventListener('click', () => {
        this.toggleFollow();
        refreshLabel();
      });
    }
    this.refreshFollowLabel = refreshLabel;
  }

  toggleFollow() {
    this.followEnabled = !this.followEnabled;
    if (!this.followEnabled) {
      this.followTarget = null;
    } else if (this.currentHighlighted) {
      this.followTarget = this.currentHighlighted;
    }
    if (this.refreshFollowLabel) this.refreshFollowLabel();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    // FPS update (каждые ~0.5с)
    this._fpsFrameCount += 1;
    this._fpsElapsed += deltaTime;
    if (this._fpsElapsed >= 0.5) {
      const fps = Math.round(this._fpsFrameCount / this._fpsElapsed);
      if (this.fpsEl) this.fpsEl.textContent = `FPS: ${fps}`;
      this._fpsFrameCount = 0;
      this._fpsElapsed = 0;
    }

    // Движение W/S с плавным разгоном/торможением (2 секунды)
    const yawObject = this.controls.getObject();
    const desiredInput = (this.input.moveForward ? 1 : 0) + (this.input.moveBackward ? -1 : 0);
    let targetSpeed = 0;
    if (desiredInput !== 0) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir).normalize();
      // Обновляем направление движения под текущий взгляд и направление ввода
      dir.multiplyScalar(desiredInput);
      this.lastMoveDir.copy(dir);
      targetSpeed = this.flySpeed * desiredInput;
    } else {
      targetSpeed = 0;
    }

    const accelRate = this.flySpeed / Math.max(0.001, this.accelerationTime);
    const decelRate = this.flySpeed / Math.max(0.001, this.decelerationTime);
    const increasingSpeed = Math.abs(targetSpeed) > Math.abs(this.currentForwardSpeed);
    const rate = increasingSpeed ? accelRate : decelRate;
    const maxDeltaV = rate * deltaTime;
    const diff = targetSpeed - this.currentForwardSpeed;
    const clampedDeltaV = Math.abs(diff) <= maxDeltaV ? diff : Math.sign(diff) * maxDeltaV;
    this.currentForwardSpeed += clampedDeltaV;

    const moveDist = this.currentForwardSpeed * deltaTime;
    if (moveDist !== 0) {
      yawObject.position.addScaledVector(this.lastMoveDir, moveDist);
    }

    this.player.mesh.position.copy(this.controls.getObject().position);

    // Обновляем Солнце
    this.sun.update(deltaTime);
    // Обновляем фон
    if (this.stars) this.stars.update(this.camera, deltaTime);
    if (this.nebulae) this.nebulae.update(this.camera, deltaTime);
    if (this.starClusters) this.starClusters.update(this.camera, deltaTime);
    // Обновляем планеты
    const lightWorldPos = new THREE.Vector3();
    this.sun.group.getWorldPosition(lightWorldPos);
    const cameraWorldPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorldPos);
    this.planets.forEach((p) => {
      p.update(deltaTime * this.timeScale);
      p.setLightPosition(lightWorldPos);
      p.setCameraPosition(cameraWorldPos);
    });

    // Лучевой тест под прицел (центр экрана)
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2(0, 0); // центр
    raycaster.setFromCamera(ndc, this.camera);
    const planetMeshes = this.planets.map((p) => p.mesh);
    const hit = raycaster.intersectObjects(planetMeshes, false)[0];

    // Снимаем подсветку со старой планеты
    if (this.currentHighlighted && (!hit || this.currentHighlighted.mesh !== hit.object)) {
      this.currentHighlighted.setHighlighted(false);
      this.currentHighlighted = null;
    }

    if (hit && hit.object) {
      const planet = this.planets.find((p) => p.mesh === hit.object);
      if (planet) {
        // HUD
        if (this.hudEl) {
          this.hudEl.textContent = planet.name;
          this.hudEl.style.opacity = '1';
        }
        // Подсветка
        planet.setHighlighted(true);
        this.currentHighlighted = planet;
        this.outlinePass.selectedObjects = [planet.mesh];
        if (this.followEnabled) this.followTarget = planet;
      }
    } else {
      if (this.hudEl) this.hudEl.style.opacity = '0';
      this.outlinePass.selectedObjects = [];
    }

    // Следование камерой
    if (this.followEnabled && this.followTarget) {
      const targetPos = new THREE.Vector3();
      this.followTarget.mesh.getWorldPosition(targetPos);
      const yawObject = this.controls.getObject();
      const dir = new THREE.Vector3().subVectors(targetPos, yawObject.position);
      const dist = dir.length();
      const desiredDist = 10 + this.followTarget.mesh.geometry.parameters.radius * 3;
      dir.normalize();
      // лаг-смещение камеры
      const followSpeed = 2.0; // сглаживание
      const offset = dist - desiredDist;
      yawObject.position.addScaledVector(dir, offset * Math.min(1, followSpeed * (this.clock.getDelta())));
      this.player.mesh.position.copy(yawObject.position);
      // Смотрим на планету
      this.camera.lookAt(targetPos);
    }

    this.composer.render();
  }

  start() {
    this.animate();
  }
}


