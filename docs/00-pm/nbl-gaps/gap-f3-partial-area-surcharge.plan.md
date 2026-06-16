# F3 — STEP 0.6 boolean → 부분 면적안분 중과 §168의11⑤⑥

> 기준면적 **초과분만 비사업용**(중과), 이내분은 사업용(일반세율). 판정 엔진이 이미 산출하는 `areaProportioning.nonBusinessRatio`를 **본 세액 계산에 연결**. 현재 과대중과(초과분 전량 +10%p) 해소.

---

## 1. 법령 근거 (KoreanLaw 본문 실측 2026-06-17)

### 법 §104의3① + 시행령 §168의11⑤⑥ (mst=286211)
- 비사업용 토지 = 기준면적 **초과부분**. 이내부분은 사업에 사용되는 토지(사업용).
- **§168의11⑤** — 연접 다수 필지가 하나의 용도로 일괄 사용되고 총면적이 기준면적 초과 시, 다음 순위로 **초과부분 토지를 특정**:
  - 1호 (건축물·시설물 無): 가. 취득시기 늦은 토지 → 나. 동일하면 거주자 선택
  - 2호 (건축물·시설물 有): 가. 바닥면적/수평투영면적 제외 토지 중 취득시기 늦은 토지 → 나. 거주자 선택
- **§168의11⑥** — 건축물에 특정용도분과 그 외가 함께 있는 경우 특정용도분 부속토지면적 산식:
  - 1호 단일 건축물 복합용도: `부속토지면적 × 특정용도분 연면적 / 건축물 연면적`
  - 2호 동일경계 다수 건축물: `전체 부속토지면적 × 특정용도분 바닥면적 / 전체 바닥면적`

**해석**: 면적 초과분(비사업용)과 이내분(사업용)으로 토지가 나뉜다. 양도소득세 중과(§104①8호 +10%p)는 **비사업용 토지(=초과분)에만** 적용. 이내분은 §104①8호 비해당(일반 누진세율).

> ⚠️ **법령해석 확인(Do 선행)**: "부분 토지가 비사업용이면 양도차익을 면적비율로 안분하여 비사업용분에만 중과"가 통설·집행기준이나, 산출세액 안분 방식(누진세액은 전체 / 중과분만 안분)은 국세청 해석·예규로 재확인 후 anchor 고정. memory `feedback_korean_law_citation_verify`·`feedback_anchor_correction_legal_priority`.

---

## 2. 현황 (실측)

### 2-1. 판정 엔진은 ratio 산출, 본 세액은 boolean
- `pasture.ts:150·167`·`other-land.ts:217·234`·`housing-land.ts:82~131`: 면적 초과 시 `areaProportioning`(`nonBusinessArea`·`nonBusinessRatio`) 반환 + `isBusiness:false`.
- `engine.ts:254` `areaProportioning: categoryResult?.areaProportioning` → judgment에 노출.
- `engine.ts:256~261` surcharge: `additionalRate: isNonBusinessLand ? 0.10 : 0` — **boolean**.
- `transfer-tax.ts:208~223`: judgment의 `isNonBusinessLand` **boolean만** `effectiveInput`에 override. `areaProportioning` 미전달.
- `transfer-tax-rate-calc.ts:272~305`: `if (input.isNonBusinessLand ...)` → **전체 `taxBase`**에 `applyRate(taxBase, additionalRate)`. ratio 미소비.
- grep 확인: `transfer-tax-rate-calc.ts`·`transfer-tax-finalize.ts`에 `areaProportioning`/`nonBusinessRatio` **0건**.

### 2-2. 결과: 과대중과
기준면적 1,000㎡ 목장에서 1,500㎡ 보유(초과 500㎡, nonBusinessRatio≈0.333) → 현재 **전체 양도차익 +10%p**. 법령정합: 초과분 33.3%만 +10%p.

### 2-3. LTHD·단기세율 (영향 분석)
- LTHD: 현행 비사업용 토지도 §95② 표1 적용(memory archive·`multi-house-and-nbl.test.ts:165` anchor) → **부분안분과 무관**(이내·초과 동일 표1). 확인 anchor만.
- 단기세율 §104①후단: `rate-calc.ts:281~296` 비사업용 단기(1년미만 50%·1~2년 40%) vs 비사업용 누진세액 큰 값. 부분안분 시 비교 항이 바뀜 → 매트릭스 enumerate.

---

## 3. 설계

