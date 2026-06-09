/**
 * @file ParticlegroundBg — theme-aware cursor-following mesh gradient
 *
 * Single full-screen quad + ShaderMaterial with 4 metaball sources
 * (3 ambient drifting + 1 cursor-synced).  Theme-aware via uColor1/uColor2/
 * uCursorColor uniforms that lerp between dark/light palettes (~320 ms).
 *
 * Zero new dependencies — three v0.169.0 is already installed.
 * @module renderer/components
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/* ---- tunables ---------------------------------------------------------- */
const MOUSE_LERP_BASE = 0.22
const TIME_STEP = 0.016
const REDUCED_MOTION_FACTOR = 0.1
const THEME_LERP = 0.12
const MOUSE_STILL_THRESHOLD = 0.0008

/* ---- shaders ----------------------------------------------------------- */
const VERT = /* glsl */ `
void main(){ gl_Position = vec4(position, 1.0); }
`

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2  uMouse;
uniform vec2  uResolution;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uCursorColor;
uniform float uIntensity;

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 m  = uMouse;
  float t = uTime * 0.3;

  /* 3 ambient metaballs drifting slowly */
  vec2 p1 = vec2(0.30 + 0.18*sin(t*0.7),        0.35 + 0.15*cos(t*0.5));
  vec2 p2 = vec2(0.78 + 0.12*sin(t*0.4 + 1.7),  0.70 + 0.20*sin(t*0.6));
  vec2 p3 = vec2(0.55 + 0.22*cos(t*0.3 + 3.1),  0.20 + 0.12*sin(t*0.9));
  /* cursor light — 1:1 follow (lerp done in JS, passed via uMouse) */
  vec2 p4 = m;

  float d1 = length(uv - p1);
  float d2 = length(uv - p2);
  float d3 = length(uv - p3);
  float d4 = length(uv - p4);

  float s1 = smoothstep(0.60, 0.0, d1);
  float s2 = smoothstep(0.55, 0.0, d2);
  float s3 = smoothstep(0.65, 0.0, d3);
  /* cursor highlight: tight inner core (0.18) + soft outer halo (0.40) */
  float s4  = smoothstep(0.18, 0.0, d4);
  float s4o = smoothstep(0.40, 0.0, d4);

  vec3 col = uColor2;
  col = mix(col, uColor1,                       s1  * 0.85);
  col = mix(col, uColor1,                       s2  * 0.65);
  col = mix(col, mix(uColor1, uCursorColor, 0.5), s3  * 0.45);
  col = mix(col, uCursorColor,                  s4o * 0.18);  /* outer halo */
  col = mix(col, uCursorColor,                  s4  * 0.55);  /* inner core */

  /* film grain */
  col += noise(uv * uResolution.xy * 0.5 + t) * 0.025;

  /* vignette */
  float vig = 1.0 - smoothstep(0.4, 1.1, length(uv - 0.5));
  col *= mix(0.85, 1.0, vig);

  col = mix(uColor2 * 0.85, col, uIntensity);
  gl_FragColor = vec4(col, 1.0);
}
`

/* ---- theme palettes ---------------------------------------------------- */
const PALETTE = {
  light: {
    color1: new THREE.Color(0x8b5cf6),
    color2: new THREE.Color(0xfaf8ff),
    cursor: new THREE.Color(0xfff7e6),
  },
  dark: {
    color1: new THREE.Color(0xa78bfa),
    color2: new THREE.Color(0x1a1b2e),
    cursor: new THREE.Color(0xffffff),
  },
} as const

/* ---- component --------------------------------------------------------- */

interface ParticlegroundBgProps {
  theme?: 'light' | 'dark'
}

// eslint-disable-next-line react/prop-types
const ParticlegroundBg: React.FC<ParticlegroundBgProps> = ({ theme = 'dark' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<'light' | 'dark'>(theme)

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    /* ---- init renderer + scene ----------------------------------------- */
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const current = PALETTE[themeRef.current]
    const uniforms: Record<string, THREE.IUniform> = {
      uTime:        { value: 0 },
      uMouse:       { value: new THREE.Vector2(0.5, 0.5) },
      uResolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uColor1:      { value: current.color1.clone() },
      uColor2:      { value: current.color2.clone() },
      uCursorColor: { value: current.cursor.clone() },
      uIntensity:   { value: 0.6 },
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthWrite: false,
      depthTest: false,
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)

    /* ---- mouse --------------------------------------------------------- */
    const mouseTarget = new THREE.Vector2(0.5, 0.5)
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onMove = (e: MouseEvent): void => {
      mouseTarget.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight)
    }
    const onResize = (): void => {
      const w = window.innerWidth
      const h = window.innerHeight
      uniforms.uResolution.value.set(w, h)
      renderer.setSize(w, h)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', onResize)

    /* ---- tick ---------------------------------------------------------- */
    let raf = 0
    const tick = (): void => {
      /* theme palette lerp */
      const p = PALETTE[themeRef.current]
      uniforms.uColor1.value.lerp(p.color1, THEME_LERP)
      uniforms.uColor2.value.lerp(p.color2, THEME_LERP)
      uniforms.uCursorColor.value.lerp(p.cursor, THEME_LERP)

      /* time */
      uniforms.uTime.value += reducedMotion
        ? TIME_STEP * REDUCED_MOTION_FACTOR
        : TIME_STEP

      /* cursor — adaptive lerp: snap when still, smooth when moving */
      const dx = mouseTarget.x - uniforms.uMouse.value.x
      const dy = mouseTarget.y - uniforms.uMouse.value.y
      const delta = Math.hypot(dx, dy)
      if (delta < MOUSE_STILL_THRESHOLD) {
        uniforms.uMouse.value.copy(mouseTarget)
      } else {
        uniforms.uMouse.value.lerp(mouseTarget, MOUSE_LERP_BASE)
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    /* ---- cleanup ------------------------------------------------------- */
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      data-theme={theme}
    />
  )
}

export { ParticlegroundBg, type ParticlegroundBgProps }
