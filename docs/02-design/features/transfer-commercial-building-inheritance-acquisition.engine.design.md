# 상업용건물 상속 취득가액 — 엔진 설계 (§163⑨ C1)

> 계획서 [`transfer-commercial-building-inheritance-acquisition.plan.md`] Phase 1(A1) 엔진 구현 설계.
> **신규 엔진 input/result 타입 없음** — 기존 `acquisitionCause`·`inheritedAcquisition`·`useEstimatedAcquisition`만 사용. 14지점 ⑫⑬⑭ 신규 배선 불요.

## §0 수정 위치 = STEP 0.35 상속 가드 (환산 override 차단)

| | 값 |
|---|---|
| 파일 | **`lib/tax-engine/transfer-tax-commercial-step.ts`** (신규 — 800줄 정책상 `transfer-tax-helpers.ts`에서 `runCommercialBuildingStep`·`applyCommercialBuildingStep`·`CommercialBuildingStepResult` 추출. HEAD helpers 806줄 초과 → 가드 추가 시 분할. helpers는 re-export 유지) |
| 함수 | `applyCommercialBuildingStep`(신규파일) — early-return 후 상속 가드 |
| 신규 result 필드 | **없음** |
| 신규 input 필드 | **없음** (acquisitionCause 기존) |

> Do deviation 환류: 구현 중 800줄 정책(helpers 806→800↓)으로 STEP 0.35 함수 2개+타입을 `transfer-tax-commercial-step.ts`로 추출(behavior-preserving — HEAD 대비 `runCommercialBuildingStep` byte-identical·`applyCommercialBuildingStep`은 상속 가드만 추가). helpers.ts는 호환 re-export. 아래 "helpers.ts:783/721" 등 라인 참조는 추출 전 기준.

## §1 현행 파이프라인 (실측)

```
calculateTransferTax (transfer-tax.ts)
  STEP 0.45 (:126) runInheritedAcquisitionStep(rawInput, input, ...)
     → rawInput.inheritedAcquisition 있으면 calcPostDeemed → acquisitionPrice = 상속개시일 평가액(reportedValue)
     → input = updatedInput  (input.acquisitionPrice = 상속평가액)          ← ①
  ...
  STEP 0.35 (:325) applyCommercialBuildingStep(effectiveInput)
     게이트: propertyType==="commercial_building" && useEstimatedAcquisition  ← acquisitionCause 무검사 ★버그
     발동 시: effectiveInput = { ...input, useEstimatedAcquisition:false,
              acquisitionPrice: 환산총액, expenses: 개산공제, ... }             ← ② ①을 파괴
  STEP 2 (:336) calcTransferGain(effectiveInput)
     → gain = transferPrice − acquisitionPrice − expenses
```

∴ 상속(①)이 환산(②)에 덮여 §163⑨ 위반. probe: gain 401,256,740 (정합 240,000,000).

## §2 수정 로직

`applyCommercialBuildingStep`(:783) — early-return(propertyType/useEstimatedAcquisition 체크) **직후**, `runCommercialBuildingStep` 호출 **전**:

```ts
if (input.propertyType !== "commercial_building" || !input.useEstimatedAcquisition) {
  return { effectiveInput: input, cbStep: undefined };
}
// §163⑨: 상속·증여 취득 상가는 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 본다.
// STEP 0.45가 이미 acquisitionPrice에 상속평가액을 세팅함. 환산(§176조의2②2호)·개산공제(§163⑥) 미적용.
if (input.acquisitionCause === "inheritance") {
  return { effectiveInput: { ...input, useEstimatedAcquisition: false }, cbStep: undefined };
}
const cbStep = runCommercialBuildingStep(input);
...
```

**왜 `useEstimatedAcquisition: false` 필수**: STEP 0.35만 건너뛰고 플래그를 true로 두면 `calcTransferGain`의 estimated 분기가 generic 환산식(`transferPrice × standardPriceAtAcquisition / standardPriceAtTransfer`)으로 진입해 STEP 0.45의 `acquisitionPrice`(상속평가액)를 무시한다. false로 내려 실가 경로 → `input.acquisitionPrice`(상속평가액) 직접 차감.

`runCommercialBuildingStep`(:718) 직접 가드 **불요**: 호출부는 `applyCommercialBuildingStep`(:786) 1곳뿐(전수 grep — `expropriation-scope.ts:82·89`는 주석 참조). outer 가드로 상속은 애초 도달 불가 → Simplicity First(불가능 시나리오 방어 금지).

## §3 데이터 흐름 (수정 후, A1)

```
상속 상가 (post-disclosure), 양도 540M, 상속개시일 평가액 300M, 환산 payload 존재+useEstimatedAcquisition=true
  STEP 0.45 → acquisitionPrice = 300,000,000
  STEP 0.35 → acquisitionCause==="inheritance" → { ...input, useEstimatedAcquisition:false }, cbStep=undefined
  STEP 2   → gain = 540,000,000 − 300,000,000 − 0(expenses) = 240,000,000  ✓
  결과: commercialBuildingValuationDetail = undefined (cbStep 없음) → CB카드 미렌더
        inheritedAcquisitionDetail.acquisitionPrice = 300,000,000 → InheritedAcquisitionDetailCard 렌더
        표시=계산 일치 (드리프트 해소)
```

## §4 expenses 취급

- 상속(실지거래가액 의제) → 개산공제(§163⑥, 환산 전용) **미적용**.
- 사용자 입력 자본적지출·양도비(capitalExpenditure/transferExpense)는 실가 경비로 그대로 차감(§163③⑤). 가드에서 이 필드를 **건드리지 않음**(비-상속 CB override는 clear하지만, 상속은 실가이므로 보존).
- §97②2호 swap(환산 vs 나목)은 `useEstimatedAcquisition=false`이므로 미발동(swap은 환산 전용) — 정합.

## §5 회귀 불변 보장

- B(매매·증여·신축 환산): acquisitionCause≠"inheritance" → 가드 미발동 → `runCommercialBuildingStep` 정상 → 환산 유지. `commercial-building-case-29.test.ts` 전건 GREEN 예상.
- C(실가): useEstimatedAcquisition=false → early-return(가드 도달 전) → 불변.
- 부담부증여 상가(`burdened-gift-commercial.test.ts`): acquisitionCause는 gift/transferType=burdened_gift → "inheritance" 아님 → 불변.

## §6 anchor (pre-do)

`__tests__/tax-engine/transfer-tax/commercial-building-inheritance-acquisition.anchor.test.ts`:
- makeCase29Input({ acquisitionCause:"inheritance", inheritedAcquisition:{inheritanceDate:2017-09-15, assetKind:"land", reportedValue:300_000_000, reportedMethod:"supplementary"} }) (환산 ON 유지)
- 기대: `transferGain === 240_000_000`, `commercialBuildingValuationDetail === undefined`, `inheritedAcquisitionDetail.acquisitionPrice === 300_000_000`, `usedEstimatedAcquisition === false`.
- 대조(B 불변): makeCase29Input() 원본 → `calculatedTax === 85_844_292`, `commercialBuildingValuationDetail.estimatedAcquisitionTotal === 135_155_041`.
- 개산공제 0: 상속 경로 결과에 개산공제 항목 부재/0.
