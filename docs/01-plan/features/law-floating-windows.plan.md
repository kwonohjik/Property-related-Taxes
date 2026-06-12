# law-floating-windows Planning Document

> **Summary**: `/law` 조문 조회창을 "바깥 클릭 시 사라지는 단일 모달"에서 **여러 개를 동시에 띄우고 자유 이동·크기 조절하며 닫을 때까지 항상 위에 떠 있는 플로팅 창**으로 전환 — 여러 참조 조문을 상호 참조하며 검토하는 워크플로 지원
>
> **Project**: korean-tax-calc
> **Version**: 0.1.0
> **Author**: kwonohjik
> **Date**: 2026-06-12
> **Status**: Draft
> **선행**: law-research-v2/v3(ArticleModal 도입·v4.4 고도화), PR #152·#154(조문 표시·표 렌더)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 `ArticleModal`은 단일 인스턴스 + 백드롭(`bg-black/40`) 모달이라, ① 바깥을 클릭하면 즉시 닫히고 ② 한 번에 하나만 볼 수 있어 여러 조문을 나란히 비교·상호 참조할 수 없다. 세법 검토는 한 조문이 다른 조문(시행령·타 조문)을 줄줄이 인용하므로 동시 열람이 필수 |
| **Solution** | 백드롭 제거 + 다중 플로팅 창 시스템 도입. 전역 창 스토어(zustand)가 열린 창 배열을 관리하고, 모든 진입점이 `openLawWindow()`를 호출. 각 창은 헤더 드래그로 이동·모서리 드래그로 크기 조절·항상 최상단(z-index)·클릭 시 맨 앞으로. 사용자가 ✕로 닫을 때까지 유지 |
| **Function/UX Effect** | 소득세법 §55를 열어둔 채 §13·§59의2를 추가로 띄워 나란히 비교. 페이지는 계속 인터랙티브(백드롭 없음) — 창을 띄운 채 검색·판례 탐색 가능. "모두 닫기" 한 번에 정리, 창 최소화로 화면 정돈, 개수 상한으로 무한 누적 방지 |
| **Core Value** | "한 화면에서 여러 법령·판례를 교차 검토"라는 `/law`의 핵심 가치를, 단일 모달 한계를 풀어 완성 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 사용자 지시: 조회창이 다른 곳 클릭 시 사라짐 → 닫을 때까지 항상 위·여러 개 동시. "여러 참조 조문을 상호 참조하며 검토할 일이 많다" |
| **WHO** | 조문 간 인용 관계를 따라가며 검토하는 세무 실무자·리서처 |
| **RISK** | 드래그/리사이즈 직접 구현(외부 라이브러리 미사용 원칙) 시 포인터 이벤트·뷰포트 클램프·z-index 관리 버그. 모바일에서 플로팅 창 조작 난해 → 반응형 폴백 필요. zustand selector 무한 루프(memory `feedback_zustand_selector`) |
| **SUCCESS** | (1) 동시 N개 창 열림 (2) 바깥 클릭으로 안 닫힘 (3) 헤더 드래그 이동·모서리 리사이즈 (4) 클릭 시 맨 앞 (5) 모두 닫기·최소화·개수 상한 (6) 모든 진입점에서 창 생성 (7) E2E로 다중 창·비-소멸·드래그 검증 |
| **SCOPE** | `/law` 페이지 조문 창 한정. 엔진(`lib/tax-engine/`)·세금 계산 무관. `components/ui/law-article-modal.tsx`(계산기 마법사용 별개 모달)는 **대상 아님** |

---

## 1. 현행 동작 (코드 실측)

### 1.1 단일 모달 구조

`app/law/_components/ArticleModal.tsx:64-131`:
- 백드롭 `<div className="fixed inset-0 z-50 ... bg-black/40" onClick={onClose}>` → **바깥 클릭 시 닫힘**(:70).
- 내부 패널 `onClick={(e) => e.stopPropagation()}`(:74), `max-h-[80vh] w-full max-w-2xl`(:73) — 위치·크기 고정, 화면 중앙.
- `role="dialog" aria-modal="true"`(:66-67) — 모달(페이지 비활성).
- 본문: `LawArticleBody`(:108, 표 렌더) + 법제처 원문 링크(:109-118) + `ArticleImpactMap`(:120). 조문 fetch는 `useEffect`(:33-54)로 자체 수행.

