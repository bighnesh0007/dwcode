"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Code2, Terminal, Trophy, BookOpen, Plus, ShoppingBag, Coins, Menu, X } from "lucide-react";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { GlobalSearch } from "@/components/global-search";
import { cn } from "@/lib/utils";
import { SHOW_ADMIN } from "@/lib/config";

const NAV_LINKS = [
  { href: "/problems", label: "Problems" },
  { href: "/playground", label: "Playground", icon: <Terminal className="w-3.5 h-3.5 mr-1" /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="w-3.5 h-3.5 mr-1" /> },
  { href: "/blog", label: "Blog", icon: <BookOpen className="w-3.5 h-3.5 mr-1" /> },
  { href: "/contests", label: "Contests" },
  { href: "/changelog", label: "Changelog" },
];

function CoinsBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/coins")
      .then(r => r.json())
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

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container flex h-14 items-center max-w-screen-2xl mx-auto px-3 sm:px-4">
        {/* Logo + nav links */}
        <div className="mr-2 flex min-w-0 items-center md:mr-4">
          <Link href="/" className="mr-2 flex items-center space-x-2 md:mr-5">
            <Code2 className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight text-primary sm:text-xl">DWCode</span>
          </Link>
          <nav className="hidden items-center space-x-0.5 text-sm font-medium md:flex">
            {NAV_LINKS.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center px-2.5 py-1.5 rounded-md transition-colors hover:text-foreground hover:bg-accent text-[13px]",
                  pathname.startsWith(href)
                    ? "text-foreground font-semibold bg-accent/60"
                    : "text-foreground/60"
                )}
              >
                {icon}
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="hidden flex-1 items-center justify-end space-x-2 md:flex">
          <div className="w-auto flex-none">
            <GlobalSearch />
          </div>

          <nav className="flex items-center gap-1">
            {/* Create */}
            <Link href="/create">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "flex text-[13px] font-medium gap-1 transition-colors",
                  pathname.startsWith("/create")
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                <Plus className="w-3.5 h-3.5" /> Create
              </Button>
            </Link>

            {/* Store */}
            <Link href="/store">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "flex text-[13px] font-medium gap-1 transition-colors",
                  pathname.startsWith("/store")
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Store
              </Button>
            </Link>

            {/* Admin — only visible when NEXT_PUBLIC_SHOW_ADMIN=true */}
            {SHOW_ADMIN && (
              <Link href="/admin">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "text-[13px] font-medium transition-colors",
                    pathname.startsWith("/admin")
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/60 hover:text-foreground"
                  )}
                >
                  Admin
                </Button>
              </Link>
            )}

            <ModeToggle />

            {/* Clerk auth */}
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm" className="text-[13px] font-medium text-foreground/60 hover:text-foreground">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm" className="text-[13px] font-medium">
                    Sign Up
                  </Button>
                </SignUpButton>
              </>
            ) : (
              <>
                <CoinsBadge />
                <Link href="/profile">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "text-[13px] font-medium transition-colors",
                      pathname.startsWith("/profile")
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/60 hover:text-foreground"
                    )}
                  >
                    Profile
                  </Button>
                </Link>
                <UserButton />
              </>
            )}
          </nav>
        </div>

        <div className="ml-auto flex items-center gap-1 md:hidden">
          {isSignedIn && <CoinsBadge />}
          <ModeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-background/98 px-3 py-3 shadow-lg md:hidden">
          <GlobalSearch />
          <nav className="mt-3 grid grid-cols-2 gap-1">
            {[
              ...NAV_LINKS,
              { href: "/create", label: "Create" },
              { href: "/store", label: "Store" },
              ...(SHOW_ADMIN ? [{ href: "/admin", label: "Admin" }] : []),
            ].map(
              ({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith(href)
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              )
            )}
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
                <Link href="/profile" className="flex-1">
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
