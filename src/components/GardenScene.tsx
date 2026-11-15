import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { AnimationMixer, Color, Group, InstancedMesh, LoopOnce, LoopRepeat, Matrix4, Mesh, PerspectiveCamera, Quaternion, Vector3, type AnimationAction } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { ASSETS, CLIPS, createWorld, stepWorld, hash, type Actor, type CameraView, type Companion, type World } from "../garden/model";
import Environment, { groundHeight } from "../garden/Environment";

type Props = { items: Companion[]; running: boolean; reduced: boolean; selected: string | null; camera: CameraView; onCamera: (value: CameraView) => void; onSelect: (key: string | null) => void; onError: () => void };
const CHARACTER_ASSETS = [ASSETS.flowering, ASSETS.succulent, ASSETS.moss];
const SCENERY_ASSETS = [ASSETS.habitat, ASSETS.fern];
export function clearGardenAssets() {
  // useLoader caches a batch by its complete input array, not individual URLs.
  useLoader.clear(GLTFLoader, CHARACTER_ASSETS); useLoader.clear(GLTFLoader, SCENERY_ASSETS);
}
const positionForJar = (index: number, count: number): [number, number, number] => {
  const angle = index / Math.max(count, 1) * Math.PI * 2;
  const x = Math.cos(angle) * 5.85, z = Math.sin(angle) * 3.9;
  return [x, groundHeight(x, z), z];
};
type Placement = { position: [number, number, number]; scale: number; angle: number };

function StaticInstances({ asset, placements }: { asset: GLTF; placements: Placement[] }) {
  const meshes = useMemo(() => { const result: Mesh[] = []; asset.scene.updateMatrixWorld(true); asset.scene.traverse(obj => { if (obj instanceof Mesh) result.push(obj); }); return result; }, [asset]);
  return <>{meshes.map((mesh, index) => <InstancePart key={index} mesh={mesh} placements={placements}/>)}</>;
}
function InstancePart({ mesh, placements }: { mesh: Mesh; placements: Placement[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const transform = new Matrix4(), rotation = new Quaternion(), scale = new Vector3(), position = new Vector3();
    placements.forEach((placement, i) => {
      position.set(...placement.position); rotation.setFromAxisAngle(new Vector3(0, 1, 0), placement.angle); scale.setScalar(placement.scale);
      transform.compose(position, rotation, scale).multiply(mesh.matrixWorld); ref.current!.setMatrixAt(i, transform);
    });
    ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere();
  }, [mesh, placements]);
  return <instancedMesh ref={ref} args={[mesh.geometry, mesh.material, placements.length]} dispose={null}/>;
}
function Shadow({ radius = .35 }: { radius?: number }) {
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .012, 0]}><circleGeometry args={[radius, 24]}/><meshBasicMaterial color="#1b3222" transparent opacity={.20} depthWrite={false}/></mesh>;
}

function Character({ asset, item, actor, running, reduced, selected, select, scale = .68 }: { asset: GLTF; item: Companion; actor?: Actor; running: boolean; reduced: boolean; selected: boolean; select: (event: ThreeEvent<MouseEvent>) => void; scale?: number }) {
  const root = useRef<Group>(null);
  const model = useMemo(() => clone(asset.scene), [asset]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const actions = useRef<Record<string, AnimationAction>>({});
  const active = useRef(""), reaction = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const play = (name: string) => {
    if (active.current === name) return;
    actions.current[active.current]?.fadeOut(.25);
    const action = actions.current[name];
    action.reset().setEffectiveTimeScale(name === "walk" ? .95 : 1).setEffectiveWeight(1).fadeIn(.25);
    const transition = ["sit_down", "lie_down", "stand_up", "rise", "react"].includes(name);
    action.setLoop(transition ? LoopOnce : LoopRepeat, transition ? 1 : Infinity); action.clampWhenFinished = transition; action.play();
    active.current = name;
  };
  useEffect(() => {
    actions.current = Object.fromEntries(asset.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
    play(actor?.clip ?? "idle"); mixer.update(.3); invalidate();
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(model); active.current = ""; };
  }, [asset, mixer, model]);
  useEffect(() => {
    if (selected && !reduced && running) { reaction.current = 1.3; play("react"); }
    if (!selected) { reaction.current = 0; play(actor?.clip ?? "idle"); }
    invalidate();
  }, [selected, reduced]);
  useFrame((_, elapsed) => {
    if (root.current && actor) { root.current.position.set(actor.x, groundHeight(actor.x, actor.z), actor.z); root.current.rotation.y = actor.angle; }
    if (!running) return;
    const dt = Math.min(elapsed, .05);
    if (selected) { reaction.current = Math.max(0, reaction.current - dt); play(reaction.current > 0 ? "react" : "idle"); }
    else play(actor?.clip ?? "idle");
    mixer.update(dt);
  });
  return <group ref={root} position={actor ? [actor.x, groundHeight(actor.x, actor.z), actor.z] : [0, .23, 0]} rotation={[0, actor?.angle ?? .15, 0]}>
    {actor && <Shadow/>}
    <group scale={scale} onClick={select}><primitive object={model} dispose={null}/></group>
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .018, 0]}><ringGeometry args={[.37, .41, 32]}/><meshBasicMaterial color="#eed38d"/></mesh>}
  </group>;
}

