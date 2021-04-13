import { Mat3, Mat4, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";

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

  public initialPosition: Vec3; // position of the bone's joint *in world coordinates*
  public initialEndpoint: Vec3; // position of the bone's second (non-joint) endpoint, in world coordinates

  public offset: number; // used when parsing the Collada file---you probably don't need to touch these
  public initialTransformation: Mat4;

  public static RAY_EPSILON: number = 0; // epsilon value for "safer" collision detection
  public static NO_INTERSECT: number = Number.MAX_SAFE_INTEGER; // Max value 
  public static RADIUS: number = 10;

  public isHighlighted : boolean = false;

  constructor(bone: BoneLoader) {
    this.parent = bone.parent;
    this.children = Array.from(bone.children);
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.rotation = bone.rotation.copy();
    this.offset = bone.offset;
    this.initialPosition = bone.initialPosition.copy();
    this.initialEndpoint = bone.initialEndpoint.copy();
    this.initialTransformation = bone.initialTransformation.copy();
  }

  public highlight() {
    this.isHighlighted = true;
  }

  public removeHighlight() {
    this.isHighlighted = false;
  }

  // dir is normalized in Gui
  public intersect(pos: Vec3, dir: Vec3): number {
    // Translate points with position at origin
    let newPosition : Vec3 = new Vec3([0, 0, 0]);
    let newEndpoint : Vec3 = Vec3.difference(this.endpoint, this.position);
    pos = Vec3.difference(pos, this.endpoint); 

    // Rotate cylinder to align with z-axis.
    // Rotate ray with same rotation matrix to 
    // maintain original ray-cylinder alignment.
    let rotMat : Mat3 = this.zAxisAlignedCoords(newPosition, newEndpoint);
    newPosition = rotMat.multiplyVec3(newPosition);
    newEndpoint = rotMat.multiplyVec3(newEndpoint);
    dir = rotMat.multiplyVec3(dir);
    dir.normalize();

    // newEndpoint[0 and 1] should be 0
    // All elements of newPosition should be 0
    let zMin: number = Math.min(newPosition.z, newEndpoint.z);
    let zMax: number = Math.max(newPosition.z, newEndpoint.z);

    let tBody = this.intersectBody(pos, dir, zMin, zMax);
    return tBody;
  }

  // Parameter is endpoint - position, since position
  // is now equal to origin (position - position)
  public zAxisAlignedCoords(newPosition: Vec3, newEndpoint: Vec3) : Mat3 {
    let x_axis = new Vec3([1, 0, 0]);

    // Actual orientation of X and Y doesn't matter as long as
    // Z axis is formed with endpoint - position, and all vectors
    // are orthogonal

    let cylinderZ : Vec3 = Vec3.difference(newEndpoint, newPosition);
    let cylinderY : Vec3 = Vec3.cross(cylinderZ, x_axis);
    let cylinderX : Vec3 = Vec3.cross(cylinderZ, cylinderY);

    cylinderX.normalize();
    cylinderY.normalize();
    cylinderZ.normalize();

    // Matrix with cols cylinderX, Y, and Z is the rotation matrix
    // of the cylinder. This can be interpreted as converting the
    // world coordinates to the current coordinates of the cylinder.
    // Thus the inverse should result in a matrix which transforms 
    // from cylinder coordinates to world coordinates. 
    let matrix : Mat3 = new Mat3([
      cylinderX.x, cylinderX.y, cylinderX.z,
      cylinderY.x, cylinderY.y, cylinderY.z,
      cylinderZ.x, cylinderZ.y, cylinderZ.z
    ]);
    return matrix.inverse();
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
      let P: Vec3 = this.rayAt(pos, dir, t1);
      let z = P.z;
      if (z >= zMin && z <= zMax) {
        return t1;
      }
    }

    if (t2 > Bone.RAY_EPSILON) {
      // Two intersections.
      let P: Vec3 = this.rayAt(pos, dir, t2);
      let z = P.z;
      if (z >= zMin && z <= zMax) {
        return t2;
      }
    }

    return Bone.NO_INTERSECT;
  }

  // Assumes t is greater than RAY_EPSILON
  private rayAt(pos: Vec3, dir: Vec3, t: number): Vec3 {
    return Vec3.sum(pos, dir.scale(t));
  }
}

export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();
    this.bones = [];
    mesh.bones.forEach(bone => {
      this.bones.push(new Bone(bone));
    });
    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
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

  public getBoneHighlights(): Float32Array {
    let highlights = new Float32Array(4 * this.bones.length);
    let red : Vec4 = new Vec4([1.0, 0.0, 0.0, 1.0]);
    let yellow : Vec4 = new Vec4([1.0, 1.0, 0.0, 1.0]);

    this.bones.forEach((bone, index) => {
      let color = bone.isHighlighted ? yellow.xyzw : red.xyzw;

      for (let i = 0; i < color.length; i++) {
        highlights[4 * index + i] = color[i];
      }
    });

    return highlights;
  }
}