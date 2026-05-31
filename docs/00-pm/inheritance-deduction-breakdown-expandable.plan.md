# 상속공제 각 항목 펼침 — 교재 동일 계산 근거 표시 계획서

> 작성 2026-05-31. 엔진(`inheritance-gift-deduction-senior`) + UI(`inheritance-gift-tax-ui-senior`) 시니어 Plan 병렬 산출 통합.
> 목표: 결과 화면 "상속공제 상세 내역"의 각 공제 항목(일괄·가업·배우자·금융·동거·적용한도)에 펼침(▼) 추가 → 클릭 시 교재 종합사례(이미지42~43)와 **동일한 계산 근거 표/산식** 표시.

## 1. 배경

- **현재**(이미지41): 각 공제는 `label-value` Row 1줄 + 일부 인라인 안내만. "왜 그 금액인가"의 계산 과정 미표시.
- **목표**(이미지42~43): 항목 클릭 시 교재 ①~⑥의 표·산식을 그대로 재현.

## 2. 핵심 발견 (실측 — 추정 아님)

**모든 중간값은 이미 엔진이 계산하고 있다.** 신규 계산은 없고, closure/지역변수를 result `detail`로 **노출**만 하면 된다.

| 교재 항목 | 엔진 계산 | result 노출 | 비고 |
|---|---|---|---|
| ① 일괄 vs 항목별 비교 | ✅ | 부분 (개별값만, 소계·선택근거 없음) | `calcInheritanceDeductions:645~660` |
| ② 가업상속공제 | ✅ | ✅ `familyBusinessDetail` | 영위연수·한도·금액 이미 노출 |
| ③-㉮ 배우자 법정상속분 7행 | ✅ | ❌ | `inheritance-tax.ts:244~304` closure (breakdown 1행만) |
| ③-㉯ 배우자 실제상속액 | ✅(부분) | ❌ | `calcSpouseDeduction` breakdown 1행 |
| ③ Max[Min(㉮,㉯,30억),5억] | ✅ | 최종값만 | `calcSpouseDeduction:142~146` |
| ④ 금융 순금융재산 분해(예금·주식·보험) | ⚠️ estateItems에 종류별 존재 | ❌ | 입력은 `netFinancialAssets` 단일값이나 estateItems category로 분해 집계 가능 (D-1 A 결정) |
| ④ 금융공제 20%·한도 산식 | ✅ | breakdown만 | `calcFinancialDeduction:170~199` |
| ⑤ 동거주택 Min[가액×율,6억] | ✅ | 최종값만 | `calcCohabitationDeduction:206~244` |
| ⑥ 적용한도 ㉮합계·㉯ceiling 분해 | ✅ | ceiling만 (분해 6항목 없음) | `applyDeductionLimit:558~591` |

→ **②만 완비. 나머지는 detail 노출 필요. ④ 4행 분해만 신규 데이터 필요(미입력).**

## 3. 설계 — 엔진 (result detail 단일 진실)

> 정책: UI가 breakdown 문자열을 파싱하지 않는다(`feedback_ui_engine_dual_truth_avoidance`). 엔진이 구조화된 detail을 제공하고 UI는 소비만.

### 3-1. 신규 타입 — `lib/tax-engine/types/inheritance-deduction-detail.types.ts` (신규 파일, 800줄 정책)

```ts
LumpSumComparisonDetail   // ① basic·personal·itemizedSubtotal·lumpSum·selected·method·spouseSoleExclusion
SpouseLegalShareTable     // ③㉮ grossPlusPresumed·heirPriorGiftAdded·legateeNonHeirDeducted·debtDeducted·exemptDeducted·numerator·spouseRatio·spouseLegalShareRaw·spouseGiftTaxBaseDeducted·legalShare
SpouseActualAmountTable   // ③㉯ spouseEstateValue·spouseDebtDeducted·spouseExemptDeducted·actualAmount
SpouseDeductionDetail     // ③ legalShareTable·actualAmountTable(D-2 A 채무분리 필수)·capAmount(30억)·legalShareCapped·actualAmountCapped·baseBeforeFloor·floorApplied·deduction
FinancialDeductionDetail  // ④ rows[]{label,amount}(예금·상장주식·보험금·소계·금융채무 — D-1 A)·netFinancial·bracket(tier1/2/3)·rate·rawDeduction·cappedDeduction·cap
CohabitDeductionDetail    // ⑤ housingValue·securedDebt·base·rate·rawDeduction·cap·cappedDeduction
DeductionLimitCeilingDetail // ⑥ taxableEstateValue·legateeAmountNonHeir·heirWaiverAmount·totalPriorGiftAmount·priorGiftDeductionTotal·disasterLossDeduction·netPriorGiftDeducted·ceiling·rawTotalDeduction·wasCapped·limitedDeduction
```

