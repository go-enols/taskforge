/**
 * @file ParticlegroundBg — 登录页 主题感知 光标跟随 网格渐变背景
 * @description 单 quad + ShaderMaterial 实现的网页背景：
 *              - 4 个漂浮 metaball 光源（p4 直接使用 mouse，**1:1 跟随**，无 mix/sin 调制）
 *              - 主题感知：dark 模式紫黑底 + 薰衣草高光，light 模式暖白底 + 紫金高光
 *              - 主题切换时颜色通过 uThemeMix uniform 平滑 lerp（~320ms）
 *              - 胶片颗粒 + 暗角（vignette）后处理
 *              - prefers-reduced-motion: reduce 时慢速 0.1x 漂移
 *              - 单 draw call，pixelRatio 上限 2，全屏 OrthographicCamera + PlaneGeometry(2,2)
 *              - 光标 lerp 系数 0.18（更跟手）
 *
 *              零新增依赖：three@^0.169.0 已存在于 client/package.json。
 * @module renderer/components
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** 光标 lerp 平滑系数（移动时使用） */
const MOUSE_LERP_BASE = 0.22
/** 帧间 uTime 累加步长（秒/帧） */
const TIME_STEP = 0.016
/** prefers-reduced-motion 模式下的时间倍率（保持视觉漂移但更慢） */
const REDUCED_MOTION_FACTOR = 0.1
/** 主题切换颜色 lerp 速度（每帧向目标逼近的比例；~320ms 完成） */
const THEME_LERP = 0.12
/** 鼠标静止判定阈值（鼠标位置变化 < 此值视为静止） */
const MOUSE_STILL_THRESHOLD = 0.0008

