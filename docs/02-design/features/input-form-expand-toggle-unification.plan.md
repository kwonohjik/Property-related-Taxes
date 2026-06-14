# 상속세·증여세 입력 폼 — 펼치기/접기 토글 표준 통일 계획서

> 작성 2026-06-15. 상속세·증여세 **입력 폼(마법사)**의 제각각인 펼치기/접기 토글을, 결과 화면 표준 토글(`ExpandToggleButton`, "▼ 펼치기 / ▲ 접기")로 통일한다.
> 사용자 지목 화면: 입력 폼의 "비과세 §12 [1개 선택] ▸" · "과세가액 불산입 §16·§17 [1개 선택] ▸" 카드 = `ExemptionChecklist.tsx`.

## 1. 목적·배경

결과 화면은 PR#174로 펼치기/접기 토글이 단일 출처(`ExpandToggleButton`)로 통일됐으나, **입력 폼(마법사)의 토글은 여전히 제각각**이다:
- 인라인 문자: `▾`/`▸`, `▼`/`▲`, `▶`/`▼`
- lucide `ChevronDown` + `rotate-180`
- 단방향 펼침만(닫힘 라벨 없음)

→ 모양·라벨·아이콘·인쇄 동작이 어긋난다. 결과 탭과 동일한 표준으로 통일해 일관성을 확보한다.

근거 정책: 메모리 `feedback_result_expand_toggle_standard`, `feedback_tailwind_static_tone_mapping`, `feedback_useeffect_store_mirror_forbidden`, 스킬 `print-only-css-toggle`.

## 2. 표준 토글 API 명세 (확정 — 코드 실측)

**단일 출처**: `components/calc/results/shared/ExpandToggleButton.tsx` (순수 프레젠테이션, 결과 전용 의존성 없음 → 입력 폼 재사용 OK. 이미 입력 폼 9개 파일에서 사용 중).

| Export | 시그니처 | 용도 |
|---|---|---|
| `ExpandToggleButton` | `({ open, onClick, tone? })` — 독립 `<button>`. `stopPropagation`·`aria-expanded`·`print:hidden` 내장 | 헤더 우측에 토글만 따로 둔 카드 |
| `expandToggleClass` | `(tone?: ExpandTone) => string` — 배지 className | 헤더 div 전체가 클릭 영역인 카드(중첩 `<button>` 금지). `<span className={expandToggleClass(tone)}>` |
| `expandToggleLabel` | `(open: boolean) => string` = `open ? "▲ 접기" : "▼ 펼치기"` | 라벨 고정 |

- **tone 7종**(정적 Record `EXPAND_TONE_CLASS`): `sky · violet · slate · rose · emerald · amber · blue`. 기본 `slate`. 동적 `bg-${tone}` 금지.
- **본문 패턴(print-only-css-toggle)**: `<div className={open ? "block" : "hidden print:block"}>` — 화면은 open만, 인쇄는 항상 펼침. 버튼은 `print:hidden`(내장).

### 적용 3패턴
- **A. 독립 버튼**: 헤더 우측에 `<ExpandToggleButton .../>`. 별도 토글 버튼이 있는 카드.
- **B. 헤더 전체 클릭**: 헤더가 이미 `<button>`/`onClick` 영역이면, 안에 `<span className={expandToggleClass(tone)}>{expandToggleLabel(open)}</span>` 배지만 삽입(중첩 `<button>` 금지 — span 사용).
- **C. 본문**: `className={open ? "block" : "hidden print:block"}`.

## 3. 통일 대상 인벤토리

> ⚠️ Do 착수 시 각 file:line을 재grep 확인(외부 동시편집·라인 드리프트). ★ 표시 = 본 세션 직접 검증 완료. 그 외는 2차 조사 보고 기준 → Do 전 재확인.

### 3-A. 상속·증여 공용 (최우선 — 사용자 지목)

| 대상 | 위치 | 현재 | 표준화 | tone | 패턴 |
|---|---|---|---|---|---|
| ★ ExemptionChecklist **그룹 헤더** | `components/calc/exemption/ExemptionChecklist.tsx:267` | `<span>{isOpen ? "▾" : "▸"}</span>` (헤더는 이미 `<button onClick={onToggleOpen}>`, line 249) | `<span className={expandToggleClass(tone)}>{expandToggleLabel(isOpen)}</span>` | 비과세=**sky** / 과세가액불산입=**violet** (기존 `tone` prop 분기 line 240~244 그대로 연결) | B |
| ★ ExemptionChecklist **항목 상세** | `ExemptionChecklist.tsx:142` | `{detailsOpen ? "▾" : "▸"} 적용 요건·제외 사유 자세히` | 표 행 미세토글 예외 후보 — 아래 §5 판단 | sky | (예외 검토) |

