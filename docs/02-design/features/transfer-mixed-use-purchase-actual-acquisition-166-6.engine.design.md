# 엔진 설계 — 겸용주택 매매 취득 실거래가 §166⑥ 안분 (R1)

> 계획서: `transfer-mixed-use-purchase-actual-acquisition-166-6.plan.md`
> 규모: **대**(엔진 input 신규 필드). 상속·증여 §163⑨ 시리즈와 동형 구조(배타 게이트·route enum·개산공제 배제).
> ✅ **KoreanLaw 검증 완료(2026-07-21)**: 안분 근거 = **법 §100② 본칙**("취득/양도 당시 기준시가 고려 안분")·소령 §164(기준시가)·§166⑥→부가세법§64①(토지·건물 구분). 실가 원칙 = 법 §97①·§100², 환산=추계(법 §114⑦·소령 §176의2). 초안 §166⑥ 인용을 §100²로 정정(계획 §1). Do 법령 차단 해제.

## 0. 설계 원칙 (최소 침습 = 상속·증여 §163⑨ 패턴 재사용)

- **엔진 신규 입력 = 2필드**: `acquisitionActualTotalPrice?: number`(겸용 총 취득 실거래가) + `useActualAcquisition?: boolean`(게이트). 상속·증여처럼 게이트로만 분기, 안분 로직은 재사용.
- **배타 불변식(강제)**: `acquisitionByInheritance` XOR `acquisitionByGift` XOR `useActualAcquisition` — 셋 중 최대 1개 true(취득원인 단일). API에서 보장. 셋 다 false = 기존 환산(회귀 0).
- **결과 라벨 단일 소스**: `acquisitionConversionRoute` enum에 `section97_actual` 추가(신규 result echo 필드 금지 — `feedback_ui_engine_dual_truth_avoidance`).
- **개산공제 배제**: 실가 경로는 §163⑥ 3% 미적용(상속·증여 `usesDeemedAcq` 게이트에 실가 포함).

## 1. 케이스 인벤토리

| # | 케이스 | 게이트 | 취득가액 | 개산공제 | route |
|---|---|---|---|---|---|
| P-1 | 겸용 매매·실거래가 확인 | useActualAcquisition | 총 실거래가 → 주택분/상가분(취득시비율) → 토지/건물(취득시비율) | 0(실비만) | `section97_actual` |
| P-2 | 겸용 매매·실거래가 미확인(환산) | 없음(기존) | 환산(`calculateEstimatedAcquisitionPrice`) | 3% | `section97_direct`/`phd_corrected` |
| R-1(회귀) | 겸용 상속 §163⑨ | acquisitionByInheritance | 상속개시일 평가액 | 0 | `inheritance_*` |
| R-2(회귀) | 겸용 증여 §163⑨ | acquisitionByGift | 증여일 평가액 | 0 | `gift_*` |
| X-1(가드) | 실가 + 공익수용(§164⑨) | useActual+public_expropriation | — | — | **throw**(commercial.ts:66 미러 — 실가는 환산 분모 개념 없음) |
| X-2(가드) | 실가 + Case A 4부분(house_to_commercial+PHD) | useActual+fourPart | — | — | **초기 미지원 가드**(Design 확정) |

## 2. 엔진 input/result 타입 diff

### `lib/tax-engine/types/transfer-mixed-use.types.ts` — `MixedUseAssetInput`
```ts
// 기존 §163⑨: acquisitionByInheritance?, acquisitionByGift?, housingInheritedValue? 등 — 불변.
+ /** 겸용 매매 취득 실거래가 직접 사용 게이트(§97①1호가목). 상속·증여와 상호배타. */
+ useActualAcquisition?: boolean;
+ /** 겸용 총 취득 실거래가(원) — useActualAcquisition=true일 때만. 법 §100② 취득시 기준시가 비율로 주택분/상가분·토지/건물 안분. */
+ acquisitionActualTotalPrice?: number;
+ /** (D 결정) 실가 경로 실제 필요경비 — 주택분/상가분 자본적지출·양도비. 미정 시 상속 *InheritedExpense 슬롯 재사용 검토. */
```

### route enum (`types/transfer-mixed-use.types.ts:409` union)
```ts
  acquisitionConversionRoute:
    | "section97_direct" | "phd_corrected"
    | "inheritance_direct" | "inheritance_phd_max"
    | "gift_direct" | "gift_phd_max"
+   | "section97_actual";   // 신규 — 매매 실거래가 §100② 직접 안분
```

## 3. 알고리즘 (법 §100② 안분 — 신규 `apportionAcquisitionPrice`)

**신규 헬퍼** `transfer-tax-mixed-use-helpers.ts` (기존 `apportionTransferPrice`:100의 취득시 미러):
```ts
// apportionTransferPrice는 asset.transferStandardPrice(양도시) 하드코딩 → 취득시 버전 신설.
// stdPrice source·derived만 다르고 구조 동일 → 공통화(source 매개변수) 또는 별도 함수.
export function apportionAcquisitionPrice(
  totalAcqPrice: number, asset: MixedUseAssetInput, acqDerived: MixedUseDerivedAreas,
): { housingRatio: number; housingAcqPrice: number; commercialAcqPrice: number } {
  const housingStd = asset.acquisitionStandardPrice.housingPrice;
  const commLand = Math.floor(asset.acquisitionStandardPrice.landPricePerSqm * acqDerived.commercialLandArea);
  const commStd = commLand + asset.acquisitionStandardPrice.commercialBuildingPrice;
  const total = housingStd + commStd;
  const housingRatio = total > 0 ? housingStd / total : 0.5;
  const housingAcqPrice = Math.floor(totalAcqPrice * housingRatio);
  return { housingRatio, housingAcqPrice, commercialAcqPrice: totalAcqPrice - housingAcqPrice }; // 잔액흡수
}
```

