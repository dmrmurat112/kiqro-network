import Link from 'next/link';
import { Logo } from '../Logo';

/** Centered glass card on the grid background, shared by login and password pages. */
export function AuthShell({ homeHref, children, below }: { homeHref: string; children: React.ReactNode; below?: React.ReactNode }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="absolute top-[10%] left-1/2 h-[640px] w-[900px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(139_92_246/0.24),transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href={homeHref}>
            <Logo />
          </Link>
        </div>
        <div className="glass rounded-2xl p-7 shadow-[0_30px_100px_-30px_rgb(0_0_0/0.6)]">{children}</div>
        {below && <div className="mt-6 text-center text-sm text-muted">{below}</div>}
      </div>
    </main>
  );
}
