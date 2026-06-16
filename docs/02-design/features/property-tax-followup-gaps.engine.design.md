# 재산세 A-3 후속 4건 — 엔진/데이터 설계 (Track A·B·C 상세 + D 개요)

> **선행 계획**: `docs/01-plan/features/property-tax-followup-gaps.plan.md` (9건 자가검토 정정 반영).
> **검증**: 모든 file:line·세율·시그니처 실측(2026-06-16). 법령 KoreanLaw(지방세법 282559 / 시행령 286395).
> **범위**: 즉시 구현 B·A·C 엔진 설계. D는 §6 개요(착수 시 별도 .engine.design.md).
> **권장 순서**: B → A → C(§계획서 §7). 트랙별 독립 PR.

---

## 1. 케이스 인벤토리

### Track A — 분리과세 세율 연도화 (`separate-taxation.ts`)
| 케이스 | 분류 함수 | 직전(리터럴) | rateSet 후 | 법령 |
|---|---|---|---|---|
| 저율(전·답·과수원·목장·임야) | `classifyLowRate`(`:162`) | `RATE_LOW=0.0007` | `rateSet.landSeparatedLow` | §111①1다(1) |
| 일반(그 밖의 토지) | `classifyStandard`(`:217`) | `RATE_STD=0.002` | `rateSet.landSeparatedGeneral` | §111①1다(3) |
| 중과(골프장·고급오락장용) | `classifyHeavy`(`:281`) | `RATE_HEAVY=0.04` | `rateSet.landSeparatedHigh` | §111①1다(2) |

`calculateSeparateTaxationTax`(`:396`)는 `classification.appliedRate` 재사용 → **불변**(rateSet 미주입).

### Track B — 세부담상한 echo (objectType별 cap 경로)
| objectType / landTaxType | cap 함수(실측) | basis 출처 | recompute | echo |
|---|---|---|---|---|
| building | `applyTaxCap`(`:712`) | `resolveBasisTax`(`:715`) | ✅ | `recomputeDetail` |
| vessel / aircraft | `applyTaxCap`(`:712`) | `resolveBasisTax`(`:715`) | ✅(C 후 vessel 고급) | `recomputeDetail` |
| land · comprehensive_aggregate | `applyBurdenCap`(`:642`) | `resolveBasisTax`(`:644`) | ✅ | `recomputeDetail` |
| land · separate_aggregate | `applySeparateBurdenCap`(내부) | `input.previousYearTax` 직접 | ❌ | `direct` |
| land · separated | `applyTaxCap`(`:585`) | `input.previousYearTax` 직접(`:588`) | ❌ | `direct` |
| housing | — (§122 단서 미적용) | — | — | echo 없음 |

→ **recompute echo 2경로**(종합합산 return `:665-683` / 메인 return `:748-773`) + **direct echo 2경로**(분리 `:611-629` / 별도 `:537-555`).

### Track C — 선박 세율 (objectType·vesselType)
| objectType · vesselType | 세율 | 상수(신규/정정) | 법령 |
|---|---|---|---|
| vessel · general(기본) | `rs.vesselAircraft`(0.003) | `VESSEL_GENERAL_RATE` | §111①4호 나목 |
| vessel · luxury | `rs.vesselLuxury`(0.05) | `VESSEL_LUXURY_RATE`(신규) | §111①4호 가목 |
| aircraft | `rs.vesselAircraft`(0.003) | `AIRCRAFT_RATE` | §111①5호 |

기존 `VESSEL_AIRCRAFT_RATE="지방세법 §111①4호"`(`legal-codes/property.ts:60-61`)는 호목 미구분 → 3상수로 분리(사용처 grep 후 치환).

---

## 2. 타입 변경

### `types/property.types.ts`
```ts
// PropertyTaxInput (추가) — Track C
/** 선박 유형 (objectType="vessel" 전용). luxury=고급선박 §13⑤5호 (5%). 기본 general */
vesselType?: "general" | "luxury";
// previousYearTaxBase?·taxCapMode? 는 A-3(PR#228)에서 이미 존재 — 재사용

// PropertyTaxResult (추가) — Track B. §110③ taxBaseCap* 와 네임스페이스 구분
/** 세부담상한(§122) 산정 모드 — direct(직전 세액 직접입력) | recompute(직전 과표 재산정) */
taxCapMode?: "direct" | "recompute";
/** 세부담상한 기준 직전연도 세액상당액 (cap 비교 기준값) */
taxCapBasisTax?: number;
/** recompute 모드 재산정 상세 (direct·미적용 시 undefined) */
recomputeDetail?: {
  priorYear: number;        // 직전 연도 (taxYear - 1)
  priorTaxBase: number;     // 입력된 직전 과세표준 (= previousYearTaxBase)
  appliedRate?: number;     // 직전 단일세율(건축물·선박). 누진 토지는 undefined
  recomputedTax: number;    // 재산정 직전 세액상당액 (= taxCapBasisTax)
};
```

