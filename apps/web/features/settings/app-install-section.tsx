"use client";

import { promptInstall, useCanPromptInstall } from "@/lib/pwa/install-prompt";
import { useInstallContext } from "@/lib/pwa/use-install-context";

/** Settings: "DayFlow 앱으로 사용하기" — how to put DayFlow on the home screen, or that it already runs from there. */
export function AppInstallSection() {
  const context = useInstallContext();
  const canPrompt = useCanPromptInstall();
  if (context === null) return null;

  return (
    <section className="card app-install-card" aria-label="DayFlow 앱으로 사용하기">
      <div className="app-install-head">
        <strong>DayFlow 앱으로 사용하기</strong>
        {context.standalone ? <span className="pill">홈 화면 앱으로 사용 중</span> : null}
      </div>
      {context.standalone ? (
        <p className="mini">홈 화면의 DayFlow 아이콘으로 열면 주소창 없이 앱처럼 쓸 수 있어요.</p>
      ) : context.platform === "ios-safari" ? (
        <IosSteps />
      ) : context.platform === "ios-other" ? (
        <p className="mini">
          iPhone에서는 Safari로 DayFlow를 연 뒤 홈 화면에 추가할 수 있어요. 이 주소를 Safari에서 열어주세요.
        </p>
      ) : canPrompt ? (
        <>
          <p className="mini">홈 화면이나 앱 목록에 DayFlow를 추가하면 주소창 없이 바로 열 수 있어요.</p>
          <button type="button" className="btn secondary" onClick={() => void promptInstall()}>
            앱으로 설치
          </button>
        </>
      ) : (
        <p className="mini">브라우저 메뉴의 &apos;홈 화면에 추가&apos; 또는 &apos;앱 설치&apos;로 DayFlow를 앱처럼 열 수 있어요.</p>
      )}
    </section>
  );
}

export function IosSteps() {
  return (
    <ol className="app-install-steps">
      <li>Safari 하단의 공유 버튼(네모에 위쪽 화살표)을 눌러요.</li>
      <li>목록에서 &apos;홈 화면에 추가&apos;를 눌러요.</li>
      <li>오른쪽 위 &apos;추가&apos;를 누르면 홈 화면에 DayFlow가 생겨요.</li>
    </ol>
  );
}
