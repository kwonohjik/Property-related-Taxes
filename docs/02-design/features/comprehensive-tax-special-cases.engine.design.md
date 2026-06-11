# 종합부동산세 후속 특례 3건 — 엔진 설계

> Plan: `docs/01-plan/features/comprehensive-tax-special-cases.plan.md`
> UI 설계: `comprehensive-tax-special-cases.ui.design.md`
> 작성: 2026-06-11 · 13단계 자가 검토 STEP 5 산출물

---

## Context

선행 완료(PR#128·#129): 연도별 파라미터(`getComprehensiveParams`)·§9①2호 3주택 중과·재산세 안분 §4의3(주택+토지). 본 설계는 **F-1 토지 FMR 연도화 · F-2 법인 §9② · F-3 부부 공동명의 §10의2**의 엔진 변경을 정의한다.

설계 불변 조건:
- 신규 input 필드 전부 optional → 기존 anchor(종부세 137+·전체 7302) **무변경**.
- 2-Layer 유지 — DB 호출 없음, 연도 데이터는 `comprehensive-historical.ts` 정적 상수.
- 세율 곱은 분수 정수 연산 (memory `feedback_applyrate_fractional_rate_one_won_error`).

## ★ 케이스 인벤토리

| ID | 케이스 | 입력 골자 | 기대 산출 | anchor 출처 |
|---|---|---|---|---|
| SC-A1 | 2021 종합합산 토지 FMR 95% | 공시 10억, 재산세과표 7억·부과세액 임의 | 과표 = trunc10k(floor((10억−5억) × 0.95)) = **475,000,000** | 시행령 §2의4② 직접 산식 |
| SC-A2 | 2021 별도합산 토지 FMR 95% | 공시 100억 | 과표 = trunc10k(floor((100억−80억) × 0.95)) = **1,900,000,000** | 동일 |
| SC-A3 | 2022·현행 토지 무변경 회귀 | 기존 사례10·11 anchor | 8,638,017 / 121,620,339 (불변) | 사례집 pdf27·29 (기구현) |
| SC-A4 | echo 자기일관성 | SC-A1 결과 | `result.fairMarketRatio === 0.95` && `taxBase === trunc10k(floor(afterDeduction × fairMarketRatio))` | 자기일관성 |
| SC-B1 | 2024 법인 §9②3호 가목 (2주택 이하) | 공시 20억 1채, `corporate_special` | 공제 0 → 과표 12억 → ×2.7% = **32,400,000** (누진공제 0) | §9②3호 가목 직접 산식 |
| SC-B2 | 2024 법인 §9②3호 나목 (3주택+) | 공시 10억×3채 | 공제 0 → 과표 18억 → ×5.0% = **90,000,000** | 나목 직접 산식 |
| SC-B3 | 법인 상한 배제 | SC-B1 + previousYearTotalTax 입력 | `taxCap === undefined` (입력 있어도 미적용) | §10 단서 |
| SC-B4 | 법인 1세대1주택 공제 배제 | SC-B1 + isOneHouseOwner=true·생년월일 잔존 | `oneHouseDeduction === undefined`·공제 0원 (엔진 무시) | §8①2호·3중 패턴 |
| SC-B5 | corporate_general (§9②1호) | 공시 10억×3채, 2024 | 공제 9억 → 과표 12.6억 → general 표 1.3%−600만 = **10,380,000** (3주택이어도 multi 아님) | §9②1호 + 세율표 실측(`historical.ts:73~81`) |
| SC-B6 | corporate_public (§9②2호) | 공시 10억×3채, 2024 | 공제 9억 → 과표 12.6억 → **multi 표** 2.0%−1,440만 = **10,800,000** (§9①2호 — 3주택) | §9②2호 + 세율표 실측(`:88~96`) |
| SC-B7 | 2022 법인 §9② (2주택 이하) | 공시 20억 1채, `corporate_special`, 2022 | 공제 0(구법 §8① 괄호) → 과표 12억 → ×**3.0%** = **36,000,000** | 구법 §9② + pdf38 법인 열 (Phase 0 확정) |
| SC-B8 | 2022 법인 조정 2주택 (나목) | 공시 10억×2채, `isMultiHouseInAdjustedArea=true`, 2022 | 과표 12억 → ×**6.0%** = **72,000,000** (≤2022 나목 = 조정 2주택 포함 — `isMultiHouseRate` 재사용) | 동일 |
| SC-G7 | ★ 주택 안분 ⑥ 합산 단일 누진 (사례5) | 2022, 1세대1주택 의제, 공시 15억+2억 | 산출 2,280,000 → ⑥=3,450,000 → 공제 **781,356** → 공제후 **1,498,644** (현행 864,000 — 실패 확보 완료) | 사례집 pdf11~13 + 작성방법 ⑦ |
| SC-C1 | 2024 부부 특례 | 공시 15억 1채, `isJointOwnershipSpecialCase=true`, 신청인 71세·16년 보유 | 공제 12억 → 과표 1.8억 → ×0.5% = 900,000 → 세액공제 80%(40+50 캡) = 720,000 차감 → **180,000** | §10의2③·§9⑤~⑨ 직접 산식 |
| SC-C2 | 부부 특례 ↔ isOneHouseOwner 상호배타 | 둘 다 true | Zod refine 거부 (422) | 설계 결정 |
| SC-C3 | 2022 부부 특례 | 공제 11억 (연도 준용) | `basicDeduction === 1_100_000_000` | §8①1호 준용 |
| SC-C4 | 사례5 | Phase 0 재실측에서 §10의2 사례 확정 시만 | 재실측값 | 사례집 pdf11~13 |

> SC-C1 검산: (15억−12억)×60%=1.8억 → 1.8억×0.5%=900,000 (3억 이하 0.5% 구간·누진 0) → 고령 70세+ 40% + 장기 15년+ 50% = 90% → 80% 캡 → 공제 720,000 → 180,000. ※ 재산세 안분 추가 차감 전 값 — anchor에서는 안분 입력 단순화(개별 주택 재산세 자동 계산 경로 그대로) 후 `calculatedTax`·`oneHouseDeduction` 단계별 toBe.

## 법령 근거 (Plan §2 — KoreanLaw 실측 완료분 + Phase 0 잔여)

- **§9②**: 1호(시행령 §4의4① 법인 → §9①1호 세율)·2호(공익법인등 → §9①각호)·3호(그 외 → 가목 2주택 이하 1천분의 27 / 나목 3주택 이상 1천분의 50). 실측 ✓
- **§8①2호**: §9②3호 세율 적용 법인 기본공제 **0원**. 축자 확인 ✓
- **§10 단서**: §9②3호 법인 세부담상한 배제. 축자 확인 ✓
- **§10의2③ + 령 §5의2⑥⑦⑧**: 1세대1주택자 의제·지분 합산·신청인 기준 공제. 실측 ✓ (납세의무자 결정 규정 — R-2 Phase 0)
- **령 §2의4②**: 토지 FMR 2021=95%·2022~=100%. 축자 확인 ✓
- **≤2022 §9②3호 세율(3%/6% 추정)**: R-1 — Phase 0 신구대조표·조세심판원 축자 후 확정. 미확정 시 법인은 2023~ 한정.

## 엔진 설계

### 1. 타입 확장 — `types/comprehensive.types.ts`

```ts
export type ComprehensiveTaxpayerType =
  | "individual"          // 개인 (기본)
  | "corporate_special"   // §9②3호 — 단일세율·공제0·상한배제
  | "corporate_general"   // §9②1호 — §9①1호 general 표 고정·공제 9억(6억)·상한 적용
  | "corporate_public";   // §9②2호 — §9①각호 (주택 수 분기)·공제 9억(6억)·상한 적용

interface ComprehensiveTaxInput {
  // ... 기존 ...
  taxpayerType?: ComprehensiveTaxpayerType;        // 미입력 = "individual"
  isJointOwnershipSpecialCase?: boolean;           // §10의2 — true 시 1세대1주택 의제
}

interface ComprehensiveTaxResult {
  // ... 기존 ...
  taxpayerType: ComprehensiveTaxpayerType;          // echo (결과뷰 배지·라벨)
  isJointOwnershipApplied: boolean;                 // echo (§10의2 배지)
}
```

`PropertyTaxCredit`·토지 result는 무변경. 토지 result의 `fairMarketRatio`는 **의미 무변경·값만 연도화** (아래 4).

### 2. historical 확장 — `comprehensive-historical.ts`

```ts
interface ComprehensiveYearParams {
  // ... 기존 ...
  /** 법인 단일세율 (누진공제 없음). 현행 §9②3호 가·나목 / 구법(≤2022) §9② 각 호 */
  corporateRate2HouseOrLess: number;   // default(2023~): 0.027 / 2021·2022: 0.030 (Phase 0 확정)
  corporateRate3HouseOrMore: number;   // default(2023~): 0.050 / 2021·2022: 0.060 (Phase 0 확정)
}
```

- 법인 나목(3주택+) 판정: **개인과 동일 `isMultiHouseRate(year, count, adjArea)` 재사용** — ≤2022는 조정 2주택 포함, 2023~는 3주택 이상만 (구법 §10이 상한 분기를 "§9①2호 적용대상"으로 정의한 것과 동일 축). 전 연도 지원 — 연도별 차단 없음.

### 3. `comprehensive-tax.ts` 흐름 변경 (실측 line 기준)

```
const taxpayerType = input.taxpayerType ?? "individual";
const isCorporate = taxpayerType !== "individual";
const isJointApplied = !isCorporate && input.isJointOwnershipSpecialCase === true;
const oneHouseTreatment = !isCorporate && (input.isOneHouseOwner || isJointApplied);
```

| 지점 (실측) | 변경 |
|---|---|
| Step 3 기본공제 (`:202~206`) | `corporate_special` → 0 / `corporate_general·public` → `basicDeductionGeneral` / 개인 → `oneHouseTreatment ? basicDeductionOneHouse : basicDeductionGeneral` |
| Step 5 세율 (`:217~228`) | `corporate_special` → `floor(taxBase × N / 1000)` 단일 비례 (N = `Math.round(rate×1000)`, 주택 수는 `aggregationExclusion.includedCount`로 가/나목). echo: `appliedRate = corporateRate*`·`progressiveDeduction = 0`·`isMultiHouseRateApplied = false` / `corporate_general` → general 표 고정 / `corporate_public` → 기존 `isMultiHouseRate` 분기 / 개인 → 기존 |
| Step 6 1세대1주택 공제 (`:230~`) | 조건을 `isOneHouseOwner` → `oneHouseTreatment`로 치환 (법인 자동 배제 — SC-B4) |
| Step 7 안분 §4의3 (`:252~`) | **G-7 정정 (Phase A)**: ⑥ 분모를 Step 1 루프 `standardRateTaxSum`(Σ per-house) 누적에서 → **합산 1회 계산**으로 교체: `⑥ = calcHousingTax(floor(includedAssessedValue × 60 / 100), assessedValueSum, false).tax` 상당 — 합산 공시 × 재산세 FMR(60%) 과표에 주택 표준세율 누진 1회 (작성방법 pdf38 ⑦·사례5 실증. 절사 디테일은 사례5 781,356 원단위 anchor가 강제 — R-9). ⑤ 분자·ⓐ는 무변경. 법인·부부 추가 변경 없음 |
| Step 8 상한 (`:276~286`) | `corporate_special` → `applyTaxCap` 호출 생략(`taxCap = undefined`) / 그 외 기존 |
| Step A/B 토지 (`:302~311`) | `yearParams.fairMarketRatioLand` 전달 (아래 4) |
| 경고 (`:324~326`) | 구현 항목 제거 — "법인 §9②2호 일부 요건(공익법인 판정)·부부 특례 신청 절차는 별도 확인" 수준으로 축소 |
| result (`:328~355`) | `taxpayerType`·`isJointOwnershipApplied` echo 추가. `isOneHouseOwner` echo는 입력값 그대로 유지(기존 호환) |

부부 특례 정합: 령 §5의2⑥(지분 합산)은 **입력 규약**(properties에 전체 공시가격) — 엔진 변환 없음. 령 §5의2⑦(재산세 전체 기준)은 기존 Step 1 per-house 재산세 자동 계산이 이미 전체 기준 → 무변경. 령 §5의2⑧(신청인 기준 공제)은 기존 `birthDate`/`acquisitionDate` 재사용 → 무변경.

### 4. 토지 FMR 연도화 (F-1)

```ts
// comprehensive-land-aggregate.ts
export function calculateAggregateLandTax(
  input: AggregateLandTaxInput,
  fairMarketRatio: number = COMPREHENSIVE_LAND_CONST.AGGREGATE_FAIR_MARKET_RATIO, // 1.00
): AggregateLandTaxResult
// 내부: calcAggregateLandTaxBase(totalOfficialValue, fairMarketRatio)  ← :248 수정
//       result.fairMarketRatio = fairMarketRatio                        ← :229·:301 상수 → 파라미터

// comprehensive-separate-land.ts (시그니처 실측 :186~188)
export function calculateSeparateAggregateLandTax(
  lands: SeparateAggregateLandForComprehensive[],
  fairMarketRatio: number = COMPREHENSIVE_LAND_CONST.SEPARATE_FAIR_MARKET_RATIO,  // 1.00
): SeparateAggregateLandTaxResult
// :211  taxBase = truncateToTenThousand(Math.floor(afterDeduction * fairMarketRatio))
//       — 종합합산 calcAggregateLandTaxBase(:35~36)와 동일 순서 (floor(×FMR) → 만원절사)
//       result.fairMarketRatio = fairMarketRatio                        ← :253·:274 상수 → 파라미터
```

- 호출부 `comprehensive-tax.ts:302~311`: `calculateAggregateLandTax(input.landAggregate, yearParams.fairMarketRatioLand)` / `calculateSeparateAggregateLandTax(input.landSeparate, yearParams.fairMarketRatioLand)`.
- §4의3 ⑤ 산식(재산세 토지 FMR 70%·최고세율)은 무변경 — `taxBase`만 95% 반영값으로 유입 (R-4).
- 납세의무 판정(`totalOfficialValue > 공제액`)은 FMR 무관 — 무변경.
- 기본값 1.00 → 토지 함수를 직접 호출하는 기존 테스트 전부 무변경.

### 5. Zod·Route (⑨⑫⑭)

```ts
// lib/validators/comprehensive-input.ts
taxpayerType: z.enum(["individual","corporate_special","corporate_general","corporate_public"]).optional(),
isJointOwnershipSpecialCase: z.boolean().optional(),
// refine 1건: isOneHouseOwner && isJointOwnershipSpecialCase → 상호배타 거부 (SC-C2)
// (≤2022 법인 거부 refine은 Phase 0에서 R-1 해소로 폐기 — 전 연도 지원)
```

route `toEngineInput`: 두 필드 1:1 매핑 (⑭). API 변환(④)은 UI 설계 문서 담당 — 법인 시 개인 필드 명시 strip.

## Silent fallback 점검

- `taxpayerType ?? "individual"` — 하위호환 기본값 (허용: 기존 입력 의미 보존, 자동 안분 아님).
- 법인 + 잔존 개인 필드 → **무시** (3중 패턴 1차 방어) — 침묵 오계산이 아니라 법령상 해당 없음 처리. 결과뷰 라벨로 가시화("적용 없음(§8①2호)").
- ≤2022 법인 → 침묵 현행 세율 적용 **금지** — Zod refine 거부 (위 5).

## 14개 동기화 지점 (엔진 측 ⑨⑫⑭ + 타입)

신규 2필드(`taxpayerType`·`isJointOwnershipSpecialCase`): ⑨ Zod enum/boolean ⑫ Zod 객체 ⑭ route 매핑 — grep 자가 점검 키워드 `taxpayerType`·`isJointOwnershipSpecialCase` 각 5파일 이상(types·tax.ts·validators·route·api 변환) 검출돼야 함. F-1은 신규 입력 필드 없음(연도에서 파생) — ⑦ 결과뷰만.

## 테스트 약속

- `__tests__/tax-engine/comprehensive-special-cases.test.ts` 신규 — 케이스 인벤토리 SC-* 전부 toBe.
- 기존 `comprehensive-year-aware.test.ts`·`comprehensive-land-aggregate.test.ts`·`comprehensive-separate-land.test.ts`·통합 137+ **무변경 통과**.
- Phase 분할: Phase A = SC-A1~A4 / Phase B = SC-B1~B7 / Phase C = SC-C1~C4.

## 미결 사항 (Do 진입 전) — Phase 0 결과 (2026-06-11)

1. ~~R-1~~ ✅ 해소 — 2021·2022 법인 3.0%/6.0% (구법 §9②·§8①·§10 축자 + pdf38 법인 열. plan §6 Phase 0 참조). SC-B7·B8로 anchor화.
2. ~~R-2~~ ✅ 해소 — 령 §5의2③ "공동 소유자간 합의로 정한 사람". 2021 귀속 적용 실증(사례5 직전연도 계산).
3. ~~사례5~~ ✅ 채택 — §10의2 + 지방저가주택(§8④2호) 복합. anchor는 공제후 1,498,644까지 (고령자 15억/17억 안분은 §8④ 범위 외). SC-G7·SC-C4 확정.
4. ~~§10의2 개시연도~~ ✅ — 2021 귀속 적용 실증.
5. **★ G-7 신규 (Phase 0 발견)**: 주택 안분 ⑥ 분모 합산 단일 누진 — Step 7 표 참조. Pre-Do anchor 실패 확보 완료(현행 864,000 vs 정답 781,356).
6. Phase B 선행: `lib/calc/comprehensive-api.ts` 분리 (page.tsx 790줄 — UI 설계 문서 담당).
7. R-9 — G-7 ⑥ 합산 과표 절사 위치 (사례5 원단위 anchor가 강제 — Do에서 확정).
