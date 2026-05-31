# 상속공제 항목별 계산근거 detail 노출 — 엔진 설계

> 계획: `docs/00-pm/inheritance-deduction-breakdown-expandable.plan.md`
> UI: `inheritance-deduction-breakdown.ui.design.md`

## Context

결과 화면 "상속공제 상세 내역"의 각 공제(일괄·가업·배우자·금융·동거·적용한도)는 현재 최종 금액 Row 1줄만 표시. 사용자는 교재 종합사례(이미지42~43)처럼 **각 항목 펼침 시 계산 근거 표·산식**을 보길 원함. **모든 중간값은 이미 엔진이 계산** → result `detail`로 노출만 하면 됨(②가업만 기존 완비). 금융 4행 분해(D-1 A)·배우자 채무분리(D-2 A)는 estateItems/debtItems 자동 집계.

---

## ★ 케이스 인벤토리 (행=anchor 약속)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 | 상태 |
|---|---------|----------|-------------|--------|------|
| 1 | 일괄 vs 항목별 — 기초2억+인적1억<5억 → 일괄 선택 | §21① | 교재 ① (소계 300m·Max 500m) | `deduction-detail-accordion.test.ts` A-1 | ☐ |
| 2 | 배우자 법정상속분 분자 7행(Phase D 발동) | §19①1호 | 교재 ③㉮ 7,590m·3,252,857,142·legalShare 3,092,857,142 | A-2/A-3/A-4/A-5 | ☐ |
| 3 | 배우자 실제상속액 채무분리 (D-2 A) | 집행기준 19-17-1 | 교재 ③㉯ 3,300m−500m=2,800m | A-11 | ☐ |
| 4 | 배우자공제 Max[Min(㉮,㉯,30억),5억] | §19①·④ | 교재 ③ 2,800m·floorApplied false | A-6 | ☐ |
| 5 | 금융 4행 분해 자동집계 (D-1 A) | §22①·② | 교재 ④ 예금2,100m·주식150m·보험50m·채무1,145m·순1,155m | A-7b | ☐ |
| 6 | 금융공제 tier3 20%·한도 | §22①3호 | 교재 ④ raw 231m→capped 200m | A-7 | ☐ |
| 7 | 동거주택 Min[가액×100%,6억] | §23의2① | 교재 ⑤ 800m×100%→600m | A-8 | ☐ |
| 8 | §24 적용한도 ceiling + 분해 | §24 본문·각호 | 교재 ⑥ ceiling 5,965m·rawTotal 4,600m·wasCapped false | A-9/A-10 | ☐ |
| 9 | 배우자 단순케이스(Phase D 미발동) → legalShareTable undefined | §19① | legalShare 단일값만(7행 생략) | A-12 | ☐ |
| 10 | 가업 ② 기존 familyBusinessDetail 재사용(신규 detail 불요) | §18의2 | 교재 ② 영위25년→한도400억·500m | (기존 anchor) | ✅ |

**규칙**: 행 추가 → anchor 추가 → 코드. ②가업은 기존 detail로 충족.

---

## 법령 근거 (KoreanLaw mst 276123 검증)

- **§21①** 일괄공제 = Max(기초§18 + 인적§20①, 5억). 배우자공제 비교 대상 아님.
- **§19①1호** 배우자 한도 = `(A − B + C) × D − E`. A=상속재산가액, B=상속인외 유증, C=§13①1호 사전증여, D=법정상속분율(민법 §1009), E=배우자 사전증여 과세표준. §19④ 5억 최소, §19①2호 30억 한도.
- **§22①** 금융재산공제: 2천만 이하 전액 / 2천만 초과 max(20%, 2천만) / 한도 2억. §22② 최대주주 보유주식·공익법인 출연분 제외.
- **§23의2①** 동거주택 100%(2020.1.1.~), 담보채무 차감 후, 한도 6억.
- **§24** ceiling = 과세가액 − 1호(상속인외 유증) − 2호(상속포기 후순위) − 3호(사전증여가산 − §53·§53의2·§54 공제). **단서: 3호는 과세가액 5억 초과 시에만 적용** (현재 엔진 미구현 — 갭).

상수: `lib/tax-engine/legal-codes/inheritance-gift.ts` INH.* 사용.

---

## 엔진 result 타입 (신규 파일 `types/inheritance-deduction-detail.types.ts`)

