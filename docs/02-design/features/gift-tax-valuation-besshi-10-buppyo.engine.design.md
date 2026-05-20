# 증여재산 및 평가명세서 (별지 제10호서식 부표 1, 개정 2026.3.20.) — UI 디자인

> Plan: [`docs/00-pm/gift-tax-valuation-besshi-10-buppyo.plan.md`](../../00-pm/gift-tax-valuation-besshi-10-buppyo.plan.md)
> 작성일: 2026-05-20
> 대상: `GiftTaxResultView.tsx`의 평가 내역 카드 → 신규 `GiftTaxValuationFormTable.tsx`

---

## 1. 범위

- ⑦ **결과 카드 단독 변경** (엔진·폼·validate·API 영향 0)
- 14지점 동기화 중 ⑦만 갱신 — 신규 동기화 지점 없음

## 2. 케이스 인벤토리 (Plan §4.3 anchor → 디자인 케이스 enumerate)

| 케이스 | 자산 수 | 사전증여 | 비과세 | 공익법인·신탁 | 검증 anchor |
|---|---|---|---|---|---|
| C-1 | 1건 (현금 350M) | 없음 | 0 | 0 | GV-1 |
| C-2 | 1건 (현금 1B) + 사전증여 2건 (520M+300M) | 있음 | 0 | 0 | GV-2 (사용자 이미지 14 일치) |
| C-3 | 3건 + 빈 행 7개 | — | — | — | GV-3 (행 수 정확성) |
| C-4 | 12건 (10행 초과) | — | — | — | GV-4 (양식 늘어남) |
| C-5 | 자기일관성 (모든 케이스) | — | — | — | GV-5 (음수 가드 포함) |
| C-6 | 카테고리 10종 매핑 | — | — | — | GV-6 (재산종류코드) |
| C-7 | 평가방법 6종 매핑 | — | — | — | GV-7 (평가기준코드) |
| C-8 | ① 코드 A11/A24 구분 | 사전증여 별도 행 | — | — | GV-8 (Phase 2 트리거) |
| C-9 (Phase 2) | 비과세 100M + 공익법인 50M + 공익신탁 30M + 장애인신탁 20M | — | 200M (=10+11+12+13 합) | 분리값 보유 | 향후 |

## 3. 컴포넌트 시그니처

### 3.1 신규 파일: `components/calc/results/GiftTaxValuationFormTable.tsx`

```tsx
"use client";

import type { EstateItem, PropertyValuationResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/lib/utils/format";

export interface GiftTaxValuationFormTableProps {
  /** 본문 행 — A11 (당기 증여재산) */
  valuationResults: PropertyValuationResult[];
  /** valuationResults와 1:1 매칭되는 원본 EstateItem (id로 lookup) */
  estateItems: EstateItem[];

  /** ⑨ 증여재산가액 (= A11 합) */
  grossGiftValue: number;
  /** ⑩+⑪+⑫+⑬ 합산 (엔진 단일 필드) */
  exemptAmount: number;
  /** ⑮ 합계 = max(0, ⑨−⑩−⑪−⑫−⑬) + ⑭ */
  aggregatedGiftValue: number;

  /** ⑪ §48 공익법인 출연재산가액 — GiftTaxResult.publicInterestExclusion */
  publicInterestExclusion?: number;
  /** ⑫ §52 공익신탁 재산가액 — GiftTaxResult.publicTrustExclusion */
  publicTrustExclusion?: number;
  /** ⑬ §52의2 장애인 신탁 재산가액 — GiftTaxResult.disabledTrustExclusion */
  disabledTrustExclusion?: number;

  // ===== Phase 2 (현 PR 미사용) =====
  /** 사전증여 합산 분리 — 본 행 ①=A24 vs A11 구분. Phase 2 트리거 시 활성 */
  priorGiftValuationResults?: PropertyValuationResult[];
}
```

### 3.2 매핑 헬퍼 (동일 파일 내부 상수)

