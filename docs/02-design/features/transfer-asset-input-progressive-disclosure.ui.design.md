# UI 디자인 — 양도세 자산입력 점진적 노출 (접기 섹션)

> 짝 계획서: [`docs/00-pm/transfer-asset-input-progressive-disclosure.plan.md`](../../00-pm/transfer-asset-input-progressive-disclosure.plan.md)
> 범위: `components/calc/transfer/CompanionAssetCard.tsx`(732줄) UI 재구성. 엔진·API·validate 무변경(14지점 중 ⑤만).
> 본 문서 = "how"(상태별 레이아웃·tone 리터럴·컴포넌트 계약·자동노출 매트릭스). "what/why"·실측 인벤토리·Phase·리스크는 계획서.

---

## 1. 화면 상태별 레이아웃 (ASCII)

### 1-A. 전부 접힘 진입 (기본 — §4-5)

```
┌ 자산 1 — 토지 ────────────────────────────────[삭제]┐
│ ① 기본 · ② 양도 · ③ 취득 · ④ 경비          ← 칩바(비-sticky) │
├──────────────────────────────────────────────────────┤
│ ▸ ① 기본정보   토지·농지 · 제주 효돈동 628-2 · 면적 입력됨 │
│ ▸ ② 양도정보   일반양도                                │
│ ▸ ③ 취득정보   매매 · 환산취득가                        │
│ ▸ ④ 필요경비   미입력                                  │
└──────────────────────────────────────────────────────┘
[＋ 자산 추가]   (다건 모드만)
```
- 헤더 요약 = **라벨 + 입력여부**, 금액 없음(금액 합계는 우측 사이드바=단일 진실).
- ⑤ 기타특례는 적용 자산(land+NBL판정 / housing·RTMI)일 때만 행·칩 추가.

### 1-B. ③ 펼침 (클릭 — 나머지는 요약 유지)

```
│ ▸ ① 기본정보   토지·농지 · 제주 효돈동 · 면적 입력됨    │
│ ▸ ② 양도정보   일반양도                                │
│ ▾ ③ 취득정보 ─────────────────────────────────────────│
│     취득원인 [매매]   취득일 [1988-12-03]              │
│     취득가액 산정 [환산취득가]                          │
│     ┌ 취득시 기준시가 (amber 내부 카드) ────────────┐  │
│     │ ㎡단가 · 면적 · 공시가격 …                     │  │
│     └────────────────────────────────────────────┘  │
│     ▸ 1990.8.30 이전 토지등급 환산 (내부 블록 그대로)  │
│ ▸ ④ 필요경비   미입력                                  │
```
- 내부 블록(환산·1990 등)은 **기존 구조 그대로** — group-level 접기만 추가(③ 내부 2차 접기는 §9 후속).
- 내부 블록 번호(원형 `h-5 text-[10px]`)와 아코디언 번호(굵은 제목+큰 배지)는 **시각 구분**(M1).

### 1-C. 겸용주택 토글 ON → ③ 자동 펼침 (G7·H3)

```
│ ▾ ① 기본정보 ─────────────────────────────────────────│
│     자산종류 [주택]                                    │
│     [✓] 겸용주택(상가 포함) 분리계산    ← 토글 ON       │
│ … (②) …                                               │
│ ▾ ③ 취득정보   ← 토글이 노출한 "겸용 확장 패널"이 ③에  │
│     있으므로 자동 펼침. "토글 켰는데 변화 없음" 방지     │
│     ┌ 겸용주택 4부분 분리 (MixedUseExpandedPanel) ───┐ │
```

### 1-D. 검증 오류 → 5개 전부 forceOpen (H2·G5)

```
┌ 자산 1 — 토지 ────────────────────────────────[삭제]┐
│ ⚠ 취득일은 양도일보다 빠를 수 없습니다  ← 상단 배너 유지 │
│ ① 기본 · ② 양도 · ③ 취득 · ④ 경비                     │
├──────────────────────────────────────────────────────┤
│ ▾ ① 기본정보 …  (forceOpen)                            │
│ ▾ ② 양도정보 …  (forceOpen)                            │
│ ▾ ③ 취득정보 …  (forceOpen — 오류 필드 포함)           │
│ ▾ ④ 필요경비 …  (forceOpen)                            │
└──────────────────────────────────────────────────────┘
  → 펼침 commit 후 scrollToAssetCard()로 카드 스크롤(C1)
```
- `ValidationIssue`에 section 키 없음(L24,30) → **전체 펼침이 정확한 MVP**. 정밀 매핑은 §9 후속.

