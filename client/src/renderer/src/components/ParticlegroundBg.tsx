/**
 * @file ParticlegroundBg — 登录页 3D 粒子背景
 * @description 严格复刻 reference HTML（Kylin奇霖 粒子登录模板）的视觉与算法：
 *              - 8K 粒子（每片 4K 粒子 × 2 mesh，z=0 / z=-8000 镜像拼接）
 *              - 蓝色径向渐变背景（CSS）作为底色，雾色 #4584b4
 *              - 粒子用柔光圆斑 sprite（运行时 canvas 生成，零依赖）
 *              - 相机沿 z 轴匀速向前漂移，溢出后回到 z=0，无限循环
 *              - 鼠标移动驱动相机水平/垂直偏移（lerp 平滑插值）
 *              - 自定义 ShaderMaterial：纹理采样 + 深度衰减 + 雾色混合
 *              - 100% 视觉对齐 HTML：相机 z 公式、粒子坐标分布、雾色、混合方式
 *
 *              ⚠️ 关键修复：粒子位置在 init 时**一次性**生成并存入 state，
 *              每帧只更新整个 InstancedMesh 的 z 位置（不是逐粒子重算），
 *              避免"每帧重生 4K 随机位置"导致的视觉抖动 / 静止。
 * @module renderer/components
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** 单个 mesh 粒子数（HTML 原版每片 4K，共 2 mesh 拼成 8K） */
const PARTICLES_PER_MESH = 4000
/** 两个 mesh 拼成 8K 粒子的总深度 */
const TOTAL_DEPTH = 8000
/** 相机 z 漂移速度（HTML 原版：`(time * 0.03) % 8000` 决定相机 z）*/
const CAMERA_Z_SPEED = 0.03
/** 鼠标 X 灵敏度（影响相机水平偏移） */
const MOUSE_SENSITIVITY_X = 0.25
/** 鼠标 Y 灵敏度（影响相机垂直偏移） */
const MOUSE_SENSITIVITY_Y = 0.15
/** 相机跟随鼠标的平滑系数（lerp 步长） */
const CAMERA_LERP = 0.01
/** 相机起点 z（与 HTML 一致：camera.position.z = 6000） */
const CAMERA_START_Z = 6000
/** 远裁剪面（HTML：camera.far = 3000）*/
const CAMERA_FAR = 3000
/** 视野角度（HTML：fov = 30）*/
const CAMERA_FOV = 30

/**
 * 在内存中生成一张 64×64 的柔光蓝白圆斑 sprite。
 * 模拟 HTML 原版 base64 PNG：中心亮白，向外渐变到淡蓝白，再到完全透明。
 * 使用 radial gradient，alpha 通道决定软边。
 */
const makeParticleTexture = (): THREE.CanvasTexture => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // 软光径向渐变：白心 → 蓝白晕 → 透明
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
  gradient.addColorStop(0.3, 'rgba(220, 235, 255, 0.7)')
  gradient.addColorStop(0.7, 'rgba(150, 200, 240, 0.2)')
  gradient.addColorStop(1, 'rgba(80, 150, 220, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipMapLinearFilter
  return texture
}

/** 单粒子的初始参数（一次性生成，存进 instance 矩阵，运行时不再改变）*/
interface ParticleParams {
  x: number
  y: number
  rotation: number
  scale: number
}

/**
 * 在 init 时一次性生成 4K 粒子的初始位置（与 HTML 一致）。
 * 严格按 HTML 算法：
 *   plane.position.x = Math.random() * 1000 - 500      // [-500, 500]
 *   plane.position.y = -Math.random() * random * 200 - 15  // [-15, -215]（向下偏）
 *   plane.position.z = i                                // [0, 4000)
 *   plane.rotation.z = random * PI                      // [0, 2π]
 *   scale = random² * 1.5 + 0.5                         // [0.5, 2.0]
 *
 * 返回扁平数组，用时直接填入 InstancedMesh。
 */
const generateParticles = (): ParticleParams[] => {
  const particles: ParticleParams[] = []
  for (let i = 0; i < PARTICLES_PER_MESH; i++) {
    const x = Math.random() * 1000 - 500
    const y = -Math.random() * Math.random() * 200 - 15
    const rotation = Math.random() * Math.PI
    const r = Math.random()
    const scale = r * r * 1.5 + 0.5
    particles.push({ x, y, rotation, scale })
  }
  return particles
}