→ `ExemptionChecklist.tsx`는 `inheritance/steps.tsx` + `gift-tax-form-shared.tsx` 양쪽에서 렌더되므로 **한 번 수정 = 상속·증여 동시 적용**.

### 3-B. 상속세 전용

| 대상 | 위치(조사 기준) | 현재 | tone | 패턴 |
|---|---|---|---|---|
| FbHeirRequirementsSection (성인/종사/임원/대표 4곳) | `inheritance/family-business/FbHeirRequirementsSection.tsx:168,244,305,366` | `▼ 수동 보정`/`▲ 수동 보정 접기` 텍스트 링크(양방향 라벨 있음) | sky | A 또는 B |
| FbDecedentRequirementsSection (지분/대표 2곳) | `inheritance/family-business/FbDecedentRequirementsSection.tsx:195,285` | `▼`/`▲` 텍스트 링크 | amber | A 또는 B |
| ListedStockBesshiPreviewCard | `inheritance/listed-stock/ListedStockBesshiPreviewCard.tsx:66` | `{open ? "▼" : "▶"} 평가조서(갑·을) 미리보기` — **라벨 있음**, ▶/▼ 혼용이 비표준 | sky | A |
| 상장 평가조서 토글 라벨 상수 | `inheritance/listed-stock/besshi/listed-besshi-constants.ts:86~87` | `"▼ 평가조서(갑)"`·`"▼ 평가조서(을)"` 단방향 상수 | sky | A (소비처와 함께 교정) |
| AutoSuggestBadge | `inheritance/AutoSuggestBadge.tsx:92` | `▼ 산식`/`▲ 접기` | emerald | A |
| EstateCommonAttributesSection | `inheritance/EstateCommonAttributesSection.tsx:176`(aria :171) | `▼ 더 많은 적용 옵션`/`▲` | sky | A |
| EstateItemAdvancedPanel | `inheritance/estate-card/EstateItemAdvancedPanel.tsx:132`(aria :128) | `▼ 추가 옵션`/`▲` | slate | A |
| KiwoomValuationResultCard | `inheritance/listed-stock/KiwoomValuationResultCard.tsx:90` | `▼ 일자별 종가`/`▲` | emerald | A |
| UnlistedStockHistoryModal **동일 법인** | `inheritance/unlisted-stock-v2/UnlistedStockHistoryModal.tsx:163` | `▼ 동일 법인 (N건)` 단방향 — **같은 파일 line 180~184 "다른 법인"은 이미 표준 `expandToggleClass`/`expandToggleLabel` 사용**. 두 토글 표준 일관화 | slate(다른 법인과 일치) | A/B |

### 3-C. 증여세 전용

| 대상 | 위치(조사 기준) | 현재 | tone | 비고 |
|---|---|---|---|---|
| PriorGiftHistoryModal 이력 섹션 | `PriorGiftHistoryModal.tsx:339` | `▼ 사전증여 이력 (N건)` 단방향 | sky | A |
| PriorGiftHistoryModal 합산 칩 | `PriorGiftHistoryModal.tsx:127` | "🔁 이전 합산 결과 포함" | — | **§5 예외(정보 칩)** — 통일 제외 |

### 3-D. lucide ChevronDown + rotate (정책 재판정 필요)

2차 조사가 "표준 로직, 통일 대상 X"로 분류했으나, **정책은 lucide Chevron 신규 사용 금지 + 라벨 표준은 `▼/▲` 텍스트**다. 따라서 이들도 원칙상 통일 대상. 단 리스크·예외를 구분한다.

| 대상 | 위치(조사 기준) | 처리 |
|---|---|---|
| Step4DeductionGroup | `inheritance/Step4DeductionGroup.tsx:22,129` ChevronDown+rotate-180 | 🟡 **신중** — 헤더 전체 클릭 카드(B 적용 가능)지만 메모리 `project_inheritance_ux_improvements` ②에 "기본 펼침·~10 E2E 의존" 경고. 표준화하되 default-open·data-testid·E2E selector 보존 필수 |
| InheritanceMobileSummaryBar | `inheritance/InheritanceMobileSummaryBar.tsx:19,69` ChevronDown | 🟡 B 적용. 모바일 sticky 미니바 — 시각 회귀 주의 |
| EstateItemHeaderChips | `inheritance/estate-card/EstateItemHeaderChips.tsx:17,88` ChevronDown(아이콘만) | ⚪ **§5 예외 후보**(자산 칩 인라인 아코디언 = 표 행 미세토글). 아이콘 어휘만 `▲/▼`로 표준화하거나 현행 유지 |

> ⚠️ **2차 조사 오분류 정정(본 세션 직접 검증)**: `CollapsibleEstateGroup`은 ChevronDown이 아니라 **이미 표준** `expandToggleClass("slate")`+`expandToggleLabel`(line 15~17,133~137) 사용 → 3-E로 이동, 통일 대상 아님.

