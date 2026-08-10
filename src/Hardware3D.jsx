import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useTexture } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const colors = {
  black: "#141613",
  raised: "#4b4e45",
  sunk: "#090b09",
  edge: "#8b8376",
  warm: "#f1ecdf",
  warmEdge: "#b8ad9c",
  orange: "#ef4d0f",
  glass: "#171b18",
  waveform: "#c7a879",
};

const assetPath = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

function useSurfaceTexture(path, repeatX = 2, repeatY = 2) {
  const source = useTexture(path);
  const texture = useMemo(() => {
    const next = source.clone();
    next.wrapS = THREE.RepeatWrapping;
    next.wrapT = THREE.RepeatWrapping;
    next.repeat.set(repeatX, repeatY);
    next.colorSpace = THREE.SRGBColorSpace;
    next.anisotropy = 8;
    next.needsUpdate = true;
    return next;
  }, [source, repeatX, repeatY]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function SceneLights({ warm = false }) {
  return <>
    <ambientLight intensity={warm ? 1.55 : 1.24} color={warm ? "#fff7e6" : "#e8dfd0"} />
    <directionalLight position={[-5, 8, 11]} intensity={warm ? 2.8 : 3.45} color="#fff0d4" />
    <directionalLight position={[7, -2, 8]} intensity={warm ? 1.35 : 1.8} color={warm ? "#ded3c0" : "#a9b1a3"} />
    <pointLight position={[1, 1, 7]} intensity={.7} color="#ff8a50" />
  </>;
}

function Screw({ x, y, light = false }) {
  return <group position={[x, y, .31]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[.09, .09, .05, 32]} />
      <meshStandardMaterial color={light ? "#877d6c" : "#343630"} metalness={.92} roughness={.24} />
    </mesh>
    <mesh position={[0, 0, .035]}>
      <boxGeometry args={[.1, .018, .018]} />
      <meshStandardMaterial color={light ? "#413b32" : "#090a08"} metalness={.55} roughness={.4} />
    </mesh>
  </group>;
}

function FitCamera({ worldHeight, worldWidth }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    camera.zoom = worldWidth
      ? Math.min(size.width / worldWidth, size.height / worldHeight)
      : size.height / worldHeight;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.height, size.width, worldHeight, worldWidth, invalidate]);
  return null;
}

function HardwareCanvas({ children, className = "", animated = false, worldHeight = 11.3, worldWidth }) {
  return <Canvas
    className={`hardware-canvas ${className}`}
    orthographic
    frameloop={animated ? "always" : "demand"}
    dpr={[1, 1.5]}
    camera={{ position: [0, 0, 12], zoom: 1, near: .1, far: 40 }}
    gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
    onCreated={({ gl, camera }) => {
      gl.setClearColor(0x000000, 0);
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.2;
      camera.lookAt(0, 0, 0);
    }}
  ><FitCamera worldHeight={worldHeight} worldWidth={worldWidth} />{children}</Canvas>;
}

function RailKey({ x = 0, y = 0, state, width = 1.94, height = 1.96, metalMap }) {
  const keyRef = useRef();
  useFrame((_, delta) => {
    if (!keyRef.current) return;
    const latched = state === "active";
    const pressed = state === "pressed";
    const targetScale = pressed ? .9 : latched ? .94 : 1;
    const targetY = pressed ? -.12 : latched ? -.075 : 0;
    const targetZ = pressed ? .07 : latched ? .12 : .42;
    keyRef.current.scale.x = THREE.MathUtils.damp(keyRef.current.scale.x, targetScale, 24, delta);
    keyRef.current.scale.y = THREE.MathUtils.damp(keyRef.current.scale.y, targetScale, 24, delta);
    keyRef.current.position.y = THREE.MathUtils.damp(keyRef.current.position.y, targetY, 24, delta);
    keyRef.current.position.z = THREE.MathUtils.damp(keyRef.current.position.z, targetZ, 25, delta);
  });

  const lit = state === "active" || state === "pressed";
  return <group position={[x, y, 0]}>
    <RoundedBox args={[width, height, .19]} radius={.09} smoothness={6} position={[0, 0, .18]}>
      <meshPhysicalMaterial color="#070907" metalness={.66} roughness={.54} />
    </RoundedBox>
    <group ref={keyRef} position={[0, 0, .42]}>
      <RoundedBox args={[width - .18, height - .2, .42]} radius={.1} smoothness={7}>
        <meshPhysicalMaterial color={lit ? "#30332c" : colors.raised} metalness={.69} roughness={.34} clearcoat={.28} clearcoatRoughness={.28} />
      </RoundedBox>
    </group>
    <mesh position={[-width / 2 + .12, height * .29, .52]}>
      <circleGeometry args={[.064, 28]} />
      <meshStandardMaterial color={lit ? colors.orange : "#3b2017"} emissive={colors.orange} emissiveIntensity={lit ? 4.2 : .05} toneMapped={false} />
    </mesh>
  </group>;
}

