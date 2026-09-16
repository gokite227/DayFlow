# DayFlow Product Spec

> **문서 역할:** 제품 비전, 문제 정의, 타깃 사용자, Recovery 철학과 AI Coach의 제품 방향을 설명하는 참고 문서다.  
> 실제 구현 스택·API·DB·크로스플랫폼 구조와 Acceptance Criteria는 `docs/requirements.md`를 우선한다.

목표를 세우고, 실행하고, 무너져도 다시 돌아오게 만드는 생산성 앱

| **Goal** | **→** | **Plan** | **→** | **Focus** | **→** | **Recover** | **→** | **Review** | **→** | **Next Goal** |
|----------|-------|----------|-------|-----------|-------|-------------|-------|------------|-------|---------------|

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>제품 한 문장 정의</strong></p>
<p>완벽한 계획을 강요하는 앱이 아니라, 계획이 무너졌을 때 사용자를 다시 목표로 복귀시키는 AI 코치.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

핵심 기능 · UX 원칙 · AI 코치 로직 · iOS 기술 설계 · 데이터 모델 · 개발 순서

Version 0.1 · 2026-09-14

# 문서 구성

- 1\. 제품 비전과 문제 정의

- 2\. 타깃 사용자와 제품 원칙

- 3\. 핵심 사용자 루프

- 4\. 필수 기능 명세

- 5\. P형 사용자 친화 UX 규칙

- 6\. AI 코치 개입 로직

- 7\. 데이터 모델

- 8\. 상태 설계

- 9\. iOS 기술 아키텍처

- 10\. 개발 순서와 완료 기준

- 11\. MVP 범위 / 이후 확장

- 12\. 핵심 지표

- 13\. 기술 리스크와 제약

- 14\. Apple 공식 참고자료

# 1. 제품 비전과 문제 정의

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>핵심 문제</strong></p>
<p>사용자는 계획을 세울 수 있지만, 휴대폰으로 시작을 미루거나 하루가 무너지면 그 주 전체를 포기한다. 기존 플래너는 “계획”은 도와주지만 “실행·복귀”까지 책임지지 않는다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

이 제품은 계획 정확도를 높이는 것이 1순위가 아니다. **목표 방향을 유지하고, 이탈 후 복귀 시간을 줄이는 것**을 1순위 가치로 둔다.

**제품이 해결해야 하는 실제 상황**

- 해야 할 일이 있는데 SNS·영상·쇼핑 앱을 보며 시작을 계속 미룬다.

- 시험·면접·여행처럼 에너지 소모가 큰 일정 뒤 하루를 통째로 쉬고, 그 여파로 그 주 계획까지 버린다.

- 분 단위 시간표를 세워도 실제 생활과 어긋나면 “계획 실패”라고 느끼고 앱을 떠난다.

- 일주일 정도 열심히 사용한 뒤 한 번 무너지면 다시 새 계획을 세우는 루프를 반복한다.

- 회고를 해야 도움이 되지만 무엇을 써야 할지 모르고 귀찮아서 하지 않는다.

# 2. 타깃 사용자와 제품 원칙

**Primary Persona** — 계획은 좋아하지만 실행과 지속이 어려운 사람

- 투두리스트와 플래너를 여러 번 갈아탄 경험이 있다.

- 정확한 분 단위 계획보다 “오늘/오후/저녁에 무엇을 할지”가 편하다.

- 외부 강제 장치가 있으면 시작하기 쉬워진다.

- 하루 쉬었을 때 죄책감보다 “다시 들어가는 방법”이 필요하다.

- 장기 Goal과 오늘의 Day가 연결되어 “왜 이걸 해야 하는지”가 계속 보이길 원한다.

**제품 원칙**

| **원칙**                         | **의미**                                                                   |
|----------------------------------|----------------------------------------------------------------------------|
| Recovery \> Streak               | 연속 성공 일수보다 “무너진 뒤 얼마나 빨리 돌아왔는가”를 더 중요하게 본다.  |
| Direction \> Schedule Accuracy   | 19:00 정각 시작보다 이번 주 목표 방향을 유지했는지가 중요하다.             |
| Minimum Viable Action            | 90분을 못 하면 25분으로 줄여서라도 실행을 남긴다.                          |
| Rest is a valid state            | 방전 상태는 실패가 아니라 회복 상태로 명시적으로 처리한다.                 |
| AI must explain why              | AI 추천에는 반드시 근거가 있어야 한다. 뜬구름 조언을 금지한다.             |
| Default simple, detail on demand | 평소 화면은 단순하게. 실제 기록·분석은 회고/분석 화면에서만 깊게 보여준다. |

# 3. 핵심 사용자 루프

| **연간 Goal** | **→** | **하위 Goal** | **→** | **Week** | **→** | **Day** | **→** | **Focus** | **→** | **Review** | **→** | **Recovery/Adjust** |
|---------------|-------|---------------|-------|----------|-------|---------|-------|-----------|-------|------------|-------|---------------------|

**Core Loop:** Goal → Plan → Focus → Review → Adjust → Next Goal

- Goal: 연간/분기/월간/주간 목표를 계층으로 연결한다.

- Plan: 주간 목표를 기준으로 Day를 만들고, 필요한 것만 캘린더에 시간 배치한다.

- Focus: 선택한 Day에는 앱 잠금과 집중 세션을 연결한다.

- Review: 일/주/월/분기/연 회고에서 해당 기간의 Goal/Day/실행 데이터를 자동으로 모은다.

- Adjust: AI가 계획량·시간대·반복되는 이탈 패턴을 바탕으로 다음 계획을 조정한다.

