# 소칙 §81④ 월할 가산 — 엔진 설계 (stock-transfer PR-2)

> 계획: `docs/00-pm/stock-transfer-monthly-accrual-81-4.plan.md` · 작성 2026-06-12
> 법령: 시행령 §165⑤ 후단 → §165⑨ 준용 → 소칙 §81④ (KoreanLaw 축자 2026-06-12, MST 286211·286379)

## 1. 케이스 인벤토리

| # | 케이스 | 평가액 동일 | 토글(1호) | 전전 입력 | 엔진 동작 | anchor |
|---|---|---|---|---|---|---|
| C-1 | 본칙 | ✕ | OFF | — | 현행 환산 (불변) | 사례 48 (5,824) |
| C-2 | 2호 | ✓ | OFF | — | 보정 없음 + 2호 안내, `monthlyAccrualApplied=false` | PL-MONTHLY-1 재산정 |
| C-3 | 1호 보정 | ✓ | ON | ✓ | 분모 교체 보정, `monthlyAccrualApplied=true` + detail echo | A-MA-1 |
| C-4 | 1호 미입력 | (무관) | ON | ✕ | warning + 보정 미적용 (validate 1차 차단) | A-MA-7 |
| C-5 | 1호 하락 | ✓ | ON | ✓ (전전>직전) | 법문 그대로 — ratio>1 | A-MA-4 |
| C-6 | 보정 ≤ 0 | ✓ | ON | ✓ (극단) | 환산 불가 가드 | A-MA-5 |
| C-7 | 토글 잔존 | ✕ | ON | — | 무시 + warning | A-MA-6 |
| C-3m | C-3 변형: 1개월 미만 절상 | ✓ | ON | ✓ | m = max(1, 끝수 절상) | A-MA-3 |

## 2. Input 타입 (`types/stock-transfer.types.ts` — `StockTransferInput` 확장)

```ts
/** §81④ 1호 — 취득일이 속하는 사업연도의 전전사업연도 1주당 순손익가치 (월할 가산 전용, 전 모드 직접 입력) */
prePriorYearNetIncomePerShare?: number;
/** §81④ 1호 — 전전사업연도 1주당 순자산가치 */
prePriorYearNetAssetPerShare?: number;
/** §81④ 1호 — 직전사업연도의 월수 (1~12, 미입력 시 12 — 사업연도 변경 법인 대응) */
priorBizYearMonths?: number;
```

- 1호/2호 구분 입력: 기존 `postListingDetail.monthlyAccrualToggle` 재사용 (신규 배선 0 — 폼·Zod·adapter 기존 완비, 엔진 읽기만 추가).
- `synthesizePostListingInput`(`post-listing-flat-adapter.ts:459`)은 `...input` spread → 신규 3필드 자동 통과 (확인 완료).

## 3. Result 타입 (`PostListingValuationResult` 확장)

```ts
/** §81④ 1호 보정 상세 (C-3·C-5 발동 시만) */
monthlyAccrualDetail?: {
  prePriorYearPerShareValue: number;        // 전전사업연도 가중평균 (H-04 재사용)
  holdingMonths: number;                    // 절상 후 보유월수 m
  priorBizYearMonths: number;               // 분모 월수 d (echo)
  adjustedListingYearPerShareValue: number; // 보정 상장일 평가액 = 새 분모
};
```

- `monthlyAccrualApplied` 의미 재정의: "평가액 동일 감지"(PR-1) → "**보정 실제 발동**"(C-3·C-5만 true). plain object (Map 금지).
- 소비처 실측 2곳: `PostListingDetailCard.tsx:93` 배지(문구 동시 갱신), PL-MONTHLY-1·3 anchor(재산정).

## 4. 알고리즘 (`calcPostListingConversion` `:253-272` 교체)

```ts
// 신규 import (현재 본 모듈에 date-fns 없음 — 실측):
import { differenceInMonths, addMonths } from "date-fns";

// ── 신규 헬퍼 (모듈 내 export — UI Preview·validate 재사용) ──

/** §81④ 보유월수 — 1개월 미만의 월수는 1개월로 본다 (절상) */
export function calcAccrualMonths(acquisitionDate: Date, listingDate: Date): number {
  const full = differenceInMonths(listingDate, acquisitionDate);
  const hasRemainder = addMonths(acquisitionDate, full) < listingDate;
  return Math.max(1, full + (hasRemainder ? 1 : 0));
}

// ── 분기 (기존 :257 트리거 유지) ──
const valuesEqual = acquisitionYearPerShareValue === listingYearPerShareValue;
const toggle = postListingDetail?.monthlyAccrualToggle === true;
const hasPrePrior =
  typeof input.prePriorYearNetIncomePerShare === "number" &&
  typeof input.prePriorYearNetAssetPerShare === "number" &&
  input.listingDate instanceof Date;               // D1-3: listingDate 부재도 C-4 합류

let denominator = listingYearPerShareValue;       // 환산식 분모 (기본 = 현행)
let monthlyAccrualApplied = false;
let monthlyAccrualDetail: ... | undefined;

if (!valuesEqual && toggle) {
  warnings.push(C7_안내);                          // C-7: 무시
} else if (valuesEqual && !toggle) {
  warnings.push(2호_안내);                         // C-2: 보정 없음
} else if (valuesEqual && toggle && !hasPrePrior) {
  warnings.push(C4_안내);                          // C-4: 엔진 방어 (전전 미입력 또는 listingDate 부재)
} else if (valuesEqual && toggle && hasPrePrior) { // C-3·C-5·C-6·C-3m
  const prePrior = calcUnlistedPerShareWeighted(   // H-04 재사용 (80% 하한 미적용 동일)
    input.prePriorYearNetIncomePerShare!, input.prePriorYearNetAssetPerShare!, isHeavyRE);
  const m = calcAccrualMonths(input.acquisitionDate, input.listingDate!);
  const d = input.priorBizYearMonths ?? 12;
  const prior = acquisitionYearPerShareValue;
  // 분수 정수 연산 1회 floor — 음수 차이(C-5)도 방향 일관
  const adjusted = Math.floor((prior * d + (prior - prePrior) * m) / d);
  if (adjusted <= 0) {
    // C-6: denominator 교체·applied 대입 전 early return — applied=false 보장
    warnings.push("월할 보정 평가액이 0 이하입니다. 환산 불가.");
    return { ...영값_반환(기존 :238 가드와 동일 형태), monthlyAccrualApplied: false };
  }
  denominator = adjusted;
  monthlyAccrualApplied = true;
  monthlyAccrualDetail = { prePriorYearPerShareValue: prePrior, holdingMonths: m,
                           priorBizYearMonths: d, adjustedListingYearPerShareValue: adjusted };
  appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
}

// ── 환산 (보정 경로만 분수 정수 — 비보정 경로는 기존 ratio 부동소수 유지, 사례 48 불변) ──
const conversionRatio = acquisitionYearPerShareValue / denominator;
const finalPerShareValue = monthlyAccrualApplied
  ? Math.floor((listingDatePriceAvg1Month * acquisitionYearPerShareValue) / denominator)
  : Math.floor(listingDatePriceAvg1Month * conversionRatio);  // 기존식 그대로
```

