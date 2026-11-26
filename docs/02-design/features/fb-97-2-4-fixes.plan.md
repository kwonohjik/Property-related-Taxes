# 가업상속공제 자산 양도 §97의2④ — 적용률 정밀도 · 법인가업 적용률 · 주식 양도 지원 수정 계획서

작성일: 2026-11-26 · 브랜치: `docs/fb-97-2-4-fix-plan` · 진행 순서(사용자 결정): **F-3 → F-2 → F-1**

대상: 「소득세법」 §97의2④(가업상속공제 적용 자산의 취득가액), 「소득세법 시행령」 §163의2③·④, 「상속세 및 증여세법 시행령」 §15⑤·㉑

---

## 1. 발견 목록

| ID | 등급 | 현상 | 세액 영향(실측) |
|---|---|---|---|
| **F-1** | 🔴 | 주식 양도 엔진·화면에 §97의2④ 경로가 없다 | 사례 산출세액 **89,875,000원 과소** |
| **F-2** | 🔴 | 상속세 엔진 적용률이 법인가업에도 `공제액 ÷ 가업상속 재산가액` — 양도일 2026.2.27. 이후 소령 §163의2③2호 산식 미반영 | 적용률 1 vs 0.8 / 0.3 vs 0.8 |
| **F-3** | 🟡 | 적용률을 소수 6자리로 반올림한 뒤 곱한다 | 의제 취득가 +268원 ~ +8,573원 · 결정세액 −88원 ~ −3,009원 |

> 순서 근거: F-1(주식)이 F-2의 법인가업 적용률을 그대로 쓰고, F-2의 이력 prefill이 F-3의 분수 입력 경로를 쓴다.

---

## 2. 법령 (KoreanLaw MCP 조회 — 2026-11-26)

### 2.1 「소득세법」 §97의2④ (MST 280405)

> ④ 「상속세 및 증여세법」 제18조의2제1항에 따른 공제(이하 이 항에서 "가업상속공제"라 한다)가 적용된 자산의 양도차익을 계산할 때 양도가액에서 공제할 필요경비는 제97조제2항에 따른다. 다만, 취득가액은 다음 각 호의 금액을 합한 금액으로 한다.
> 1. 피상속인의 취득가액(제97조제1항제1호에 따른 금액) × 해당 자산가액 중 가업상속공제가 적용된 비율(이하 이 조에서 "가업상속공제적용률"이라 한다)
> 2. 상속개시일 현재 해당 자산가액 × (1 - 가업상속공제적용률)

### 2.2 「소득세법 시행령」 §163의2③ — 양도일로 신·구가 갈린다

**구 ③** (시행 2026.2.1. 본, MST 282973 — 양도일 2026.2.26. 이전):

> ③ 법 제97조의2제4항을 적용할 때 가업상속공제적용률은 「상속세 및 증여세법」 제18조의2제1항에 따라 상속세 과세가액에서 공제한 금액을 같은 항 각 호 외의 부분 전단에 따른 가업상속 재산가액으로 나눈 비율로 하고, 가업상속공제가 적용된 자산별 가업상속공제금액은 가업상속공제금액을 상속 개시 당시의 해당 자산별 평가액을 기준으로 안분하여 계산한다.

**신 ③·④** (현행 MST 290841 · 개정 2026.2.27.):

> ③ … 가업상속공제적용률은 다음 각 호의 구분에 따른 비율로 한다.
> 1. 「소득세법」을 적용받는 가업(이하 이 조에서 "개인가업"이라 한다)의 경우: 「상속세 및 증여세법」 제18조의2제1항에 따라 상속세 과세가액에서 공제한 금액(이하 이 호에서 "가업상속공제금액"이라 한다)을 같은 항 각 호 외의 부분 전단에 따른 가업상속 재산가액으로 나눈 비율. 이 경우 가업상속공제가 적용된 자산별 가업상속공제금액은 가업상속공제금액을 상속 개시 당시의 해당 자산별 평가액을 기준으로 안분하여 계산한다.
> 2. 「법인세법」을 적용받는 가업(이하 이 조에서 "법인가업"이라 한다)의 경우: 해당 법인가업의 총자산가액(상속개시일 현재 「상속세 및 증여세법」 제4장에 따라 평가한 가액을 말한다) 중 상속개시일 현재 같은 법 시행령 제15조제5항제2호에 따른 사업무관자산을 제외한 자산가액이 차지하는 비율
>
> ④ 법 제97조의2제4항의 적용 대상이 되는 가업상속공제가 적용된 자산은 다음 각 호의 구분에 따른 자산으로 한다.
> 1. 개인가업의 경우: 「상속세 및 증여세법 시행령」 제15조제5항제1호에 따른 사업용 자산
> 2. 법인가업의 경우: 「상속세 및 증여세법 시행령」 제15조제5항제2호에 따른 주식등

**적용례** — 부칙(대통령령 제36129호, 2026.2.27.) 제1조 본문 「공포한 날부터 시행」, 제10조:

> 제10조(양도소득의 필요경비 계산 특례에 관한 적용례) 제163조의2제3항 및 제4항의 개정규정은 이 영 시행 이후 자산을 양도하는 경우부터 적용한다.

⇒ 기준일은 **양도일**이고 경계는 **2026-02-27**이다(코드 상수 `FB_ASSET_SCOPE_DECREE_GATE`와 일치).

### 2.3 「상속세 및 증여세법 시행령」 §15 (MST 290845)

- ⑤2호: 법인가업의 가업상속 재산가액 = 주식등의 가액 × (총자산가액 − 사업무관자산) ÷ 총자산가액.
- ㉑: 법 §18의2⑩의 양도소득세 상당액 = §97의2④를 적용한 양도소득세액 − §97을 적용한 양도소득세액.

### 2.4 신 ③2호의 문언 — 한도와 무관하다