★ **AssetCategory 실제 enum 값** (`lib/tax-engine/types/inheritance-gift.types.ts:50-59`) — 9종:
`real_estate_land` / `real_estate_building` / `real_estate_apartment` / `listed_stock` / `unlisted_stock` / `cash` / `financial` / `deposit` / `other`
(`commercial_building` 카테고리는 **존재하지 않음** — 오피스텔·상업용건물은 현재 `real_estate_building`으로 분류됨)

```tsx
const PROPERTY_TYPE_CODE: Record<EstateItem["category"], string> = {
  cash: "01",
  real_estate_land: "02",       // 토지Ⅰ (Phase 1; Phase 2 시 부수토지 03 분리)
  real_estate_apartment: "05",  // 공동주택
  real_estate_building: "07",   // 일반건물 (오피스텔·상업용건물 06 분리는 Phase 2 시 EstateItem 확장 필요)
  listed_stock: "09",
  unlisted_stock: "10",
  financial: "11",
  deposit: "12",                // 임차보증금 → 기타재산
  other: "12",
};

function toPropertyTypeCode(category: EstateItem["category"]): string {
  return PROPERTY_TYPE_CODE[category] ?? "12"; // fallback = 기타재산
}

function toValuationMethodCode(
  item: EstateItem,
  vr: PropertyValuationResult
): string {
  if (item.category === "cash") return "06";
  switch (vr.method) {
    case "market_value":     return "01";
    case "appraisal":        return "02";
    case "similar_sales":    return "05";
    case "standard_price":
    case "book_value":
    case "acquisition_cost": return "08";
    default:                 return "08";
  }
}

/** ⑩ 표시값 (음수 가드) */
function computeRow10(
  exemptAmount: number,
  excl11: number,
  excl12: number,
  excl13: number
): number {
  return Math.max(0, exemptAmount - excl11 - excl12 - excl13);
}

/** ⑭ 표시값 (priorAggregation 재현) */
function computeRow14(
  aggregated: number,
  gross: number,
  exempt: number
): number {
  return Math.max(0, aggregated - Math.max(0, gross - exempt));
}
```

## 4. 표 구조 (DOM)

### 4.1 헤더 컬럼 순서 (10열, 부표 1 원문 기준)

| col | 라벨 | 폭 (대략) | 정렬 | data-testid |
|---|---|---|---|---|
| 1 | ① 재산구분코드 | 50px | center | `col-property-class` |
| 2 | ② 재산종류코드 | 50px | center | `col-property-type` |
| 3 | 국외자산 여부 | 60px | center (`[ ]여 [ ]부`) | `col-overseas` |
| 4 | 국외재산 국가명 | 60px | center | `col-country` |
| 5 | ③ 소재지·법인명 등 | flex (min 120px) | left | `col-name` |
| 6 | ④ 사업자등록번호 (지분율) | 100px | center | `col-biz-no` |
| 7 | ⑤ 수량 (면적) | 60px | right | `col-shares` |
| 8 | ⑥ 단가 | 80px | right | `col-unit-price` |
| 9 | ⑦ 평가가액 | 120px | right tabular-nums | `col-amount` |
| 10 | ⑧ 평가기준코드 | 50px | center | `col-valuation-method` |

**총 폭**: 50+50+60+60+120+100+60+80+120+50 = **750px (min) + flex** — A4 인쇄 영역 (210mm = 794px @ 96dpi) 안전 수용. 컨테이너에는 `min-w-[750px]` 적용 + 좁은 뷰포트는 `overflow-x-auto`로 가로 스크롤.

### 4.2 본문 행 렌더 정책

- **데이터 N건 + 빈 행 (10−N)개** (N ≤ 10), N > 10이면 데이터 N행
- 빈 행도 10열 td 골격 유지, 국외자산 칸은 `[ ]여 [ ]부` 표기 보존
- 행 높이: 데이터 행은 자동, 빈 행은 `h-7` (28px 고정) — 시각 균형

### 4.3 계 영역 (7행) — 본문 표와 **별도의 독립 표**

본문 10열 데이터 표 직후 새로운 `<table>` 시작 (원문 부표 1도 별도 박스). 구조:

- **3열 그리드 표**:
  - col A: 좌측 그룹 라벨 "계" (rowSpan=7)
  - col B: ⑩~⑬을 묶는 보조 라벨 "과세가액 불산입액" (⑪⑫⑬ 행에 rowSpan=3, ⑩ 행은 col B를 col C와 결합한 단일 칸)
  - col C: 행별 라벨 (⑨~⑮)
  - col D: 금액 (`text-right tabular-nums`)