function RailScene({ activeIndex, pressedIndex, horizontal }) {
  const positions = horizontal
    ? [-7.05, -2.35, 2.35, 7.05].map((x) => ({ x, y: 0 }))
    : [3.55, 1.18, -1.19, -3.56].map((y) => ({ x: 0, y }));
  return <>
    <SceneLights />
    <RoundedBox args={horizontal ? [18.55, 3.82, .48] : [2.35, 10.85, .48]} radius={.12} smoothness={6}>
      <meshPhysicalMaterial color="#20231f" metalness={.72} roughness={.4} clearcoat={.22} clearcoatRoughness={.38} />
    </RoundedBox>
    {positions.map((position, index) => <RailKey key={index} {...position} width={horizontal ? 4.18 : 1.94} height={horizontal ? 3.08 : 2.02} state={pressedIndex === index ? "pressed" : activeIndex === index ? "active" : "rest"} />)}
    {horizontal
      ? <><Screw x={-8.8} y={1.55} /><Screw x={8.8} y={1.55} /><Screw x={-8.8} y={-1.55} /><Screw x={8.8} y={-1.55} /></>
      : <><Screw x={-.95} y={4.8} /><Screw x={.95} y={4.8} /><Screw x={-.95} y={-5.02} /><Screw x={.95} y={-5.02} /></>}
  </>;
}

export function RailHardware3D({ activeIndex = 0, pressedIndex = -1, horizontal = false }) {
  return <HardwareCanvas animated worldHeight={horizontal ? 4.35 : 11.3} worldWidth={horizontal ? 18.9 : undefined}>
    <RailScene activeIndex={activeIndex} pressedIndex={pressedIndex} horizontal={horizontal} />
  </HardwareCanvas>;
}

function ChassisCapScene() {
  const metalMap = useSurfaceTexture(assetPath("textures/metal-black-v1.png"), 1.5, 1);
  return <>
    <SceneLights />
    <RoundedBox args={[3.15, 2.05, .48]} radius={.13} smoothness={6}>
      <meshPhysicalMaterial map={metalMap} color="#d7d3cb" metalness={.67} roughness={.45} clearcoat={.2} />
    </RoundedBox>
    <Screw x={-1.25} y={.7} /><Screw x={1.25} y={.7} /><Screw x={-1.25} y={-.7} /><Screw x={1.25} y={-.7} />
  </>;
}

export function ChassisCap3D() {
  return <HardwareCanvas worldHeight={2.25}><ChassisCapScene /></HardwareCanvas>;
}

function WorkSurfaceScene() {
  const ivoryMap = useSurfaceTexture(assetPath("textures/ivory-panel-v1.png"), 4, 2.2);
  return <>
    <SceneLights warm />
    <RoundedBox args={[20.2, 10.82, .3]} radius={.11} smoothness={8}>
      <meshPhysicalMaterial map={ivoryMap} color="#fffdf7" metalness={.08} roughness={.68} clearcoat={.12} clearcoatRoughness={.55} />
    </RoundedBox>
    <RoundedBox args={[19.72, 10.38, .08]} radius={.075} smoothness={7} position={[0, 0, .24]}>
      <meshPhysicalMaterial color="#f7f2e7" metalness={.03} roughness={.76} clearcoat={.08} />
    </RoundedBox>
    <mesh position={[0, 4.75, .33]}>
      <boxGeometry args={[18.85, .012, .018]} />
      <meshStandardMaterial color={colors.warmEdge} metalness={.25} roughness={.6} />
    </mesh>
  </>;
}

export function WorkSurface3D() {
  return <HardwareCanvas worldHeight={11.3}><WorkSurfaceScene /></HardwareCanvas>;
}

