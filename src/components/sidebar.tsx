"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import clsx from "clsx";
import { Bell, Bookmark, Briefcase, FileUser, LayoutDashboard, LogOut, Menu, Search, Settings, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Find Jobs", icon: Search },
  { href: "/high-match", label: "High-Match", icon: Sparkles },
  { href: "/saved", label: "Saved Jobs", icon: Bookmark },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/cv", label: "CV & Profile", icon: FileUser },
  { href: "/settings", label: "Settings", icon: Settings },
];

type Note = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

export function Sidebar({ email }: { email: string | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const unread = notes.filter((n) => !n.read).length;

  useEffect(() => {
    api<{ items: Note[] }>("/api/notifications").then((r) => setNotes(r.items)).catch(() => undefined);
  }, [path]);
  useEffect(() => setOpen(false), [path]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" || href === "/jobs" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-white/10 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white")}>
            <Icon size={18} /> {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink-950 px-4 py-3 text-white lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
        <span className="font-display text-lg">Isar Jobs</span>
        <button onClick={() => setShowNotes((s) => !s)} className="relative" aria-label="Notifications"><Bell size={20} />{unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-isar-500" />}</button>
      </div>

      <aside className={clsx("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink-950 p-4 text-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-8 flex items-center justify-between px-2 pt-2">
          <div>
            <div className="font-display text-2xl">Isar Jobs</div>
            <div className="text-xs text-ink-400">München · applications on your terms</div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        {nav}
        <button onClick={() => setShowNotes((s) => !s)} className="mb-2 hidden items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-300 hover:bg-white/5 hover:text-white lg:flex">
          <Bell size={18} /> Notifications {unread > 0 && <span className="ml-auto rounded-full bg-isar-500 px-2 text-xs text-white">{unread}</span>}
        </button>
        <div className="border-t border-white/10 px-2 pt-3 text-xs text-ink-400">
          <div className="truncate">{email}</div>
          <button onClick={() => signOut({ callbackUrl: "/signin" })} className="mt-2 inline-flex items-center gap-1 hover:text-white"><LogOut size={14} /> Sign out</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink-950/40 lg:hidden" onClick={() => setOpen(false)} />}

      {showNotes && (
        <div className="fixed right-4 top-16 z-50 w-[min(92vw,380px)] card p-4 lg:left-72 lg:right-auto lg:top-auto lg:bottom-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">Notifications</div>
            <button className="text-xs text-isar-700" onClick={async () => { await api("/api/notifications", { method: "PATCH" }); setNotes((n) => n.map((x) => ({ ...x, read: true }))); }}>Mark all read</button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {notes.length === 0 && <div className="py-6 text-center text-sm text-ink-400">No alerts yet. Save a search to get notified about new matches.</div>}
            {notes.map((n) => (
              <Link key={n.id} href={n.link ?? "/jobs"} onClick={() => setShowNotes(false)} className={clsx("block rounded-xl p-3 text-sm hover:bg-ink-50", !n.read && "bg-isar-50")}>
                <div className="font-medium">{n.title}</div>
                <div className="mt-1 whitespace-pre-line text-xs text-ink-500">{n.body}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
