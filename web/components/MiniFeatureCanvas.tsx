"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { Group, Mesh } from "three";

type MiniFeatureCanvasProps = {
  type: "classes" | "dependencies" | "share";
};

function ClassesScene() {
  const group = useRef<Group>(null!);
  const box1 = useRef<Mesh>(null!);
  const box2 = useRef<Mesh>(null!);
  const box3 = useRef<Mesh>(null!);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.getElapsedTime() * 0.2;
    const time = clock.getElapsedTime();
    if (box1.current) box1.current.position.y = 0.8 + Math.sin(time * 2) * 0.1;
    if (box2.current) box2.current.position.y = 0.45 + Math.sin(time * 2 + 1) * 0.1;
    if (box3.current) box3.current.position.y = 0.3 + Math.sin(time * 2 + 2) * 0.1;
  });

  return (
    <group ref={group}>
      <mesh ref={box1} position={[0, 0.8, 0]}>
        <boxGeometry args={[1.2, 1.6, 1.2]} />
        <meshStandardMaterial color="#3B82F6" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh ref={box2} position={[-1.4, 0.45, -0.2]}>
        <boxGeometry args={[0.8, 0.9, 0.8]} />
        <meshStandardMaterial color="#A78BFA" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh ref={box3} position={[1.3, 0.3, 0.4]}>
        <boxGeometry args={[0.6, 0.7, 0.6]} />
        <meshStandardMaterial color="#10B981" metalness={0.2} roughness={0.3} />
      </mesh>
    </group>
  );
}

function DependenciesScene() {
  const group = useRef<Group>(null!);
  const road1 = useRef<Mesh>(null!);
  const road2 = useRef<Mesh>(null!);
  const building1 = useRef<Mesh>(null!);
  const building2 = useRef<Mesh>(null!);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.getElapsedTime() * 0.25;
    const time = clock.getElapsedTime();
    if (road1.current) road1.current.position.y = 0.01 + Math.sin(time * 2) * 0.02;
    if (road2.current) road2.current.position.y = 0.01 + Math.sin(time * 2 + 1) * 0.02;
    if (building1.current) building1.current.position.y = 0.05 + Math.sin(time * 2 + 2) * 0.05;
    if (building2.current) building2.current.position.y = 0.05 + Math.sin(time * 2 + 3) * 0.05;
  });

  return (
    <group ref={group}>
      <mesh ref={road1} position={[-0.8, 0.01, 0]}>
        <boxGeometry args={[0.3, 0.02, 2.6]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.1} roughness={0.9} />
      </mesh>
      <mesh ref={road2} position={[0.8, 0.01, -0.4]}>
        <boxGeometry args={[0.3, 0.02, 2.2]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.1} roughness={0.9} />
      </mesh>
      <mesh ref={building1} position={[0, 0.05, 0]}> 
        <boxGeometry args={[0.16, 0.18, 0.16]} />
        <meshStandardMaterial color="#3B82F6" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh ref={building2} position={[0.6, 0.05, -0.6]}> 
        <boxGeometry args={[0.14, 0.16, 0.14]} />
        <meshStandardMaterial color="#10B981" metalness={0.2} roughness={0.3} />
      </mesh>
    </group>
  );
}

function ShareScene() {
  const group = useRef<Group>(null!);
  const building1 = useRef<Mesh>(null!);
  const building2 = useRef<Mesh>(null!);
  const building3 = useRef<Mesh>(null!);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.getElapsedTime() * 0.2;
    const time = clock.getElapsedTime();
    if (building1.current) building1.current.position.y = 0.45 + Math.sin(time * 2) * 0.08;
    if (building2.current) building2.current.position.y = 0.3 + Math.sin(time * 2 + 1) * 0.08;
    if (building3.current) building3.current.position.y = 0.25 + Math.sin(time * 2 + 2) * 0.08;
  });

  return (
    <group ref={group}>
      <mesh ref={building1} position={[-0.65, 0.45, -0.3]}>
        <boxGeometry args={[0.4, 0.8, 0.4]} />
        <meshStandardMaterial color="#3B82F6" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh ref={building2} position={[0.65, 0.3, 0.2]}>
        <boxGeometry args={[0.35, 0.55, 0.35]} />
        <meshStandardMaterial color="#A78BFA" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh ref={building3} position={[0, 0.25, 0.7]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshStandardMaterial color="#10B981" metalness={0.2} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Scene({ type }: MiniFeatureCanvasProps) {
  const content = useMemo(() => {
    if (type === "classes") return <ClassesScene />;
    if (type === "dependencies") return <DependenciesScene />;
    return <ShareScene />;
  }, [type]);

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 7, 5]} intensity={0.8} />
      {content}
    </>
  );
}

export default function MiniFeatureCanvas({ type }: MiniFeatureCanvasProps) {
  return (
    <div className="h-40 w-full rounded-[1.5rem] bg-transparent">
      <Canvas camera={{ position: [3.5, 2.5, 3.5], fov: 35 }} className="h-full w-full">
        <color attach="background" args={["transparent"]} />
        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
        <Scene type={type} />
      </Canvas>
    </div>
  );
}
