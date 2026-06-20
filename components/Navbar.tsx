"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, Terminal, Trophy } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { GlobalSearch } from "@/components/global-search";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/problems", label: "Problems" },
  { href: "/playground", label: "Playground", icon: <Terminal className="w-3.5 h-3.5 mr-1" /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="w-3.5 h-3.5 mr-1" /> },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container flex h-14 items-center max-w-screen-2xl mx-auto px-4">
        {/* Logo + nav links */}
        <div className="mr-4 flex items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Code2 className="h-6 w-6 text-primary" />
            <span className="font-bold inline-block text-xl tracking-tight text-primary">DWCode</span>
          </Link>
          <nav className="flex items-center space-x-1 text-sm font-medium">
            {NAV_LINKS.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center px-3 py-1.5 rounded-md transition-colors hover:text-foreground hover:bg-accent",
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

        {/* Search + right-side controls */}
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <GlobalSearch />
          </div>

          <nav className="flex items-center gap-1">
            {/* Admin link */}
            <Link href="/admin">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                Admin
              </Button>
            </Link>

            {/* Contests link */}
            <Link href="/contests">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-sm font-medium transition-colors",
                  pathname.startsWith("/contests")
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                Contests
              </Button>
            </Link>

            <ModeToggle />

            {/* Clerk auth controls */}
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm" className="text-sm font-medium text-foreground/60 hover:text-foreground">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm" className="text-sm font-medium">
                    Sign Up
                  </Button>
                </SignUpButton>
              </>
            ) : (
              <>
                {/* Profile link */}
                <Link href="/profile">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "text-sm font-medium transition-colors",
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
