"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Code2, Coins, GraduationCap, Menu, Swords, Terminal, Trophy, X } from "lucide-react";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { GlobalSearch } from "@/components/global-search";
import { cn } from "@/lib/utils";
import { SHOW_ADMIN } from "@/lib/config";
import { apiRequest } from "@/lib/apiClient";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Always in the bar on desktop. */
const NAV_LINKS = [
  { href: "/problems", label: "Problems", icon: <Code2 className="w-3.5 h-3.5 mr-1" /> },
  { href: "/playground", label: "Playground", icon: <Terminal className="w-3.5 h-3.5 mr-1" /> },
  { href: "/roadmap", label: "Learn", icon: <GraduationCap className="w-3.5 h-3.5 mr-1" /> },
  { href: "/contests", label: "Contests", icon: <Swords className="w-3.5 h-3.5 mr-1" /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="w-3.5 h-3.5 mr-1" /> },
];

/** Grouped under "More" on desktop; listed in full in the mobile menu. Changelog lives in the footer. */
const MORE_GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Practice",
    links: [
      { href: "/interview", label: "Interview mode" },
      { href: "/debugging", label: "Debugging arena" },
      { href: "/certification", label: "Certification prep" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/blog", label: "Blog" },
      { href: "/teams", label: "Teams" },
      { href: "/feed", label: "Feed" },
      { href: "/mentors", label: "Mentors" },
      { href: "/jobs", label: "Jobs" },
    ],
  },
  {
    title: "Create",
    links: [
      { href: "/contribute", label: "Contribute" },
      { href: "/create", label: "Add a problem" },
      { href: "/store", label: "Store" },
    ],
  },
];

function CoinsBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<{ balance: number }>("/api/v1/coins")
      .then(d => { if (typeof d.balance === "number") setBalance(d.balance); })
      .catch(() => { });
  }, []);

  if (balance === null) return null;

  return (
    <Link href="/store">
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-xs font-semibold hover:bg-yellow-500/20 transition-colors cursor-pointer">
        <Coins className="w-3.5 h-3.5" />
        {balance}
      </div>
    </Link>
  );
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function MoreMenu({ pathname }: { pathname: string }) {
  const groups = SHOW_ADMIN ? [...MORE_GROUPS, { title: "Admin", links: [{ href: "/admin", label: "Admin" }] }] : MORE_GROUPS;
  const active = groups.some((g) => g.links.some((l) => isActive(pathname, l.href)));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-accent hover:text-foreground",
              active ? "bg-accent/60 font-semibold text-foreground" : "text-foreground/60",
            )}
          />
        }
      >
        More <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {groups.map((g, i) => (
          <DropdownMenuGroup key={g.title}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.title}</DropdownMenuLabel>
            {g.links.map((l) => (
              <DropdownMenuItem key={l.href} render={<Link href={l.href} />} className={cn(isActive(pathname, l.href) && "font-semibold")}>
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => {
    queueMicrotask(() => setMobileOpen(false));
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-3 sm:px-4">
        <Link href="/" className="mr-1 flex shrink-0 items-center gap-2 lg:mr-3">
          <Code2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight text-primary sm:text-xl">DWCode</span>
        </Link>

        {/* Desktop navigation (lg and up) */}
        <nav aria-label="Main" className="hidden min-w-0 items-center gap-0.5 text-sm font-medium lg:flex">
          {NAV_LINKS.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-accent hover:text-foreground",
                isActive(pathname, href) ? "bg-accent/60 font-semibold text-foreground" : "text-foreground/60",
              )}
            >
              <span className="hidden xl:inline-flex">{icon}</span>
              {label}
            </Link>
          ))}
          <MoreMenu pathname={pathname} />
        </nav>

        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          <div className="w-48 xl:w-60">
            <GlobalSearch />
          </div>
          <ModeToggle />
          {!isSignedIn ? (
            <>
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm" className="text-[13px] font-medium text-foreground/60 hover:text-foreground">
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm" className="text-[13px] font-medium">Sign Up</Button>
              </SignUpButton>
            </>
          ) : (
            <>
              <CoinsBadge />
              <NotificationBell />
              <Link
                href="/profile"
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent hover:text-foreground",
                  isActive(pathname, "/profile") ? "bg-accent text-foreground" : "text-foreground/60",
                )}
              >
                Profile
              </Link>
              <UserButton />
            </>
          )}
        </div>

        {/* Below lg: compact controls and a menu button */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          {isSignedIn && <CoinsBadge />}
          {isSignedIn && <NotificationBell />}
          <ModeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-nav" className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t bg-background px-3 py-3 shadow-lg lg:hidden">
          <GlobalSearch />
          <nav aria-label="Main" className="mt-3 space-y-3">
            {[{ title: "", links: NAV_LINKS.map(({ href, label }) => ({ href, label })) }, ...MORE_GROUPS, ...(SHOW_ADMIN ? [{ title: "Admin", links: [{ href: "/admin", label: "Admin" }] }] : [])].map((g) => (
              <div key={g.title || "main"}>
                {g.title && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>}
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {g.links.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={isActive(pathname, href) ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive(pathname, href) ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t pt-3">
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <Button variant="outline" className="flex-1">Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button className="flex-1">Sign Up</Button>
                </SignUpButton>
              </>
            ) : (
              <>
                <Link href="/profile" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full">Profile</Button>
                </Link>
                <UserButton />
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
