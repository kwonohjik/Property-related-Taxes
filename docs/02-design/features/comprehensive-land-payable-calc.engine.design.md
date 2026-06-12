# 종부세 토지분 "납부할세액의 계산" — 엔진 설계 (engine.design)

> Plan: `docs/01-plan/features/comprehensive-land-payable-calc-card.plan.md` (사례10·11 축자 동결 §2)
> 갭: G-1(필지 재산세 자동계산) · G-2(토지 직전연도 상당액) · G-3(별도합산 §15 상한) · G-5(echo)
> 원칙: 정수 연산(분수 정수·`safeMultiplyThenDivide`) · 기존 land 엔진 **시그니처 무변경**(orchestrator 어댑터) · 세율표 복제 금지(상수 import)

---

## 1. 케이스 인벤토리 (Do 진입 게이트)

| # | 케이스 | 입력 요지 | 기대값 (원단위) | anchor |
|---|---|---|---|---|
| M-01 | 사례10 종합합산 풀 | 필지 3건·자동 서브모드(직전 공시지가 입력) | ①13,000,000 ②ⓐ5,800,000 ⓑ4,550,000 ⓒ6,050,000 ⓓ4,361,983 ③8,638,017 ④가14,438,017 나10,604,916 나①4,575,000 나②6,029,916(ⓐ9,025,000−ⓑ2,995,084) 다15,907,374 초과0 ⑤8,638,017 | LD-A1 |
| M-02 | 사례11 별도합산 풀 | 필지 3건·자동 서브모드 | ①241,000,000 ②ⓐ140,400,000 ⓑ120,400,000 ⓒ141,600,000 ⓓ119,379,661 ③121,620,339 ④가262,020,339 나228,714,663 나①129,200,000 나②99,514,663(ⓐ202,300,000−ⓑ102,785,337) **다343,071,994(floor — 교재 995는 round 표기, 1원·판정 영향 0)** 초과0 ⑤121,620,339 | LD-A2 |
| M-03 | 사례10 ②ⓐ 지자체 분해 | 동일 | 서초: 공시 430,000,000·과표 301,000,000·상한전 1,255,000·직전 870,000·상한 1,305,000·Min 1,255,000 / 송파: 공시 1,370,000,000·과표 959,000,000·상한전 4,545,000·직전 3,705,000·상한 5,557,500·Min 4,545,000 | LD-A3 |
| M-04 | 집계 직접입력(기존 경로) | `landAggregate` 4필드 | 기존 결과 **불변** — perJurisdiction·previousYearEquivalent undefined | 기존 anchor |
| M-05 | 필지 + 직전 미입력 | 직전 공시지가·총액 모두 없음 | ②ⓐ = 표준세율 재산세(Min 없음)·taxCap undefined | LD-B1 |
| M-06 | 필지 + 직전 총액 직접(L-11) | previousYearTotalTax만 | ②ⓐ Min 없음·taxCap 산출(④나 분해 없음) | LD-B2 |
| M-07 | 별도합산 80억 이하 | 합산 ≤ 80억 | isSubjectToTax=false | LD-B3 |
| M-08 | 상한 발동 | 직전 총액 축소 fixture | ④ 초과>0·⑤=③−④ ≠ cappedTax 실효 감소분(비항등 — 주택 M-04 동형) | LD-B4 |
| M-09 | 2021 귀속 + 자동 서브모드 | assessmentYear 2021 | Zod ⑫ 1차 차단 + orchestrator 2차 방어(D-6): prior 미산출 + `warnings` 추가(throw 금지 — 직접입력 경로 계속 동작) | LD-B5 |
| M-10 | 지분율 50% | 사례10 서초 | 공시 = floor(200×0.5×4,300,000) = 430,000,000 | LD-A3 포함 |

---

## 2. 타입 (`types/comprehensive.types.ts` 확장)

