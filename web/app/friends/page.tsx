import MiniCityGrid from "../../components/MiniCityGrid";

const friends = [
    {
        name: "Ayla Nakamura",
        role: "Frontend Architect",
        status: "Live",
        statusAccent: "bg-[#DBEAFE] text-[#2563EB]",
        activity: "Reviewing dependency graphs",
    },
    {
        name: "Miles Chen",
        role: "Backend Systems",
        status: "Live",
        statusAccent: "bg-[#DCFCE7] text-[#047857]",
        activity: "Syncing service modules",
    },
    {
        name: "Priya Shah",
        role: "UX Engineer",
        status: "Live",
        statusAccent: "bg-[#DBEAFE] text-[#2563EB]",
        activity: "Mapping city structure",
    },
];

export default function FriendsPage() {
    return (
        <main className="min-h-[calc(100vh-64px)] bg-[#F0F9FF] px-6 py-10 text-[#111827] sm:px-8 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <div className="mb-12">
                    <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#4B5563]">Friends</p>
                    <h1 className="mt-2 text-5xl font-bold text-[#111827]">Map of developers.</h1>
                </div>

                <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
                    <section>
                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            {friends.map((friend) => (
                                <div
                                    key={friend.name}
                                    className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_28px_60px_-30px_rgba(59,130,246,0.20)] backdrop-blur-[12px] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_-35px_rgba(59,130,246,0.22)]"
                                >
                                    <div className="pointer-events-none absolute inset-x-6 top-6 h-28 overflow-hidden rounded-[1.75rem] opacity-20 transition duration-300 group-hover:scale-105 group-hover:opacity-30">
                                        <MiniCityGrid />
                                    </div>

                                    <div className="relative z-10 space-y-4 pt-32">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <p className="text-lg font-semibold text-[#111827]">{friend.name}</p>
                                                <p className="text-sm text-[#4B5563]">{friend.role}</p>
                                            </div>
                                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${friend.statusAccent}`}>
                                                {friend.status}
                                            </span>
                                        </div>
                                        <p className="text-sm leading-7 text-[#4B5563]">{friend.activity}</p>
                                        <div className="flex items-center gap-2 text-sm text-[#4B5563]">
                                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
                                            <span>Active within the last 5 minutes</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <aside className="space-y-6">
                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4B5563]">Friends summary</p>
                            <div className="mt-6 grid gap-4">
                                {[
                                    { label: "Total friends", value: "3" },
                                    { label: "Online now", value: "3" },
                                    { label: "Pending requests", value: "1" },
                                    { label: "Public profiles", value: "2" },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-2xl border border-white/60 bg-white/70 p-4">
                                        <p className="text-2xl font-bold text-[#111827]">{item.value}</p>
                                        <p className="mt-1 text-xs uppercase tracking-[0.26em] text-[#4B5563]">{item.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4B5563]">Privacy defaults</p>
                            <div className="mt-6 space-y-4">
                                {[
                                    { title: "New city visibility", value: "Private" },
                                    { title: "Allow friend requests", value: "On" },
                                    { title: "Show online status", value: "On" },
                                ].map((item) => (
                                    <div key={item.title} className="rounded-2xl border border-white/60 bg-white/70 p-4">
                                        <p className="text-sm font-semibold text-[#111827]">{item.title}</p>
                                        <p className="mt-1 text-xs text-[#4B5563]">{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
