"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Code2, Terminal, Trophy, BookOpen, Plus, ShoppingBag, Coins } from "lucide-react";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { GlobalSearch } from "@/components/global-search";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/problems", label: "Problems" },
  { href: "/playground", label: "Playground", icon: <Terminal className="w-3.5 h-3.5 mr-1" /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="w-3.5 h-3.5 mr-1" /> },
  { href: "/blog", label: "Blog", icon: <BookOpen className="w-3.5 h-3.5 mr-1" /> },
  { href: "/contests", label: "Contests" },
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

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container flex h-14 items-center max-w-screen-2xl mx-auto px-4">
        {/* Logo + nav links */}
        <div className="mr-4 flex items-center">
          <Link href="/" className="mr-5 flex items-center space-x-2">
            <Code2 className="h-6 w-6 text-primary" />
            <span className="font-bold hidden sm:inline-block text-xl tracking-tight text-primary">DWCode</span>
          </Link>
          <nav className="flex items-center space-x-0.5 text-sm font-medium">
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
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <GlobalSearch />
          </div>

          <nav className="flex items-center gap-1">
            {/* Create */}
            <Link href="/create">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "hidden md:flex text-[13px] font-medium gap-1 transition-colors",
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
                  "hidden md:flex text-[13px] font-medium gap-1 transition-colors",
                  pathname.startsWith("/store")
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Store
              </Button>
            </Link>

            {/* Admin */}
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
      </div>
    </header>
  );
}
