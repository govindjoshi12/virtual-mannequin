import { Mat3, Mat4, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import { GUI } from "./Gui.js";
export class Attribute {
    constructor(attr) {
        this.values = attr.values;
        this.count = attr.count;
        this.itemSize = attr.itemSize;
    }
}
export class MeshGeometry {
    constructor(mesh) {
        this.position = new Attribute(mesh.position);
        this.normal = new Attribute(mesh.normal);
        if (mesh.uv) {
            this.uv = new Attribute(mesh.uv);
        }
        this.skinIndex = new Attribute(mesh.skinIndex);
        this.skinWeight = new Attribute(mesh.skinWeight);
        this.v0 = new Attribute(mesh.v0);
        this.v1 = new Attribute(mesh.v1);
        this.v2 = new Attribute(mesh.v2);
        this.v3 = new Attribute(mesh.v3);
    }
}
export class Bone {
    constructor(bone) {
        this.isHighlighted = false;
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
    rotate(rotSpeed, axis) {
        this.transI = Quat.product(this.transI, Quat.fromAxisAngle(axis, rotSpeed));
    }
    // dir is normalized in Gui
    intersect(pos, dir) {
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
        let zMin = Math.min(0, newEndp.z);
        let zMax = Math.max(0, newEndp.z);
        let tBody = this.intersectBody(pos, dir, zMin, zMax);
        return tBody;
    }
    // Parameter is endpoint - position, since position
    // is now equal to origin (position - position)
    zAxisAlignedCoords(newPosition, newEndpoint) {
        let z_axis = new Vec3([0, 0, 1]);
        let y_axis = new Vec3([0, 1, 0]);
        let x_axis = new Vec3([1, 0, 0]);
        let target = new Mat3([
            z_axis.x, z_axis.y, z_axis.z,
            x_axis.x, x_axis.y, x_axis.z,
            y_axis.x, y_axis.y, y_axis.z
        ]);
        // Actual orientation of X and Y doesn't matter as long as
        // Z axis is formed with endpoint - position, and all vectors
        // are orthogonal
        let cylinderZ = Vec3.difference(newEndpoint, newPosition);
        let cylinderY = Vec3.cross(cylinderZ, x_axis);
        let cylinderX = Vec3.cross(cylinderZ, cylinderY);
        cylinderX.normalize();
        cylinderY.normalize();
        cylinderZ.normalize();
        // Matrix with cols cylinderX, Y, and Z is the rotation matrix
        // of the cylinder. This can be interpreted as converting the
        // world coordinates to the current coordinates of the cylinder.
        // Thus the inverse should result in a matrix which transforms 
        // from cylinder coordinates to world coordinates. 
        let source = new Mat3([
            cylinderZ.x, cylinderZ.y, cylinderZ.z,
            cylinderX.x, cylinderX.y, cylinderX.z,
            cylinderY.x, cylinderY.y, cylinderY.z
        ]);
        let rot = Mat3.product(target, source.inverse());
        return rot;
    }
    intersectBody(pos, dir, zMin, zMax) {
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
            let P = GUI.rayAt(pos, dir, t1);
            let z = P.z;
            if (z >= zMin && z <= zMax) {
                return t1;
            }
        }
        if (t2 > Bone.RAY_EPSILON) {
            // Two intersections.
            let P = GUI.rayAt(pos, dir, t2);
            let z = P.z;
            if (z >= zMin && z <= zMax) {
                return t2;
            }
        }
        return Bone.NO_INTERSECT;
    }
}
Bone.RAY_EPSILON = 0; // epsilon value for "safer" collision detection
Bone.NO_INTERSECT = Number.MAX_SAFE_INTEGER; // Max value 
Bone.RADIUS = 0.1;
export class Mesh {
    constructor(mesh) {
        this.highlightedBone = null;
        this.geometry = new MeshGeometry(mesh.geometry);
        this.worldMatrix = mesh.worldMatrix.copy();
        this.rotation = mesh.rotation.copy();
        this.bones = [];
        this.rootBones = [];
        mesh.bones.forEach(bone => {
            let newBone = new Bone(bone);
            this.bones.push(newBone);
            if (newBone.parent == -1) {
                this.rootBones.push(newBone);
            }
        });
        this.bones.forEach(newBone => { this.setTransB(newBone); });
        this.materialName = mesh.materialName;
        this.imgSrc = null;
        this.boneIndices = Array.from(mesh.boneIndices);
        this.bonePositions = new Float32Array(mesh.bonePositions);
        this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
        console.log("why twice");
    }
    setTransB(bone) {
        let c = bone.initialPosition;
        let p = new Vec3([0, 0, 0]);
        if (bone.parent != -1) {
            p = this.bones[bone.parent].initialPosition;
        }
        let vec = Vec3.difference(c, p);
        let transBji = GUI.transMatrix(vec);
        bone.transB = transBji;
    }
    // Translates all root bones
    translateRoots(dir, time) {
        /* I don't know why this works. */
        for (let i = 0; i < this.rootBones.length; i++) {
            let bone = this.rootBones[0];
            bone.initialPosition = GUI.rayAt(bone.initialPosition, dir, time);
            let resMat = GUI.transMatrix(bone.initialPosition);
            this.rootBones[i].transB = resMat;
        }
    }
    setBone(bone) {
        this.highlightedBone = bone;
    }
    getBone() {
        return this.highlightedBone;
    }
    getBoneIndices() {
        return new Uint32Array(this.boneIndices);
    }
    getBonePositions() {
        return this.bonePositions;
    }
    getBoneIndexAttribute() {
        return this.boneIndexAttribute;
    }
    getBoneTranslations() {
        let trans = new Float32Array(3 * this.bones.length);
        this.bones.forEach((bone, index) => {
            let res = bone.position.xyz;
            for (let i = 0; i < res.length; i++) {
                trans[3 * index + i] = res[i];
            }
        });
        return trans;
    }
    getBoneRotations() {
        let trans = new Float32Array(4 * this.bones.length);
        this.bones.forEach((bone, index) => {
            let res = bone.rotation.xyzw;
            for (let i = 0; i < res.length; i++) {
                trans[4 * index + i] = res[i];
            }
        });
        return trans;
    }
    getBoneHighlights(translating) {
        let highlights = new Float32Array(4 * this.bones.length);
        let red = new Vec4([1.0, 0.0, 0.0, 1.0]);
        // Highlight Green if translating, Yellow if rotating
        let highlight = translating ? new Vec4([0.0, 1.0, 0.0, 1.0])
            : new Vec4([1.0, 1.0, 0.0, 1.0]);
        this.bones.forEach((bone, index) => {
            let color = bone.isHighlighted ? highlight.xyzw : red.xyzw;
            // This is the "hack" for having broken root bone highlighting;
            // Just highlight everything if translating and hold one bone
            if (this.highlightedBone != null && translating)
                color = highlight.xyzw;
            for (let i = 0; i < color.length; i++) {
                highlights[4 * index + i] = color[i];
            }
        });
        return highlights;
    }
    /* Bone Deformation Calculations */
    // Does too many unnecessary calculations
    update() {
        this.bones.forEach((bone) => {
            // LIke V2 = V1 * T
            bone.rotation = this.recursiveRotMult(bone);
            let Di = this.deformationMatrix(bone, true);
            let localBonePosition = Vec3.difference(bone.initialPosition, bone.initialPosition);
            let localBoneEndpoint = Vec3.difference(bone.initialEndpoint, bone.initialPosition);
            bone.position = Di.multiplyPt3(localBonePosition);
            bone.endpoint = Di.multiplyPt3(localBoneEndpoint);
        });
    }
    recursiveRotMult(bone) {
        if (bone.parent == -1) {
            return bone.transI;
        }
        let parent = this.recursiveRotMult(this.bones[bone.parent]);
        return Quat.product(parent, bone.transI);
    }
    deformationMatrix(bone, deformed) {
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
    setKeyframe(keyframe) {
        let rotList = keyframe.getRotations();
        let transList = keyframe.getTranslations();
        rotList.forEach((rot, index) => {
            this.bones[index].transI = rot;
        });
        transList.forEach((trans, index) => {
            this.rootBones[index].transB = trans;
        });
        this.update();
    }
    getKeyframe() {
        let rots = [];
        this.bones.forEach(bone => {
            rots.push(bone.transI.copy());
        });
        let trans = [];
        this.rootBones.forEach(bone => {
            trans.push(bone.transB.copy());
        });
        return new Keyframe(rots, trans);
    }
}
// Data Structure which represents a current keyframe
// The indices of each element in rotations maps one-to-one
// with the scene corresponding to the Keyframe.
// A Keyframe is immutable, cannot change it after it's created.
export class Keyframe {
    constructor(rots, trans) {
        this.rotations = rots;
        this.translations = trans;
    }
    getRotations() {
        return this.rotations;
    }
    getTranslations() {
        return this.translations;
    }
}
//# sourceMappingURL=Scene.js.map