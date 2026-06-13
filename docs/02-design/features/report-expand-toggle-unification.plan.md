# 보고서 펼치기/접기 단추 통일 계획

> 작성일 2026-06-13 · 브랜치 `feat/report-impro` · 대상: 6대 세금 + 주식양도세 결과 화면(보고서)
> 정책 준수: feedback_tailwind_static_tone_mapping(정적 tone Record), print-only-css-toggle, single-source-engine-helper

## 1. 목표

각 세목 결과 화면(보고서)의 "펼치기/접기" 토글 버튼의 **모양·라벨·아이콘·인쇄 동작**을 단일 출처 컴포넌트로 통일한다.
기준은 상속세 "상속공제 상세 내역"의 **테두리 있는 알약형(pill) + "▼ 펼치기" / "▲ 접기"** 버튼 (사용자 제공 이미지).

**비목표**: 카드별 색조(tone)·헤더 문구·콘텐츠는 변경하지 않는다. 토글 컨트롤의 시각·라벨·접근성만 통일한다.

## 2. 기준 — 단일 출처 (이미 존재)

`components/calc/results/shared/ExpandToggleButton.tsx` (검증 완료)

| export | 용도 | 핵심 |
|---|---|---|
| `ExpandToggleButton({open, onClick, tone})` | 독립 `<button>` 토글 | 알약형 + `print:hidden` + `aria-expanded` + `stopPropagation` 내장 |
| `expandToggleClass(tone)` | 클래스만 (헤더 전체 클릭 카드의 `<span>`에 적용) | 중첩 `<button>` 금지 케이스용 |
| `expandToggleLabel(open)` | 라벨 문자열 | `open ? "▲ 접기" : "▼ 펼치기"` |

- 베이스 클래스(L26-27): `shrink-0 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors print:hidden`
- tone 팔레트(L18-24, 현재): **`sky` · `violet` · `slate` 3종만 존재**
- 본문은 `print-only-css-toggle` 패턴과 함께 사용: 버튼 `print:hidden`, 본문 `{open ? "block" : "hidden print:block"}`

