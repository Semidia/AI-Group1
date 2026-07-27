/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_ADMIN_USERNAME?: string;
  readonly VITE_FRONTEND_SHOWCASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