```ts
export interface LumpSumComparisonDetail {        // ① §21
  basicDeduction: number; personalDeductionTotal: number; itemizedSubtotal: number;
  lumpSumAmount: number; selectedAmount: number;
  selectedMethod: "lump_sum" | "itemized"; spouseSoleHeirExclusion: boolean;
}
export interface SpouseLegalShareTable {          // ③㉮ 7행 (Phase D 발동 시만)
  grossPlusPresumed: number; heirPriorGiftAdded: number; legateeNonHeirDeducted: number;
  debtDeducted: number; exemptDeducted: number; numerator: number;       // (A−B+C) 분자 = 상속재산가액 (교재 7,590m)
  spouseRatio: number; spouseLegalShareRaw: number;                       // floor(numerator×ratio) = 교재 3,252,857,142
  spouseGiftTaxBaseDeducted: number; legalShare: number;
}
export interface SpouseActualAmountTable {        // ③㉯ (D-2 A)
  spouseEstateValue: number; spouseDebtDeducted: number; spouseExemptDeducted: number; actualAmount: number;
}
export interface SpouseDeductionDetail {          // ③
  legalShareTable?: SpouseLegalShareTable;        // Phase D 미발동 시 undefined
  actualAmountTable?: SpouseActualAmountTable;
  capAmount: number;                              // 30억
  legalShareCapped: number; actualAmountCapped: number; baseBeforeFloor: number;
  floorApplied: boolean; deduction: number;
}
export interface FinancialBreakdownRow { label: string; amount: number; }
export interface FinancialDeductionDetail {       // ④ (D-1 A)
  rows: FinancialBreakdownRow[];                  // 예금·상장주식·보험금·소계·(−)금융채무 (orchestrator가 estateItems/debtItems 집계 주입; calcFinancialDeduction은 산식 필드만 반환)
  netFinancial: number; bracket: "tier1" | "tier2" | "tier3"; rate: number;
  rawDeduction: number; cappedDeduction: number; cap: number;
}
export interface CohabitDeductionDetail {         // ⑤
  housingValue: number; securedDebt: number; base: number; rate: number;
  rawDeduction: number; cap: number; cappedDeduction: number;
}
export interface DeductionLimitCeilingDetail {    // ⑥ §24
  taxableEstateValue: number; legateeAmountNonHeir: number; heirWaiverAmount: number;
  totalPriorGiftAmount: number; priorGiftDeductionTotal: number; disasterLossDeduction: number;
  netPriorGiftDeducted: number; ceiling: number;
  rawTotalDeduction: number; wasCapped: boolean; limitedDeduction: number;
}
```

`InheritanceDeductionResult`(types/inheritance-gift.types.ts:772)에 optional 추가:
`lumpSumComparisonDetail?` `spouseDeductionDetail?` `financialDeductionDetail?` `cohabitDeductionDetail?` `deductionLimitDetail?` `rawTotalDeduction?`. (가업=기존 `familyBusinessDetail`)

---

## 계산 알고리즘 (각 detail 채우는 위치 — 신규 계산 없음)

1. **lumpSumComparisonDetail**: `calcInheritanceDeductions:645~660` 지역변수(itemizedTotal·LUMP_SUM·chosenMethod·isSpouseSoleHeir) 조립 → return.
2. **financialDeductionDetail**: `calcFinancialDeduction:170~199` `rawDeduction` 변수 분리 + 반환 `detail`. **rows[] 4행**은 orchestrator(`inheritance-tax.ts`)가 estateItems(category financial/listed_stock·deemed insurance) + debtItems(category financial) 집계(§22② 최대주주 제외 = `isSection22MajorShareholderExcluded` 로직 엔진 이식) 후 주입.
3. **cohabitDeductionDetail**: `calcCohabitationDeduction:206~244` base·rate·raw·deduction 조립. directAmount 모드 별도.
4. **deductionLimitDetail**: `applyDeductionLimit:558~591` 반환 확장(ceilingDetail + rawTotalDeduction echo). 지역변수 totalGift·giftDeductions·legateeNonHeir 조립.
5. **spouseDeductionDetail.legalShareTable**: `inheritance-tax.ts:244~304` Phase D closure(numeratorCorrected·spouseRatio·spouseGiftTaxBase·computedSpouseLegalShare) 조립 후 orchestrator patch. **Phase D 미발동 시 undefined**(case 9).
6. **spouseDeductionDetail.actualAmountTable**: orchestrator가 estateItems/debtItems 배우자 귀속분(`heirAllocations`) 집계(`suggestSpouseActualAmount` 로직 — lib/calc import 금지, 엔진 이식).
7. **spouseDeductionDetail Min/Max**: `calcSpouseDeduction:142~146` baseAmount 등 중간값 반환.

---

## Silent fallback / 자동 안분 식별

- detail은 **노출 전용**(계산 결과 echo) — 자동 안분 아님.
- 금융 rows[]·배우자 actualAmountTable 집계는 estateItems/debtItems **실제 입력값** 기반 — 빈 값 자동 채움 아님(`feedback_no_silent_apportion_fallback` 위반 아님).
- legalShareTable undefined(Phase D 미발동)은 데이터 부재의 정직한 표현(허위 0 채움 금지).

---

## 레이어 규칙 (필수)

엔진(`lib/tax-engine`)은 `lib/calc/*`(financial-deduction-resolver·inheritance-deduction-suggest) **import 금지**(역방향). 집계 로직을 엔진으로 이식하거나 orchestrator에서 수행.

---

## 테스트 약속

`__tests__/tax-engine/inheritance/deduction-detail-accordion.test.ts` — 교재 원단위 toBe:
- A-1 itemizedSubtotal 300m·selected 500m / A-2 numerator 7,590m / A-3 spouseRatio 1.5/3.5·raw 3,252,857,142 / A-4 legalShare 3,092,857,142 / A-5 spouseGiftTaxBase 160m / A-6 배우자공제 2,800m·floorApplied false / A-7 금융 raw 231m·capped 200m / A-7b 분해 예금2,100m·주식150m·보험50m·채무1,145m·순1,155m / A-8 동거 600m / A-9 ceiling 5,965m·rawTotal 4,600m·wasCapped false / A-10 legatee 500m·priorGift 2,960m·giftDeduction 600m·disasterLoss 50m / A-11 actualAmount 2,800m / A-12 단순케이스 legalShareTable undefined.

---

## UI 통합 위임

UI 명세 = `inheritance-deduction-breakdown.ui.design.md`. result detail(서버→클라) 확장이므로 14지점 입력측(①~④⑧⑨~⑭) **무영향**(estateItems/debtItems 기존 전달) — UI ⑦ 결과 카드 중심.