- 행 구성:
  - ⑨ 증여재산가액 — col B+C 결합
  - ⑩ 비과세재산가액 — col B+C 결합 ★ (원문에 따라; 또는 ⑩이 "과세가액 불산입액" 묶음 외부로 처리 — 최신본 확인 후 §4.4 ASCII 기준 적용)
  - ⑪ 공익법인 출연재산가액 — col B (rowSpan=3 "과세가액 불산입액") + col C 분리
  - ⑫ 공익신탁 재산가액 — col C
  - ⑬ 장애인 신탁재산가액 — col C
  - ⑭ 증여재산가산액 — col B+C 결합
  - ⑮ 합계 — col B+C 결합 + 상단 굵은 테두리(`border-t-2 border-black`)

**모호점 정리**: KoreanLaw MCP 본문 확인 결과 원문 부표 1은 ⑩을 "과세가액 불산입액" 묶음 **외부**에 배치하고, ⑪/⑫/⑬만 묶음. 본 디자인은 §4.4 ASCII와 동일하게 ⑩ 외부 / ⑪⑫⑬ rowSpan=3 묶음으로 확정.

### 4.4 합산 시각 그룹화 (사용자 이미지 14 충실 재현)

```
┌──────────────────────────────────────────────────────┐
│        ⑨ 증여재산가액                  1,000,000,000 │
├──────────────────────────────────────────────────────┤
│        ⑩ 비과세재산가액                            0 │
├────────────┬─────────────────────────────────────────┤
│            │ ⑪ 공익법인 출연재산가액              0 │
│ 과세가액   ├─────────────────────────────────────────┤
│ 불산입액   │ ⑫ 공익신탁 재산가액                  0 │
│            ├─────────────────────────────────────────┤
│            │ ⑬ 장애인 신탁재산가액                0 │
├────────────┴─────────────────────────────────────────┤
│        ⑭ 증여재산가산액                  820,000,000 │
├──────────────────────────────────────────────────────┤
│        ⑮ 합계                          1,820,000,000 │
└──────────────────────────────────────────────────────┘
```

## 5. 스타일 (Tailwind utility 직접)

### 5.1 외부 CSS 작성 금지

프로젝트 컨벤션에 따라 `*.css` 신규 작성 또는 글로벌 클래스 추가 금지. 모든 스타일은 Tailwind utility 직접 적용.

### 5.2 핵심 utility

| 용도 | utility |
|---|---|
| 표 컨테이너 | `w-full border-collapse text-[11px]` |
| 셀 (공통) | `border border-black p-1 align-middle` |
| 셀 (텍스트 가운데) | `text-center` |
| 셀 (금액 우측) | `text-right tabular-nums` |
| 표 제목 (가운데 큰 글씨) | `text-center text-lg font-bold py-2` |
| 양식 헤더 라인 | `text-[10px] font-medium` |
| 우측 (앞쪽) 표기 | `text-right text-[10px]` |
| 인쇄 강제 흰 배경 | `print:bg-white print:text-black` |
| 빈 행 높이 | `h-7` |
| 양식 컨테이너 | `border-2 border-black p-3 bg-white text-black` |

### 5.3 다크모드 대응

양식 컨테이너에 `bg-white text-black` 강제 — `dark:` variant 없음 (양식 가독성 우선).

### 5.4 인쇄 가시성

`GiftTaxResultView.tsx` 통합 시:

```tsx
<div className={showValuation ? "block" : "hidden print:block"}>
  <GiftTaxValuationFormTable ... />
</div>
```

## 6. 결과 화면 통합 (GiftTaxResultView.tsx 변경)

### 6.1 변경 위치: `components/calc/results/GiftTaxResultView.tsx:308-357`

**Before** (50줄, 단순 카드형 토글):
```tsx
{/* 재산 평가 내역 */}
<div className="border rounded-xl overflow-hidden">
  <button onClick={() => setShowValuation((v) => !v)}>
    <span>증여재산 평가 내역 ({result.valuationResults.length}건)</span>
  </button>
  {showValuation && (
    <div className="divide-y divide-border text-xs">
      {result.valuationResults.map((vr, i) => { ... })}
    </div>
  )}
</div>
```

