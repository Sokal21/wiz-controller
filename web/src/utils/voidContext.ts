export function createVoidContext<T extends object>(name: string): T {
  const obj = {} as T;
  const handler: ProxyHandler<T> = {
    get(_target: T, _key: string) {
      throw new Error(`Cannot use ${name} context outside of its provider`);
    },
  };

  return new Proxy<T>(obj, handler);
}