**호출 위치·threading(오케스트레이터 레벨 — apportionTransferPrice 미러)**:
- `transfer-tax-mixed-use.ts`에서 `apportionTransferPrice`(:86, 총 양도가→주택분/상가분)와 **대칭**으로, `useActualAcquisition`일 때 `apportionAcquisitionPrice(asset.acquisitionActualTotalPrice, asset, acqDerived)`를 **1회 호출** → `{housingAcqPrice, commercialAcqPrice}`.
- 이 두 값을 각 part 빌더로 **신규 optional 파라미터**로 전달(양도가액이 `housingTransferPrice`/`commercialTransferPrice`로 전달되는 것과 동형):
  - 주택분 `buildHousingPart`/estimated 헬퍼(helpers.ts:326 `calculateEstimatedAcquisitionPrice` 자리): `actualHousingAcqPrice` 있으면 그 값, 없으면 환산.
  - 상가분 `calcCommercialGainSplit`(신규 `actualCommercialAcqPrice?` param, commercial.ts:134 else 대체): 있으면 그 값, 없으면 환산.
- 이후 토지/건물 안분(commercial.ts:148-150 `landAcqPrice = floor(estimatedAcqPrice × acqLandRatio)`)은 **그대로**(주입된 실가값만 사용).
- 개산공제(commercial.ts:153 `usesDeemedAcq`, helpers.ts:503): `usesDeemedAcq = byInheritance || byGift || useActualAcquisition`.
- ⚠️ **배선 순서**: apportionAcquisitionPrice는 `acqDerived`(취득시 면적) 필요 — 오케스트레이터에서 이미 계산됨(helpers `acqDerived`). part 함수 시그니처에 optional param 추가 → 기존 호출부(상속·증여·환산) 영향 0(undefined 시 기존 경로).

**불변식**: `housingAcqPrice + commercialAcqPrice === totalAcqPrice`(floor 잔액흡수), `landAcqPrice + buildingAcqPrice === part총액`.

## 4. house_to_commercial 취득시 상가면적 (계획 §3.1 ⚠️)

commercial.ts:101-104: house_to_commercial 시 `acqDerived.commercialLandArea = 0`(취득시 전체 주택) → 취득시 상가부수토지 = 0. 이 경우 `apportionAcquisitionPrice`의 commStd에 토지분 0 → 취득시 상가는 건물만. **취득시 전체 주택이면 상가분 취득가액 = 0이 자연스러움**(취득시 상가 미존재). Design 확정: house_to_commercial 실가 모드는 P-2(환산)와 동일하게 `landAreaForUserInput` 특례 적용, 실가 안분 시 취득시 실제 용도 기준. → **초기엔 house_to_commercial + 실가 미지원 가드**(X-2와 함께), 순수 겸용(용도변경 없음) 실가만 Phase 1.

## 5. API (`lib/calc/transfer-tax-api-mixed-use.ts`)

```ts
const isMixedActual = primary.acquisitionCause === "purchase"
  && !primary.useEstimatedAcquisition && !primary.isAppraisalAcquisition && !primary.isSalesCaseAcquisition;
// 배타: 상속·증여 게이트가 이미 false(취득원인 purchase)라 자동 배타.
useActualAcquisition: isMixedActual,
acquisitionActualTotalPrice: isMixedActual ? parseAmount(primary.fixedAcquisitionPrice) || undefined : undefined,
```
- ⑫ Zod(`transfer-tax-schema-mixed-use.ts`): `useActualAcquisition: z.boolean().optional()` + `acquisitionActualTotalPrice: z.number().int().positive().optional()` (침묵 strip 방지).

## 6. 14 동기화 지점

①폼: 기존 `fixedAcquisitionPrice`(신규 폼필드 불요 — 매매 실거래가 재사용) ②initial N/A ③migrate N/A ④API §5 ⑤UI(hint 명확화·CompanionAcqPurchaseBlock) ⑥사이드바=자동(엔진 result estimatedAcquisitionPrice 슬롯, plan §4) ⑦결과카드 route enum `section97_actual` 라벨 ⑧validate(실가+취득기준시가 필수) ⑨⑩refine 영향無 ⑪N/A(route 통째 전달) ⑫Zod 2필드(**침묵strip 함정**) ⑬body spread 자동 ⑭route 매핑 자동.

## 7. Pre-Do Anchor (계획 §5)

- A1(P-1): 총 취득실가 X, 취득시 주택기준시가:상가기준시가 = r → 주택분=floor(X·r)·상가분=X−주택분, 각 토지/건물 안분, 개산공제 0. 원단위 `toBe()`.
- A2(P-2 회귀): 실가 미선택 → 환산값 불변.
- A3(R-1·R-2 회귀): 상속·증여 수치 불변.
- 가드: X-1(공익수용 throw)·X-2(Case A/house_to_commercial 미지원).

## 8. 리스크

- ✅KoreanLaw R-A 해소(§1·계획 §1): 근거 법 §100② 본칙 확정. 잔여 Do-게이트는 D(필요경비)·R-D(범위 가드)뿐.
- result 슬롯 naming(`estimatedAcquisitionPrice`에 실가) — B1 트레이드오프(route enum 단일소스로 표시 정합). 후속 rename 별건.
- 필요경비(D) 미확정 — 초기엔 개산공제 0·실비 미입력(0)으로 최소 출시 후 실비 입력 후속 검토 가능.