신 ③2호의 분자·분모는 법인의 총자산·사업무관자산뿐이다. 공제 한도(상증법 §18의2① 각 호)에 걸려 공제액이 가업상속 재산가액보다 작아도 적용률은 같다. 구 ③(공제액 ÷ 재산가액)과는 한도에 걸릴 때 값이 갈린다(§3.2 실측).

---

## 3. 실측 (수정 전 · origin/master 705aad282 · probe는 스크래치패드 휘발)

### 3.1 F-3 적용률 정밀도 — `transfer-tax-family-business.ts`

`calcFamilyBusinessImputedAcquisitionPrice`가 `Math.round(rate × 1,000,000)`으로 적용률을 정수 basis로 바꾼 뒤 두 항을 각각 floor한다.

| 적용률 | 피상속인 취득가 / 상속평가 / 양도가 | 의제 취득가 (엔진 / 법문 항별 절사 / 차) | 결정세액 (엔진 / 법문 / 차) |
|---|---|---|---|
| 400/1200 (=1/3) | 2억 / 10억 / 20억 | 733,333,600 / 733,333,332 / **+268** | 377,969,912 / 377,970,000 / **−88** |
| 1/7 | 300억 / 900억 / 1,200억 | 81,428,580,000 / 81,428,571,427 / **+8,573** | 13,471,503,420 / 13,471,506,429 / **−3,009** |
| 0.8 | 1억 / 3억 / 5억 | 140,000,000 / 140,000,000 / 0 | 85,814,000 / 85,814,000 / 0 |

- 「법문 항별 절사」 = ⌊피상속인 취득가 × 분자 ÷ 분모⌋ + ⌊상속평가 × (분모 − 분자) ÷ 분모⌋ (BigInt).
- 화면 직접 입력은 % 소수 4자리(`FamilyBusinessInheritanceTransferSection.tsx:94`)라 1e6 basis 안에 정확히 들어가 오차가 없다. 오차는 **이력 불러오기가 상속세 결과의 `appliedRate` double을 그대로 넘길 때**만 생긴다(`family-business-inheritance-lookup.ts:276`).
- 같은 반올림이 §95④ 후단 양도차익 안분 `transfer-tax-lthd.ts:643`에도 있다 — **미실측(V-1)**.

### 3.2 F-2 법인가업 적용률 — `deductions/family-business.ts`

| 사례 | 가업상속 재산가액 | 공제액 | 엔진 적용률(`공제 ÷ 재산가액`) | 신 ③2호 |
|---|---|---|---|---|
| 주식 100억 · 총자산 50억 · 사업무관(임대부동산) 10억 · 영위 30년 | 8,000,000,000 | 8,000,000,000 | **1** | **0.8** |
| 주식 1,000억 · 총자산 500억 · 사업무관 100억 · 영위 15년(한도 300억) | 80,000,000,000 | 30,000,000,000 | **0.375** | **0.8** |
| 직접입력 모드(`:446`) | 모름 | 입력값 | **항상 1** | — |

- 실측 경로: `resolveFamilyBusinessAssetValue`(상증령 §15⑤2호 차감) → `calcFamilyBusinessDeductionLegacy`(`공제 ÷ 재산가액`). 정식 경로 `calcFamilyBusinessDeductionPhase2`(`:399`)도 같은 산식이다.
- 첫 probe는 `corporateNonBusinessAssets`를 숫자로 넣어 차감이 0이 됐다(타입은 5종 항목 객체 — `types/inheritance-corporate-non-business.types.ts:22`). 시료 오류였고 엔진 결함 아님.

- 구 ③(양도일 ~2026.2.26.)은 엔진 산식과 같다 — 결함은 **양도일 2026.2.27. 이후 법인가업**에 한정된다.
- 부동산 양도 이력 모달이 `corporate_stock` 자산도 후보로 채운다(`FamilyBusinessInheritanceHistoryModal.tsx:65` 라벨 「가업 법인 주식」, `family-business-inheritance-lookup.ts`는 분류 문자열만 있으면 통과).

### 3.3 F-1 주식 양도 — `lib/tax-engine/stock-transfer/`

- 엔진·타입·`lib/calc/stock*`·`components/calc/stock*`에서 `가업`·`familyBusiness` 검색 0건.
- 사례: 비상장 · 대주주 · 1만 주 · 상속(상속개시 2024-03-01, 피상속인 취득 2005-01-01) · 상속평가 5만 원/주 · 피상속인 취득가 5천 원/주 · 적용률 0.8 · 양도 2026-10-01 8만 원/주

| | 취득가액 | 양도소득금액 | 과세표준 | 산출세액 |
|---|---|---|---|---|
| 현행 | 500,000,000 | 300,000,000 | 297,500,000 | **59,500,000** |
| §97의2④ (1주 14,000원) | 140,000,000 | 660,000,000 | 657,500,000 | **149,375,000** |

- 신 ④2호가 2026.2.27. 이후 양도분의 법인가업 대상 자산을 **주식등**으로 정한다 — 부동산 엔진만 있는 현 구조로는 법인가업 상속인의 주된 양도 대상이 계산되지 않는다.

---

### 3.4 계획 단계 추가 발견 (엔진·UI 시니어 코드 확인 · 코디네이터 재확인)

