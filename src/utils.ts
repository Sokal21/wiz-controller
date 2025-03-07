import { v4 as uuid } from '@lukeed/uuid';
import { validateNonEmptyObject, validateObjectKey, validateString } from './validations';

export function createRandomUUID (): string {
  return uuid();
}

// Disable no-unused-vars so the type definition of noop is clear.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function noop (...args: any): void {
  return;
}

// Disable no-unused-vars so the type definition of noop is clear.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function asyncNoop (...args: any): Promise<void> {
  return;
}

export interface TestsSetup {
  silenceConsoleWarn(): void;
  silenceConsoleLog(): void;
}

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type InterfaceValues<T> = {
  [K in keyof T]: T[K];
}[keyof T];

export type EmptyObject = Record<string, never>;

type NoParams = Record<string, unknown>;

export type WithAddress<T = NoParams> = T & { id: string };

type Command = (arg: unknown) => unknown;

type Notification = () => any;

export type Argument<T extends Command> = Parameters<T>[0];

export interface CommandValidator<T extends Command> {
  validateArg(arg: unknown): asserts arg is Argument<T>;
  validateRes(res: unknown): asserts res is ReturnType<T>;
}

export interface NotificationValidator<T extends Notification> {
  validate(arg: unknown): asserts arg is ReturnType<T>;
}

export function validateWithAddress<T> (value: unknown): asserts value is WithAddress<T> {
  validateNonEmptyObject(value);
  validateObjectKey(value, 'id');
  validateString(value.id);
}

export type CommandArg<T extends Command> = Argument<T>;
export type CommandRes<T extends Command> = ReturnType<T>;
