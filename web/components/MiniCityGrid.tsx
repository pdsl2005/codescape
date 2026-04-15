"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { Mesh } from "three";

type MiniCityGridProps = {
  className?: string;
};

type Building = {
  id: string;
  x: number;
  z: number;
  height: number;
  color: string;
};

function CityBuilding({ building }: { building: Building }) {
  return (
    <mesh position={[building.x, building.height / 2, building.z]}>
      <boxGeometry args={[0.7, building.height, 0.7]} />
      <meshStandardMaterial color={building.color} metalness={0.3} roughness={0.35} />
    </mesh>
  );
}

export default function MiniCityGrid({ className = "" }: MiniCityGridProps) {
  const buildings = useMemo<Building[]>(() => {
    const colors = ["#3B82F6", "#10B981", "#818CF8"];
    return Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const height = 0.3 + Math.random() * 0.5;
      return {
        id: `mini-building-${index}`,
        x: (col - 1) * 0.9,
        z: (row - 1) * 0.9,
        height,
        color: colors[index % colors.length],
      };
    });
  }, []);

  return (
    <div className={`h-full w-full ${className}`}>
      <Canvas orthographic camera={{ position: [3.5, 3.5, 3.5], zoom: 55, near: 0.1, far: 100 }} className="h-full w-full">
        <color attach="background" args={["transparent"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 5, 2]} intensity={0.85} />
        {buildings.map((building) => (
          <CityBuilding key={building.id} building={building} />
        ))}
      </Canvas>
    </div>
  );
}