- Recover: 사용자가 며칠 떠났을 때 밀린 일을 쌓지 않고 “다시 시작 가능한 상태”로 정리한다.

# 4. 필수 기능 명세

## 4.1 Goal 계층

- Goal 단위: 연간 / 분기 / 월간 / 주간.

- 장기 목표를 calendar period 단위로 YEAR → QUARTER → MONTH → WEEK로 구체화한다. 사용자는 날짜를 직접 정하지 않고 “2026 / 3분기 / 9월 / 9월 3주” 같은 기간을 고르며, 목표 제목은 기간과 따로 쓴다.

- Goal 화면은 전체 계층을 펼친 트리가 아니라, 상위 목표를 눌러 한 단계씩 하위 목표로 들어가는 drill-down 방식으로 탐색한다. 지금 어디에 있는지는 breadcrumb로 보여준다.

- 상위 Goal에 여러 하위 Goal을 연결한다.

- 진행률은 그 목표(하위 목표 포함)에 실제로 연결된 Day 완료를 기준으로 자동 집계하되, 사용자가 수동 조정할 수 있다. 목표에 연결되지 않은 생활 Task는 진행률에 들어가지 않는다.

- 각 Goal에는 “왜 중요한지(Why)”를 짧게 기록한다. 오늘의 Day 화면에서 Why를 노출해 실행 이유를 유지한다.

- Today에서는 오늘 날짜가 들어 있는 주간 목표들의 진행률을 보여준다. 오늘 배치된 Day가 없어도 이번 주의 방향이므로 함께 보여주고, 진행률은 그 목표에 연결된 Day만으로 계산한다.

- AI 하위 목표 추천은 MVP 이후 추가하지만, 데이터 구조는 처음부터 parentGoalId를 지원한다.

## 4.2 Day + Calendar

- 기존 task 명칭 대신 Day를 사용한다. **Day는 사용자가 실제로 해야 하는 모든 행동/Task**다.

- Goal 연결은 선택이다. 목표와 연결하면 주간 Goal 아래 “이번 주 안에 할 일”이 되고, 연결하지 않은 생활 Task도 똑같이 1급으로 다룬다. Goal 진행률은 그 Goal에 실제로 연결된 Day만 반영한다.

- Day는 날짜가 없어도 생성 가능하다.

- Day에는 생활/업무 영역을 나타내는 Tag를 여러 개(최대 10개) 붙일 수 있고, Task 자체의 중요도를 나타내는 priority(없음/낮음/보통/높음)를 둔다. priority는 “오늘 꼭 지키고 싶은” 핵심 Day 표시와는 다른 개념이다. Tag 색상은 제공되는 색 중에서 고른다.

- Day를 클릭해 날짜/시간을 배치·수정·취소할 수 있다.

- 캘린더에서 드래그해 Day의 시간 블록을 생성하거나 길이를 조절한다.

- Calendar는 주/3일/하루 뷰와 리스트 뷰를 제공하고, 미배치 Day 패널은 접고 펼 수 있다. 시간 격자는 1시간 선을 기준으로 촘촘하지 않게 그려 한 화면에서 더 넓은 시간대를 본다(15분 배치 정밀도는 유지).

- 시간이 밀렸다고 실패 처리하지 않는다. 실제 시작 시각은 분석용 데이터일 뿐, 평가는 방향/완료 중심으로 한다.

**화면 역할**

| **화면**  | **역할**                                           |
|-----------|----------------------------------------------------|
| Days      | 모든 Task를 모으고 관리하는 Inbox / Backlog         |
| Today     | 오늘 실행하는 화면                                  |
| Calendar  | Day를 실제 날짜와 시간에 배치하는 계획 화면         |
| Goals     | 장기 방향과 계획 구조                               |
| Events    | 이미 정해진 일정                                    |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>계획 타입 3개</strong></p>
<p>① 고정 일정(FIXED): “19:00 Java 공부”, “14:00 지원서 작성”처럼 특정 시각에 하기로 정한 작업 / ② 시간대 목표: “오후에 Java 2시간” / ③ 오늘 안에: 정확한 시간 없이 Day만 지정</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

> 세 계획 타입은 모두 **Day**(사용자가 해야 하는 일)다. 면접·시험·약속·생일·마감 **자체**는 계획 타입이 아니라 4.2.1의 **Event**다. 예: “14:00 면접” → Event, “14:00 지원서 작성” → FIXED Day.

### 4.2.1 Day와 Event — 해야 하는 일과 일어나는 일정

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>개념 구분</strong></p>
<p>Day = 사용자가 해야 하는 일. Event = 이미 시간이 정해져 있거나 사용자에게 일어나는 일정. 둘은 서로 다른 도메인이다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **항목**      | **Day**                                        | **Event**                                         |
|---------------|------------------------------------------------|---------------------------------------------------|
| 본질          | 내가 실행하고 완료하는 일                      | 시간이 정해져 있거나 나에게 일어나는 일정         |
| 예시          | 코테 3문제 풀기, 지원서 작성, 19:00 Java 공부(FIXED) | 14:00 면접, 시험, 생일, 제출 마감, 약속     |
| 날짜/시간     | 없어도 됨. 필요할 때만 시간 배치               | 시간(또는 all-day 날짜)이 정해져 있음             |
| 상태          | 진행 전/진행 중/완료/미룸/건너뜀               | 완료 개념 없음 — 일어나는 일                      |
| Recovery      | 유지/축소/이동/내려놓기로 다시 정리            | 대상 아님. 일정은 사용자가 직접 수정              |
| Goal          | 필요할 때만 주간 Goal에 연결(선택)             | 필요할 때만 Goal에 연결(선택)                     |
| 알림          | 시작 재촉(Nudge)과 Focus Lock으로 실행을 도움  | 정각/10분 전/1일 전 등 reminder로 잊지 않게 도움  |

