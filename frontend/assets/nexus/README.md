# Nexus 3D character asset slot

Place an optimized GLB named `nexus-character.glb` in this directory. The frontend loader in `frontend/js/components/nexus-assistant.js` will attempt to load it when the New Project wizard opens.

Expected animation clip names:

- `greeting_wave`
- `idle_breathing`
- `idle_look_left`
- `idle_look_right`
- `blink`

Asset recommendations:

- Keep geometry and materials lightweight; target a small compressed GLB.
- Use optimized textures and avoid expensive real-time lighting.
- Center the character at the origin and frame it for a compact portrait viewport.
- Keep animation clips short and non-blocking.
- Ensure the asset is licensed for Webnest Studio's use.

The model is intentionally not bundled. Until the model exists, the wizard displays an animated CSS character fallback. That fallback is not represented as a 3D asset.
