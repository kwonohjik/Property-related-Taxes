# 엔진 설계 — 공익수용·협의매수 단일 입력 통합

> 계획서: `docs/00-pm/transfer-public-expropriation-unified.plan.md`
> #1 NBL 사업용 의제 · #2 조특법 §77 감면 = 기존 엔진 재사용(배선). #3 환산 min[] = 신규 엔진.

## 1. 개요 — 기능별 엔진 담당

| 기능 | 엔진 | 신규/기존 |
|---|---|---|
| #1 NBL 수용 의제 | `non-business-land/unconditional-exemption.ts` (§168의14③3호) | 기존 — input fallback만 |
| #2 §77 감면 | `public-expropriation-reduction.ts` | 기존 — reduction 주입 |
| #3 환산 min[] 특례 | **신규** `transfer-tax-expropriation-valuation.ts` | 신규 |

## 2. 케이스 인벤토리 (anchor 명명 = 각 행)

| # | anchor | 수용 | 고시일 | 취득 vs 고시일 | 환산·양도일 | #1 NBL | #2 §77 | #3 min[] |
|---|---|---|---|---|---|---|---|---|
| E1 | `expr-off-baseline` | OFF | — | — | — | 현행 | 현행 | — (회귀0) |
| E2 | `expr-notice-before-2007` | ON | ≤2006.12.31 | — | — | 사업용 O | 2년충족 시 O | 조건부 |
| E3 | `expr-acq-5y-before` | ON | 이후 | 5년 이전 | — | 사업용 O | O | 조건부 |
| E4 | `expr-acq-3y-mixed` | ON | 이후 | **3년 전** | — | **X(중과)** | **O** | 조건부 | ← 중과+감면 동시 |
| E5 | `expr-acq-1y-none` | ON | 이후 | 1년 전 | — | X | X(2년미달) | 조건부 |
| E6 | `expr-valuation-min-applies` | ON | — | — | 환산 ∧ 양도≥2009.02.04 | | | **적용** |
| E7 | `expr-valuation-gate-off` | ON | — | — | 실지 or 양도<2009.02.04 | | | **미적용** |
| E8 | `expr-77-removed-override` | ON→§77제거 | — | — | — | 유지 | **미적용** | 유지 |

## 3. Input/Result 타입 변경 (`types/transfer.types.ts`)

### TransferTaxInput 추가 (모두 optional — 미제공 시 현행 동작, 회귀0)

```ts
transferCause?: "general" | "public_expropriation";   // 기본 general
standardPricePerSqmAtTransfer?: number;                // 원/㎡ (기존 UI 필드, 엔진엔 신규)
transferArea?: number;                                 // ㎡ (양도면적, 엔진엔 신규)
compensationPerSqm?: number;                           // 보상 ㎡당 (원/㎡)
compensationBasisStdPrice?: number;                    // 보상산정 기초 기준시가 ㎡당 (원/㎡)
```

> `assetKind`는 엔진에 미추가 — #3 게이트의 "토지"는 UI/API에서 강제(토지만 보상필드 전송). 엔진 게이트는 아래 4조건.

### TransferTaxResult 추가

```ts
// Map 금지 — JSON 소실(memory feedback_engine_result_map_json_loss). Record 사용.
expropriationValuationDetail?: {
  perSqmCandidates: { standard: number; compensation: number; basis: number };
  chosenPerSqm: number;   // = min(3)
  area: number;
  denominator: number;    // = chosenPerSqm × area (override된 양도시 기준시가 총액)
};
```

## 4. #3 알고리즘 (신규 `transfer-tax-expropriation-valuation.ts`)

```ts
// 게이트 (4조건 AND):
//   input.useEstimatedAcquisition === true        ← 실제 환산 브랜치(helpers:37), acquisitionMethod 아님
//   transferCause === "public_expropriation"
//   transferDate >= 2009-02-04
//   standardPricePerSqmAtTransfer > 0 && transferArea > 0 && compensationPerSqm > 0 && compensationBasisStdPrice > 0
// 결과: override된 standardPriceAtTransfer(총액) + detail. 게이트 미충족 → null(현행 총액 유지).

export function applyExpropriationValuation(input): {
  denominator: number;
  detail: ExpropriationValuationDetail;
} | null
// chosenPerSqm = Math.min(standardPricePerSqmAtTransfer, compensationPerSqm, compensationBasisStdPrice)
// area2 = parseFloat(transferArea.toFixed(2))                        // UI 면적 반올림과 일치
// denominator = Math.floor(safeMultiply-decimal(chosenPerSqm, area2)) // perSqm×area, floor
```

**삽입점**: `calcTransferGain`(`transfer-tax-helpers.ts:263`, `input: TransferTaxInput` 전체 수신) 의 `if (input.useEstimatedAcquisition)` 블록(helpers:37~) 내 `calculateEstimatedAcquisitionPrice` 호출 **직전**. non-null이면 `denominator`를 3번째 인자로 사용(`input.standardPriceAtTransfer ?? 0` 대체). detail은 `TransferGainResult`에 담아 반환.

