import { GitBranch, ShieldCheck, Settings, Bell, Key } from "lucide-react";
import HeroCity from "../../components/HeroCity";

const accountItems = [
    {
        icon: GitBranch,
        title: "GitHub",
        description: "Connect to import repos",
        status: "Not connected",
    },
    {
        icon: Settings,
        title: "VS Code extension",
        description: "Sync your editor data",
        status: "Not connected",
    },
];

const settings = [
    {
        icon: ShieldCheck,
        title: "Privacy settings",
        value: "Private by default",
        description: "Keep new cities visible only to teammates you approve.",
    },
    {
        icon: Bell,
        title: "Notifications",
        value: "Enabled",
        description: "Receive live updates when your architecture changes.",
    },
    {
        icon: Key,
        title: "Access control",
        value: "Invite-only",
        description: "Control who can browse your city insights.",
    },
];

export default function ProfilePage() {
    return (
        <main className="min-h-[calc(100vh-64px)] bg-[#F0F9FF] px-6 py-10 text-[#111827] sm:px-8 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
                    <section className="space-y-8">
                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-8 shadow-[0_28px_60px_-30px_rgba(59,130,246,0.24)] backdrop-blur-[12px]">
                            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#4B5563]">Control center</p>
                            <h1 className="mt-3 text-5xl font-bold text-[#111827]">Your architectural world</h1>
                            <p className="mt-4 max-w-2xl text-base leading-8 text-[#4B5563]">
                                Manage your top-performing city, sync accounts, and keep your code architecture visible at a glance.
                            </p>
                            <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/70 bg-[#EAF6FF] p-4">
                                <div className="h-[420px] rounded-[1.75rem] bg-[#F8FBFF]">
                                    <HeroCity />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {settings.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.title} className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                                        <div className="mb-5 flex items-center gap-3">
                                            <Icon size={24} className="text-[#3B82F6]" />
                                            <div>
                                                <p className="font-semibold text-[#111827]">{item.title}</p>
                                                <p className="text-sm text-[#4B5563]">{item.value}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm leading-7 text-[#4B5563]">{item.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <aside className="space-y-6">
                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <div className="mb-6">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4B5563]">Connected accounts</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.32em] text-[#3B82F6]">Not signed in</p>
                            </div>
                            <div className="space-y-3">
                                {accountItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <div key={item.title} className="rounded-2xl border border-white/60 bg-white/70 p-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <Icon size={18} className="text-[#3B82F6]" />
                                                    <div>
                                                        <p className="font-semibold text-[#111827]">{item.title}</p>
                                                        <p className="mt-1 text-xs text-[#4B5563]">{item.description}</p>
                                                    </div>
                                                </div>
                                                <span className="whitespace-nowrap rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#2563EB]">
                                                    {item.status}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4B5563]">Privacy</p>
                            <div className="mt-6 space-y-3">
                                {[
                                    { title: "New city visibility", value: "Private" },
                                    { title: "Show online status", value: "Enabled" },
                                    { title: "Allow friend requests", value: "Enabled" },
                                ].map((item) => (
                                    <div key={item.title} className="rounded-2xl border border-white/60 bg-white/70 p-4">
                                        <p className="text-sm font-semibold text-[#111827]">{item.title}</p>
                                        <p className="mt-1 text-xs text-[#4B5563]">{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4B5563]">Action center</p>
                            <p className="mt-3 text-sm leading-7 text-[#4B5563]">Keep your architectural world secure and streamlined with one-click controls.</p>
                            <button className="mt-6 w-full rounded-xl bg-[#3B82F6] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2563EB]">
                                Review security settings
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