const VERTEX_SHADER = /* glsl */ `
void main(){ gl_Position = vec4(position, 1.0); }
`

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2  uMouse;        // 归一化 0-1 鼠标位置（JS 端 lerp 后传入）
uniform vec2  uResolution;
uniform vec3  uColor1;        // 主题色 1（高光色，dark=lavender / light=indigo）
uniform vec3  uColor2;        // 主题色 2（画布色，dark=#1a1b2e / light=#faf8ff）
uniform vec3  uCursorColor;   // 鼠标高光色（dark=white / light=warm white）
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
  vec2 m  = uMouse;     // 直接用 lerp 后的鼠标位置，1:1 跟随
  float t = uTime * 0.3;

  // 3 个漂浮 metaball 环境光（缓慢漂移）
  vec2 p1 = vec2(0.30 + 0.18*sin(t*0.7),        0.35 + 0.15*cos(t*0.5));
  vec2 p2 = vec2(0.78 + 0.12*sin(t*0.4 + 1.7),  0.70 + 0.20*sin(t*0.6));
  vec2 p3 = vec2(0.55 + 0.22*cos(t*0.3 + 3.1),  0.20 + 0.12*sin(t*0.9));
  // p4 = 鼠标位置（直接 1:1，不 mix 不 sin 调制，保证光斑位置 = 真实鼠标位置）
  vec2 p4 = m;

  float d1 = length(uv - p1);
  float d2 = length(uv - p2);
  float d3 = length(uv - p3);
  float d4 = length(uv - p4);

  // smoothstep 范围 0.6（光斑影响范围更广，角落也能看到高光）
  // 鼠标高光：s4 主核（紧凑） + s4b 弱外晕（广覆盖）
  // s4 给视觉中心，s4b 给光晕范围
  float s4 = smoothstep(0.18, 0.0, d4);          // 紧凑核心 0.18 半径（贴合鼠标）
  float s4b = smoothstep(0.40, 0.0, d4);         // 外晕 0.40 半径（柔和扩散）

  vec3 col = uColor2;
  col = mix(col, uColor1, s1 * 0.85);
  col = mix(col, uColor1, s2 * 0.65);
  col = mix(col, mix(uColor1, uCursorColor, 0.5), s3 * 0.45);
  // 鼠标高光：强度从 0.12 提升到 0.40，更明显的"光跟随"反馈
  // 鼠标高光：s4 核心（强光） + s4b 外晕（柔光）— 视觉中心严格在鼠标位置
  col = mix(col, uCursorColor, s4b * 0.18);   // 外晕柔光
  col = mix(col, uCursorColor, s4 * 0.55);    // 核心强光（更亮，更贴近鼠标）

  // 胶片颗粒
  float g = noise(uv * uResolution.xy * 0.5 + t) * 0.025;
  col += g;

  // 暗角（vignette）— 浅色主题下降低强度（避免边缘过暗）
  float vig = 1.0 - smoothstep(0.4, 1.1, length(uv - 0.5));
  col *= mix(0.85, 1.0, vig);

  col = mix(uColor2 * 0.85, col, uIntensity);
  gl_FragColor = vec4(col, 1.0);
}
`

/** 主题调色板 — dark/light 两套 */
const PALETTE = {
  dark: {
    color1: new THREE.Color(0xa78bfa), // 薰衣草紫
    color2: new THREE.Color(0x1a1b2e), // 深紫黑
    cursor: new THREE.Color(0xffffff) // 纯白高光
  },
  light: {
    color1: new THREE.Color(0x8b5cf6), // 深紫（饱和度更高，浅背景上更显眼）
    color2: new THREE.Color(0xfaf8ff), // 暖白（带极弱紫调）
    cursor: new THREE.Color(0xfff7e6) // 暖白偏金（与暖白 canvas 区分）
  }
} as const

/**
 * ParticlegroundBg — 主题感知 光标跟随 网格渐变背景。
 *
 * Props:
 * - theme?: 'light' | 'dark' — 主题；默认 'dark'
 *
 * 主题切换时通过 uColor1 / uColor2 / uCursorColor 平滑 lerp（~320ms）。
 * 鼠标位置通过 uMouse 直接传入 shader（shader 内部不再做 mix 调制，1:1 跟随）。
 */
// eslint-disable-next-line react/prop-types
export const ParticlegroundBg: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme = 'dark' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  /** 用 ref 存 theme prop 避免 useEffect 依赖触发 reinit */
  const themeRef = useRef<'light' | 'dark'>(theme)

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // 初始化为目标主题的颜色
    const targetPalette = PALETTE[themeRef.current]

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight)
      },
      uColor1: { value: targetPalette.color1.clone() },
      uColor2: { value: targetPalette.color2.clone() },
      uCursorColor: { value: targetPalette.cursor.clone() },
      uIntensity: { value: 0.6 }
    }

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

    const mouseTarget = new THREE.Vector2(0.5, 0.5)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

    let rafId = 0
    const tick = (): void => {
      // 主题色平滑过渡：每帧向目标调色板 lerp THEME_LERP 比例
      const target = PALETTE[themeRef.current]
      uniforms.uColor1.value.lerp(target.color1, THEME_LERP)
      uniforms.uColor2.value.lerp(target.color2, THEME_LERP)
      uniforms.uCursorColor.value.lerp(target.cursor, THEME_LERP)

      // uTime 累加
      uniforms.uTime.value += reducedMotion ? TIME_STEP * REDUCED_MOTION_FACTOR : TIME_STEP

      // 鼠标 1:1 跟随（lerp 系数 0.18，更跟手但仍平滑）
      // uMouse 自适应 lerp：移动时用基础系数 0.22，静止时加速到 0.55
      // 确保光斑最终位置 = 真实鼠标位置（无残留偏移）
      const mouseDelta = Math.hypot(
        mouseTarget.x - uniforms.uMouse.value.x,
        mouseTarget.y - uniforms.uMouse.value.y
      )
      if (mouseDelta < MOUSE_STILL_THRESHOLD) {
        // 静止：直接 snap 到精确 target（消除 lerp 残留误差，保证 1:1）
        uniforms.uMouse.value.copy(mouseTarget)
      } else {
        // 移动中：基础 lerp 平滑过渡
        uniforms.uMouse.value.lerp(mouseTarget, MOUSE_LERP_BASE)
      }

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

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
      data-theme={theme}
    />
  )
}

export default ParticlegroundBg