- **마감은 Event, 준비 작업은 Day.** 마감 자체는 “해야 할 일”이 아니라 “정해진 시점”이다. 실행은 그 앞에 놓인 Day들로 쪼갠다.

  - Event: 9/30 23:59 포트폴리오 제출 마감
  - Day: 9/25 문구 수정 · 9/27 이미지 정리 · 9/29 최종 검수

- Event는 필요하면 Goal에 연결한다. 나중에 “이 면접을 위해 어떤 Day를 했는지”를 Goal 기준으로 함께 볼 수 있게 하기 위해서다.

- 기본 Event Category: 일정 / 생일 / 면접 / 시험 / 마감 / 약속(사용자가 바꾸고 추가할 수 있다). 생일처럼 반복되는 일정은 매일/매주/매월/매년 반복으로 둔다. 31일·2/29처럼 대상 월에 없는 날짜는 그 달 마지막 날로 맞추고, 매번 원래 날짜를 기준으로 다시 계산한다. 반복 중 한 번만 바꾸는 기능은 MVP 이후다.

- 하루 종일 일정은 시각 없이 날짜로 저장한다(시각이 있는 일정과 저장 방식을 분리).

- Event reminder는 일정마다 최대 5개 둘 수 있다(정각, 10분 전, 30분 전, 1시간 전, 1일 전, 사용자 지정). 하루 종일 일정은 그날 오전 9시를 기준으로 알린다. 모바일에서는 기기 로컬 알림을 쓰며, 이것은 실행을 재촉하는 Focus Lock/Nudge와 다른 기능이다.

- Event 종류는 사용자가 직접 관리하는 Category로 둔다(기본: 일정/생일/면접/시험/마감/약속). 기본 Category도 이름·색상을 바꾸거나 지울 수 있고, 지울 수 없는 고정 Category는 없다. Category를 지워도 일정은 남고 `미분류`로 보인다. Day의 Tag(생활/업무 영역)와 Event Category(일정의 종류)는 다른 축이라 합치지 않는다.

- 같은 행동도 목적에 따라 고른다. 체크하며 관리하고 싶으면 Day(저녁 먹기·운동·출근 준비), 이미 시간이 정해져 캘린더 시간을 차지하면 Event(면접·약속·수업·근무시간 확보). 별도의 루틴/습관 기능은 지금 만들지 않는다.

- Navigation: desktop은 `Today / Goals / Calendar / Events / Days / Review`. Events 화면에서는 일정만 따로 본다(Category 필터). 모바일 Web은 6개 하단 탭으로 고정하지 않고, 추후 `More` 또는 별도 정보구조를 쓸 수 있다.

- Apple/Google Calendar 연동은 MVP 필수가 아니다. 이후 EventKit 또는 외부 Calendar API로 확장한다.

### 4.2.2 일정 기반 시간 분배

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>철학</strong></p>
<p>하루의 시간은 비어 있지 않다. 이미 정해진 일정이 먼저 시간을 차지하고, 해야 할 일은 남은 시간 안에서 현실적으로 배치해야 한다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Event 먼저 확인** | **→** | **고정 시간 제외** | **→** | **남은 가용 시간** | **→** | **Core Day 배치** | **→** | **나머지 Day 배치** |
|---------------------|-------|--------------------|-------|--------------------|-------|-------------------|-------|---------------------|

- 여기서 “고정 시간”은 Event가 차지한 시간이다. 이미 시간을 정한 Day(FIXED 포함)는 앱이 옮기지 않는다.

- 면접이 있는 날에 90분짜리 집중 작업 세 개를 넣지 않도록, 계획 단계에서 일정이 차지한 시간을 먼저 보여준다.

- 핵심 Day를 먼저 살리고 나머지는 남은 시간에 맞춰 둔다. 시간이 부족하면 줄이거나 다른 날로 옮기는 선택을 돕는다.

- 이 흐름은 제안이다. 앱은 Day를 자동으로 옮기지 않고, 사용자가 확인한 뒤에만 적용한다. “Direction > Schedule Accuracy” 원칙은 그대로다.

- 향후 AI Coach는 Event를 근거로 배치를 추천할 수 있다. 예: “수요일 14시에 면접이 있어서 긴 집중 작업은 오전에 배치하는 게 좋아 보여요.”

### 4.2.3 Calendar 통합 UX

- 데이터는 Day와 Event로 분리하지만 Calendar에서는 함께 보여준다. Event가 점유한 시간을 먼저 보고, 남은 시간에 Day를 배치할 수 있어야 하기 때문이다.

- Day는 기존 pink/lavender 스타일을 유지한다.

- Event는 별도 시각 스타일로, 시간이 확정된 일정임이 드러나도록 더 명확하게 표시한다(선명한 테두리나 바, Category 라벨과 색, 미분류는 중립색). 색만으로 구분하지 않는다.

- 하루 종일 일정(생일, 시험 기간 등)은 날짜 행에, 시각이 정해진 마감은 해당 시각의 표시선으로 보여준다.

- Day와 Event는 같은 시간대에 겹칠 수 있다. 겹침을 오류나 실패로 표현하지 않고, 두 블록이 모두 보이도록 나란히 둔다.

- Calendar에서 Day는 지금처럼 드래그로 옮긴다. MVP에서 Event는 드래그·길이 조절을 하지 않고, 클릭하면 Event 편집 화면/modal이 열린다. 일정 이동은 편집 후 저장으로만 한다. 실수로 Event 시간이 바뀌지 않게 하기 위해서다.

## 4.3 Focus Lock — 실행을 돕는 강제 장치

