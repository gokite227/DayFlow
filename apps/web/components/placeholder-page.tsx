import Link from "next/link";
import { PageHeader } from "./page-header";

export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={<span className="pill">준비 중</span>} />
      <div className="card">
        <div className="empty">
          이 화면은 다음 단계에서 구현됩니다. 지금은{" "}
          <Link href="/goals">Goals</Link>와 <Link href="/days">Days</Link>에서 실제 데이터를 관리할 수 있습니다.
        </div>
      </div>
    </>
  );
}