function InspectorScene() {
  const metalMap = useSurfaceTexture(assetPath("textures/metal-black-v1.png"), 2.2, 4);
  return <>
    <SceneLights />
    <RoundedBox args={[6.22, 10.84, .42]} radius={.12} smoothness={7}>
      <meshPhysicalMaterial map={metalMap} color="#d7d3cb" metalness={.66} roughness={.43} clearcoat={.2} clearcoatRoughness={.43} />
    </RoundedBox>
    {[3.75, 1.25, -1.45, -3.85].map((y, index) => <RoundedBox key={y} args={[5.72, index === 0 ? 1.24 : 2.05, .13]} radius={.075} smoothness={5} position={[0, y, .23]}>
      <meshPhysicalMaterial color={index === 0 ? colors.sunk : colors.raised} metalness={.5} roughness={.52} clearcoat={.09} />
    </RoundedBox>)}
    <Screw x={-2.74} y={4.8} /><Screw x={2.74} y={4.8} /><Screw x={-2.74} y={-5.02} /><Screw x={2.74} y={-5.02} />
  </>;
}

export function InspectorHardware3D() {
  return <HardwareCanvas worldHeight={11.3}><InspectorScene /></HardwareCanvas>;
}

function KnobMesh({ value }) {
  const rotation = THREE.MathUtils.lerp(-2.25, 2.25, (Number(value) - 75) / 50);
  return <group rotation={[0, 0, -rotation]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[1.03, 1.03, .38, 96]} />
      <meshPhysicalMaterial color="#d7d3c8" metalness={.82} roughness={.27} clearcoat={.26} clearcoatRoughness={.23} />
    </mesh>
    <mesh position={[0, .73, .24]}>
      <boxGeometry args={[.075, .48, .08]} />
      <meshStandardMaterial color="#171713" metalness={.5} roughness={.3} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, .22]}>
      <torusGeometry args={[.79, .018, 12, 96]} />
      <meshStandardMaterial color="#e3d5be" metalness={.9} roughness={.16} />
    </mesh>
  </group>;
}

export function SpeedKnob3D({ value }) {
  return <HardwareCanvas worldHeight={3.45}>
    <SceneLights />
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -.16]}>
      <cylinderGeometry args={[1.26, 1.26, .18, 96]} />
      <meshPhysicalMaterial color="#0d0f0d" metalness={.72} roughness={.45} />
    </mesh>
    {Array.from({ length: 21 }).map((_, index) => {
      const angle = THREE.MathUtils.lerp(-2.25, 2.25, index / 20);
      return <mesh key={index} position={[Math.sin(angle) * 1.38, Math.cos(angle) * 1.38, .04]} rotation={[0, 0, -angle]}>
        <boxGeometry args={[index % 5 === 0 ? .035 : .02, index % 5 === 0 ? .24 : .16, .04]} />
        <meshStandardMaterial color={index === 10 ? colors.orange : "#8e897f"} metalness={.5} roughness={.38} />
      </mesh>;
    })}
    <KnobMesh value={value} />
  </HardwareCanvas>;
}

export function PrimaryButton3D({ pressed, disabled }) {
  return <HardwareCanvas worldHeight={1.52}>
    <SceneLights warm />
    <group position={[0, pressed ? -.08 : .04, 0]} scale={[pressed ? .985 : 1, pressed ? .96 : 1, 1]}>
      <RoundedBox args={[3.05, 1.02, .42]} radius={.16} smoothness={8} position={[0, -.1, -.12]}>
        <meshPhysicalMaterial color="#361208" metalness={.72} roughness={.4} />
      </RoundedBox>
      <RoundedBox args={[2.9, .9, .38]} radius={.14} smoothness={8} position={[0, 0, .18]}>
        <meshPhysicalMaterial color={disabled ? "#8c5e49" : colors.orange} metalness={.66} roughness={.28} clearcoat={.42} clearcoatRoughness={.24} />
      </RoundedBox>
      <mesh position={[0, .31, .41]}>
        <boxGeometry args={[2.35, .025, .025]} />
        <meshStandardMaterial color={disabled ? "#a88474" : "#ff9a68"} metalness={.35} roughness={.32} />
      </mesh>
    </group>
  </HardwareCanvas>;
}

