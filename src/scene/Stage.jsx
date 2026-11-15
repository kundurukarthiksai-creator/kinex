import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Environment, Lightformer } from '@react-three/drei'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useKinex } from '../store.js'
import KinexObject from './KinexObject.jsx'
import { Bursts } from './Burst.jsx'
import { HandRig } from './HandRig.jsx'
import { world } from '../lib/exportGltf.js'
import { InspectView } from './InspectView.jsx'
import { ModelView } from './ModelView.jsx'
import { viewer } from '../lib/viewer.js'

// The world is a photo-studio cyclorama: floor and backdrop share one color and fog
// erases the horizon, so every object reads like a product shot.
const PRESETS = {
  studio: { bg: '#D8DCE6', sky: '#FFFFFF', ground: '#AEB4C4', hemi: 0.55, key: '#FFFFFF', keyI: 1.6, env: 0.9 },
  sunset: { bg: '#EBC2AA', sky: '#FFE2C6', ground: '#8C6A86', hemi: 0.5, key: '#FFB37D', keyI: 1.9, env: 0.7 },
  dawn: { bg: '#D6D0EA', sky: '#FBE9F3', ground: '#9EA3C8', hemi: 0.55, key: '#FFD8E6', keyI: 1.5, env: 0.8 },
  night: { bg: '#161B33', sky: '#4A5AA8', ground: '#0B0E1C', hemi: 0.3, key: '#9DB0FF', keyI: 0.6, env: 0.18 },
}
// No ground and no gravity: models float in the studio.
const NO_GRAVITY = [0, 0, 0]

function EnvironmentRig({ hemi, keyLight }) {
  const { scene } = useThree()
  const preset = useKinex((s) => s.environment.preset)
  const target = useRef(PRESETS.studio)
  target.current = PRESETS[preset] || PRESETS.studio
  const c = useRef({ bg: new THREE.Color(), floor: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), key: new THREE.Color() })

  useEffect(() => {
    scene.background = new THREE.Color(PRESETS.studio.bg)
  }, [scene])

  useFrame((_, dt) => {
    const p = target.current
    const k = 1 - Math.exp(-dt * 3)
    scene.background.lerp(c.current.bg.set(p.bg), k)
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

function Room() {
  // No visible floor. An invisible box all around keeps thrown models in view.
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[40, 0.5, 40]} position={[0, -5.5, 0]} />
      <CuboidCollider args={[0.5, 15, 40]} position={[-11, 0, 0]} />
      <CuboidCollider args={[0.5, 15, 40]} position={[11, 0, 0]} />
      <CuboidCollider args={[40, 15, 0.5]} position={[0, 0, -9]} />
      <CuboidCollider args={[40, 15, 0.5]} position={[0, 0, 6.5]} />
      <CuboidCollider args={[40, 0.5, 40]} position={[0, 8, 0]} />
    </RigidBody>
  )
}

function World() {
  const objects = useKinex((s) => s.objects)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const modelOpen = useKinex((s) => Boolean(s.model))
  const root = useRef()
  useEffect(() => {
    world.root = root.current
  }, [])
  return (
    <group ref={root} name="world" visible={!inspecting && !modelOpen}>
      {objects.map((o) => (
        <KinexObject key={o.id} obj={o} />
      ))}
    </group>
  )
}

// Hands the camera and its controls to the viewer module (views, Inspect, gizmo).
function RegisterViewer() {
  const { camera, controls } = useThree()
  useEffect(() => {
    if (!controls) return
    viewer.camera = camera
    viewer.controls = controls
    controls.setLookAt(0, 4.2, 13, 0, 1.1, 0, false)
  }, [camera, controls])
  return null
}

export default function Stage() {
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const modelOpen = useKinex((s) => Boolean(s.model))
  const hemi = useRef()
  const keyLight = useRef()

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 4.2, 13], fov: 40, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
    >
      <EnvironmentRig hemi={hemi} keyLight={keyLight} />
      <hemisphereLight ref={hemi} args={['#FFFFFF', '#AEB4C4', 0.55]} />
      <directionalLight
        ref={keyLight}
        position={[5, 9, 6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      {/* Softboxes for reflections on metal and glass; generated locally, no network. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={2} position={[-7, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[7, 2, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" color="#2F5BFF" intensity={0.8} position={[0, 2, -8]} scale={4} />
      </Environment>

      <Suspense fallback={null}>
        <Physics gravity={NO_GRAVITY} paused={inspecting || modelOpen}>
          <Room />
          <World />
          <HandRig />
        </Physics>
        <InspectView />
        <ModelView />
      </Suspense>
      <Bursts />

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
        {/* Soft contact shading where parts meet: block models read as solid objects. */}
        <N8AO halfRes aoRadius={0.6} intensity={2.2} distanceFalloff={0.6} quality="medium" />
        <Bloom luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}
