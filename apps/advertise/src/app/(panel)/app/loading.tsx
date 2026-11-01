/**
 * Shown at once while a panel page loads its data, so a tap on the menu answers immediately
 * (pages are rendered on the server for every request).
 */
export default function PanelLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-6">
      <div className="grid gap-2.5">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <div className="skeleton h-72" />
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
    </div>
  );
}
