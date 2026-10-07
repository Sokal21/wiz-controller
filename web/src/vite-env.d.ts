/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address of the light server. Defaults to port 3000 on the host serving the page. */
  readonly VITE_SERVER_URL?: string;
}