### `data/property-rate-history.ts`
```ts
// PropertyRateSet (추가) — Track C
/** 선박 고급 (§111①4호 가목, 고급선박 §13⑤5호) */
vesselLuxury: number;
// RATE_SET_2005: { ..., vesselLuxury: 0.05 }
```
→ `property-rate-history-anchor.test.ts`에 `vesselLuxury === 0.05` 미러 anchor 추가(드리프트 차단).

---

## 3. 알고리즘

### Track A — classify rateSet 파라미터화
```ts
function classifyLowRate(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): ClassifyPartial {
  // ... appliedRate: rateSet.landSeparatedLow (← RATE_LOW)
}
// classifyStandard(input, warnings, rateSet=...) · classifyHeavy(input, warnings, rateSet=...) 동형

export function classifySeparateTaxation(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateTaxationResult {
  const heavyResult = classifyHeavy(input, warnings, rateSet);   // :353
  const lowRateResult = classifyLowRate(input, rateSet);          // :357
  const standardResult = classifyStandard(input, warnings, rateSet); // :361
}

export function calculateSeparateTax(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateTaxationResult {
  const classification = classifySeparateTaxation(input, rateSet); // :471
  return calculateSeparateTaxationTax(classification, input.assessedValue); // 불변
}
```
**호출부**(`property-tax.ts:564`): `calculateSeparateTax(sepInput, getPropertyRateSet(taxYear))` — 당해연도 추종(현행=2005 단일이라 동일값, 미래 개정 자동). 기존 동작 불변(회귀 0).

### Track B — basisTax 변수화 + echo 헬퍼
신규 `property-tax-cap-echo.ts`(800줄 분리):
```ts
export function buildCapEcho(
  input: PropertyTaxInput,
  basisTax: number | undefined,
  priorYear: number,
): Pick<PropertyTaxResult, "taxCapMode" | "taxCapBasisTax" | "recomputeDetail"> {
  if (input.taxCapMode === "recompute" && input.previousYearTaxBase != null) {
    return {
      taxCapMode: "recompute",
      taxCapBasisTax: basisTax,
      recomputeDetail: recomputePriorYearDetail(input, input.previousYearTaxBase, priorYear),
    };
  }
  return { taxCapMode: "direct", taxCapBasisTax: input.previousYearTax };
}
```
`property-tax-recompute.ts`에 detail 버전 추가(기존 `recomputePriorYearTax`는 number 유지·재사용):
```ts
// recomputedTax는 buildCapEcho에서 이미 산출한 basisTax(resolveBasisTax)를 받아 재사용 → 중복 계산 0
export function recomputePriorYearAppliedRate(
  input: PropertyTaxInput, priorYear: number,
): number | undefined {
  const rs = getPropertyRateSet(priorYear);
  switch (input.objectType) {
    case "building": return calcBuildingTax(0, input.buildingType, rs).appliedRate; // 실측: appliedRate 반환(:334)
    case "vessel":   return input.vesselType === "luxury" ? rs.vesselLuxury : rs.vesselAircraft;
    case "aircraft": return rs.vesselAircraft;
    default:         return undefined; // land·comprehensive_aggregate = 누진(단일세율 없음, 실측 :669)
  }
}
```
→ `buildCapEcho` recompute 분기: `recomputeDetail: { priorYear, priorTaxBase: input.previousYearTaxBase, appliedRate: recomputePriorYearAppliedRate(input, priorYear), recomputedTax: basisTax }` (basisTax = 호출부에서 전달된 `resolveBasisTax` 결과 — 재계산 없음).
본문 변수화(종합합산 `:641-645` / 메인 `:711-716`):
```ts
const basisTax = resolveBasisTax(input, taxYear - 1);
const { taxAfterCap, appliedCapRate } = applyBurdenCap(grossTaxComp, basisTax); // 또는 applyTaxCap
// return { ..., ...buildCapEcho(input, basisTax, taxYear - 1) }
```
분리(`:611`)·별도(`:537`) return: `...buildCapEcho(input, input.previousYearTax, taxYear - 1)` → `taxCapMode:"direct"`.