```ts
/** 필지 1건 (종합합산·별도합산 공용) — Plan §5 */
export interface LandParcelInput {
  parcelId: string;
  jurisdiction: string;              // 재산세 관내 합산 그룹 (지방세법 §113) — trim 정규화 후 동일 문자열 = 동일 그룹
  name?: string;                     // 표시용 ("송파구-1")
  area: number;                      // ㎡
  shareRatio: number;                // 0~1 (API에서 %→/100 변환 완료된 값)
  officialPricePerSqm: number;       // 당해 원/㎡
  priorOfficialPricePerSqm?: number; // 직전연도 (자동 서브모드 시 전 필지 필수)
}

/** ComprehensiveTaxInput 추가 (집계 landAggregate·landSeparate와 상호배타 — Zod refine) */
//   landAggregateParcels?: LandParcelInput[];
//   landSeparateParcels?: LandParcelInput[];
//   landSeparatePreviousYearTotalTax?: number;   // 별도합산 직접입력 (G-3)
//   ※ 직전연도 자동 서브모드는 별도 플래그 없음 — priorOfficialPricePerSqm 전 필지 존재 = 자동 (Zod 전부-or-전무 refine)

/** ②ⓐ ≪지역≫ 블록 echo — 당해연도 (Min 포함) */
export interface LandJurisdictionPropertyTax {
  jurisdiction: string;
  /** "•" 나열 + 필지 산식 렌더용(교재 "200㎡ × 50%(지분율) × 4,300,000원") — U1-1: area·shareRatio·pricePerSqm echo 필수 */
  parcels: { parcelId: string; name?: string; area: number; shareRatio: number; pricePerSqm: number; officialValue: number }[];
  officialValueSum: number;          // − 공시가격
  propertyTaxBase: number;           // − ×70% (floor)
  appliedRate: number;               // 0.005 / 0.004
  progressiveDeduction: number;      // 250,000 / 1,200,000 (구간별)
  standardTax: number;               // − 세부담 상한 적용 전
  priorStandardTax?: number;         // − 직전연도 재산세상당 (자동 서브모드만)
  capAmount?: number;                // − 직전 × 150% (§122, floor)
  imposedTax: number;                // − Min (직전 부재 시 = standardTax)
}

/** ④나① 직전연도 지자체 분해 — 슬림(§122 Min 미적용, R1-6) */
export interface LandPriorJurisdictionTax {
  jurisdiction: string;
  parcels: { parcelId: string; name?: string; area: number; shareRatio: number; pricePerSqm: number; officialValue: number }[]; // U1-1 동일
  officialValueSum: number;
  propertyTaxBase: number;
  appliedRate: number;
  progressiveDeduction: number;
  standardTax: number;
}

/** ④나 토지 직전연도 총세액상당액 (자동 서브모드만) */
export interface LandPreviousYearEquivalent {
  propertyTaxEquiv: number;          // 나① = Σ perJurisdiction.standardTax
  comprehensiveTaxEquiv: number;     // 나② = ⓐ − ⓑ (≥0)
  total: number;                     // 나 = ① + ②
  detail: {
    officialValueSum: number;        // 직전 공시 합산
    basicDeduction: number;          // 5억 / 80억
    fairMarketRatio: number;         // getComprehensiveParams(y−1).fairMarketRatioLand (2021=0.95)
    taxBase: number;                 // trunc10k
    appliedRate: number; progressiveDeduction: number;
    calculatedTax: number;           // 나②ⓐ
    stdTaxNumerator: number;         // 나②ⓑ 분자 = floor(taxBase×70%×rate) — 누진공제 없음
    stdTaxDenominator: number;       // 나②ⓑ 분모 = 누진 1회(공제 차감)
    creditAmount: number;            // 나②ⓑ = floor(propertyTaxEquiv × 분자/분모)
    perJurisdiction: LandPriorJurisdictionTax[];
  };
}

// AggregateLandTaxResult·SeparateAggregateLandTaxResult 확장 (전부 optional — 집계 모드 회귀 0):
//   perJurisdiction?: LandJurisdictionPropertyTax[];
//   previousYearEquivalent?: LandPreviousYearEquivalent;
//   propertyFairMarketRatio?: number;     // 0.70 echo
//   taxBeforeCap?: number;                // ③ = calculatedTax − creditAmount (clamp 0)
//   currentYearTotalEquivalent?: number;  // ④가 = ②ⓐ합 + ③ (taxCap 존재 시)
// SeparateAggregateLandTaxResult 추가:
//   taxCap?: TaxCapResult;                // G-3 — §15 KoreanLaw 검증 후
```

