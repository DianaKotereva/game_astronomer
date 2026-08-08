/**
 * Single point of contact with Babylon.js.
 *
 * We import the full core index deliberately: Babylon registers a great deal of
 * behaviour through side-effect modules (scene components for shadows, depth
 * rendering, particles, post-process pipelines...). Hunting those down one by one
 * costs debugging time and buys only bundle size, which is irrelevant here — the
 * whole game ships from local disk behind a loading screen and makes zero network
 * requests at runtime.
 */
export * from "@babylonjs/core";
