/** Re-mounts on every site navigation, so each page fades in softly (see .page-enter). */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
