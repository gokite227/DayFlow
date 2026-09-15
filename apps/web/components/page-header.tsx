import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="topbar">
      <div>
        <h1 className="title">{title}</h1>
        <div className="subtitle">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}