function Reel({ x, y = 0, playing, direction = 1 }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (playing && ref.current) ref.current.rotation.z += delta * 2.3 * direction;
  });
  return <group ref={ref} position={[x, y, .5]}>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, .18]}>
      <cylinderGeometry args={[.67, .67, .11, 96]} />
      <meshPhysicalMaterial color="#2e2118" metalness={.12} roughness={.82} />
    </mesh>
    <mesh position={[0, 0, .25]}>
      <torusGeometry args={[.59, .055, 16, 96]} />
      <meshStandardMaterial color="#4b3424" metalness={.24} roughness={.66} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, .19]}>
      <cylinderGeometry args={[.17, .17, .14, 64]} />
      <meshPhysicalMaterial color="#d8cfbd" metalness={.42} roughness={.34} clearcoat={.16} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, .28]}>
      <torusGeometry args={[.31, .055, 18, 64]} />
      <meshStandardMaterial color="#e7ddca" metalness={.5} roughness={.3} />
    </mesh>
    {Array.from({ length: 6 }).map((_, index) => {
      const angle = index * Math.PI / 3;
      return <mesh key={index} position={[Math.cos(angle) * .2, Math.sin(angle) * .2, .33]} rotation={[0, 0, angle]}>
        <boxGeometry args={[.25, .07, .055]} />
        <meshStandardMaterial color="#e5dac6" metalness={.46} roughness={.34} />
      </mesh>;
    })}
    {Array.from({ length: 12 }).map((_, index) => {
      const angle = index * Math.PI / 6;
      return <mesh key={`tooth-${index}`} position={[Math.cos(angle) * .38, Math.sin(angle) * .38, .32]} rotation={[0, 0, angle]}>
        <boxGeometry args={[.09, .07, .05]} />
        <meshStandardMaterial color="#d8cdb9" metalness={.52} roughness={.3} />
      </mesh>;
    })}
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, .37]}>
      <cylinderGeometry args={[.14, .14, .08, 40]} />
      <meshPhysicalMaterial color="#151713" metalness={.68} roughness={.4} />
    </mesh>
  </group>;
}

function TransportKey({ x, id, pressedControl, latched = false, color = colors.raised, width = 1.22 }) {
  const keyRef = useRef();
  const pressed = pressedControl === id;
  useFrame((_, delta) => {
    if (!keyRef.current) return;
    const targetScale = pressed ? .93 : latched ? .96 : 1;
    const targetY = pressed ? -.065 : latched ? -.035 : 0;
    const targetZ = pressed ? .18 : latched ? .22 : .35;
    keyRef.current.scale.x = THREE.MathUtils.damp(keyRef.current.scale.x, targetScale, 26, delta);
    keyRef.current.scale.y = THREE.MathUtils.damp(keyRef.current.scale.y, targetScale, 26, delta);
    keyRef.current.position.y = THREE.MathUtils.damp(keyRef.current.position.y, targetY, 26, delta);
    keyRef.current.position.z = THREE.MathUtils.damp(keyRef.current.position.z, targetZ, 26, delta);
  });

  return <group position={[x, 0, 0]}>
    <RoundedBox args={[width + .14, 1.42, .16]} radius={.09} smoothness={6} position={[0, 0, .22]}>
      <meshPhysicalMaterial color="#080a08" metalness={.62} roughness={.52} />
    </RoundedBox>
    <group ref={keyRef} position={[0, 0, .35]}>
      <RoundedBox args={[width, 1.24, .27]} radius={.085} smoothness={6}>
        <meshPhysicalMaterial color={color} metalness={.74} roughness={.36} clearcoat={.18} />
      </RoundedBox>
      <mesh position={[0, .51, .17]}>
        <boxGeometry args={[width * .7, .02, .025]} />
        <meshStandardMaterial color={color === colors.orange ? "#ff9b6b" : "#65645d"} metalness={.6} roughness={.3} />
      </mesh>
    </group>
  </group>;
}

function StatusLamp({ x, y = .48, color, active }) {
  return <group position={[x, y, .52]}>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -.03]}>
      <cylinderGeometry args={[.15, .15, .08, 48]} />
      <meshPhysicalMaterial color="#090a08" metalness={.8} roughness={.38} />
    </mesh>
    <mesh>
      <circleGeometry args={[.095, 40]} />
      <meshStandardMaterial color={active ? color : "#22251f"} emissive={color} emissiveIntensity={active ? 5.4 : .02} toneMapped={false} />
    </mesh>
    {active && <pointLight color={color} intensity={1.15} distance={1.15} position={[0, 0, .2]} />}
  </group>;
}

