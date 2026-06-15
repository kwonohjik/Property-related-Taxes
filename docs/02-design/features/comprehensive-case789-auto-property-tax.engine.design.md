# 종부세 사례 7·8·9 재산세 ⓐ 자동화 — 엔진 설계

> 계획서: [`docs/01-plan/features/comprehensive-case789-auto-property-tax.plan.md`](../../01-plan/features/comprehensive-case789-auto-property-tax.plan.md)
> 세목 comprehensive_property(주택분) · 베이스라인 `origin/master`=`97e73c6c`(PR #210) · 작성 2026-06-15.
> ★ 본 문서의 모든 file:line·시그니처는 Explore 실측 검증(16/16 정확) 후 확정. 미확정 항목은 "확인 필요" 명시.

## Context

사례 7·8·9는 주택분 비율 안분공제 ⓐ(재산세 부과세액)를 `propertyTaxAmount` **수동 직접입력**으로 처리(PR #210, 단일 필드 override). 현행 자동계산 경로(`comprehensive-tax.ts:194-215`의 `applyEffectiveFactor(calculatePropertyTax(공시).determinedTax, …)`)는 두 가지를 재현하지 못한다:

- **다가구주택**(사례7): `calculatePropertyTax`는 단일 공시가격만 받아 1동 통째 누진(8억→1,290,000) → 구별 면적안분 합산(714,000) 불가.
- **주택 세부담상한**(사례8·9): 재산세 엔진이 §122 단서(주택 폐지)로 주택 세부담상한을 패스스루(`property-tax.ts:312-325`) → 105/110/130% 상한이 ⓐ에 미반영.

종부세법 §9③은 공제 재산세 ⓐ를 "지방세법 §122에 따라 세부담 상한을 적용받은 경우에는 **그 상한을 적용받은 세액**"으로 법정한다. 즉 ⓐ에 상한 반영이 법령 정합이며, 자동계산이 이를 누락한 것이 갭이다.

본 설계는 ⓐ 자동 산정을 신설한다. `propertyTaxAmount` 수동입력은 **최우선 안전판**으로 유지(하위호환).

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | **트랙 A** 다가구 면적안분 — 통합공시 8억 + 층별 {120,120,60}㎡ → 구별 안분·누진 합산 ⓐ=714,000 | 부동산공시법 §17 + 국토부 고시(면적안분) | 사례7 PDF(⑤=560,595) | `comprehensive-case789-auto.test.ts` | ☐ TODO |
| 2 | **트랙 A** ⑤ 종부세 = 560,595 (수동입력 없이 자동) | 종부세법 §8·§9(2022 구법) | 사례7 PDF | 〃 | ☐ TODO |
| 3 | **트랙 B** 주택 세부담상한 — 서초 당해 4,170,000 → min(·, 직전표준 2,970,000×130%) → ×0.7 = ⓐ_서초 2,702,700 | 지방세법 §122 단서 3호(공시 6억↑ 130%) | 사례8 PDF | 〃 | ☐ TODO |
| 4 | **트랙 B** 강남 cap 발동(감면 없음) — 당해 1,770,000 → min(·, 직전표준 1,290,000×130%=1,677,000)=ⓐ_강남 1,677,000 | §122 단서 3호 | 사례8 PDF | 〃 | ☐ TODO |
| 5 | **트랙 B** ⑤ 종부세 = 16,747,099 (서초+강남 자동) | 종부세법 §8·§9 | 사례8 PDF | 〃 | ☐ TODO |
| 6 | **트랙 B** 안양 110% 구간 — 당해 570,000 → min(·, 직전표준 420,000×110%=462,000)=ⓐ_안양 462,000 | §122 단서 2호(공시 3~6억 110%) | 사례9 PDF | 〃 | ☐ TODO |
| 7 | **트랙 B** ⑤ 종부세 = 25,546,712 (서초+강남+안양 자동) | 종부세법 §8·§9 | 사례9 PDF | 〃 | ☐ TODO |
| 8 | **하위호환** `propertyTaxAmount` 직접입력 시 floorUnits·priorAssessedValue 무시(override 최우선) | — | (자기일관) | 〃 | ☐ TODO |
| 9 | **edge** 2024+ → `getHousingTaxCapPct`=null → 세부담상한 미적용(cap 전 값) | §122 폐지·과세표준상한제 §110③(2024 시행) | (가드) | 〃 | ☐ TODO |
| 10 | **회귀** 사례1~6·12 — 신규 필드 미입력 시 기존 자동계산 불변 | — | 기존 anchor | (기존 test suite) | ☐ TODO |
| 11 | **edge(가드)** 다가구+세부담상한 결합(R-6) — 트랙A Σ를 트랙B `standardTax`로 투입(1동 전체 기준 상한) | §122 단서 | (사례789엔 미발생 — 가드만) | 〃 | ☐ TODO |
| 12 | **edge** 소수 면적·floor 잔액 — Σ구별공시 = 통합공시 보존(마지막 구분 흡수) | — | (정밀 anchor) | 〃 | ☐ TODO |

**규칙**: 행 1개 = anchor 테스트 1개 이상. anchor 출처 미발견 행은 ☐로 두되 발견 즉시 추가. 사례789 ⑤ 3종(560,595 / 16,747,099 / 25,546,712)은 PR #210 수동입력으로 이미 재현 검증 — 자동 경로가 동일 ⓐ를 산출하면 ⑤ 자동 충족.

---

## 법령 근거

`lib/tax-engine/legal-codes/property.ts` 상수 사용 강제(문자열 리터럴 금지). KoreanLaw 본문 대조 완료(행위시법 2022.6.1 기준).

```
지방세법 §122 단서(2022, 주택 세부담상한 — 기준 = 주택공시가격):
  1호 공시 3억 이하        → 105%   (HOUSING_TAX_CAP_PCT_1)
  2호 공시 3억 초과 6억 이하 → 110%   (HOUSING_TAX_CAP_PCT_2)
  3호 공시 6억 초과        → 130%   (HOUSING_TAX_CAP_PCT_3)
  경계: BRACKET_1=300,000,000 / BRACKET_2=600,000,000 (property.ts:184-190)

지방세법 §122 본문→ 주택 세부담상한 폐지(2024), 과세표준상한제 도입:
  ★ 조문 = §110③ (NOT §110의2 — 부존재). 시행 2024.1.1, 경과조치 2028.12.31.
  엔진 상수 HOUSING_TAX_CAP_ABOLISHED_YEAR=2024.
  ★ property-tax.ts:294·legal-codes/property.ts:64 주석의 "§110의2"는 오기 → §110③로 정정(부수 작업).

종부세법 §9③: 공제 재산세 ⓐ = "§122에 따라 세부담 상한을 적용받은 경우에는 그 상한을 적용받은 세액"
  → 트랙 B의 법적 근거(상한 후 실부과액을 ⓐ로).

부동산공시법 §17(개별주택가격 결정·공시) — 다가구주택(단독주택)은 1동 1개 개별주택가격.
지방세법 §107 — 시가표준액 비율 안분 원칙(사례6 건물·부속토지 소유자 분리에 사용).
  ★ 다가구 구별 면적안분의 **직접 근거는 부동산공시법 §17 + 국토부 「개별주택가격 조사·산정지침」(고시)**(면적안분 산식, 법령DB 미수록 △) — §107은 비율 안분 원칙의 유추일 뿐 직접 조문 아님. 사례7 본문으로 갈음.

✅ R-9 해결(KoreanLaw §118 본문 확인, 2026-06-16): 지방세법 시행령 §118 제3호 —
  "직전 재산세액 상당액"은 당해 연도의 비과세·감면을 직전에도 동일 적용해 산출(직전 감면율 = 당해 감면율 명문화).
  → 본 설계의 감면전 표준세율 cap + 감면 후곱 = §118(감면후 직전 × pct)과 대수적 동일(§B 증명). "직전≠당해 감면율" 엣지 부존재.
  직전 표준세율은 직전 공시 + 직전 연도 법령(§118 제2호 가목 본문)으로 산출.
```

---

## 엔진 input 타입

`lib/tax-engine/types/comprehensive.types.ts`의 `ComprehensiveProperty`에 **2개 optional 필드 추가**(주택분 전용):

```ts
export interface ComprehensiveProperty {
  // ── 기존 (PR #199·#204·#208·#210) ──
  assessedValue: number;            // 공시가격(원). 다가구는 1동 통합공시.
  reductionRate?: number;           // 감면율 (0~1)
  ownershipRatio?: number;          // 지분율 (0~1)
  appurtenantSplit?: { ... };       // 건물·부속토지 분리(사례6)
  propertyTaxAmount?: number;       // ⓐ 직접입력 — 최우선 override (types:232, PR #210)

  // ── 신규(본 설계) ──
  /**
   * 트랙 A — 다가구주택 구분(층) 면적(㎡). 입력 시 통합공시(assessedValue)를
   * 면적비율로 구별 안분 후 각 구분에 누진세율 개별 적용·합산하여 ⓐ 산정.
   * 면적은 소수 허용(parseDecimal). area>0·합>0 검증(⑧).
   */
  floorUnits?: { label: string; area: number }[];

  /**
   * 트랙 B — 주택별 직전연도 공시가격(원). 입력 시 §122 세부담상한(105/110/130%)을
   * ⓐ에 반영. ★ 직전 공시 단일 진실(previousYearAuto.priorHouseValues와 중복 금지 — Zod refine).
   */
  priorAssessedValue?: number;
}
```

## 엔진 result 타입

ⓐ 자동 산정 근거를 결과 카드(⑦)에서 echo. 수동입력(`propertyTaxAmount`) 시 미생성(undefined). **`ComprehensiveTaxResult.properties[]`**(types:642-647, 기존 `{propertyId, assessedValue, isExcluded, propertyTax}`)에 optional 필드로 추가:

```ts
/** 트랙 A echo — 구별 안분 내역 */
multiFamilyBreakdown?: {
  label: string;
  apportionedAssessedValue: number; // 구별 공시 = floor(통합 × area_i/Σarea), 마지막=잔액 흡수
  tax: number;                      // 구별 누진 재산세
}[];

/** 트랙 B echo — 세부담상한 Min 내역 */
housingTaxCapDetail?: {
  standardTax: number;        // 당해 표준세율(감면전·cap전) = calculatePropertyTax(당해공시).determinedTax (다가구면 trackA Σ)
  priorStandardTax: number;   // 직전 표준세율(감면전) = calcHousingTax(floor(직전공시×priorFMR), 직전공시, false).tax
  capPct: number | null;      // 105 | 110 | 130 | null(2024+)
  capAmount: number;          // pct ? floor(priorStandardTax × pct/100) : Infinity
  cappedTax: number;          // min(standardTax, capAmount)
  imposedTax: number;         // applyEffectiveFactor(cappedTax, reductionRate, ownershipRatio, appurtenantSplit) = ⓐ
};
```

> 결과 타입은 `Record`(Map 금지 — `NextResponse.json` 직렬화 소실, 메모리 `feedback_engine_result_map_json_loss`).

---

## 계산 알고리즘 (단계별)

### 트랙 A — `calcMultiFamilyHousingTax` (신규 sibling 파일)

위치: **`lib/tax-engine/multi-family-housing-tax.ts`** (★ `property-tax.ts` 795줄 → 800 정책상 함수 추가 불가. `calculatePropertyTax`를 import하는 sibling — `general-building-area-apportion.ts:25-33` 패턴).

```
calcMultiFamilyHousingTax(unifiedPublishedPrice, floorUnits[], isOneHousehold, targetDate, rates)
  Σarea = Σ floorUnits[i].area
  for i in 0..n-1:
    구별공시_i = (i < n-1)
      ? floor(safeMultiplyThenDivide(통합공시, area_i, Σarea))   // 면적 안분(소수 면적 OK — Number 경로)
      : 통합공시 − Σ(앞 구분 공시)                                // ★ 마지막 = floor 잔액 흡수 → Σ = 통합공시
    구별세_i  = calculatePropertyTax({objectType:"housing", publishedPrice:구별공시_i, isOneHousehold, targetDate}, rates).determinedTax
                // ★Do 환류: 단일 공시 자동경로(calculatePropertyTax)를 구분마다 재사용 → FMR(calcTaxBase·DB rates 우선)·누진·주택
                //   패스스루가 기존 단일 경로와 동일(drift 0). 설계 초안의 getPropertyFmrForProration+calcHousingTax 직접 호출보다 단일출처·정확.
  return { total: Σ구별세_i, perUnit: [{label, apportionedAssessedValue:구별공시_i, tax:구별세_i}] }
```

- ★ 누진세율 분배법칙 불성립(`f(a+b)≠f(a)+f(b)`) → 반드시 구별 개별 적용 후 합산. 1동 통째 = 1,290,000 ≠ 구별 합산 714,000.
- 사례7: 8억 × {120,120,60}/300 = {3.2억, 3.2억, 1.6억} → 과표(×60%) {1.92억, 1.92억, 0.96억} → 누진 {300,000, 300,000, 114,000} → **714,000**.
- 소수 면적: `safeMultiplyThenDivide` 분자(통합공시 × 면적) < MAX_SAFE_INTEGER → Number 경로로 소수 정확(`general-building-area-apportion.ts:18-19` 주석 실측 ✓).

### 트랙 B — `buildHousingPropertyTaxWithCap` (종부세측)

위치: `comprehensive-prior-year.ts`(193줄 — 여유 충분, `calcPreviousYearEquivalent` 인접) 또는 신규 `comprehensive-housing-tax-cap.ts`. **R-3: 종부세측 — `property-tax.ts` 주택 폐지 패스스루(`:312-325`) 변경 금지**.

```
buildHousingPropertyTaxWithCap(prop, year, standardTax, rates)
  // standardTax 입력 분기(R-6): 단일 = calculatePropertyTax(당해공시).determinedTax
  //                              다가구 = calcMultiFamilyHousingTax(...).total
  priorFMR    = getPropertyFmrForProration(year − 1, isOneHouse)       // 직전 재산세 FMR (2021 multi=60%)
  priorStdTax = calcHousingTax(floor(직전공시 × priorFMR), 직전공시, false).tax  // 직전 표준세율(감면전)
  pct         = getHousingTaxCapPct(year, 당해공시)                    // 105/110/130 or null(2024+)
  capAmount   = pct != null ? floor(priorStdTax × pct/100) : Infinity
  cappedTax   = min(standardTax, capAmount)                           // 세부담상한 후(감면전)
  imposedTax  = applyEffectiveFactor(cappedTax, prop.reductionRate, prop.ownershipRatio, prop.appurtenantSplit)  // 감면·지분·부속토지 후곱(else-branch:215 parity) = ⓐ
  return { standardTax, priorStdTax, pct, capAmount, cappedTax, imposedTax }
```

- **순서 = 당해 표준세율 → 세부담상한(직전 기준) → 감면 후곱**.
- ★ **cap 기준 = 감면전 표준세율, 감면은 cap 후곱**. 동일 감면율 g 가정 시
  `min(C, P·pct)·g = min(C·g, P·pct·g)` (g 공통 인수) — 감면후 비교와 **대수적 동일**.
  ✅ 시행령 §118 제3호 확인(R-9 해결): "직전 재산세액 상당액"은 당해 감면을 직전에도 동일 적용(직전 감면율=당해 감면율 명문화) → "직전≠당해 감면율" 엣지 부존재, §118 정합.
- ★ 재산세 FMR = `getPropertyFmrForProration`(당해 comprehensive-tax.ts:391·직전 prior-year.ts:94) — **종부세 FMR(2021=95%) 아님**. 재산세 주택 공정시장가액비율은 60%.
- 검산: 서초 4,170,000 → min(·, 2,970,000×130%=3,861,000)=3,861,000 → ×0.7 = 2,702,700 ✓. 강남 1,770,000 → min(·, 1,290,000×130%=1,677,000)=1,677,000(cap 발동, 감면 없음). 안양 570,000 → min(·, 420,000×110%=462,000)=462,000.

### imposedTax 우선순위 분기 (`comprehensive-tax.ts:189-216`)

```
if (prop.propertyTaxAmount !== undefined)          imposedTax = prop.propertyTaxAmount    // ① 직접입력(최우선·하위호환)
else if (prop.floorUnits?.length && prop.priorAssessedValue != null)                       // R-6 결합
                                                   stdA = calcMultiFamilyHousingTax(...).total
                                                   imposedTax = buildHousingPropertyTaxWithCap(prop, year, stdA, …).imposedTax
else if (prop.priorAssessedValue != null)          imposedTax = buildHousingPropertyTaxWithCap(prop, year, calculatePropertyTax(공시).determinedTax, …).imposedTax  // ② 트랙B
else if (prop.floorUnits?.length)                  imposedTax = applyEffectiveFactor(calcMultiFamilyHousingTax(...).total, rate, ratio, appurtenant)  // ③ 트랙A
else                                               imposedTax = applyEffectiveFactor(calculatePropertyTax(공시).determinedTax, rate, ratio, appurtenant)  // ④ 기존 자동(불변)
```

- ★ 과표 경로(`effectiveAssessedValue`, reductionRate 반영)·비율 안분 분자는 **무변경** — override는 imposedTax(ⓐ)에만 영향. 안분공제 ⓓ는 기존 `safeMulDivRound`(helpers:278) 그대로 round 정확.
- ★ `calculatePropertyTax(공시).determinedTax`는 기존 else-branch(comprehensive-tax.ts:196-206)의 다인자 호출 `calculatePropertyTax({objectType:"housing", publishedPrice, isOneHousehold, targetDate}, rates).determinedTax` 약식. 트랙B `standardTax`는 이 값을 **재사용**(별도 재계산 금지=dual-truth 방지).
- ★ 헬퍼 인자 출처: `year = input.assessmentYear`; `isOneHouse = !isCorporate && input.isOneHouseOwner && input.properties.length === 1`(기존 201행 식). 사례8·9 다물건 → false → 재산세 FMR 60%.

---

## Silent fallback / 자동 안분 후보 식별

- `floorUnits` 면적: 자동 채움 **금지**. 미입력 시 단일 공시 자동(기존 경로 ④)으로 빠짐 — 다가구 의도 시 면적 누락은 ⑧ validation에서 area>0·합>0 차단.
- `priorAssessedValue` 미입력: 세부담상한 **미적용**(기존 경로). 강제 차단 아님 — 상한이 필요 없는 일반 케이스가 다수. 단 `previousYearTotalTax`(직전 총세액) 직접입력 모드와 충돌 안 하도록 ④ 합산 단일 진실(`priorAssessedValue` 합산) 명시.
- dual-truth 방지: `priorAssessedValue`(주택별) ↔ `previousYearAuto.priorHouseValues`(**주택별 배열** number[], types:370) **공존 금지** — Zod refine. 한쪽만 입력(priorAssessedValue가 단일 진실, priorHouseValues는 그로부터 도출).
- 다가구 면적 안분은 §107①2호 시가표준액 비율 안분의 명문 근거 有 → "자동 안분 금지" 정책의 예외 아님(법령 명시 안분).

---

## 테스트 약속

- 케이스 인벤토리 12행 → `__tests__/tax-engine/comprehensive-case789-auto.test.ts` anchor (flat — comprehensive 테스트 디렉터리 컨벤션).
- PDF 예시값 원단위 `toBe()`: ⓐ(714,000 / 4,379,700 / 4,841,700)·⑤(560,595 / 16,747,099 / 25,546,712).
- 분배법칙 함정 anchor: 다가구 1동 통째(1,290,000) ≠ 구별 합산(714,000) 명시 비교.
- floor 잔액 anchor: Σ구별공시 = 통합공시(소수 면적 케이스).
- 회귀: 사례1~6·12 전체 vitest 불변(신규 필드 미입력).
- `property-tax.ts` 주택 폐지 패스스루(`:312-325`) 무변경 — 재산세 단독 계산기 회귀 확인.

---

## UI 통합 위임

- UI 측 명세는 [`comprehensive-case789-auto-property-tax.ui.design.md`](comprehensive-case789-auto-property-tax.ui.design.md) 참조.
- 엔진 시니어 책임: input(`floorUnits`·`priorAssessedValue`)·result(`multiFamilyBreakdown`·`housingTaxCapDetail`) 타입 정의 + 4함수(`calcMultiFamilyHousingTax`·`buildHousingPropertyTaxWithCap`·우선순위 분기·§110③ 주석 정정).
- 14 동기화 지점 중 엔진=타입+분기, 나머지(①~⑧ 클라이언트·⑨⑫⑭ Zod/route)는 UI 시니어. ⑥⑩⑪은 N/A(계획서 §6).
