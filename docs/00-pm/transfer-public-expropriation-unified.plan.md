# 양도소득세 — 공익수용·협의매수 단일 입력 통합 (계획서)

> Step1 자산-수준에 "양도원인(공익수용·협의매수) + 사업인정고시일" 선택란 1개를 신설해
> ① 비사업용 토지(NBL) 사업용 의제 ② 조특법 §77 감면 ③ 환산취득가액 양도시 기준시가 min[] 특례
> 세 기능을 단일 사실로 구동한다. **세 기능 모두 자산-수준**이라 배선이 자연스럽다.

## 배경 — 현재 상태 (실측)

| 기능 | 상태 | 자산-수준 저장 | 판정 근거(검증) |
|---|---|---|---|
| #1 NBL 수용→사업용 의제 | ✅ 완비 | `asset.nblExemptPublicExpropriation` + `nblExemptPublicNoticeDate` | `non-business-land/unconditional-exemption.ts:88-108` — 시행령 §168의14③3호 가목(고시일≤2006.12.31)·나목(취득일 ≤ 고시일−5년) |
| #2 §77 감면 | ✅ 완비 | `asset.reductions[]` 中 `public_expropriation`(`expropriationApprovalDate/Cash/Bond`) | `public-expropriation-reduction.ts` — 조특법 §77① 취득일 ≤ 고시일−2년, 2026.12.31까지 양도, 15%(채권 20/35/45%) |
| #3 환산 min[] 특례 | ❌ 미구현 | (신규) | 환산 분모 `standardPriceAtTransfer`를 form 입력값 그대로 사용(`transfer-tax-api.ts:370`). 집행기준 99-164-12(국세청) — 수용(양도) 2009.02.04 이후 + 취득가 불명(환산) |

**중복 문제**: 사업인정고시일이 `nblExemptPublicNoticeDate`(NBL)와 `expropriationApprovalDate`(§77) **두 필드에 따로** 존재. 사용자가 같은 사실을 2곳에 중복 입력·불일치 가능.

## 법령 검증 결과 (KoreanLaw 현행 시행 20260701) — 조건이 **서로 다름**

| 규정 | 취득시점 조건 | 기타 |
|---|---|---|
| NBL 사업용 의제 (시행령 §168의14③3호) | 취득일 ≤ 고시일−**5년** (또는 고시일 ≤ 2006.12.31) | — |
| §77 감면 (조특법 §77①) | 취득일 ≤ 고시일−**2년** | 2026.12.31까지 양도 |
| 환산 min[] (집행기준 99-164-12, 사용자 확인) | (취득시점 무관) | **수용(양도) ≥ 2009.02.04** + 환산모드 |

→ **단일 고시일 1개**를 입력받되 세 소비자가 **각자 다른 취득-시점 테스트**를 건다. 예: 고시일 3년 전 취득 = §77 O(2년 충족)이나 NBL 사업용 X(5년 미달) → **비사업용 중과 + §77 감면 동시**. **단일 토글이 "사업용"을 단정하면 안 됨** — 날짜만 공급, 판정은 각 엔진 독립.

## 확정 결정

1. **현금/채권보상 입력 위치 = Step1 인라인** (통합 UX).
2. **기존 Step4 NBL 토글·Step5 §77 토글 = 유지** (그대로 노출·override 가능·회귀 최소). 동일 자산 read/write라 자동 동기.
3. 선택란 위치 = **Step1 자산-수준** (`assetKind==="land"` 노출).

## 신규 자산 필드 (`AssetForm`) — **4개** (dual-truth 회피로 7→4 축소)

```ts
transferCause: "general" | "public_expropriation";   // 양도원인 라디오 (기본 general)
expropriationNoticeDate: string;                      // 사업인정고시일 — 단일 진실 (NBL·§77 fallback 소스)
compensationPerSqm: string;                           // 보상가액 ㎡당 (#3, 원/㎡)
compensationBasisStdPrice: string;                    // 보상산정 기초 기준시가 ㎡당 (#3, 원/㎡)
```

