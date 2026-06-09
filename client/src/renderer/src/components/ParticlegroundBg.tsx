/**
 * @file ParticlegroundBg — 登录页 Linear/Vercel 风格光标跟随网格渐变背景
 * @description 单 quad + ShaderMaterial 实现的网页背景：
 *              - 4 个漂浮 metaball 光源（其中 1 个跟随鼠标，lerp 平滑）
 *              - 紫黑底（#1a1b2e）+ 薰衣草高光（#a78bfa）的网格渐变
 *              - 胶片颗粒 + 暗角（vignette）后处理
 *              - prefers-reduced-motion: reduce 时慢速 0.1x 漂移
 *              - 单 draw call，pixelRatio 上限 2，全屏 OrthographicCamera + PlaneGeometry(2,2)
 *
 *              零新增依赖：three@^0.169.0 已存在于 client/package.json。
 * @module renderer/components
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** 鼠标 lerp 平滑系数（越小越柔顺，0.05–0.1 之间） */
const MOUSE_LERP = 0.08
/** 帧间 uTime 累加步长（秒/帧） */
const TIME_STEP = 0.016
/** prefers-reduced-motion 模式下的时间倍率（保持视觉漂移但更慢） */
const REDUCED_MOTION_FACTOR = 0.1

const VERTEX_SHADER = /* glsl */ `
void main(){ gl_Position = vec4(position, 1.0); }
`

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2  uMouse;
uniform vec2  uResolution;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform float uIntensity;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 m  = uMouse;
  float t = uTime * 0.3;

  vec2 p1 = vec2(0.30 + 0.18*sin(t*0.7),        0.35 + 0.15*cos(t*0.5));
  vec2 p2 = vec2(0.78 + 0.12*sin(t*0.4 + 1.7),  0.70 + 0.20*sin(t*0.6));
  vec2 p3 = vec2(0.55 + 0.22*cos(t*0.3 + 3.1),  0.20 + 0.12*sin(t*0.9));
  vec2 p4 = mix(vec2(0.5, 0.5), m, 0.6 + 0.1*sin(t*0.8));

  float d1 = length(uv - p1);
  float d2 = length(uv - p2);
  float d3 = length(uv - p3);
  float d4 = length(uv - p4);

  float s1 = smoothstep(0.55, 0.0, d1);
  float s2 = smoothstep(0.50, 0.0, d2);
  float s3 = smoothstep(0.60, 0.0, d3);
  float s4 = smoothstep(0.45, 0.0, d4);

  vec3 col = uColor2;
  col = mix(col, uColor1, s1 * 0.85);
  col = mix(col, uColor1, s2 * 0.65);
  col = mix(col, vec3(0.65, 0.55, 0.95), s3 * 0.45);
  col = mix(col, vec3(1.0, 1.0, 1.0), s4 * 0.12);

  float g = noise(uv * uResolution.xy * 0.5 + t) * 0.025;
  col += g;

  float vig = 1.0 - smoothstep(0.4, 1.1, length(uv - 0.5));
  col *= mix(0.85, 1.0, vig);

  col = mix(uColor2 * 0.85, col, uIntensity);
  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * Linear/Vercel 风格光标跟随网格渐变背景。
 * 无 props、命名导出、零依赖（three 仅）。
 */
export const ParticlegroundBg: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── 渲染器 ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // ── 场景与相机（正交 + 全屏 quad）────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // ── Uniforms ──────────────────────────────────────────
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight)
      },
      uColor1: { value: new THREE.Color(0xa78bfa) },
      uColor2: { value: new THREE.Color(0x1a1b2e) },
      uIntensity: { value: 0.6 }
    }

    // ── 材质与几何 ────────────────────────────────────────
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false
    })
    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)

    // ── 鼠标目标（用于 lerp 平滑）─────────────────────────
    const mouseTarget = new THREE.Vector2(0.5, 0.5)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ── 事件监听 ──────────────────────────────────────────
    const handleMouseMove = (e: MouseEvent): void => {
      mouseTarget.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight)
    }
    const handleResize = (): void => {
      const w = window.innerWidth
      const h = window.innerHeight
      uniforms.uResolution.value.set(w, h)
      renderer.setSize(w, h)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('resize', handleResize)

    // ── rAF 循环 ──────────────────────────────────────────
    let rafId = 0
    const tick = (): void => {
      uniforms.uTime.value += reducedMotion ? TIME_STEP * REDUCED_MOTION_FACTOR : TIME_STEP
      uniforms.uMouse.value.lerp(mouseTarget, MOUSE_LERP)
      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    // ── 清理 ──────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
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
    />
  )
}

export default ParticlegroundBg