function WaveformBars({ playing, centerX, width = 10.2 }) {
  const bars = useRef([]);
  const count = 62;
  const baseHeights = useMemo(() => Array.from({ length: count }, (_, index) => .1 + Math.abs(Math.sin(index * .57) * Math.cos(index * .21)) * .45), []);
  useFrame(({ clock }, delta) => {
    bars.current.forEach((bar, index) => {
      if (!bar) return;
      const liveHeight = .12 + Math.abs(Math.sin(clock.elapsedTime * 7.2 + index * .67) * Math.cos(clock.elapsedTime * 2.8 + index * .17)) * .62;
      const target = playing ? liveHeight : baseHeights[index];
      bar.scale.y = THREE.MathUtils.damp(bar.scale.y, target, playing ? 18 : 10, delta);
    });
  });

  return <group position={[centerX, .42, .5]}>
    {baseHeights.map((height, index) => <mesh
      key={index}
      ref={(node) => { bars.current[index] = node; }}
      position={[-width / 2 + index * (width / (count - 1)), 0, 0]}
      scale={[1, height, 1]}
    >
      <boxGeometry args={[.032, 1, .028]} />
      <meshStandardMaterial color={index === 23 ? colors.orange : colors.waveform} emissive={index === 23 ? colors.orange : "#6e5735"} emissiveIntensity={index === 23 ? 1.6 : .12} />
    </mesh>)}
  </group>;
}

function TransportScene({ playing, statusKey, pressedControl }) {
  return <>
    <SceneLights />
    <RoundedBox args={[33.1, 3.35, .52]} radius={.2} smoothness={8}>
      <meshPhysicalMaterial color="#20231f" metalness={.72} roughness={.4} clearcoat={.2} clearcoatRoughness={.38} />
    </RoundedBox>
    <RoundedBox args={[6.05, 2.28, .2]} radius={.13} smoothness={7} position={[-13.35, 0, .34]}>
      <meshPhysicalMaterial color="#272a25" metalness={.58} roughness={.3} clearcoat={.5} clearcoatRoughness={.2} />
    </RoundedBox>
    <RoundedBox args={[5.62, 1.82, .25]} radius={.13} smoothness={7} position={[-13.35, 0, .43]}>
      <meshPhysicalMaterial color="#9c896e" metalness={.3} roughness={.42} clearcoat={.32} transparent opacity={.86} />
    </RoundedBox>
    <RoundedBox args={[4.18, 1.18, .13]} radius={.12} smoothness={6} position={[-13.35, 0, .58]}>
      <meshPhysicalMaterial color="#151713" metalness={.38} roughness={.26} clearcoat={.46} transparent opacity={.58} depthWrite={false} />
    </RoundedBox>
    <mesh position={[-13.35, 0, .69]}><boxGeometry args={[2.2, .06, .04]} /><meshStandardMaterial color="#4b3422" metalness={.2} roughness={.7} /></mesh>
    <Reel x={-14.55} playing={playing} /><Reel x={-12.15} playing={playing} />
    <RoundedBox args={[3.25, .3, .12]} radius={.05} smoothness={4} position={[-13.35, -.72, .68]}>
      <meshPhysicalMaterial color="#d8cbb3" metalness={.38} roughness={.4} />
    </RoundedBox>
    {[-14.18, -13.35, -12.52].map((x, index) => <RoundedBox key={x} args={[index === 1 ? .36 : .24, .22, .09]} radius={.035} smoothness={4} position={[x, -.72, .78]}>
      <meshStandardMaterial color={index === 1 ? "#2c2e29" : "#6d6558"} metalness={.62} roughness={.35} />
    </RoundedBox>)}
    <Screw x={-15.8} y={.82} /><Screw x={-10.9} y={.82} /><Screw x={-15.8} y={-.82} /><Screw x={-10.9} y={-.82} />
    <RoundedBox args={[5.1, 2.24, .16]} radius={.1} smoothness={6} position={[-7.6, 0, .32]}>
      <meshPhysicalMaterial color="#111410" metalness={.6} roughness={.5} clearcoat={.12} />
    </RoundedBox>
    <StatusLamp x={-9.72} y={-.58} color="#59d77d" active={statusKey === "ready"} />
    <StatusLamp x={-8.18} y={-.58} color="#f1bd46" active={statusKey === "process"} />
    <StatusLamp x={-6.64} y={-.58} color="#f04a35" active={statusKey === "play"} />
    <TransportKey x={-3.86} id="previous" pressedControl={pressedControl} width={1.15} />
    <TransportKey x={-2.49} id="stop" pressedControl={pressedControl} width={1.15} />
    <TransportKey x={-1.12} id="play" pressedControl={pressedControl} latched={playing} color={playing ? colors.orange : colors.raised} width={1.15} />
    <TransportKey x={.25} id="next" pressedControl={pressedControl} width={1.15} />
    <RoundedBox args={[13, 2.16, .2]} radius={.12} smoothness={7} position={[7.67, 0, .34]}>
      <meshPhysicalMaterial color={colors.glass} metalness={.46} roughness={.28} clearcoat={.5} />
    </RoundedBox>
    <WaveformBars playing={playing} centerX={7.8} width={11.65} />
    <TransportKey x={15.1} id="download" pressedControl={pressedControl} width={1.5} />
    <Screw x={-15.9} y={1.25} /><Screw x={15.9} y={1.25} /><Screw x={-15.9} y={-1.25} /><Screw x={15.9} y={-1.25} />
  </>;
}

