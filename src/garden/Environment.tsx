import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Point = { x: number; z: number; size: number; angle: number };
type Part = { shape: BufferGeometry; color: string; position?: [number, number, number]; scale?: [number, number, number]; rotation?: [number, number, number] };
const green = ["#4c723b", "#638b46", "#7d9e4c", "#96ad58"];

// Keep the companion clearing level; the surrounding woodland rises into gentle banks.
export function groundHeight(x: number, z: number) {
  const bank = Math.min(1, Math.max(0, (Math.hypot(x / 1.3, z) - 5.5) / 5));
  return -.035 + bank * (.35 + Math.sin(x * .31) * Math.cos(z * .38) * .48);
}
function generator(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function geometry(parts: Part[]) {
  const pieces = parts.map(part => {
    let shape = part.shape;
    if (shape.index) { const indexed = shape; shape = shape.toNonIndexed(); indexed.dispose(); }
    shape.deleteAttribute("uv");
    if (part.scale) shape.scale(...part.scale);
    if (part.rotation) { shape.rotateX(part.rotation[0]); shape.rotateY(part.rotation[1]); shape.rotateZ(part.rotation[2]); }
    if (part.position) shape.translate(...part.position);
    const color = new Color(part.color), colors = new Float32Array(shape.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    shape.setAttribute("color", new Float32BufferAttribute(colors, 3)); return shape;
  });
  const result = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose()); return result;
}
const ball = (color: string, position: [number, number, number], scale: [number, number, number], detail = 1): Part => ({ shape: new IcosahedronGeometry(1, detail), color, position, scale });
function branch(from: [number, number, number], to: [number, number, number], radius: number): Part {
  const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
  const shape = new CylinderGeometry(radius * .5, radius, direction.length(), 7);
  shape.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
  return { shape, color: "#665947", position: a.add(b).multiplyScalar(.5).toArray() as [number, number, number] };
}
function tree(pine: boolean) {
  const parts: Part[] = [branch([0, 0, 0], [.13, 4.6, 0], .23)];
  if (pine) {
    for (let i = 0; i < 5; i++) parts.push({ shape: new ConeGeometry(1.65 - i * .25, 2.25 - i * .22, 9), color: ["#365c40", "#426c43", "#537c48"][i % 3], position: [0, 1.9 + i * .72, 0], rotation: [0, i * .6, 0] });
  } else {
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4, x = Math.cos(angle) * (i === 6 ? .4 : 1.35), z = Math.sin(angle) * 1.3, y = 3.2 + i % 3 * .55;
      parts.push(branch([.06, 1.7, 0], [x, y, z], .12));
      parts.push(ball(["#496f41", "#608545", "#759649"][i % 3], [x, y + .55, z], [1.35, 1.15, 1.25]));
    }
    for (let i = 0; i < 4; i++) parts.push(branch([0, .1, 0], [Math.cos(i * 1.57) * .75, .02, Math.sin(i * 1.57) * .75], .16));
  }
  return geometry(parts);
}
function grass() {
  const parts: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4, height = .25 + (i % 3) * .13;
    const blade = new BufferGeometry();
    blade.setAttribute("position", new Float32BufferAttribute([-.055, 0, 0, .055, 0, 0, .04, height * .6, .045, -.055, 0, 0, .04, height * .6, .045, .09, height, .1], 3));
    blade.computeVertexNormals();
    parts.push({ shape: blade, color: green[i % 4], rotation: [0, angle, 0], position: [Math.cos(angle) * .12, 0, Math.sin(angle) * .12] });
  }
  return geometry(parts);
}
function flowers(lavender: boolean, yellow = false) {
  const parts: Part[] = [];
  for (let stem = 0; stem < 3; stem++) {
    const x = Math.cos(stem * 2.4) * .18, z = Math.sin(stem * 2.4) * .18, height = lavender ? .62 + stem * .13 : .28 + stem * .08;
    parts.push({ shape: new CylinderGeometry(.011, .018, height, 4), color: "#668148", position: [x, height / 2, z] });
    parts.push(ball("#739b4a", [x + .08, height * .33, z], [.17, .025, .055], 0));
    if (lavender) for (let bud = 0; bud < 7; bud++) parts.push(ball(bud % 2 ? "#b8a1df" : "#8677bf", [x + Math.sin(bud * 2.4) * .045, height - bud * .047, z + Math.cos(bud * 2.4) * .045], [.067 - bud * .003, .055, .063], 0));
    else {
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * .4;
        parts.push({ shape: new SphereGeometry(1, 5, 3), color: yellow ? "#efd265" : "#f5f0d7", position: [x + Math.cos(angle) * .072, height, z + Math.sin(angle) * .072], scale: [.082, .029, .043], rotation: [0, -angle, .12] });
      }
      parts.push(ball("#d7b247", [x, height + .02, z], [.04, .035, .04], 0));
    }
  }
  return geometry(parts);
}
function rabbit() {
  return geometry([
    ball("#e1d8ba", [0, .24, 0], [.22, .25, .3], 2), ball("#f3ead1", [0, .52, .15], [.21, .19, .18], 2),
    ball("#f3ead1", [-.1, .83, .13], [.065, .26, .065]), ball("#f3ead1", [.1, .82, .13], [.065, .25, .065]),
    ball("#c9a895", [-.1, .84, .183], [.025, .17, .012]), ball("#c9a895", [.1, .83, .183], [.025, .16, .012]),
    ball("#3f3830", [-.09, .55, .307], [.021, .026, .012]), ball("#3f3830", [.09, .55, .307], [.021, .026, .012]),
    ball("#b98778", [0, .48, .33], [.027, .019, .018]), ball("#f5eedb", [0, .26, -.3], [.105, .105, .105]),
    ball("#e1d8ba", [-.14, .06, .12], [.11, .06, .17]), ball("#e1d8ba", [.14, .06, .12], [.11, .06, .17]),
  ]);
}
function bird() {
  return geometry([ball("#6c8090", [0, .2, 0], [.12, .15, .2]), ball("#d2a176", [0, .23, .13], [.095, .1, .095]), ball("#657d86", [0, .37, .08], [.105, .105, .105]), ball("#273b39", [-.077, .39, .151], [.013, .013, .013]), ball("#273b39", [.077, .39, .151], [.013, .013, .013]), { shape: new ConeGeometry(.035, .12, 5), color: "#be995e", position: [0, .35, .225], rotation: [Math.PI / 2, 0, 0] }, ball("#526b77", [0, .21, -.22], [.075, .035, .18])]);
}

