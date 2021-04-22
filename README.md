Virtual Mannequin

    Govind Joshi (gvj84)
    Albin Shrestha (as89652)

    Extra Credit Information about bottom after write-up.

    Bone Picking
        In order to implement bone highlighting, we calculated the
        current world coordinates of the mouse position with our
        uproject method. We then shoot a ray from the eye of the 
        camera in the direction of the mouse world coordinates.
        We loop over all the bones in the mesh and call the intersect
        to check for intersection. This method translates the bone 
        to the origin and aligns it to the z-axis, and then performs
        ray-cylinder intersection. In the case multiple bones are 
        in the path of the ray, we choose the one with the lowest
        time of intersection, and remove highlights from all others.
        The bone's highlighted property is set to true, and the Mesh's 
        currently highlighted bone is set accordingly.

        We made a method in the Mesh class similar to getBoneTranslations
        which returns a Float32Array of the current set of colors for each
        bone, and all the colors are red except of the highlighted on, in 
        which case it's yellow. This passed through the vertex shader and 
        into the the fragment shader, where it's finally set as the color 
        of the corresponding pixel.

    Bone Manipulation
        In order to rotate the bones, we check to see if a bone is currently highlighted,
        there's no animation playing, and other bookkeeping. Then we change the local 
        rotation "transI" of the bone with the rotate method, which takes an axis of 
        rotation and a rotation speed. We rotate around the this.camera.foward() x mouseDir
        axis, where the x and y values of the mouseDir vector have been negated, and the
        speed is GUI.rotationSpeed. This method multiplies the current local rotation
        quaternion with the new Quaternion formed from the axis and angle. 
        
        In order to translate bones, after the mode is shifted to translation mode with 
        the shift key, dragging any of the bones translates the entire mesh in the negated
        mouseDir direction. This is done by calling the translateRoots method, which 
        takes in an array of positions, a direction, and a time. The array of positions
        passed in corresponds to the the initial positions of the root bones. For each bone
        bone.initialPosition is using the ray equation with the above parameters, and then
        a new B matrix is created for that root bone based on the the initialPosition. 

        After any rotation of bones, I call the update method. This method loops through
        every bone, and for each bone:
        1) sets the rotation equal to the recursive multiplication of the local rotations 
        up to the parent.
        2) Sets the bone position to the D matrix * [0, 0, 0, 1], which maps the local
        coordinates of the bone coordinate system to the world.
        3) Set the bone position to the D Matrix * [initialEndpoint - initialPosition]  which
        maps the bone's endpoint from local coords to world, allowing for proper highlighting

        The D Matrix is also calculated recursively, and the method deformedMatrix() takes a 
        bone and a boolean. If the boolean "deformed" is false, then instead of the T matrix
        being the bone local rotation represented as Mat4s, it's the identity matrix. This
        recursively calculates D_parent * B_child * T_child.  


    Linear-blend Skinning
        After realizing that the vectors v0...v3 in the shader represented the calculation
        U_inverse * vertPosition for each of the respective bones, linear blend skinning
        was fairly simple. The same algorithm from the skeleton shader is used to calculate
        the D matrix multiplication. Each of the weights are multiplied to the respective
        D * v_n and summed together for the blended vertex. The blended normal is calculated
        similarly, but no translation is applied.

    Key Frame Animation
        In order to do Keyframe animation, I made a Keyframe class which holds a state
        of rotations for every bone, and a state of B matrices for each root bone. 
        In the mesh class, getKeyframe returns a keyframe which represents the current
        state of the mesh, and setKeyframe takes a keyframe and sets the mesh to the
        provided orientations and translations. 

        In the draw method, if the GUI is currently in playback mode, then the GUI's 
        interpolate method is called. This method calculates the current keyframe based 
        by taking the Math.floor of the time, and using it as an index. The rotations 
        from both key frames are interpolated between using Quat.slerp, and the time
        value passed in is the decimal component of the time.
        
        The translation are interpolated between using an equation akin to the
        ray equation. Since we know these are B matrices, the translation vector is
        extracted from the last column. Since these are root bones, this vector is 
        equal to the initialPosition of the bone. A Ray is created with pos
        equal to the first keyframe's intial position, and the dir equal to
        the difference of the two. This dir is not normalized so that when t = 0, and
        the position is unchanged, and when t = 1, the position is pos + dir.
        These values are then passed into translateRoots as used for bone root translation. 


Extra Credit
    In total we completed 3 Bells and 3 Whistles along with some really awsome extra features. 

    Bone Translations (1 Whistle): 
        If you press shift, and then try to highlight a 
        bone, the entire skeleton turns green. This is to indicate translation
        of the root joints. There is a bug where the area just below any of the
        root bones specifically causes a highlight instead of the bone itself. 
        I thought this issue could be solved by setting the initialEndpoint of
        the root with the negated direction, but this hasn't fixed the issue.
        The issue is "obscured" because the entire skeleton turns green and you
        can translate the bone using any of the bones as a handle.

        Root of the issue (*Ba dum tss*): 
        (The initialEndpoint is altered in Scene.ts:282 - translateRoots())

        There is proper translation of meshes with 1 root, but
        any meshes with more than 1 root have only one of the roots moving as intended while other
        root bones seem to be moving the wrong amount, but in the right direction. Thus, the
        bones dislocate. Also, initialEndpoint is also changed in this method because
        update() is reliant on the initialEndpoint to update bone highlighting, but our
        current implementation is bugged.

        Just as above, the keyframe approach works for meshes with 
        single roots, but I don't know if it works for multiple roots because
        of the translation bug mentioned above. I couldn't test it.

    Timeline in Status Bar (1 Whistle):
        Getting a good looking timeline for the status bar woking with our project
        was actually trickier than we expected, well at least it took us longer 
        than we expected. In our draw method in App.ts we were able to draw a Rect 
        which coresponded to the percentage completion. We also implemented a rainbow 
        feature when we are in loop mode as ther is no completion time. 

    Find character model (1 Bell):
        We were able to find two character models that worked well with our 
        project on www.turbosquid.com. We had to make minor adjustments in 
        the blender like removing the texture mappings and shifting the position
        but it looks good. These are in cases 8 and 9. Case 8 is a fully woking
        verion of our model where we were able to make the bones match with the
        mesh, but in model 9 the model is much larger for some reason. Which we
        tried multiple times in blender to fix to no avial.

    Preview image of each keyframe (1 Bell):
        Everytime the user presses K, an image of the current canvas is captured
        with toDataURL (and the status bar is cropped). This image is shown on the
        Keyframe control panel.

    Arbitrary durations between keyframes (1 Bell and 1 Whistle):
        I implemented a speed slider which controls how many seconds each keyframe will last 
        for. In order to accomplish the speed changes, I scale the current time by (1 / speed);
        In this way, the integer portion of the scaled time corrsponds to the correct keyframe.
        -
        Other Feature:
        I also implemented a loop feature. When the loop switch is toggled, the last keyframe 
        in the keyframe array interpolates with the 0th keyframe, and the animation loops
        until the switch is toggle or the animation is paused. 

