# 토지·건물 취득/양도가액 독립 산정 모드 재설계 계획서

> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `components/calc/transfer/LandBuildingSplitSection.tsx` 가 이 계획서를 인용하며 실재한다.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: 상태: **Plan (확정 방향)** · 작성일 2026-07-28 · 대상: 양도소득세 토지·건물 취득일 분리 케이스~~
> 검증 원칙: 모든 file:line·법령·수치는 실측/조문 확인. 미확인은 "확인 필요" 명시.
>
> **사용자 확정 (2026-07-28)**:
> - **[Q1] 4방식 전부 파트별 독립** — 실가·환산·감정·매매사례 모두 토지·건물 각각 독립 선택.
> - **[Q2] 양도가액 안분 시점 정정(취득시→양도시) 이번 작업에 포함** (Phase B).

---

## 1. 배경 — 사용자가 지적한 두 결함

토지·건물 취득일이 다른 자산(원시취득·신축·승계취득 시점 차이)의 양도세 계산에서:

1. **취득가액 축**: 토지·건물 각각을 **독립적으로** 실가/환산으로 조합해야 한다.
   - 토지 실가 + 건물 실가
   - 토지 실가 + 건물 환산 (예: 건물 자가신축 → 실취득가 불명)
   - 토지 환산 + 건물 실가
   - 토지 환산 + 건물 환산

   현재 구현은 **취득가액 산정 방식이 자산 전체에 단 하나만** 지정되어, 위 4조합 중 "둘 다 실가"·"둘 다 환산" 2가지만 가능하다.

2. **양도가액 축**: 취득과 **독립적으로** 결정되어야 한다.
   - 구분양도: 계약서에 토지·건물 가액이 구분 기재됨 → 각 실지 양도가액
   - 일괄양도: 구분 불분명 → **양도 당시 기준시가 비율**로 안분

   현재 구현은 취득·양도가액 분리를 **하나의 토글(`landSplitMode`)로 묶어** 독립 선택이 불가능하고, 안분 비율 시점도 법령과 어긋난다(§4 참조).

사용자 표현: "전면 재설계하여야 할 것 같은데". → **본 계획서 결론: 데이터 모델·엔진 골격·UI 컴포넌트는 상당 부분 재활용 가능하다. 핵심은 "모드 축의 분리(mode decoupling)"이며 전면 재작성은 아니다.** (§5~§9)

---

## 2. 현행 구현 실측 진단 (검증된 file:line)

### 2.1 취득가액 — 자산 전체 단일 축

**UI**: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:137-143`
```ts
const acqPriceMode: AcqPriceMode = props.isSalesCaseAcquisition
  ? "salesCase"
  : props.isAppraisalAcquisition
    ? "appraisal"
    : props.useEstimatedAcquisition
      ? "estimated"
      : "actual";