**After** (~12줄):
```tsx
{/* 증여재산 및 평가명세서 (별지 제10호서식 부표 1) */}
<div className="border rounded-xl overflow-hidden">
  <button
    type="button"
    onClick={() => setShowValuation((v) => !v)}
    className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium print:hidden"
  >
    <span>증여재산 및 평가명세서 (별지 제10호서식 부표 1) — {result.valuationResults.length}건</span>
    <span>{showValuation ? "▲" : "▼"}</span>
  </button>
  <div className={showValuation ? "block p-4" : "hidden print:block print:p-0"}>
    <GiftTaxValuationFormTable
      valuationResults={result.valuationResults}
      estateItems={estateItems}
      grossGiftValue={result.grossGiftValue}
      exemptAmount={result.exemptAmount}
      aggregatedGiftValue={result.aggregatedGiftValue}
      publicInterestExclusion={result.publicInterestExclusion}
      publicTrustExclusion={result.publicTrustExclusion}
      disabledTrustExclusion={result.disabledTrustExclusion}
    />
  </div>
</div>
```

### 6.2 import 추가 + 미사용 정리

`components/calc/results/GiftTaxResultView.tsx:23` 부근 기존 import 블록 끝에 추가:

```tsx
import { GiftTaxValuationFormTable } from "./GiftTaxValuationFormTable";
```

**미사용 import/헬퍼 정리** (Plan 통합 정정 환류):
- `getItemDisplayName` (현재 L321에서 사용 중) — 평가 내역 카드 제거 후 다른 위치에서 미참조이면 함수 정의 제거
- `methodLabel` 인라인 상수 (L322~329) — 평가 내역 카드 전용이었으므로 함께 제거
- `EstateItem` 타입 import는 유지 (`estateItems` props 계속 사용)
- 정리 후 `npx tsc --noEmit` 0 확인

## 7. 테스트 골격

### 7.1 파일: `__tests__/components/gift-tax-valuation-form-table.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GiftTaxValuationFormTable } from "@/components/calc/results/GiftTaxValuationFormTable";

const cashItem = {
  id: "i1",
  category: "cash" as const,
  name: "현금",
};