function Instances({ shape, points, shadows = false }: { shape: BufferGeometry; points: Point[]; shadows?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new Matrix4(), rotation = new Quaternion();
    points.forEach((point, i) => { rotation.setFromAxisAngle(new Vector3(0, 1, 0), point.angle); matrix.compose(new Vector3(point.x, groundHeight(point.x, point.z), point.z), rotation, new Vector3(point.size, point.size, point.size)); ref.current!.setMatrixAt(i, matrix); });
    ref.current!.instanceMatrix.needsUpdate = true; ref.current!.computeBoundingSphere();
  }, [points]);
  return <instancedMesh ref={ref} args={[shape, undefined, points.length]} castShadow={shadows} receiveShadow><meshStandardMaterial vertexColors roughness={1} side={2}/></instancedMesh>;
}
function Wildlife({ running, rabbitShape, birdShape }: { running: boolean; rabbitShape: BufferGeometry; birdShape: BufferGeometry }) {
  const roots = useRef<(Group | null)[]>([]), time = useRef(0);
  const sites = useMemo(() => [[-5.1, 1.7], [5.3, -1.9], [-5.6, -3.8], [4.9, 3.8], [1.8, -5.2]], []);
  useFrame((_, dt) => {
    if (!running) return; time.current += Math.min(dt, .05);
    roots.current.forEach((root, i) => {
      if (!root) return; const [x, z] = sites[i], phase = time.current * (i < 2 ? .6 : 1.3) + i;
      root.position.y = groundHeight(x, z) + (i < 2 ? Math.max(0, Math.sin(phase) - .92) * .65 : Math.max(0, Math.sin(phase) - .7) * .25);
      root.rotation.y = i * 1.7 + Math.sin(phase * .4) * .3;
    });
  });
  return <>{sites.map(([x, z], i) => <group key={i} ref={root => { roots.current[i] = root; }} position={[x, groundHeight(x, z), z]} rotation={[0, i * 1.7, 0]}><mesh geometry={i < 2 ? rabbitShape : birdShape} scale={i < 2 ? .8 : 1.2}><meshStandardMaterial vertexColors roughness={1}/></mesh></group>)}<Butterflies running={running}/></>;
}
function Butterflies({ running }: { running: boolean }) {
  const roots = useRef<(Group | null)[]>([]), wings = useRef<(Group | null)[]>([]), time = useRef(0);
  useFrame((_, dt) => {
    if (!running) return; time.current += Math.min(dt, .05);
    roots.current.forEach((root, i) => {
      if (!root) return; const t = time.current * .45 + i * 2.4;
      root.position.set(Math.sin(t) * (3.8 + i * .35), .9 + Math.sin(t * 1.7) * .3, Math.cos(t * .8) * 3.8);
      root.rotation.y = -t;
      for (let side = 0; side < 2; side++) if (wings.current[i * 2 + side]) wings.current[i * 2 + side]!.rotation.z = (side ? -1 : 1) * (.25 + Math.sin(time.current * 13 + i) * .65);
    });
  });
  return <>{Array.from({ length: 6 }, (_, i) => <group key={i} ref={root => { roots.current[i] = root; }} position={[Math.sin(i * 2.4) * 4, 1, Math.cos(i * 2.4) * 3.8]}>
    {[0, 1].map(side => <group key={side} ref={wing => { wings.current[i * 2 + side] = wing; }}><mesh position={[(side ? -1 : 1) * .065, 0, 0]} rotation={[-Math.PI / 2, 0, side ? -.3 : .3]} scale={[.075, .11, 1]}><circleGeometry args={[1, 7]}/><meshStandardMaterial color={i % 2 ? "#e5bc72" : "#c9b4e3"} side={2} roughness={1}/></mesh></group>)}
  </group>)}</>;
}