### 이미 표준을 따르는 곳 (수정 불필요 — 참고용)
- 상속세: DeductionBreakdownSection, AllocationBreakdownSection, HeirAllocationSummaryTable, DebtAllocationResultCard, CorporateExemptionSection(×2), SourceDataSummarySection, InstallmentScheduleCard, InheritanceTaxResultView(재산 평가 내역), allocation-breakdown/* 7개, deduction-breakdown/* 8개
- 증여세: UnlistedStockSimpleValuationSection, ListedStockBesshiResultSection, InheritanceFilingFormTable

## 3. 비표준 인벤토리 (수정 대상 · file:line 실측 검증)

### 그룹 A — 인라인 텍스트 하드코딩 버튼 (독립 button)

| # | 파일:줄 | 세목/섹션 | 현재 라벨 | 현재 클래스 | 문제 |
|---|---|---|---|---|---|
| A1 | `results/GenerationSkipSurchargeBreakdownCard.tsx:74-82` | 상속·증여 세대생략 할증과세 | `▼ 접기` / **`▶ 펼치기`** | `text-xs text-rose-600 … print:hidden` (테두리 없음) | **아이콘 ▶ 비표준**(표준 ▲/▼), 알약형 아님, tone=rose 미지원 |
| A2 | `results/LotMatchingDetailCard.tsx:47-53` | 주식양도 로트별 매칭 상세 | `▲ 접기` / `▼ 펼치기` | `text-xs text-violet-700 hover:text-violet-900` (테두리 없음) | 라벨은 일치하나 알약형 아님, **`print:hidden` 누락**(인쇄 시 버튼 노출) |

> A1의 또 다른 토글(L270 `aria-label`만 있는 행별 산출근거 토글)은 표 행 내부 미세 토글 → **그룹 D**로 분류.

### 그룹 B — lucide 아이콘(Chevron) + 헤더 전체 클릭 카드

| # | 파일:줄 | 세목/섹션 | 현재 | 문제 |
|---|---|---|---|---|
| B1 | `results/comprehensive-payable-calc/HousingPayableTaxCalcCard.tsx:33-46` | 종부세 주택분 납부할세액 계산 | `ChevronUp/Down` h-4 w-4, 헤더 전체 `<button>` | 텍스트 라벨 없음(아이콘만), 모양 불일치 |
| B2 | `results/comprehensive-payable-calc/LandPayableTaxCalcCard.tsx:51-62` | 종부세 토지분 납부할세액 계산 | 동상 | 동상 |
| B3 | `results/comprehensive-filing/ComprehensiveFilingFormSection.tsx:62-79` | 종부세 신고서 양식 | 동상 | 동상 |
| B4 | `results/MultiTransferTaxResultView.tsx:310-335` | 다건 양도세 자산별 산출근거 아코디언 | 동상 | 동상 |

> 그룹 B는 모두 **헤더 div 전체가 클릭 영역**(중첩 button 금지) → `ExpandToggleButton`(button) 대신 **`expandToggleClass()/expandToggleLabel()`를 `<span>`에 적용**. 기준 컴포넌트 주석(L10-11)에 명시된 패턴. SourceDataSummarySection이 이미 이 방식의 레퍼런스.

### 그룹 C — 범위 경계 (2차 검토 · 이번 통일에서 제외 후보)

| # | 파일:줄 | 영역 | 비고 |
|---|---|---|---|
| C1 | `building-std-price/nts-report/NtsBuildingStdPriceReport.tsx:66` | 건물 기준시가 도구 인쇄 서식 | 장식 문구 포함(`▲ … 접기` / `▼ … 펼치기 (인쇄 서식)`). 서식 안내 문구가 의도적 → **현행 유지** 권장 |
| C2 | `inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView.tsx:124` | 별지 부표3 인쇄 뷰 | 별지서식 영역 — besshi-form-replica 규칙 별도. 2차 |
| C3 | `gift/PriorGiftHistoryModal.tsx` / `inheritance/.../UnlistedStockHistoryModal.tsx:179` | 입력 단계 이력 조회 **모달** | 결과 보고서 아님 → **범위 외** |

### 그룹 D — 표 행 내부 미세 토글 (알약형 부적합 · 별도 정책)

| # | 파일:줄 | 영역 | 현재 | 처리 |
|---|---|---|---|---|
| D1 | `results/transfer/DetailedCalculationStatementCard.tsx:274-282` | 양도세 상세명세서 자산별 행 펼침 | `▼` / `▶` 단독 아이콘 h-4 w-4 | 표 행 좌측 인디케이터 — 알약형 버튼은 레이아웃 부적합. **아이콘 ▼/▶ → ▲/▼ 표준화만** 적용(라벨 버튼화 제외), `print:hidden` 확인 |
| D2 | `results/GenerationSkipSurchargeBreakdownCard.tsx:268-272` | 세대생략 행별 산출근거 토글 | 행 내부 토글 | D1과 동일 정책(미세 토글 유지, 아이콘만 표준화) |

> 결정 포인트: 그룹 D를 (a) 그대로 두는가, (b) 아이콘 방향만 ▲/▼로 통일하는가. **권장 (b)** — 알약형 강제는 표 레이아웃을 깨므로 적용하지 않되, 아이콘 어휘(▲ 펼침후/▼ 접힘)만 표준에 맞춘다.

## 4. 선행 작업 — tone 팔레트 확장

현재 `EXPAND_TONE_CLASS`는 `sky · violet · slate` 3종. 비표준 카드 색조를 보존하려면 **`rose`(A1 세대생략) 추가**가 필요(B/C는 sky·slate·violet로 흡수 가능).

```ts
// ExpandToggleButton.tsx — EXPAND_TONE_CLASS에 추가
rose: "border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-600 dark:text-rose-300 dark:hover:bg-rose-900/40",
```
- `ExpandTone` 유니온에 `"rose"` 추가.
- 정책 feedback_tailwind_static_tone_mapping 준수(동적 `bg-${tone}` 금지, 정적 Record 유지).
- (선택) 향후 대비 `emerald` · `amber`도 함께 추가할지 결정 — **YAGNI: 현재 필요한 rose만 추가** 권장.

## 5. 작업 항목 (수정 단위)

| 순서 | 항목 | 작업 | 검증 anchor |
|---|---|---|---|
| 1 | tone 확장 | `ExpandToggleButton.tsx`에 `rose` tone + 유니온 추가 | tsc |
| 2 | A1 세대생략 | 인라인 텍스트 버튼 → `<ExpandToggleButton tone="rose">`. `aria-label` 의미 보존(컴포넌트 `aria-expanded` 내장이므로 라벨 제거 가능) | 렌더 후 "▼ 펼치기" 노출, 인쇄 시 버튼 숨김 |
| 3 | A2 로트매칭 | 인라인 텍스트 버튼 → `<ExpandToggleButton tone="violet">`. **print:hidden 누락 자동 해소** | 인쇄 시 버튼 숨김 확인 |
| 4 | B1~B4 헤더클릭 | 헤더 `<button>`/`<div onClick>` 내 lucide Chevron → `<span className={expandToggleClass(tone)}>{expandToggleLabel(open)}</span>`. lucide import 제거(미사용 시) | 헤더 클릭 토글 유지, 알약형 라벨 표시 |
| 5 | D1·D2 미세토글 | 아이콘 `▼/▶` → `▲/▼` 표준 어휘로만 정정, `print:hidden` 유무 확인 | 표 레이아웃 불변 |
| 6 | 회귀 | `npx tsc --noEmit` 0건 + 관련 결과뷰 E2E | 아래 §6 |

### 통일 후 표준 패턴 (요약)

```tsx
// (가) 독립 버튼 — A1·A2
<ExpandToggleButton open={open} onClick={() => setOpen(v => !v)} tone="violet" />

// (나) 헤더 전체 클릭 카드 — B1~B4 (중첩 button 금지)
<button type="button" onClick={() => setExpanded(v => !v)} className="...헤더 전체...">
  <span className={expandToggleClass("sky")}>{expandToggleLabel(expanded)}</span>
</button>

// 본문(공통): print-only-css-toggle
<div className={expanded ? "block" : "hidden print:block"}>…</div>
```

## 6. 검증 (강제)

- `npx tsc --noEmit` 오류 0건 (특히 lucide import 제거 후 미사용 경고).
- 회귀: 변경 결과뷰가 포함된 기존 E2E 스펙 — 종부세(주택·토지 납부세액·신고서), 다건 양도, 주식양도, 세대생략(상속·증여) 경로.
- **브라우저 수동 확인**: 각 카드 펼침/접힘 동작 + **인쇄 미리보기에서 토글 버튼 숨김 + 본문 자동 펼침**(print-only-css-toggle 핵심) 확인. 미수행 시 명시.
- 기존 전체 회귀는 사전존재 실패 baseline과 대조(메모리 feedback_e2e_preexisting_failures).

## 7. 결정 필요 사항 (착수 전 확인)

1. **그룹 D(표 행 미세 토글)**: 아이콘만 ▲/▼ 표준화(권장) vs 현행 유지 vs 알약형 강제.
2. **그룹 C(도구 인쇄 서식·별지·모달)**: 이번 범위 제외(권장) vs 포함.
3. **tone 확장 범위**: `rose`만(권장 · YAGNI) vs `rose+emerald+amber` 일괄.

## 8. 영향 파일 요약

- 수정(핵심): `ExpandToggleButton.tsx`(tone), `GenerationSkipSurchargeBreakdownCard.tsx`, `LotMatchingDetailCard.tsx`, `HousingPayableTaxCalcCard.tsx`, `LandPayableTaxCalcCard.tsx`, `ComprehensiveFilingFormSection.tsx`, `MultiTransferTaxResultView.tsx`
- 조건부(그룹 D): `DetailedCalculationStatementCard.tsx`
- 제외(그룹 C): nts-report, BesshiForm4Buppyo3PrintView, 이력 조회 모달 2종
