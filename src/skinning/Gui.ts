import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { SkinningAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { Bone, Mesh, Keyframe } from "./Scene.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

export enum Mode {
  playback,
  edit
}

/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.05;
  private static readonly zoomSpeed: number = 0.1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;
  private static readonly translateSpeed: number = 0.05;

  private camera: Camera;
  private dragging: boolean;
  private fps: boolean;
  private prevX: number;
  private prevY: number;

  public modeShift: boolean;
  public hideBones: boolean;

  private height: number;
  private viewPortHeight: number;
  private width: number;

  private animation: SkinningAnimation;
  public keyframes: Keyframe[];
  public keyframeSpeedScale: number;
  public loop: boolean;

  public time: number;
  public mode: Mode;

  public static boxDiv: string = "keyframe-box";
  public static amountDiv: string = "amount";
  public static fpsToggle: string = "fps"
  public static loopToggle: string = "loop";

  public hoverX: number = 0;
  public hoverY: number = 0;
  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   * @param sponge required for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: SkinningAnimation) {
    this.height = canvas.height;
    this.viewPortHeight = this.height - 200;
    this.width = canvas.width;
    this.prevX = 0;
    this.prevY = 0;

    this.animation = animation;
    this.keyframes = [];
    this.getUIInputs();
    
    this.modeShift = false;
    this.hideBones = false;

    this.reset();

    this.registerEventListeners(canvas);
  }

  public getUIInputs() {
    let speedInp = document.getElementById(GUI.amountDiv) as HTMLInputElement;
    let fpsTog = document.getElementById(GUI.fpsToggle) as HTMLInputElement;
    let loopTog = document.getElementById(GUI.loopToggle) as HTMLInputElement;
    
    this.keyframeSpeedScale = parseFloat(speedInp.value);
    this.fps = fpsTog.checked;
    this.loop = loopTog.checked;
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.fps = false;
    this.dragging = false;
    this.time = 0;
    this.mode = Mode.edit;
    this.camera = new Camera(
      new Vec3([0, 0, -6]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.viewPortHeight,
      0.1,
      1000.0
    );
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  // Returns the mesh at index
  public getMesh(index: number): Mesh {
    return this.animation.getScene().meshes[index];
  }

  public translating(): boolean {
    return this.modeShift;
  }

  /* Animation Methods */
  public getNumKeyFrames(): number {
    // TODO
    // Used in the status bar in the GUI
    return this.keyframes.length;
  }
  public getTime(): number { return this.time; }

  public getMaxTime(): number {
    // TODO
    // The animation should stop after the last keyframe
    return this.loop ? Number.MAX_VALUE : ((this.getNumKeyFrames() - 1) * this.keyframeSpeedScale);
  }

  public incrementTime(dT: number): void {
    // Carpet bombing approach to getting current screen inputs
    this.getUIInputs();

    if (this.mode === Mode.playback) {
      this.time += dT;
      if (this.time >= this.getMaxTime()) {
        this.time = 0;
        this.mode = Mode.edit;
      }
    }
  }

  public playback(): boolean {
    return this.mode == Mode.playback;
  }

  public getModeString(): string {
    switch (this.mode) {
      case Mode.edit: { return "edit: " + this.getNumKeyFrames() + " keyframes"; }
      case Mode.playback: {
        let str = "playback: " + this.getTime().toFixed(2) + " / ";
        str += this.loop ? "∞" : this.getMaxTime().toFixed(2);
        return str;
      }
    }
  }

  public getScrollBarCur() {
    return this.getTime();
  }

  public getScrollBarMax() {
    return this.getMaxTime();
  }

  /**
   * Callback function for the start of a drag event.
   * @param mouse
   */
  public dragStart(mouse: MouseEvent): void {
    if (mouse.offsetY > 600) {
      // outside the main panel
      return;
    }

    // TODO
    // Some logic to rotate the bones, instead of moving the camera, if there is a currently highlighted bone
    this.dragging = true;
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
  }

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    let x = mouse.offsetX;
    let y = mouse.offsetY;

    if (this.dragging) {
      const dx = mouse.screenX - this.prevX;
      const dy = mouse.screenY - this.prevY;
      this.prevX = mouse.screenX;
      this.prevY = mouse.screenY;

      /* Left button, or primary button */
      let mouseDir: Vec3 = this.camera.right();
      mouseDir.scale(-dx);
      mouseDir.add(this.camera.up().scale(dy));
      mouseDir.normalize();

      if (dx === 0 && dy === 0) {
        return;
      }

      let bone: Bone = this.getMesh(0).getBone();
      if (bone != null && this.mode != Mode.playback) {
        mouseDir = new Vec3([-1 * mouseDir.x, -1 * mouseDir.y, 0]);
        if (!this.modeShift) {
          // Rotate Bone
          // Based on mouseDir, need to get quaternion that represents
          // this rotation. Then just multiply bone with quat. 
          let axis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
          bone.rotate(GUI.rotationSpeed, axis);
        } else {
          this.getMesh(0).translateRoots(mouseDir, GUI.translateSpeed);
        }

        this.getMesh(0).update();
      } else {
        switch (mouse.buttons) {
          case 1: {
            let rotAxis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
            rotAxis = rotAxis.normalize();

            if (this.fps) {
              this.camera.rotate(rotAxis, GUI.rotationSpeed);
            } else {
              this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
            }
            break;
          }
          case 2: {
            /* Right button, or secondary button */
            this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
            break;
          }
          default: {
            break;
          }
        }
      }
    } else {
      // TODO
      // You will want logic here:
      // 1) To highlight a bone, if the mouse is hovering over a bone;
      // 2) To rotate a bone, if the mouse button is pressed and currently highlighting a bone.
      let pos: Vec3 = this.camera.pos();
      let dir: Vec3 = this.unproject(x, y);

      let bones: Bone[] = this.getMesh(0).bones;
      let currBone: Bone = null;
      let currTime: number = Bone.NO_INTERSECT;

      let found = false;
      for (let i = 0; i < bones.length; i++) {
        // intersect each bone with ray
        let t = bones[i].intersect(pos, dir);
        let hl = false;
        if (t != Bone.NO_INTERSECT && t <= currTime && found == false) {
          currBone = bones[i];
          currTime = t;
          hl = true;
          found = true;
        }

        if (!hl) { this.removeHighlight(bones[i]); }
      }

      // Highlights everytime, but technically,
      // check to see if it's highlight will 
      // also happen everytime. 
      if (currBone != null)
        this.highlight(currBone);
    }
  }

  public highlight(bone: Bone) {
    bone.isHighlighted = true;
    this.getMesh(0).setBone(bone);
  }

  public removeHighlight(bone: Bone) {
    bone.isHighlighted = false;
    this.getMesh(0).setBone(null);
  }

  // Unproject Screen Coordinates to World Coordinates
  // and return a vector from camera eye to that point
  public unproject(x: number, y: number): Vec3 {
    // mouseNDC = ((2x/w)-1, 1-(2y/h), -1);
    // mouseW = inv(V) * inv(P) * mouseNDC
    // raydir = (mouseW / mouseW[3]) - eye
    // raypos = eye

    let newX: number = ((2 * x) / this.width) - 1;
    let newY: number = 1 - ((2 * y) / this.viewPortHeight);

    let mouseNDC: Vec4 = new Vec4([newX, newY, -1, 1]);

    let invV = this.viewMatrix().inverse();
    let invP = this.projMatrix().inverse();

    let mouseWorld: Vec4 = invV.multiplyVec4(invP.multiplyVec4(mouseNDC));
    mouseWorld.scale(1 / mouseWorld.w);

    let rayDir = new Vec3(mouseWorld.xyz);
    rayDir = Vec3.difference(rayDir, this.camera.pos());
    rayDir.normalize();

    return rayDir;
  }

  /**
   * Callback function for the end of a drag event
   * @param mouse
   */
  public dragEnd(mouse: MouseEvent): void {
    this.dragging = false;
    this.prevX = 0;
    this.prevY = 0;
    // Maybe your bone highlight/dragging logic needs to do stuff here too
  }

  // Zoom with Scroll Wheel
  public zoom(wheel: WheelEvent): void {
    let deltaX = wheel.deltaX;
    let deltaY = wheel.deltaY;

    let zoomAmount = 1.0 + GUI.zoomSpeed;
    if (deltaY < 0) { // Scroll up  /zoomAmount
      this.camera.zoom(1 / zoomAmount);
    }
    else if (deltaY > 0) { // Scroll down  *zoomAmount
      this.camera.zoom(zoomAmount);
    }
    //console.log("Scroll amount: " + deltaY);
  }


  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "Digit1": {
        this.animation.setScene("./static/assets/skinning/split_cube.dae");
        break;
      }
      case "Digit2": {
        this.animation.setScene("./static/assets/skinning/long_cubes.dae");
        break;
      }
      case "Digit3": {
        this.animation.setScene("./static/assets/skinning/simple_art.dae");
        break;
      }
      case "Digit4": {
        this.animation.setScene("./static/assets/skinning/mapped_cube.dae");
        break;
      }
      case "Digit5": {
        this.animation.setScene("./static/assets/skinning/robot.dae");
        break;
      }
      case "Digit6": {
        this.animation.setScene("./static/assets/skinning/head.dae");
        break;
      }
      case "Digit7": {
        this.animation.setScene("./static/assets/skinning/wolf.dae");
        break;
      }
      case "Digit8": {
        this.animation.setScene("./static/assets/skinning/HumanDae.dae");
        break;
      }
      case "Digit9": {
        this.animation.setScene("./static/assets/skinning/mob.dae");
        break;
      }
      case "KeyW": {
        this.camera.offset(
          this.camera.forward().negate(),
          GUI.zoomSpeed,
          true
        );
        break;
      }
      case "KeyA": {
        this.camera.offset(this.camera.right().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyS": {
        this.camera.offset(this.camera.forward(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyD": {
        this.camera.offset(this.camera.right(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyR": {
        // Reset animation and Keyframes
        this.animation.reset();
        this.keyframes = [];
        document.getElementById(GUI.boxDiv).innerHTML = '';
        break;
      }
      case "ShiftLeft": {
        this.modeShift = !this.modeShift;
        break;
      }
      case "ArrowLeft": {
        this.camera.roll(GUI.rollSpeed, false);
        break;
      }
      case "ArrowRight": {
        this.camera.roll(GUI.rollSpeed, true);
        break;
      }
      case "ArrowUp": {
        this.camera.offset(this.camera.up(), GUI.zoomSpeed, true);
        break;
      }
      case "ArrowDown": {
        this.camera.offset(this.camera.up().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "Space": {
        this.hideBones = !this.hideBones;
        break;
      }
      case "KeyK": {
        if (this.mode === Mode.edit) {
          // Add keyframe
          let keyframe: Keyframe = this.getMesh(0).getKeyframe();
          this.keyframes.push(keyframe);

          // TODO:
          // Set Camera to "initial position", take image, then reset camera to current position.
          this.animation.drawImage(document.getElementById(GUI.boxDiv));
        }
        break;
      }
      case "KeyP": {
        if (this.mode === Mode.edit && this.getNumKeyFrames() > 1) {
          this.mode = Mode.playback;
          this.time = 0;

        } else if (this.mode === Mode.playback) {
          this.mode = Mode.edit;
        }
        break;
      }
      case "KeyU": {
        
        break;
      }
      case "KeyI": {
        
        break;
      }
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }


  public interpolate() {
    // Current Time Scaling:
    // Ex. if speed is 0.5 seconds, once time equals 0.5, it will
    // be mapped to 1;
    let scaledTime = this.time * (1 / this.keyframeSpeedScale);
    let currentKey: number = (Math.floor(scaledTime)) % this.getNumKeyFrames();

    let idx1 = currentKey;
    let idx2 = currentKey + 1;

    if (currentKey + 1 >= this.getNumKeyFrames()) {
      if (this.loop) {
        // Loop from end of list back to beginning
        idx2 = 0;
      } else {
        this.mode = Mode.edit;
        return;
      }
    }

    // Was inititally using scaledTime - currentKey
    // Because this would remove the integer portion.
    // However, with loop this doesn't work, so I
    // am using a different operation
    let timeInterval: number = scaledTime % 1;

    let model1: Keyframe = this.keyframes[idx1];
    let model2: Keyframe = this.keyframes[idx2];

    // Find the SLERP interpolation of each bone's quaternions
    // from position in rots1 to position in rots2
    let rots1: Quat[] = model1.getRotations();
    let rots2: Quat[] = model2.getRotations();
    let resultQuats: Quat[] = [];
    for (let j = 0; j < rots1.length; j++) {
      let q1: Quat = rots1[j];
      let q2: Quat = rots2[j];

      resultQuats.push(Quat.slerp(q1, q2, timeInterval));
    }

    // Translate Roots
    let trans1: Mat4[] = model1.getTranslations();
    let trans2: Mat4[] = model2.getTranslations();
    let resultMats: Mat4[] = [];
    for(let j = 0; j < trans1.length; j++) {
      let vec1: Vec3 = GUI.getVec3(trans1[j], 3);
      let vec2: Vec3 = GUI.getVec3(trans2[j], 3);

      let resVec: Vec3 = GUI.vec3Interpolate(vec1, vec2, timeInterval);
      let resMat: Mat4 = GUI.transMatrix(resVec);

      resultMats.push(resMat);
    }

    // Update Animation
    let newKF: Keyframe = new Keyframe(resultQuats, resultMats);
    this.getMesh(0).setKeyframe(newKF);
  }

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );

    canvas.addEventListener("wheel", (wheel: WheelEvent) =>
      this.zoom(wheel)
    );

    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }

  /* Static Ray/Translation Methods */

  // Assumes t is greater than RAY_EPSILON
  public static rayAt(pos: Vec3, dir: Vec3, t: number): Vec3 {
    return Vec3.sum(pos, dir.scale(t));
  }

  public static transMatrix(vec: Vec3) {
    let transMat: Mat4 = new Mat4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      vec.x, vec.y, vec.z, 1
    ]);
    return transMat;
  }

  public static getVec3(mat: Mat4, colIndex: number) {
    let tCol = mat.col(colIndex);
    return new Vec3([tCol[0], tCol[1], tCol[2]]);
  }

  // Time should be between 0 and 1
  public static vec3Interpolate(vec1: Vec3, vec2: Vec3, time: number) {
    let dir: Vec3 = Vec3.difference(vec2, vec1);
    return GUI.rayAt(vec1, dir, time);
  }
}
