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
const TIME_STEP = 0.016
const REDUCED_MOTION_FACTOR = 0.1
const THEME_LERP = 0.12


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
  vec2 p1 = vec2(0.30 + 0.20*sin(t*0.7),        0.35 + 0.18*cos(t*0.5));
  vec2 p2 = vec2(0.78 + 0.15*sin(t*0.4 + 1.7),  0.70 + 0.15*sin(t*0.6));
  vec2 p3 = vec2(0.55 + 0.20*cos(t*0.3 + 3.1),  0.20 + 0.18*sin(t*0.9));
  /* 2 extra corner sources for full-screen coverage */
  vec2 p5 = vec2(0.15 + 0.10*sin(t*0.6+2.0),    0.85 + 0.10*cos(t*0.4+1.0));
  vec2 p6 = vec2(0.85 + 0.10*cos(t*0.5+3.5),    0.15 + 0.10*sin(t*0.7+0.8));
  /* cursor light — 1:1 follow */
  vec2 p4 = m;

  float d1 = length(uv - p1);
  float d2 = length(uv - p2);
  float d3 = length(uv - p3);
  float d4 = length(uv - p4);
  float d5 = length(uv - p5);
  float d6 = length(uv - p6);

  /* moderate radius — ambient accent on edges, cursor dominates locally */
  float s1  = smoothstep(0.55, 0.0, d1);
  float s2  = smoothstep(0.50, 0.0, d2);
  float s3  = smoothstep(0.45, 0.0, d3);
  float s5  = smoothstep(0.40, 0.0, d5);
  float s6  = smoothstep(0.40, 0.0, d6);
  /* cursor: tight core + medium halo */
  float s4  = smoothstep(0.25, 0.0, d4);
  float s4o = smoothstep(0.50, 0.0, d4);

  vec3 col = uColor2;
  col = mix(col, uColor1,                       s1  * 0.40);
  col = mix(col, uColor1,                       s2  * 0.35);
  col = mix(col, uColor1,                       s3  * 0.30);
  col = mix(col, uColor1,                       s5  * 0.22);
  col = mix(col, uColor1,                       s6  * 0.22);
  col = mix(col, uCursorColor,                  s4o * 0.20);  /* halo */
  col = mix(col, uCursorColor,                  s4  * 0.55);  /* core */

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
    color2: new THREE.Color(0x1e2035),
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
    const PR = Math.min(window.devicePixelRatio, 2)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(PR)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const current = PALETTE[themeRef.current]
    /** use actual canvas buffer size (CSS px × pixelRatio) so UV matches mouse coords */
    const bufW = renderer.domElement.width
    const bufH = renderer.domElement.height
    const uniforms: Record<string, THREE.IUniform> = {
      uTime:        { value: 0 },
      uMouse:       { value: new THREE.Vector2(0.5, 0.5) },
      uResolution:  { value: new THREE.Vector2(bufW, bufH) },
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
      renderer.setSize(w, h)
      uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height)
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

      /* cursor — direct snap every frame: zero lag, 1:1 tracking */
      uniforms.uMouse.value.copy(mouseTarget)

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
      className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden"
      aria-hidden="true"
      data-theme={theme}
    />
  )
}

export { ParticlegroundBg, type ParticlegroundBgProps }
