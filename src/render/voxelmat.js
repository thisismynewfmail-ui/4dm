// ---------------------------------------------------------------------------
// The voxel material.
//
// Two hyper-layers are on screen at once: the one below your position in W and
// the one above. An ordered-dither cross-dissolve decides, per pixel, which of
// the two to show. Because the layers are close together most of the world
// agrees between them and the dissolve is invisible; where they disagree, the
// terrain appears to flow. No transparency, no sorting, correct depth.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';

export const globalUniforms = {
  uAtlas: { value: null },
  uDaylight: { value: 1 },
  uFogColor: { value: new THREE.Color(0x9ec8e8) },
  uFogNear: { value: 30 },
  uFogFar: { value: 110 },
  uTime: { value: 0 },
  /** Fraction of the way from the lower resident layer to the upper one. */
  uT: { value: 0 },
};

const VERT = /* glsl */`
attribute float alayer;
attribute vec2 ashade;
varying vec2 vUv;
varying float vLayer;
varying vec2 vShade;
varying float vDepth;
void main() {
  vUv = uv;
  vLayer = alayer;
  vShade = ashade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
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
uniform float uT;
uniform float uCutout;
uniform float uAlpha;
uniform int uSide;      // 0 always draw, 1 lower layer, 2 upper layer
varying vec2 vUv;
varying float vLayer;
varying vec2 vShade;
varying float vDepth;

// 8x8 ordered dither, 64 levels — fine enough that the hand-off between two
// hyper-layers reads as motion rather than as noise.
float bayer8(vec2 p) {
  ivec2 c = ivec2(floor(p));
  int x = c.x & 7;
  int y = c.y & 7;
  int m = x ^ y;
  int v = ((m & 4) >> 2) | ((y & 4) >> 1) | ((m & 2) << 1)
        | ((y & 2) << 2) | ((m & 1) << 4) | ((y & 1) << 5);
  return (float(v) + 0.5) / 64.0;
}

void main() {
  if (uSide != 0) {
    float d = bayer8(gl_FragCoord.xy);
    if (uSide == 1) { if (d < uT) discard; }
    else            { if (d >= uT) discard; }
  }
  vec4 tex = texture(uAtlas, vec3(vUv, vLayer));
  if (tex.a < uCutout) discard;
  float l = max(vShade.x, vShade.y * uDaylight);
  l = max(l, 0.05);
  vec3 c = tex.rgb * l;
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  c = mix(c, uFogColor, f);
  fragColor = vec4(c, tex.a * uAlpha);
}`;

function make(opts) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uAtlas: globalUniforms.uAtlas,
      uDaylight: globalUniforms.uDaylight,
      uFogColor: globalUniforms.uFogColor,
      uFogNear: globalUniforms.uFogNear,
      uFogFar: globalUniforms.uFogFar,
      uTime: globalUniforms.uTime,
      uT: globalUniforms.uT,
      uCutout: { value: opts.cutout },
      uAlpha: { value: opts.alpha === undefined ? 1 : opts.alpha },
      uSide: { value: opts.side === undefined ? 0 : opts.side },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite !== false,
    side: opts.faceSide,
  });
}

/** `side`: 1 = the lower resident hyper-layer, 2 = the upper one. */
function set(side) {
  return {
    opaque: make({ cutout: 0.0, faceSide: THREE.FrontSide, side }),
    cutout: make({ cutout: 0.5, faceSide: THREE.DoubleSide, side }),
    blend: make({ cutout: 0.02, alpha: 0.86, transparent: true, depthWrite: true, faceSide: THREE.DoubleSide, side }),
  };
}

/**
 * `solo` draws unconditionally. A chunk that has only one of the two resident
 * layers built uses it, so a chunk still catching up shows slightly stale
 * terrain instead of a hole — travel never has to wait for the builder.
 */
export function createMaterialSets() {
  return { lower: set(1), upper: set(2), solo: set(0) };
}

/** Entity geometry (dropped items) always draws; it has no layer of its own. */
export function createEntityMaterial() {
  return make({ cutout: 0.5, faceSide: THREE.DoubleSide, side: 0 });
}
