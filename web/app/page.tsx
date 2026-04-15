import HeroCity from "../components/HeroCity";
import FeatureIcon from "../components/FeatureIcon";

const features = [
  {
    key: "classes",
    label: "Classes become buildings",
    title: "Building height maps to method and field count.",
    desc: "Taller buildings mean more complex classes — spot complexity at a glance.",
    type: "classes",
    moduleLabel: "MODULE_01",
  },
  {
    key: "dependencies",
    label: "Live dependency graph",
    title: "Extends, implements, and field relationships render as roads.",
    desc: "Updates instantly on every file save so you can feel the structure of your code while you build.",
    type: "dependencies",
    moduleLabel: "LIVE_SYNC",
  },
  {
    key: "share",
    label: "Share your city",
    title: "Add friends and browse their codebases.",
    desc: "Set each project public, friends-only, or private. Explore how others structure their code.",
    type: "share",
    moduleLabel: "SHARE_01",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#F0F7FF] px-6 py-16 text-[var(--foreground)] sm:px-8 lg:px-10">
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-10 text-center">
        <div className="inline-flex items-center rounded-full bg-[#F3F4F6] px-4 py-2 text-sm font-semibold text-[#374151]">
          Open source · VS Code extension
        </div>

        <div className="space-y-6">
          <h1 className="mx-auto max-w-[800px] text-5xl font-bold leading-tight tracking-tight text-[#111827] sm:text-6xl">
            Your codebase, as a living city.
          </h1>
          <p className="mx-auto max-w-[600px] text-base leading-8 text-[#4B5563]">
            Codescape renders your Java project as an isometric city. Every class becomes a building and every dependency becomes a road.
            Watch it update as you code.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <a
            href="#"
            className="inline-flex justify-center rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)] transition hover:bg-[#2563EB]"
          >
            Get started free
          </a>
          <a
            href="/dashboard"
            className="inline-flex justify-center rounded-full border border-[var(--accent)] bg-white px-8 py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#EFF6FF]"
          >
            See dashboard
          </a>
        </div>

        <div className="w-full max-w-5xl max-h-[500px] mt-25">
          <HeroCity />
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.key}
              className="rounded-2xl border border-white/50 bg-white/40 p-8 backdrop-blur-xl"
            >
              <div className="mb-6 flex justify-center">
                <FeatureIcon type={feature.type as "classes" | "dependencies" | "share"} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6B7280]">{feature.label}</p>
              <h3 className="mt-4 text-xl font-semibold text-[#111827]">{feature.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[#6B7280]">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