```
→ 자산 1개당 boolean 3개(`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition`)에서 **단일 유니온** 파생. 토지/건물 구분 없음.

**엔진**: `lib/tax-engine/transfer-tax-split-gain.ts:84-146` `calcSplitAcquisitionPrice()`
```ts
if (input.useEstimatedAcquisition) {           // ← 자산 전체 단일 boolean
  // 토지·건물 "둘 다" 환산 공식
}
if (input.acquisitionMethod === "salesCase") { /* 둘 다 안분 */ }
if (input.acquisitionMethod === "appraisal")  { /* 둘 다 감정 */ }
// else 둘 다 실거래가 splitPair
```
→ **`input.useEstimatedAcquisition`(단일 boolean)이 토지·건물을 동시에 결정.** 파트별 독립 모드 분기가 구조적으로 없음.

**데이터 모델**: `lib/stores/calc-wizard-asset.ts:328,368-388`
- `useEstimatedAcquisition: boolean` (자산 전체)
- 토지·건물 각각 가액 필드는 **이미 존재**: `landAcquisitionPrice`·`buildingAcquisitionPrice`·`landTransferPrice`·`buildingTransferPrice`·`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`·`landDirectExpenses`·`buildingDirectExpenses`
- **부족한 것**: 토지·건물 각각의 **취득 모드 축**(현재 없음)

**테스트**: `__tests__/tax-engine/transfer-tax/land-building-split.test.ts` S1~S5 전부 `useEstimatedAcquisition`이 자산 전체 단일. **혼합 케이스(토지 실가+건물 환산 등) 테스트 0건 = 미지원 확정.**

### 2.2 양도가액 — 취득과 묶임 + "죽은 모드"

**UI**: `CompanionAcqPurchaseBlock.tsx:651-678` — `FieldCard label="취득·양도가액 분리 방식"`, `landSplitMode`(`apportioned`|`actual`) 토글 하나가 취득·양도를 **동시** 지배.

**엔진 미사용 확인**: `lib/calc/transfer-tax-api.ts:153` 주석
```
// 엔진은 landSplitMode를 읽지 않으므로("죽은 모드") 여기서 막지 않으면 ...
```
→ `landSplitMode`는 **엔진에 전달되지만 계산에 미사용.** API가 `landSplitMode === "actual"`일 때만 6필드(landTransferPrice 등)를 전송하는 **게이트 역할**만 한다(`transfer-tax-api.ts:321-338`). 엔진 `splitPair`(`transfer-tax-split-gain.ts:48-59`)는 필드 **유무**로만 판단(입력 우선 → 한쪽만 있으면 잔액 → 둘 다 없으면 안분).

**양도가액 축은 2-레벨** (중복 아님 — 실측 정정): `bundledSaleMode`(`calc-wizard-store.ts:61`, 폼-전역, default `apportioned`:232)는 **다건 자산 "간"** 일괄양도 안분 축이다(`BundledAllocationPreview.tsx:21` `assets.length < 2` 시 무효화, 단건은 `CompanionAssetsSection.tsx:85`에서 `singleMode`=`assets.length===1` 파생 → `CompanionSaleModeBlock` 라벨 단순화). 반면 본 계획의 `saleSplitMode`는 **한 자산 "내" 토지·건물 간** 분리 축 — **레벨이 다르므로 공존 가능**(bundledSaleMode 재활용 불가). 현재 결함은 "죽은 모드 `landSplitMode`가 취득·양도를 하나로 묶은 것"이지 양도 축 중복이 아니다.

### 2.3 안분 비율 시점 — 취득시 기준시가 (법령 정합성 문제)

`transfer-tax-split-gain.ts:26-36` `calcApportionRatio()`
```ts
const sqm = input.standardPricePerSqmAtAcquisition ?? 0;  // 취득시 ㎡당 공시지가
const area = input.acquisitionArea ?? 0;                  // 취득 면적
const total = input.standardPriceAtAcquisition ?? 0;      // 취득시 총 기준시가
const landRatio = Math.min(landStd / total, 1);
```
→ **취득시 기준시가 비율.** 이 `landRatio`가 취득가액 안분(적정)뿐 아니라 **양도가액 안분에도 사용**된다(`transfer-tax-split-gain.ts:181-186` `splitPair(totalTransfer, …, landRatio)`).

§4에서 보듯 양도가액 안분은 **양도 당시 기준시가**여야 하므로 이는 법령 위반이다.

---

## 3. 소비처·검증 지점 (영향 범위)

| 지점 | 위치 | 영향 |
|---|---|---|
| 결과뷰 ⑦ | `components/calc/results/TransferTaxResultView.tsx:490-539` · `transfer/FilingFormTableFinancials.ts:63-80` (`splitDetail` 소비) | 파트별 취득 방식 표시 추가 — `SplitPartResult.acqMode` echo 필드 소스(§6) |
| Validate ⑧ | `lib/calc/transfer-tax-validate-split.ts` (`isSplitPairOverflow` 단일 소스) | 파트별 모드 게이트 반영 |
| Zod ⑫ | `app/api/calc/transfer/route.ts:252-260` | 신규 모드 필드 enum |
| API 변환 ④⑬ | `lib/calc/transfer-tax-api.ts:314-341` | 파트별 모드 매핑 + 양도시 기준시가 전송 게이트 확장(§7.2) |
| §97② swap | `transfer-tax-split-gain.ts:231-265` `applyAssetSwap` (환산 모드 전용, 자산 단위 독립) | 파트별 모드로 게이트 재정의 |
| **penaltyBase(가산세)** | `transfer-tax-finalize.ts:372,386` (자산 전체 `useEstimatedAcquisition`·`acquisitionMethod` read) | **[STEP3] 혼합 시 `usedEstimated = OR(파트 estimated)`, base = splitDetail 파트 합산**(§6) |
| §164⑨ 공익수용 | `transfer-tax-split-gain.ts:104-123` (토지분 환산 분모 특례, 현행 `useEstimatedAcquisition` 블록 내부) | **[STEP3] 토지 파트 `estimated`일 때만** 적용하도록 재게이트 |
| §164⑤ PHD | `transfer-tax-split-gain.ts:321-390` `calcSplitGainPreDisclosure` | 별도 경로(3시점) — 본 재설계와 상호작용 확인 필요 |

**기존 회귀 앵커** (반드시 유지/갱신): `land-building-split.test.ts`(S1~S5), `split-gain-residual-symmetry.anchor.test.ts`, `split-gain-salescase.anchor.test.ts`, `acq-cost-swap-split.test.ts`, `owner-split-case12.test.ts`, `transfer-tax-api-split-gate.test.ts`, `transfer-tax-validate-split.test.ts`, `expropriation-split-land.anchor.test.ts`, `expropriation-phd-split.anchor.test.ts`.

---

## 4. 법령 정본 (조문 확인 완료)

**소득세법 시행령 §166⑥** (현행 MST 286211, 시행 2026-07-01, 조회 2026-07-27):
> 법 제100조제2항의 규정을 적용함에 있어서 토지와 건물 등의 **가액의 구분이 불분명한 때에는** 「부가가치세법 시행령」 **제64조제1항에 따라 안분계산** 하며 …

**부가가치세법 시행령 §64①** (현행 MST 283641, 시행 2026-04-01, 조회 2026-07-27):
> 1호. 토지·건물등의 기준시가가 모두 있는 경우: **공급계약일 현재의 기준시가**에 따라 계산한 가액에 비례하여 안분. **다만, 감정평가가액이 있는 경우에는 그 가액에 비례하여 안분.**
> 2호. 어느 하나 또는 모두 기준시가가 없는 경우: 감정평가가액 → (없으면) 장부가액/취득가액 비례 안분.
> 3호. 위를 적용 곤란 시: 국세청장이 정하는 바.

**도출 결론**:
- (A) 안분은 **"구분이 불분명한 때"에만** 적용 — 계약서 구분 기재/실지 확인 시 그 가액 우선. (현행 `splitPair` 입력우선 로직과 부합)
- (B) 양도(공급) 안분 기준시점 = **공급계약일(=양도 당시)의 기준시가.** → 현행 엔진의 "취득시 기준시가 비율로 양도가액 안분"은 **법령 위반**(§2.3).
- (C) 안분 순서: **감정평가액 > (양도시)기준시가 > 취득가액.**
- (D) 취득가액 안분은 취득이라는 별개 거래의 구분이므로 **취득 당시 기준시가**로 안분함이 타당(§166⑥은 법 §100② 양도차익 산정 규정 — 양도가액 안분 시점만 직접 규율. 취득가액 파트별 안분 시점은 취득 시점 논리 적용).

> **미확정 항목**: 부가세령 §64①의 "감정평가액 우선" 순서를 양도세 토지·건물 안분에 전면 적용할지(현행은 기준시가 안분만 구현). 실무 빈도상 기준시가 안분이 절대다수이며, 감정가액 안분은 감정평가서가 토지·건물 각각 평가한 경우 직접입력으로 이미 커버 가능 → **본 계획은 (B)(양도시 기준시가) 정정을 우선하고, 감정가액 우선순위 자동화는 별도 범위로 분리**(§13).

---

## 5. 목표 케이스 매트릭스 (Q1: 4방식 전부 독립 확정)

**취득 축**: 토지·건물 각각 `actual`(실가) | `estimated`(환산) | `appraisal`(감정) | `salesCase`(매매사례) **4방식 독립** → 토지 4 × 건물 4 = **16조합**. 엔진을 파트별 독립 분기로 만들면 16조합이 자동 커버(파트당 단일 4-way 분기).
**양도 축**: `saleSplitMode` = `actual`(구분양도 직접) | `apportioned`(일괄양도 양도시 기준시가 안분) — 취득과 독립.

**파트별 취득가액 base 소스** (4방식 각각의 파트 계산 규칙):

| 방식 | 파트 취득가액 산식 | 개산공제(§163⑥) | 직접입력 필드 |
|---|---|---|---|
| `actual` 실가 | 직접입력 우선 → 잔액 → 취득시 기준시가 안분 | 없음 | `land/buildingAcquisitionPrice` |
| `estimated` 환산 | 파트 양도가액 × (파트 취득시 기준시가 / 파트 양도시 기준시가) | 파트 취득시 기준시가 × 3% | (자동) |
| `appraisal` 감정 | 직접입력(감정평가서가 토지·건물 각각 평가) → 잔액 → 안분 | 파트 취득시 기준시가 × 3% | `land/buildingAcquisitionPrice`(감정가) |
| `salesCase` 매매사례 | 파트별 유사매매사례 추계액. 미확인 시 §166⑥ "구분 불분명"→취득시 기준시가 안분 | 파트 취득시 기준시가 × 3% | 파트별 매매사례가(신규 필드, §6) |

**현행 대비 신규 커버**: 실무 최빈 = 토지 `actual` + 건물 `estimated`(건물 자가신축 → 건물만 환산, 토지는 매입 실가). 대칭인 토지 `estimated` + 건물 `actual`, 그리고 감정·매매사례 혼합(예: 토지 감정 + 건물 환산)까지 전부 파트별 4-way 분기로 표현.

> **감정·매매사례 파트별 처리 주의**: 감정가액은 감정평가서가 토지·건물을 각각 평가하는 경우가 많아 파트별 직접입력이 자연스럽다(현행 `calcSplitAcquisitionPrice:137-141` appraisal 분기가 이미 `splitPair` 직접입력 허용). 매매사례가액은 추계라 파트별 유사사례가 드물다 → 파트별 매매사례가 입력 필드를 신설하되, 미입력 시 §166⑥ 안분 fallback. **이 fallback이 `feedback_no_silent_apportion_fallback`(자동 안분 금지)의 예외인 근거 (STEP1 #4)**: 정책 예외 요건은 ①법령이 산식을 명시 + ②사용자의 의식적 선택인데, 둘 다 충족한다 — ① §166⑥이 "구분이 불분명한 때" 기준시가 안분을 **명시**하고, ② 사용자가 `salesCase`(매매사례가액 추계) 모드를 **의식적으로 선택**한 상태에서 파트 구분을 미입력한 것이 정확히 "구분 불분명"에 해당한다. 빈값을 임의 비율로 채우는 silent fallback이 아니라 **법령이 규정한 정상 파생**이다.

---

## 6. 목표 데이터 모델 (`AssetForm` 확장)

**신규 필드**:
```ts
// 취득 모드 — 파트별 독립 4-way (Q1 확정). 기본 "actual".
type PartAcqMode = "actual" | "estimated" | "appraisal" | "salesCase";
landAcqMode: PartAcqMode;       // 토지 취득 산정 방식
buildingAcqMode: PartAcqMode;   // 건물 취득 산정 방식

