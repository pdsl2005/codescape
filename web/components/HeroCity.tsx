"use client";

import { Canvas } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useMemo } from "react";
import { Mesh } from "three";

type BuildingType = "Class" | "Interface" | "Utility";

type Building = {
  id: string;
  x: number;
  z: number;
  height: number;
  type: BuildingType;
  color: string;
};

function CityBuilding({ building }: { building: Building }) {
  return (
    <mesh position={[building.x, building.height / 2, building.z]}>
      <boxGeometry args={[0.8, building.height, 0.8]} />
      <meshPhysicalMaterial
        color={building.color}
        clearcoat={0.8}
        clearcoatRoughness={0.2}
        metalness={0.3}
        roughness={0.4}
        ior={1.5}
      />
    </mesh>
  );
}

export default function HeroCity() {
  const generateCityGrid = () => {
    const buildings: Building[] = [];
    const colors = ["#3B82F6", "#10B981", "#818CF8"];

    for (let i = 0; i < 100; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const heightValue = Math.random() * 80 + 20; // 20px to 100px equivalent
      buildings.push({
        id: `building-${i}`,
        x: (i % 10) * 1.0 - 4.5,
        z: Math.floor(i / 10) * 1.0 - 4.5,
        height: heightValue / 20,
        type: "Class",
        color,
      });
    }

    return buildings;
  };

  const cityBuildings = useMemo(() => generateCityGrid(), []);

  const cityContent = useMemo(
    () => cityBuildings.map((building) => <CityBuilding key={building.id} building={building} />),
    [cityBuildings]
  );

  return (
    <Canvas className="h-full w-full">
      <color attach="background" args={["#F0F7FF"]} />
      {/* Orthographic camera at 45-degree isometric angle */}
      <OrthographicCamera 
        makeDefault 
        position={[7, 8, 7]} 
        zoom={50} 
        near={-100} 
        far={100}
        up={[0, 1, 0]}
      />
      
      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.6} />
      
      {/* Top-side directional light for shadow effect */}
      <directionalLight position={[3, 8, 2]} intensity={0.9} castShadow />
      
      {/* Large semi-transparent white circular pedestal */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8.5, 64]} />
        <meshStandardMaterial
          color="#FFFFFF"
          emissive="#FFFFFF"
          emissiveIntensity={0.05}
          transparent
          opacity={0.1}
        />
      </mesh>

      {cityContent}
    </Canvas>
  );
}