**재사용(신규 안 만듦)** — dual-truth 회피 (memory `feedback_ui_engine_dual_truth_avoidance`):
- 현금/채권보상·채권만기: 기존 `asset.reductions[]` 中 `public_expropriation`의 `expropriationCash`/`expropriationBond`/`expropriationBondHoldingYears:"none"|"3"|"5"` **직접 바인딩** (Step1이 asset.reductions 편집).
- #3 양도시 기준시가 ㎡당: 기존 `asset.standardPricePerSqmAtTransfer`(원/㎡) **재사용** (Zod `-sub.ts:534`서 환산모드 필수 refine 기존재).

## Step1 UI 블록 — 조건부 노출

**양도원인** 라디오(`RadioCardGroup`, tone=rose) — `assetKind==="land"` 노출. `public_expropriation` 선택 시 펼침:
- 사업인정고시일 (`DateInput`, `expropriationNoticeDate`) — 항상
- 현금보상액·채권보상액·채권만기특약 (`CurrencyInput`/`RadioCardGroup`) — 항상 (인라인). **바인딩 = `asset.reductions[]` 의 §77 reduction 필드** (선택 시 자동 생성/병합)
- **(#3)** `useEstimatedAcquisition===true` ∧ 양도일 ≥ 2009-02-04 일 때만: 보상 ㎡당가액(`compensationPerSqm`) + 보상산정 기초 기준시가(`compensationBasisStdPrice`)

## 배선 — 3 consumer + 3중 패턴 (useEffect→store 미러링 금지)

선택란 onChange는 `transferCause`(+동일 update의 인접 필드)만 씀. 파생은 **API/validate/engine fallback**:

- **#1 NBL** (`lib/calc/nbl-unconditional-exemption-status.ts` + API):
  `isPublicExpropriation = nblExemptPublicExpropriation || (transferCause==="public_expropriation")`
  `publicNoticeDate = nblExemptPublicNoticeDate || expropriationNoticeDate`
  → 5년/2006.12.31 판정은 엔진 독립 (단정 X). **파급B**: transferCause는 NBL판정(`isNonBusinessLand` 게이트)을 **강제하지 않음** — 활성 판정 내 수용 사실만 공급(의제는 판정 내에서만 의미).
- **#2 §77**: `public_expropriation` 감면은 **Step1 UI onChange가 `asset.reductions`에 생성**(수용 선택 시, composite write). 매퍼(`transfer-tax-api-reductions.ts`)는 매핑만.
  `businessApprovalDate = expropriationApprovalDate || expropriationNoticeDate`, cash/bond = reduction 필드.
  **파급C**: `toEngineReductions(formReductions)`는 asset 컨텍스트 없음 → 고시일 fallback을 **매퍼에 `expropriationNoticeDate` 주입** 또는 상위 `transfer-tax-api.ts`에서 `reduction.expropriationApprovalDate ||= expropriationNoticeDate` **선해소**(Do 시 시그니처 확정).
- **#3 환산** (신규 `lib/tax-engine/transfer-tax-expropriation-valuation.ts` + `calcTransferGain` 삽입):
  게이트 충족 시 `양도시 기준시가 ㎡당 = min(standardPricePerSqmAtTransfer, compensationPerSqm, compensationBasisStdPrice)` → `× transferArea` = 환산 분모(총액).

기존 Step4 NBL 토글·Step5 §77 패널 그대로 유지 (동일 자산 read/write → override). §77 reduction을 사용자가 Step5에서 제거하면 Step1 cash/bond는 숨김(§77 미적용 override).

## #3 환산 min[] 엔진 (신규)

**단위 확정(실측)**: `asset.standardPriceAtTransfer`는 **총액(원)**, `asset.standardPricePerSqmAtTransfer`는 **원/㎡**(AssetSectionTransfer.tsx:70·82). 토지 환산 분모 총액 = perSqm × `transferArea`. → min은 **원/㎡ 3값**에 적용 후 면적 곱.

```
게이트(엔진): useEstimatedAcquisition===true ∧ transferCause==="public_expropriation" ∧ 양도일 ≥ 2009-02-04 ∧ 보상 2필드>0
  · assetKind==="land"는 UI/API에서 강제(토지만 보상필드 전송) — 엔진은 보상필드 존재로 판정
양도시 기준시가 ㎡당(특례) = min(standardPricePerSqmAtTransfer, compensationPerSqm, compensationBasisStdPrice)
환산 분모(총액) = floor(위 ㎡당 × transferArea[toFixed(2)])   ← 기존 standardPriceAtTransfer(총액) override
환산취득가액 = 양도가액 × (취득시 기준시가 ÷ 환산 분모)
```

- 삽입점: 엔진 input의 `standardPriceAtTransfer`(총액) 산정 직전(route/api에서 perSqm×area 계산 지점) — Do 시 그 지점 pin.
- 결과 `expropriationValuationDetail?`는 **`Record`(Map 금지 — JSON 소실, memory `feedback_engine_result_map_json_loss`)**: `{ perSqmCandidates: {standard, compensation, basis}, chosenPerSqm, area, denominator }` 노출로 산출근거 투명화.

## 케이스 매트릭스

| 수용 | 고시일 | 취득 vs 고시일 | 환산·양도일 | #1 NBL | #2 §77 | #3 min[] |
|---|---|---|---|---|---|---|
| OFF | — | — | — | 현행 | 현행 | — (회귀 0) |
| ON | ≤2006.12.31 | — | — | 사업용 O | 2년충족 시 O | 조건부 |
| ON | 이후 | 5년 이전 취득 | — | 사업용 O | O | 조건부 |
| ON | 이후 | **3년 전 취득** | — | X(중과) | **O** | 조건부 |
| ON | 이후 | 1년 전 취득 | — | X | X(2년 미달) | 조건부 |
| ON | — | — | 환산 ∧ 양도≥2009.02.04 | | | **적용** |
| ON | — | — | 실지취득가 or 양도<2009.02.04 | | | **미적용** |
| ON→§77 제거(override) | — | — | — | 유지 | **미적용** | 유지 | ← Step5서 §77 수동 제거 시 |

## 14 동기화 지점 (신규 4필드)

①폼(AssetForm) ②initial(`makeDefaultAsset` — factory:44) ③normalize(`migrateAsset` — migrate:22) ④API(`transfer-tax-api.ts` + `-reductions.ts` NBL/§77 fallback) ⑤위젯(Step1 블록) ⑥사이드바(해당無) ⑦결과(`expropriationValuationDetail` Record 카드) ⑧validate(수용 ON 시 고시일=`expropriationNoticeDate ‖ nblExemptPublicNoticeDate ‖ reduction.expropriationApprovalDate` 중 1개면 통과 — UI↔validate 모순 방지; #3 게이트 시 `compensationPerSqm`·`compensationBasisStdPrice` 필수) ⑨⑩Zod enum ⑪자산 fallback ⑫Zod 신규 4필드(`transfer-tax-schema-sub.ts` — 환산 게이트 refine 추가) ⑬fetch body ⑭Route(Date 변환·엔진 매핑)

## Phase 분리 (설계 통합, 구현 2 PR)

- **Phase 1** — 선택란 + #1·#2 배선(엔진 기존, fallback만). 회귀 검증 집중(민감 NBL PR#454·#457).
- **Phase 2** — #3 환산 min[] 신규 엔진 + 보상 2필드 + anchor.

## 검증

- `tsc 0` · `vitest` 회귀 0
- anchor: 케이스 매트릭스 각 행 (특히 "3년 전 취득 = 중과+§77 동시", #3 min[] 3값 선택)
- E2E: 수용 선택 → NBL 사업용 뱃지·§77 자동 활성·#3 산출근거 카드
- 단위 일관성 anchor (#3 원/㎡ × 면적)

## 미결/확인 필요 (Do 진입 전)

- ✅ **해결**: `standardPriceAtTransfer`=총액, `standardPricePerSqmAtTransfer`=원/㎡ 확정 → #3은 perSqm 3값 min × `transferArea`.
- Do 시 pin: route/api에서 토지 환산 `standardPriceAtTransfer`(총액)=perSqm×area 산정 **정확한 라인** (#3 override 삽입점).
- §77 감면 대상 양도소득이 #3 환산 변경분을 자동 반영하는지 파이프라인 순서 확인 (환산 `calcTransferGain` → §77 후단 감면).
