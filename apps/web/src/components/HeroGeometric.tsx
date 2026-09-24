import { useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Shader background from @componentry/hero-geometric (Simplex noise + Bayer dither).
// Changes vs. upstream: the bottom-left corner fades to uFade instead of hardcoded
// white (so dark mode doesn't get a white corner), and output goes through
// colorspace_fragment so the hex colors render as given instead of darkened.
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uFade;
varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float bayerDither4x4(vec2 uv) {
  int x = int(mod(uv.x, 4.0));
  int y = int(mod(uv.y, 4.0));
  int matrix[16];
  matrix[0] = 0; matrix[1] = 8; matrix[2] = 2; matrix[3] = 10;
  matrix[4] = 12; matrix[5] = 4; matrix[6] = 14; matrix[7] = 6;
  matrix[8] = 3; matrix[9] = 11; matrix[10] = 1; matrix[11] = 9;
  matrix[12] = 15; matrix[13] = 7; matrix[14] = 13; matrix[15] = 5;
  return float(matrix[y * 4 + x]) / 16.0;
}

void main() {
  vec2 uv = vUv;
  float noise = snoise(uv * 1.5 + vec2(uTime * 0.05, uTime * 0.03)) * 0.25;
  float gradient = (uv.x + uv.y) * 0.5 * 1.2 + noise;

  vec3 deep = uColor1;
  vec3 pale = uColor2;
  vec3 soft = mix(deep, pale, 0.33);
  vec3 light = mix(deep, pale, 0.66);

  vec3 color;
  if (gradient < 0.3) color = deep;
  else if (gradient < 0.55) color = soft;
  else if (gradient < 0.8) color = light;
  else color = pale;

  float dither = bayerDither4x4(gl_FragCoord.xy);
  float threshold = fract(gradient * 4.0);
  if (gradient < 0.3 && threshold > dither * 0.5) color = soft;
  else if (gradient >= 0.3 && gradient < 0.55 && threshold > dither * 0.5) color = light;
  else if (gradient >= 0.55 && gradient < 0.8 && threshold > dither * 0.5) color = pale;

  color = mix(uFade, color, smoothstep(0.0, 0.25, length(uv)));

  float vignette = smoothstep(1.2, 0.3, length(uv - 0.5));
  color = mix(color, color * 0.95, (1.0 - vignette) * 0.3);

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`

interface GradientProps {
  color1: string
  color2: string
  fade: string
  speed: number
}

function GradientPlane({ color1, color2, fade, speed }: GradientProps) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color() },
      uColor2: { value: new THREE.Color() },
      uFade: { value: new THREE.Color() },
    }),
    [],
  )

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime() * speed
    uniforms.uColor1.value.set(color1)
    uniforms.uColor2.value.set(color2)
    uniforms.uFade.value.set(fade)
  })

  return (
    <mesh scale={[2, 2, 1]}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

interface HeroGeometricProps {
  color1: string
  color2: string
  fade?: string
  speed?: number
  className?: string
}

// Full-bleed animated background; parent must be positioned.
export default function HeroGeometric({ color1, color2, fade = color2, speed = 1, className = '' }: HeroGeometricProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <Canvas camera={{ position: [0, 0, 1] }} dpr={[1, 1]} gl={{ antialias: false, alpha: true }}>
        <GradientPlane color1={color1} color2={color2} fade={fade} speed={speed} />
      </Canvas>
    </div>
  )
}
