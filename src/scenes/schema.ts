import { z } from 'zod';
import type { Scene } from '../../shared/protocol';
import { HEX_COLOR } from '../color';

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(60);
export const hexColor = z.string().regex(HEX_COLOR);

/** Lamps may sit a bit outside the room (a balcony, a hallway), but not arbitrarily far. */
const coordinate = z.number().finite().min(-100).max(100);
const roomSize = z.number().finite().min(0.5).max(100);

const fixtureSchema = z.object({
  id,
  kind: z.enum(['wiz', 'magic-home', 'arduino', 'sim']),
  name,
  position: z.object({ x: coordinate, y: coordinate, z: coordinate }),
});

const layerSchema = z.object({
  id,
  effect: z.string().min(1).max(40),
  targets: z.array(id).max(500).nullable(),
  params: z.record(z.union([z.string().max(100), z.number().finite(), z.boolean()])),
});

const lookSchema = z.object({
  id,
  name,
  layers: z.array(layerSchema).max(16),
});

const padSchema = z.object({
  key: z.string().length(1),
  color: hexColor,
});

const unique = <T extends { id: string }>(items: T[]) => new Set(items.map((item) => item.id)).size === items.length;

export const sceneSchema: z.ZodType<Scene> = z.object({
  id,
  name,
  room: z.object({ width: roomSize, depth: roomSize, height: roomSize }),
  fixtures: z.array(fixtureSchema).max(500).refine(unique, 'Duplicate fixture id'),
  looks: z.array(lookSchema).max(100).refine(unique, 'Duplicate look id'),
  pads: z.array(padSchema).max(32),
});

export const storeFileSchema = z.object({
  version: z.literal(1),
  activeSceneId: z.string().nullable(),
  beatSourceUrl: z.string().nullable(),
  scenes: z.array(sceneSchema),
});

export type StoreFile = z.infer<typeof storeFileSchema>;
