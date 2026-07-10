/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOWCASE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
