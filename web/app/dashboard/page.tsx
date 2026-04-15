import MiniCityGrid from "../../components/MiniCityGrid";

const cities = [
    { name: "spring-api", classes: 8, interfaces: 2, accent: "bg-[#3B82F6]", label: "public" },
    { name: "algo-lib", classes: 22, interfaces: 5, accent: "bg-[#10B981]", label: "public" },
    { name: "java-utils", classes: 6, interfaces: 1, accent: "bg-[#3B82F6]", label: "public" },
];

export default function DashboardPage() {
    return (
        <main className="min-h-[calc(100vh-64px)] bg-[#F0F9FF] px-6 py-10 text-[#111827] sm:px-8 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8">
                    <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#4B5563]">Your cities</p>
                    <h1 className="mt-2 text-5xl font-bold text-[#111827]">Live project dashboard</h1>
                </div>

                <div className="mb-8 flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-white/60 bg-white/50 px-4 py-2 text-sm font-semibold text-[#4B5563]">6 repos</span>
                    <span className="rounded-full border border-white/60 bg-white/50 px-4 py-2 text-sm font-semibold text-[#4B5563]">2 public</span>
                    <span className="rounded-full border border-white/60 bg-white/50 px-4 py-2 text-sm font-semibold text-[#4B5563]">1 private</span>
                </div>

                <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
                    <aside className="flex flex-col gap-6">
                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.25)] backdrop-blur-[12px]">
                            <div className="mb-6">
                                <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#4B5563]">My cities</p>
                                <p className="mt-3 text-3xl font-bold text-[#111827]">3 repos</p>
                                <p className="mt-1 text-sm text-[#4B5563]">2 public · 1 private</p>
                            </div>
                            <div className="space-y-3">
                                {['All Cities', 'Public', 'Private'].map((tab) => (
                                    <button key={tab} className="w-full rounded-xl border border-white/60 bg-white/50 px-4 py-2.5 text-sm font-medium text-[#111827] transition hover:bg-white/70">
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <p className="text-sm font-semibold text-[#111827]">City activity</p>
                            <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">Updates instantly as your editor saves files so every dependency change feels alive.</p>
                        </div>

                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <p className="text-sm font-semibold text-[#111827]">Structure at a glance</p>
                            <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">See which repositories are public or private and how classes are grouped across projects.</p>
                        </div>
                    </aside>

                    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {cities.map((city) => (
                            <div
                                key={city.name}
                                className="group overflow-hidden rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_28px_60px_-30px_rgba(59,130,246,0.22)] backdrop-blur-[12px] transition duration-300 hover:-translate-y-1 hover:shadow-[0_35px_90px_-40px_rgba(59,130,246,0.25)]"
                            >
                                <div className="mb-4 flex items-center justify-between">
                                    <span className={`inline-block h-3 w-3 rounded-full ${city.accent}`} />
                                    <span className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-[#4B5563]">
                                        {city.label}
                                    </span>
                                </div>

                                <div className="mb-6 h-28 overflow-hidden rounded-3xl bg-[#EAF6FF]">
                                    <MiniCityGrid />
                                </div>

                                <h3 className="text-xl font-semibold text-[#111827]">{city.name}</h3>
                                <p className="mt-1 text-sm font-mono text-[#4B5563]">{city.classes} classes · {city.interfaces} interfaces</p>
                            </div>
                        ))}
                    </section>
                </div>
            </div>
        </main>
    );
}
