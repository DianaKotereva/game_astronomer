/**
 * Geometry sanity check for the protagonist, on Babylon's NullEngine.
 *
 * A capture on the software rasteriser costs twenty minutes; this costs two
 * seconds and answers the question a screenshot cannot: does the geometry
 * actually exist, and are its numbers finite? It was written after a matrix
 * indexed as an object instead of as its float array turned every vertex of the
 * character, the lantern and the focus into NaN — meshes that report their
 * vertex count happily and draw absolutely nothing.
 */
globalThis.window = globalThis;
globalThis.location = { search: "" };
const el = () => ({ style:{}, classList:{add(){},remove(){},toggle(){},contains:()=>false},
  appendChild(){},append(){},addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],
  getContext:()=>({ fillRect(){},clearRect(){},drawImage(){},putImageData(){},getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),createRadialGradient:()=>({addColorStop(){}}),beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},fillText(){},measureText:()=>({width:10}),setTransform(){},translate(){},rotate(){},scale(){},clip(){} }),
  setAttribute(){}, innerHTML:"", textContent:"", width:1, height:1 });
globalThis.document = { createElement: () => el(), getElementById: () => el(), body: el(), head: el(), addEventListener(){}, querySelector: () => el() };

const B = await import("/home/user/game_astronomer/src/core/bjs.js");
const engine = new B.NullEngine();
const scene = new B.Scene(engine);
const { MaterialLib } = await import("/home/user/game_astronomer/src/materials/materials.js");
const { Rig } = await import("/home/user/game_astronomer/src/character/rig.js");

const mats = new MaterialLib(scene);
const rig = new Rig(scene, mats);
console.log("rig meshes:", rig.meshes.length);
let bad = 0;
for (const m of rig.meshes) {
  const v = m.getTotalVertices(), i = m.getTotalIndices();
  m.computeWorldMatrix(true);
  m.refreshBoundingInfo();
  const bb = m.getBoundingInfo().boundingBox;
  const size = bb.maximum.subtract(bb.minimum);
  const pos = m.getVerticesData("position");
  let nan = 0;
  for (let k = 0; k < pos.length; k++) if (!Number.isFinite(pos[k])) nan++;
  const flag = (v === 0 || i === 0 || nan > 0) ? `  <-- ${nan} NaN` : "";
  if (flag) bad++;
  console.log(`  ${m.name.padEnd(14)} v=${String(v).padStart(5)} ` +
    `size=${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)} ` +
    `nan=${nan} mat=${m.material ? m.material.name : "NONE"}${flag}`);
}
console.log(bad ? `${bad} empty meshes` : "all rig meshes have geometry");

// Where do the pieces sit in world space?
rig.root.computeWorldMatrix(true);
for (const n of ["pelvis","chest","neck","head","handL","handR","footL","footR"]) {
  rig[n].computeWorldMatrix(true);
  const p = rig[n].getAbsolutePosition();
  console.log(`  ${n.padEnd(7)} at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
}
