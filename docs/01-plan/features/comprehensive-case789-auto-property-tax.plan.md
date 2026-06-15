# 종부세 사례 7·8·9 재산세 ⓐ 자동화 계획서 — 다가구 면적안분 + 주택 세부담상한

> 현재 사례 7·8·9는 비율 안분공제 ⓐ(재산세 부과세액)를 `propertyTaxAmount` **수동 직접입력**으로 처리(PR #210). 이를 **엔진 자동 계산**으로 대체하는 후속 계획. 수동입력은 하위호환으로 유지.
> 작성일 2026-06-15 · 세목 comprehensive_property(주택분) · PDCA Plan 단계 · **코딩 미착수**.

---

## §0. 기본 정보 · 베이스라인

| 항목 | 값 |
|---|---|
| 베이스라인 | `origin/master` = `97e73c6c` (사례789 `propertyTaxAmount` 수동입력 머지 후, PR #210) |
| 선행 작업 | `propertyTaxAmount` 수동입력 ([[project_comprehensive_case789_multi_house]]) — ⓐ 직접 주입으로 ⑤ 재현 완료 |
| 목적 | ⓐ 수동입력 우회를 **자동 계산**으로 대체. `propertyTaxAmount` 직접입력은 **유지**(우선순위 최상위) |
| 신규 브랜치 | `origin/master`에서 분기 (격리 worktree 권장 — 동시 세션 이력) |

### 자동화 2트랙

| 트랙 | 사례 | 현재 우회 | 자동화 목표 |
|---|---|---|---|
| **A. 다가구 면적안분** | 7 | `propertyTaxAmount=714,000` | 1동 통합공시(8억) + 층별 면적 → 구별 안분·누진 재산세 합산 자동 |
| **B. 주택 세부담상한** | 8·9 | `propertyTaxAmount=2,702,700` 등 | 당해 표준세율 → 세부담상한(105/110/130%) → 감면 후곱 자동 |

> ✅ **결정 (2026-06-15)**: 트랙 A·B **둘 다 자동화** 진행. `propertyTaxAmount` 수동입력은 하위호환 **안전판으로 유지**(우선순위 최상위). 자동화는 추가 입력(층별 면적·직전연도 공시가격)을 요구하므로 입력 UX 완화를 설계에 포함한다 — 직전 공시는 종부세 기존 `previousYearAuto.priorHouseValues`를 **주택별로 일원화**해 재사용(별도 중복 입력 금지), 다가구 면적 행은 **토글 ON 시에만** 노출. 복잡도·입력 부담은 §10 리스크로 관리하되 **진행은 확정**.

---

## §1. 배경 · 현재 상태

현행 주택 루프(`comprehensive-tax.ts:171-229`)의 ⓐ 산정:

```
imposedTax =
  prop.propertyTaxAmount !== undefined           // ← 사례7·8·9 우회 (수동입력)
    ? prop.propertyTaxAmount                       //    고지서 실부과액 그대로
    : applyEffectiveFactor(calculatePropertyTax(공시).determinedTax, rate, ratio, appurtenant)
                                                   // ← 자동: 세부담상한·다가구 미반영
```

자동계산 경로(`else`)가 사례 7·8·9를 재현 못 하는 이유:
- **사례7**: `calculatePropertyTax`는 단일 공시가격만 받음 → 1동 8억 통째 누진(1,290,000). 구별(120/300·120/300·60/300) 안분 합산(714,000) 미지원.
- **사례8·9**: `calculatePropertyTax(housing).determinedTax`에 주택 세부담상한이 **적용 안 됨**(아래 §3) → 130%·110% 상한 후 실부과액과 괴리.

---

## §2. 법령 근거

| 항목 | 근거 | 상태 (KoreanLaw 본문 대조 완료) |
|---|---|---|
| 재산세 주택 세부담상한 (2022) — 공시 3억↓ **105%** / 3~6억 **110%** / 6억↑ **130%** | 지방세법 **§122 단서 1·2·3호** (기준 = 주택공시가격) | 행위시법 2022.6.1 본문 직접 확인 ✓ · 엔진 상수 `HOUSING_TAX_CAP_PCT_1/2/3`·`_BRACKET_1/2`(property.ts:184-190) 일치 ✓ |
| 주택 세부담상한 폐지 → 과세표준상한제 도입 | 폐지 §122 / 도입 **지방세법 §110③** (★`§110의2` 아님 — 부존재) / **시행 2024.1.1** / 경과조치 2028.12.31 종전 병존 (부칙 법 19230호) | 본문 확인 ✓ · 엔진 `HOUSING_TAX_CAP_ABOLISHED_YEAR=2024` 일치 ✓ · **★엔진 주석의 "§110의2"는 부정확 → §110③로 정정 권고** |
| 다가구 통합공시 (단독주택 = 1동 1개 개별주택가격) | 부동산공시법 **§17**(개별주택가격 결정·공시) — 공동주택(§18) 체계와 구분 | 본문 확인 ✓ |
| 재산세 건물·부속토지 안분 (시가표준액 비율) | 지방세법 **§107①2호** | 본문 확인 ✓ · "구별 면적안분" 산식은 국토부 「개별주택가격 조사·산정지침」(고시) — 법령DB 미수록(△, 행정실무) |
| 종부세 공제 재산세 ⓐ = **세부담상한 적용 후 실부과액** | 종합부동산세법 **§9③** 본문 ("§122에 따라 세부담 상한을 적용받은 경우에는 그 상한을 적용받은 세액") | 본문 직접 확인 ✓ — **자동화 트랙 B의 법적 근거** (★시행령 §4의2는 "1세대1주택자 범위" — 공제 산정 조항 아님, 인용 오류 정정) |
| 세율·기본공제·FMR·세부담상한 150/300% | 종부세법 §8·§9·§10 (2022 구법) | 이전 워크플로 검증 ✓ (`comprehensive-historical` 정합) |

> ✅ 법령 본문 대조 완료(§122 단서·§9③·§110③·부동산공시법 §17·지방세법 §107①2호, 행위시법 2022.6.1 기준). 세부담상한 구간율(105/110/130%)·폐지연도(2024)·ⓐ=상한후 실부과액 모두 확정. **유일한 미수록**: 다가구 "구별 면적안분" 산식(국토부 고시 영역, 법령DB 외) — 사례7 본문 + §107①2호 시가표준액 안분 원칙으로 갈음.

---

## §3. 현행 코드 실측 · 갭 (조사 완료)

### 3.1 재사용 가능한 기존 인프라

| 자산 | 위치 | 용도 |
|---|---|---|
| `HOUSING_TAX_CAP_PCT_1/2/3`·`_BRACKET_1/2`·`_ABOLISHED_YEAR` | legal-codes/property.ts:184-190 | 구간율·경계·폐지연도 |
| `getHousingTaxCapPct(year, assessedValue)` | comprehensive-prior-year.ts:181-193 | 구간율 판정(2024+ → null) |
| `calcPreviousYearEquivalent` 내부 `Σ calcHousingTax(v×FMR, v, false)` | comprehensive-prior-year.ts:99-102 | 직전 주택별 표준세율 재산세 산출 |
| `calcHousingTax(taxBase, publishedPrice, isOneHousehold)` | property-tax.ts:208-243 | 주택 누진세율 단일 산출 |
| `apportionLandByBusinessArea` (면적비율 안분 산식) | general-building-area-apportion.ts:25-33 | 구별 공시 안분 산식 원형 |
| `LandParcelInput`·`LandJurisdictionPropertyTax`(필지→합산→누진→§122 Min) | comprehensive.types.ts:272-301, comprehensive-tax.ts:532-553 | **다가구·세부담상한 builder 청사진** |
| `applyEffectiveFactor`·`safeMultiplyThenDivide`(BigInt round) | comprehensive-tax-helpers.ts:58-90 | 감면·지분 후곱, 정밀 안분 |

### 3.2 갭 (신규 필요)

| 갭 | 근거 | gapType |
|---|---|---|
| 재산세 엔진 주택 세부담상한 폐지·패스스루 — 자동 ⓐ에 105/110/130% 없음 | property-tax.ts:311-325 (`objectType==="housing"` 무조건 `determinedTax=calculatedTax`) | engine-new (종부세측 헬퍼) |
| 종부세 §122 Min은 `previousYearAuto` 모드 + **합산 1회**(§9③ 괄호)일 뿐, 개별 주택 고지서 상한 미재현 | comprehensive-tax.ts:416-425 (`effectiveIncludedAssessedValue` 단일 구간판정) | engine-new |
| 다가구 구별 면적안분 자동 계산 0건 (단일 `publishedPrice`만) | property-tax.ts, comprehensive.types.ts (floorUnits 등 부재) | engine-new |
| 주택별 직전 공시가격 입력 부재 (직전은 `PreviousYearAutoInput` 인별 합산만) | comprehensive.types.ts:349-394 | engine-new |

### 3.3 핵심 통찰 — "세부담상한" 두 레이어 구분

1. **개별 주택 고지서 세부담상한** (사례8·9가 필요): 주택별 `ⓐ_i = min(당해 표준세율_i, 직전 그 주택 재산세_i × 105/110/130%)`. **미구현**.
2. **종부세 §9③ 괄호의 합산 ⓐ 캡**: `min(Σⓐ, 직전 합산 재산세상당액 × 구간율)`. `previousYearAuto`에서 **이미 구현**(사례12 M-12 검증). 레이어 1과 다름.

자동화는 **레이어 1 신설**이 핵심. 레이어 2는 그 위에 기존대로 작동.

---

## §4. 설계

### 트랙 A — 다가구 면적안분 (사례7)

**엔진 (재산세 도메인 — 단방향 의존 준수: comprehensive → property)**

재산세 도메인 **sibling 신규 파일** `lib/tax-engine/multi-family-housing-tax.ts` (★property-tax.ts 795줄 → 800 정책상 함수 추가 불가 → `calcHousingTax` import하는 별도 파일, `general-building-area-apportion.ts` 패턴):
```
calcMultiFamilyHousingTax(unifiedPublishedPrice, floorUnits[], isOneHousehold, year, rates)
  → 구별 공시_i = floor(safeMultiplyThenDivide(통합공시, area_i, Σarea))   // 면적 안분(소수 면적 OK — Number 경로)
  →   ★ 마지막 구분 공시 = 통합공시 − Σ(앞 구분 공시)                        // floor 잔액 흡수 → Σ구별 = 통합공시 보존
  → 구별 과세표준_i = floor(구별 공시_i × getPropertyFmrForProration(year, isOneHousehold))  // 재산세 FMR(multi=60%)
  → 구별 재산세_i = calcHousingTax(과세표준_i, 구별 공시_i, isOneHousehold) // 누진 개별 적용
  → return { total: Σ구별 재산세_i, perUnit: [{label, 공시_i, 재산세_i}] }   // echo 포함
```
- ★ 누진세율은 분배법칙 불성립(`f(a+b)≠f(a)+f(b)`) → 반드시 **구별 개별 적용 후 합산**.
- 사례7: 8억 × {120,120,60}/300 = {3.2억, 3.2억, 1.6억} → 각 누진 {300,000, 300,000, 114,000} → 714,000.
- ★ 면적은 `parseDecimal` 소수 허용(㎡). `safeMultiplyThenDivide` 분자(통합공시 × 면적) < MAX_SAFE → 소수 정확 처리(`general-building-area-apportion.ts:18-19` 주석 실측 ✓). floor 잔액은 마지막 구분 흡수([[feedback_floor_residual_absorption]]).
- ★ 사례7은 `isOneHousehold=false`(다주택 60% FMR·표준세율) — 수동입력 `propertyTaxAmount=714,000` anchor가 ⑤=560,595 재현으로 이미 검증.

**입력**: `ComprehensiveProperty.floorUnits?: { label: string; area: number }[]` (1동 통합공시는 기존 `assessedValue`, 면적비율만 추가).

**종부세 분기** (comprehensive-tax.ts:189-216):
```
우선순위: propertyTaxAmount(직접입력) > floorUnits(트랙A) | priorAssessedValue(트랙B) > 단일 assessedValue(기존 자동)
  ※ floorUnits + priorAssessedValue 동시 입력(다가구+상한 결합) = R-6 — 트랙A Σ를 트랙B standardTax로 투입
```

**세부담상한**: 다가구는 "구별이 아닌 1동 전체 기준"(사례7 본문) → 트랙 B와 결합 시 1동 합산액에 상한 적용. 사례7은 직전 총세액상당액으로 ④ 미발동(트랙 B 불요 케이스).

### 트랙 B — 주택 세부담상한 (사례8·9)

> **법적 근거 (종부세법 §9③)**: 공제 재산세 ⓐ는 "지방세법 §122에 따라 세부담 상한을 적용받은 경우에는 **그 상한을 적용받은 세액**"으로 법정(본문 확인). 즉 ⓐ에 주택 세부담상한을 반영하는 것이 법령 정합이며, 현재 자동계산(상한 미반영)이 이를 누락한 것이 갭이다.

**엔진 (주택용 builder — 토지 `LandJurisdictionPropertyTax` 패턴 이식)**

종부세측 헬퍼(`comprehensive-prior-year.ts` **193줄 — 여유 충분**, `calcPreviousYearEquivalent` 인접 재사용 / 또는 신규 `comprehensive-housing-tax-cap.ts`. R-3 종부세측 — property-tax.ts 아님. 단방향 의존 comprehensive → property 준수):
```
buildHousingPropertyTaxWithCap(prop, year, standardTax, rates)   // standardTax=당해 표준세율(호출측 주입) · FMR 내부 도출
  → (standardTax 주입: 단일=calculatePropertyTax(당해공시).determinedTax / 다가구=calcMultiFamilyHousingTax.total — 기존 경로 재사용·dual-truth 방지)
  → priorFMR      = getPropertyFmrForProration(year − 1, isOneHouse)           // 직전 재산세 FMR(multi=60% · ★종부세 95% 아님)
  → priorStdTax   = calcHousingTax(floor(직전공시 × priorFMR), 직전공시, false).tax  // 직전 표준세율(감면전)
  → pct           = getHousingTaxCapPct(year, 당해 공시)                       // 105/110/130 or null
  → capAmount     = pct ? floor(priorStdTax × pct/100) : ∞
  → cappedTax     = min(standardTax, capAmount)                               // 세부담상한 후
  → imposedTax    = applyEffectiveFactor(cappedTax, reductionRate, ownershipRatio)  // 감면·지분 후곱
  → return { standardTax, priorStdTax, capAmount, cappedTax, imposedTax }     // echo
```
- 순서: **당해 표준세율 → 세부담상한(직전 기준) → 감면 후곱**. (사례8 서초: 4,170,000 → min(·, 2,970,000×130%=3,861,000)=3,861,000 → ×0.7 = 2,702,700 ✓)
- 직전 표준세율은 `calcPreviousYearEquivalent`의 `Σcalc` 패턴 재사용(주택별 분리·헬퍼화).
- 2024+ → `pct=null` → 상한 미적용(현행 정책 유지).
- ★ **cap 기준 = 감면전 표준세율**, 감면은 cap 후곱. 동일 감면율 가정 시 `min(C, P·pct)·g = min(C·g, P·pct·g)` — 감면후 비교와 **대수적 동일**(g가 공통 인수). 직전≠당해 감면율이면 결과 상이 → 직전 감면율 별도 입력 안 함(당해 `reductionRate` 재사용 가정 명시). 엔진 layer-2(§9③)는 prior-year.ts:104에서 effectiveFactor **후** 사용 → **§122 시행령 "직전 재산세액 상당액"=감면후 여부 확인 필요**(설계 STEP 6 KoreanLaw · R-9).
- ★ `standardTax` 입력 분기(R-6 결합): 단일 주택 = `calculatePropertyTax(당해 공시).determinedTax`, **다가구** = `calcMultiFamilyHousingTax(...).total`. 사례789는 분리(7=다가구·상한 무발동 / 8·9=단일·상한 발동)이나 결합 가드 유지.
- ★ 재산세 FMR = `getPropertyFmrForProration`(당해 comprehensive-tax.ts:391·직전 prior-year.ts:94) — 종부세 FMR(95%) 아님.

**입력**: `ComprehensiveProperty.priorAssessedValue?: number` (주택별 직전연도 공시가격).
- ★ **직전 공시 입력 일원화 (dual-truth 방지)**: 기존 `PreviousYearAutoInput.priorHouseValues`(**주택별 직전 공시 배열** `number[]`, types:370)와 중복되지 않도록, 주택별 `priorAssessedValue`를 **단일 진실**로 삼고 직전 총세액상당액(④)·합산(priorHouseValues 도출)도 이로부터 산출. 두 입력 경로 공존 금지(Zod refine).

**종부세 분기**: `propertyTaxAmount` 미입력 + `priorAssessedValue` 입력 시 builder 호출. 직전 총세액상당액(④)은 주택별 `priorAssessedValue` 합산으로 자동 산출(기존 `previousYearTotalTax` 직접입력도 하위호환 유지).

---

## §5. 케이스 매트릭스 (anchor — 자동 입력)

| 케이스 | 입력(신규) | 기대 ⓐ | 기대 ⑤ |
|---|---|---|---|
| 사례7 자동 | `assessedValue:8억, floorUnits:[{1층,120},{2층,120},{지하,60}]`, isOneHousehold=false | 714,000 (300k+300k+114k) | **560,595** |
| 사례8 자동 | 서초 `2,000,000,000, reductionRate:0.3, priorAssessedValue:1,500,000,000` / 강남 `1,000,000,000, priorAssessedValue:800,000,000` | 4,379,700 | **16,747,099** |
| 사례9 자동 | + 안양 `500,000,000, priorAssessedValue:400,000,000` | 4,841,700 | **25,546,712** |
| 하위호환 | `propertyTaxAmount` 직접입력 시 floorUnits·priorAssessedValue 무시 | 입력값 | 불변 |
| 회귀 | 사례1~6·12 (신규 필드 미입력) | 기존 | 불변 |

> 사례8 서초 직전 재산세상당액 검산: 직전공시 15억 → 9억×0.4%−63만=2,970,000(감면전 표준세율) → ×130%=3,861,000 → 당해 4,170,000과 min → 3,861,000 → ×0.7=2,702,700. PDF의 "2,079,000/(1−0.3)=2,970,000" 역산과 동일 결과(표준세율 직접 산출이 더 직접적).
> 사례8 강남 검산(cap 발동·감면 없음): 당해 10억 → 과표 6억(×60%) → 표준 1,770,000. 직전 8억 → 과표 4.8억 → 표준 1,290,000 ×130%(당해공시 6억↑) = 1,677,000 → min(1,770,000, 1,677,000)=**1,677,000**. ∴ 사례8 ⓐ = 서초 2,702,700 + 강남 1,677,000 = 4,379,700 ✓.
> 사례9 안양 검산: 당해 5억 → 표준 570,000. 직전 4억 → 표준 420,000 ×110%(당해공시 3~6억) = 462,000 → min(570,000, 462,000)=**462,000**. ∴ 사례9 ⓐ = 4,379,700 + 462,000 = 4,841,700 ✓.

---

## §6. 14 동기화 지점 영향

신규 필드 **2개**: `floorUnits`(트랙 A), `priorAssessedValue`(트랙 B).

| # | 지점 | 작업 |
|---|---|---|
| 엔진 | types(+`properties[]` echo) + **신규** `multi-family-housing-tax.ts` + `comprehensive-prior-year.ts`(또는 신규 cap) + `comprehensive-tax.ts` 루프 | `calcMultiFamilyHousingTax`·`buildHousingPropertyTaxWithCap` 신규, 루프 우선순위 분기. ★`property-tax.ts`(795줄) 함수 추가 금지 |
| ① | PropertyEntry | `floorUnits: {label,area}[]`·`priorAssessedValue: string` |
| ②③ | makeProperty·rehydrate | 초기값·fallback |
| ④⑬ | comprehensive-api.ts | floorUnits 면적 배열 변환(DecimalInput parse), priorAssessedValue parseAmount |
| ⑤ | PropertyListInput | 다가구 토글 + 층별 면적 입력(추가/삭제 행) · 직전 공시 입력. `propertyTaxAmount`와 상호 안내 |
| ⑦ | HousingPayableTaxCalcCard | 구별 안분 산식 echo(트랙 A) · 세부담상한 Min 산식(트랙 B) |
| ⑧ | validate/Zod | floorUnits area>0·합>0, priorAssessedValue≥0, **propertyTaxAmount와 우선순위 refine** |
| ⑨⑫⑭ | Zod·route | 신규 필드 스키마·명시 매핑 |
| ⑥ | 사이드바 합계 | **N/A** — floorUnits·priorAssessedValue는 ⓐ 산정 입력일 뿐, 사이드바 합계에 직접 미표시(ⓐ는 결과 카드 ⑦에서만 노출) |
| ⑩ | Zod 컴패니언 | **N/A** — 종부세는 컴패니언-property 스키마 없음(양도세 전용 패턴) |
| ⑪ | 자산 acquisitionDate fallback | **N/A** — 종부세 신규 필드는 취득일 fallback과 무관 |

---

## §7. Pre-Do Anchor

> vitest anchor 파일: `__tests__/tax-engine/comprehensive-case789-auto.test.ts` (flat 컨벤션). 엔진 설계 케이스 인벤토리 행과 대응. AUTO-* ID ↔ 인벤토리 행.

| ID | anchor | 기대 |
|---|---|---|
| AUTO-A1 | 사례7 floorUnits 자동 → ⓐ | 714,000 |
| AUTO-A2 | 사례7 ⑤ | 560,595 |
| AUTO-B1 | 사례8 서초 자동 ⓐ_i | 2,702,700 |
| AUTO-B2 | 사례8 ⑤ | 16,747,099 |
| AUTO-B3 | 사례9 ⑤ (안양 110% 포함) | 25,546,712 |
| AUTO-C1 | 우선순위: propertyTaxAmount 직접입력 시 자동 무시 | 입력값 사용 |
| AUTO-C2 | 2024+ 세부담상한 미적용(pct=null) | 상한 전 값 |
| AUTO-R | 사례1~6·12 회귀 | 불변 |

---

## §8. Phase · 커밋 분해

| Phase | 트랙 | 내용 |
|---|---|---|
| 0 | — | origin/master 격리 worktree + 회귀 baseline |
| 1 | **A** | `calcMultiFamilyHousingTax` + `floorUnits` 입력 + 사례7 anchor (단순·독립, 우선) |
| 2 | A UI | PropertyListInput 다가구 면적 입력 + 결과 echo + E2E |
| 3 | **B** | `buildHousingPropertyTaxWithCap` + `priorAssessedValue` + 사례8·9 anchor (복잡) |
| 4 | B UI | 직전 공시 입력 + 세부담상한 산식 echo + E2E |

> 트랙 A·B **둘 다 진행 확정**. **독립 PR로 분리**(A 먼저 — 단순·독립 / B 후속 — 직전연도 처리 결합). 각 트랙 완료 시 ship → 누적 회귀 점검.
>
> ★ **부수 작업(Phase 3·B 동봉)**: 엔진 주석 `§110의2`→`§110③` 정정 2건 — `property-tax.ts:294`·`legal-codes/property.ts:64`(과세표준상한제 조문 오기, §2 실측 ✓). `comprehensive-prior-year.ts:9`는 이미 §110③ 정확.

---

## §9. E2E

| spec | 시나리오 |
|---|---|
| `comprehensive-case7-multifamily.spec.ts` | 사례7: 통합공시 8억 + 층별 면적 입력 → ⑤ 560,595 (수동입력 없이) |
| `comprehensive-case89-taxcap.spec.ts` | 사례8: 공시+감면율+직전공시 입력 → ⑤ 16,747,099 |

> ★ 신규 토글/필드는 종부세 전체 E2E `nth()` selector 시프트 유발 가능 — `.last()`/role 한정 ([[project_comprehensive_case6_owner_split]] 교훈).
>
> 기존 `e2e/comprehensive-case789.spec.ts`(수동입력 `propertyTaxAmount`, 2/2 통과)는 **하위호환 검증으로 유지**. 신규 spec은 수동입력 없는 **자동 경로** 검증(역할 분리).

---

## §10. 리스크 · 확인 필요 (★ 의사결정)

| ID | 우선 | 내용 |
|---|---|---|
| R-1 | **결정됨** | 트랙 A·B **둘 다 자동화** 확정(2026-06-15 사용자 결정). 트랙 B 입력 부담(직전 공시·4중 얽힘)은 (a) 직전 공시를 `priorAssessedValue` 단일 진실로 일원화(중복 입력 제거) (b) `propertyTaxAmount` 수동입력 안전판 병존으로 완화. 복잡도는 R-2(누진 분배법칙)·R-6(상한 결합 순서)으로 분해 관리 |
| R-2 | **HIGH** | 누진세율 분배법칙 불성립 → 다가구·세부담상한 모두 **구별/주택별 개별 산출 후 합산** 필수. 합산 후 단일 적용 금지 |
| R-3 | **HIGH** | 의존 방향: 세부담상한 적용은 **종부세측 헬퍼**에서. `property-tax.ts`의 주택 폐지 패스스루(§122 단서) **변경 금지**(재산세 단독 계산기 영향) |
| R-4 | **HIGH** | 직전 표준세율 산출 시 **재산세 FMR** 적용 — 직전(2021)·당해(2022) 모두 **60%**(주택 1주택 특례 없음). `getPropertyFmrForProration(year, isOneHouseOwner)` 사용(prior-year.ts:94·comprehensive-tax.ts:391 실측 ✓). ★**종부세 FMR(2021=95%)과 혼동 금지** — 재산세 주택 공정시장가액비율은 60%. `calcPreviousYearEquivalent`(prior-year.ts:99-104)가 이미 이 헬퍼로 60% 적용 → **주택별 분리만** 추가 |
| R-5 | MEDIUM | 우선순위 3-state 명확화: `propertyTaxAmount`(직접) > `floorUnits`/`priorAssessedValue`(자동) > 단일 공시(기존). Zod refine + UI 안내로 모순 차단 |
| R-6 | MEDIUM | 다가구 + 세부담상한 결합 시 "1동 전체 기준 상한"(구별 아님) — 트랙 A 합산액에 트랙 B 적용 순서 |
| R-7 | LOW | 2024+ 폐지 연도 분기(`getHousingTaxCapPct` null) — 사례789는 2022라 무관하나 가드 유지 |
| R-8 | LOW | `propertyTaxAmount` 수동입력 **제거 금지** — 자동이 못 잡는 기타 케이스(특수 감면 등) 안전판 |
| R-9 | **HIGH** | §122 시행령 "직전 재산세액 상당액" 기준이 **감면전 표준세율**인지 **감면후 실부과액**인지 본문 확인 필요(설계 STEP 6 KoreanLaw). 동일 감면율 가정 시 결과 동일하나(§4 대수 증명), 직전≠당해 감면율 케이스 정합성 결정 — 현재 설계는 감면전 기준 + 당해 감면율 후곱 |

---

## §11. 완료 기준 (DoD)

- [ ] §7 anchor 전부 통과 (사례7=560,595 / 8=16,747,099 / 9=25,546,712, 자동 입력)
- [ ] 하위호환: `propertyTaxAmount` 직접입력 우선 + 사례1~6·12 회귀 불변
- [ ] 14지점 동기화 (floorUnits·priorAssessedValue)
- [ ] `tsc` 0 · `lint` 0 · `vitest` 전체 통과 · E2E
- [ ] `property-tax.ts` 주택 폐지 패스스루 무변경 (재산세 단독 회귀 확인)
- [ ] 엔진 주석 `§110의2`→`§110③` 정정 2건 (property-tax.ts:294·legal-codes/property.ts:64)
- [ ] 누진 개별 산출 검증 (분배법칙 함정 anchor)
- [ ] 트랙 A·B **둘 다 자동화** 완료 — 사례7(다가구 면적안분)·사례8·9(주택 세부담상한) 모두 자동 입력으로 재현, `propertyTaxAmount` 수동입력 없이

---

## 부록. 관련 메모리

[[project_comprehensive_case789_multi_house]](수동입력 선행) · [[project_comprehensive_case12_filing_replica]](§122 Min·LandJurisdiction) · [[project_comprehensive_case6_owner_split]](appurtenant 안분·E2E 시프트) · [[feedback_ui_engine_dual_truth_avoidance]](누진세율 단일출처) · [[feedback_pre_anchor_verification]] · [[feedback_external_concurrent_edit_stale_read]]