- Day별로 Focus Lock 사용 여부를 선택한다.

- “선택 앱만 차단”과 “허용 앱만 남기고 나머지 차단” 두 모드를 지원한다.

- Focus 시간 동안 허용 앱(전화·지도·음악·학습 앱 등)을 별도로 선택할 수 있다.

- 집중 시작 즉시 잠금 / 예약 시각 자동 잠금 / Morning Lock을 지원한다.

- 집중이 끝나면 자동 해제한다.

- 잠금 화면(Shield)에는 현재 Day, 종료 예정, 핵심 행동을 간결하게 보여준다.

**Morning Lock 예시**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>07:30–08:30 Morning Lock</strong></p>
<p>허용: 전화 · 카카오톡 · 음악 · 지도 · 우리 앱 | 차단: SNS · 쇼핑 · 커뮤니티 · 게임 | 아침 루틴 완료 시 조기 해제 옵션</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 4.4 “시작 안 함” 개입 시스템

| **시점**     | **개입 단계** | **UX**                                                             |
|--------------|---------------|--------------------------------------------------------------------|
| 예정 시각    | 1차 알림      | “Java 공부 시작할 시간이에요.” · \[지금 시작\] \[10분 뒤\]         |
| +10분        | 2차 재촉      | “아직 시작하지 않았어요. 25분만 해볼까요?”                         |
| +20~30분     | 강도 상승     | “지금 시작하면 오늘 목표는 아직 살릴 수 있어요.” · Focus Lock 제안 |
| 계속 미룸    | 원인 선택     | 폰 보고 있음 / 피곤함 / 밖에 있음 / 계획이 과함 / 그냥 하기 싫음   |
| 원인 파악 후 | 적응형 대응   | 차단 강화 / 25분으로 축소 / 시간 재배치 / 회복일 제안              |

**주의:** iOS에서 백그라운드 앱이 임의로 10분마다 전체 화면을 강제 표시하는 방식은 기대하지 않는다. 기본 구현은 로컬/Time Sensitive 알림 + 앱 진입 시 강한 개입 UI로 설계한다.

## 4.5 Recovery Mode — 가장 중요한 필수 기능

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>제품 철학</strong></p>
<p>“오늘 못 했으니 내일부터 열심히”가 아니라 “지금 남은 시간으로 이번 주를 어떻게 살릴지”를 계산한다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- 하루 통째로 쉬었거나 2~3일 앱에 들어오지 않았을 때 자동으로 복귀 모드를 제안한다.

- 정리 대상은 지난 날짜의 미완료 Day와, 오늘 예정 시간이 이미 지났는데 끝내지 못한 Day다. 오늘 안에 하기로만 한 Day는 하루가 끝나기 전에 놓친 계획으로 취급하지 않는다. Goal이 없는 Day도 대상이다.

- 밀린 Day를 그대로 다음 날로 넘기지 않는다. 그대로 두기 / 작게 줄이기 / 날짜 바꾸기 / 다음 달·다음 분기로 이어가기 / 이번엔 내려놓기로 재분배한다. 목표에 연결된 Day는 그 주 목표 기간 안에서 옮기고, 목표가 없는 Day는 오늘 이후의 원하는 날짜로 옮길 수 있다(과거로는 옮기지 않는다).

- **이어가기(Carry Over)는 과거를 덮어쓰지 않는다.** 9월에 못한 계획을 10월로 이어가도 9월 기록은 그대로 남고, 10월에 새 계획을 만든다. 회고에서 “9월에 계획했지만 10월로 이어감”을 볼 수 있어야 한다.

- 다음 기간에 필요한 월/분기 목표가 없을 수 있다. 앱이 목표를 자동으로 복제하지 않고, 새로 만들 계획 구조와 함께 넘길 Day를 미리보기로 보여준 뒤 사용자가 승인해야 적용한다. 이미 완료했거나 내려놓은 Day는 넘기지 않고, 기존 시간·진행 상태도 복사하지 않는다.

- 이미 정리 결정을 내린 Day는 계획이 실제로 바뀌기 전까지 같은 “놓친 계획” 알림으로 다시 띄우지 않는다. 날짜·시간·목표 연결·상태가 바뀌면 다시 후보가 될 수 있고, 지난 정리 기록은 `/recovery`에서 다시 볼 수 있다.

- 지금 판단하기 어려운 Day는 `이번엔 건너뛰기`로 이번 정리에서만 빼둘 수 있다. 결정이 아니므로 기록도 남지 않고, 다음에 다시 보여준다.

- `/recovery`는 놓친 계획이 있을 때만 발견되는 화면이 아니라 항상 열 수 있는 관리 화면이고, `놓친 계획 정리`와 `회복일 관리`를 나눠 보여준다. 회복일은 오늘뿐 아니라 앞으로의 날짜에도 미리 정할 수 있다.

- 시험·면접·여행 다음날처럼 에너지 소모가 큰 날은 “회복일” 상태로 전환할 수 있다.

- 회복일에는 핵심 목표를 1개 이하로 줄이고 “샤워·산책·내일 준비” 같은 최소 행동을 선택적으로 둔다.

- 다음 날에는 반드시 복귀 플로우를 실행한다. 회복은 무기한 면제가 아니다.

- Recovery 성공 여부와 평균 복귀 시간을 핵심 지표로 기록한다.

## 4.6 실제 사용 기록(Plan vs Actual)

- 분 단위 생활 로그를 강제하지 않는다.

- 자동 수집 우선: Focus 실제 시작/종료, Day 완료, 미룸 횟수, 계획 축소, 회복 선택, 재배치 기록.

