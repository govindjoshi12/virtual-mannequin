import { Mat2, Mat3, Mat4, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";
import { GUI } from "./Gui.js";

export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null;
  skinIndex: Attribute; // which bones affect each vertex?
  skinWeight: Attribute; // with what weight?
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

export class Bone {
  public parent: number;
  public children: number[];
  public position: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*

  public transI: Quat; // Ti
  public transB: Mat4; // Bij

  public initialPosition: Vec3; // position of the bone's joint *in world coordinates*
  public initialEndpoint: Vec3; // position of the bone's second (non-joint) endpoint, in world coordinates
  public length: number; 

  public offset: number; // used when parsing the Collada file---you probably don't need to touch these
  public initialTransformation: Mat4;

  public static RAY_EPSILON: number = 0; // epsilon value for "safer" collision detection
  public static NO_INTERSECT: number = Number.MAX_SAFE_INTEGER; // Max value 
  public static RADIUS: number = 0.1;

  public isHighlighted: boolean = false;

  constructor(bone: BoneLoader) {
    this.parent = bone.parent;
    this.children = Array.from(bone.children);
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();

    // Set to identity by the loader
    this.rotation = bone.rotation.copy();
    this.transI = bone.rotation.copy();
    this.transB = Mat4.identity.copy();

    this.offset = bone.offset;
    this.initialPosition = bone.initialPosition.copy();
    this.initialEndpoint = bone.initialEndpoint.copy();
    this.initialTransformation = bone.initialTransformation.copy();

    this.length = Vec3.distance(this.initialPosition, this.initialEndpoint);
  }

  public rotate(rotSpeed: number, axis: Vec3) {
    this.transI = Quat.product(this.transI, Quat.fromAxisAngle(axis, rotSpeed));
  }

  // dir is normalized in Gui
  public intersect(pos: Vec3, dir: Vec3): number {
    let newPos = this.position;
    let newEndp = this.endpoint;
    // Alignment with Quaternions:

    // Rotate cylinder to align with z-axis.
    // Rotate ray with same rotation matrix to 
    // maintain original ray-cylinder alignment.
    // let A : Vec3 = Vec3.difference(this.endpoint, this.position).normalize();
    // let B : Vec3 = new Vec3([0, 0, 1]);

    // let axis : Vec3 = Vec3.cross(A, B);
    // let angle : number = Math.floor(Math.acos(Vec3.dot(A, B)));
    // if(angle == 180) // Cross product will be 0, so find another axis
    //   axis = Vec3.cross(A, new Vec3([1, 0, 0]));

    // if(angle > 0) {
    //   let rotQuat = Quat.fromAxisAngle(axis, angle).normalize();
    //   newPos = rotQuat.multiplyVec3(this.position);
    //   newEndp = rotQuat.multiplyVec3(this.endpoint);
    //   pos = rotQuat.multiplyVec3(pos);
    //   dir = rotQuat.multiplyVec3(dir);
    //   dir.normalize();
    // }

    // Alignment with Matrices
    let rotMat = this.zAxisAlignedCoords(newPos, newEndp);
    newPos = rotMat.multiplyVec3(this.position);
    newEndp = rotMat.multiplyVec3(this.endpoint);
    pos = rotMat.multiplyVec3(pos);
    dir = rotMat.multiplyVec3(dir);
    dir.normalize();

    pos = Vec3.difference(pos, newPos);
    newEndp = Vec3.difference(newEndp, newPos);
    // newEndpoint[0 and 1] should be 0
    // All elements of newPosition should be 0
    let zMin: number = Math.min(0, newEndp.z);
    let zMax: number = Math.max(0, newEndp.z);

    let tBody = this.intersectBody(pos, dir, zMin, zMax);
    return tBody;
  }

  // Parameter is endpoint - position, since position
  // is now equal to origin (position - position)
  public zAxisAlignedCoords(newPosition: Vec3, newEndpoint: Vec3): Mat3 {

    let z_axis = new Vec3([0, 0, 1]);
    let y_axis = new Vec3([0, 1, 0]);
    let x_axis = new Vec3([1, 0, 0]);

    let target: Mat3 = new Mat3([
      z_axis.x, z_axis.y, z_axis.z,
      x_axis.x, x_axis.y, x_axis.z,
      y_axis.x, y_axis.y, y_axis.z
    ]);

    // Actual orientation of X and Y doesn't matter as long as
    // Z axis is formed with endpoint - position, and all vectors
    // are orthogonal
    let cylinderZ: Vec3 = Vec3.difference(newEndpoint, newPosition);
    let cylinderY: Vec3 = Vec3.cross(cylinderZ, x_axis);
    let cylinderX: Vec3 = Vec3.cross(cylinderZ, cylinderY);

    cylinderX.normalize();
    cylinderY.normalize();
    cylinderZ.normalize();

    // Matrix with cols cylinderX, Y, and Z is the rotation matrix
    // of the cylinder. This can be interpreted as converting the
    // world coordinates to the current coordinates of the cylinder.
    // Thus the inverse should result in a matrix which transforms 
    // from cylinder coordinates to world coordinates. 
    let source: Mat3 = new Mat3([
      cylinderZ.x, cylinderZ.y, cylinderZ.z,
      cylinderX.x, cylinderX.y, cylinderX.z,
      cylinderY.x, cylinderY.y, cylinderY.z
    ]);

    let rot: Mat3 = Mat3.product(target, source.inverse());
    return rot;
  }

  private intersectBody(pos: Vec3, dir: Vec3, zMin: number, zMax: number): number {
    let x0 = pos.x;
    let y0 = pos.y;
    let x1 = dir.x;
    let y1 = dir.y;

    let a = x1 * x1 + y1 * y1;
    let b = 2.0 * (x0 * x1 + y0 * y1);
    let c = x0 * x0 + y0 * y0 - (Math.pow(Bone.RADIUS, 2));

    if (a == 0.0) {
      return Bone.NO_INTERSECT;
    }

    let discriminant = b * b - 4.0 * a * c;

    if (discriminant < 0.0) {
      return Bone.NO_INTERSECT;
    }

    discriminant = Math.sqrt(discriminant);

    let t2 = (-b + discriminant) / (2.0 * a);

    if (t2 <= Bone.RAY_EPSILON) {
      return Bone.NO_INTERSECT;
    }

    let t1 = (-b - discriminant) / (2.0 * a);

    if (t1 > Bone.RAY_EPSILON) {
      let P: Vec3 = GUI.rayAt(pos, dir, t1);
      let z = P.z;
      if (z >= zMin && z <= zMax) {
        return t1;
      }
    }

    if (t2 > Bone.RAY_EPSILON) {
      // Two intersections.
      let P: Vec3 = GUI.rayAt(pos, dir, t2);
      let z = P.z;
      if (z >= zMin && z <= zMax) {
        return t2;
      }
    }

    return Bone.NO_INTERSECT;
  }
}

export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;
  public highlightedBone: Bone = null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;

  public rootBones: Bone[];

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();
    
    this.bones = [];
    this.rootBones = [];
    mesh.bones.forEach(bone => {
      let newBone: Bone = new Bone(bone);
      this.bones.push(newBone);
      if(newBone.parent == -1)
        this.rootBones.push(newBone);
    });
    this.bones.forEach(newBone => {this.setTransB(newBone)});

    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
  }

  public setTransB(bone: Bone) {
    let transBji: Mat4 = Mat4.identity.copy();
    
    let c: Vec3 = bone.initialPosition;
    let p: Vec3 = new Vec3([0, 0, 0]);

    if (bone.parent != -1) {
      p = this.bones[bone.parent].initialPosition;
    }

    let vec: Vec3 = Vec3.difference(c, p);
    //console.log(vec);
    transBji = new Mat4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      vec.x, vec.y, vec.z, 1
    ]);
    bone.transB = transBji;
  }

  // Translates all root bones
  public translateRoots(pos: Vec3[], dir: Vec3, time: number) {
    let dirNormal: Vec3 = new Vec3([0, 0, 0]);
    dir.normalize(dirNormal);

    this.rootBones.forEach((bone, index) => {
      bone.initialPosition = GUI.rayAt(pos[index], dir, time);

      // Highlighting relies on endpoint, which relies on initialEndpoint
      // Need to adjust endpoint each time initialPosition is adjusted

      // This is a bug: To hide it, I just highlight the entire skeleton
      bone.initialEndpoint = GUI.rayAt(bone.initialPosition, dirNormal, bone.length);
      this.setTransB(bone);    
    });
  }

  // Root Positions
  public getRootPositions(): Vec3[] {
    let result: Vec3[] = [];
    this.rootBones.forEach(bone => {
      result.push(bone.initialPosition);
    })
    return result;
  }

  public setBone(bone: Bone) {
    this.highlightedBone = bone;
  }

  public getBone() {
    return this.highlightedBone;
  }

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public getBoneTranslations(): Float32Array {
    let trans = new Float32Array(3 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) {
        trans[3 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneRotations(): Float32Array {
    let trans = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        trans[4 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneHighlights(translating: boolean): Float32Array {
    let highlights = new Float32Array(4 * this.bones.length);
    let red: Vec4 = new Vec4([1.0, 0.0, 0.0, 1.0]);
    
    // Highlight Green if translating, Yellow if rotating
    let highlight: Vec4 = translating ? new Vec4([0.0, 1.0, 0.0, 1.0])
                                      : new Vec4([1.0, 1.0, 0.0, 1.0]);

    this.bones.forEach((bone, index) => {
      let color = bone.isHighlighted ? highlight.xyzw : red.xyzw;
      
      // This is the "hack" for having broken root bone highlighting;
      // Just highlight everything if translating and hold one bone
      if(this.highlightedBone != null && translating)
        color = highlight.xyzw;

      for (let i = 0; i < color.length; i++) {
        highlights[4 * index + i] = color[i];
      }
    });

    return highlights;
  }

  /* Bone Deformation Calculations */

  // Does too many unnecessary calculations
  public update() {
    this.bones.forEach((bone) => {
      // LIke V2 = V1 * T
      bone.rotation = this.recursiveRotMult(bone);

      let Di: Mat4 = this.deformationMatrix(bone, true);
      let localBonePosition: Vec3 = Vec3.difference(bone.initialPosition, bone.initialPosition);
      let localBoneEndpoint: Vec3 = Vec3.difference(bone.initialEndpoint, bone.initialPosition);

      bone.position = Di.multiplyPt3(localBonePosition);
      bone.endpoint = Di.multiplyPt3(localBoneEndpoint);
    })
  }

  public recursiveRotMult(bone: Bone): Quat {
    if (bone.parent == -1) {
      return bone.transI;
    }

    let parent: Quat = this.recursiveRotMult(this.bones[bone.parent]);
    return Quat.product(parent, bone.transI);
  }

  public deformationMatrix(bone: Bone, deformed: boolean): Mat4 {
    // Di = Dj * Bji * Ti
    let transI = deformed ? bone.transI.toMat4() : Mat4.identity.copy();
    let transB = bone.transB;

    let temp = Mat4.product(transB, transI);

    if (bone.parent == -1) {
      return temp;
    }

    let transD = this.deformationMatrix(this.bones[bone.parent], deformed);
    return Mat4.product(transD, temp);
  }

  /* Animation Methods */

  // Given a list of quaternions, this method sets each
  // bones rotation equal to its corresponding quaternion.
  // Convention: Each quat is the corresponding bone's
  // local rotation
  public setKeyframe(keyframe: Keyframe) {
    let rotList: Quat[] = keyframe.getRotations();
    let transList: Mat4[] = keyframe.getTranslations();

    rotList.forEach((rot, index) => {
      this.bones[index].transI = rot;
    });

    transList.forEach((trans, index) => {
      this.rootBones[index].transB = trans;
    });

    this.update();
  }

  public getKeyframe(): Keyframe {
    let rots: Quat[] = [];
    this.bones.forEach(bone => {
      rots.push(bone.transI.copy());
    });
    
    let trans: Mat4[] = []
    this.rootBones.forEach(bone => {
      trans.push(bone.transB.copy());
    })

    return new Keyframe(rots, trans);
  }
}

// Data Structure which represents a current keyframe
// The indices of each element in rotations maps one-to-one
// with the scene corresponding to the Keyframe.
// A Keyframe is immutable, cannot change it after it's created.
export class Keyframe {
  private rotations: Quat[]; // Each bone's rotation
  private translations: Mat4[]; // Root Bone Translations

  constructor(rots: Quat[], trans: Mat4[]) {
    this.rotations = rots;
    this.translations = trans;
  }

  public getRotations(): Quat[] {
    return this.rotations;
  }

  public getTranslations(): Mat4[] {
    return this.translations;
  }
}