| ID | 발견 | 근거 |
|---|---|---|
| A-1 | **정확한 분수가 이미 이력에 정수로 있다.** 상속세 결과 `familyBusinessDetail.deduction`(공제액)·`finalValue`(가업상속 재산가액)가 곧 구 ③ 분수다. lookup이 double `appliedRate`만 넘기는 것이 F-3의 원인. | `deductions/family-business.ts:399` |
| A-2 | 법인 ③2호 분수도 입력 스냅샷에서 복원된다 — `corporateTotalAssets` + `calcCorporateStockAdjustedValue().sumOfNonBusiness`(내부 `businessAssets` 정수). 반환 `ratio`는 double이라 분자·분모를 따로 노출해야 한다. | `property-valuation-corporate.ts:113-152` |
| A-3 | **이력 레코드 `inputData`는 상속세 폼 상태다.** 주식 카드는 `form.stockItems`, 그 밖은 `form.estateItems`. lookup은 `estateItems`만 읽는다 ⇒ `corporate_stock`(주식 카드에서만 선택 가능)은 실제 레코드에서 부동산 모달에 **이미 안 뜬다**. 단위 테스트 픽스처만 `estateItems`에 넣어 이 구멍을 가렸다. 주식 화면 prefill은 `stockItems`를 읽어야 한다. | `InheritanceTaxForm.tsx:133·242` · `FamilyBusinessCategorySection.tsx:18-19` · `lookup.ts:202` · `__tests__/lib/calc/family-business-inheritance-lookup.test.ts:44-56` |
| A-4 | 직접입력 모드 사례도 자산이 있으면 적용률 1로 prefill한다(모달은 `:102`에서 표시만). | `lookup.ts:266-281` |
| A-5 | lookup은 `marketValue > 0`만 후보로 본다 — 엔진은 `resolveEstateItemValue`(감정가·기준시가·비상장 평가)로 가액을 정한다. 비상장 평가·감정가 자산은 조용히 탈락할 수 있다(V-2). | `lookup.ts:210-211` · `deductions/family-business.ts:266-282` |
| A-6 | 부동산 화면의 적용률 hint는 「법인가업: 사업관련자산가액/총자산가액」으로 시기 구분 없이 적혀 있다 — 양도일 2026.2.26. 이전 법인가업에는 틀린 설명. | `FamilyBusinessInheritanceTransferSection.tsx:237-241` |
| A-7 | 주식 마법사의 취득가액 칸이 이미 「상속개시일 평가액」이고 취득일이 상속개시일이다 ⇒ 주식 쪽은 평가액·상속개시일을 새로 받을 필요가 없다. | `app/calc/stock-transfer-tax/steps/Step2.tsx:97-100` |

---

## 4. 공통 설계 — 단일 소스 3개

### 4.1 적용률 입력 모양 — `fbRateBasis` (법정량 판별 유니온)

```ts
type FamilyBusinessRateBasis =
  | { kind: "deduction_ratio"; deductionAmount: number; businessEstateValue: number }   // 구 ③ · 신 ③1호
  | { kind: "corporate_business_assets"; totalAssets: number; nonBusinessAssets: number }; // 신 ③2호
```

- 기존 `fbDeductionAppliedRate`(0~1)는 **% 직접 입력·구 입력 호환용**으로 남긴다. `fbRateBasis`가 있으면 엔진은 그것을 쓴다.
- 법정량으로 받는 이유: 결과 카드가 「가업상속공제금액 ÷ 가업상속 재산가액」을 라벨 붙여 보여 주고, (총자산 − 사업무관) 환산을 화면·④·⑧에 복제하지 않는다.
- ⑫·⑧ 공용 술어: 정수 · 분모 > 0 · 0 ≤ 분자 ≤ 분모(법인은 사업무관 ≤ 총자산) · `fbDeductionAppliedRate`와 `|rate − 분자/분모| ≤ 1e-9`(둘이 갈리면 차단 — 침묵 우선순위 금지).
- 엔진 시니어 안(`{numerator, denominator}` 단순 분수)과의 차이는 표시·검증 위치뿐이고 세액은 같다 — **Q-1**.

### 4.2 신설 leaf

| leaf | 역할 | 소비처 |
|---|---|---|
| `lib/tax-engine/family-business-imputed-acquisition.ts` | `calcFamilyBusinessImputedAcquisitionPrice`를 **이동**(재export 유지) + 분수 인자 오버로드. 항별 BigInt floor. | 부동산 엔진 · 주식 엔진 · 부동산 미리보기 · 주식 미리보기·사이드바 |
| `lib/tax-engine/family-business-applied-rate.ts` | `resolveFamilyBusinessRate(basis | rate)` → `{numerator, denominator}`(엔진용) · `deriveFamilyBusinessRateBasis({transferDate, category, fbDetail, item})` → `fbRateBasis` 또는 `{unavailable: "direct_input" \| "corp_assets_missing" \| "no_business_assets"}`(lookup용). 신·구 판정은 `isFamilyBusinessAssetScopeDecreeEra(transferDate)` 재사용. | 부동산·주식 엔진 · lookup mediator |
| `lib/calc/format-fraction-percent.ts` | 분수 → 「33.3333%」(BigInt, 소수 4자리 절사 표기). | 부동산 섹션·모달·결과 카드 · 주식 카드 |

- `calcCorporateStockAdjustedValue`는 `businessAssets`·`totalAssets` 정수를 **추가 반환**한다(기존 `ratio`·`adjustedValue` 불변).
- 상속세 엔진의 `appliedRate`(공제 ÷ 재산가액)는 **건드리지 않는다** — 구 ③과 일치하고 FB-RATE-1~4 anchor(`__tests__/tax-engine/inheritance-family-business.test.ts:602` 등)가 고정한다. 신·구 선택은 양도일을 아는 쪽(lookup·양도 엔진 입력)에서 한다.

---

## 5. F-3 — 적용률 분수 정확 연산 (PR-3)

### 5.1 엔진
- `calcFamilyBusinessImputedAcquisitionPrice`: 분수 경로 = ⌊(피상속인 취득가 + 자본적지출) × n ÷ d⌋ + ⌊상속평가 × (d − n) ÷ d⌋. 분수 없음 = 현행 `round(rate × 1e6)` 경로 **비트 동일**(기존 anchor 0·0.5·0.8·1.0 불변).
- §95④ 후단 `transfer-tax-lthd.ts:643`도 같은 분수로 바꾼다 — `fbLthdLatter`(`transfer.types.ts:775`)에 분수를 싣고 `applyFamilyBusinessCgtStep`(`transfer-tax-family-business.ts:307-315`)이 넘긴다. 표시용 `blendedRate`(`:653`)는 double 유지(세액 미사용).
- `new Date(fb.inheritanceDate)`(G-1 게이트)는 **유지**했다(PR-3 실행 중 결정) — `toDate`는 잘못된 날짜 문자열에서 예외를 던져, 지금의 「특례 미적용 + 경고」 동작이 바뀐다. 범위 밖.