- **반올림 정합(정정)**: 현행 토지 총액은 UI(LandPriceLookupField)가 perSqm×area로 계산해 `standardPriceAtTransfer`에 저장(route/api 재계산 없음). #3 override도 **동일 방식**(area `toFixed(2)` 후 곱, floor) — 불일치 방지(memory `feedback_area_rounding_consistency`·`feedback_safemul_decimal_apportion_precision`).
- **§77 시퀀싱**: #3이 `calcTransferGain`(양도차익)에서 발동 → §77 감면(후단 STEP)이 자동으로 낮아진 차익 기준 반영. 순서 정합(계획서 미결 해소).
- **result 전파 체인(정정 — 침묵 strip 방지)**: `expropriationValuationDetail`은 ① `TransferGainResult`에 추가 → ② 오케스트레이터(`transfer-tax.ts`) 명시 전달 → ③ `buildTransferResultDetails`(`transfer-tax-finalize.ts:429`) → ④ `TransferTaxResult` **전 단계 명시**. TS 미감지 침묵 strip 주의(memory `feedback_explicit_prop_mapping_strip`·`feedback_engine_result_display_drift`).

## 5. #1·#2 배선 (기존 엔진, input fallback)

- **#1 NBL** (`nbl-unconditional-exemption-status.ts buildUnconditionalExemption` / API):
  `isPublicExpropriation = nblExemptPublicExpropriation || transferCause==="public_expropriation"`
  `publicNoticeDate = nblExemptPublicNoticeDate || expropriationNoticeDate`
  판정(§168의14③3호 가목≤2006.12.31·나목 취득≤고시일−5년)은 `unconditional-exemption.ts:88-108` 엔진 독립. transferCause는 `isNonBusinessLand` 판정을 강제하지 않음(파급B).
- **#2 §77**:
  - reduction **생성 책임 = Step1 UI onChange**(양도원인=수용 선택 시 `asset.reductions`에 `public_expropriation` 추가 — composite write, useEffect 미러링 아님). 매퍼(`toEngineReductions`)는 생성하지 않고 매핑만(오귀속 정정).
  - 고시일 fallback: 매퍼가 asset 컨텍스트 없음(파급C) → **`toEngineReductions(formReductions, { expropriationNoticeDate })` 시그니처 확장**. `businessApprovalDate = r.expropriationApprovalDate || ctx.expropriationNoticeDate`. cash/bond·bondYears는 reduction 필드 그대로.

## 6. 법령 근거 (KoreanLaw 실측, 현행 시행 20260701)

- #1: 소득세법 시행령 §168의14③3호 가목(고시일 ≤2006.12.31)·나목(취득일 ≤ 고시일−5년). 「협의매수 또는 수용」 both.
- #2: 조특법 §77①(취득일 ≤ 고시일−2년, 2026.12.31까지 양도, 15%; 채권 20%; 3년특약 35%; 5년 45%).
- #3: 소득세법 집행기준 99-164-12(국세청, 사용자 확인) — 수용(양도) 2009.02.04 이후 + 환산. `legal-codes/transfer.ts`에 상수 추가.

## 7. 14 동기화 지점 (엔진측 ④⑪⑫⑭)

- ④ `transfer-tax-api.ts`: 신규 4필드 body 전달 + #1 fallback + #2 매퍼 컨텍스트. `-reductions.ts` §77 주입.
- ⑪ 자산 fallback: `primary.transferCause` 등.
- ⑫ Zod `transfer-tax-schema-sub.ts`: 신규 4필드 + 환산·수용 게이트 refine(보상필드 필수).
- ⑭ Route `route.ts`: 엔진 input 매핑 — `standardPricePerSqmAtTransfer`·`transferArea`·`compensationPerSqm`·`compensationBasisStdPrice`·`transferCause` 추가(현재 미매핑 — 침묵 strip 주의).

## 8. Phase (필드별 분리)

**필드 구분**: AssetForm 신규 **4**(transferCause·expropriationNoticeDate·compensationPerSqm·compensationBasisStdPrice). 엔진 input 신규 매핑 **5**(그중 `standardPricePerSqmAtTransfer`·`transferArea`는 **기존 AssetForm 필드를 엔진에 처음 전달** — #3 전용).

- **Phase 1** — #1·#2 배선. 신규 필드 `transferCause`·`expropriationNoticeDate`. 엔진 신규 0(기존 NBL·§77 input fallback + Step1 UI reduction 생성). 회귀 anchor E1~E5, E8.
- **Phase 2** — #3 신규 엔진(`transfer-tax-expropriation-valuation.ts`) + `compensationPerSqm`·`compensationBasisStdPrice` + 엔진 input perSqm·area 매핑 + result Record echo(전파 체인) + anchor E6·E7 + 원/㎡×면적 반올림 anchor. calcTransferGain 다중 호출처(mixed/split/burdened)는 보상필드 게이트로 no-op 확인.