- 빈 시간은 회고 시 “무엇을 했나요?”를 카테고리 버튼(식사/이동/휴식/공부/직접입력)으로 보완한다.

- 기본 캘린더는 Plan만 보여주고, 회고/분석 모드에서만 Actual을 겹쳐 보여준다.

- AI는 “계획보다 37분 늦음”보다 “저녁 핵심 Day는 20시 이전에 시작할 때 성공률이 높음” 같은 패턴을 우선한다.

## 4.7 Review — 일/주/월/분기/연 KPT

- 회고 기간에 해당하는 Goal과 Day를 자동으로 모두 보여준다.

- 완료율, Focus 시간, 계획 축소 횟수, 회복일, 복귀 시간 등을 자동 요약한다.

- KPT(Keep / Problem / Try)를 기본 구조로 제공한다. Keep/Problem/Try 각 항목은 필요하면 Goal을 함께 연결할 수 있고, 연결하지 않아도 된다.

- 사용자가 빈 문서에서 시작하지 않도록 AI가 KPT 초안을 제안한다.

- Try 항목은 Day로 바꾸거나 다음 계획·Goal에 연결할 수 있다. 한 가지 방식을 강요하지 않는다.

- 주간 회고의 결론이 다음 주 계획에 실제로 반영되어야 한다.

## 4.8 AI Review Coach

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>AI 코치의 역할</strong></p>
<p>계획을 대신 예쁘게 써주는 AI가 아니라, 실제 행동과 회고를 보고 “다음 계획을 현실적으로 조정”하는 코치.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- 반드시 근거 데이터와 함께 추천한다. 예: “최근 3주 금요일 완료율이 낮음 → 금요일 핵심 Day를 줄여보세요.”

- 완료율이 낮으면 목표 수를 줄이고, 반복 성공하면 다음 단계를 앞당기는 식으로 적응한다.

- 미룸 이유를 학습해 개입 방식을 바꾼다. 폰 → 잠금, 피곤함 → 축소, 방전 → 회복, 외출 → 재배치.

- 코치 강도: 부드럽게 / 단호하게 / 강하게.

- AI의 자동 변경은 금지한다. “추천 → 사용자가 승인/수정 → 적용” 흐름을 기본으로 한다.

## 4.9 AI Goal Breakdown (MVP 이후)

- 연간 Goal을 입력하면 분기 → 월간 → 주간 Goal 후보를 생성한다.

- 현재 수준, 기한, 주당 가용 시간, 우선순위를 입력으로 받는다.

- 주간 실행 데이터를 반영해 하위 목표를 재조정한다.

- 장기 목표의 “이유(Why)”와 제약 조건을 보존한다.

# 5. P형 사용자 친화 UX 규칙

| **UX 규칙**            | **구현 의도**                                                                |
|------------------------|------------------------------------------------------------------------------|
| 시간 엄수 평가 금지    | 정확한 시작 시각보다 시작/완료/복귀 여부를 본다.                             |
| 기본 목표는 적게       | 오늘의 핵심 Day 1개를 가장 강하게 노출하고 나머지는 보너스로 취급할 수 있다. |
| 밀린 일 자동 누적 금지 | 미완료를 다음 날로 무조건 이월하면 과부하가 된다. 재평가 후 이동한다.        |
| 쉬는 날을 상태로 인정  | 회복일은 실패가 아니며 다음 복귀 행동을 함께 예약한다.                       |
| 스트릭보다 복귀        | “14일 연속”보다 “평균 복귀 3.1일 → 0.8일”을 강조한다.                        |
| 개입은 점진적으로      | 알림 반복 → 25분 축소 → 이유 파악 → 재계획/회복 순으로 강도를 바꾼다.        |
| 앱을 열 이유를 만든다  | 홈에서 현재 Goal, 오늘 핵심 Day, 지난 회고의 Try를 한 화면에 연결한다.       |

# 6. AI 코치 개입 로직

| **상황**       | **감지 근거**                                | **코치 행동**                                | **목표**                       |
|----------------|----------------------------------------------|----------------------------------------------|--------------------------------|
| 폰 때문에 미룸 | Day 시작 지연 + 사용자가 “폰 보고 있음” 선택 | 방해 앱 잠금 30~60분 + 15~25분 최소 세션     | 지금 시작                      |
| 피곤함         | “피곤함” 선택 / 연속 실패                    | 90분 → 20~40분으로 축소                      | 최소 목표 완료                 |
| 완전 방전      | “아무것도 하기 싫음” + 큰 일정 직후          | 회복일 전환 + Day 재배치                     | 죄책감 없는 회복 + 다음날 복귀 |
| 밖에 있음      | “밖에 있음” 선택                             | 귀가/다음 가능 시간대로 이동                 | 현실적인 재계획                |
| 계획 과다      | 주간 미완료 누적                             | 낮은 우선순위 삭제/이동 추천                 | 이번 주 핵심만 살리기          |
| 반복 성공      | 3주 이상 높은 완료율                         | 다음 단계/난이도 상향 제안                   | 성장 가속                      |
| 앱 이탈        | 2~3일 미접속                                 | Recovery Mode: 밀린 Day 정리 + 오늘 1개 선택 | 재진입 마찰 최소화             |

**코치 응답 포맷(권장)**

- 관찰: “이번 주 핵심 Day 5개 중 2개를 완료했어요.”

- 해석: “수요일 회복일 이후 목·금 계획량이 그대로 남아 과부하가 생겼어요.”

- 제안: “1개는 다음 주로 이동하고, 오늘은 25분짜리 핵심 Day 하나만 시작해볼까요?”

- 근거: 사용한 데이터/기간을 짧게 표시.

- 행동 버튼: \[적용\] \[수정\] \[무시\].

