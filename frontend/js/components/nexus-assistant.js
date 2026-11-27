// Nexus uses a graceful 2D fallback unless an optimized GLB is supplied in assets/nexus/.
// The Three.js loader is lazy: it is imported only when the project wizard opens.
let activeCleanup = null;
let mountGeneration = 0;

export async function mountNexus(container) {
  if (!container) return;
  const generation=++mountGeneration;
  activeCleanup?.(); activeCleanup = null;
  container.innerHTML = `<div class="nexus-fallback" role="img" aria-label="Nexus assistant illustration"><span class="nexus-wave"></span><span class="nexus-eyes"><i></i><i></i></span><span class="nexus-cheek left"></span><span class="nexus-cheek right"></span><span class="nexus-smile"></span></div>`;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.WebGLRenderingContext) return;
  try {
    const THREE = await import('https://esm.sh/three@0.171.0');
    const { GLTFLoader } = await import('https://esm.sh/three@0.171.0/examples/jsm/loaders/GLTFLoader.js');
    if(generation!==mountGeneration || !container.isConnected) return;
    const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setSize(138,160);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32,138/160,.1,50); camera.position.set(0,1.3,4.4);
    scene.add(new THREE.HemisphereLight(0xded7ff,0x292044,2.0));
    const key = new THREE.DirectionalLight(0xffffff,2.1); key.position.set(2,4,3); scene.add(key);
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve,reject)=>loader.load('../assets/nexus/nexus-character.glb',resolve,undefined,reject));
    if(generation!==mountGeneration || !container.isConnected){renderer.dispose();return;}
    const model = gltf.scene; model.scale.setScalar(1.35); scene.add(model);
    const mixer = gltf.animations?.length ? new THREE.AnimationMixer(model) : null;
    const clips=new Map((gltf.animations||[]).map(clip=>[clip.name,clip]));
    if(mixer) {
      const idle=clips.get('idle_breathing');
      const greeting=clips.get('greeting_wave');
      if(idle) mixer.clipAction(idle).play();
      if(greeting) { const action=mixer.clipAction(greeting); action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished=true; action.play(); }
    }
    container.replaceChildren(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','Nexus 3D assistant');
    let frame=0, last=performance.now(), visible=!document.hidden, nextGesture=last+6500, gestureIndex=0;
    const gestures=['idle_look_left','idle_look_right','blink'].map(name=>clips.get(name)).filter(Boolean);
    const tick=now=>{
      if(!visible) return;
      const delta=Math.min((now-last)/1000,.05); last=now;
      if(mixer&&gestures.length&&now>=nextGesture){
        const action=mixer.clipAction(gestures[gestureIndex++%gestures.length]);
        action.reset(); action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished=true; action.fadeIn(.12).play();
        nextGesture=now+(gestureIndex%3===0?5000:7500);
      }
      mixer?.update(delta); renderer.render(scene,camera); frame=requestAnimationFrame(tick);
    };
    const onVisibility=()=>{ visible=!document.hidden; if(visible){last=performance.now();cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);}else cancelAnimationFrame(frame); };
    document.addEventListener('visibilitychange',onVisibility);
    container._nexusDispose=()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',onVisibility);mixer?.stopAllAction();renderer.dispose();scene.traverse(o=>{o.geometry?.dispose?.(); if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose?.();}}});};
    activeCleanup=container._nexusDispose;
    frame=requestAnimationFrame(tick);
  } catch (error) {
    // Missing GLB/WebGL/network is expected until a model is supplied; the visible CSS fallback remains.
    container.dataset.mode='fallback';
  }
}
export function unmountNexus(container) {
  mountGeneration++;
  if(container?._nexusDispose) container._nexusDispose();
  else activeCleanup?.();
  activeCleanup=null;
}
