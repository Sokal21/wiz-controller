import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Room, Scene } from '../../../shared/protocol';
import { select, selectLamp, updateActiveScene, useStore } from '../lib/store';
import { lastDrag } from './drag';
import { Lamp } from './Lamp';

type View = 'perspective' | 'top';

function RoomShell({ room }: { room: Room }) {
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width, room.height, room.depth)),
    [room.width, room.height, room.depth]
  );
  // One line per meter, through the center of the room.
  const grid = useMemo(() => {
    const halfWidth = room.width / 2;
    const halfDepth = room.depth / 2;
    const points: number[] = [];
    for (let x = Math.ceil(-halfWidth); x <= halfWidth; x++) points.push(x, 0, -halfDepth, x, 0, halfDepth);
    for (let z = Math.ceil(-halfDepth); z <= halfDepth; z++) points.push(-halfWidth, 0, z, halfWidth, 0, z);
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  }, [room.width, room.depth]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.005}>
        <planeGeometry args={[room.width, room.depth]} />
        <meshBasicMaterial color="#12163a" toneMapped={false} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#232a58" toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={edges} position-y={room.height / 2}>
        <lineBasicMaterial color="#3a4280" toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** Frames the room whenever the view or the room size changes. */
function CameraRig({ view, room }: { view: View; room: Room }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    const span = Math.max(room.width, room.depth);
    if (view === 'top') camera.position.set(0, span * 1.7 + room.height, 0.001);
    else camera.position.set(span * 0.95, room.height + span * 0.65, span * 1.45);

    controls?.target.set(0, view === 'top' ? 0 : room.height / 3, 0);
    controls?.update();
  }, [view, room.width, room.depth, room.height, camera, controls]);

  return null;
}

export function Stage({ scene }: { scene: Scene }) {
  const selected = useStore((state) => state.selected);
  const fixtures = useStore((state) => state.app?.fixtures);
  const [view, setView] = useState<View>('perspective');
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);

  const offline = useMemo(() => new Set(fixtures?.filter((fixture) => !fixture.online).map((fixture) => fixture.id)), [fixtures]);
  const known = useMemo(() => new Set(fixtures?.map((fixture) => fixture.id)), [fixtures]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        flat
        camera={{ fov: 45, near: 0.1, far: 500 }}
        onPointerMissed={() => {
          if (performance.now() - lastDrag.at > 250) select([]);
        }}
      >
        <color attach="background" args={['#0d1022']} />
        <RoomShell room={scene.room} />
        {scene.fixtures.map((fixture) => (
          <Lamp
            key={fixture.id}
            fixture={fixture}
            selected={selected.includes(fixture.id)}
            movable={selected.length === 1 && selected[0] === fixture.id}
            labelLayer={labelLayer}
            offline={fixture.kind !== 'sim' && (offline.has(fixture.id) || !known.has(fixture.id))}
            onSelect={(additive) => selectLamp(fixture.id, additive)}
            onMove={(position) =>
              updateActiveScene((current) => ({
                ...current,
                fixtures: current.fixtures.map((other) => (other.id === fixture.id ? { ...other, position } : other)),
              }))
            }
          />
        ))}
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1} maxDistance={120} />
        <CameraRig view={view} room={scene.room} />
      </Canvas>
      <div ref={setLabelLayer} className="pointer-events-none absolute inset-0 overflow-hidden" />

      <div className="absolute left-3 top-3 flex gap-1">
        <button className={`btn ${view === 'perspective' ? 'btn-on' : ''}`} onClick={() => setView('perspective')}>
          3D
        </button>
        <button className={`btn ${view === 'top' ? 'btn-on' : ''}`} onClick={() => setView('top')}>
          Top
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] text-xs text-dim">
        {scene.fixtures.length === 0
          ? 'This scene has no lamps yet. Add a simulated one, or place a detected lamp, from the list on the left.'
          : 'Drag to orbit, scroll to zoom. Click a lamp to select it and move it with the arrows; Shift-click selects several.'}
      </p>
    </div>
  );
}
