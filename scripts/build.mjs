import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(projectRoot, "src");
const distDir = join(projectRoot, "dist");

const env = (name) => process.env[name]?.trim() ?? "";

const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
  measurementId: env("VITE_FIREBASE_MEASUREMENT_ID")
};

const runtimeConfig = `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig, null, 2)};
window.__GAME_COLLECTION__ = ${JSON.stringify(env("VITE_FIREBASE_COLLECTION") || "scores")};
`;

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(srcDir, distDir, { recursive: true });
await writeFile(join(distDir, "runtime-config.js"), runtimeConfig);

console.log("Built Flux Relay into dist/.");