function Simulation({ world, running, selected }: { world: World; running: boolean; selected: string | null }) {
  useFrame((_, elapsed) => { if (running) stepWorld(world, elapsed, selected); }, -1);
  return null;
}
function CameraControl({ value }: { value: CameraView }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.position.set(value.x + 7, 7.5, value.z + 11); cam.lookAt(value.x, .65, value.z);
    cam.zoom = Math.min(1, size.width / size.height / 1.65) * value.zoom;
    cam.updateProjectionMatrix(); invalidate();
  }, [camera, size, value, invalidate]);
  return null;
}
function Appearance() {
  const { scene, invalidate } = useThree();
  useEffect(() => {
    const update = () => {
      const color = document.documentElement.dataset.forestAesthetic === "false" ? "#a1ad96" : "#8da68f";
      scene.background = new Color(color); scene.fog?.color.set(color); invalidate();
    };
    update(); const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-forest-aesthetic"] });
    return () => observer.disconnect();
  }, [scene, invalidate]);
  return null;
}
function ContextLifecycle({ onError }: { onError: () => void }) {
  const gl = useThree(state => state.gl);
  const callback = useRef(onError); callback.current = onError;
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); callback.current(); };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl]);
  return null;
}
function Performance({ onQuality, running }: { onQuality: () => void; running: boolean }) {
  const gl = useThree(state => state.gl), samples = useRef({ count: 0, start: 0, slow: 0 });
  useEffect(() => { samples.current = { count: 0, start: 0, slow: 0 }; }, [running]);
  useFrame(() => {
    if (!running) return;
    const now = performance.now(), sample = samples.current;
    if (!sample.start) sample.start = now;
    if (++sample.count < 120) return;
    const fps = sample.count / ((now - sample.start) / 1000);
    gl.domElement.dataset.fps = fps.toFixed(1); gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
    if (fps < 30 && ++sample.slow >= 2) onQuality();
    sample.count = 0; sample.start = now;
  });
  return null;
}

function GardenContents(props: Props & { onQuality: () => void; onReady: () => void; moved: React.RefObject<boolean> }) {
  const families = useLoader(GLTFLoader, CHARACTER_ASSETS);
  const [habitat, fern] = useLoader(GLTFLoader, SCENERY_ASSETS);
  useEffect(props.onReady, [props.onReady]);
  const world = useMemo(() => createWorld(props.items), [props.items]);
  const jars = props.items.filter(item => item.kind === "terrarium");
  const jarPositions = useMemo(() => jars.map((_, i) => ({ position: positionForJar(i, jars.length), scale: .86, angle: 0 })), [props.items]);
  const ferns = useMemo(() => Array.from({ length: 65 }, (_, i) => {
    const seed = hash(String(i)), angle = seed / 4294967296 * Math.PI * 2, radius = 5.5 + seed % 80 / 10;
    const x = Math.cos(angle) * radius * 1.2, z = Math.sin(angle) * radius;
    return { position: [x, groundHeight(x, z), z] as [number, number, number], scale: .65 + seed % 10 / 15, angle };
  }), []);
  for (const asset of families) if (CLIPS.some(name => !asset.animations.some(clip => clip.name === name))) throw new Error("Incomplete companion animation asset");
  const assets = { flowering: families[0], succulent: families[1], moss: families[2] };
  const select = (key: string) => (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (!props.moved.current) props.onSelect(key); };
  return <>
    <CameraControl value={props.camera}/><Appearance/><ContextLifecycle onError={props.onError}/><Performance running={props.running} onQuality={props.onQuality}/><Simulation world={world} running={props.running} selected={props.selected}/>
    <Environment running={props.running}/><StaticInstances asset={fern} placements={ferns}/>
    <StaticInstances asset={habitat} placements={jarPositions}/>
    {props.items.filter(item => item.kind === "plant").map(item => <Character key={item.key} asset={assets[item.family]} item={item} actor={world.actors.find(actor => actor.key === item.key)} running={props.running} reduced={props.reduced} selected={props.selected === item.key} select={select(item.key)}/>)}
    {jars.map((item, i) => <group key={item.key} position={jarPositions[i].position} scale={.86}>
      <Character asset={assets[item.family]} item={item} running={props.running} reduced={props.reduced} selected={props.selected === item.key} select={select(item.key)} scale={.42}/>
      <mesh position={[0, .8, 0]} onClick={select(item.key)}><cylinderGeometry args={[.58, .58, 1.5, 12]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh><Shadow radius={.58}/>
    </group>)}
  </>;
}

export default function GardenScene(props: Props) {
  const [low, setLow] = useState(false), [ready, setReady] = useState(false);
  const drag = useRef<{ x: number; y: number; camera: CameraView; id: number } | null>(null), moved = useRef(false);
  return <div onPointerDown={event => { if (event.button !== 0 || event.pointerType === "touch") return; moved.current = false; drag.current = { x: event.clientX, y: event.clientY, camera: props.camera, id: event.pointerId }; }}
    onPointerMove={event => {
      const start = drag.current; if (!start || start.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { drag.current = null; return; }
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) < 6 && !moved.current) return;
      moved.current = true; event.currentTarget.setPointerCapture(event.pointerId);
      const factor = .016 / start.camera.zoom;
      props.onCamera({ ...start.camera, x: start.camera.x - dx * factor * .82 - dy * factor * .57, z: start.camera.z + dx * factor * .57 - dy * factor * .82 });
    }} onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; moved.current = false; }}>
    <Canvas shadows camera={{ position: [7, 7.5, 11], fov: 38, near: .1, far: 150 }} dpr={low ? 1 : [1, 1.5]} frameloop={props.running ? "always" : "demand"}
      gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
      onPointerMissed={() => { if (!moved.current) props.onSelect(null); }} onCreated={({ gl }) => { gl.domElement.setAttribute("aria-hidden", "true"); }}>
      <Suspense fallback={null}><GardenContents {...props} moved={moved} onReady={() => setReady(true)} onQuality={() => setLow(true)}/></Suspense>
    </Canvas>
    {!ready && <div className="garden-scene-loading" role="status">Opening your garden…</div>}
  </div>;
}