export default function Environment({ running }: { running: boolean }) {
  const { gl } = useThree();
  const shapes = useMemo(() => ({ pine: tree(true), oak: tree(false), grass: grass(), purple: flowers(true), white: flowers(false), yellow: flowers(false, true), bush: geometry(Array.from({ length: 5 }, (_, i) => ball(green[i % 4], [Math.sin(i * 2.4) * .4, .3 + i % 2 * .2, Math.cos(i * 2.4) * .4], [.55, .45, .55]))), rock: geometry([ball("#86917c", [0, .45, 0], [.85, .7, .68], 0), ball("#9aa38c", [.3, .7, -.13], [.57, .36, .53], 0)]), rabbit: rabbit(), bird: bird() }), []);
  const layout = useMemo(() => {
    const rand = generator(718), point = (x: number, z: number, size = 1): Point => ({ x, z, size, angle: rand() * Math.PI * 2 });
    const trees: Point[] = [], pines: Point[] = [], rocks: Point[] = [], bushes: Point[] = [], grasses: Point[] = [], purple: Point[] = [], white: Point[] = [], yellow: Point[] = [];
    for (let i = 0; i < 150; i++) {
      const x = (rand() - .5) * 68, z = (rand() - .5) * 62;
      if (Math.hypot(x / 1.35, z) < 9 || z > 0 && Math.abs(x) < 12) continue;
      (i % 3 ? pines : trees).push(point(x, z, .75 + rand() * .7));
    }
    // Frame the clearing without hiding the companions behind foreground trunks.
    [[-8, -3], [-6.8, -7], [1, -9.8], [7.8, -6.3], [10.2, 0], [-10.5, 3]].forEach(([x, z]) => trees.push(point(x, z, 1 + rand() * .25)));
    for (let i = 0; i < 90; i++) {
      const angle = rand() * Math.PI * 2, radius = 6.3 + rand() * 12, x = Math.cos(angle) * radius * 1.3, z = Math.sin(angle) * radius;
      if (z > 3 && Math.abs(x) < 6.2) continue;
      (i % 3 ? bushes : rocks).push(point(x, z, i % 3 ? .7 + rand() * .8 : .5 + rand() * 1.7));
    }
    for (let i = 0; i < 5700; i++) {
      const x = (rand() - .5) * 44, z = (rand() - .5) * 38, clearing = Math.abs(x) < 4.7 && Math.abs(z) < 3.5;
      const path = Math.abs(x - Math.sin(z * .3) * 2.6) < .9;
      if (path || clearing && rand() < .97) continue;
      const size = clearing ? .3 + rand() * .3 : .65 + rand() * .85;
      grasses.push(point(x, z, size));
    }
    // Natural drifts of flowers, rather than a ring of evenly spaced decorations.
    for (let clump = 0; clump < 110; clump++) {
      const angle = rand() * Math.PI * 2, radius = 5 + rand() * 12, x = Math.cos(angle) * radius * 1.2, z = Math.sin(angle) * radius;
      const bed = [purple, white, yellow][clump % 3];
      for (let j = 0; j < 8; j++) {
        const px = x + (rand() - .5) * 1.8, pz = z + (rand() - .5) * 1.5;
        if (Math.abs(px) < 4.65 && Math.abs(pz) < 3.3 || Math.abs(px - Math.sin(pz * .3) * 2.6) < .85) continue;
        bed.push(point(px, pz, .65 + rand() * .65));
      }
    }
    return { trees, pines, rocks, bushes, grasses, purple, white, yellow };
  }, []);
  const terrain = useMemo(() => {
    const shape = new PlaneGeometry(130, 130, 180, 180); shape.rotateX(-Math.PI / 2);
    const vertices = shape.getAttribute("position"), colors: number[] = [], base = new Color(), grassColor = new Color("#789645"), pathColor = new Color("#a59b69");
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i); vertices.setY(i, groundHeight(x, z));
      const distance = Math.abs(x - Math.sin(z * .3) * 2.6), path = Math.max(0, 1 - distance / 1.3) * .7;
      const mottle = .83 + Math.sin(x * 3.1 + z * 1.2) * Math.cos(z * 2.6 - x) * .07 + Math.sin(x * .4 - z * .7) * .07;
      base.copy(grassColor).lerp(pathColor, path).multiplyScalar(mottle); colors.push(base.r, base.g, base.b);
    }
    shape.setAttribute("color", new Float32BufferAttribute(colors, 3)); shape.computeVertexNormals(); return shape;
  }, []);
  useLayoutEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }, [gl, shapes]);
  return <>
    <fog attach="fog" args={["#8da68f", 26, 65]}/>
    <hemisphereLight args={["#e3edd9", "#7b8850", 1.8]}/>
    <directionalLight position={[-10, 16, 8]} color="#fff0cc" intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-far={65} shadow-bias={-.0005} shadow-normalBias={.06}/>
    <mesh geometry={terrain} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
    <Instances shape={shapes.pine} points={layout.pines} shadows/><Instances shape={shapes.oak} points={layout.trees} shadows/>
    <Instances shape={shapes.rock} points={layout.rocks} shadows/><Instances shape={shapes.bush} points={layout.bushes} shadows/>
    <Instances shape={shapes.grass} points={layout.grasses}/><Instances shape={shapes.purple} points={layout.purple}/><Instances shape={shapes.white} points={layout.white}/><Instances shape={shapes.yellow} points={layout.yellow}/>
    <Wildlife running={running} rabbitShape={shapes.rabbit} birdShape={shapes.bird}/>
  </>;
}
