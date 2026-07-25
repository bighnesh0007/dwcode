"use client";

import { useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function FollowButton({ targetUsername }: { targetUsername: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const [following, setFollowing] = useState(false); // we would ideally fetch initial state, but for simplicity we toggle.
  const [loading, setLoading] = useState(false);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button variant="outline" size="sm">Follow</Button>
      </SignInButton>
    );
  }

  return (
    <Button 
      variant={following ? "secondary" : "default"} 
      size="sm" 
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/profile/follow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUsername })
          });
          const data = await res.json();
          if (data.following !== undefined) {
            setFollowing(data.following);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "..." : following ? "Unfollow" : "Follow"}
    </Button>
  );
}