# 7. 데이터 모델

| **엔티티**        | **핵심 필드**                                                                                 | **역할**                      |
|-------------------|-----------------------------------------------------------------------------------------------|-------------------------------|
| Goal              | id, parentGoalId, type(year/quarter/month/week), title, why, status, period(startDate/endDate), progressMode, continuedFromGoalId? | 목표 계층의 뼈대. 기간은 calendar period에서 파생 |
| Day               | id, goalId?(연결 시 WEEK), title, status, priority(0=NONE~3=HIGH), tagIds[], estimatedMinutes, plannedDate?, planningMode(FIXED/WINDOW/ANYTIME), coreDay, carriedFromDayId?, version | 사용자가 실제로 실행하는 모든 Task. Goal 연결은 선택 |
| DayTag            | id, name, color, sortOrder                                                                    | 생활/업무 영역 Tag (Day와 다대다)  |
| DaySchedule       | id, dayId, startAt, endAt, timezone, version                                                  | Day의 선택적 시간 배치(Day당 0..1). 실제 시작/종료는 FocusSession |
| Event             | id, title, categoryId?(없으면 미분류), allDay, startAt?/endAt?(시각 일정), startDate?/endDateExclusive?(하루 종일 일정), timezone, location?, notes?, recurrence, reminders(최대 5), linkedGoalId?, createdAt, updatedAt, version | 사용자에게 일어나는 일정(Day와 별도) |
| EventOccurrence   | eventId, occurrence 시각(startAt/endAt 또는 startDate/endDateExclusive)                        | 반복 규칙으로 계산한 표시 단위(저장하지 않음) |
| FocusRule         | id, dayId?, mode(blockSelected/allowOnly), selectedTokens, schedule, strictness               | 잠금 정책                     |
| FocusSession      | id, dayId, plannedStart, startedAt, endedAt, interruptionCount, result                        | 실행 로그                     |
| InterventionEvent | id, dayId, type(reminder/reduce/reason/recover), createdAt, response                          | AI 개입 학습 데이터           |
| DailyState        | date, energyLevel?, state(normal/recovery), note                                              | 회복일/컨디션 상태            |
| Review            | id, periodType, startDate, endDate, keep, problem, try, aiDraft, acceptedActions              | KPT 회고                      |
| CoachSuggestion   | id, sourceReviewId?, evidence, actionType, payload, status                                    | AI 추천과 적용 이력           |
| AppSelection      | id, label, opaqueTokens, mode, updatedAt                                                      | FamilyControls 토큰 저장      |

**관계 핵심**

- Goal 1:N Goal (self hierarchy)

- Goal 0..1:N Day (Day의 Goal 연결은 선택. 연결 시 WEEK Goal)

- Day 1:0..1 DaySchedule

- Day 1:N FocusSession

- Day 1:N InterventionEvent

- Review 1:N CoachSuggestion

- Goal 0..1:N Event (Event는 Goal 연결이 선택)

- Event 1:N Reminder

- Event 1:N EventOccurrence (계산값)

- Calendar는 Day + DaySchedule과 EventOccurrence를 함께 그린다. Day와 Event는 직접 연결하지 않고 Goal 연결로 함께 본다.

- Event 종류는 사용자 정의 Category(기본: 일정/생일/면접/시험/마감/약속)를 참조한다. recurrence: NONE / DAILY / WEEKLY / MONTHLY / YEARLY

- Day N:N DayTag (Day 하나에 Tag 여러 개, Tag 하나에 Day 여러 개)

# 8. 상태 설계

## 8.1 Day 상태 머신

| **BACKLOG** | **→** | **PLANNED** | **→** | **DUE** | **→** | **STARTED** | **→** | **DONE** |
|-------------|-------|-------------|-------|---------|-------|-------------|-------|----------|

**분기 상태:** DUE → DEFERRED / REDUCED / RECOVERY_MOVED / SKIPPED. 단, “SKIPPED”는 이유를 남기고 다음 계획 반영 여부를 결정한다.

## 8.2 개입 상태 머신

| **SCHEDULED** | **→** | **NUDGE_1** | **→** | **NUDGE_2** | **→** | **ASK_REASON** | **→** | **ADAPT** | **→** | **START or RECOVER** |
|---------------|-------|-------------|-------|-------------|-------|----------------|-------|-----------|-------|----------------------|

- 사용자가 시작하면 즉시 남은 재촉 알림을 취소한다.

- 같은 문구를 반복하지 않는다. 단계가 올라갈수록 선택지를 바꾼다.

- 개입 횟수와 사용자의 반응을 기록해 향후 개인화에 사용한다.

# 9. iOS 기술 아키텍처

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>권장 방향</strong></p>
<p>iOS MVP는 SwiftUI 네이티브를 권장한다. Screen Time 기능이 FamilyControls / ManagedSettings / DeviceActivity와 여러 Extension으로 구성되어 있어 React Native 브리지를 먼저 만드는 것보다 리스크가 낮다. TypeScript 기반 클라이언트가 꼭 필요하면 2단계에서 React Native 셸 + Swift 네이티브 모듈로 확장한다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **레이어**       | **기술**                                         | **책임**                                                         |
|------------------|--------------------------------------------------|------------------------------------------------------------------|
| App UI           | SwiftUI                                          | Goal / Day / Calendar / Review / Coach                           |
| Local Data       | SwiftData + App Group shared storage             | 오프라인 우선, Screen Time extension과 필요한 상태 공유          |
| App Selection    | FamilyControls                                   | 사용자가 앱/카테고리/웹사이트를 프라이버시 보존 토큰으로 선택    |
| Lock Enforcement | ManagedSettings                                  | 선택 앱 차단 또는 allow-only 방식의 Shield 적용                  |
| Schedule         | DeviceActivity + DeviceActivityMonitor Extension | 예약된 집중 시간 시작/종료에 맞춰 Shield 적용/해제               |
| Shield UI        | ManagedSettingsUI Shield Configuration Extension | 차단 화면의 제목·설명·버튼 구성                                  |
| Shield Action    | Shield Action Extension                          | Shield 버튼 동작 처리                                            |
| Reminders        | UserNotifications                                | 시작 알림, 반복 재촉, 회복/복귀 알림                             |
| Backend          | Supabase/Postgres 또는 경량 API                  | 계정/동기화/AI 요청 저장 — MVP 초기에는 선택                     |
| AI               | 서버 API → LLM                                   | Review Coach / Goal Breakdown. API Key를 앱에 직접 포함하지 않음 |

