/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-svgr/client" />
interface ImportMetaEnv {
  VITE_APP_PORT: string;

  // Collaboration WebSocket server (excalidraw-room)
  VITE_APP_WS_SERVER_URL: string;

  // PocketBase self-hosted
  VITE_APP_POCKETBASE_URL: string;

  VITE_APP_LIBRARY_URL: string;
  VITE_APP_LIBRARY_BACKEND: string;

  VITE_APP_ENABLE_TRACKING: string;

  // Set to false to open the overlay by default
  VITE_APP_COLLAPSE_OVERLAY: string;

  VITE_APP_ENABLE_ESLINT: string;

  VITE_APP_ENABLE_PWA: string;

  VITE_APP_GIT_SHA: string;

  // Whether to disable live reload / HMR (for Service Worker debugging)
  VITE_APP_DEV_DISABLE_LIVE_RELOAD: string;

  VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: string;
  VITE_APP_DISABLE_PREVENT_UNLOAD: string;

  MODE: string;
  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