### 5.2 화면 (부동산 `FamilyBusinessInheritanceTransferSection`)
- 적용률 칸 위 `RadioCardGroup` 「입력 방식」: **「가업상속공제금액 ÷ 가업상속 재산가액」(기본)** / 「% 직접 입력」(기존 `DecimalInput` — `fb-deduction-rate-decimal-input.test.tsx` 보존).
- 분수 모드는 `CurrencyInput` 2칸 + 읽기전용 「= 33.3333% (분수로 계산 — 반올림 없음)」. 전환·입력은 onChange 핸들러에서 `fbRateBasis`와 표시용 `fbDeductionAppliedRate = 분자/분모`를 함께 쓴다(useEffect 미사용). 모드는 `fbRateBasis` 유무로 파생.
- 적용률 FieldCard의 공용 컴포넌트 추출은 **PR-1d로 미뤘다**(PR-3 실행 중 결정) — 지금은 소비처가 부동산 하나뿐이다.
- 이력 prefill도 PR-3에서 법정량을 싣는다 — 상속세 결과의 `deduction`·`finalValue` 정수(A-1). 직접입력 모드는 제외(F-2에서 처리).
- 결과 카드 `FamilyBusinessImputedComparisonCard.tsx:87·123-124`의 `toFixed(2)%` 3곳을 분수 표기로. 적용률 행 문안: 「가업상속공제적용률 = 가업상속공제금액 {X} ÷ 가업상속 재산가액 {Y} = {Z}%」.

### 5.3 동기화 지점
| # | 위치 | 변경 |
|---|---|---|
| ① | `lib/stores/calc-wizard-asset.ts:665-679` | `fbRateBasis?` |
| ② | `lib/stores/calc-wizard-asset-factory.ts:652` | 불변(객체 전체 undefined). 토글 ON 초기값은 섹션 `handleToggle`(`:121-137`) |
| ③ | `lib/stores/calc-wizard-asset-migrate-phase3.ts:234` | 형태 불량 `fbRateBasis` → undefined |
| ④⑬ | `lib/calc/transfer-tax-api.ts:693-699` | 객체 통째 전달 — 자동 포함(⑫ 필수) |
| ⑤ | 섹션·공용 `FamilyBusinessRateField` | §5.2 |
| ⑥ | 부동산 사이드바 | FB 사전 표시 여부 확인 필요(V-5) |
| ⑦ | `FamilyBusinessImputedComparisonCard.tsx` | §5.2 |
| ⑧ | `lib/calc/transfer-tax-validate-asset.ts:472-483` | §4.1 공용 술어 |
| ⑫ | `lib/api/transfer-tax-schema-base-shape.ts:705-711` | `fbRateBasis: z.discriminatedUnion(...)` — 누락 시 침묵 stripping. 부동산은 `deduction_ratio`만 허용 |
| ⑭ | `app/api/calc/transfer/engine-input.ts:507` | 통째 전달 — 엔진 타입에 선언 필수 |
| — | 다건 `multi-transfer-tax-validate.ts:176`·`transfer-tax-schema-multi-refines.ts:82` | 불변(FB 존재만으로 차단) |

### 5.4 anchor 기대값 (엔진 시니어 probe · 토지 · 양도가 = 상속평가 × 2 · 상속 2024-01-01 · 양도 2026-01-01)

| ID | 케이스 | 의제 취득가 | 결정세액 |
|---|---|---|---|
| F3-1 | 분수 없음 r=0.8 (폴백) | 140,000,000 | 현행과 동일 |
| F3-2 | 400/1200 (2억/10억) | **733,333,332** (현행 733,333,600) | **502,935,000** (현행 502,934,880) |
| F3-3 | 1/7 (300억/900억) | **81,428,571,427** (현행 81,428,580,000) | **44,290,077,857** (현행 44,290,074,000) |
| F3-4 | 4/5 분수 vs 0.8 | 동일 | 동일 |
| F3-5 | 분수와 rate 불일치 | — | ⑫ 400 + ⑧ 같은 문구 |
| F3-6 | §95④ 후단 r=1/3 + 피상속인 취득일 | — | Do 단계 BigInt 독립 계산으로 확정(V-3) |
| F3-7 | 분모 0 · 분자 > 분모 | — | ⑫·⑧ 차단 |

(§3.1의 −88·−3,009원은 주택·양도 2026-10-01 조건이라 값이 다르다. anchor는 이 표를 쓴다.)

---

## 6. F-2 — 법인가업 적용률 신·구 선택 + 이력 불러오기 (PR-2a 엔진 leaf · PR-2b lookup·모달)

### 6.1 선택 규칙 (`deriveFamilyBusinessRateBasis`)

| 조건 | basis | 근거 |
|---|---|---|
| 개인가업(사업용 자산) · 양도일 무관 | `deduction_ratio`(공제 ÷ 재산가액) | 구 ③ · 신 ③1호 |
| 법인가업(`corporate_stock`) · 양도일 ≤ 2026-02-26 | `deduction_ratio` | 구 ③ |
| 법인가업 · 양도일 ≥ 2026-02-27 | `corporate_business_assets`(자산별) | 신 ③2호 · 부칙 제36129호 §10 |
| 직접입력 모드(`usedDirectInput`) | 산정 불가 → 사용자 직접 입력 | 재산가액 없음 — 1로 채우지 않는다 |
| 법인 + 총자산 미입력 | 산정 불가 | 구 산식으로 갈음 금지(자동 fallback 금지) |
| 법인 + 사업무관 ≥ 총자산 | 산정 불가(비율 0) | — |

