// Custom GLSL3 material for all voxel geometry. Sky and block light arrive as
// two channels so the day/night cycle is a uniform change, never a remesh.

import * as THREE from '../../vendor/three.module.js';

export const globalUniforms = {
  uAtlas: { value: null },
  uDaylight: { value: 1 },
  uFogColor: { value: new THREE.Color(0x9ec8e8) },
  uFogNear: { value: 30 },
  uFogFar: { value: 110 },
  uTime: { value: 0 },
};

const VERT = /* glsl */`
attribute float alayer;
attribute vec2 ashade;
varying vec2 vUv;
varying float vLayer;
varying vec2 vShade;
varying float vDepth;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vLayer = alayer;
  vShade = ashade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision highp sampler2DArray;
layout(location = 0) out vec4 fragColor;
uniform sampler2DArray uAtlas;
uniform float uDaylight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uAlpha;
uniform vec3 uTint;
uniform float uCutout;
uniform float uScan;
uniform float uGhostNear;
uniform float uGhostFar;
varying vec2 vUv;
varying float vLayer;
varying vec2 vShade;
varying float vDepth;
varying vec3 vWorld;
void main() {
  vec4 t = texture(uAtlas, vec3(vUv, vLayer));
  if (t.a < uCutout) discard;
  float l = max(vShade.x, vShade.y * uDaylight);
  l = max(l, 0.05);
  // A ghosted layer is a readout, not a wall: give it a floor of brightness so
  // unlit rock in the next hyper-layer never blacks out your own sky.
  if (uScan > 0.0) l = max(l, 0.34);
  vec3 c = t.rgb * l * uTint;
  // ghost slices get a faint horizontal scan so they read as "elsewhere"
  if (uScan > 0.0) {
    float s = 0.72 + 0.28 * sin((vWorld.y * 5.0) - uTime * 2.2);
    c = mix(c, uTint * l * 1.35, uScan * s * 0.55);
  }
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  c = mix(c, uFogColor, f);
  float a = t.a * uAlpha * (1.0 - f * 0.15);
  // A neighbouring hyper-layer is only legible close up: fade the ghost into
  // nothing past the phase bubble so the sky and your own layer stay readable.
  if (uScan > 0.0) a *= 1.0 - smoothstep(uGhostNear, uGhostFar, vDepth);
  fragColor = vec4(c, a);
}`;

function make(opts) {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: Object.assign({}, globalUniforms, {
      uAlpha: { value: opts.alpha },
      uTint: { value: new THREE.Color(opts.tint || 0xffffff) },
      uCutout: { value: opts.cutout },
      uScan: { value: opts.scan || 0 },
    }),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: opts.transparent,
    depthWrite: opts.depthWrite,
    side: opts.side,
  });
  m.uniforms.uAtlas = globalUniforms.uAtlas;
  m.uniforms.uDaylight = globalUniforms.uDaylight;
  m.uniforms.uFogColor = globalUniforms.uFogColor;
  m.uniforms.uFogNear = globalUniforms.uFogNear;
  m.uniforms.uFogFar = globalUniforms.uFogFar;
  m.uniforms.uTime = globalUniforms.uTime;
  m.uniforms.uGhostNear = opts.bubble.near;
  m.uniforms.uGhostFar = opts.bubble.far;
  return m;
}

/** role: 'solid' | 'ghost' | 'faint' */
/**
 * role: 'solid'  — the hyper-layer you occupy
 *       'ghost'  — the layer you are cross-fading into; wide, strong
 *       'faint'  — a layer you are merely peeking at; a local bubble
 */
export function createMaterialSet(role) {
  const alpha = role === 'solid' ? 1 : (role === 'ghost' ? 0.38 : 0.16);
  const tint = role === 'solid' ? 0xffffff : (role === 'ghost' ? 0x9fe4ff : 0xc0a8ff);
  const scan = role === 'solid' ? 0 : (role === 'ghost' ? 0.45 : 0.6);
  const trans = role !== 'solid';
  const bubble = role === 'ghost'
    ? { near: { value: 14 }, far: { value: 46 } }
    : { near: { value: 7 }, far: { value: 24 } };
  const common = { tint, scan, bubble };
  return {
    role,
    bubble,
    opaque: make({ ...common, alpha, cutout: 0.0, transparent: trans, depthWrite: !trans, side: THREE.FrontSide }),
    cutout: make({ ...common, alpha, cutout: 0.5, transparent: trans, depthWrite: !trans, side: THREE.DoubleSide }),
    blend:  make({ ...common, alpha: alpha * 0.92, cutout: 0.02, transparent: true, depthWrite: role === 'solid', side: THREE.DoubleSide }),
    setAlpha(a) {
      this.opaque.uniforms.uAlpha.value = role === 'solid' ? 1 : a;
      this.cutout.uniforms.uAlpha.value = role === 'solid' ? 1 : a;
      this.blend.uniforms.uAlpha.value = role === 'solid' ? 0.92 : a * 0.92;
    },
    setBubble(near, far) { this.bubble.near.value = near; this.bubble.far.value = far; },
  };
}
