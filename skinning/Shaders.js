export const floorVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aVertPos;

    varying vec4 vClipPos;

    void main () {

        gl_Position = uProj * uView * uWorld * aVertPos;
        vClipPos = gl_Position;
    }
`;
export const floorFSText = `
    precision mediump float;

    uniform mat4 uViewInv;
    uniform mat4 uProjInv;
    uniform vec4 uLightPos;

    varying vec4 vClipPos;

    void main() {
        vec4 wsPos = uViewInv * uProjInv * vec4(vClipPos.xyz/vClipPos.w, 1.0);
        wsPos /= wsPos.w;
        /* Determine which color square the position is in */
        float checkerWidth = 5.0;
        float i = floor(wsPos.x / checkerWidth);
        float j = floor(wsPos.z / checkerWidth);
        vec3 color = mod(i + j, 2.0) * vec3(1.0, 1.0, 1.0);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), vec4(0.0, 1.0, 0.0, 0.0));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(dot_nl * color, 0.0, 1.0), 1.0);
    }
`;
export const sceneVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute vec2 aUV;
    attribute vec3 aNorm;
    attribute vec4 skinIndices;
    attribute vec4 skinWeights;
    attribute vec4 v0;
    attribute vec4 v1;
    attribute vec4 v2;
    attribute vec4 v3;
    
    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;
 
    uniform vec4 lightPosition;
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 jTrans[64];
    uniform vec4 jRots[64];

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    vec3 weightedPos(int index, float weight, vec4 vertPos) {
        return weight * vec3(jTrans[index] + qtrans(jRots[index], vertPos.xyz));
    }

    vec3 weightedNormals(int index, float weight, vec3 normal) {
        return weight * vec3(qtrans(jRots[index], normal));
    }

    void main () {
        vec4 blendedVertex = vec4((weightedPos(int(skinIndices.x), skinWeights.x, v0)
                            + weightedPos(int(skinIndices.y), skinWeights.y, v1)
                            + weightedPos(int(skinIndices.z), skinWeights.z, v2)
                            + weightedPos(int(skinIndices.w), skinWeights.w, v3)), 1.0);

        vec4 worldPosition = mWorld * blendedVertex;
        gl_Position = mProj * mView * worldPosition;
        
        //  Compute light direction and transform to camera coordinates
        lightDir = lightPosition - worldPosition;
        
        vec4 aNorm4 = vec4((weightedNormals(int(skinIndices.x), skinWeights.x, aNorm)
                        + weightedNormals(int(skinIndices.y), skinWeights.y, aNorm)
                        + weightedNormals(int(skinIndices.z), skinWeights.z, aNorm)
                        + weightedNormals(int(skinIndices.w), skinWeights.w, aNorm)), 0.0);
        normal = normalize(mWorld * aNorm4);

        uv = aUV;
    }

`;
export const sceneVSText_DualQuat = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute vec2 aUV;
    attribute vec3 aNorm;
    attribute vec4 skinIndices;
    attribute vec4 skinWeights;
    attribute vec4 v0;
    attribute vec4 v1;
    attribute vec4 v2;
    attribute vec4 v3;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    uniform vec4 lightPosition;
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 jTrans[64];
    uniform vec4 jRots[64];

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    vec3 weightedPos(int index, float weight, vec4 vertPos) {
        return weight * vec3(jTrans[index] + qtrans(jRots[index], vertPos.xyz));
    }

    vec3 weightedNormals(int index, float weight, vec3 normal) {
        return weight * vec3(qtrans(jRots[index], normal));
    }

    void main () {
        vec4 blendedVertex = vec4((weightedPos(int(skinIndices.x), skinWeights.x, v0)
                            + weightedPos(int(skinIndices.y), skinWeights.y, v1)
                            + weightedPos(int(skinIndices.z), skinWeights.z, v2)
                            + weightedPos(int(skinIndices.w), skinWeights.w, v3)), 1.0);

        vec4 worldPosition = mWorld * blendedVertex;
        gl_Position = mProj * mView * worldPosition;
        
        //  Compute light direction and transform to camera coordinates
        lightDir = lightPosition - worldPosition;
        
        vec4 aNorm4 = vec4((weightedNormals(int(skinIndices.x), skinWeights.x, aNorm)
                        + weightedNormals(int(skinIndices.y), skinWeights.y, aNorm)
                        + weightedNormals(int(skinIndices.z), skinWeights.z, aNorm)
                        + weightedNormals(int(skinIndices.w), skinWeights.w, aNorm)), 0.0);
        normal = normalize(mWorld * aNorm4);

        uv = aUV;
    }
`;
export const sceneFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    void main () {
        gl_FragColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
    }
`;
export const skeletonVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute float boneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 bTrans[64];
    uniform vec4 bRots[64];
    uniform vec4 bHighlights[64];

    varying vec4 color;

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
        int index = int(boneIndex);
        color = bHighlights[index];
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
    }
`;
export const skeletonFSText = `
    precision mediump float;

    varying vec4 color;

    void main () {
        gl_FragColor = color;
    }
`;
export const sBackVSText = `
    precision mediump float;

    attribute vec2 vertPosition;

    varying vec2 uv;

    void main() {
        gl_Position = vec4(vertPosition, 0.0, 1.0);
        uv = vertPosition;
        uv.x = (1.0 + uv.x) / 2.0;
        uv.y = (1.0 + uv.y) / 2.0;
    }
`;
export const sBackFSText = `
    precision mediump float;

    varying vec2 uv;

    void main () {
        gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
        if (abs(uv.y-.33) < .005 || abs(uv.y-.67) < .005) {
            gl_FragColor = vec4(1, 1, 1, 1);
        }
    }

`;
//# sourceMappingURL=Shaders.js.map