### 6.2 lookup mediator (`lib/calc/family-business-inheritance-lookup.ts`)
- 시그니처 `(records, transferDate, target: "real_estate" | "stock")`. `target`에 맞지 않는 분류는 제외하고 사유 `wrong_target_only`를 `FbLookupWarningReason`에 추가(모달 라벨 `Record`가 tsc로 누락 감지).
- 자산 읽기: `estateItems` + `stockItems` 병합(A-3). 가액은 `resolveEstateItemValue`(A-5).
- 적용률은 **후보 단위 → 자산 단위**로 옮긴다(법인은 자산마다 다르다). `rate_zero` 검사(`:171-180`)는 신 ③2호 후보가 `appliedRate` echo에 기대지 않도록 순서를 바꾼다.
- prefill에 `fbRateBasis`를 싣는다. 이미 저장된 구 레코드도 echo 추가 없이 입력·결과 스냅샷에서 복원된다(A-1·A-2) — **Q-2**.

### 6.3 화면
- 모달(`FamilyBusinessInheritanceHistoryModal.tsx:111-139`) 자산 행마다 「가업상속공제적용률 {Z}%」와 「적용 산식: 구 소령 §163의2③ / 개정 §163의2③1호·2호」. 카드 단위 %(`:119`)는 제거.
- 산정 불가 자산은 선택 불가 + 사유(「총자산·사업무관자산이 이력에 없습니다 — 직접 입력하세요」).
- 부동산 섹션 hint(A-6)를 양도일 기준으로 나눈다: 2026.2.27. 이후 「법인가업은 이 화면의 대상 자산이 아닙니다 — 주식 양도 화면에서 입력하세요」 / 그 전 「구 소령 §163의2③ — 가업상속공제금액 ÷ 가업상속 재산가액」.

### 6.4 anchor
| ID | 케이스 | 기대 |
|---|---|---|
| F2-1 | 개인가업 · 양도 2026-02-26 / 02-27 | 둘 다 공제 ÷ 재산가액 |
| F2-2·3 | 법인 100억·총자산 50억·무관 10억 · 양도 02-26 / 02-27 | 80억/80억 = 1 / 40억/50억 = 0.8 |
| F2-4·5 | 법인 1,000억·영위 15년 · 02-26 / 02-27 | 300억/800억 = 0.375 / 0.8 |
| F2-6 | 직접입력 모드 | 산정 불가 |
| F2-7 | 법인 + 총자산 미입력 | 산정 불가 |
| F2-8 | 부동산 target에서 corporate_stock / 주식 target에서 사업용 자산 | 제외 |
| F2-9 | 사업무관 ≥ 총자산 | 산정 불가 |
| F2-10 | `stockItems`에만 있는 corporate_stock (실제 레코드 모양) | 주식 target 후보로 나온다 |
| F2-11 | 비상장 평가·감정가 자산(`marketValue` 없음) | 후보에 남는다 |

---

## 7. F-1 — 주식 양도 §97의2④ (PR-1a 선행 · PR-1b 엔진 · PR-1c API · PR-1d UI)

### 7.1 엔진 설계

| 항목 | 결정(추천) |
|---|---|
| 단위 | **단건 취득 카드 + 일자별 다건·분할 lot 단위 모두**(**Q-4 결정**). lot마다 가업상속 여부를 따로 받는다 — 공제받은 주식과 아닌 주식이 한 종목에 섞인 사례(「구분·관리」)를 lot으로 입력한다 |
| 입력 | 단건: `familyBusinessInheritance?: { decedentAcquisitionPrice /* 1주당 */, decedentCapitalExpenditure? /* 총액 */, fbRateBasis }` — 상속개시일 = `acquisitionDate`, 상속평가 = 기존 취득가액 입력(A-7). lot: 같은 객체를 상속 원인 lot(`AcquisitionLotForm`)에 싣는다 — 상속개시일 = lot 취득일, 상속평가 = lot 취득가액 |
| 의제 취득가 | 합계 = ⌊(피상속인 1주당 × 주식수 + 자본적지출) × n ÷ d⌋ + ⌊평가 총액 × (d − n) ÷ d⌋ — 단건은 합계 모드(`acquisitionActualInputMode: "total"`)로 주입해 1주당 절사를 피한다(`stock-actual-acquisition.ts` AT-1). lot은 **lot 배정(`lot-allocation.ts`) 뒤 배정 주식수 기준**으로 산정 |
| 자본적지출 | **받는다 — 부동산 안 B와 같이 피상속인 취득가 base에 더한 뒤 적용률을 곱한다**(**Q-5 결정**). 해석례 미확보 고지를 부동산과 같은 문구로 붙인다. lot 일부만 양도될 때 자본적지출의 배정 방식은 기존 lot 자본 조정 규칙(`lot-capital-adjustments.ts`)을 따를지 Do 전 확인(V-11) — 자동 안분을 새로 만들지 않는다 |
| 취득 모드 | `acquisitionMode: "actual"`만. 환산·매매사례·장부분실은 차단 |
| 해소 순서 | 의제 취득가를 `resolveStockCarryover` **앞**에서 확정(본문 강제 — 비교 아님) → 뒤에서 §18의2⑩ 공제 산출 |
| §18의2⑩ 공제 | `max(0, T(전부 의제) − T(해당 종목만 상속평가))` — 합산이면 합산 총세액 차이(기본공제 연 1회 때문). `calcFamilyBusinessCgtCredit` 재사용. 비교 세액 기준은 **Q-6** |
| 게이트 | G-1 상속개시일(`acquisitionDate`) ≥ 2014-01-01 — 미충족이면 미적용 + warning. G-2(양도일 2026.2.27.)는 적용 여부가 아니라 적용률 basis·근거 표기 축 |
| 배타 | `acquisitionCause: "inheritance"`일 때만. 국외주식·국외전출세 블록은 화면에서 이미 다른 경로 |
| echo | 부동산 `FamilyBusinessCgtDetail`과 같은 모양 + `appliedRateBasis`. 결과 `acquisitionPrice` = 의제 취득가 |