`InheritanceDeductionResult`에 optional 추가 (기존 불변): `lumpSumComparisonDetail?` `spouseDeductionDetail?` `financialDeductionDetail?` `cohabitDeductionDetail?` `deductionLimitDetail?` `rawTotalDeduction?`.

### 3-2. 채우는 위치 (신규 계산 없음, 조립만)

| detail | 위치 | 방법 |
|---|---|---|
| lumpSumComparison | `calcInheritanceDeductions` return 직전 | 기존 지역변수 조립 |
| financial | `calcFinancialDeduction` | `rawDeduction` 변수 분리 + 반환 `detail` |
| cohabit | `calcCohabitationDeduction` | 기존 `base·rate·raw·deduction` 조립 (direct 모드 별도) |
| deductionLimit | `applyDeductionLimit` | 반환 `ceilingDetail` + `rawTotalDeduction` echo |
| spouse legalShareTable | `inheritance-tax.ts:244~304` | closure 값 조립 후 orchestrator patch `deductionResult.spouseDeductionDetail` |
| spouse Min/Max | `calcSpouseDeduction:142~146` | `baseAmount` 등 중간값 반환 추가 |

## 4. 설계 — UI (컴포넌트 분리 + 펼침)

### 4-1. 분리 (800줄 정책 — 현재 결과뷰 800줄)

```
components/calc/results/deduction-breakdown/
├── shared.tsx                      Row·formatBillion·LawBadge 이관(+re-export 보존)
├── DeductionBreakdownSection.tsx   헤더 토글 + 항목 목록 (메인은 1줄 위임)
├── LumpSumDetailCard.tsx           ① 비교표
├── SpouseDeductionDetailCard.tsx   ③ 법정상속분 7행 + 실제상속액 + Max[Min]
├── FinancialDeductionDetailCard.tsx ④ 순금융재산 표 + 20%·한도
├── CohabitDeductionDetailCard.tsx  ⑤ Min[가액×율,6억]
├── FamilyBusinessDetailCard.tsx    ② 한도표(기존 Row 흡수·확장)
├── FarmingDeductionDetailCard.tsx  영농(기존 Row 흡수, re-export 보존)
└── DeductionLimitDetailCard.tsx    ⑥ Min(합계,한도) + ㉯ 4행
```
→ 메인 결과뷰 ~580줄, 모든 신규 파일 ≤800.

### 4-2. 펼침 UX
- **각 공제 Row 우측 ▼ 버튼 + 인라인 펼침** (기존 "상속공제 상세 내역" 전체 토글과 동일 패턴). 각 카드 `useState` 독립.
- ToggleCard 미적용(결과 표시용 — 입력 분기 아님). 결과 산식 한국어 풀어쓰기·"원" 단위 표기 금지 준수.
- detail `undefined` 시 펼침 버튼 숨김(미입력·legacy).

## 5. 결정사항 (사용자 확정 2026-05-31)

| # | 항목 | 결정 |
|---|---|---|
| **D-1** | 금융 4행 분해 | ✅ **(A) estateItems category 자동 집계** — 예금·상장주식·보험금·금융채무를 종류별 자동 합산(`financial-deduction-resolver`의 `resolveFinancialEligibility`·`resolveFinancialDebt`·`isSection22MajorShareholderExcluded` 재사용, §22② 최대주주 제외 포함). 별도 입력 없음. |
| **D-2** | 배우자 실제상속액 채무분리 | ✅ **(A) 채무 차감 3행 표** (상속재산가액 − 채무 = 실제액) — estateItems/debtItems 배우자 귀속분 자동 집계(`suggestSpouseActualAmount` 로직 엔진화/재사용). 별도 입력 없음. |
| **D-3** | §24 ceiling·단서 | ✅ **ceiling = 5,965,000,000 확정** (엔진 산식 `8,775m − 500m − max(0, 2,960m − 650m)`, `inheritance-deductions.ts:577~580` 실측). 교재 본문 5,945m은 오타(표 합계 5,965m이 정답). §24 단서(KoreanLaw §24: 제3호는 과세가액 5억 **초과** 시에만 적용) — 교재(8,775m) 일치. **현재 엔진 단서 미구현(항상 3호 적용)** → 과세가액 ≤ 5억 케이스 갭(별도 후속, 교재 무관). |

## 6. 구현 단계 (Do 시 — 엔진 선처리 → UI)

