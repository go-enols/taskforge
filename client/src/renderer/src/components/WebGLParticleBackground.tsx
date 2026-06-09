/**
 * @file WebGLParticleBackground — 登录页 3D 云朵背景
 * @description 基于 Three.js 的全屏 WebGL 云朵背景：
 *              - 3 大片云团（每片 1500 个粒子）分布在 z=-400..-2000
 *              - 粒子使用大尺寸柔光精灵（白色软斑 + 蓝青光晕）
 *              - 缓慢向相机方向漂移（z 增加），营造云朵飘过的氛围
 *              - 鼠标移动驱动云团水平/垂直偏移
 *              - 蓝色径向渐变背景（CSS）作为底色
 *              - 自定义 ShaderMaterial：纹理采样 + 深度衰减 + 雾色混合
 * @module renderer/components
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** 单片云团粒子数 */
const CLOUD_PARTICLES = 1500
/** 云团起始 z 距离（最远） */
const CLOUD_FAR_Z = -2000
/** 云团终止 z 距离（最近，超出此距离会被重置回最远） */
const CLOUD_NEAR_Z = -400
/** 相机 z 位置（云团在前方） */
const CAMERA_Z = 0
/** 鼠标 X 灵敏度（影响云团水平偏移） */
const MOUSE_SENSITIVITY_X = 0.4
/** 鼠标 Y 灵敏度（影响云团垂直偏移） */
const MOUSE_SENSITIVITY_Y = 0.3
/** 相机/云团跟随平滑系数（lerp 步长） */
const CLOUD_LERP = 0.015
/** 云团漂移速度（每帧 z 增加量） */
const CLOUD_DRIFT_SPEED = 0.4

/**
 * 在内存中生成一张 64x64 的柔光云朵精灵。
 * 中心几乎透明白，向外渐变到冷青蓝光晕，完全无硬边 — 看起来像云。
 */
const makeCloudTexture = (): THREE.CanvasTexture => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return new THREE.CanvasTexture(new Image(1, 1))
  }
  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  // 中心略微亮白，向外过渡到淡青蓝，最外层完全透明
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.2, 'rgba(220,235,250,0.7)')
  gradient.addColorStop(0.5, 'rgba(160,200,230,0.35)')
  gradient.addColorStop(0.85, 'rgba(120,170,210,0.1)')
  gradient.addColorStop(1, 'rgba(100,150,200,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

/**
 * 为单片云团生成一组粒子位置 — 聚集成云团形态
 * 云团中心在 (cx, cy)，使用高斯分布让粒子聚集，向外渐稀
 */
const generateCloudParticles = (
  cx: number,
  cy: number,
  count: number
): Array<{ x: number; y: number; scale: number; rotation: number; alpha: number }> => {
  const particles: Array<{ x: number; y: number; scale: number; rotation: number; alpha: number }> = []
  for (let i = 0; i < count; i++) {
    // Box-Muller 变换：高斯分布采样
    const u1 = Math.random()
    const u2 = Math.random()
    const gaussian = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2)
    const gaussian2 = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.sin(2 * Math.PI * u2)
    // 水平方向比垂直方向更宽（云朵横展）
    const x = cx + gaussian * 320
    const y = cy + gaussian2 * 180
    // 粒子大小随机（小粒子多、大粒子少）
    const sizeRand = Math.random()
    const scale = 0.6 + sizeRand * sizeRand * 1.8 // 0.6 - 2.4
    const rotation = Math.random() * Math.PI * 2
    // 边缘粒子透明度更低
    const distFromCenter = Math.sqrt(
      Math.pow((x - cx) / 320, 2) + Math.pow((y - cy) / 180, 2)
    )
    const alpha = Math.max(0.2, 1 - distFromCenter * 0.6)
    particles.push({ x, y, scale, rotation, alpha })
  }
  return particles
}

/**
 * WebGLParticleBackground — 全屏 Three.js 云朵背景
 *
 * 渲染 3 大片云团缓慢向相机漂移，鼠标移动驱动云团水平/垂直偏移。
 * 整体配色与登录页蓝色径向渐变背景融合（#1e4877 → #4584b4）。
 */