describe("GiftTaxValuationFormTable", () => {
  it("GV-1: 현금 350M 1건 — ②=01 / ⑧=06 / ⑨=⑮=350M", () => {
    render(<GiftTaxValuationFormTable
      valuationResults={[{ estateItemId: "i1", method: "market_value", valuatedAmount: 350_000_000, breakdown: [], warnings: [] }]}
      estateItems={[cashItem]}
      grossGiftValue={350_000_000}
      exemptAmount={0}
      aggregatedGiftValue={350_000_000}
    />);

    const dataRow = screen.getByTestId("row-data-1");
    expect(within(dataRow).getByTestId("col-property-type")).toHaveTextContent("01");
    expect(within(dataRow).getByTestId("col-valuation-method")).toHaveTextContent("06");
    expect(within(dataRow).getByTestId("col-amount")).toHaveTextContent("350,000,000");

    expect(screen.getByTestId("row-9-gross")).toHaveTextContent("350,000,000");
    expect(screen.getByTestId("row-15-sum")).toHaveTextContent("350,000,000");
  });

  it("GV-2: 사용자 이미지 14 — ⑨=1B / ⑭=820M / ⑮=1.82B", () => {
    // Phase 1은 A11/A24 분리 없음 → 모든 본문 행이 ⑨ 합산.
    // 본 케이스는 ⑨=1.82B로 표시되며, ⑭=0. 사용자 이미지 14 정확 재현은 Phase 2 트리거 후
    // 별도 anchor (GV-2b)로 분리. 본 anchor는 grossGiftValue=1B + aggregatedGiftValue=1.82B + exempt=0
    // 입력을 받았을 때 ⑨=1B / ⑭=820M / ⑮=1.82B를 검증.
    render(<GiftTaxValuationFormTable
      valuationResults={[{ estateItemId: "i1", method: "market_value", valuatedAmount: 1_000_000_000, breakdown: [], warnings: [] }]}
      estateItems={[cashItem]}
      grossGiftValue={1_000_000_000}
      exemptAmount={0}
      aggregatedGiftValue={1_820_000_000}
    />);
    expect(screen.getByTestId("row-9-gross")).toHaveTextContent("1,000,000,000");
    expect(screen.getByTestId("row-14-add")).toHaveTextContent("820,000,000");
    expect(screen.getByTestId("row-15-sum")).toHaveTextContent("1,820,000,000");
  });

  it("GV-3: 자산 3건 + 빈 행 7개 — tbody tr count = 10", () => {
    const items = [1, 2, 3].map(i => ({ id: `i${i}`, category: "cash" as const, name: "현금" }));
    const vrs = items.map(it => ({
      estateItemId: it.id, method: "market_value" as const,
      valuatedAmount: 100_000_000, breakdown: [], warnings: [],
    }));
    render(<GiftTaxValuationFormTable
      valuationResults={vrs} estateItems={items}
      grossGiftValue={300_000_000} exemptAmount={0} aggregatedGiftValue={300_000_000}
    />);
    const tbody = screen.getByTestId("table-data-tbody");
    expect(tbody.querySelectorAll("tr")).toHaveLength(10);
  });

  it("GV-4: 자산 12건 — tbody tr count = 12 (양식 늘어남)", () => { /* 동일 패턴 */ });

  it("GV-5: 자기일관성 (음수 가드)", () => {
    // gross=100M / exempt=200M (>gross) / aggregated=50M → ⑮ = max(0, 100−200) + 50 = 50
    render(<GiftTaxValuationFormTable
      valuationResults={[{ estateItemId: "i1", method: "market_value", valuatedAmount: 100_000_000, breakdown: [], warnings: [] }]}
      estateItems={[cashItem]}
      grossGiftValue={100_000_000} exemptAmount={200_000_000} aggregatedGiftValue={50_000_000}
    />);
    expect(screen.getByTestId("row-15-sum")).toHaveTextContent("50,000,000");
    expect(screen.getByTestId("row-10-exempt")).toHaveTextContent("200,000,000");
  });

  it("GV-6: 재산종류코드 매핑 9종 (AssetCategory 실제 enum)", () => {
    const cases = [
      ["cash", "01"], ["real_estate_land", "02"], ["real_estate_apartment", "05"],
      ["real_estate_building", "07"],
      ["listed_stock", "09"], ["unlisted_stock", "10"],
      ["financial", "11"], ["deposit", "12"], ["other", "12"],
    ] as const;
    cases.forEach(([cat, code]) => { /* render + col-property-type === code 검증 */ });
  });

  it("GV-7: 평가기준코드 매핑 6종", () => { /* 동일 패턴 */ });

  it("GV-8: ① 재산구분코드 (Phase 1은 모두 A11)", () => {
    // priorGiftValuationResults 미사용 시 모든 행 ①=A11 검증
  });
});
```

### 7.2 data-testid 컨벤션 (전수 enumeration)

| testid | 위치 |
|---|---|
| `table-data-tbody` | 본문 표 `<tbody>` |
| `row-data-{n}` | 본문 데이터 행 (n=1~) |
| `row-empty-{n}` | 본문 빈 행 |
| `col-property-class` | ① 재산구분코드 칸 |
| `col-property-type` | ② 재산종류코드 칸 |
| `col-overseas` | 국외자산 여부 칸 |
| `col-country` | 국외재산 국가명 칸 |
| `col-name` | ③ 소재지·법인명 등 칸 |
| `col-biz-no` | ④ 사업자등록번호 (지분율) 칸 |
| `col-shares` | ⑤ 수량 (면적) 칸 |
| `col-unit-price` | ⑥ 단가 칸 |
| `col-amount` | ⑦ 평가가액 칸 |
| `col-valuation-method` | ⑧ 평가기준코드 칸 |
| `row-9-gross` | ⑨ 증여재산가액 행 (금액 칸) |
| `row-10-exempt` | ⑩ 비과세재산가액 |
| `row-11-public-interest` | ⑪ 공익법인 출연재산가액 |
| `row-12-public-trust` | ⑫ 공익신탁 재산가액 |
| `row-13-disabled-trust` | ⑬ 장애인 신탁재산가액 |
| `row-14-add` | ⑭ 증여재산가산액 |
| `row-15-sum` | ⑮ 합계 |

## 8. 자가 점검 (Plan §10 ↔ Design 매핑)

| Plan 완료조건 | Design 대응 |
|---|---|
| `GiftTaxValuationFormTable.tsx` 신규 ~280줄 | §3, §4, §5 (구조·매핑·스타일) |
| `GiftTaxResultView.tsx` 평가 내역 카드 교체 | §6 |
| anchor 8건(GV-1~8) PASS | §7 (testid 컨벤션) |
| ⑩ 음수 가드 | §3.2 `computeRow10` |
| ⑭ 산식 정정 | §3.2 `computeRow14` |
| ⑪/⑫/⑬ 분리값 직접 매핑 | §3.1 Props |
| 「개정 2026. 3. 20.」 라벨 | §4 양식 헤더 |
| print 자동 펼침 | §5.4 + §6.1 |
| 외부 CSS 금지 | §5.1 |

## 9. 비기능 요구사항

- **접근성**: 표에 `<caption className="sr-only">증여재산 및 평가명세서</caption>` + `<th scope="col">` 명시
- **인쇄 정렬**: A4 1쪽 (210mm × 297mm). Margin top/left 15mm 권장 (CSS `@page { margin: 15mm; }` — 단, 기존 `app/globals.css` 의 print 룰 충돌 없으면 생략)
- **i18n**: 양식 라벨 한글 단독 (한자 혼용 금지)
- **번호 단위 "원" 미부착**: `formatKRW(n)` 결과 끝에 "원" 미부착 ([[feedback-no-won-suffix]])

## 10. 디자인 단계 미결 (Plan §8 위험 환류)

| ID | 항목 | 처리 |
|---|---|---|
| D-1 | EstateItem 카테고리 — 부표 1 코드 04(개별주택)·06(오피스텔·상업용건물)·08(취득권리)·13(가상자산)·14(서화골동품) 부재. 또한 03(일반건물 부수토지)는 EstateItem 자체로 구분 불가 | Phase 1: 매핑되지 않은 코드는 fallback 처리 — `real_estate_apartment`는 05(공동주택), `real_estate_building`은 07(일반건물)로 통일. 사용자가 입력한 오피스텔·상업용건물도 07로 표시. 후속 PR에서 EstateItem 카테고리 분리 + 매핑 추가 |
| D-2 | ValuationMethod `expropriation`(03)·`auction`(04)·`mortgage_special`(07) 부재 | Phase 1: fallback "08" — 사용자에게 보충적 평가로 표시되는 한계. 후속 PR |
| D-3 | ~~사전증여 행 ①=A24 분리~~ | ✅ **2026-05-20 해결**: `priorGifts: PriorGift[]` prop으로 본문 행 분리. ②=12(기타재산) / ⑧=08(보충적 평가) 기본 매핑. PriorGift는 자산 평가 정보 부재로 `describePriorGift()` 라벨 사용("사전증여 (YYYY-MM-DD)"). GV-9 anchor 통과. |
| D-4 | 비거주자 신분(A25/A26) | Phase 2 (donor·donee 거주자 입력 필요) |
| D-5 | 부표 5 (서화·골동품) 의무 동반 | 재산종류 14 미지원으로 Phase 1 무관 |

## 11. 정책·메모리 참조

- ★ [[feedback-pdf-table-row-one-to-one-mapping]] — testid에 부표 칸 번호 동결 (`row-9-gross`, `row-15-sum` 등)
- ★ [[feedback-korean-law-82-vs-81-2-drift]] — 양식 헤더는 KoreanLaw MCP 검증 본문 라벨 그대로 사용
- ★ [[feedback-no-won-suffix]] — `formatKRW` 결과 끝 "원" 미부착
- ★ [[feedback-pdca-session-efficiency]] — 케이스 매트릭스 §2에서 9건 사전 enumerate