### 1.2 진입점 (3곳 — 전부 단일 인스턴스)

| 진입점 | 위치 | 현재 동작 |
|---|---|---|
| 통합검색 라우팅(get_law_text·impact_map) | `LawResearchClient.tsx:18-37, 108-113` | 단일 `articleModal` state(객체 1개), `setArticleModal` 으로 교체(새로 열면 기존 사라짐) |
| 참조조문 칩(판례 탭) | `RefLawChip.tsx:13, 41-47` | 칩마다 로컬 `open` state로 자체 `<ArticleModal>` 1개 |
| (impact_map autoImpact) | `LawResearchClient.tsx:37` | 위 통합검색과 동일 경로 |

→ 어느 경로든 **동시에 하나만**, 그리고 RefLawChip은 칩별 독립 인스턴스라 z-index·관리 일관성 없음.

### 1.3 재사용 자산

- `LawArticleBody`(표 렌더)·`CurrentLawBadge`([현행])·`ArticleImpactMap`(영향 분석) — 창 본문에 그대로 재사용.
- `LawResearchClient`(client component) — `LawWindowLayer` 1회 마운트 지점(§2.1). (Provider 불필요 — zustand 전역)
- zustand 스토어 다수(`lib/stores/`) — 동일 패턴으로 창 스토어 작성.

---

## 2. 설계 (확정 — 인터뷰 반영)

인터뷰 결정: **자유 이동 플로팅 창 / 이동+크기조절 / 모든 진입점 다중 창 / "모두 닫기"·최소화·개수 상한**.

### 2.1 아키텍처

```
lib/stores/law-window-store.ts        # zustand — 열린 창 배열 + 액션(단일 진실)
app/law/_components/
  LawWindowLayer.tsx                  # 모든 창 + 관리 도크를 렌더(레이어 1회 마운트)
  LawWindow.tsx                       # 개별 플로팅 창(드래그·리사이즈·포커스·최소화·닫기)
  LawArticleContent.tsx              # ArticleModal 본문 추출(fetch + LawArticleBody + impact) — 재사용
  useDragResize.ts                    # 포인터 이벤트 훅(이동·리사이즈, 뷰포트 클램프)
```

- `LawWindowLayer`를 `LawResearchClient` JSX 끝(fixed 포지셔닝이라 위치 무관)에 **1회** 마운트. **zustand는 React Context Provider 불필요** — 모듈 전역 스토어라 RefLawChip(DecisionSearchTab 내부)·LawResearchClient 어디서든 `useLawWindowStore`로 직접 접근. Layer 컴포넌트만 1회 렌더하면 됨.
- 기존 `ArticleModal`은 본문을 `LawArticleContent`로 추출 후 **창 셸로 대체**. (RefLawChip·LawResearchClient는 직접 모달을 렌더하지 않고 스토어 액션만 호출 → 레이어가 렌더)

### 2.2 창 스토어 (zustand)

```ts
interface LawWindow {
  id: string;                 // `${lawName}:${articleNo}` (dedup 키) — 안정적, Math.random 미사용
  lawName: string;
  articleNo: string;
  autoImpact?: boolean;
  x: number; y: number;       // 좌상단 위치(px)
  w: number; h: number;       // 크기(px)
  z: number;                  // 스택 순서(클릭 시 최대+1)
  minimized: boolean;
}
interface LawWindowState {
  windows: LawWindow[];
  topZ: number;
  open(p: {lawName; articleNo; autoImpact?}): void;   // dedup → 있으면 focus, 없으면 추가(오프셋 cascade 초기위치)
  close(id): void;
  closeAll(): void;
  focus(id): void;                                     // z = ++topZ
  move(id, x, y): void;
  resize(id, w, h): void;
  toggleMinimize(id): void;
}
```