export const WebGLParticleBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Scene 初始化 ──────────────────────────────────────
    const scene = new THREE.Scene()
    const fog = new THREE.Fog(0x1e4877, 100, 2500)
    scene.fog = fog

    // ── Camera ────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      3000
    )
    camera.position.z = CAMERA_Z

    // ── 共享几何 + 精灵材质 ──────────────────────────────
    const texture = makeCloudTexture()
    const planeGeometry = new THREE.PlaneGeometry(48, 48)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        fogColor: { value: fog.color },
        fogNear: { value: fog.near },
        fogFar: { value: fog.far }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        varying vec2 vUv;
        void main() {
          float depth = gl_FragCoord.z / gl_FragCoord.w;
          float fogFactor = smoothstep(fogNear, fogFar, depth);
          gl_FragColor = texture2D(map, vUv);
          gl_FragColor.w *= pow(gl_FragCoord.z, 20.0);
          gl_FragColor = mix(gl_FragColor, vec4(fogColor, gl_FragColor.w), fogFactor);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })

    // ── 3 大片云团（每片用 InstancedMesh 渲染 1500 个粒子） ──
    // 云团中心在屏幕坐标（X: -200..+200, Y: -100..+100），深度递增
    const cloudCenters = [
      { x: -600, y: 200, baseZ: -600 },
      { x: 300, y: -100, baseZ: -1200 },
      { x: -100, y: 300, baseZ: -1700 }
    ]

    interface CloudState {
      mesh: THREE.InstancedMesh
      z: number
      driftX: number
      driftY: number
      baseX: number
      baseY: number
      baseZ: number
    }
    const clouds: CloudState[] = []
    const dummy = new THREE.Object3D()

    for (const center of cloudCenters) {
      const positions = generateCloudParticles(center.x, center.y, CLOUD_PARTICLES)

      // 复用平面几何作为实例模板
      const cloudGeometry = new THREE.InstancedBufferGeometry()
      cloudGeometry.setAttribute('position', planeGeometry.getAttribute('position'))
      cloudGeometry.setAttribute('uv', planeGeometry.getAttribute('uv'))
      cloudGeometry.setIndex(planeGeometry.getIndex())
      cloudGeometry.instanceCount = CLOUD_PARTICLES

      const mesh = new THREE.InstancedMesh(cloudGeometry, material, CLOUD_PARTICLES)

      for (let i = 0; i < CLOUD_PARTICLES; i++) {
        const p = positions[i]
        dummy.position.set(p.x, p.y, center.baseZ)
        dummy.rotation.z = p.rotation
        dummy.scale.set(p.scale, p.scale, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false // 避免实例被视锥剔除

      scene.add(mesh)
      clouds.push({
        mesh,
        z: center.baseZ,
        driftX: (Math.random() - 0.5) * 0.2,
        driftY: (Math.random() - 0.5) * 0.1,
        baseX: center.x,
        baseY: center.y,
        baseZ: center.baseZ
      })
    }

    // ── Renderer ──────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // ── 鼠标状态 ──────────────────────────────────────────
    let mouseX = 0
    let mouseY = 0
    const halfX = window.innerWidth / 2
    const halfY = window.innerHeight / 2

    const onMouseMove = (e: MouseEvent): void => {
      mouseX = (e.clientX - halfX) * MOUSE_SENSITIVITY_X
      mouseY = (e.clientY - halfY) * MOUSE_SENSITIVITY_Y
    }
    const onResize = (): void => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)

    // ── 动画循环 ──────────────────────────────────────────
    let raf = 0
    const animate = (): void => {
      raf = requestAnimationFrame(animate)

      // 相机平滑跟随鼠标
      camera.position.x += (mouseX - camera.position.x) * CLOUD_LERP
      camera.position.y += (-mouseY - camera.position.y) * CLOUD_LERP

      // 每片云团向相机漂移，越过近端后回到最远
      for (const cloud of clouds) {
        cloud.z += CLOUD_DRIFT_SPEED
        if (cloud.z > CLOUD_NEAR_Z) {
          // 重置到最远
          cloud.z = CLOUD_FAR_Z
          cloud.driftX = (Math.random() - 0.5) * 0.2
          cloud.driftY = (Math.random() - 0.5) * 0.1
          cloud.baseX = (Math.random() - 0.5) * 800
          cloud.baseY = (Math.random() - 0.5) * 400
        }
        // 重新放置该云团所有粒子（Z 位置 = 当前 z，XY = base + 漂移）
        const positions = generateCloudParticles(cloud.baseX, cloud.baseY, CLOUD_PARTICLES)
        for (let i = 0; i < CLOUD_PARTICLES; i++) {
          const p = positions[i]
          dummy.position.set(p.x, p.y, cloud.z)
          dummy.rotation.z = p.rotation
          dummy.scale.set(p.scale, p.scale, 1)
          dummy.updateMatrix()
          cloud.mesh.setMatrixAt(i, dummy.matrix)
        }
        cloud.mesh.instanceMatrix.needsUpdate = true
      }

      camera.lookAt(camera.position.x, camera.position.y, -1000)
      renderer.render(scene, camera)
    }
    animate()

    // ── 清理 ──────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      for (const cloud of clouds) {
        cloud.mesh.geometry.dispose()
      }
      planeGeometry.dispose()
      material.dispose()
      texture.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} className="fixed inset-0 pointer-events-none" aria-hidden />
}