/**
 * ParticlegroundBg — 全屏 Three.js 粒子背景
 *
 * 与 HTML 模板 1:1 对应：
 * - 2 个 InstancedMesh（z=0 和 z=-8000）拼成 8K 粒子隧道
 * - 相机 z 匀速漂移并循环（`position = (time * 0.03) % 8000` → `camera.position.z = -position + 8000`）
 * - 鼠标驱动相机 xy
 * - ShaderMaterial 用 HTML 的 vs/fs，雾色 #4584b4
 */
export const ParticlegroundBg: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ---------- Scene ----------
    const scene = new THREE.Scene()
    // HTML: `var fog = new THREE.Fog(0x4584b4, -100, 3000)`
    const fog = new THREE.Fog(0x4584b4, -100, 3000)
    scene.fog = fog

    // ---------- Camera ----------
    // HTML: `new THREE.Camera(30, w/h, 1, 3000)` — PerspectiveCamera
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      1,
      CAMERA_FAR
    )
    camera.position.z = CAMERA_START_Z

    // ---------- Texture & Material ----------
    const texture = makeParticleTexture()
    const planeGeometry = new THREE.PlaneGeometry(64, 64)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        fogColor: { value: fog.color },
        fogNear: { value: fog.near },
        fogFar: { value: fog.far }
      },
      // HTML 的 vertex shader（逐字复制）
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      // HTML 的 fragment shader（逐字复制）
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        varying vec2 vUv;
        void main() {
          float depth = gl_FragCoord.z / gl_FragCoord.w;
          float fogFactor = smoothstep( fogNear, fogFar, depth );
          gl_FragColor = texture2D( map, vUv );
          gl_FragColor.w *= pow( gl_FragCoord.z, 20.0 );
          gl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );
        }
      `,
      depthTest: false
    })

    // ---------- InstancedMesh × 2 ----------
    // 一次性生成 4K 粒子参数（每个 mesh 一份，z 偏移不同）
    const meshConfigs = [
      { z: 0, particles: generateParticles() },
      { z: -TOTAL_DEPTH, particles: generateParticles() }
    ]

    const meshes: THREE.InstancedMesh[] = []
    for (const cfg of meshConfigs) {
      const inst = new THREE.InstancedMesh(planeGeometry, material, PARTICLES_PER_MESH)
      const dummy = new THREE.Object3D()
      for (let i = 0; i < PARTICLES_PER_MESH; i++) {
        const p = cfg.particles[i]
        // ⚠️ 关键：粒子自身 z 是 i（0..4000），整片 mesh 再额外偏移 cfg.z
        // 这样两个 mesh 在 z=0..-8000 范围均匀分布粒子
        dummy.position.set(p.x, p.y, i + cfg.z)
        dummy.rotation.z = p.rotation
        dummy.scale.set(p.scale, p.scale, 1)
        dummy.updateMatrix()
        inst.setMatrixAt(i, dummy.matrix)
      }
      inst.instanceMatrix.needsUpdate = true
      inst.frustumCulled = false
      scene.add(inst)
      meshes.push(inst)
    }

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // ---------- Mouse ----------
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

    // ---------- Animate ----------
    // HTML 公式：`position = (time * 0.03) % 8000; camera.position.z = -position + 8000;`
    const startTime = Date.now()
    let raf = 0
    const animate = (): void => {
      raf = requestAnimationFrame(animate)

      // 相机 z 匀速漂移 + 循环（HTML 原版公式）
      const position = ((Date.now() - startTime) * CAMERA_Z_SPEED) % TOTAL_DEPTH
      camera.position.z = -position + CAMERA_START_Z

      // 鼠标驱动相机 xy（HTML 原版公式）
      camera.position.x += (mouseX - camera.position.x) * CAMERA_LERP
      camera.position.y += (-mouseY - camera.position.y) * CAMERA_LERP
      camera.lookAt(camera.position.x, camera.position.y, camera.position.z - 1000)

      renderer.render(scene, camera)
    }
    animate()

    // ---------- Cleanup ----------
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      planeGeometry.dispose()
      material.dispose()
      texture.dispose()
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
