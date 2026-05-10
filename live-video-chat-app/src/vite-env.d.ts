/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: "http://localhost:5000";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