1. **엔진**: detail 타입 신규 파일 + 6개 함수 detail 조립 + orchestrator patch (spouse) → anchor A-1~A-10 GREEN
2. **UI 단계0**: 결과뷰 800줄 분리 (shared + DeductionBreakdownSection, re-export 보존) → tsc 0
3. **UI 단계1**: 6개 DetailCard 펼침 구현 (detail 소비)
4. **Check**: 전체 회귀 0 + E2E(각 공제 펼침 → 교재값 표시) + 브라우저 수동
5. anchor: `__tests__/tax-engine/inheritance/deduction-detail-accordion.test.ts` (A-1~A-10 교재 원단위 toBe)

## 7. 14개 동기화 지점 영향

- D-1·D-2 모두 **estateItems/debtItems 자동 집계** 채택 → **입력 신규 필드 없음**. 엔진 함수(`calcInheritanceDeductions`·`calcFinancialDeduction`·orchestrator)에 estateItems/debtItems 전달(일부 `familyBusinessAux.estateItems`로 이미 전달) + result detail 확장.
- result는 서버→클라 확장이므로 동기화는 **⑦ 결과 카드 중심**. 엔진 함수 시그니처 변경 시 내부 호출부 동기화(엔진 한정, 14지점 입력측 ①~④⑧ 무영향).
- 금융 분해 집계는 엔진(`lib/tax-engine`)에서 `lib/calc/financial-deduction-resolver` import 금지(레이어 역방향) → resolver 로직을 엔진 측으로 이식하거나 orchestrator(`inheritance-tax.ts`)에서 집계 후 detail 주입. **Do 시 레이어 규칙 확인 필수.**
- 배우자 실제상속액 채무분리(D-2 A)도 동일 — `suggestSpouseActualAmount`(lib/calc)는 엔진 import 불가 → orchestrator(`inheritance-tax.ts`)에서 estateItems/debtItems 배우자 귀속분(`heirAllocations`) 집계 후 `actualAmountTable` 주입.

## 8. anchor 목록 (교재 원단위)

A-1 일괄 itemizedSubtotal 300,000,000·selected 500,000,000 / A-2 배우자 법정상속분 분자(상속재산가액) 7,590,000,000 / A-3 spouseRatio 1.5/3.5·spouseLegalShareRaw 3,252,857,142(=floor(7,590m×1.5/3.5)) / A-4 배우자 법정상속분 legalShare 3,092,857,142 / A-5 spouseGiftTaxBase 160,000,000 / A-6 배우자공제 2,800,000,000·floorApplied false / A-7 금융 rawDeduction 231,000,000·capped 200,000,000 / A-7b 금융 분해 예금 2,100,000,000·상장주식 150,000,000·보험금 50,000,000·금융채무 1,145,000,000·순금융재산 1,155,000,000 / A-8 동거 800,000,000×100%→600,000,000 / A-9 §24 ceiling **5,965,000,000**·rawTotal 4,600,000,000·wasCapped false·limited 4,600,000,000 / A-10 한도분해 legatee 500,000,000·priorGift 2,960,000,000·priorGiftDeduction 600,000,000·disasterLoss 50,000,000 / A-11 배우자 실제상속액 채무분리 3,300,000,000−500,000,000=2,800,000,000 / A-12 단순케이스(Phase D 미발동) legalShareTable undefined.

## 9. 리스크·결정

- 결과뷰 800줄 분리 시 `FarmingDeductionDetailRow` 등 export 보존 필수(`feedback_800line_split_export_preservation`).
- **배우자 `legalShareTable` 7행 표는 `inheritance-tax.ts` Phase D(정밀 산정 — legateeNonHeir>0·사전증여 등 옵트인) 발동 시만 채움.** 단순 케이스(Phase D 미발동)는 `calcSpouseDeduction` 기본 산정 → `legalShareTable` undefined, UI는 legalShare 최종값만 표시(7행 표 생략). 교재 케이스는 Phase D 발동(legatee 500m) → 7행 완전 재현.
- **가업상속공제(②)는 기존 `familyBusinessDetail`(operatingYears·appliedCap·deduction·ineligibleReasons) 재사용** — 신규 detail 불요. 한도표(10/20/30년 → 300/400/600억)는 UI 정적 상수.
- 각 모드별 detail 조립: 동거 `cohabitDirectAmount`·가업 `familyBusinessDirectAmount` 모드는 echo 값으로 조립.
- §24 ceiling 5,965,000,000 확정(V0 실증). §24 단서 미구현 갭은 과세가액 ≤ 5억 케이스 한정(별도 후속).