### 7.2 실측 기대값 (엔진 시니어 p3 · 비상장 대주주 · 1만 주 · 상속평가 5만/주 · 피상속인 5천/주 · 양도 8만/주 · 상속 2024-03-01 · 양도 2026-06-01)

| ID | 시나리오 | 양도소득금액 | 과세표준 | 산출 = 최종 | 지방소득세 |
|---|---|---|---|---|---|
| F1-B | 상속평가 5억 (현행) | 300,000,000 | 297,500,000 | **59,500,000** | 5,950,000 |
| F1-2 | r=0.8 의제 140,000,000 | 660,000,000 | 657,500,000 | **149,375,000** | 14,937,500 |
| F1-2c | §18의2⑩ 공제(단건) | | | **89,875,000** | |
| F1-4 | r=1/3 의제 349,999,999 | 450,000,001 | 447,500,001 | **96,875,000** | 9,687,500 |
| F1-11 | 합산 2종목(가업 + 매매 소액, 매매가 먼저 양도) | | | A 153,500,000 · B 63,500,000 · 공제 **90,000,000** | |

F1-11은 종목 단독 차이(89,875,000)와 125,000원 다르다 — 공제를 종목 단독으로 구하면 틀린다는 실측이다.

나머지 케이스: F1-1 비가업 상속 불변 · F1-3 r=0/1 · F1-5 의제 < 일반 → 공제 0 · F1-6 상속개시 2013-12-31/2014-01-01 · F1-7 양도 02-26/02-27(basis만 다름) · F1-8 상속 외 원인 + 선언 차단 · F1-9 환산·매매사례 차단 · F1-10 lot 혼재(가업 lot + 일반 상속 lot + 매수 lot, 일부 양도) — 가업 lot 배정분만 의제 · F1-10b 분할 양도(split)에서 가업 lot이 두 양도에 나뉘어 배정 · F1-18 자본적지출 base 가산(부동산과 같은 anchor 모양) · F1-12 합산 + 이월과세 종목 혼재(순서) · F1-13 의제 > 양도가(차손 통산) · F1-14 상장 가업 주식 · F1-15 단건 ≡ 합산 n=1 · F1-16 기타자산 · F1-17 피상속인 취득가 0/미입력 차단.

### 7.3 화면
- `Step2.tsx` 「취득가액」 실가 단건 블록 바로 아래(증여자 환산 블록 `:464` 직전)에 새 `StockFamilyBusinessCard`(`ToggleCard tone="emerald"`) 한 줄 호출.
- 노출 술어 `allowsStockFamilyBusiness(form | lot)`(새 leaf `lib/calc/stock-family-business.ts` — ④·⑤·⑧ 공유): 국내 시장 ∧ (단건 취득원인 상속 | lot 취득원인 상속) ∧ 실가. 모드 때문에 막히면 `disabled + disabledReason`(OFF도 tone 유지).
- lot: `AcquisitionLotCard.tsx:172` 뒤 상속 lot에 같은 카드 leaf를 lot props로 넣는다(단건 카드와 공용).
- 칸: 피상속인 1주당 취득가액 → 피상속인 자본적지출(총액, 선택 · 해석례 미확보 고지) → 적용률 쌍(양도일 < 2026.2.27. 「가업상속공제금액 / 가업상속 재산가액」 · ≥ 「법인 총자산가액 / 사업무관자산가액」, 쌍은 양도일에서 파생) → 읽기 문구 「상속개시일 = 위 취득일 · 상속개시일 평가액 = 위 취득가액」 → 미리보기 → §97의2④ 강제 적용·§18의2⑩ 안내.
- 양도일을 경계 건너로 바꾸면 새 쌍이 빈칸이 되어 ⑧이 막는다(조용한 전환 금지). % 직접 입력은 주식에 두지 않는다(**Q-7**).
- 이력 불러오기 `target: "stock"` — 1주당 평가액은 덮어쓰지 않고 참고값만 보인다(**Q-8**).
- 사이드바 `StockSidebar.tsx:286-295`: 결과 전 취득가액 줄이 상속평가 × 주식수를 그대로 보여 「그럴듯한 오답」이 된다 → FB ON ∧ 입력 완결이면 leaf 값, 미완결이면 행 생략.
- 결과: `FamilyBusinessImputedComparisonCard` 재사용(라벨 prop · 1주당 × 주식수 행). 별지 제84호 취득가액 라벨(`StockFilingFormAssetCostRows.ts:207-224`)에 「§97의2④ 의제」 분기. 다종목 대표 결과가 마지막 종목뿐이라(`StockTransferTaxCalculator.tsx:301`) 가업 종목 카드가 안 뜰 수 있다 — 국외주식 계획 Q-6과 같은 수리 지점(**Q-9**).

