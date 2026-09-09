/// <reference types="astro/client" />

declare module "virtual:vocasync/audio-map" {
  import type { AudioMap } from "@vocasync/astro";

  const audioMap: AudioMap;
  export default audioMap;
}

declare module "virtual:vocasync/config" {
  import type { VocaSyncConfig } from "@vocasync/astro";

  const config: VocaSyncConfig;
  export default config;
}