// 양도 모드 — 취득과 독립 (구분양도 | 일괄양도 안분). 기본 "apportioned".
saleSplitMode: "actual" | "apportioned";

// 파트별 매매사례가액 (salesCase 모드 전용, 신규):
landSalesCaseValue: string;
buildingSalesCaseValue: string;
// (STEP1 #3 개선) 신규 2필드 vs 기존 land/buildingAcquisitionPrice 재활용 검토:
//   감정가액은 landAcquisitionPrice 재활용(§5 표)하나, salesCase가 같은 필드를 공유하면
//   actual↔appraisal↔salesCase 모드 전환마다 값 잔존 혼선 → 분리 신설(14 동기화 +2 비용 감수).
//   대안: "모드 전환 시 상대 필드 클리어"로 필드 공유 — Do 단계 재검토 가능.

// 환산 분모(양도시 기준시가)·분자(취득시 기준시가) 파트별 — 대부분 기존 필드 재활용:
//   토지 취득시:  standardPricePerSqmAtAcquisition × acquisitionArea (기존)
//   건물 취득시:  standardPriceAtAcquisition − 토지분 (기존 도출)
//   토지 양도시:  landStandardPriceAtTransfer (기존)
//   건물 양도시:  buildingStandardPriceAtTransfer (기존)
// → 기준시가 필드는 재활용, 파트별 매매사례가만 신규.
```

**result 타입 확장 (STEP1 #1 — 결과뷰·신고서 파트별 방식 표시 소스)**: 결과뷰(`TransferTaxResultView.tsx:490-539`)와 신고서(`FilingFormTableFinancials.ts:63-80`)는 현재 `SplitPartResult`의 값(transferPrice·acquisitionPrice·appraisalDeduction·gain)만 표시하고 **파트별 취득 방식을 표시하지 않는다**(개산공제 유무로만 간접). 혼합 모드(토지 실가+건물 환산)에서 "토지=실가 / 건물=환산"을 명시하려면 `SplitPartResult`에 echo 필드 추가:
```ts
// lib/tax-engine/types/transfer.types.ts — SplitPartResult
acqMode?: "actual" | "estimated" | "appraisal" | "salesCase";  // 파트별 취득 방식 (결과뷰 라벨용, echo)
```
(memory `echo-field-pattern` — 계산 로직 무변경, 표시 전용 optional echo. 산식에 영향 없음.)

**기존 `landSplitMode` 처리**: 취득·양도 혼재 의미를 폐기하고 `saleSplitMode`로 대체. 하위호환은 `migrateAsset`에서 `landSplitMode → saleSplitMode` 매핑(③ normalize, §13 Q4).

### 6.1 SoT 도출 규칙 — 파트 모드가 다를 때 (Critical, STEP1 C1 정정)

**분리 활성 조건**: `hasSeperateLandAcquisitionDate === true` **OR** `selfOwns !== "both"`(소유자 분리) — 현행 API 게이트(`transfer-tax-api.ts:316,322`)와 동일.

분리 시 **파트 모드(`landAcqMode`/`buildingAcqMode`)가 단일 SoT**다. 그런데 엔진 input의 **자산 전체 스칼라**를 소비하는 legacy 경로가 있어, 파트가 **다를 때**(예: 토지 `actual` + 건물 `estimated`)도 값이 정의돼야 한다(미정의 = dual-truth). "`landAcqMode === buildingAcqMode`일 때만 역산"은 **혼합 케이스를 비워두는 구멍**이므로 아래로 대체:

| 자산 전체 필드 | 소비처 (실측) | 파트 상이 시 도출 규칙 |
|---|---|---|
| `useEstimatedAcquisition` | `transfer-tax-helpers.ts:281-287` `usedEstimated`·`estimatedBase`, 결과 표시 | `landAcqMode==="estimated" \|\| buildingAcqMode==="estimated"` (어느 파트든 환산이면 true) |
| `acquisitionMethod` | `helpers.ts:283` `usedEstimated` OR(appraisal·salesCase) | 분리 경로는 `calcSplitAcquisitionPrice`가 **파트 모드로 직접 계산** → 자산 전체값은 표시 플래그용; 파트 혼합 시 비-`actual` 우선(환산>감정>매매사례) |
| 가산세 base(무신고 환산 40% 등) | `finalize` STEP 10.5(`types.ts:326`) | **확인 필요** — 파트별 정밀 penalty는 실무 극저빈도. 우선 "환산 파트 존재 시 환산 penalty"(보수적), Phase A anchor로 검증 |

**단방향 파생**(`feedback_ui_engine_dual_truth_avoidance`): 위 자산 전체 필드는 **API 변환에서 파트 모드로부터 1회 파생**(역방향 파생 금지·`useEffect → store` 미러링 금지).

**3중 패턴 필드별 명시 (`mirror-pattern`·`feedback_store_default_vs_ui_display_fallback`)** — STEP1 M3:
- `landAcqMode`/`buildingAcqMode`: **[Do 환류 2026-07-28]** factory default `""`(미선택) · `migrateAsset` `undefined`→`""` · **single-source `effectivePartAcqMode(explicit, asset)`**(`lib/calc/transfer-tax-split-acq-mode.ts`)가 `""`→자산 전체 플래그(매매사례>감정>환산>실가) 파생을 UI·API·validate 전부에서 담당(dual-truth 회피). 종전 계획의 "`"actual"` 명시"안보다 나음 — 비분리 환산 자산에서 `landAcqMode="actual"`↔`useEstimatedAcquisition=true` 충돌을 애초에 회피.
- `saleSplitMode`: factory default `"apportioned"` · normalize 동일 · UI 직접 바인딩.
- 비분리 시 파트 모드 = 자산 전체 플래그에서 **onChange/useMemo 파생**(useEffect 미러링 아님): `landAcqMode = buildingAcqMode = deriveMode(useEstimated, isAppraisal, isSalesCase)`.
- API 변환의 `acquisitionMethod` 도출(현행 `transfer-tax-api.ts:85-87`)은 비분리 경로에서 불변.

---

## 7. 엔진 재설계 (`transfer-tax-split-gain.ts`)

### 7.1 `calcSplitAcquisitionPrice` — 파트별 독립 분기

현재 자산 전체 `if (input.useEstimatedAcquisition)` 단일 분기를 **토지·건물 각각 자기 모드(4-way)로** 계산:

```ts
function calcPartAcq(mode, partTransferPrice, partStdAtAcq, partStdAtTransfer,
                     directAcqInput, salesCaseInput, acqRatio, actualBase, appraisalBase) {
  switch (mode) {
    case "estimated":  // 환산: 파트 양도가액 × (파트 취득시 / 파트 양도시 기준시가)
      return partStdAtTransfer > 0 ? floor(partTransferPrice × partStdAtAcq / partStdAtTransfer) : 0;
    case "appraisal":  // 감정: 직접입력 우선 → 잔액 → 취득시 기준시가 안분
      return splitPairSide(appraisalBase, directAcqInput, acqRatio);
    case "salesCase":  // 매매사례: 파트별 추계액 우선, 미입력 시 취득시 기준시가 안분(§166⑥)
      return salesCaseInput ?? floor(actualBase × acqRatio);   // base=0 소실 방지 주의(현행 :126-134)
    case "actual":     // 실가: 직접입력 우선 → 잔액 → 취득시 기준시가 안분
    default:
      return splitPairSide(actualBase, directAcqInput, acqRatio);
  }
}
land     = calcPartAcq(input.landAcqMode, landTransferPrice, landStdAtAcq, landStdAtTransfer, …, acqRatio.land, …)
building = calcPartAcq(input.buildingAcqMode, buildingTransferPrice, buildingStdAtAcq, buildingStdAtTransfer, …, acqRatio.building, …)
```

- 파트별 취득가액 안분은 **취득시** 기준시가 비율(`acqRatio` = 현행 `calcApportionRatio` 승계). 양도가액 안분은 §7.2 `saleRatio`.
- **파트별 양도시 기준시가(`landStdAtTransfer`/`buildingStdAtTransfer`) 정책 (STEP1 #3 — §7.2와 정합)**: 파트가 `estimated`(환산 분모로 사용)이거나 `saleSplitMode === "apportioned"`(양도 안분 비율로 사용)이면 이 필드는 **필수 입력** — 미입력 시 validate 차단(자동 안분 fallback 금지, `feedback_no_silent_apportion_fallback`). 현행 `line 99-102`의 `standardPriceAtTransfer × landRatio` fallback은 **비분리 자산 전체 환산 경로에만** 유지하고, 파트별 분리 경로에는 적용하지 않는다(취득시 landRatio로 양도시 기준시가를 대체하는 것은 §4-B 위반이기도 함).
- **개산공제(§163⑥)**: 파트 모드가 `estimated`·`appraisal`·`salesCase`일 때 그 파트에 취득시 기준시가 × 3% 적용(현행 line 220-225 `usesEstOrAppraisal`을 **파트별** 게이트로 재정의).
- **§97② swap**(`applyAssetSwap`, line 231-265): 현재 `usesEstOrAppraisal` + `input.useEstimatedAcquisition` 게이트 → 파트별 `mode === "estimated"`로 재정의(swap은 환산 모드 전용 — CLAUDE.md §97②2호 단서). **appraisal·salesCase 파트는 swap 대상 아님**(현행 `:246-250` 감정가액 swap 제외 주석과 동형) — 개산공제(§163⑥)만 적용하고 `directExpenses`는 일반 필요경비로 차감. 자산 단위 독립 적용 골격은 이미 있어 재활용.
- **매매사례 base 소실 주의**: 현행 `:126-134`가 salesCase에서 base=0 소실 버그를 이미 수정. 파트별 salesCase도 `similarSalesValue`/파트별 매매사례가를 base로 사용하도록 동일 주의.
- **selfOwns 결합 규칙 (STEP1 #5)**: `selfOwns`(`both`|`building_only`|`land_only`, `calc-wizard-asset.ts:366`)가 `both`가 아니면 소유하지 않는 파트는 양도차익 계산 대상에서 제외된다(현행 `calcSplitGain`은 `selfOwns`를 결과에 실어 결과뷰가 열 강조로 처리 — `TransferTaxResultView.tsx:491,517-539`). 파트별 취득 모드(`landAcqMode`/`buildingAcqMode`)는 **본인 소유 파트에만** 의미가 있다 → `building_only`이면 `buildingAcqMode`만, `land_only`이면 `landAcqMode`만 활성. UI(§8)·validate(⑧)에서 비소유 파트 모드 입력을 비활성/무시.

### 7.2 안분 비율 시점 분리 (법령 정정)

```ts
calcAcqApportionRatio(input):  취득시 기준시가 비율  // 취득가액 안분용 (현행 calcApportionRatio 승계)
calcSaleApportionRatio(input): 양도시 기준시가 비율  // 양도가액 안분용 (신규 — §4-B)
```
- 양도시 비율 = `landStdAtTransfer / (landStdAtTransfer + buildingStdAtTransfer)`.
- `saleSplitMode === "apportioned"`에서 양도시 토지·건물 기준시가가 필요 → UI에 입력 경로 신설(§8). 미입력 시 명확한 validate 오류(자동 안분 fallback 금지 — CLAUDE.md).
- **[Do 환류 2026-07-28]** 엔진(`split-gain.ts:147-150,256`)은 양도시 기준시가 미입력 시 취득시 비율로 fallback한다(legacy/actual 경로 회귀 0 목적). **validate(`transfer-tax-validate-split.ts`)가 `saleSplitMode==="apportioned" || 파트 estimated` 게이트로 미입력을 차단**해 엔진 fallback 도달을 막는다(조건부 차단 — apportioned/estimated에서만 발동하므로 actual/legacy 경로와 ⑧ 모순 없음). 사용자 확정(입력 강제).
- **⚠️ API 전송 게이트 재배선 (STEP1 #2 — 필수)**: 현행 `land/buildingStandardPriceAtTransfer`는 `splitDirectActive`(= `landSplitMode === "actual"`) 게이트에서만 전송된다(`transfer-tax-api.ts:330-341`). 신설 `saleSplitMode === "apportioned"` 경로 또는 파트가 `estimated`일 때도 이 두 필드가 엔진에 도달해야 양도 안분 비율·환산 분모를 만들 수 있다 → **전송 게이트를 `saleSplitMode==="apportioned" || landAcqMode==="estimated" || buildingAcqMode==="estimated"`까지 확장**. 미확장 시 apportioned 모드에서 필드가 침묵 strip되어 엔진이 취득시 비율로 되돌아간다(§4-B 재발).
- **양도차익 분기(splitPair line 181-186)**: 엔진이 `saleSplitMode`를 명시 분기(§9 승격) — `"actual"`이면 파트 직접 양도가액, `"apportioned"`이면 `calcSaleApportionRatio`(양도시 비율)로 안분.

> **회귀 주의 (STEP1 #7 실측 정정)**: 기존 S1·S3 테스트 입력에는 **양도시 토지·건물 기준시가(`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`)가 없다** — 양도시 안분 비율을 만들 데이터 자체가 부재(`land-building-split.test.ts` S1·S3 실측). 따라서 "S1 무영향" 단정은 성립하지 않으며, S1의 취득시 landStd 클램핑도 양도시 기준시가 기준으로 재판정된다. Phase B에서 `apportioned` 양도 모드는 양도시 파트 기준시가 입력이 **필수**(미입력→validate 차단)이므로, S1·S3 앵커는 **그 입력을 추가한 뒤** 조문 기준으로 재계산해야 한다. **anchor 갱신은 법령 정합 우선**(memory `feedback_anchor_correction_legal_priority`) — 재계산 근거를 주석에 명기.

### 7.3 §164⑤ PHD 경로 상호작용

`calcSplitGainPreDisclosure`(line 321-390)는 3시점 알고리즘 별도 경로. **PHD는 주택 개별주택가격(토지+건물 일괄가액) 기반**이라 파트 분리와 본질적으로 상충한다.

**해소 규칙 (STEP1 H2 정정)**:
- 엔진 PHD 게이트(`split-gain.ts:165` `preHousingDisclosure && useEstimatedAcquisition`)는 §6.1 파생상 "어느 파트든 환산이면 `useEstimatedAcquisition=true`" → **혼합 모드(한쪽 실가)에서 PHD 오발동 위험.** 이를 막기 위해 PHD 활성 조건을 **양 파트 모두 환산**(`landAcqMode==="estimated" && buildingAcqMode==="estimated"`)으로 좁힌다. 파트가 섞이면 PHD 자동 트리거(취득일<2005-04-29, `CompanionAcqPurchaseBlock:108-121`) 억제 → 비-PHD 파트별 경로.
- PHD가 실제 필요(건물 취득일<2005-04-29 + 개별주택가격 미공시)하면서 파트 혼합이 동시에 필요한 시나리오는 실무 극저빈도 → **본 재설계 범위 밖(§12)**, 별도 확인.

---

## 8. UI 재설계 (`CompanionAcqPurchaseBlock` + `LandBuildingSplitSection`)

### 8.1 비분리(단일 취득일) — 현행 유지
`hasSeperateLandAcquisitionDate === false`이면 기존 "취득가액 산정 방식" 자산 전체 단일 UI 그대로. **회귀 0.**

### 8.2 분리(토지·건물 취득일 다름) — 재구성
`hasSeperateLandAcquisitionDate === true`일 때:

1. **취득가액 산정 방식**을 **토지/건물 2개 RadioCardGroup**으로 분리, 각 4방식(Q1):
   ```
   토지 취득가액:  [실거래가] [환산취득가] [감정가액] [매매사례가액]
   건물 취득가액:  [실거래가] [환산취득가] [감정가액] [매매사례가액]
   ```
   (`RadioCardGroup` 필수, native 금지 — components/calc/CLAUDE.md. `layout="inline"` 컴팩트 권장)
2. 각 파트 모드에 따라 입력 필드 조건부 노출 (UI 순서 = 엔진 계산 순서):
   - `actual` → 파트 취득가액 직접입력 칸
   - `estimated` → 파트 취득시·양도시 기준시가 칸(토지=`LandPriceLookupField`, 건물=건물 기준시가)
   - `appraisal` → 파트 감정가액 직접입력 + 취득시 기준시가(개산공제 base)
   - `salesCase` → 파트 매매사례가액 입력(RTMS 자동조회 헬퍼 재사용 가능) + 취득시 기준시가
   - **UI 복잡도 관리**: 파트별 4방식 × 조건부 필드는 넓다 → `<ToneCard>` amber 취득 섹션 안에 토지/건물 서브카드(섹션 번호 ①②)로 시각 분리(components/calc/CLAUDE.md 다-섹션 색상 카드 패턴 강제). 흔한 조합(둘 다 실가·둘 다 환산·토지 실가+건물 환산)은 라디오 기본 노출, 희소 조합(감정·매매사례)은 선택 시 관련 입력만 펼침. **E2E `data-testid` 신설**: `part-acq-mode-land`·`part-acq-mode-building`·`sale-split-mode`.
3. **양도가액 결정 방식** 독립 토글(`saleSplitMode`):
   ```
   양도가액:  [구분양도(직접입력)] [일괄양도(양도시 기준시가 안분)]
   ```
   - `actual` → 토지/건물 양도가액 직접입력
   - `apportioned` → 토지/건물 **양도시 기준시가** 입력(안분 분모) + 자동 안분 미리보기

`LandBuildingSplitSection`은 파트별 모드 prop을 받아 취득가액 칸 노출을 **파트 단위**로 결정(현재 `acqPriceMode` 자산 단일 → `landAcqMode`/`buildingAcqMode` 2축).

색상 카드 + 섹션 번호 패턴(3+ 서브섹션), `<ToneCard>`, 라벨 정본 클래스 등 components/calc/CLAUDE.md 강제 규칙 준수.

---

## 9. 14 동기화 지점 체크리스트

| # | 지점 | 위치 · 작업 |
|---|---|---|
| ① 폼 상태 | 타입 `calc-wizard-asset.ts` (AssetForm) — `landAcqMode`·`buildingAcqMode`(4-way)·`saleSplitMode`·`landSalesCaseValue`·`buildingSalesCaseValue` 추가 |
| ② initial | **`calc-wizard-asset-factory.ts:131-145`** (현행 `useEstimatedAcquisition:false`·`landSplitMode:"apportioned"` 인접) — 기본값 landAcqMode=buildingAcqMode="actual", saleSplitMode="apportioned", 매매사례가="" |
| ③ normalize | **`calc-wizard-asset-migrate.ts`** (`migrateAsset`) — `landSplitMode → saleSplitMode` 매핑 + 신규 필드 undefined/"" → 명시 기본값(sessionStorage 무손실) |
| ④ API 변환 | `transfer-tax-api.ts:314-341` — 파트별 취득 모드 매핑. **취득 6필드(land/buildingAcquisitionPrice·취득시 기준시가·매매사례가)는 land/buildingAcqMode 게이트, 양도가액 2필드(landTransferPrice·buildingTransferPrice)는 saleSplitMode 게이트. ⚠️ 양도시 기준시가(land/buildingStandardPriceAtTransfer)는 `saleSplitMode==="apportioned" \|\| 파트 estimated`까지 전송 확장**(현행 `landSplitMode==="actual"` 게이트만 — §7.2 STEP1 #2) |
| ⑤ UI 위젯 | `CompanionAcqPurchaseBlock`·`LandBuildingSplitSection` — §8 재구성 |
| ⑥ 사이드바 | `computeTransferSummary` — 파트 합계 영향 확인 |
| ⑦ 결과 카드 | `TransferTaxResultView`·`FilingFormTableFinancials` — 파트별 취득 방식 산식. **혼합(토지 실가+건물 환산) 시 파트마다 다른 산식 라인 렌더**(토지=실지취득가, 건물=환산공식) |
| ⑧ validate | `transfer-tax-validate-split.ts` — 파트별 모드 게이트, **estimated 파트 양도시 기준시가 필수 검증(§7.2 — 미입력 차단)** |
| ⑨⑩ Zod enum | `route.ts` — companion 포함 |
| ⑪ acqDate fallback | route/api — 유지 |
| ⑫ Zod 입력객체 | `route.ts:252-260` — **신규 필드 5개**(landAcqMode·buildingAcqMode·saleSplitMode·landSalesCaseValue·buildingSalesCaseValue) |
| ⑬ body spread | `callTransferTaxAPI` — 신규 5필드 통과 |
| ⑭ Route 엔진 매핑 | `route.ts` — enum 매핑 |

⑫⑬⑭는 TS 미감지 → grep 자가 점검 필수(memory `feedback_api_zod_schema_sync`).

**`saleSplitMode`의 성격 (STEP1 M2 — 설계 결정)**: 현행 `landSplitMode`는 '죽은 모드'(엔진 미독·필드 유무 판단)라 유령 값 버그를 낳았다(`transfer-tax-api.ts:153-159`). 본 재설계는 이 안티패턴을 **되풀이하지 않는다** — `saleSplitMode`를 **엔진 명시 입력으로 승격**(⑫⑬⑭ 포함, §9 표와 일치)해 양도가액 분기를 명시한다: `if (saleSplitMode === "actual") 구분양도 직접값 else calcSaleApportionRatio 안분`. 취득 파트 모드(`landAcqMode`/`buildingAcqMode`)도 엔진 `calcPartAcq`가 직접 읽으므로 동일 명시 입력. → **엔진 도달 신규 필드 5개**: `landAcqMode`·`buildingAcqMode`·`saleSplitMode`·`land/buildingSalesCaseValue`. 자산 전체 `useEstimatedAcquisition`은 §6.1 파생값(기존 필드, 신규 아님). ⚠️ 이 결정으로 §2.2의 "죽은 모드" 진단은 **현행 문제 서술**이며, 본 재설계는 그것을 명시 모드로 **교체**(존치 아님)함을 분명히 한다.

---

## 10. 단계별 구현 Phase (각 단계 verify 포함)

```
Phase 0. ✅ 완료(2026-07-28) — 케이스 매트릭스 + 열린 결정(§13) 사용자 확정
         → Q1 4방식 독립·Q2 안분 시점 정정 포함. 매트릭스 16조합(토지 4 × 건물 4).

