"use client";

import { Building2, Network, Users } from "lucide-react";

type FeatureIconProps = {
  type: "classes" | "dependencies" | "share";
};

export default function FeatureIcon({ type }: FeatureIconProps) {
  switch (type) {
    case "classes":
      return <Building2 size={48} className="text-[#3B82F6]" />;
    case "dependencies":
      return <Network size={48} className="text-[#3B82F6]" />;
    case "share":
      return <Users size={48} className="text-[#3B82F6]" />;
  }
}