설계 결정:
| 결정 | 근거 |
|---|---|
| **dedup 키 = lawName:articleNo** | 같은 조문 중복 창 방지 — 이미 열려 있으면 새로 만들지 않고 focus(맨 앞으로). (중복 허용보다 실용적. id에 Date.now/random 금지 → 이력 dedup 정책 `project_calc_history_dedup_id_normalization`과 일치). ⚠ 엣지: get_law_text(autoImpact=false)로 연 창을 impact_map(autoImpact=true)으로 재오픈 시 → focus만 하지 말고 **영향 분석 재실행 트리거**(open이 기존 창에 autoImpact 신호 전달) |
| **초기 위치 = cascade 오프셋** | 새 창은 직전 창 +(28,28)px 누적, 뷰포트 벗어나면 wrap. 첫 창은 화면 약간 우상단 |
| **개수 상한 MAX=8** | 초과 시 **생성 순서상 가장 오래된 창(`windows[0]`) 자동 닫힘**. 주의: "오래된"은 **생성 순서**(배열 선두)이지 z-순서(포커스)가 아님 — focus는 z만 바꾸고 배열 순서는 보존하므로 `windows[0]`이 항상 최초 생성 창. 무한 누적 방지 |
| **z-index 베이스** | 앱 헤더가 `sticky top-0 z-50`(app/layout.tsx:68) 실측 → 창 base **z-1000~** 이면 안전하게 위. 클릭 시 `++topZ`. 백드롭 없음 → 페이지 인터랙티브 유지. ※ 트레이드오프: 창을 화면 최상단으로 끌면 sticky 헤더를 덮음(요구사항 "항상 위" 부합). 현 ArticleModal은 z-50으로 헤더와 동률이라 본 개선이 더 명확 |
| **상태 영속 안 함** | 창은 메모리만. 페이지 이탈 시 소멸(요구사항에 영속 없음). zustand persist 미사용 |
| **selector 무한 루프 방지** | 컴포넌트는 atomic selector(`useStore(s => s.windows)`)/`useShallow`/액션 분리 구독. 새 객체 반환 selector 금지(memory `feedback_zustand_selector`) |

### 2.3 LawWindow (플로팅 창)

- **컨테이너**: `position: fixed`, `left/top/width/height` 인라인 스타일(스토어 값), `z-index`(스토어 z), `box-shadow`로 떠 있는 느낌. 백드롭 **없음**.
- **헤더**: 제목(`{lawName} {articleNo}` + [현행]) + 최소화(▁)·닫기(✕) 버튼. `onPointerDown`에서 드래그 시작 + focus. 버튼 영역은 드래그 제외.
- **본문**: `LawArticleContent`(스크롤 `overflow-auto`). 최소화 시 본문 숨김(헤더만, 높이 축소).
- **리사이즈 핸들**: 우하단 모서리 `onPointerDown` → resize. (최소 크기 clamp: 280×160)
- **포커스**: 창 어디든 `onPointerDown` 시 `focus(id)` → z 최상단.
- **a11y**: `role="dialog" aria-modal="false"`(비모달), `aria-label`. ESC → **최상단(topZ) 창** 닫기. 포커스 트랩 없음(비모달이라 페이지 이동 자유).

### 2.4 useDragResize (포인터 이벤트, 외부 라이브러리 없음)

- `pointerdown` → `setPointerCapture` → `pointermove`로 delta 적용 → `pointerup` 해제.
- **뷰포트 클램프**: 창이 화면 밖으로 완전히 나가지 않게(헤더 최소 노출 유지). resize는 최소/최대(뷰포트) clamp.
- 이동·리사이즈 중에는 본문 텍스트 선택 방지(`user-select: none`).
- `Date.now()`/`Math.random()` 미사용(스토어 id는 lawName:articleNo). 좌표는 포인터 이벤트 값.

### 2.5 관리 도크 (LawWindowLayer 하단/상단)

