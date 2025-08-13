import * as THREE from 'three';

export class TextureUtils {
  // Создание шума Перлина (упрощенная версия)
  static createNoiseTexture(size = 256, scale = 0.1, seed = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    
    // Простой псевдо-шум
    const rng = this.createSeededRandom(seed);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const noise = this.noise2D(x * scale, y * scale, rng);
        const value = Math.floor((noise + 1) * 127.5); // нормализуем от -1,1 к 0,255
        
        const index = (y * size + x) * 4;
        imageData.data[index] = value;     // R
        imageData.data[index + 1] = value; // G
        imageData.data[index + 2] = value; // B
        imageData.data[index + 3] = 255;   // A
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // Простая функция шума
  static noise2D(x, y, rng) {
    const intX = Math.floor(x);
    const intY = Math.floor(y);
    const fracX = x - intX;
    const fracY = y - intY;
    
    const a = this.hash2D(intX, intY, rng);
    const b = this.hash2D(intX + 1, intY, rng);
    const c = this.hash2D(intX, intY + 1, rng);
    const d = this.hash2D(intX + 1, intY + 1, rng);
    
    const i1 = this.lerp(a, b, fracX);
    const i2 = this.lerp(c, d, fracX);
    
    return this.lerp(i1, i2, fracY);
  }

  static hash2D(x, y, rng) {
    return (rng() * 2 - 1); // возвращает значение от -1 до 1
  }

  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Создание генератора случайных чисел с сидом
  static createSeededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    x = x - Math.floor(x);
    return function() {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };
  }

  // Создание текстуры облаков для газовых гигантов
  static createCloudTexture(size = 512, seed = 0, baseColor = 0xffffff) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const color = new THREE.Color(baseColor);
    const rng = this.createSeededRandom(seed);
    
    // Создаем несколько слоев шума для облаков
    for (let layer = 0; layer < 3; layer++) {
      const scale = 0.02 + layer * 0.01;
      const alpha = 0.3 - layer * 0.1;
      
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const noise = this.noise2D(x * scale, y * scale, rng);
          const intensity = (noise + 1) * 0.5; // нормализуем к 0-1
          
          if (intensity > 0.4) {
            const cloudColor = color.clone().multiplyScalar(0.8 + intensity * 0.4);
            ctx.fillStyle = `rgba(${Math.floor(cloudColor.r * 255)}, ${Math.floor(cloudColor.g * 255)}, ${Math.floor(cloudColor.b * 255)}, ${alpha})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
}

export default TextureUtils;