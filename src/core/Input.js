export default class Input {
  constructor(target = window) {
    this.target = target;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    this.enable();
  }

  enable() {
    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
  }

  disable() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = true; break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = true; break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = true; break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = true; break;
      case 'Space':
        this.moveUp = true; break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = true; break;
    }
  }

  _onKeyUp(event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = false; break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = false; break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = false; break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = false; break;
      case 'Space':
        this.moveUp = false; break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = false; break;
    }
  }
}