### 3-1. 판정 엔진이 ratio를 surcharge에 노출 (`types.ts`·`engine.ts`)
```ts
// NonBusinessLandJudgment.surcharge 확장
surcharge: {
  surchargeType: "non_business_land";
  additionalRate: number;
  /** 비사업용 면적 비율 (부분 안분 중과 — 면적안분 없으면 1) §168의11⑤⑥ */
  nonBusinessAreaRatio: number;
  longTermDeductionExcluded: boolean;
  basicDeductionApplied: boolean;
}
```
**surcharge 조립 3곳 동기화 (tsc 강제 — 필수 필드)**:
- `engine.ts:256 assemble()`: `nonBusinessAreaRatio: isNonBusinessLand ? (categoryResult?.areaProportioning?.nonBusinessRatio ?? 1) : 0`
- `engine.ts:286 makeSurchargeResult()` (레거시 팩토리 `createBusinessResult:295`·`createNonBusinessResult:315` 경유): `nonBusinessAreaRatio: isNonBusinessLand ? 1 : 0` (면적안분 정보 없음 → 전량/0)
- surcharge.additionalRate는 유지(0.10), 안분은 ratio로.

**불변식**: `nonBusinessAreaRatio ∈ (0,1]` when `isNonBusinessLand`; areaProportioning 없는 비사업용(농지·임야·전량 초과)은 1 → 회귀.

### 3-2. STEP 0.6 → 본 세액 전달 (`transfer-tax.ts`)
`TransferTaxInput`(`types/transfer.types.ts:77` · `isNonBusinessLand:128` · `nonBusinessLandDetails:207`)에 엔진 내부 파생 필드(사용자 입력 아님):
```ts
/** §168의11⑤⑥ 비사업용 면적 비율 — judgeNonBusinessLand 도출 (엔진 내부, 14지점 무관) */
nonBusinessLandAreaRatio?: number;
```
`transfer-tax.ts:214~215`:
```ts
effectiveInput = {
  ...workingInput,
  isNonBusinessLand: nonBusinessLandJudgment.isNonBusinessLand,
  nonBusinessLandAreaRatio: nonBusinessLandJudgment.surcharge.nonBusinessAreaRatio,
};
```

### 3-3. rate-calc — 중과분만 안분 (`transfer-tax-rate-calc.ts:272~305`)
```ts
if (input.isNonBusinessLand && surchargeRates.non_business_land) {
  const additionalRate = surchargeRates.non_business_land.additionalRate;
  const ratio = input.nonBusinessLandAreaRatio ?? 1;          // 면적안분 (없으면 1)
  const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
  // 중과분(+10%p)만 비사업용 면적비율 적용 — 누진 기본세액은 전체 taxBase
  const surchargedBase = applyRate(taxBase, ratio);            // 비사업용분 과세표준 (정수)
  const surchargeAmount = applyRate(surchargedBase, additionalRate);
  const nblTax = progressiveTax + surchargeAmount;
  // §104①후단 단기세율 비교 — 자산 단위(전체 taxBase) 유지
  // ... (기존 nblShortTermRate 로직, taxBase 전체 기준)
  return { calculatedTax: nblTax, surchargeType, surchargeRate: roundRate(additionalRate),
           appliedRate: roundRate(baseRate + additionalRate * ratio), // 실효 가산율
           progressiveDeduction: deduction, surchargeSuspended: false };
}
```
- 정수 연산: `applyRate`(=`Math.floor(x*rate)`) 2단(과세표준 안분 → 중과율). memory `feedback_applyrate_fractional_rate_one_won_error` 주의 — ratio는 소수 4자리(`area-proportioning.ts`). 1원 오차 검증 anchor.
- `ratio===1`이면 `surchargedBase===taxBase` → 기존 산식과 **완전 동일**(회귀 보장).

### 3-4. 결과 표시
- `transfer-tax-finalize.ts`: `nonBusinessLandJudgmentDetail`에 이미 `areaProportioning` 포함. step formula에 "비사업용 면적비율 33.3% × 중과 10%p = 실효 3.33%p" 풀어쓰기(memory `feedback_result_view_korean_formula`).
- `NonBusinessLandResultCard.tsx:102` 안내문 **갱신**: "초과분만의 부분 안분 중과는 반영되지 않습니다" → "기준면적 초과분({nonBusinessArea}㎡, {ratio}%)에만 중과세(+10%p)가 적용됩니다." (memory `feedback_engine_result_display_drift`)

---

## 4. 케이스 매트릭스 (전 분기 enumerate)

