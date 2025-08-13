// Генератор случайной звёздной системы (с сидом)

// строка -> 32-битный сид
function stringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// xorshift32: возвращает функцию random() в [0,1)
function makeRng(seed) {
  let x = (seed >>> 0) || 123456789;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  };
}

function makeRandUtils(rng) {
  const rand = (min, max) => rng() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const choice = (arr) => arr[randInt(0, arr.length - 1)];
  return { rand, randInt, choice };
}

// HSL -> HEX (0xRRGGBB)
function hslToHex(h, s, l) {
  h = h % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) + (G << 8) + B;
}

function randomStar(rand, randInt, choice) {
  // Цвет звезды ближе к чёрнотельным оттенкам: от красноватых до белых
  const hue = rand(20, 65); // тёплые оттенки
  const saturation = rand(0.6, 0.95);
  const lightness = rand(0.5, 0.7);
  const color = hslToHex(hue, saturation, lightness);
  const lightColor = hslToHex(hue, 0.9, 0.75);
  const radius = rand(7, 16);
  // Яркость растёт ~ с площадью (упрощённо)
  const lightIntensity = Math.round(1200 + Math.pow(radius, 2) * 12);
  return { radius, color, lightColor, lightIntensity };
}

function randomName(rand, randInt, choice) {
  const syllA = ['Ar', 'Bel', 'Cor', 'Dar', 'El', 'Fen', 'Gim', 'Hel', 'Ian', 'Jar', 'Kor', 'Lum', 'Mor', 'Ner', 'Or', 'Pra', 'Qua', 'Rin', 'Sol', 'Tor', 'Ur', 'Vor', 'Wen', 'Xan', 'Yor', 'Zel'];
  const syllB = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'eo', 'ou'];
  const syllC = ['nos', 'dun', 'mir', 'the', 'ion', 'mar', 'tis', 'phos', 'x', 'zar', 'ron', 'nix', 'lith', 'bor', 'cus'];
  const parts = [choice(syllA), choice(syllB), choice(syllC)];
  if (rand(0, 1) < 0.3) parts.push(choice(syllC));
  return parts.join('');
}

function randomPlanetConfigs(starRadius, rand, randInt, choice) {
  const numPlanets = randInt(4, 10);
  const planets = [];
  let orbit = starRadius * 2.5 + rand(6, 12);
  let maxOrbit = orbit;

  for (let i = 0; i < numPlanets; i += 1) {
    const name = randomName(rand, randInt, choice);
    
    // Определяем тип планеты в зависимости от расстояния от звезды
    let planetType = 'rocky';
    let radius = rand(0.4, 1.8);
    
    if (i < 2) {
      // Внутренние планеты - каменистые, меньшего размера
      planetType = 'rocky';
      radius = rand(0.4, 1.2);
    } else if (i < 4) {
      // Средние планеты - могут быть ледяными или каменистыми
      planetType = rand(0, 1) < 0.3 ? 'ice' : 'rocky';
      radius = rand(0.8, 1.8);
    } else {
      // Внешние планеты - газовые гиганты или ледяные
      const typeRoll = rand(0, 1);
      if (typeRoll < 0.6) {
        planetType = 'gas';
        radius = rand(2.0, 4.5); // Газовые гиганты крупнее
      } else {
        planetType = 'ice';
        radius = rand(1.0, 2.2);
      }
    }

    // Цвет в зависимости от типа планеты
    let hue, saturation, lightness;
    switch (planetType) {
      case 'gas':
        // Газовые гиганты - коричневые, оранжевые, желтые тона
        hue = rand(20, 60);
        saturation = rand(0.4, 0.8);
        lightness = rand(0.4, 0.7);
        break;
      case 'ice':
        // Ледяные планеты - голубые, белые тона
        hue = rand(180, 240);
        saturation = rand(0.3, 0.7);
        lightness = rand(0.6, 0.9);
        break;
      case 'rocky':
      default:
        // Каменистые планеты - разнообразные цвета
        hue = rand(0, 360);
        saturation = rand(0.3, 0.9);
        lightness = rand(0.3, 0.7);
        break;
    }
    
    const color = hslToHex(hue, saturation, lightness);

    const orbitRadius = orbit; // полуось a
    // Kepler light: чем дальше, тем медленнее (произвольный масштаб)
    const orbitSpeed = 12 / Math.sqrt(orbitRadius + 1);
    const rotationSpeed = rand(0.5, 3.5);
    const tilt = rand(-0.6, 0.6);

    // Орбитальные параметры
    const eccentricity = Math.max(0, Math.min(0.45, rand(0.0, 0.35)));
    const inclination = rand(-0.22, 0.22); // ~ -12.6..12.6°
    const ascendingNode = rand(0, Math.PI * 2);
    const argPeriapsis = rand(0, Math.PI * 2);
    const initialAnomaly = rand(0, Math.PI * 2);

    // Вероятность колец (выше для газовых гигантов)
    let ring = null;
    const ringChance = planetType === 'gas' ? 0.4 : 0.15;
    if (rand(0, 1) < ringChance && radius > 1.2) {
      ring = {
        innerRadius: radius * rand(1.2, 1.5),
        outerRadius: radius * rand(1.8, 2.6),
        color: hslToHex(hue, Math.min(1, saturation * 0.6), Math.min(1, lightness + 0.2)),
        opacity: rand(0.35, 0.65),
      };
    }

    // Атмосфера для газовых гигантов и некоторых других планет
    let atmosphere = null;
    if (planetType === 'gas') {
      atmosphere = {
        thickness: radius * rand(0.08, 0.15),
        color: color,
        intensity: rand(0.2, 0.4),
        fresnelPower: rand(1.5, 2.5)
      };
    } else if (planetType === 'rocky' && rand(0, 1) < 0.3) {
      // Некоторые каменистые планеты имеют атмосферу
      atmosphere = {
        thickness: radius * rand(0.05, 0.1),
        color: 0x88ccff,
        intensity: rand(0.6, 1.0),
        fresnelPower: rand(2.0, 3.5)
      };
    }

    planets.push({
      name,
      radius,
      color,
      orbitRadius,
      orbitSpeed,
      rotationSpeed,
      tilt,
      ring,
      atmosphere,
      planetType,
      seed: rand(0, 1000),
      eccentricity,
      inclination,
      ascendingNode,
      argPeriapsis,
      initialAnomaly,
    });

    // Следующая орбита с разбросом
    orbit += rand(6, 12) + radius * 1.5;
    if (orbit > maxOrbit) maxOrbit = orbit;
  }

  return { planets, maxOrbit };
}

export function generateSystem(seed) {
  // если сид не задан — используем случайное число
  const seedValue = typeof seed === 'number' ? seed : stringToSeed(String(seed ?? `${Date.now()}`));
  const rng = makeRng(seedValue);
  const { rand, randInt, choice } = makeRandUtils(rng);

  const sun = randomStar(rand, randInt, choice);
  const { planets, maxOrbit } = randomPlanetConfigs(sun.radius, rand, randInt, choice);
  return { sun, planets, maxOrbit, seed: seedValue };
}

export default generateSystem;


