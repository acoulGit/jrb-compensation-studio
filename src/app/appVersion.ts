/**
 * Version applicative affichable hors contexte Tauri (tests, preview Vite).
 * Doit rester alignée sur `package.json`, `src-tauri/Cargo.toml` et
 * `src-tauri/tauri.conf.json`.
 *
 * Dans l’application desktop, l’écran « À propos » préfère `getVersion()` Tauri
 * (manifeste embarqué), avec repli sur cette constante si l’API est indisponible.
 */
export const APP_VERSION = "0.9.1-2" as const;

export const APP_PUBLISHER = "JRB XSolutions";