### 1-E. 모바일 칩바 (가로 넘침)

```
┌─ HorizontalScrollContainer ──────────────────┐
│ ① 기본 · ② 양도 · ③ 취득 · ④ 경비 · ⑤ 특례 →│  (가로 스크롤)
└──────────────────────────────────────────────┘
```
- macOS 스크롤바 자동숨김 회피 = `HorizontalScrollContainer`(`feedback_macos_scrollbar_autohide_workaround`).

---

## 2. `AssetSection` 컴포넌트 계약

```tsx
// components/calc/transfer/AssetSection.tsx
interface AssetSectionProps {
  num: number;                       // ①②③④⑤
  title: string;
  tone: "sky" | "emerald" | "amber" | "slate" | "violet";
  summary: string;                   // 접힘 시 헤더 라벨(금액 없음)
  status: "filled" | "empty";        // presence 점(✓/○) — "유효" 아님
  open: boolean;
  onToggle: () => void;
  forceOpen?: boolean;               // 검증 오류 시 전체 true
  children: React.ReactNode;
}
```

동작·a11y:
- 본문 렌더: `(open || forceOpen)`. 접힘 시 `className="hidden print:block"`(인쇄 자동 펼침).
- 헤더 = `<button type="button" aria-expanded={open || forceOpen} onClick={onToggle}>`. 키보드 토글 기본 지원.
- 칩 클릭으로 펼친 직후 섹션 **첫 포커서블로 focus 이동**.
- 내부에 `ExpandToggleButton`(`stopPropagation`)이 중첩될 수 있으므로 헤더 클릭 영역과 분리.
- 상태(`open`)는 부모 로컬 `useState` — **store 미러링·useEffect 금지**.

---

## 3. tone 리터럴 Record (M2 — dynamic `bg-${tone}` 금지)

`CollapsibleHintCard.HINT_CARD_TONE`와 동일 컨벤션. 전 슬롯 **리터럴 문자열**(JIT purge 안전), 다크 변형 포함.

```ts
const SECTION_TONE: Record<Tone, {
  card: string; border: string; badgeBg: string; badgeText: string; title: string;
}> = {
  sky:     { card:"bg-sky-50/40 dark:bg-sky-900/15",     border:"border-sky-200 dark:border-sky-800",
             badgeBg:"bg-sky-200 dark:bg-sky-800",       badgeText:"text-sky-800 dark:text-sky-100",   title:"text-sky-900 dark:text-sky-100" },
  emerald: { card:"bg-emerald-50/40 dark:bg-emerald-900/15", border:"border-emerald-200 dark:border-emerald-800",
             badgeBg:"bg-emerald-200 dark:bg-emerald-800", badgeText:"text-emerald-800 dark:text-emerald-100", title:"text-emerald-900 dark:text-emerald-100" },
  amber:   { card:"bg-amber-50/40 dark:bg-amber-900/15", border:"border-amber-200 dark:border-amber-800",
             badgeBg:"bg-amber-200 dark:bg-amber-800",   badgeText:"text-amber-800 dark:text-amber-100", title:"text-amber-900 dark:text-amber-100" },
  slate:   { card:"bg-slate-50/40 dark:bg-slate-800/20", border:"border-slate-200 dark:border-slate-700",
             badgeBg:"bg-slate-200 dark:bg-slate-700",   badgeText:"text-slate-800 dark:text-slate-100", title:"text-slate-900 dark:text-slate-100" },
  violet:  { card:"bg-violet-50/40 dark:bg-violet-900/15", border:"border-violet-200 dark:border-violet-800",
             badgeBg:"bg-violet-200 dark:bg-violet-800", badgeText:"text-violet-800 dark:text-violet-100", title:"text-violet-900 dark:text-violet-100" },
};
```

그룹↔tone: ① sky · ② emerald · ③ amber · ④ slate(중립 종결) · ⑤ violet.