export function TransportHardware3D({ playing, statusKey = "ready", pressedControl = "" }) {
  return <HardwareCanvas animated worldHeight={3.8} worldWidth={33.6494382}>
    <TransportScene playing={playing} statusKey={statusKey} pressedControl={pressedControl} />
  </HardwareCanvas>;
}

function CassetteScene({ playing }) {
  return <>
    <SceneLights />
    <RoundedBox args={[6.15, 2.42, .24]} radius={.14} smoothness={8} position={[0, 0, .12]}>
      <meshPhysicalMaterial color="#111410" metalness={.74} roughness={.34} clearcoat={.32} />
    </RoundedBox>
    <RoundedBox args={[5.58, 1.82, .34]} radius={.16} smoothness={8} position={[0, 0, .33]}>
      <meshPhysicalMaterial color="#8d755e" metalness={.42} roughness={.36} clearcoat={.34} />
    </RoundedBox>
    <RoundedBox args={[3.32, .66, .14]} radius={.08} smoothness={5} position={[0, 0, .58]}>
      <meshPhysicalMaterial color="#171814" metalness={.5} roughness={.48} clearcoat={.22} />
    </RoundedBox>
    <mesh position={[0, -.69, .58]}><boxGeometry args={[3.55, .045, .05]} /><meshStandardMaterial color="#332116" metalness={.3} roughness={.62} /></mesh>
    <Reel x={-1.2} playing={playing} /><Reel x={1.2} playing={playing} />
    <Screw x={-2.72} y={.92} /><Screw x={2.72} y={.92} /><Screw x={-2.72} y={-.92} /><Screw x={2.72} y={-.92} />
  </>;
}

export function CassetteHardware3D({ playing }) {
  return <HardwareCanvas animated worldHeight={2.72}><CassetteScene playing={playing} /></HardwareCanvas>;
}

export function StatusHardware3D({ statusKey = "ready" }) {
  return <HardwareCanvas animated worldHeight={1.1}>
    <SceneLights />
    <StatusLamp x={-1.2} y={0} color="#59d77d" active={statusKey === "ready"} />
    <StatusLamp x={0} y={0} color="#f1bd46" active={statusKey === "process"} />
    <StatusLamp x={1.2} y={0} color="#f04a35" active={statusKey === "play"} />
  </HardwareCanvas>;
}

export function TransportButton3D({ pressed = false, active = false, accent = false, wide = false }) {
  return <HardwareCanvas animated worldHeight={1.72}>
    <SceneLights />
    <TransportKey x={0} id="key" pressedControl={pressed ? "key" : ""} latched={active} color={accent || active ? colors.orange : colors.raised} width={wide ? 1.5 : 1.24} />
  </HardwareCanvas>;
}

export function WaveformHardware3D({ playing }) {
  return <HardwareCanvas animated worldHeight={1.46}>
    <SceneLights />
    <RoundedBox args={[11.8, 1.24, .18]} radius={.1} smoothness={7} position={[0, 0, .18]}>
      <meshPhysicalMaterial color={colors.glass} metalness={.54} roughness={.24} clearcoat={.56} />
    </RoundedBox>
    <WaveformBars playing={playing} centerX={0} width={10.65} />
  </HardwareCanvas>;
}