### Track C — vessel/aircraft case 분리
```ts
case "vessel": {
  const isLuxury = input.vesselType === "luxury";
  const rate = isLuxury ? getCurrentPropertyRateSet().vesselLuxury
                        : getCurrentPropertyRateSet().vesselAircraft;
  calculatedTax = applyRate(taxBase, rate);
  appliedRate = rate;
  legalBasis.push(isLuxury ? PROPERTY.VESSEL_LUXURY_RATE : PROPERTY.VESSEL_GENERAL_RATE);
  break;
}
case "aircraft": {
  const rate = getCurrentPropertyRateSet().vesselAircraft;
  calculatedTax = applyRate(taxBase, rate);
  appliedRate = rate;
  legalBasis.push(PROPERTY.AIRCRAFT_RATE);
  break;
}
```
recompute(`property-tax-recompute.ts:28-30`) 동기화:
```ts
case "vessel":
  return applyRate(priorTaxBase, input.vesselType === "luxury" ? rs.vesselLuxury : rs.vesselAircraft);
case "aircraft":
  return applyRate(priorTaxBase, rs.vesselAircraft);
```

---

## 4. 동기화 지점 (엔진 측)

| 파일 | A | B | C |
|---|---|---|---|
| `legal-codes/property.ts` | — | — | VESSEL 상수 3종(나목·5호·가목) + 사용처 grep 치환 |
| `data/property-rate-history.ts` | — | — | `PropertyRateSet.vesselLuxury` + `RATE_SET_2005` + anchor |
| `types/property.types.ts` | — | echo 3필드 | `PropertyTaxInput.vesselType` |
| `property-tax.ts` | `:564` 호출부 | basisTax 변수화 3 return + buildCapEcho | vessel/aircraft case 분리 |
| `property-tax-recompute.ts` | — | `recomputePriorYearAppliedRate`(detail용) | vessel `vesselType` 분기 |
| `property-tax-cap-echo.ts`(신규) | — | `buildCapEcho` | — |
| `separate-taxation.ts` | classify 5함수 rateSet | — | — |

종부세 영향: **`comprehensive*.ts`는 calc 세율 함수 직접 호출 0건**(grep 실측) → A·C 회귀는 재산세 test 중심.

---

## 5. anchor 케이스 (Pre-Do 우선)

| ID | Track | 입력 | 기대 | 근거 |
|---|---|---|---|---|
| A-1 | A | 분리 저율 과표 50,000,000 | `applyRate(50,000,000, 0.0007)=35,000` | §111①1다(1) |
| A-2 | A | `classifyHeavy(.., getPropertyRateSet(2026))` | 리터럴 경로(`RATE_HEAVY`)와 동일 `appliedRate=0.04` | 회귀 |
| B-1 | B | 종합합산 recompute, 직전 과표 X | `recomputeDetail.recomputedTax === resolveBasisTax(input,prior)` | §118 본문 |
| B-2 | B | 건축물 recompute(P4 C-2 직전 과표→375,000) | `recomputeDetail` 채워짐, `taxCapBasisTax=375,000` | A-3 회귀 |
| B-3 | B | direct 모드(previousYearTax 입력) | `recomputeDetail===undefined`, `taxCapMode="direct"` | direct |
| B-4 | B | 분리과세 direct | `taxCapMode="direct"`, `taxCapBasisTax=input.previousYearTax` | direct 2경로 |
| C-1 | C | vessel luxury 과표 50,000,000 | `applyRate(50,000,000, 0.05)=2,500,000` | §111①4가 |
| C-2 | C | vessel general 과표 50,000,000 | `0.003 → 150,000`(기존 회귀) | §111①4나 |
| C-3 | C | aircraft 과표 50,000,000 | `0.003 → 150,000` | §111①5호 |
| C-4 | C | recompute vessel luxury, 직전 과표 X | `applyRate(X, 0.05)` | §118+§111①4가 |

---

## 6. Track D 개요 (착수 시 별도 .engine.design.md)

§118 1호 나·다·라(토지) + 2호 나·다(건축물) 직전현황 재구성. 주택 전용(2호 라·4호)은 §122 단서로 범위 외.

- **입력**: `PropertyTaxInput.priorYearStatus?`(`"same"|"split_merge"|"category_change"|"use_change"|"new_construction"|"redevelopment"`) + 분할·합병(`priorParcelTax`·`priorAreaRatio`·`areaIncreased`)·정비사업(`redevelopmentType`·`constructionStartDate`).
- **recompute 분기 확장**: `priorYearStatus`별 직전 과표·세율 재구성. 분할·합병 면적/지분 floor 안분([[feedback_floor_residual_absorption]]).
- **단계 분할**: D1(토지 나·다) → D2(건축물 나·다) → D3(정비사업 라, 3년/5년 + min).
- **리스크**: 입력 복잡도(직전 필지 면적·지분·세액) → 실무 UX·필요성 사용자 확인. 자동 안분 fallback 금지([[feedback_no_silent_apportion_fallback]]).
