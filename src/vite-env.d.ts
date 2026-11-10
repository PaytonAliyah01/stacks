/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Shared Google Books key, set from the GOOGLE_BOOKS_KEY repository secret at build time. */
  readonly VITE_GOOGLE_BOOKS_KEY?: string;
}
