import React, { useEffect, useRef } from 'react'

import birdScene from '../assets/3d/bird.glb'
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';


const Bird = () => {
    
    const birdRef = useRef();

    const {scene, animations} = useGLTF(birdScene);
    const {actions} = useAnimations(animations, birdRef);

   

    useEffect(() => {
        actions['Take 001'].play();
    }, [actions])

    useFrame(({clock, camera}) => {
        //update the y position to simulate the flight moving in a sinusoidal motion
        birdRef.current.position.y = Math.sin(clock.elapsedTime) * 0.2 + 2

        //control the x position and rotation
        if(birdRef.current.position.x > camera.position.x + 10){
            birdRef.current.rotation.y = Math.PI
        }
        else if(birdRef.current.position.x < camera.position.x - 10){
            birdRef.current.rotation.y = 0
        }

        //control rotation speed
        if(birdRef.current.rotation.y === 0){
            birdRef.current.position.x += 0.01;
            birdRef.current.position.z -= 0.01;
        }
        else{
            birdRef.current.position.x -= 0.01;
            birdRef.current.position.z += 0.01;
        }
    })

    return (
        <mesh position={[-5, 2, 1]} 
            scale = {[0.003, 0.003, 0.003]}
            ref={birdRef}>
            <primitive object={scene}/>
        </mesh>
    )
}

export default Bird
