/* eslint-disable react/no-unknown-property */

import React, { useRef, useEffect, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import {useFrame, useThree} from '@react-three/fiber'

import islandScene from '../assets/3d/island.glb'

import {a} from '@react-spring/three'

const island = ({isRotating, setIsRotating, setCurrentStage, ...props}) => {

  const { nodes, materials } = useGLTF(islandScene)

  const islandRef = useRef()

  const {gl, viewport} = useThree();

  const lastX = useRef(0); // to store the last x position of the mouse
  const rotationSpeed = useRef(0); // to store the speed of the rotation

  const dampingFactor = 0.95;

  const handlePointerdown = (e) => { // when the mouse is clicked
    e.stopPropagation(); //the mouse click won't touch any other elements or function on screen
    e.preventDefault(); //the mouse click won't trigger any other events - won't reload page
    setIsRotating(true);

    const clientX = e.touches ? e.touches[0].clientX : e.clientX; // get the x position of the mouse
    lastX.current = clientX; // store the x position of the mouse
  }
  const handlePointerUp = (e) => { //release mouse
   
    setIsRotating(false);

    
  }
  const handlePointerMove = (e) => { //when the mouse is moved
   
    e.stopPropagation(); //the mouse click won't touch any other elements or function on screen
    e.preventDefault(); //the mouse click won't trigger any other events - won't reload page
    if(isRotating){
      const clientX = e.touches ? e.touches[0].clientX : e.clientX; // get the x position of the mouse
      const delta = (clientX - lastX.current) / viewport.width; // calculate the speed of the rotation
      islandRef.current.rotation.y += delta * 0.01 * Math.PI;
      lastX.current = clientX;
      rotationSpeed.current = delta * 0.01 * Math.PI;
    }
  }


  useFrame(() => {
    if(!isRotating){
      rotationSpeed.current *= dampingFactor; //damping factor
      
      if(Math.abs(rotationSpeed.current) < 0.001){
        rotationSpeed.current = 0;
      }

      islandRef.current.rotation.y += rotationSpeed.current; //adds smoothing + damping when let go scroll
    }
    
    else{
      const rotation = islandRef.current.rotation.y;
      const normalizedRotation =
        ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // Set the current stage based on the island's orientation
      switch (true) {
        case normalizedRotation >= 5.45 && normalizedRotation <= 5.85:
          setCurrentStage(4);
          break;
        case normalizedRotation >= 0.85 && normalizedRotation <= 1.3:
          setCurrentStage(3);
          break;
        case normalizedRotation >= 2.4 && normalizedRotation <= 2.6:
          setCurrentStage(2);
          break;
        case normalizedRotation >= 4.25 && normalizedRotation <= 4.75:
          setCurrentStage(1);
          break;
        default:
          setCurrentStage(null);
      }
    }

  })

  useEffect(() => { 
    const canvas = gl.domElement; //get the canvas element - attach to canvas dom

    canvas.addEventListener('pointerdown', handlePointerdown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => { //happens on exit page
      canvas.removeEventListener('pointerdown', handlePointerdown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    }
  }, [gl, handlePointerdown, handlePointerUp, handlePointerMove])
  
  const handleKeyDown = (e) => {
    if(e.key === 'ArrowLeft'){
      if(!isRotating){
        setIsRotating(true);
      }
      islandRef.current.rotation.y += 0.01 * Math.PI;
      rotationSpeed.current = 0.0125;
    }
    else if(e.key === 'ArrowRight'){
      if(!isRotating){
        setIsRotating(true);
      }
      islandRef.current.rotation.y -= 0.01 * Math.PI;
      rotationSpeed.current = -0.0125;
    }
  }
  const handleKeyUp = (e) => {
    if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
      setIsRotating(false);
    }
  }
  
  return (
    <a.group  ref={islandRef} {...props}>
      <mesh
        geometry={nodes.polySurface944_tree_body_0.geometry}
        material={materials.PaletteMaterial001}
      />
      <mesh
        
        geometry={nodes.polySurface945_tree1_0.geometry}
        material={materials.PaletteMaterial001}
      />
      <mesh
        
        
        geometry={nodes.polySurface946_tree2_0.geometry}
        material={materials.PaletteMaterial001}
      />
      <mesh
        
        
        geometry={nodes.polySurface947_tree1_0.geometry}
        material={materials.PaletteMaterial001}
      />
      <mesh
        
        
        geometry={nodes.polySurface948_tree_body_0.geometry}
        material={materials.PaletteMaterial001}
      />
      <mesh
        
        
        geometry={nodes.polySurface949_tree_body_0.geometry}
        material={materials.PaletteMaterial001}
      />
      <mesh
        
        
        geometry={nodes.pCube11_rocks1_0.geometry}
        material={materials.PaletteMaterial001}
      />
    </a.group>
  )
}

export default island;
