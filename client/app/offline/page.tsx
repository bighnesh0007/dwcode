import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline · DWCode" };

/** Shown by the service worker when a page isn't cached and there's no connection. */
export default function OfflinePage() {
  return (
    <div className="container max-w-md mx-auto py-24 px-4 text-center space-y-4">
      <WifiOff className="w-10 h-10 mx-auto text-muted-foreground" />
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-muted-foreground">
        Pages you&apos;ve opened before still work. Running code, submitting and your coins need a connection; they&apos;ll be back when you are.
      </p>
      <Link href="/" className="text-primary underline">Try again</Link>
    </div>
  );
}
