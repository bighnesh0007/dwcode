"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, ShoppingBag, Sparkles, Palette, Trophy, Star, Zap, Lock } from "lucide-react";

const STORE_ITEMS = [
    {
        id: "theme-dark-pro",
        name: "Dark Pro Theme",
        description: "A sleek dark editor theme with syntax highlighting tweaks.",
        icon: <Palette className="w-6 h-6" />,
        cost: 50,
        category: "Themes",
        color: "from-purple-500/20 to-blue-500/20 border-purple-500/20",
    },
    {
        id: "badge-legend",
        name: "Legend Badge",
        description: "Show off a special Legend badge on your profile.",
        icon: <Trophy className="w-6 h-6 text-yellow-400" />,
        cost: 200,
        category: "Badges",
        color: "from-yellow-500/20 to-orange-500/20 border-yellow-500/20",
    },
    {
        id: "ai-hints",
        name: "AI Hint Pack (x10)",
        description: "10 on-demand AI hints for any problem, powered by Gemini.",
        icon: <Sparkles className="w-6 h-6 text-cyan-400" />,
        cost: 30,
        category: "Features",
        color: "from-cyan-500/20 to-teal-500/20 border-cyan-500/20",
    },
    {
        id: "profile-border",
        name: "Gold Profile Border",
        description: "A glowing gold border for your profile avatar.",
        icon: <Star className="w-6 h-6 text-yellow-300" />,
        cost: 75,
        category: "Cosmetics",
        color: "from-yellow-400/20 to-amber-400/20 border-yellow-400/20",
    },
    {
        id: "xp-boost",
        name: "Coin Boost (24h)",
        description: "Earn 2× coins from all activities for 24 hours.",
        icon: <Zap className="w-6 h-6 text-green-400" />,
        cost: 100,
        category: "Boosts",
        color: "from-green-500/20 to-emerald-500/20 border-green-500/20",
    },
    {
        id: "custom-slug",
        name: "Custom Profile URL",
        description: "Set a custom username slug for your profile page.",
        icon: <Lock className="w-6 h-6 text-blue-400" />,
        cost: 150,
        category: "Features",
        color: "from-blue-500/20 to-indigo-500/20 border-blue-500/20",
    },
];

const CATEGORIES = ["All", ...Array.from(new Set(STORE_ITEMS.map(i => i.category)))];

export default function StorePage() {
    const [balance, setBalance] = useState<number | null>(null);
    const [activeCategory, setActiveCategory] = useState("All");

    useEffect(() => {
        fetch("/api/coins")
            .then(r => r.json())
            .then(d => { if (typeof d.balance === "number") setBalance(d.balance); })
            .catch(() => { });
    }, []);

    const filtered = activeCategory === "All"
        ? STORE_ITEMS
        : STORE_ITEMS.filter(i => i.category === activeCategory);

    return (
        <div className="container max-w-screen-xl mx-auto py-10 px-4 space-y-8">

            {/* Beta banner */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <p className="font-semibold text-sm">Beta — Store Coming Soon</p>
                        <p className="text-xs text-muted-foreground">
                            Earn coins now by solving problems, writing blogs, and commenting. Spend them here when the store launches!
                        </p>
                    </div>
                </div>
                <Badge className="bg-primary/10 text-primary border-primary/30 border text-xs px-3 py-1">
                    Coming Soon
                </Badge>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <ShoppingBag className="w-7 h-7 text-primary" />
                        Store
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Use your earned coins to unlock themes, badges, and features.
                    </p>
                </div>
                {balance !== null && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-muted/30">
                        <Coins className="w-4 h-4 text-yellow-500" />
                        <span className="font-semibold">{balance}</span>
                        <span className="text-xs text-muted-foreground">coins available</span>
                    </div>
                )}
            </div>

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/40 text-muted-foreground hover:bg-muted"
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Items grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(item => (
                    <Card key={item.id} className={`relative overflow-hidden border bg-gradient-to-br ${item.color} hover:shadow-md transition-shadow`}>
                        <div className="absolute top-3 right-3">
                            <Badge className="text-[10px] bg-muted/80 text-muted-foreground border border-border">
                                Coming Soon
                            </Badge>
                        </div>
                        <CardHeader className="pb-3">
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-xl bg-background/60 flex items-center justify-center flex-shrink-0 border border-border/50">
                                    {item.icon}
                                </div>
                                <div className="flex-1 min-w-0 pr-16">
                                    <CardTitle className="text-sm font-semibold">{item.name}</CardTitle>
                                    <Badge variant="outline" className="text-[10px] py-0 mt-1">{item.category}</Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 font-semibold text-yellow-500">
                                    <Coins className="w-4 h-4" />
                                    <span>{item.cost} coins</span>
                                </div>
                                <Button size="sm" className="h-7 text-xs" disabled>
                                    <Lock className="w-3 h-3 mr-1.5" />
                                    Locked
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <p className="text-center text-xs text-muted-foreground py-4">
                More items coming when the store launches. Keep earning coins!
            </p>
        </div>
    );
}
