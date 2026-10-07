import { TransformControls } from '@react-three/drei';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { SceneFixture, Vec3 } from '../../../shared/protocol';
import { lampColors } from '../lib/lampColors';
import { lastDrag } from './drag';

const BULB_RADIUS = 0.11;
const IDLE_COLOR = new THREE.Color('#3b4276');
/** A lamp showing a very dark color still has to be findable on the dark stage. */
const DARKEST_BULB = new THREE.Color('#1b2044');
const SELECTED_COLOR = '#ffb454';

/** Soft white disc used for both the halo around a lamp and the pool of light it throws on the floor. */
let glowTexture: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

interface LampProps {
  fixture: SceneFixture;
  selected: boolean;
  /** Shows the move gizmo. */
  movable: boolean;
  /** A real device that is not answering right now. */
  offline: boolean;
  /** DOM element laid over the canvas where the name tags go. */
  labelLayer: HTMLElement | null;
  onSelect: (additive: boolean) => void;
  onMove: (position: Vec3) => void;
}

export function Lamp({ fixture, selected, movable, offline, labelLayer, onSelect, onMove }: LampProps) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  const texture = getGlowTexture();

  const bulb = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const halo = useMemo(
    () => new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }),
    [texture]
  );
  const pool = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }),
    [texture]
  );
  const [poolMesh, setPoolMesh] = useState<THREE.Mesh | null>(null);
  const [stem, setStem] = useState<THREE.Mesh | null>(null);

  // The name tag is a plain DOM node positioned every frame; it shows while the lamp is hovered or selected.
  const label = useRef<HTMLDivElement | null>(null);
  const labelText = `${fixture.name}${offline ? ' (offline)' : ''}`;
  const showLabel = hovered || selected;
  const anchor = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!labelLayer || !showLabel) return;
    const node = document.createElement('div');
    node.className = 'lamp-label';
    node.textContent = labelText;
    node.style.visibility = 'hidden';
    labelLayer.appendChild(node);
    label.current = node;
    return () => {
      node.remove();
      label.current = null;
    };
  }, [labelLayer, showLabel, labelText]);

  useFrame(({ camera, size }) => {
    if (!group) return;

    if (label.current) {
      anchor.copy(group.position);
      anchor.y += 0.3;
      anchor.project(camera);
      const left = ((anchor.x + 1) / 2) * size.width;
      const top = ((1 - anchor.y) / 2) * size.height;
      label.current.style.transform = `translate(-50%, -100%) translate(${left}px, ${top}px)`;
      label.current.style.visibility = anchor.z < 1 ? 'visible' : 'hidden';
    }

    const value = lampColors.get(fixture.id) ?? 0;
    const level = Math.max((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff) / 255;
    const height = Math.max(0, group.position.y);

    if (level > 0) {
      bulb.color.setHex(value);
      bulb.color.r = Math.max(bulb.color.r, DARKEST_BULB.r);
      bulb.color.g = Math.max(bulb.color.g, DARKEST_BULB.g);
      bulb.color.b = Math.max(bulb.color.b, DARKEST_BULB.b);
    } else {
      bulb.color.copy(IDLE_COLOR);
    }

    halo.color.setHex(value);
    halo.opacity = level;

    // The pool and the stem follow the lamp while it is being dragged, before the new position is saved.
    if (poolMesh) {
      pool.color.setHex(value);
      pool.opacity = (0.6 * level) / (1 + height * 0.3);
      poolMesh.position.y = 0.01 - group.position.y;
      poolMesh.scale.setScalar(1.2 + height * 1.1);
    }
    if (stem) {
      stem.visible = height > BULB_RADIUS;
      stem.scale.y = Math.max(height, 0.001);
      stem.position.y = -height / 2;
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
  };

  const commitMove = () => {
    lastDrag.at = performance.now();
    if (!group) return;
    const round = (value: number) => Math.round(value * 100) / 100;
    const position = { x: round(group.position.x), y: Math.max(0, round(group.position.y)), z: round(group.position.z) };
    // The prop may not change (dragged under the floor from y = 0), so put the object where it was saved.
    group.position.set(position.x, position.y, position.z);
    onMove(position);
  };

  const { x, y, z } = fixture.position;

  return (
    <>
      <group ref={setGroup} position={[x, y, z]}>
        <mesh
          material={bulb}
          onClick={handleClick}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[BULB_RADIUS, 24, 16]} />
        </mesh>
        <sprite material={halo} scale={1.5} raycast={() => null} />
        <mesh ref={setPoolMesh} material={pool} rotation-x={-Math.PI / 2} raycast={() => null}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh ref={setStem} raycast={() => null}>
          <cylinderGeometry args={[0.006, 0.006, 1, 6]} />
          <meshBasicMaterial color="#4a5290" toneMapped={false} />
        </mesh>
        {selected && (
          <mesh raycast={() => null}>
            <sphereGeometry args={[BULB_RADIUS * 1.9, 12, 8]} />
            <meshBasicMaterial color={SELECTED_COLOR} wireframe toneMapped={false} />
          </mesh>
        )}
      </group>
      {movable && group && (
        <TransformControls
          object={group}
          mode="translate"
          size={0.7}
          onMouseDown={() => (lastDrag.at = performance.now())}
          onMouseUp={commitMove}
        />
      )}
    </>
  );
}
