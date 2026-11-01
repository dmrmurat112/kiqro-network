/** Re-mounts on every panel navigation, so each page fades in softly (see .page-enter). */
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