전부 `number`/배열 — Map 금지(`feedback_engine_result_map_json_loss`).

---

## 3. 신규 모듈 `lib/tax-engine/comprehensive-land-parcels.ts`

```
calcLandParcelsPropertyTax(parcels, kind: "aggregate"|"separate", useprior: boolean)
  → { perJurisdiction: LandJurisdictionPropertyTax[], imposedSum, officialValueSum,
      priorPerJurisdiction?: LandPriorJurisdictionTax[], priorStandardSum? }

STEP P1. 필지 공시가격 = floor(area × shareRatio × officialPricePerSqm)   // 면적·지분 소수 — floor 1회
STEP P2. jurisdiction(trim) 그룹핑 → 그룹 공시 합산
STEP P3. 그룹 재산세 과표 = floor(그룹 공시합산 × 70/100)   // 지자체별 floor — ②ⓐ 재산세 부과용 (교재 3.01억·9.59억)
         ※ ⓒ 분모용 과표는 §5 어댑터에서 **전체 공시합산 단일 floor** — 용도별 floor 경로 상이 (D1-1)
STEP P4. 그룹 표준세율 재산세 = kind별 누진:
         aggregate → calculateComprehensiveAggregateTax(과표)  [기존 재사용 — probe 일치]
         separate  → PROPERTY_SEPARATE_CONST 누진 (기존 함수 재사용 또는 동일 상수 wrapper)
         + 적용 구간(rate·deduction) echo: getLandStandardRateBracket(kind, 과표) 신규 export
STEP P5. (자동 서브모드) 직전 공시(P1~P4 동일, prior 단가) → priorStandardTax
         capAmount = floor(priorStandardTax × 150 / 100)   // PROPERTY_CONST.TAX_CAP_RATE_LAND
         imposedTax = min(standardTax, capAmount)           // §122
         (직전 부재) imposedTax = standardTax
STEP P6. 합산 → ②ⓐ = Σ imposedTax
```

## 4. 신규 모듈 `lib/tax-engine/comprehensive-land-prior-year.ts` (G-2)

```
calcLandPreviousYearEquivalent(parcels, kind, currentYear)
  → LandPreviousYearEquivalent

STEP Y1. py = currentYear − 1. fairMarketRatioLand = getComprehensiveParams(py).fairMarketRatioLand
         ※ currentYear ≤ 2021 호출 금지 — Zod ⑫ 1차 차단 + 본 함수 가드(throw 대신 호출부 미호출)
STEP Y2. 직전 공시 합산(P1·prior 단가) → 지자체 분해(P2~P4) → propertyTaxEquiv = Σ standardTax  // 나①
STEP Y3. 종부세 과표 = trunc10k(floor((합산 − 공제) × FMR))                                     // 나②ⓐ
         세액 = kind별 종부세 누진 (기존 calcAggregateLandTaxAmount / separate 누진 재사용 — 세율 2021·2022 불변 실측)
STEP Y4. 나②ⓑ: 분자 = floor(종부 과표 × 70 × rate분자 / 분모상수)  // 누진공제 없음 — 교재 3,158,750·103,740,000
              분모 = 직전 재산세 과표(= floor(직전 공시합산 × 70/100) **전체 단일 floor** — D1-1 동일 원칙)에
                     누진 1회(공제 차감)                            // 교재 4,825,000·130,400,000
              creditAmount = floor(safeMultiplyThenDivide(propertyTaxEquiv, 분자, 분모))
STEP Y5. comprehensiveTaxEquiv = max(나②ⓐ − 나②ⓑ, 0). total = 나① + 나②
```

## 5. Orchestrator 통합 (`comprehensive-tax.ts` — 어댑터, land 엔진 시그니처 무변경)

