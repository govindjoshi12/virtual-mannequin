import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { Floor } from "../lib/webglutils/Floor.js";
import { GUI, Mode } from "./Gui.js";
import {
  sceneFSText,
  sceneVSText,
  floorFSText,
  floorVSText,
  skeletonFSText,
  skeletonVSText,
  sBackVSText,

  sBackFSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { CLoader } from "./AnimationFileLoader.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";

export class SkinningAnimation extends CanvasAnimation {
  private gui: GUI;
  private millis: number;

  private loadedScene: string;

  /* Floor Rendering Info */
  private floor: Floor;
  private floorRenderPass: RenderPass;

  /* Scene rendering info */
  private scene: CLoader;
  private sceneRenderPass: RenderPass;

  /* Skeleton rendering info */
  private skeletonRenderPass: RenderPass;

  /* Bone Highlighting rendering info */
  private boneRenderPass: RenderPass;

  /* Scrub bar background rendering info */
  private sBackRenderPass: RenderPass;


  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private ctx2: CanvasRenderingContext2D | null;

  /* Loop Gradient Variables */
  private gradx: number;
  private grady: number;
  private gradMax: number;


  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    this.ctx2 = this.canvas2d.getContext("2d");
    if (this.ctx2) {
      this.ctx2.font = "25px serif";
      this.ctx2.fillStyle = "#ffffffff";
    }

    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;

    this.floor = new Floor();

    this.floorRenderPass = new RenderPass(this.extVAO, gl, floorVSText, floorFSText);
    this.sceneRenderPass = new RenderPass(this.extVAO, gl, sceneVSText, sceneFSText);
    this.skeletonRenderPass = new RenderPass(this.extVAO, gl, skeletonVSText, skeletonFSText);

    this.gui = new GUI(this.canvas2d, this);
    this.lightPosition = new Vec4([-10, 10, -10, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);

    this.initFloor();
    this.scene = new CLoader("");

    // Status bar
    this.sBackRenderPass = new RenderPass(this.extVAO, gl, sBackVSText, sBackFSText);
    this.gradx = 0;
    this.grady = 0;
    this.gradMax = 35; // Arbitrary, from code pen;

    // TODO
    // Other initialization, for instance, for the bone highlighting

    this.initGui();
    this.millis = new Date().getTime();
  }

  public getScene(): CLoader {
    return this.scene;
  }

  /**
   * Setup the animation. This can be called again to reset the animation.
   */
  public reset(): void {
    this.gui.reset();
    this.setScene(this.loadedScene);
  }

  // Appends current state of canvas to 
  // htmlElement parameter
  public drawImage(htmlElement: Element) {
    let image = new Image();
    image.src = this.c.toDataURL();
    image.width = 128;
    image.height = 128;
    image.classList.add('keyframe-image');
    image.classList.add('draggable');

    let node = document.createElement('li');
    node.appendChild(image);
    node.classList.add('keyframe-list');

    htmlElement.appendChild(node);
  }

  public initGui(): void {

    // Status bar background
    let verts = new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]);
    this.sBackRenderPass.setIndexBufferData(new Uint32Array([1, 0, 2, 2, 0, 3]))
    this.sBackRenderPass.addAttribute("vertPosition", 2, this.ctx.FLOAT, false,
      2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, verts);

    this.sBackRenderPass.setDrawData(this.ctx.TRIANGLES, 6, this.ctx.UNSIGNED_INT, 0);
    this.sBackRenderPass.setup();

  }

  public initScene(): void {
    if (this.scene.meshes.length === 0) { return; }
    this.initModel();
    this.initSkeleton();
    this.gui.reset();
  }

  /**
   * Sets up the mesh and mesh drawing
   */
  public initModel(): void {
    this.sceneRenderPass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);

    let faceCount = this.scene.meshes[0].geometry.position.count / 3;
    let fIndices = new Uint32Array(faceCount * 3);
    for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
    }
    this.sceneRenderPass.setIndexBufferData(fIndices);

    this.sceneRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.position.values);
    this.sceneRenderPass.addAttribute("aNorm", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.normal.values);
    if (this.scene.meshes[0].geometry.uv) {
      this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.uv.values);
    } else {
      this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(this.scene.meshes[0].geometry.normal.values.length));
    }
    this.sceneRenderPass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinIndex.values);
    this.sceneRenderPass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinWeight.values);
    this.sceneRenderPass.addAttribute("v0", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v0.values);
    this.sceneRenderPass.addAttribute("v1", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v1.values);
    this.sceneRenderPass.addAttribute("v2", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v2.values);
    this.sceneRenderPass.addAttribute("v3", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v3.values);

    this.sceneRenderPass.addUniform("lightPosition",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      });
    this.sceneRenderPass.addUniform("mWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(new Mat4().setIdentity().all()));
      });
    this.sceneRenderPass.addUniform("mProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    this.sceneRenderPass.addUniform("mView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    this.sceneRenderPass.addUniform("jTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform3fv(loc, this.scene.meshes[0].getBoneTranslations());
      });
    this.sceneRenderPass.addUniform("jRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.scene.meshes[0].getBoneRotations());
      });

    this.sceneRenderPass.setDrawData(this.ctx.TRIANGLES, this.scene.meshes[0].geometry.position.count, this.ctx.UNSIGNED_INT, 0);
    this.sceneRenderPass.setup();
  }

  /**
   * Sets up the skeleton drawing
   */
  public initSkeleton(): void {
    this.skeletonRenderPass.setIndexBufferData(this.scene.meshes[0].getBoneIndices());

    this.skeletonRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].getBonePositions());
    this.skeletonRenderPass.addAttribute("boneIndex", 1, this.ctx.FLOAT, false,
      1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].getBoneIndexAttribute());

    this.skeletonRenderPass.addUniform("mWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
      });
    this.skeletonRenderPass.addUniform("mProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    this.skeletonRenderPass.addUniform("mView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    this.skeletonRenderPass.addUniform("bTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform3fv(loc, this.getScene().meshes[0].getBoneTranslations());
      });
    this.skeletonRenderPass.addUniform("bRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.getScene().meshes[0].getBoneRotations());
      });

    this.skeletonRenderPass.addUniform("bHighlights",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.getScene().meshes[0].getBoneHighlights(this.getGUI().translating()));
      });

    this.skeletonRenderPass.setDrawData(this.ctx.LINES,
      this.scene.meshes[0].getBoneIndices().length, this.ctx.UNSIGNED_INT, 0);
    this.skeletonRenderPass.setup();
  }


  /**
   * Sets up the floor drawing
   */
  public initFloor(): void {
    this.floorRenderPass.setIndexBufferData(this.floor.indicesFlat());
    this.floorRenderPass.addAttribute("aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.floor.positionsFlat()
    );

    this.floorRenderPass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      });
    this.floorRenderPass.addUniform("uWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
      });
    this.floorRenderPass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    this.floorRenderPass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    this.floorRenderPass.addUniform("uProjInv",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().inverse().all()));
      });
    this.floorRenderPass.addUniform("uViewInv",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().inverse().all()));
      });

    this.floorRenderPass.setDrawData(this.ctx.TRIANGLES, this.floor.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.floorRenderPass.setup();
  }


  /** @internal
   * Draws a single frame
   *
   */
  public draw(): void {
    // Advance to the next time step
    let curr = new Date().getTime();
    let deltaT = curr - this.millis;
    this.millis = curr;
    deltaT /= 1000;
    this.getGUI().incrementTime(deltaT);

    // TODO
    // If the mesh is animating, probably you want to do some updating of the skeleton state here
    if (this.getGUI().playback())
      this.getGUI().interpolate();

    // draw the status message
    if (this.ctx2) {
      this.ctx2.clearRect(0, 0, this.ctx2.canvas.width, this.ctx2.canvas.height);
      if (this.scene.meshes.length > 0) {
        this.ctx2.fillText(this.getGUI().getModeString(), 50, 710);

        let max = this.getGUI().getScrollBarMax();
        let val = this.getGUI().getScrollBarCur();
        let widthOffset = 10;
        let heightOffset = 735;
        let width = this.ctx2.canvas.width;
        let height = 1;
        let color = '#ffffff';

        // Case where we're currently looping
        if (this.getGUI().playback()) {
          if (max == Number.MAX_VALUE) {
            //https://codepen.io/tmrDevelops/pen/vOPZBv

            // Increment conditionally based on time
            // to slow down the gradient
            let t = this.getGUI().time;

            if((t * 1000) % 5 == 0) {
              this.grady++;
              if (this.grady >= this.gradMax) {
                this.grady = 0;
                this.gradx++;
              }

              if (this.gradx >= this.gradMax) {
                this.gradx = 0;
              }
            }            

            let r = this.getR(this.gradx, this.grady, t);
            let g = this.getG(this.gradx, this.grady, t);
            let b = this.getB(this.gradx, this.grady, t);
            color = this.rgb(r, g, b);

            this.ctx2.fillStyle = color;
            this.ctx2.fillRect(0, heightOffset, width, height + heightOffset);
          }
          else {
            // Playback
            this.ctx2.fillStyle = color;
            let percent = Math.min(Math.max(val / max, 0), 1);
            this.ctx2.fillRect(0, heightOffset, percent * width, height + heightOffset);
          }
        }

      }
    }

    // Drawing
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 200, 800, 600);

    /* Draw status bar */
    if (this.scene.meshes.length > 0) {
      gl.viewport(0, 0, 800, 200);
      this.sBackRenderPass.draw();
    }

  }

  // Gradient Animation Methods
  public rgb(r: number, g: number, b: number) {
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  public getR(x: number, y: number, t: number) {
    return (Math.floor(192 + 64 * Math.cos((x * x - y * y) / 300 + t)));
  }

  public getG(x: number, y: number, t: number) {
    return (Math.floor(192 + 64 * Math.sin((x * x * Math.cos(t / 4) + y * y * Math.sin(t / 3)) / 300)));
  }

  public getB(x: number, y: number, t: number) {
    return (Math.floor(192 + 64 * Math.sin(5 * Math.sin(t / 9) + ((x - 100) * (x - 100) + (y - 100) * (y - 100)) / 1100)));
  }
  // Done with Gradient Animation Methods

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    this.floorRenderPass.draw();

    /* Draw Scene */
    if (this.scene.meshes.length > 0) {
      this.sceneRenderPass.draw();
      gl.disable(gl.DEPTH_TEST);

      if (!this.getGUI().hideBones)
        this.skeletonRenderPass.draw();

      // TODO
      // Also draw the highlighted bone (if applicable)
      // this.boneRenderPass.draw();
      gl.enable(gl.DEPTH_TEST);
    }
  }



  public getGUI(): GUI {
    return this.gui;
  }

  /**
   * Loads and sets the scene from a Collada file
   * @param fileLocation URI for the Collada file
   */
  public setScene(fileLocation: string): void {
    this.loadedScene = fileLocation;
    this.scene = new CLoader(fileLocation);
    this.scene.load(() => this.initScene());
    
    // GUI Ops
    this.getGUI().keyframes = [];
    document.getElementById(GUI.boxDiv).innerHTML = '';

    this.getGUI().loop = false;
    let toggle = document.getElementById(GUI.loopToggle) as HTMLInputElement;
    toggle.checked = false;
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: SkinningAnimation = new SkinningAnimation(canvas);
  canvasAnimation.start();
  canvasAnimation.setScene("/static/assets/skinning/split_cube.dae");
  // this.ctx.getImageData(this.x, this.y, this.width, this.height);
}