| # | 지목/상황 | isNonBusiness | ratio | calculatedTax | 비고 |
|---|---|---|---|---|---|
| C1 | 농지 비사업용 (면적안분 無) | true | 1 | 누진 + 전체×10%p | **회귀** (기존 동일) |
| C2 | 목장 기준면적 초과 33.3% | true | 0.333 | 누진(전체) + 안분과세표준×10%p | 핵심 |
| C3 | 기타토지 호별 초과 30% | true | 0.30 | 동일 | other-land |
| C4 | 주택부수토지 배율 초과 50% | true | 0.50 | 동일 | housing-land |
| C5 | 면적 전부 초과 (이내분 0) | true | 1 | 누진 + 전체×10%p | 회귀 (C1 동치) |
| C6 | 사업용 (기준면적 이내) | false | 0 | 누진만 | 중과 없음 |
| C7 | C2 + 단기보유 1년미만 | true | 0.333 | max(전체×50%, 누진+안분중과) | §104①후단 — 단기는 자산단위 |
| C8 | C2 + 단기보유 1~2년 | true | 0.333 | max(전체×40%, 누진+안분중과) | 동일 |
| C9 | C2 + 중과 유예 기간 | — | — | 중과 suspended (별도 분기) | 면적안분 무관 |
| C10 | ratio 소수 경계 (0.3333…) | true | round4 | 1원 오차 검증 | `applyRate` 2단 |
| C11 | 별장→주택부수 REDIRECT 후 배율 초과 | true | housing ratio | 누진 + 안분중과 | `engine.ts:117` 병합 areaProportioning(housing) 소비 |

**§104①후단 결정(C7·C8)**: 단기세율은 **자산 전체 taxBase 기준**(부분안분 미적용). 비사업용 누진세액(부분안분 포함)과 비교하여 큰 값. 근거: §104①후단은 "하나의 자산"의 산출세액 비교 — 단기보유는 자산 전체 속성. → 단기율 항은 ratio 무관.

---

## 5. 14 동기화 지점 — **대부분 무관**

F3는 **신규 사용자 입력 없음**(면적·축종·호는 갭 3a·3c에서 이미 입력). `nonBusinessLandAreaRatio`는 엔진이 judgment에서 도출하는 내부 파생값.

| # | 지점 | 작업 |
|---|---|---|
| ①~⑥ | 클라 입력 | **무관** (신규 입력 0) |
| ⑦ | 결과카드 | `NonBusinessLandResultCard.tsx:102` 안내문 갱신 + 부분안분 세액 행 |
| ⑧ | validate | 무관 |
| ⑨~⑭ | API/route | **무관** (입력 채널 없음 — `nonBusinessLandAreaRatio`는 엔진 내부, body/Zod 미전송) |

→ 실질 작업: **엔진 4파일**(`types.ts`·`engine.ts`·`transfer-tax.ts`·`transfer-tax-rate-calc.ts`) + 결과 표시 2(`transfer-tax-finalize.ts` step·`NonBusinessLandResultCard.tsx`).

---

## 6. anchor 명세 (Pre-Do 우선 — numeric 실증)

- **AT-F3-1 (Pre-Do, 핵심)**: 목장 기준면적 1,000㎡·보유 1,500㎡(ratio 0.333)·양도차익 고정. **현재 엔진**: 전체 +10%p. **기대(법령정합)**: 누진(전체) + (taxBase×0.333)×10%p. 두 세액 차이를 원단위로 실증. **FAIL 먼저**(현재 ratio 미소비) → 구현 → PASS. (memory `feedback_numeric_impact_verify_before_bug_claim`)
- **AT-F3-2 (회귀, ratio=1)**: 농지 비사업용 → 기존 세액과 **완전 동일**(`surchargedBase===taxBase`).
- **AT-F3-3 (사업용)**: 기준면적 이내 → 중과 0.
- **AT-F3-4 (단기 §104①후단)**: C7 — 단기 50% vs 부분안분 누진세액 큰 값. 단기항이 전체 taxBase 기준임을 실증.
- **AT-F3-5 (1원 오차)**: ratio 0.3333 × taxBase 436,000,000 등에서 `applyRate` 2단 floor 정확성(memory `feedback_applyrate_fractional_rate_one_won_error`·`feedback_floor_residual_absorption`).
- **AT-F3-6 (LTHD 불변)**: 부분안분 케이스도 §95 표1 LTHD 정상부여 — 기존 anchor 유지 확인.
- **AT-F3-7 (3지목 each)**: 목장·기타토지·주택부수토지 각각 ratio 소비 확인.

---

## 7. 규모·위험

- 변경: 엔진 4 + 결과 2. **본 세액 파이프라인 변경 = 양도세 전 회귀 위험** → 전체 `npm test` 필수, ratio=1 회귀 anchor로 기존 비사업용 케이스 불변 보장.
- 800줄: `rate-calc.ts` 분기 확장 시 줄수 점검 — 초과 시 `transfer-tax-nbl-surcharge.ts` 헬퍼 분리.
- 위험 **높음** — 단독 집중 ship. F2 머지 전 선행(SR-F1).
- 규모 XL(파일 적으나 회귀 표면 넓음).
