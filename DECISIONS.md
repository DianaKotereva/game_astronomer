# Decisions

Deviations from the brief, and why. One line each, per §88.

## Assets

- **Every asset is procedural; no CC0 library was vendored.** The environment's
  network policy blocks Poly Haven and ambientCG (403 at the proxy); npm only.
  Consequence: no scanned micro-detail or captured HDR environments, but also no
  visible texture repeat, per-block surface variation for free, and instrument
  engraving authored as vector linework rather than painted into a bitmap.
- **Audio is synthesised rather than sampled**, for the same reason. It suited
  the brief better than expected: §48 asks for harmonic tones, distant ringing
  and "sounds suggesting enormous distance", which is what additive synthesis is
  good at. Celestial Resonance's consonance is generated from the alignment
  quality directly, so the puzzle is audibly solvable with the screen off.

## Rendering

- **Screen-space reflections are off.** Babylon 9.20's WGSL variant of
  `screenSpaceReflection2` fails to compile (`unresolved value 'hitPixel'`) and
  poisons the whole pipeline. Mirrors and standing water use planar reflection
  probes instead — sharper, and for an optics puzzle where the player must trust
  what a mirror shows, more honest than an approximation that drops whatever is
  off-screen. `PostStack.enableSSR()` is kept for the day the engine bug is fixed.
- **Fog is a post-process, not Babylon scene fog.** Scene fog costs an
  inter-stage varying in every material and WebGPU allows only sixteen; two
  shadow-casting lights are worth more than that varying. Doing it in
  `post/atmosphere.js` also buys height falloff and a haze colour that warms
  toward the moon.
- **No vertex colours on architecture.** Same varying budget. Per-block tonal
  variation is achieved instead by giving each block its own offset into the
  stone texture, which is closer to how real masonry varies (stone to stone, not
  smoothly across a joint).
- **No triplanar shader.** Architecture UVs are world-space planar per face,
  baked into the mesh. On box-dominant geometry that is the same result for one
  texture fetch instead of three.
- **The environment probe is half float, not float.** Linear filtering of 32-bit
  float textures is an optional WebGPU feature; 16-bit is filterable everywhere.

## Character

- **The protagonist is built from capsules on a bone hierarchy, not a skinned
  mesh.** Seen from behind, at medium distance, through a coat, an articulated
  build with rounded overlapping joints is indistinguishable from skinning — and
  it puts the entire budget where §8 asks for it: silhouette, layered cloth,
  instruments and hands. The three cloth layers are genuinely simulated.
- **No animation clips.** Locomotion is generated from a stride phase that
  advances with distance travelled, with each foot pinned to a world position for
  the whole of its stance. This is the only way to guarantee no sliding, and it
  makes every interaction pose an IK target rather than an authored clip.

## Structure and scope

- **The Deep Instrument is not a separate room.** It is the undercroft and shaft
  system that the other chambers look down into — glimpsed through the broken
  floor of the Hall, through the orrery's well, and from the observatory stair.
  Making it a destination would have made it a room; leaving it as something seen
  through three other rooms is what makes the temple read as one machine (§11.6).
- **Time is advanced by a physical drum of hours, never by a slider.** §17 asks
  for the mechanism to rotate while the heavens accelerate; here the drum *is*
  the control, and turning it turns the night in real time.
- **Spell selection is entirely diegetic.** Keys 1–5 reconfigure the rings of the
  celestial focus in the character's hand; there is no hotbar and no on-screen
  name. The arrangements are distinct enough to read from behind.

## Environment-specific

- **`tools/gpuShim.js` exists only for headless capture.** The container's
  SwiftShader stack cannot allocate a canvas swapchain shared image, which kills
  the device the moment a page calls `getContext("webgpu")`; offscreen rendering
  and readback work fine. The shim hands the engine an ordinary texture as a
  virtual swapchain and reads it back for screenshots. No game code is involved
  and the shipped game uses the real swapchain.
- **`?q=low` exists for the same reason.** It cheapens shadow and SSAO
  resolution while keeping every system enabled, so iteration on a software
  rasteriser is possible. The default profile is the shipping one.