**Screen Time 핵심 흐름**

| **권한 요청** | **→** | **앱 선택** | **→** | **일정 등록** | **→** | **잠금 시작** | **→** | **Shield** | **→** | **잠금 종료** |
|---------------|-------|-------------|-------|---------------|-------|---------------|-------|------------|-------|---------------|

**기술 검증 포인트**

- FamilyControls는 개인 사용자(individual)가 본인 기기에서 직접 승인할 수 있다.

- ManagedSettings로 앱/웹사이트에 Shield를 적용할 수 있고, 모든 카테고리를 가린 뒤 지정 앱을 예외로 두는 정책을 구성할 수 있다.

- DeviceActivitySchedule은 정해진 시간 구간의 시작/종료에 맞춰 extension 코드를 실행할 수 있다.

- App Store 배포 전 Family Controls entitlement 배포 승인이 필요하며, 앱뿐 아니라 사용하는 Screen Time extension도 함께 관리해야 한다.

- Time Sensitive 알림은 즉시 표시되고 일부 Focus 제어를 통과할 수 있지만, 사용자가 해당 권한을 끌 수 있다.

## 9.1 실제 앱 사용 데이터에 대한 설계 원칙

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>한국 MVP에서 특히 중요</strong></p>
<p>AI Review Coach를 “타 앱의 원시 사용내역”에 의존시키지 않는다. iOS는 개인정보 보호 때문에 DeviceActivityReport를 샌드박스된 확장에서 표시하며, 최신 비토큰화 App/Website Usage 데이터 접근은 현재 Apple 문서상 EU 고객 설치에 지역 제한이 있다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- AI의 1차 데이터: 우리 앱이 직접 기록한 Focus 세션, Day 상태, 개입 응답, 회복일, 재배치, KPT.

- 2차 데이터: Screen Time의 프라이버시 보존 보고서를 사용자에게 시각화하는 용도.

- 사용자가 직접 “폰 보고 있었음” 같은 원인을 고르면 해당 카테고리를 코치 데이터로 사용한다.

- 향후 OS/지역 정책이 허용되면 더 깊은 사용 데이터 연동을 별도 capability로 확장한다.

# 10. 개발 순서와 완료 기준

| **단계**                 | **구현 범위**                                                                                     | **완료 기준**                                     |
|--------------------------|---------------------------------------------------------------------------------------------------|---------------------------------------------------|
| 0\. Screen Time 기술 POC | FamilyControls 권한 → FamilyActivityPicker → 특정 앱 Shield → 예약 시작/종료까지 독립 샘플로 검증 | 선택 앱이 실제로 가려지고 예약 종료 시 자동 해제  |
| 1\. Goal 도메인          | 연/분기/월/주 Goal + parentGoalId + Why + 진행률                                                  | 상위/하위 목표 생성·수정·조회 가능                |
| 2\. Day + Calendar       | Day 생성, 날짜 미지정, 주간/리스트 뷰, 드래그 시간 배치, 일정 취소                                | Goal → Day → Calendar 흐름이 끊기지 않음          |
| 3\. Focus Lock 통합      | Day ↔ FocusRule 연결, allow-only/selected block, Morning Lock                                     | Day에서 집중 시작하면 즉시 잠금되고 종료 시 해제  |
| 4\. 시작 개입            | 시작 알림, 10분 단위 재촉, “왜 못 하고 있나요?” 이유 선택                                         | 미시작 상태가 단계별로 변화하고 시작 시 알림 취소 |
| 5\. Recovery Mode        | 회복일, 밀린 Day 재분배, 오늘 핵심 1개, 다음날 복귀                                               | 하루 망쳐도 다음날 과부하 없이 다시 시작 가능     |
| 6\. Review               | 일/주/월/분기/연 KPT + 해당 Goal/Day 자동 집계                                                    | 회고가 실제 기간 데이터를 자동 포함               |
| 7\. Analytics            | 복귀 시간, 축소 횟수, Focus 시간, 핵심 Day 성공률                                                 | Review에서 패턴을 볼 수 있음                      |
| 8\. AI Review Coach      | 근거 기반 KPT 초안 + 다음 행동 추천 + 적용 버튼                                                   | 추천 근거가 보이고 Goal/Day/FocusRule로 반영 가능 |
| 9\. AI Goal Breakdown    | 연간 목표 → 하위 목표 추천, 가용시간·기한 반영                                                    | 사용자 승인 후 목표 트리 생성                     |
| 10\. Sync/Account        | 백엔드 동기화, 다중 기기, 백업                                                                    | 로컬 우선 UX를 깨지 않고 동기화                   |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>개발 순서 핵심</strong></p>
<p>AI보다 먼저 “Recovery가 실제로 잘 작동하는가”를 검증한다. AI는 좋은 데이터 구조 위에 얹어야 강해진다. 초기에는 규칙 기반 코치로도 충분히 제품 감각을 검증할 수 있다.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 11. MVP 범위 / 이후 확장