### 7.4 동기화 지점 (주식)
| # | 위치 | 변경 |
|---|---|---|
| ① | `lib/stores/calc-wizard-stock-form-types.ts` (`preMergerAcquisitionDate` 뒤 별도 블록) · lot `lib/stores/calc-wizard-stock-types.ts:93-`(`AcquisitionLotForm`) | `familyBusinessInheritance: boolean` · `fbDecedentPerSharePrice` · `fbDecedentCapitalExpenditure` · `fbDeductionAmount` · `fbBusinessEstateValue` · `fbCorpTotalAssets` · `fbCorpNonBusinessAssets` (단건·lot 같은 이름) |
| ③′ | lot normalize `calc-wizard-stock-normalize.ts:635-676` · lot 매퍼 `stock-transfer-tax-api.ts:76-100`(`mapAcquisitionLotToBody` — split 쪽 누락 사고 P-7 선례) · Zod `acquisitionLotSchema :150-172` · 검증 `stock-transfer-tax-validate-step1.ts:243-277` + `missingLotCauseKeys` | lot 경로 동기화 |
| ② | `lib/stores/calc-wizard-stock-form.ts:89-93` | `false` · `""` |
| ③ | `lib/stores/calc-wizard-stock-normalize.ts:208-211` | boolField·strField(`\|\|` 금지) — 구 이력 복원도 이 함수 하나로 닫힌다 |
| ④⑬ | 새 `lib/calc/stock-transfer-tax-api-family-business.ts`(`appendFamilyBusinessBody`) · 호출 `stock-transfer-tax-api.ts:176-186` | 술어 통과 시에만 전송, 양도일 era 쌍만 `fbRateBasis`로. 단건·다종목 같은 빌더 |
| ⑤ | 새 `components/calc/stock-transfer/StockFamilyBusinessCard.tsx` · `Step2.tsx` 한 줄 | §7.3 |
| ⑥ | `StockSidebar.tsx:286-295` | §7.3 |
| ⑦ | `StockTransferTaxResultView.tsx:595` 옆 · `StockFilingFormAssetCostRows.ts:207-224` | §7.3 |
| ⑧ | 새 `lib/calc/stock-transfer-tax-validate-family-business.ts` · 호출 `stock-transfer-tax-validate-step2.ts` 취득가액 검사 뒤 | 피상속인 1주당 > 0 · §4.1 공용 술어 · era 쌍 전체 필수 · 술어 불통과 시 미검증(잔존값 inert — **Q-10**) |
| ⑨⑩ | `lib/api/stock-transfer-tax-refines.ts` | 상속 한정(단건 원인 또는 lot 원인) · 실가 한정 · era와 basis kind 일치 — ⑧과 같은 술어 |
| ⑪ | 해당 없음 | 날짜는 `acquisitionDate` 사용 |
| ⑫ | `lib/api/stock-transfer-tax-schema.ts` 이월과세 블록 아래 | `familyBusinessInheritance: z.object({...}).optional()` — 누락 시 침묵 stripping |
| ⑭ | `lib/api/stock-transfer-engine-input.ts:62-72` | **명시 매핑** — 누락 시 Zod 통과 후 엔진 미도달 |

### 7.5 파일 크기 (800줄 정책)
| 파일 | 현재 | 조치 |
|---|---|---|
| `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` | 775 | 훅 추가 전 보조 함수 분리(목표 ≤ 700) — PR-1a |
| `lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts` | 759 | +8줄 예상 · 국외주식 PR 머지 후 재측정(V-8) |
| `lib/calc/stock-transfer-tax-api.ts` | 755 | 본문은 신설 파일(④) |
| `lib/tax-engine/legal-codes/stock.ts` | 752 | 신규 상수는 `legal-codes/stock-family-business.ts` |
| `stock-transfer.types.ts` | 1637(타입 전용) | 신규 타입은 `types/stock-family-business.types.ts` |

### 7.6 국외주식 이월과세 계획(`foreign-stock-carryover-97-2*.plan.md`, 2026-11-26 머지)과의 관계
- 설계 충돌 없음(그쪽은 국외주식·증여 원인, 이쪽은 국내주식·상속 원인).
- 파일 겹침: `stock-transfer-tax.ts` 오케스트레이터 · `stock-transfer-aggregate.ts` 합산 진입 · 폼 타입·factory·normalize · Zod schema · engine-input · `StockTransferTaxResultView.tsx:595`.
- 순서: PR-1a(신규 파일·분리·상수)는 먼저 가능. **PR-1b(오케스트레이터·합산 훅)와 PR-1d(UI)는 국외주식 P1(추출)·P4(배선) 머지 뒤**에 시작한다. 훅은 순수 함수 2개 호출(≤ 15줄)로 좁힌다.

---

## 8. 법령 상수·verify:legal

- 신규 인용: 「소득세법 시행령」 §163의2③(구·신)·④, 「상속세 및 증여세법 시행령」 §15⑤2호·㉑ — 현재 `legal-codes/`·`manifest/`에 0건.
- 상수는 문자열 리터럴 금지 규칙대로 `legal-codes/`에 두고 `lib/legal-verification/manifest/additions-{세목}.ts`에 등록, 키워드는 §2 본문 verbatim. 「(법률 제N호로 …)」 괄호는 쓰지 않는다. 등록 후 `npm run verify:legal`.

---

## 9. 사용자 결정 (Q) — 2026-11-26

Q-1·4·5·6은 사용자가 직접 골랐고, 나머지는 추천안대로 반영했다(이견 시 Do 전 변경).

| ID | 질문 | 결정 |
|---|---|---|
| Q-1 | 적용률 입력 모양 — 법정량 유니온 `fbRateBasis` / 단순 분수 `{numerator, denominator}` | ✅ **`fbRateBasis`** (사용자 선택 · 추천안) |
| Q-2 | 상속세 결과에 법인 비율 echo 추가 | **추가 안 함** — 입력 스냅샷으로 복원돼 구 레코드에도 적용된다 |
| Q-3 | 직접입력·총자산 미입력 이력 | **산정 불가 + 사용자 직접 입력**(1·0으로 채우지 않음) |
| Q-4 | 주식 1차 범위 | ✅ **lot 단위까지 한 번에** (사용자 선택 · 추천은 단건만이었다) |
| Q-5 | 주식 피상속인 자본적지출 | ✅ **부동산과 같이 받는다** — base 가산 × 적용률 (사용자 선택 · 추천은 받지 않음이었다) |
| Q-6 | §18의2⑩ 비교 세액 — 결정세액(가산세 제외) / 최종세액 | ✅ **결정세액** (사용자 선택 · 추천안) — 근거 확인은 V-4 |
| Q-7 | 주식 적용률 % 직접 입력 | **두지 않음**(법정량 쌍만) |
| Q-8 | 주식 이력 불러오기가 1주당 평가액 칸을 덮어쓰는가 | **덮어쓰지 않음** — 참고값만. 취득일이 비어 있으면 상속개시일로 채우고, 다르면 후보 비선택 |
| Q-9 | 다종목 결과의 가업·이월과세 카드를 종목별로 모두 표시 | **국외주식 계획 Q-6과 통합해 한 PR에서** |
| Q-10 | 주식 FB 잔존값(취득원인 변경 등) | **inert**(④ 미전송·⑧ 미검증) — 주식 폼 `donor*` 선례 |

