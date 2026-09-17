import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  /** Extra class for a screen-specific header layout (e.g. actions under the title on phones). */
  className?: string;
}) {
  return (
    <div className={className ? `topbar ${className}` : "topbar"}>
      <div>
        <h1 className="title">{title}</h1>
        <div className="subtitle">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}