### 3-E. 이미 표준 적용됨 (통일 대상 아님 — 확인용)

`DeductionBesshiFormsSection`(:94)·`BesshiBuppyo2Section`(:88)·`FilingForm9CoverSection`(:107)·`BesshiForm4Buppyo3PrintView`(:128)·**`CollapsibleEstateGroup`(:133~137)**·**`UnlistedStockHistoryModal` 다른 법인(:180~184)** — 이미 `ExpandToggleButton`/`expandToggleClass`/`expandToggleLabel` 사용. 손대지 않음.

### 3-F. native `<details>/<summary>` 토글군 (누락분 — 별도 처리)

브라우저 기본 triangle을 쓰는 native 토글. 화살표 문자/Chevron이 없어 1차 인벤토리에서 누락됐다. 표준 토글은 `useState`+`button` 구조라 **native `<details>`를 button+state로 변환**해야 적용 가능 → 공수·회귀 위험이 별도. 우선순위 낮음, §5 예외(보조 정보) 적용 가능.

| 대상 | 위치 | 현재 | 처리 |
|---|---|---|---|
| 비상장 적용규칙 | `inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:292~293` | `<details><summary>적용 규칙 (N건)` | ⚪ 보조 정보 — §5 예외(현행 유지) 또는 button 변환 |
| 별지부표5 한도액 산정표 | `inheritance/deduction-besshi/Besshi5FormTable.tsx:127~128` | `<details print:open><summary print:hidden>` | ⚪ **이미 인쇄 자동펼침(print:open)** — 신고서식 native, 현행 유지 권장 |
| RTMS 유사매매 모달 | `inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:534~535` | `<details><summary>` | ⚪ 모달 내 보조 — §5 예외 후보 |
| 증여 이력 모달(추가) | `gift/PriorGiftHistoryModal.tsx:365~366` | `<details><summary>` (line 339 토글과 별개) | ⚪ §5 예외 후보 |

> **방침**: native `<details>` 4곳은 본 통일의 1차 범위에서 제외(보조 정보·신고서식·모달). 표준화하려면 button+state 변환이 필요하므로 별도 후속으로 분리. 단 **인벤토리에는 명시**해 "누락"이 아니라 "의도적 보류"임을 기록.

## 4. 마이그레이션 방식

### 패턴 선택 기준
- 헤더가 **이미 `<button>` 또는 `onClick` div**이고 그 안에 화살표 span만 있으면 → **B** (`expandToggleClass` span 배지). 예: ExemptionChecklist 그룹 헤더, Step4DeductionGroup, CollapsibleEstateGroup.
- 헤더와 **별개로 토글 버튼이 독립**해야 하면 → **A** (`<ExpandToggleButton>`). 예: ListedStockBesshiPreviewCard, 자산 카드 "추가 옵션".
- 펼침 본문은 모두 → **C** (`open ? "block" : "hidden print:block"`). 단 모달 내부 등 인쇄 무관 영역은 `open && (...)` 유지 가능(인쇄 대상 여부로 판단).

### 단방향 토글 보정
`UnlistedStockHistoryModal`·`PriorGiftHistoryModal` 이력 섹션은 펼침만 있고 닫힘 라벨이 없다 → `expandToggleLabel(open)`로 **양방향(▼ 펼치기 ↔ ▲ 접기)** 으로 교정.

### 정책 준수 (강제)
- **중첩 `<button>` 금지**: 헤더가 button이면 토글은 `<span className={expandToggleClass(tone)}>`로(B). 새 button을 button 안에 넣지 않는다.
- **정적 tone**: `bg-${tone}` 동적 생성 금지 — `expandToggleClass`의 정적 Record만 사용.
- **useEffect → store 미러링 금지**: ExemptionChecklist·Step4DeductionGroup은 "칩 체크 시 자동 펼침"을 `onClick`에서 직접 set한다(현행 유지). 표준화는 **표시만** 교체하고 open 상태 관리 로직은 건드리지 않는다.
- **라벨 하드코딩·lucide Chevron 신규 금지**: `expandToggleLabel(open)`만 사용.

## 5. 표준화 예외 (정책)

- **예외 1 — 표 행/칩 내부 미세 토글**: 알약형 버튼이 행 레이아웃을 깨는 곳은 강제 안 함. 아이콘 어휘만 `open ? "▲" : "▼"` + `print:hidden`로 통일. 후보: `EstateItemHeaderChips`(자산 칩 인라인), `ExemptionChecklist` 항목 "적용 요건·제외 사유"(:142, 행 내부 보조 토글). → **결정 필요**: 알약 버튼이 카드 폭을 차지해도 되면 표준 B, 아니면 아이콘 표준화. 권장: ExemptionChecklist 항목 토글은 행 내부라 **아이콘 어휘만 `▲/▼`** 통일(알약 미적용).
- **예외 2 — 정보 칩**: 펼침이 본질이 아니라 맥락 라벨이 본질인 칩은 유지. `PriorGiftHistoryModal:127` "🔁 이전 합산 결과 포함".