---

## 10. 미검증 (V) — 확인 필요

| ID | 항목 |
|---|---|
| V-1 | 대법원 2026두30294(`family-business-cgt-era.ts` 헤더 인용) — KoreanLaw 판례 검색 0건. 심리불속행이라 DB에 없을 수 있다. 화면·결과 문구의 근거로 쓰지 않고 「§163의2④ 시행 전 양도분 — 해석 근거 확인 필요」로 쓴다 |
| V-2 | 비상장 평가·감정가 자산이 lookup에서 탈락하는지 probe |
| V-3 | §95④ 후단 `:643` 분수 전환의 결정세액 영향 — Do 단계 BigInt 독립 계산 |
| V-4 | 상증령 §15㉑ 「양도소득세액」이 결정세액인지 — 부동산 현행은 `determinedTax` |
| V-5 | 부동산 사이드바가 FB ON 자산 취득가액을 사전 표시하는지 |
| V-6 | 신 ③2호 「총자산가액」과 상속세 입력 `corporateTotalAssets`(상증법 제4장 평가)가 같은 값인지 — 화면이 장부가를 받는지 |
| V-7 | 피상속인이 의제취득일 전 취득한 경우 「피상속인 취득가액(§97①1호)」 — v1은 사용자 입력 책임 고지 |
| V-8 | 국외주식 PR 머지 후 `stock-transfer-tax.ts`·`aggregate.ts` 줄 수·훅 위치 재측정 |
| V-9 | 구 주식 이력 복원 시 신규 필드 default(실행 확인) |
| V-10 | 다종목에서 가업 종목이 마지막이 아니면 카드가 안 뜨는지(실행 확인) |
| V-11 | 가업 lot이 일부만 양도될 때 피상속인 자본적지출(총액)의 배정 — 기존 lot 자본 조정 규칙(`lot-capital-adjustments.ts`)에 같은 축이 있는지. 없으면 사용자 결정으로 올린다(자동 안분 신설 금지) |

PR-3 14지점 점검(ui-engine-sync-checker) Low — 세액 영향 없음:
- L-1 이력 모달 적용률이 반올림 표기(66.6667) — PR-3에서 분수 표기로 맞춤.
- L-2 §95④ 후단 산식 문구가 소수 첫째 자리 반올림·`blendedRate` double 가중(`transfer-tax-lthd.ts` 산식 문구) — 공제액은 분수로 계산되고 `longTermHoldingRate`는 문구에만 쓰인다(`transfer-tax-lthd-steps.ts`). 표기 한정 차이로 유지.
- L-3 엔진 직접 호출 시 법정량 분모 0이면 의제 취득가액 0(가드 없음) — route는 ⑫가 막는다. PR-1b(주식 재사용)에서 엔진 진입 가드로 처리.

기존 코드 지적(이번 범위 밖, 언급만): 부동산 ⑧은 피상속인 취득가 0을 허용(`transfer-tax-validate-asset.ts:475`)하나 미리보기는 `> 0`을 요구(`Section:147-150`).

---

## 11. PR 분할·순서

| 순서 | PR | 내용 | 규모(추정) |
|---|---|---|---|
| 1 | **PR-3** | F-3: `fbRateBasis` 타입·⑫⑧ 공용 술어·leaf 이동·분수 연산·§95④ 후단·부동산 화면 입력 방식·결과 카드 표기 · anchor F3-* | 코드 ≈ 350 · 테스트 ≈ 300 · 반나절~1일 |
| 2 | **PR-2a** | F-2 엔진 leaf `family-business-applied-rate.ts` + `calcCorporateStockAdjustedValue` 분자·분모 · anchor F2-1~9 | ≈ 180 · 반나절 |
| 3 | **PR-2b** | F-2 lookup(`stockItems`·`target`·자산 단위·`resolveEstateItemValue`)·모달·섹션 hint · anchor F2-10·11 · E2E 이력 prefill | ≈ 250 · 반나절 |
| 4 | **PR-1a** | F-1 선행: `stock-transfer-tax.ts` 분리(≤ 700)·타입·법령 상수·매니페스트 | ≈ 300 · 반나절 |
| 5 | **PR-1b** | F-1 엔진 단건: `stock-family-business.ts`·오케스트레이터·합산 훅·echo · anchor F1-1~9·11~18 | ≈ 450 · 1일 — 국외주식 P4 뒤 |
| 6 | **PR-1b′** | F-1 엔진 lot: lot 배정 후 의제 산정 · 자본적지출 배정(V-11) · anchor F1-10·10b | ≈ 250 · 반나절~1일 |
| 7 | **PR-1c** | F-1 ⑨~⑭ + ⑧(단건·lot) + 칸 패리티 격자·route anchor | ≈ 450 · 1일 |
| 8 | **PR-1d** | F-1 UI 단건 카드 ①~⑦ + E2E(비상장 1만 주 → 149,375,000 · Network body) | ≈ 700 · 1일 — 국외주식 P1 뒤 |
| 9 | **PR-1d′** | F-1 UI lot 칸(`AcquisitionLotCard`)·lot normalize·매퍼 + E2E lot 혼재 | ≈ 400 · 반나절~1일 |

- 각 PR은 Do 시퀀셜(엔진이 타입·leaf·anchor 선처리 → UI). Check는 `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`.
- 머지는 CI 전건 SUCCESS + `headRefOid` 일치 확인 후(`--auto` 금지).