| **구분**         | **내용**                                                                                                        |
|------------------|-----------------------------------------------------------------------------------------------------------------|
| MVP 필수         | Goal 계층(연간/분기/월간/주간 View + drill-down), Day(Goal 연결 선택 + Tag + priority), Days Inbox, 주/3일/하루·리스트 Calendar, Focus Lock, 허용 앱, 시작 재촉, Recovery Mode(그대로 두기/줄이기/날짜 변경/이어가기/내려놓기 + 회복일 관리), 주간/일간 KPT, 로컬 데이터, Event(일정) + Events 화면 + Category + Calendar 통합 표시 + 최소 반복 + Goal 연결 + Event reminder(기기 알림 실행은 Mobile 단계) |
| MVP+             | 월/분기/연 회고, Morning Lock 루틴, 기본 통계, 코치 강도, 일정 기반 가용 시간 계산                               |
| AI 1차           | 주간 AI Review Coach + 근거 + 추천 적용, Event를 고려한 Day 배치 추천                                            |
| AI 2차           | 연간 Goal Breakdown, 개인화된 개입 간격/강도                                                                    |
| 나중에           | Android, 소셜/친구 기능, PC 차단, 팀 목표, 공개 커뮤니티, Apple/Google Calendar 연동, 루틴/습관 도메인과 반복 Day, 우선순위 매트릭스 |
| 이번 사이클 제외 | 로그인/멀티유저, 루틴·습관·반복 Day, 우선순위 매트릭스, AI 자동 스케줄링, 외부 캘린더 동기화 확장, Focus/재촉 구현 확장 (Event 반복은 기존대로 유지) |
| 지금 만들지 않기 | 복잡한 습관 트래커, 분 단위 라이프로그 강제, 지나치게 많은 뱃지/스트릭, 채팅형 AI를 홈의 중심으로 두기          |

# 12. 핵심 지표

| **지표**                  | **정의**                                                          | **의미**                        |
|---------------------------|-------------------------------------------------------------------|---------------------------------|
| Recovery Time             | 계획 이탈/미접속 이후 다음 핵심 Day를 다시 시작하기까지 걸린 시간 | 가장 중요한 북극성 후보         |
| Weekly Goal Survival Rate | 주 중 하루 이상 크게 무너져도 주간 핵심 Goal을 달성한 비율        | “하루 망함 → 주 전체 망함” 개선 |
| Core Day Start Rate       | 오늘 핵심 Day가 실제로 시작된 비율                                | 실행력                          |
| Focus Conversion          | 재촉 알림 후 Focus 시작으로 전환된 비율                           | 개입 효과                       |
| Plan Reduction Success    | 목표 축소 후 최소 행동을 완료한 비율                              | 현실적 재계획 품질              |
| Review → Action Rate      | 회고 Try가 다음 Goal/Day/FocusRule로 반영된 비율                  | 회고의 실효성                   |

# 13. 기술 리스크와 제약

| **리스크**                   | **문제**                                                             | **대응**                                               |
|------------------------------|----------------------------------------------------------------------|--------------------------------------------------------|
| Family Controls 배포 승인    | App Store 배포 전 entitlement 승인 필요                              | POC와 entitlement 요청을 개발 초기에 진행              |
| iOS 알림 제약                | 백그라운드 앱이 임의로 전체 화면을 강제 표시할 수 없음               | Time Sensitive 알림 + 앱 내 개입 + Shield 활용         |
| 원시 Screen Time 데이터 제한 | 한국에서 AI 서버로 타 앱 사용 데이터를 그대로 가져오는 설계는 제한적 | 우리 앱 이벤트 중심 AI 설계                            |
| 과도한 재촉 피로             | 10분마다 같은 알림은 사용자가 꺼버릴 수 있음                         | 단계형 개입 + 개인화 + 강도 설정                       |
| AI 과잉 자동화               | AI가 일정/목표를 마음대로 바꾸면 신뢰 하락                           | 추천 후 승인 방식                                      |
| 기능 과대화                  | Goal/Calendar/Lock/Review/AI가 한꺼번에 복잡해질 수 있음             | 홈은 “이번 Goal / 오늘 핵심 Day / 지금 할 행동”만 유지 |

# 14. Apple 공식 참고자료

- [<u>Family Controls</u>](https://developer.apple.com/documentation/familycontrols)

- [<u>AuthorizationCenter.requestAuthorization(for:)</u>](https://developer.apple.com/documentation/familycontrols/authorizationcenter/requestauthorization(for:))

- [<u>Managed Settings</u>](https://developer.apple.com/documentation/managedsettings)

- [<u>ShieldSettings.applicationCategories</u>](https://developer.apple.com/documentation/managedsettings/shieldsettings/applicationcategories-swift.property)

- [<u>Device Activity</u>](https://developer.apple.com/documentation/deviceactivity)

- [<u>DeviceActivityReport</u>](https://developer.apple.com/documentation/deviceactivity/deviceactivityreport)

- [<u>Requesting the Family Controls entitlement</u>](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement)

- [<u>Time Sensitive notifications</u>](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/timesensitive)

- [<u>Family Controls App and Website Usage</u>](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.family-controls.app-and-website-usage)

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>최종 제품 정의</strong></p>
<p>계획을 잘 지키는 사람을 위한 플래너가 아니다. 계획을 세우고 자주 무너지지만, 목표를 포기하고 싶지는 않은 사람을 “다시 시작 가능한 상태”로 계속 데려오는 Goal &amp; Recovery Coach.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>
