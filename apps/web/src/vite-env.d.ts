/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_STATUS_PAGE_URL?: string;
  readonly VITE_DESIGN_TOKENS_V2?: string;
  readonly VITE_UI_KIT?: string;
  readonly VITE_UI_KIT_SWITCHER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
