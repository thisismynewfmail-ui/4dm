// Sky dome, sun, moon and stars. Each hyper-layer gets its own palette, so the
// colour of the light tells you where you are in the fourth dimension.

import * as THREE from '../../vendor/three.module.js';
import { LAYER_SKY, LAYER_FOG, W_LAYERS } from '../world/constants.js';
import { globalUniforms } from './voxelmat.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.999999;
}`;

const SKY_FRAG = /* glsl */`
layout(location = 0) out vec4 fragColor;
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uPhase;
void main() {
  float h = vDir.y;
  vec3 c = mix(uHorizon, uTop, clamp(pow(max(h, 0.0), 0.55), 0.0, 1.0));
  c = mix(c, uGround, clamp(-h * 3.0, 0.0, 1.0));
  float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  c += uSunColor * pow(sd, 8.0) * 0.5;
  c += uSunColor * pow(sd, 220.0) * 2.2;
  // phase shimmer: bands of the neighbouring layer bleeding through
  if (uPhase > 0.001) {
    float band = sin(vDir.y * 26.0 + uPhase * 30.0) * 0.5 + 0.5;
    c = mix(c, vec3(0.55, 0.85, 1.0), uPhase * band * 0.22);
  }
  fragColor = vec4(c, 1.0);
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color(0x4f8fd0) },
      uHorizon: { value: new THREE.Color(0x9ec8e8) },
      uGround: { value: new THREE.Color(0x2c3440) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff0c0) },
      uNight: { value: 0 },
      uPhase: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    scene.add(this.mesh);

    // stars
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.abs(u) * 0.9 + 0.06; pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.006, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -99;
    scene.add(this.stars);

    // sun & moon: a crisp square core in a soft halo, drawn from a tiny
    // generated texture so there is no hard rectangle against the sky
    const discTex = (inner, outer, hard) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, inner);
      grd.addColorStop(hard, inner);
      grd.addColorStop(hard + 0.06, outer);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.needsUpdate = true;
      return t;
    };
    const mk = (tex, size) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false, depthTest: false,
          fog: false, blending: THREE.AdditiveBlending,
        }),
      );
      m.frustumCulled = false; m.renderOrder = -98; scene.add(m); return m;
    };
    this.sun = mk(discTex('rgba(255,246,214,1)', 'rgba(255,208,130,0.30)', 0.30), 0.17);
    this.moon = mk(discTex('rgba(222,232,252,1)', 'rgba(140,170,225,0.22)', 0.28), 0.115);
  }

  /**
   * @param {number} time 0..24000
   * @param {number} wFloat fractional hyper-layer
   * @param {THREE.Vector3} camPos
   * @param {number} phaseAmount 0..1
   */
  update(time, wFloat, camPos, phaseAmount, daylight) {
    const t = (time % 24000) / 24000;
    const ang = (t - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.4, Math.sin(ang), Math.cos(ang) * 0.9).normalize();

    const w0 = Math.max(0, Math.min(W_LAYERS - 1, Math.floor(wFloat)));
    const w1 = Math.max(0, Math.min(W_LAYERS - 1, w0 + 1));
    const f = Math.max(0, Math.min(1, wFloat - w0));
    const skyA = new THREE.Color(LAYER_SKY[w0]), skyB = new THREE.Color(LAYER_SKY[w1]);
    const fogA = new THREE.Color(LAYER_FOG[w0]), fogB = new THREE.Color(LAYER_FOG[w1]);
    const sky = skyA.clone().lerp(skyB, f);
    const fog = fogA.clone().lerp(fogB, f);

    const night = 1 - daylight;
    const dusk = Math.max(0, 1 - Math.abs(Math.sin(ang)) * 2.2);
    sky.multiplyScalar(0.16 + daylight * 0.9);
    fog.multiplyScalar(0.18 + daylight * 0.86);
    const horizon = fog.clone().lerp(new THREE.Color(0xffb27a), dusk * 0.45);

    this.uniforms.uTop.value.copy(sky).multiplyScalar(0.82);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uGround.value.copy(fog).multiplyScalar(0.35);
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.setRGB(1, 0.94, 0.78).multiplyScalar(0.35 + daylight * 0.65);
    this.uniforms.uNight.value = night;
    this.uniforms.uPhase.value = phaseAmount;

    globalUniforms.uFogColor.value.copy(fog);
    globalUniforms.uDaylight.value = daylight;

    this.mesh.position.copy(camPos);
    this.mesh.scale.setScalar(1);
    this.stars.position.copy(camPos);
    this.starMat.opacity = Math.max(0, night * 1.4 - 0.35);

    this.sun.position.copy(camPos).addScaledVector(sunDir, 0.85);
    this.sun.lookAt(camPos);
    this.sun.material.opacity = Math.max(0, Math.min(1, sunDir.y * 8 + 0.75));
    const moonDir = sunDir.clone().negate();
    this.moon.position.copy(camPos).addScaledVector(moonDir, 0.85);
    this.moon.lookAt(camPos);
    this.moon.material.opacity = Math.max(0, Math.min(1, moonDir.y * 8 + 0.4));
    return { sky, fog };
  }
}