- 열린 창 ≥1일 때만 표시. 작은 바: "조문 창 N개" + **"모두 닫기"** 버튼.
- **최소화는 "제자리 접기"로 단일화**: 최소화 시 창은 위치 그대로 유지하되 본문 숨기고 **헤더 바만**(제목 + 복원·닫기). 복원은 헤더의 복원(▢) 버튼 클릭. → §2.3과 일치, 도크에 칩 중복 표시 안 함(공간 기억 보존). 도크는 개수 + 모두 닫기 전용.
- 단축키(선택): ESC=최상단 닫기. (전역 단축키 충돌 주의 — `/law` 페이지 한정)

### 2.6 반응형 폴백 (모바일)

- 좁은 화면(`< sm`, ~640px): 플로팅 드래그가 비실용 → **단일 전체폭 바텀시트**로 폴백. 창 스토어는 그대로 두되, 레이어가 모바일에서는 최상단(topZ) 창 1개만 전체폭 시트로 렌더. 여러 창이 열려 있으면 시트 상단에 **창 전환 탭 스트립**(열린 창 제목 가로 나열, 탭 클릭=focus로 전환). 드래그·리사이즈 비활성.
- 데스크톱(`>= sm`): 플로팅 다중 창.

---

## 3. Scope

### 3.1 In Scope

- [ ] **FR-1** `law-window-store.ts` — 창 배열 + open(dedup·cascade·MAX)·close·closeAll·focus·move·resize·toggleMinimize
- [ ] **FR-2** `LawArticleContent.tsx` — 현 ArticleModal 본문(fetch + 로딩/에러/없음 + LawArticleBody + 원문링크 + ArticleImpactMap) 추출
- [ ] **FR-3** `LawWindow.tsx` — 플로팅 창 셸(헤더 드래그·모서리 리사이즈·포커스·최소화·닫기·a11y)
- [ ] **FR-4** `useDragResize.ts` — 포인터 이벤트 이동/리사이즈 + 뷰포트 클램프(외부 라이브러리 없음)
- [ ] **FR-5** `LawWindowLayer.tsx` — 전 창 렌더 + 관리 도크("조문 창 N개"·"모두 닫기" 전용, 칩 없음) + 반응형 폴백. `LawResearchClient`에 1회 마운트
- [ ] **FR-6** 진입점 전환 — `LawResearchClient`(get_law_text·impact_map)·`RefLawChip` 가 `useLawWindowStore().open()` 호출. 단일 `articleModal` state(LawResearchClient.tsx:18-37, 108-113) 제거. ⚠ `openingArticlePopup` 플래그(LawResearchClient.tsx:43)는 **인라인 자동조회 억제** 용도로 계속 필요(get_law_text·impact_map가 창으로 가면 탭 인라인은 안 띄움) → 의미 유지, 이름만 유지하거나 `routesToWindow`로 명확화
- [ ] **FR-7** 백드롭 제거 — 바깥 클릭 비소멸. 페이지 인터랙티브 유지. **a11y/호환**: LawWindow는 `role="dialog"`(aria-modal=false) 유지 — 기존 E2E의 `getByRole("dialog")` 셀렉터 호환
- [ ] **FR-8** 테스트 — (a) 스토어 단위(open/dedup/close/closeAll/focus/MAX oldest-evict/minimize/move·resize clamp) (b) 신규 E2E(다중 창 동시·바깥클릭 비소멸·헤더 드래그 이동·모두 닫기) (c) **기존 law E2E 4종 호환 회귀**: `law-article-popup`(특히 POPUP-2의 `Escape`→`toBeHidden` → ESC=최상단 창 닫기로 유지)·`law-article-table-render`·`law-article-table-html`·`law-impact-map` 전부 `getByRole("dialog")` + 본문 단정에 의존 → LawWindow가 role=dialog + 동일 본문(LawArticleContent) 유지로 무수정 통과 보장. 통과 안 되면 셀렉터 보정

### 3.2 Out of Scope

- 계산기 마법사용 `components/ui/law-article-modal.tsx` 전환 (별개 컴포넌트·별개 API)
- 창 위치·크기 영속(localStorage) — 후속 후보
- 창 스냅/타일링(좌우 자동 정렬), 탭 그룹화 — 후속 후보
- 판례 본문 창화(현재 판례는 탭 인라인) — 본 작업은 조문 창 한정

