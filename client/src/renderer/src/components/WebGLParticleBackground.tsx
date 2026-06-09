/**
 * @file WebGLParticleBackground — 登录页 3D 粒子背景
 * @description 基于 Three.js 的全屏 WebGL 粒子隧道背景：
 *              - 8000 个粒子分布在长隧道中（z: 0..8000）
 *              - 粒子由相机前方向后流动，营造穿过星空的视觉效果
 *              - 相机位置根据鼠标移动平滑插值跟随
 *              - 雾色与登录页蓝色渐变背景一致（#4584b4）
 *              - 使用 InstancedMesh 渲染（高效，复用一个 PlaneGeometry）
 *              - 自定义 ShaderMaterial：纹理采样 + 深度衰减 + 雾色混合
 * @module renderer/components
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** 粒子总数 — 决定星空密度 */
const PARTICLE_COUNT = 8000
/** 隧道在 z 轴上的总长度 */
const TUNNEL_LENGTH = 8000
/** 相机初始 z 位置（隧道起点之外） */
const CAMERA_Z = 6000
/** 相机水平方向鼠标灵敏度（参考值 0.25） */
const MOUSE_SENSITIVITY_X = 0.25
/** 相机垂直方向鼠标灵敏度（参考值 0.15） */
const MOUSE_SENSITIVITY_Y = 0.15
/** 相机跟随的平滑系数（lerp 步长） */
const CAMERA_LERP = 0.01
/** 隧道流动速度（每毫秒移动的 z 单位数） */
const TUNNEL_SPEED = 0.03

/**
 * 在内存中生成一张 16x16 的径向渐变圆点贴图，作为粒子精灵。
 * 中心白色，向外过渡到冷蓝色再到完全透明，模拟星点辉光。
 */
const makeParticleTexture = (): THREE.CanvasTexture => {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    // jsdom / SSR 等环境没有 2D context 时返回 1x1 白贴图作为兜底
    return new THREE.CanvasTexture(new Image(1, 1))
  }
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(220,240,255,0.8)')
  gradient.addColorStop(1, 'rgba(100,150,200,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

/**
 * WebGLParticleBackground — 全屏 Three.js 粒子隧道背景
 *
 * 渲染一个挂载到屏幕固定区域的 canvas，画质优先级：
 * 1. 深度衰减（`pow(gl_FragCoord.z, 20.0)`）让远处粒子变暗、变透明；
 * 2. 雾色混合让远处粒子过渡到背景蓝；
 * 3. 鼠标移动通过 lerp 平滑驱动相机。
 */
export const WebGLParticleBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // —— Scene / Fog ——
    const scene = new THREE.Scene()
    // 雾色与 CSS 渐变下端（#4584b4）保持一致，远处粒子自然融入背景
    const fog = new THREE.Fog(0x4584b4, -100, 3000)
    scene.fog = fog

    // —— Camera ——
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      1,
      3000
    )
    camera.position.z = CAMERA_Z

    // —— Texture & Material ——
    const texture = makeParticleTexture()
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
          // 深度衰减：远处粒子 alpha 指数级减小，模拟透视消失
          gl_FragColor.w *= pow(gl_FragCoord.z, 20.0);
          gl_FragColor = mix(gl_FragColor, vec4(fogColor, gl_FragColor.w), fogFactor);
        }
      `,
      transparent: true,
      depthTest: false
    })

    // —— InstancedMesh（主隧道）——
    const planeGeometry = new THREE.PlaneGeometry(64, 64)
    const instancedMesh = new THREE.InstancedMesh(planeGeometry, material, PARTICLE_COUNT)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      dummy.position.x = Math.random() * 1000 - 500
      // 粒子分布在 -15 到 -215 之间，形成有地平线感的下倾斜层
      dummy.position.y = -Math.random() * Math.random() * 200 - 15
      dummy.position.z = i
      dummy.rotation.z = Math.random() * Math.PI
      const scale = Math.random() * Math.random() * 1.5 + 0.5
      dummy.scale.set(scale, scale, 1)
      dummy.updateMatrix()
      instancedMesh.setMatrixAt(i, dummy.matrix)
    }
    instancedMesh.instanceMatrix.needsUpdate = true
    scene.add(instancedMesh)

    // —— InstancedMesh（镜像隧道，z 为负，循环时穿过相机）——
    const mirrorMesh = new THREE.InstancedMesh(planeGeometry, material, PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      dummy.position.x = Math.random() * 1000 - 500
      dummy.position.y = -Math.random() * Math.random() * 200 - 15
      dummy.position.z = -i
      dummy.rotation.z = Math.random() * Math.PI
      const scale = Math.random() * Math.random() * 1.5 + 0.5
      dummy.scale.set(scale, scale, 1)
      dummy.updateMatrix()
      mirrorMesh.setMatrixAt(i, dummy.matrix)
    }
    mirrorMesh.instanceMatrix.needsUpdate = true
    scene.add(mirrorMesh)

    // —— Renderer ——
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // —— Mouse / Resize Handlers ——
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

    // —— Animation Loop ——
    const startTime = Date.now()
    let raf = 0
    const animate = (): void => {
      raf = requestAnimationFrame(animate)
      // 隧道沿 z 轴向相机方向流动，每 8000 单位循环
      const position = ((Date.now() - startTime) * TUNNEL_SPEED) % TUNNEL_LENGTH
      // 鼠标 lerp：相机平滑跟随
      camera.position.x += (mouseX - camera.position.x) * CAMERA_LERP
      camera.position.y += (-mouseY - camera.position.y) * CAMERA_LERP
      camera.position.z = -position + CAMERA_Z
      // 看向隧道深处（z 减小方向）
      camera.lookAt(camera.position.x, camera.position.y, camera.position.z - 1000)
      renderer.render(scene, camera)
    }
    animate()

    // —— Cleanup ——
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      instancedMesh.dispose()
      mirrorMesh.dispose()
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

export default WebGLParticleBackground
