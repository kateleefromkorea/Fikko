/**
 * What shows while the app is starting: the sprout, then, if it's taking a
 * while (a slow phone connection), a line saying so. Without it the page is
 * plain white until sign-in has been checked. index.html draws the same thing
 * before any code has loaded, so there's no white gap in between.
 */
export default function Splash() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/favicon.svg" alt="" className="size-14" />
        <span className="sr-only">Loading Fikko</span>
        <p className="splash-hint max-w-64 text-sm text-muted-foreground">
          Taking longer than usual. Check your connection, and refresh if it doesn&apos;t load.
        </p>
      </div>
    </div>
  );
}