---

## 4. 섹션별 요약 라벨 · status 술어 (8 assetKind 고려 — H1/M5)

`asset-section-summary.ts` 순수 함수 — **라벨 전용, 금액 없음**.
시그니처: **`summarize(asset, { totalTransferExpense }) => { basic, transfer, acquisition, expense, extras }`** — ④ 일괄안분(`useFormLevel`) 판정에 폼-전역 `totalTransferExpense` 필요(asset-only 불가). orchestrator가 보유 prop(L75) 전달.

| 섹션 | 요약 라벨 | status="filled" 술어 |
|---|---|---|
| ① 기본 | `{종류라벨} · {소재지 or "소재지 미입력"}` (+ land: 면적 입력여부) | 종류 외 소재지/면적 등 입력 |
| ② 양도 | `{양도형태 라벨}` (부담부 → "§159 자동산정") | 양도형태 선택됨(부담부 포함) or 양도가액 |
| ③ 취득 | `{취득원인} · {산정방식}`; 특수자산(일반건물·상업용·재개발)은 종류 라벨로 대체 | 취득원인 + 취득일 |
| ④ 경비 | "입력됨 / 미입력" | 자본+양도비 입력 **또는 일괄안분 활성**(`useFormLevel`) |
| ⑤ 특례 | 적용 특례명(NBL 판정 / 거주주택 등) | 적용 시 항상 표시 |

- 라벨맵(`ASSET_KIND_LABELS`·취득원인·양도형태)은 `asset-labels.ts` 공용 모듈에서 import(dual-truth 방지).
- ④ "일괄안분 활성"은 `totalTransferExpense>0`(폼-전역) 판정 — store `transferExpense`가 disabled로 공란이어도 "입력됨"(R3#4 회피).

---

## 5. 자동노출 / forceOpen 매트릭스 (G7·H2)

| 트리거 | 동작 | 구현 |
|---|---|---|
| `assetKind` → commercial/general/redevelopment | ③ open=true | 라디오 onChange 로컬 setOpen(3,true) |
| 겸용주택 토글 ON (① 그룹, 패널은 ③) | ③ open=true | 토글 onChange 로컬 setOpen(3,true) |
| 검증 차단 오류(`errorMessage`) | ①~⑤ 전부 forceOpen + 카드 스크롤 | `forceOpen = !!errorMessage`, 펼침 후 `scrollToAssetCard` |
| 비차단 `dateOrderWarning` | 배너만(자동펼침 미적용) | 항상-노출 배너로 충분 (Do 환류 — render-time setState 회피) |
| 칩 클릭 | 해당 섹션 open + focus | 칩 onClick |

- 전부 **로컬 `useState` setOpen** — useEffect·store write 0(무한루프 무관).

---

## 6. 14 동기화 지점 매핑 (⑤만 변경 확인)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | AssetForm | **무변경** (신규 필드 0) |
| ② initial | — | 무변경 |
| ③ normalize | — | 무변경 |
| ④ API 변환 | transfer-tax-api.ts | 무변경 |
| ⑤ **UI 위젯** | CompanionAssetCard → AssetSection 5분할 | **변경(본 작업)** |
| ⑥ 사이드바 | computeTransferSummary | **무변경**(금액 단일 진실 유지 — 헤더 금액 미표시로 보장) |
| ⑦ 결과 카드 | — | 무변경 |
| ⑧ validation | transfer-tax-validate* | **무변경**(section 키 미추가 — §9 후속) |
| ⑨~⑭ Zod/Route | — | 무변경 |

→ G3 "무변경 증명"은 `git diff`로 ①②③④⑥⑦⑧⑨~⑭ 0 확인.

---

## 7. Do 전 anchor (pre-do-anchor-verification)

1. `asset-section-summary` — 8 assetKind × (기본/부담부/지분/환산) 라벨 derive 단위 테스트.
2. `transferDate 의존 전파` — sub-component에 `transferDate` 미전달 시 기준연도 계산이 깨지는지 확인하는 anchor(H4 props strip 검출).
3. `e2e/_helpers/expandAssetSection(page, num)` 헬퍼 + 단건 land 입력 E2E 1건(전부 접힘 → 펼침 → 입력 → 계산).