```
if (input.landAggregateParcels?.length) {
  const p = calcLandParcelsPropertyTax(parcels, "aggregate", 자동서브모드);
  const prior = 자동서브모드 ? calcLandPreviousYearEquivalent(...) : undefined;
  const aggInput: AggregateLandTaxInput = {
    totalOfficialValue: p.officialValueSum,
    // 분모 ⓒ 입력 = 전체 공시합산 × 70% **단일 floor** (법정: 18억×70% — 교재 ⓒ 6,050,000).
    // ⚠️ Σ 지자체별 과표(개별 floor 합) 금지 — floor 경로 불일치 1원 차 가능 (D1-1 정정)
    propertyTaxBase:    Math.floor(p.officialValueSum * 70 / 100),
    propertyTaxAmount:  p.imposedSum,                          // ②ⓐ
    previousYearTotalTax: prior?.total ?? input.landAggregate직접입력,
  };
  const r = calculateAggregateLandTax(aggInput, yearParams.fairMarketRatioLand);
  r.perJurisdiction = p.perJurisdiction; r.previousYearEquivalent = prior; …echo 부착
}
// separate 동형 + G-3: applySeparateLandTaxCap (§15 검증 후 — applyAggregateLandTaxCap 동형 신규)
```

## 6. G-3 별도합산 세부담상한 (KoreanLaw 검증 게이트)

- §15 축자 검증 후: `applySeparateLandTaxCap`(aggregate 동형·150%) 추가 + `comprehensive-separate-land.ts:10`·`legal-codes/comprehensive.ts` "상한 없음" 주석 정정.
- 입력 부재 시 undefined(현행 사용자 경로 영향 0 — 회귀 보장).

## 7. 설계 결정·확인 필요

| # | 항목 | 상태 |
|---|---|---|
| D-1 | ✅ **실측 해결(2026-06-12 검토)**: 기존 land 엔진 `calcLandPropertyTaxCreditProration`(`comprehensive-land-aggregate.ts:168~200`)이 이미 법정 산식 — 주석 `:157~161`에 사례10 ⓑ 4,550,000·ⓒ 6,050,000 실측 명기. 입력 `propertyTaxBase`=재산세 과표(공시×70% **전체 단일 floor** — §5 어댑터 정정 반영) | 해결 |
| D-2 | ✅ **검증완료(2026-06-12 KoreanLaw)**: 종부세법 §15② [시행 2021.9.14. 법률 제18449호] — 별도합산토지 **150% 상한 명시**(§15①종합합산도 150%). G-3 추가 정당·`comprehensive-separate-land.ts:10` 주석 드리프트 확정 |
| D-3 | ✅ **검증완료**: 시행령 §7(별도)·§6(종합) — 비교기준=직전 재산세상당액+종부세상당액 합계. ★재산세상당액 산정 시 **지방세법 §111③·§112①2호·§122 제외** → ④나① 재계산은 §122 Min 미적용(slim 구조 R1-6 일치). 지방세법 §122[시행 2022.1.13. 법률 제17893호] 토지 단일 150%(②ⓐ Min용) |
| D-4 | 별도합산 재산세 누진의 기존 함수 직접 재사용 가능성(`separate-aggregate-land.ts:416` 시그니처가 land item 배열 요구 시 상수 기반 소형 함수 신규 — 상수만 import·세율표 복제 금지) | Do 직전 Read |
| D-5 | ★ **land 결과 `propertyTaxCredit` 필드명 주택과 상이**(실측): 토지 인라인 타입은 `propertyTaxAmount`(`types/comprehensive.types.ts:395`), 주택은 `totalPropertyTax` — 카드(UI)는 토지 필드명으로 소비. UI design에 명시 전달 | 확정(주의) |
| D-6 | M-09 2021 귀속 가드: Zod ⑫ 1차 차단 + **orchestrator에서 currentYear<2022 시 prior 미산출 + `warnings` 추가**(throw 금지 — 직접입력 경로는 계속 동작) | 확정 |

## 8. anchor 파일

`__tests__/tax-engine/comprehensive-land-case10-11.test.ts` — LD-A1~A3(원단위 toBe)·LD-B1~B5. 기존 토지 anchor 전부 불변 확인을 同파일 회귀 케이스로 포함.