## 6. 작업 순서

1. **Tier 1 (사용자 지목)**: `ExemptionChecklist.tsx` 그룹 헤더(:266) → 패턴 B, tone sky/violet. 항목 토글(:142)은 §5 예외(아이콘 표준화). **상속·증여 동시 반영 확인**.
2. **Tier 2 (단방향·라벨없음 교정)**: ListedStockBesshiPreviewCard, UnlistedStockHistoryModal, PriorGiftHistoryModal 이력 섹션 → 양방향 표준.
3. **Tier 3 (자산 카드·자동제안)**: EstateCommonAttributesSection, EstateItemAdvancedPanel, AutoSuggestBadge, KiwoomValuationResultCard → 패턴 A.
4. **Tier 4 (가업 요건)**: FbHeirRequirementsSection(4)·FbDecedentRequirementsSection(2) → tone sky/amber.
5. **Tier 5 (lucide 제거, 신중)**: Step4DeductionGroup·CollapsibleEstateGroup·InheritanceMobileSummaryBar → 패턴 B로 ChevronDown 제거. **E2E·default-open·시각 회귀 검증 후**.
6. EstateItemHeaderChips는 §5 예외 검토 후 아이콘 어휘만 통일 or 현행 유지.

## 7. 검증·E2E

- **자가 점검 grep**(작업 후, 예외 제외):
  `grep -rnE 'ChevronUp|ChevronDown|▶|▾|▸|▼|▲' components/calc/inheritance components/calc/gift components/calc/exemption` → 잔존 허용은 **예외만**: ① 표준 라벨 정의(`ExpandToggleButton.tsx`) ② §5 미세토글/정보 칩(EstateItemHeaderChips 등) ③ §3-F native `<details>` 4곳(보류). 그 외 0건.
  - `listed-besshi-constants.ts:86~87` 상수도 소비처와 함께 교정됐는지 확인.
  - 이미 표준인 `CollapsibleEstateGroup`·`UnlistedStockHistoryModal:180~184`는 재작업 대상 아님.
- **E2E 영향**:
  - `ExemptionChecklist` 항목 토글 `data-testid="exemption-row-{id}-details-toggle"` **보존**(셀렉터 유지).
  - 그룹 헤더는 현재 textid 없음 → 표준화 시 title("비과세"/"과세가액 불산입")로 잡거나 `data-testid` 신규 부여 권장.
  - `Step4DeductionGroup` 기본 펼침·~10 E2E(외국납부·연부연납·물납·가업·재해손실·동거) **회귀 0 확인**(메모리 `project_inheritance_ux_improvements` ② / `project_inheritance_stale_e2e_specs`).
  - 라벨이 `▼ 펼치기/▲ 접기`로 바뀌면 텍스트 기반 selector 영향 가능 → title/testid 기반으로 안정화.
- **인쇄 확인**: print-only-css-toggle 적용 섹션은 인쇄 미리보기에서 자동 펼침 확인(`feedback_browser_verify_with_playwright`).
- **시각 회귀**: 모바일 미니바(InheritanceMobileSummaryBar)는 viewport 390 모바일 렌더 확인.

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| line 드리프트(외부 동시편집) | Do 착수 시 각 file:line 재grep. 본 계획서 line은 조사 시점 스냅샷 |
| Step4DeductionGroup E2E 깨짐 | default-open·testid·selector 보존, 전체 E2E 회귀 대조 |
| 중첩 button 접근성 위반 | 헤더 button 안에는 span(expandToggleClass)만, ExpandToggleButton 신규 삽입 금지 |
| ExpandToggleButton 위치(`results/shared/`)에서 입력 폼 import | 구조상 문제 없음(순수 프레젠테이션, 기존 9곳 선례). 위치 이동 불요 |
| 미세토글/정보 칩 과잉 표준화 | §5 예외 명시 — 행 내부·맥락 칩은 아이콘/현행 유지 |

## 9. 완료 정의(DoD)

- [ ] ExemptionChecklist 그룹 헤더 표준화(상속·증여 동시) — 사용자 지목 화면 해결
- [ ] Tier 2~5 통일, 단방향 토글 양방향 교정
- [ ] §5 예외(미세토글·정보 칩) 정책대로 분류·처리
- [ ] 자가 점검 grep 0건(예외 제외)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run` 통과
- [ ] 전체 E2E 회귀 0(특히 Step4 그룹 ~10건) + 인쇄 미리보기 확인
- [ ] lucide ChevronDown 입력 폼 신규 0건
