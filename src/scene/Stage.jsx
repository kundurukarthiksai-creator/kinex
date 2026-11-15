import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Environment, Lightformer } from '@react-three/drei'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useKinex, bodies } from '../store.js'
import KinexObject from './KinexObject.jsx'
import { Bursts } from './Burst.jsx'
import { HandRig } from './HandRig.jsx'
import { world } from '../lib/exportGltf.js'
import { DYNAMIC } from './interaction.js'
import { InspectView } from './InspectView.jsx'
import { viewer, flushPendingInspect } from '../lib/viewer.js'

// The world is a photo-studio cyclorama: floor and backdrop share one color and fog
// erases the horizon, so every object reads like a product shot.
const PRESETS = {
  studio: { bg: '#E4E9EB', shadow: '#425B65', shadowO: 0.19, sky: '#FFFFFF', ground: '#B2C1C3', hemi: 0.65, key: '#FFFFFF', keyI: 1.8, env: 1.1 },
  sunset: { bg: '#EBC2AA', shadow: '#5A2E3E', shadowO: 0.28, sky: '#FFE2C6', ground: '#8C6A86', hemi: 0.5, key: '#FFB37D', keyI: 1.9, env: 0.7 },
  dawn: { bg: '#D6D0EA', shadow: '#3F3A66', shadowO: 0.22, sky: '#FBE9F3', ground: '#9EA3C8', hemi: 0.55, key: '#FFD8E6', keyI: 1.5, env: 0.8 },
  night: { bg: '#161B33', shadow: '#000000', shadowO: 0.45, sky: '#4A5AA8', ground: '#0B0E1C', hemi: 0.3, key: '#9DB0FF', keyI: 0.6, env: 0.18 },
}
const GRAVITY = { normal: [0, -9.81, 0], low: [0, -1.62, 0], zero: [0, 0, 0] }

function EnvironmentRig({ floorMat, hemi, keyLight }) {
  const { scene } = useThree()
  const preset = useKinex((s) => s.environment.preset)
  const target = useRef(PRESETS.studio)
  target.current = PRESETS[preset] || PRESETS.studio
  const c = useRef({ bg: new THREE.Color(), floor: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), key: new THREE.Color() })

  useEffect(() => {
    scene.background = new THREE.Color(PRESETS.studio.bg)
    scene.fog = new THREE.Fog(PRESETS.studio.bg, 18, 50)
  }, [scene])

  useFrame((_, dt) => {
    const p = target.current
    const k = 1 - Math.exp(-dt * 3)
    scene.background.lerp(c.current.bg.set(p.bg), k)
    scene.fog?.color.copy(scene.background)
    if (floorMat.current) {
      floorMat.current.color.lerp(c.current.floor.set(p.shadow), k)
      floorMat.current.opacity += (p.shadowO - floorMat.current.opacity) * k
    }
    if (hemi.current) {
      hemi.current.color.lerp(c.current.sky.set(p.sky), k)
      hemi.current.groundColor.lerp(c.current.ground.set(p.ground), k)
      hemi.current.intensity += (p.hemi - hemi.current.intensity) * k
    }
    if (keyLight.current) {
      keyLight.current.color.lerp(c.current.key.set(p.key), k)
      keyLight.current.intensity += (p.keyI - keyLight.current.intensity) * k
    }
    scene.environmentIntensity = (scene.environmentIntensity ?? 1) + (p.env - (scene.environmentIntensity ?? 1)) * k
  })
  return null
}

function FloorGrid() {
  const visible = useKinex((s) => s.showGrid)
  const grid = useRef()
  useEffect(() => {
    grid.current.material.transparent = true
    grid.current.material.opacity = 0.22
    grid.current.material.depthWrite = false
  }, [])
  return <gridHelper ref={grid} visible={visible} args={[50, 50, '#9FB3B8', '#C1CDCF']} position={[0, 0.003, 0]} />
}

// Turning gravity off should look like it: give everything a gentle shove upward.
function GravityKick() {
  const gravity = useKinex((s) => s.environment.gravity)
  const prev = useRef(gravity)
  useEffect(() => {
    if (gravity === 'zero' && prev.current !== 'zero') {
      bodies.forEach((b) => {
        if (b.bodyType() !== DYNAMIC) return
        b.setEnabledRotations(true, true, true, true)
        const m = b.mass()
        b.setLinearDamping(0.35)
        b.setAngularDamping(0.3)
        b.applyImpulse({ x: (Math.random() - 0.5) * m * 0.6, y: m * (0.9 + Math.random() * 0.6), z: (Math.random() - 0.5) * m * 0.4 }, true)
        b.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.5, y: (Math.random() - 0.5) * m * 0.5, z: (Math.random() - 0.5) * m * 0.5 }, true)
      })
    }
    if (prev.current === 'zero' && gravity !== 'zero')
      bodies.forEach((b) => {
        b.setLinearDamping(0.15)
        b.setAngularDamping(0.5)
        b.wakeUp()
      })
    prev.current = gravity
  }, [gravity])
  return null
}

