"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SignedIn, SignedOut, RedirectToSignIn, UserButton, useOrganization, useOrganizationList } from "@clerk/nextjs"
import { InstantDbAuth } from "@/components/InstantDbAuth"

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const IconDashboard = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13h8V3H3v10zM13 21h8v-6h-8v6zM13 3v6h8V3h-8zM3 21h8v-6H3v6z"/></svg>
const IconPackage = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12 20.73 6.96"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
const IconScan = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
const IconBuilding = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01M7 17h10"/></svg>
const IconChevronDown = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
const IconChevronLeft = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
const IconChevronRight = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
const IconSun = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
const IconMoon = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>

const navItems: NavItem[] = [
  { href: "/platform", label: "Dashboard", icon: IconDashboard },
  { href: "/platform/inventory", label: "Inventario", icon: IconPackage },
  { href: "/platform/items", label: "Items", icon: IconPackage },
  { href: "/platform/inventory/event-scanner-read", label: "Escáner", icon: IconScan },
]

function NavLink({ href, label, icon, collapsed, pathname }: NavItem & { collapsed: boolean; pathname: string }) {
  const isActive = pathname === href
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 px-3 py-2 text-sm transition",
        "border-l-2 border-transparent",
        "opacity-70 hover:opacity-100",
        isActive ? "opacity-100 bg-black/5 dark:bg-white/10" : "",
        collapsed ? "justify-center" : "",
      ].join(" ")}
      title={label}
      style={isActive ? { borderLeftColor: 'var(--border)' } : undefined}
    >
      <span aria-hidden>{icon}</span>
      <span className={collapsed ? "sr-only" : "inline"}>{label}</span>
    </Link>
  )
}

function useThemeToggle() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light")
  React.useEffect(() => {
    const stored = (typeof window !== "undefined" && window.localStorage.getItem("theme")) as "light" | "dark" | null
    const prefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = stored || (prefersDark ? "dark" : "light")
    setTheme(initial)
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", initial === "dark")
      document.documentElement.classList.toggle("light", initial === "light")
    }
  }, [])
  const toggle = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next === "dark")
        document.documentElement.classList.toggle("light", next === "light")
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("theme", next)
      }
      return next
    })
  }, [])
  return { theme, toggle }
}

function OrgSwitcherManual({ collapsed }: { collapsed: boolean }) {
  const { organization } = useOrganization()
  const { userMemberships, isLoaded, setActive } = useOrganizationList()
  const [open, setOpen] = React.useState(false)
  const orgs = (userMemberships?.data || []).map((m: any) => m.organization)
  const currentName = organization?.name || organization?.slug || "Organización"
  const handleSelect = async (orgId: string) => {
    if (!isLoaded) return
    await setActive({ organization: orgId })
    setOpen(false)
  }
  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full flex items-center gap-2 px-3 py-2 border rounded-none",
          "border-black dark:border-white text-sm",
          collapsed ? "justify-center" : "justify-between",
        ].join(" ")}
        title={currentName}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden>{IconBuilding}</span>
          {!collapsed && <span className="truncate max-w-[140px]">{currentName}</span>}
        </div>
        {!collapsed && <span aria-hidden className="opacity-70">{IconChevronDown}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 max-h-60 overflow-auto border border-black dark:border-white bg-white dark:bg-black z-10">
          {orgs.map((o: any) => (
            <button
              key={o.id}
              onClick={() => handleSelect(o.id)}
              className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10 text-sm"
            >
              {o.name || o.slug}
            </button>
          ))}
          {orgs.length === 0 && (
            <div className="px-3 py-2 text-xs opacity-70">Sin organizaciones</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = React.useState(false)
  const { toggle: toggleTheme, theme } = useThemeToggle()
  const pathname = usePathname()
  return (
    <div className="h-screen w-full overflow-hidden">
      <SignedIn>
        <InstantDbAuth />
        <div className={"h-full w-full grid grid-cols-1 " + (collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[260px_1fr]")}>
          {/* Sidebar */}
          <aside className="hidden md:flex h-full flex-col" style={{
            background: 'var(--panel)',
            color: 'var(--panel-contrast)',
            borderRight: '1px solid var(--border)'
          }}>
            <div className="h-16 px-2 md:px-4 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <Link href="/" className="font-semibold tracking-wide truncate">
                <span style={{ color: 'var(--panel-contrast)' }}>{collapsed ? "P" : "PULZAR"}</span>
              </Link>
              <div className="flex items-center gap-1">
                <button
                  aria-label="Toggle sidebar"
                  className="text-xs px-2 py-1 rounded-none"
                  onClick={() => setCollapsed((v) => !v)}
                  title={collapsed ? "Expandir" : "Colapsar"}
                  style={{ border: '1px solid var(--border)' }}
                >
                  {collapsed ? <span aria-hidden>{IconChevronRight}</span> : <span aria-hidden>{IconChevronLeft}</span>}
                </button>
              </div>
            </div>
            <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-1" : "px-2"} space-y-1`}>
              {navItems.map((item) => (
                <NavLink key={item.href} {...item} collapsed={collapsed} pathname={pathname} />
              ))}
            </nav>
            <div className={`mt-auto p-3 flex flex-col gap-3 ${collapsed ? "items-center" : ""}`} style={{ borderTop: '1px solid var(--border)' }}>
              <OrgSwitcherManual collapsed={collapsed} />
              <div className={`flex ${collapsed ? "justify-center" : "items-center justify-between"} px-1 w-full`}>
                {!collapsed && <span className="text-xs opacity-60">Tema</span>}
                <button
                  aria-label="Toggle theme"
                  className="text-xs px-2 py-1 border border-black dark:border-white rounded-none hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={toggleTheme}
                  title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
                >
                  {theme === "dark" ? <span aria-hidden>{IconSun}</span> : <span aria-hidden>{IconMoon}</span>}
                </button>
              </div>
              <div className={`flex ${collapsed ? "justify-center" : "items-center justify-between"} px-1 w-full`}>
                {!collapsed && <span className="text-xs opacity-60">Sesión</span>}
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="h-full overflow-auto">
            {children}
          </main>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </div>
  )
}