---

## 4. 변경/신규 파일 (예상)

| 파일 | 변경 | 규모 |
|---|---|---|
| `lib/stores/law-window-store.ts` | 신규 | ~90줄 |
| `app/law/_components/LawArticleContent.tsx` | 신규(ArticleModal 본문 추출) | ~90줄 |
| `app/law/_components/LawWindow.tsx` | 신규 | ~120줄 |
| `app/law/_components/useDragResize.ts` | 신규 | ~90줄 |
| `app/law/_components/LawWindowLayer.tsx` | 신규 | ~80줄 |
| `app/law/_components/ArticleModal.tsx` | 제거 또는 LawWindow로 대체 | - |
| `app/law/_components/LawResearchClient.tsx` | articleModal state→store, Layer 마운트 | ~-15/+10 |
| `app/law/_components/RefLawChip.tsx` | 로컬 모달→store.open | ~-10 |
| `__tests__/korean-law/law-window-store.test.ts` | 신규 | ~80줄 |
| `e2e/law-floating-windows.spec.ts` | 신규 | ~70줄 |

신규 API·DB·엔진 없음. 전 파일 800줄 정책 여유.

---

## 5. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 드래그/리사이즈 포인터 버그(빠른 이동 시 끊김·창 밖 이탈) | `setPointerCapture` + move/up 핸들러 정리. 뷰포트 클램프(헤더 최소 노출). Pre-Do anchor로 스토어 move/resize 클램프 단위 검증 |
| zustand selector 무한 루프 | atomic selector·useShallow·액션 분리. 새 객체 반환 금지(memory `feedback_zustand_selector`) |
| 모바일 플로팅 비실용 | `< sm` 단일 바텀시트 폴백(드래그 비활성) |
| z-index가 헤더/푸터/토스트와 충돌 | **실측 해소**: 앱 헤더 `sticky z-50`(app/layout.tsx:68) → 창 base z-1000~로 안전. 토스트/다이얼로그 z 사용처 Do 단계 grep 재확인 |
| 비모달 전환으로 a11y 후퇴 | `aria-modal="false"` + 창별 `role="dialog"` + ESC=최상단 닫기 + 닫기 버튼 명시 |
| 동시 세션 master 경합 | 격리 worktree(`wt-new.sh`)에서 커밋(memory `feedback_external_concurrent_edit_stale_read`) |

---

## 6. Success Criteria

1. 통합검색·참조조문 칩·영향분석에서 조문을 열면 플로팅 창 생성, **바깥 클릭해도 안 닫힘**.
2. 동시 여러 창(예: §55·§13·§59의2) 열림, 헤더 드래그로 이동·모서리로 크기 조절, 클릭 시 맨 앞.
3. "모두 닫기"로 일괄 정리, 창 최소화→제자리 헤더만 접힘→복원(▢), 8개 초과 시 가장 오래된 창 자동 닫힘.
4. 같은 조문 재오픈 시 중복 없이 기존 창 focus.
5. 모바일에서 단일 시트 폴백 동작.
6. 스토어 단위 + E2E(다중·비소멸·드래그·모두 닫기) 통과, `npm run check:pre-pr` 통과, korean-law 회귀 0.

---

## 7. 다음 단계 (PDCA)

1. **Pre-Do anchor**: 스토어 `open`(dedup·cascade·MAX oldest-close)·`focus`(z)·`move/resize`(clamp) 단위 1건 우선 작성·실행 → 설계 환류 (memory `feedback_pre_anchor_verification`).
2. **Do 순서**: 스토어(FR-1) → 본문 추출(FR-2) → useDragResize(FR-4) → LawWindow(FR-3) → Layer+도크(FR-5) → 진입점 전환·백드롭 제거(FR-6·7) → 테스트(FR-8).
3. **격리 worktree**에서 단일 브랜치 1 PR.
4. 후속 후보: 위치·크기 영속(localStorage), 스냅/타일링, 판례 창화.