function Room() {
  // Floor plus invisible walls and ceiling so thrown things stay in view.
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[40, 0.5, 40]} position={[0, -0.5, 0]} friction={0.9} />
      <CuboidCollider args={[0.5, 15, 40]} position={[-11, 15, 0]} />
      <CuboidCollider args={[0.5, 15, 40]} position={[11, 15, 0]} />
      <CuboidCollider args={[40, 15, 0.5]} position={[0, 15, -9]} />
      <CuboidCollider args={[40, 15, 0.5]} position={[0, 15, 6.5]} />
      <CuboidCollider args={[40, 0.5, 40]} position={[0, 8, 0]} />
    </RigidBody>
  )
}

function World() {
  const objects = useKinex((s) => s.objects)
  const epoch = useKinex((s) => s.worldEpoch)
  const projectName = useKinex((s) => s.projectName)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const root = useRef()
  useEffect(()=>{
    const group=root.current
    world.root=group
    useKinex.getState().set({viewReady:Boolean(viewer.controls)})
    return()=>{if(world.root===group){world.root=null;useKinex.getState().set({viewReady:false})}}
  },[])
  return (
    <group ref={root} name={projectName || 'world'} visible={!inspecting}>
      {objects.map((o) => (
        <KinexObject key={`${epoch}:${o.id}`} obj={o} />
      ))}
    </group>
  )
}

// Hands the camera and its controls to the viewer module (views, Inspect, gizmo).
function RegisterViewer() {
  const { camera, controls, size } = useThree()
  useEffect(() => {
    camera.fov = size.width / size.height < 0.8 ? 56 : 40
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  useEffect(() => {
    if (!controls) return
    viewer.camera = camera
    viewer.controls = controls
    controls.setLookAt(0, 4.2, 13, 0, 1.1, 0, false)
    flushPendingInspect()
    useKinex.getState().set({viewReady:Boolean(world.root)})
    return()=>{if(viewer.controls===controls){viewer.controls=null;viewer.camera=null;useKinex.getState().set({viewReady:false})}}
  }, [camera, controls])
  return null
}

export default function Stage() {
  const gravity = useKinex((s) => s.environment.gravity)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const highQuality = useKinex((s) => s.renderQuality === 'high')
  const floorMat = useRef()
  const hemi = useRef()
  const keyLight = useRef()

  return (
    <Canvas
      shadows
      dpr={highQuality ? [1.5, 2] : [1, 1.5]}
      camera={{ position: [0, 4.2, 13], fov: 40, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      className="!absolute inset-0"
      fallback={<div className="workspace-loading"><p>The 3D canvas couldn’t start. Try Chrome or Edge with hardware acceleration enabled.</p></div>}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.shadowMap.type = THREE.PCFSoftShadowMap }}
    >
      <EnvironmentRig floorMat={floorMat} hemi={hemi} keyLight={keyLight} />
      <hemisphereLight ref={hemi} args={['#FFFFFF', '#AEB4C4', 0.55]} />
      <directionalLight
        ref={keyLight}
        position={[5, 9, 6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={highQuality ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      <directionalLight position={[-6, 4, -5]} color="#BDDDE5" intensity={0.8}/>
      {/* Softboxes for reflections on metal and glass; generated locally, no network. */}
      <Environment resolution={highQuality ? 512 : 256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={2} position={[-7, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[7, 2, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" color="#2F5BFF" intensity={0.8} position={[0, 2, -8]} scale={4} />
      </Environment>

      {/* Seamless studio paper: the floor only catches shadows, so it melts into the backdrop. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <shadowMaterial ref={floorMat} transparent opacity={0.22} color="#3A3F5C" />
      </mesh>
      <FloorGrid />

      <Suspense fallback={null}>
        <Physics gravity={GRAVITY[gravity]} paused={inspecting}>
          <Room />
          <World />
          <HandRig />
        </Physics>
        <InspectView />
      </Suspense>
      <Bursts />
      <GravityKick />

      <CameraControls
        makeDefault
        minDistance={5}
        maxDistance={24}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2.08}
        smoothTime={0.35}
        draggingSmoothTime={0.12}
      />
      <RegisterViewer />
      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.25} intensity={0.45} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}