- `listingDate`는 보정 경로에서 필수 — 기존 validate가 `acquiredBeforeListing` 시 listingDate 차단 중(`validate-step2.ts:179` 실측) → UI 경로는 도달 불가, 엔진 방어는 `hasPrePrior` 조건 합류로 처리.
- **결과 카드 표기 정합**: `PostListingDetailCard.tsx:59-64`(실측)가 `conversionRatio.toFixed(5)` + "종가평균 × 환산비율 (절사)" 표기 — 보정 시 ratio echo = `prior/adjusted`이므로 표기 산식과 분수 정수 결과가 일치(A-MA-1: 8,001×0.88237→7,059). IEEE754 경계 불일치는 anchor 원단위 고정으로 방어.
- **안내 문구 설계** (PL-MONTHLY-3 문구 체크 `"§81④"||"월할"` 유지 조건 — 두 경로 모두 "§81④" 포함):
  - C-2: "취득일·상장일 직전 사업연도 평가액이 동일하나 동일 사업연도 취득·상장(토글)이 아니므로 소칙 §81④ 2호에 따라 상장일 평가액을 그대로 적용합니다."
  - C-4: "소칙 §81④ 1호 월할 가산에 필요한 전전사업연도 평가(또는 상장일)가 입력되지 않아 보정을 적용하지 못했습니다." (listingDate 부재 포함 통합 문구)
- docstring 정정 동반: `:24-27` 2단 조건(⑤ 후단 평가액 동일 → §81④ 1호/2호)·`:17` 가중치 반전 stale 주석 삭제.

## 5. anchor (원단위 toBe — 공통: listingAvg 8,001·직전 32,000·shareCount 5,000·날짜 override 필수)

| # | 입력 | 중간값 | 기대값 |
|---|---|---|---|
| A-MA-1 | 전전 NI 40,000/NA 4,000(→25,600)·취득 2024-03-15·상장 2024-10-20·d=12 | m=8 · adjusted=floor(435,200/12)=**36,266** | final **7,059** · 총 **35,295,000** |
| A-MA-3 | 취득 2024-06-01·상장 2024-06-20 | m=1 · adjusted=**32,533** | final **7,869** |
| A-MA-4 | 전전 NI 62,500/NA 6,250(→40,000)·취득 2024-03-15·상장 2024-10-20(m=8)·d=12 | adjusted=floor(320,000/12)=**26,666** | final **9,601** (>8,001 — 법문 그대로) |
| A-MA-5 | 극단 하락 → adjusted≤0 | — | 환산 불가 warning·final 0 |
| A-MA-6 | 평가 상이+토글 ON | — | 본칙 결과 불변+warning |
| A-MA-7 | 토글 ON·전전 미입력 | — | warning+보정 미적용·applied=false |
| 재산정 | PL-MONTHLY-1·3 | — | applied true→**false**·ratio 1·final 8,001·문구 유지 |
| 회귀 | 사례 48·PL-MONTHLY-2 | — | **5,824 불변** |

검산: 8,001×32,000=256,032,000 → ÷36,266=7,059(잔 30,306) · ÷32,533=7,869(잔 29,823) · ÷26,666=9,601(잔 11,734).

## 6. 파일·줄수 계획

| 파일 | 변경 | 비고 |
|---|---|---|
| `stock-valuation-post-listing.ts` (288줄) | +~70줄 (calcAccrualMonths + 분기) | 800줄 여유 충분 |
| `types/stock-transfer.types.ts` | input 3필드 + monthlyAccrualDetail | |
| `post-listing-detail.extra.test.ts` | 재산정 2 + 신규 6 | **같은 파일 추가 확정** — 실측 370줄/16 it, 분할 기준(1,500줄/50 it) 미달 |

## 7. 확인 필요 (Pre-Do)

- 월수 절상 규칙(끝수 +1) 해석례 — KoreanLaw 검색 1회 (미확보 시 보수 해석 채택 명시)
- A-MA-1 실패 anchor 우선 실행 (`feedback_pre_anchor_verification`)