Phase A. 엔진 파트별 취득 모드 (비-PHD)
  A0. TransferTaxInput/SplitPartResult 타입 확장 (types/transfer.types.ts): landAcqMode·buildingAcqMode·saleSplitMode·land/buildingSalesCaseValue optional + SplitPartResult.acqMode echo.
      **엔진 input/result 타입은 Phase A 소속**(폼 AssetForm은 Phase C) — anchor가 컴파일되려면 타입 선행 필수(STEP1 개선 #2).
  A1. calcSplitAcquisitionPrice 파트별 분기 리팩터 (신규 anchor는 구분양도로 → 양도 안분 무관하게 A 독립)
  A2. 개산공제·§97② swap 파트별 게이트 (swap은 estimated 파트만; appraisal·salesCase 제외)
  A3. PHD 게이트 강화 (§7.3): split-gain.ts:165 진입을 landAcqMode==="estimated" && buildingAcqMode==="estimated"로 한정 + 혼합 시 validate 안내
      → verify: 신규 anchor(#5 토지 실가+건물 환산, #6 토지 환산+건물 실가 — 둘 다 구분양도) RED→GREEN
      → verify: PHD+혼합 게이트 anchor (토지 실가+건물 환산+PHD입력 → PHD 경로 미진입)
      → verify: 기존 S1·S2·S3·S4·S5 + expropriation-phd-split GREEN 유지 (회귀 0)

Phase B. 안분 비율 시점 정정 (양도시 기준시가)
  B1. calcSaleApportionRatio 신설, 양도가액 안분에 주입
      → verify: 양도시 안분 anchor 추가, S1/S3 앵커 조문 기준 재계산·갱신
  ※ (개선 STEP1 #6) A·B 모두 calcSplitGain 단일 함수를 수술하므로 **동일 PR로 통합 가능**.
    분리 시 A의 신규 anchor와 B의 anchor 재계산이 같은 파일에서 충돌하니, 통합 시
    "취득 4-way + 양도시 안분"을 한 번에 anchor. 단 리뷰 가독성 위해 커밋은 A/B 분리 권장.

Phase C. 데이터 모델(폼 AssetForm — 엔진 타입은 A0에서 선처리) + API + Zod + Validate (①②③④⑧⑫⑬⑭)
      → verify: transfer-tax-api-split-gate.test.ts 확장, validate 테스트
      → verify: tsc 0, grep ⑫⑬⑭ 확인

Phase D. UI 재구성 (⑤⑥⑦)
  D1. CompanionAcqPurchaseBlock 분리 시 파트별 취득 방식 UI
  D2. LandBuildingSplitSection 파트별 모드
  D3. saleSplitMode 독립 토글 + 결과뷰 산식
      → verify: Playwright E2E (폼→계산→결과, Network body 신규 필드)
      → verify: ui-engine-sync-checker 8지점

Phase E. 전체 회귀 + 완료 보고
      → verify: npm test 그린, npx tsc 0, npm run lint
```

---

## 11. 회귀 방지 (허용치 0)

- 기존 `land-building-split.test.ts` S1~S5 **전부 유지**(Phase B에서 법령 정정 앵커만 조문 기준 갱신, 근거 주석 명기).
- 신규 anchor: #5(토지 실가+건물 환산), #6(토지 환산+건물 실가) — 각 파트 취득가액·개산공제·양도차익 원단위 `toBe()`.
- `split-gain-residual-symmetry`·`salescase`·`acq-cost-swap-split`·`owner-split-case12` 회귀 확인.
- **동작 변경 명시 (STEP1 M1)**: 파트별 `salesCase` 직접입력 도입은 현행 "매매사례는 항상 안분(`landAcquisitionPrice` 미독)"(`split-gain.ts:126-134`)과 다르다 — 파트별 매매사례가 입력 시 그 값 우선, 미입력 시에만 안분. `split-gain-salescase.anchor.test.ts` 기대값 재확인·근거 주석 필수.
- 비분리 케이스(`hasSeperateLandAcquisitionDate=false`) 무영향 증명 anchor.

---

## 12. 범위 밖 / 비목표 (Simplicity First)

- 단기세율 혼합(토지 누진 + 건물 단기 2년 미만 파트별 세율) — 현행 `transfer-tax-split-gain.ts:155-158` 알려진 한계 유지(실무 빈도 극히 낮음).
- 겸용주택(mixed-use) 4부분 안분 경로 — 별도 도메인, 본 재설계 미포함.
- 재개발(§166②)·부담부증여(§159)·수용 특수 블록(`ExpropriationBlock`) — 기존 게이트 유지, 파트별 혼합 모드 비적용. **단 §164⑨1호 공익수용 환산 분모 특례**(`transfer-tax-split-gain.ts:104-123`)는 §7.1대로 파트별 환산에 **연결 유지** — 환산 분모를 낮추는 특례이지 취득 모드 축이 아니므로 별개 사안.

---

## 13. 설계 결정

- **Q1. 파트별 독립 범위** — ✅ **확정: 4방식(실가·환산·감정·매매사례) 전부 토지·건물 독립** (2026-07-28).
- **Q2. 양도가액 안분 시점 정정(취득시→양도시)** — ✅ **확정: 본 재설계 포함(Phase B).** 기존 S1/S3 앵커는 조문 기준 재계산·근거 주석 명기.
- **Q3. UI 배치** (구현 시 미세 확정): 분리 시 "취득가액 산정 방식"을 토지/건물 2개 인라인 라디오 + amber 서브카드(①②) — §8. Do 단계 브라우저 확인으로 가독성 검증.
- **Q4. `landSplitMode` 하위호환** (구현 세부, 계획 확정): `migrateAsset`에서 `landSplitMode="actual" → saleSplitMode="actual"`, `="apportioned" → "apportioned"`. 취득 모드는 기존 자산 전체 4방식 플래그(`useEstimated`/`isAppraisal`/`isSalesCase`)에서 `landAcqMode=buildingAcqMode` 파생. 세션스토리지 무손실.

---

## 부록. 검증 로그 (실측 근거)

- 취득 단일 축: `CompanionAcqPurchaseBlock.tsx:137-143`, `transfer-tax-split-gain.ts:84-146`
- `landSplitMode` 죽은 모드: `transfer-tax-api.ts:153`, 게이트 `:321-338`
- 안분 시점 취득시: `transfer-tax-split-gain.ts:26-36`, 양도가액 사용 `:181-186`
- 데이터 모델 기존 필드: `calc-wizard-asset.ts:328,368-388`
- 법령: 소득세법 시행령 §166⑥ (MST 286211), 부가가치세법 시행령 §64① (MST 283641) — KoreanLaw 조회 완료 2026-07-27
- 케이스 매트릭스 현행: `land-building-split.test.ts` S1~S5 (혼합 케이스 0건)
- 양도 모드 2-레벨(중복 아님): `bundledSaleMode` 자산 간 폼-전역(`calc-wizard-store.ts:61`·`:232` default apportioned, `BundledAllocationPreview.tsx:20-21` `assets.length<2` 무효) ↔ `saleSplitMode` 자산 내 토지·건물(신규). 단건 판정 `CompanionAssetsSection.tsx:85`
