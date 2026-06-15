# 종합부동산세 — 공유지분(지분율) 정식 지원 계획서

> PDCA Plan. 작성일 2026-06-15. 코딩 금지(계획만).
> 출처: 교재 제3편 종합부동산세 **사례3** "공유지분이 있는 경우(≠1세대1주택자)".
> ★ 사례2(재산세 감면율, ✅PR#197)와 **수학적으로 평행** — 기존 `reductionRate` 인프라 재사용이 핵심.

---

## 1. 배경·문제

공유지분으로 주택을 소유한 경우, 지분율(ownership ratio)이 종부세 계산에 영향을 준다. 교재 사례3 상단 박스 3원칙:

1. **해당연도 종부세액**: 지분율은 공시가격에 적용 — `공시가격 × 지분율` 후의 공시가격 기준 계산(종부세 공시가격 안분).
2. **해당연도 재산세액**: 해당 주택(100%지분)의 재산세액으로 세부담상한 적용 후, 산출된 재산세액에 지분율을 곱함(재산세 세액안분).
3. **종부세 세부담상한 계산 시** 직전연도 재산세상당액·종부세상당액은 **직전연도 지분율과 무관하게 해당연도 지분율**을 적용.

→ 사례2 감면율(공시 × (1−감면율))과 **곱하는 계수만 다른 동일 구조**: 감면 `(1−rate)` ↔ 지분 `ratio`. 현재 주택분 종부세에 지분율 입력·로직 전무(grep 0건, 토지 필지에만 지분율 존재).

**v1 범위** [확정 2026-06-15]: 주택분 + **일반 공유지분만**. 토지 지분·부부공동명의 §10의2 결합은 후속. 디폴트: 지분율 100%, 감면율 0.

---

## 2. 사례3 데이터 + anchor (PDF 직접 확인 + 손계산 교차검증 완료)

### 입력
- 일반 1주택자(≠1세대1주택자), 2022 귀속, 기본공제 6억
- 지분율 **70%**
- 주택공시가격: '22년 **15억**, '21년 **13억**
- 재산세 납부세액(지분 적용후): '22년 **2,079,000**, '21년 **1,743,000**
- 세액감면·탄력세율 없음. 종부세 FMR '22=60%·'21=95%, 재산세 FMR 60%, 종부세율 0.6%, 세부담상한 150%.

### anchor (원단위, `toBe()` 고정 — 엔진 정수연산 기준)

| 칸 | 값 | 산식 |
|---|---|---|
| **① 재산세공제전 종부세액** | **1,620,000** | (15억×0.7=10.5억 − 6억) × 60% × 0.6% |
| 과세표준 | 270,000,000 | (10.5억 − 6억) × 60% |
| ②ⓐ 해당연도 재산세 | 2,079,000 | 100%기준 2,970,000 × 70% |
| ②ⓑ | 648,000 | 270,000,000 × 60% × 0.4% |
| ②ⓒ 총표준세율재산세액 | 1,890,000 | 10.5억(지분후) × 60% × 0.4% − 63만 |
| **②ⓓ 공제할 재산세액** | **712,800** | 2,079,000 × 648,000 / 1,890,000 |
| **③ 세부담상한 적용전** | **907,200** | ① − ② |
| ④가 해당연도 총세액상당액 | 2,986,200 | ②ⓐ + ③ |
| ④나① 직전 재산세상당액 | 1,743,000 | 100%기준 2,490,000 × 70% |
| ④나②ⓐ 직전 종부세액 | 1,767,000 | (13억×0.7=9.1억 − 6억) × 95% × 0.6% |
| ④나②ⓑ 직전 공제할 재산세 | 792,762 | floor(1,743,000 × 706,800 / 1,554,000) |
| ④나② 직전 종부세상당액 | 974,238 | 1,767,000 − 792,762 |
| ④나 직전 총세액상당액 | 2,717,238 | 1,743,000 + 974,238 |
| ④다 세부담상한액 | 4,075,857 | 2,717,238 × 150% |
| **④ 세부담상한 초과** | **0** | 가 2,986,200 ≤ 다 4,075,857 |
| **⑤ 납부할세액** | **907,200** | ③ − ④ |
| 재산세(참고)·종합합계 | 2,079,000 / 2,986,200... | 최상위 totalPropertyTax = 지분후 |

**floor 검증**: ④나②ⓑ = 1,743,000×706,800/1,554,000 = 792,762.16 → floor **792,762** = 교재 일치(사례3은 1원 차이 없음). ②ⓓ 712,800도 일치. (사례2와 달리 안분 floor 차이 미발생 — 케이스별 다름.)

---

## 3. 현재 구현 파악 (reductionRate 메커니즘 — 재사용 대상)

PR#197로 추가된 감면율 처리가 지분율과 동일 위치에서 작동. 4지점:

| 지점 | 현재 코드(reductionRate) | 위치 (실측 2026-06-15, 버그수정 f98a79bd 후) |
|---|---|---|
| A-1 | 루프 `effectiveAssessedValue = rate>0 ? floor(assessedValue × (1−rate)) : assessedValue` → `effectiveTotalFromLoop` | comprehensive-tax.ts:171-176 |
| **A-2** | **합산배제 차감** `effectiveExcludedValue += floor(assessedValue × (1−rate))` → `effectiveIncludedAssessedValue = effectiveTotalFromLoop − effectiveExcludedValue` | comprehensive-tax.ts:224-234 |
| B | `imposedTax = rate>0 ? floor(propTax × (1−rate)) : propTax` → totalPropertyTaxAmount(안분ⓐ, 204) + propertyResults.propertyTax(참고·합계, 212) | comprehensive-tax.ts:201-212 |
| C | `propertyTaxEquivRaw`(원공시 calcHousingTax, 80-84) `× (1−rate)`(88) | comprehensive-prior-year.ts:80-88 |
| D | `effectiveAssessedValue = floor(auto.assessedValue × (1−rate))`(54) → 직전연도 과표·분모·공제(105-108) 연쇄 | comprehensive-prior-year.ts:52-108 |

★ **지분율 주입 지점은 5곳**(A-1·A-2·B·C·D). A-2(합산배제 차감)는 reductionRate도 별도 처리하는 곳 — 곱셈 누락 주의.

타입: `ComprehensiveProperty.reductionRate?` · `PreviousYearAutoInput.reductionRate?` · `result.effectiveIncludedAssessedValue?`.
14지점 전부 연결됨(Zod·comprehensive-api.ts %→/100·route·PropertyListInput DecimalInput·HousingPayableTaxCalcCard·부표3).

→ **지분율은 이 메커니즘에 계수 하나(`× ratio`)를 추가**하면 됨.

---

## 4. 설계 — ownershipRatio 추가 (4지점, 감면율과 동일 위치)

### 4.1 핵심 결정: 감면율 × 지분율 결합 + 유효계수 헬퍼
유효계수 = `ownershipRatio × (1 − reductionRate)`. 5개 주입 지점(A-1·A-2·B·C·D) 모두 이 결합계수를 곱한다.
- 사례3: 감면 없음 → ownershipRatio만 (×0.7)
- 사례2: 지분 없음 → (1−rate)만
- 둘 다: 곱 (교재에 결합 사례 없음 → 각 지점에서 **곱 후 1회 floor** `floor(base × ownershipRatio × (1−rate))`. 곱 순서는 교환법칙으로 무관, floor만 1회. R-1 안내)

★ **[STEP1 정정 → Do 환류] 유효계수 단일 헬퍼** — 5개 지점에 계수가 흩어지면 곱셈 누락 위험. 순수 헬퍼로 단일화. ★ **float 곱 금지**(0.7 부정확 → floor 1원 부족) → 만분율 정수 + BigInt:
```ts
// comprehensive-tax-helpers.ts (prior-year도 import)
export function applyEffectiveFactor(base: number, reductionRate?: number, ownershipRatio?: number): number {
  const ratioBp = BigInt(Math.round((ownershipRatio ?? 1) * 10000));
  const rateBp = BigInt(Math.round((reductionRate ?? 0) * 10000));
  return Number((BigInt(Math.round(base)) * ratioBp * (10000n - rateBp)) / 100000000n);  // 곱 후 1회 floor
}
// 적용: const x = applyEffectiveFactor(base, prop.reductionRate, prop.ownershipRatio)
```
(상세: feedback_applyrate_fractional_rate_one_won_error. 실제 구현은 .engine.design.md §3)
prior-year도 동일 헬퍼 재사용(C·D). [[single-source-engine-helper]]

### 4.2 input 타입
```ts
// ComprehensiveProperty
ownershipRatio?: number;   // 0~1, 70%→0.7. 미입력=100%(단독). 공시가격·재산세에 지분 안분
// PreviousYearAutoInput
ownershipRatio?: number;   // 직전연도 자동계산용 — 해당연도 지분율 적용(원칙3)
```

### 4.3 엔진 로직 (5지점 — 전부 `effectiveFactor` 헬퍼 사용)
- **A-1** (comprehensive-tax.ts:174): 루프 `effectiveAssessedValue = floor(assessedValue × effectiveFactor(rate, ratio))` → effectiveTotalFromLoop. 합산배제 **판정**은 원공시(R-2 기존 분리 유지).
- **A-2** (comprehensive-tax.ts:230): 합산배제 차감 `effectiveExcludedValue += floor(assessedValue × effectiveFactor(rate, ratio))`. ★ 현재 reductionRate만 처리 — ownershipRatio 추가 필수(누락 시 합산배제+지분 동시 케이스 과세표준 오류).
- **B** (comprehensive-tax.ts:201): `imposedTax = floor(propTax × effectiveFactor(rate, ratio))`. propTax는 100%지분 기준(publishedPrice=원공시 — 교재 "해당주택 100%지분 재산세").
- **C** (comprehensive-prior-year.ts:88): `propertyTaxEquivRaw(원공시 calcHousingTax) × effectiveFactor` → 직전 재산세상당액.
- **D** (comprehensive-prior-year.ts:54): `effectiveAssessedValue = floor(auto.assessedValue × effectiveFactor)` → 직전 종부세 과표·분모·공제 연쇄.
- 각 지점 곱 후 1회 floor. 정수연산 floor만. 800줄 정책.

### 4.4 result echo
- `effectiveIncludedAssessedValue`(이미 존재)가 지분후+감면후 공시 모두 반영(곱 결합). 부표3 ③칸 자동 정합.
- ★ [STEP3 정정] 부표3 ③칸 라벨이 현재 "감면후 공시가격" — 지분 적용 시 의미 부정확. 라벨을 "안분·감면후 공시가격"류로 일반화할지 **UI설계(STEP12)에서 결정**(엔진 echo는 단일 값이므로 라벨만 조정).
- 결과 카드(HousingPayableTaxCalcCard) Step1에 "공시 × 지분율 = 안분 공시" 표시(감면 bullet과 별도/통합 — UI설계 결정).

---

## 5. 14개 동기화 지점 (reductionRate와 평행)

| # | 위치 | 작업 |
|---|---|---|
| ① FormData | comprehensive-wizard-store.ts `PropertyEntry` | `ownershipRatio: string` |
| ② initial | `makeProperty()` | `ownershipRatio: ""` (미입력=100%) |
| ③ normalize | onRehydrateStorage | `?? ""` |
| ④/⑬ API 변환 | comprehensive-api.ts | properties·previousYearAuto `parseFloat/100` (미입력→undefined=100%) |
| ⑤ UI 위젯 | PropertyListInput.tsx | 공시가격 직후, 감면율 위젯과 나란히 DecimalInput(지분율%). 기존 reductionRate 패턴 |
| ⑥ 사이드바 | 없음(미구현) | — |
| ⑦ 결과 카드 | HousingPayableTaxCalcCard Step1 | "공시 × 지분율" 표시. 부표3 ③ 자동 |
| ⑧ validation | comprehensive-api.ts / onChange | 0~100% 범위. 미입력=100% fallback 3중 일치 |
| ⑨⑩ Zod | comprehensive-input.ts | `ownershipRatio: z.number().min(0).max(1).optional()` (메인+previousYearAuto) |
| ⑪ | optional → 해당없음 | — |
| ⑭ Route | route.ts toEngineInput | pass-through |

★ 함정: 미입력 fallback이 감면율은 0(=감면없음), 지분율은 **1(=단독 100%)**. 0과 undefined 구분 주의 — `ownershipRatio ?? 1` vs `reductionRate ?? 0`.

---

## 6. anchor 테스트
`__tests__/tax-engine/comprehensive-case3-anchor.test.ts`:
- 사례3 ① 1,620,000 / 과표 270,000,000 / ②ⓐ 2,079,000·ⓑ 648,000·ⓒ 1,890,000·ⓓ 712,800 / ③⑤ 907,200 / ④ isApplied false / 직전 propertyTaxEquiv 1,743,000·comprehensiveTaxEquiv 974,238 / 재산세참고 totalPropertyTax 2,079,000.
- 회귀: ownershipRatio 미입력=100% → 기존 동작 보존(사례12·사례2 영향 0). ★ `effectiveFactor` 헬퍼 도입 후 **사례2 anchor(comprehensive-case2-anchor.test.ts) 전수 green**이 회귀 0 증거 — `effectiveFactor(rate, undefined)=(1−rate)` 동일값 보장.
- 결합 케이스(지분+감면 동시) 1건 — 각 지점 곱 후 1회 floor 검증.
- **합산배제+지분 동시** 1건 — A-2(effectiveExcludedValue) ownershipRatio 반영 검증(이 케이스 없으면 A-2 누락이 anchor에 안 걸림).
- **Pre-Do anchor 우선**: 현행(지분 미지원)으로 사례3 입력 → 드리프트 실측 + result 필드명 재확인 후 Do.

---

## 7. 리스크·미해결

- **R-1 감면율+지분율 결합**: 교재에 동시 사례 없음. 단일 floor `floor(공시 × 지분 × (1−감면))` 채택. 순서 무관(곱셈 교환). 안내 주석.
- **R-2 재산세 1세대1주택 특례세율**: `calculatePropertyTax` `isOneHousehold` 판정에 publishedPrice(원공시) 사용. 사례3은 일반이라 무관. 일반화 시 공유지분 단독주택의 1세대1주택 판정 검토(부부공동명의는 §10의2 별도).
- **R-3 직전연도 100%기준 역산**: 엔진은 100%기준 calcHousingTax 후 ×지분. 교재 "1,743,000 = 2,490,000 × 70%"와 일치(역산 아님).
- **R-4 부부공동명의 §10의2 vs 일반 공유지분** [확정 2026-06-15]: **v1은 일반 공유지분만 지원**(≠1세대1주택, 기본공제 6억, 각자 지분만큼 과세). §10의2 특례(1주택 의제+12억)와의 결합은 이번 세션 범위 밖 — 후속. (충돌 방지: §10의2 활성 시 ownershipRatio 무시 또는 후속 처리)
- **R-5 미입력 fallback = 100%** [확정 2026-06-15]: 디폴트 지분율 **100%**(`ownershipRatio ?? 1`), 디폴트 감면율 **0**(`reductionRate ?? 0`) — 반대 방향 주의. UI 입력값 100(%)→1.0, 미입력→1.0(단독).
- **R-6 토지 지분**: v1 제외.
- **R-7 floor 1원**: 사례3은 미발생이나 케이스별 가능 → 사례2와 동일 floor 정책 + 1원 tolerance.

---

## 8. 작업 순서 (Do — 코딩 승인 후)
1. Pre-Do anchor(현행 드리프트 실측) → 2. 엔진(타입·A~D·14지점 엔진측·anchor green) → 3. UI(위젯·결과카드·validation) → 4. E2E(사례3 폼→결과 907,200) → 5. tsc 0·종부세 회귀·전체 게이트.

## 9. 자가 점검
- [x] 사례3 anchor 손계산 교차검증(floor 1원 미발생 확인)
- [x] 현행 구현 파악(reductionRate 재사용 가능 확인)
- [ ] Pre-Do anchor로 result 필드명 재확인(Do 단계)
- [ ] 미입력 fallback 100% vs 0 구분(R-5)
- [ ] §10의2와 충돌 정책(R-4)
