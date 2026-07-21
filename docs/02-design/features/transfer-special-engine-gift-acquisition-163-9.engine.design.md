# 엔진 설계 — 특수엔진 증여 취득가액 §163⑨ (D1=옵션 B)

> 계획서: `transfer-special-engine-gift-acquisition-163-9.plan.md` · 법령검증 §1.1(법제처 원문 MST 286211)
> 결정: **D1=옵션 B**(gift 병렬 필드·상속 코드 불변·Surgical) · **D2=상속 미러**(실비 입력·개산공제 배제·기본 0)

## 0. 설계 원칙 (옵션 B 최소구현 = B1)

- **엔진 신규 입력 필드 = 단 1개**: `acquisitionByGift?: boolean`. §163⑨ reported 값 필드(`housingInheritedValue`·`commercialInheritedValue`·`housingInheritedExpense`·`commercialInheritedExpense`)는 **generic("§60~66 신고가액")이라 재사용** — gift 값을 API에서 **동일 엔진 필드**로 매핑.
- **게이트만 OR 확장**: 엔진 소비 지점의 `asset.acquisitionByInheritance`를 `(asset.acquisitionByInheritance || asset.acquisitionByGift)`로. **resolve 함수(`transfer-tax-mixed-use-inheritance.ts`)·상속 경로 코드 전부 불변**(회귀면적 0 — 옵션 B 목적).
- **폼은 UI 분리를 위해 gift 전용 4필드 신설**(라벨이 "증여일 평가액"이어야 하므로) → API가 gift 폼값을 엔진 reported 필드로 흘려보냄.
- ∴ 신규 **엔진 input 필드 = `acquisitionByGift` 1개**(result echo 필드 **없음** — 라벨은 `acquisitionConversionRoute` enum에 gift 값 추가로 단일소스 유지). 나머지는 폼/매핑 계층.

## 1. 케이스 인벤토리 (겸용 Phase 1)

| # | 케이스 | 취득원인 | 날짜 | 미공시 | 기대 취득가액 | 개산공제 |
|---|---|---|---|---|---|---|
| G-1 | 겸용 증여·공시(비-PHD) | gift | ≥1985 | 공시 | 주택/상가 신고가액 직접(`housingInheritedValue`) | 0 (실비만) |
| G-2 | 겸용 증여·미공시 주택(PHD) | gift | ≥1985 | 주택 미공시 | max(신고가, §164⑦)(§176의2②2호) | 0 |
| G-3 | 겸용 증여·pre-1985 | gift | <1985 | — | 게이트 false → **기존 환산 fallback**(회귀-safe, §176의2④ 의제취득) | 3% |
| G-4 | 겸용 증여·신고가 미입력·공시 | gift | ≥1985 | 공시 | `acquisitionStandardPrice`(보충적평가) fallback | 0 |
| G-5 | 겸용 증여·신고가·기준시가 모두 미입력 | gift | ≥1985 | — | **validation 차단**(silent fallback 금지) | — |
| R-1(회귀) | 겸용 상속 | inheritance | — | — | 현행 불변(옵션 B) | 현행 |
| R-2(회귀) | 겸용 매매 | purchase | — | — | 현행 환산 불변 | 현행 |
| X-1(범위밖) | 증여의제(§34~§42의3) | gift* | — | — | §163⑨ 대상 아님(§1.1) — 현 UI 미도달 | — |

## 2. 엔진 input/result 타입 diff

### `lib/tax-engine/types/transfer-mixed-use.types.ts` — `MixedUseAssetInput`
```ts
// 기존(상속): acquisitionByInheritance?, housingInheritedValue?, commercialInheritedValue?,
//             housingInheritedExpense?, commercialInheritedExpense?  (:176~204) — 전부 불변.
+ /** §163⑨ 증여 취득가액 직접 산정 게이트(gift + 취득일 ≥ 1985-01-01). 상속과 배타(둘 다 true 불가).
+  *  true면 reported 필드(housingInheritedValue 등)를 상속과 동일하게 소비 — 순수 증여만(증여의제 제외, 계획 §1.1). */
+ acquisitionByGift?: boolean;
// housingInheritedValue 등 4필드는 재사용(주석에 "상속개시일 또는 증여일 신고가액"으로 보강만).
```

### 결과 라벨 단일 소스 = `calculationRoute.acquisitionConversionRoute` (신규 echo 필드 금지)
결과카드(`MixedUseResultCard.tsx:126`)는 `acqRoute === "inheritance_direct" || "inheritance_phd_max"`로 라벨 분기 — **`acquisitionConversionRoute` enum이 단일 소스**(`:123` 주석 강제). ∴ result에 `acquisitionByGift` echo 필드를 **추가하지 않고**, enum에 gift 값을 추가한다(single-source 정책 `single-source-engine-helper`·`feedback_ui_engine_dual_truth_avoidance`).
```ts
// types/transfer-mixed-use.types.ts:409-412  실제 4값 union 확장 (실측: section97_direct | phd_corrected | inheritance_direct | inheritance_phd_max)
  acquisitionConversionRoute:
    | "section97_direct" | "phd_corrected"          // 비상속(§97 직접 / PHD §164⑤) — 불변
    | "inheritance_direct" | "inheritance_phd_max"  // 상속 — 불변
+   | "gift_direct" | "gift_phd_max";               // 신규 — 증여 §163⑨ 직접/미공시 max
// inheritedAcquisitionDetail(:292·:348)은 generic(reportedValue/selected) → gift 재사용(이름 불변).
```

## 3. 엔진 알고리즘 (게이트 OR 확장 — resolve 불변)

`transfer-tax-mixed-use-helpers.ts` (상속 소비 지점 → OR):
```ts
// :246 (PHD 주택분)   if (asset.acquisitionByInheritance || asset.acquisitionByGift) { … resolveHousingInheritedAcqPhd(asset, phdResult) }
// :281 (본문 주택분)  if (asset.acquisitionByInheritance || asset.acquisitionByGift) { … resolveHousingInheritedAcqDirect(asset) }
// :500 (토지 개산공제) const landAppraisalDed = (byInheritance||byGift) ? 0 : applyRate(acqLandStd, 0.03);
// :501-503 (건물 슬롯) const buildingAppraisalDed = (byInheritance||byGift) ? (asset.housingInheritedExpense ?? 0) : applyRate(acqBuildingStd, 0.03);
```
`transfer-tax-mixed-use-commercial.ts:129`:
```ts
if (asset.acquisitionByInheritance || asset.acquisitionByGift) { … resolveCommercialInheritedAcq(asset, acqTotalStd) }
```
- **resolve 함수 3종 불변** — 이미 `asset.housingInheritedValue ?? stdCandidate` 등 generic. gift 값은 API가 이 필드에 주입.
- **route enum 설정**(`transfer-tax-mixed-use.ts:287`): 실제 else 2갈래(`usePreHousingDisclosure ? "phd_corrected" : "section97_direct"`)를 **보존**하고 gift 분기를 삽입 —
  ```ts
  const acquisitionConversionRoute =
    asset.acquisitionByInheritance
      ? (asset.usePreHousingDisclosure ? "inheritance_phd_max" : "inheritance_direct")
    : asset.acquisitionByGift
      ? (asset.usePreHousingDisclosure ? "gift_phd_max" : "gift_direct")
    : asset.usePreHousingDisclosure ? "phd_corrected"   // ⚠️ 비상속 PHD 경로 보존(누락 시 회귀)
    : "section97_direct";
  ```
  → 결과카드가 이 enum으로 "증여일 평가액" 라벨 분기(신규 result 필드 없이 단일 소스).
- **배타 불변식**: `acquisitionByInheritance`와 `acquisitionByGift`는 동시 true 불가(취득원인 단일) — API에서 상호배타 보장.

## 4. API 매핑 (`lib/calc/transfer-tax-api-mixed-use.ts:183-189`)

```ts
const isGift163_9 = primary.acquisitionCause === "gift" && (primary.acquisitionDate ?? "") >= "1985-01-01";
// 게이트 (상호배타)
acquisitionByInheritance: primary.acquisitionCause === "inheritance" && dateGate,  // 불변
acquisitionByGift: isGift163_9,
// reported 값 — 상속 OR 증여 폼값을 동일 엔진 필드로 (B1 핵심)
housingInheritedValue:
  parseAmount(primary.mixedHousingInheritedValueOverride)          // 상속
  || parseAmount(primary.mixedHousingGiftValueOverride) || undefined,  // 증여(신규 폼필드)
commercialInheritedValue:
  parseAmount(primary.mixedCommercialInheritedValueOverride)
  || parseAmount(primary.mixedCommercialGiftValueOverride) || undefined,
housingInheritedExpense:
  parseAmount(primary.mixedHousingInheritedExpense)
  || parseAmount(primary.mixedHousingGiftExpense) || undefined,
commercialInheritedExpense:
  parseAmount(primary.mixedCommercialInheritedExpense)
  || parseAmount(primary.mixedCommercialGiftExpense) || undefined,
```
- ⚠️ `||` fallback은 상속·증여가 **상호배타**(취득원인 단일)라 충돌 없음 — 한 쪽만 non-empty.

## 5. Zod (`lib/api/transfer-tax-schema-mixed-use.ts:82-86`) — ⑫ 침묵 strip 방지
```ts
  acquisitionByInheritance: z.boolean().optional(),   // 기존
+ acquisitionByGift: z.boolean().optional(),          // 신규 (누락 시 route에서 침묵 strip)
  housingInheritedValue: z.number().int().positive().optional(),      // 기존 재사용
  … (reported 4필드 기존 그대로 — gift 값도 이 필드로 도달)
```
- gift **폼 4필드**(`mixedHousingGiftValueOverride` 등)는 API에서 엔진 reported 필드로 흡수되므로 **Zod 입력 스키마엔 미추가**(엔진 input엔 안 감). route body의 `...data.mixedUse` spread(⑬)는 엔진 필드만.

## 6. Phase 2 (GB) · Phase 3 (재개발) · Phase 0 엔진측

- **Phase 2 GB**: 신규 엔진 필드 **없음**. `lib/calc/transfer-tax-validate-gb.ts:88` 가드 조건에 gift 포함:
  ```ts
  const usesDeemed = isLandInherited || isBuildingInherited
      || asset.acquisitionCause === "gift" || asset.gbBuildingAcquisitionCause === "gift";
  if (usesDeemed) { … V2: 환산·증축 조합 차단 → 실가(actual) 강제 }
  ```
  actual 경로(`general-building-route-helper.ts:558`)가 이미 gift=`actualAcquisitionPrice` 정상 → 환산 차단만으로 §163⑨ 정합.
  - ⚠️ **부분조합 주의**(fork #5): 상속 V1 가드(`validate-gb.ts:90` `isLandInherited !== isBuildingInherited`)는 상속 전용. gift 부분조합(토지=gift·건물=purchase 등)은 이 체크에 안 걸림 → gift는 actual 경로에서 `actualAcquisitionPrice`를 §166⑥ 비율로 안분(상속처럼 자산별 reported 분리 불요)하므로 **부분조합도 actual 안분으로 자연 처리**(별도 V1 가드 불요 예상) — Phase 2 Do에서 anchor로 실측 확정.
- **Phase 3 재개발**: 신규 엔진 필드 **없음**. (a) **API 선행**(`transfer-tax-api.ts:213`): 재개발+gift일 때 `isEstimated`여도 `acquisitionPrice`를 0으로 만들지 않고 reported(원조합원 `redevActualAcquisitionPrice` / 승계 `fixedAcquisitionPrice`) 유지. (b) **엔진 게이트**(`transfer-tax.ts:248`): `acquisitionCause === "inheritance"` → `"inheritance" | "gift"`, gift는 `acquisitionPrice=reported·useEstimated=false` 강제(§166③·개산공제 배제). resolve step(상속 전용 `runInheritedAcquisitionStep`)은 **미사용**(gift는 reported가 acquisitionPrice로 직접 유입).
- **Phase 0 표준·상가**: 엔진 변경 없음. 회귀 anchor만.

## 7. 14 동기화 지점 (신규 엔진 필드 `acquisitionByGift` 기준)

| # | 지점 | 처리 |
|---|---|---|
| — 엔진필드 | `acquisitionByGift`는 **폼필드 아님** — API(④)에서 `acquisitionCause`+날짜로 파생 → ①②③ N/A | 파생 |
| ① 폼타입 | `calc-wizard-asset-mixed-use.ts` gift **폼 4필드**(값·실비 override) union+default | 신규 |
| ② initial | 동 default `""` | 신규 |
| ③ normalize | migrate fallback | 신규 |
| ④ API변환 | `transfer-tax-api-mixed-use.ts` §4 매핑 | 신규 |
| ⑤ UI위젯 | `MixedUseAssetMajorStdPrice.tsx` gift 카드 (UI설계) | 신규 |
| ⑥ 사이드바 | `computeTransferSummary` 취득가액 — 엔진 result 소비라 자동 | 확인 |
| ⑦ 결과카드 | `MixedUseResultCard.tsx` "증여일 평가액" 라벨 분기 | 신규 |
| ⑧ validate | `transfer-tax-validate-mixed-use-inheritance.ts`(54줄) gift 케이스 | 신규 |
| ⑨⑩ Zod refines | 기존 refine 영향 없음 | 확인 |
| ⑪ 자산-수준 acqDate fallback | mixed-use는 route가 mixedAsset 통째 전달 → **N/A** | N/A |
| ⑫ Zod 입력 | `transfer-tax-schema-mixed-use.ts` `acquisitionByGift` | **신규(침묵strip 함정)** |
| ⑬ body spread | `route.ts:688 ...data.mixedUse` 자동 | 확인 |
| ⑭ Route 매핑 | mixed-use는 route가 mixedAsset 통째 전달 → 자동 | 확인 |

## 8. Pre-Do Anchor (§163⑨ 정합 검증)

- **A1(G-1)**: 겸용 증여 주택 신고가액 5억·상가 3억 → 취득가액 주택 5억·상가 3억 직접, 개산공제 0. (수정 전: 환산+개산공제)
- **A2(G-3)**: pre-1985 증여 → 게이트 false, 기존 환산 유지(회귀-safe).
- **A3(R-1)**: 상속 케이스 수치 **불변**(옵션 B 회귀 가드).
- 미공시(G-2): max(신고가, §164⑦) — 상속 anchor 수치 재사용 검증.

## 9. 리스크

- 엔진 reported 필드에 gift 값을 담아 필드명이 `*Inherited*`로 남음(B1 트레이드오프) — 주석으로 "상속 또는 증여 신고가액" 명확화. 의미혼동 방지가 필요하면 후속 리팩터로 옵션 A(중립 rename) 승격 가능(별건).
- 배타 불변식(상속 XOR 증여) 위반 시 `||` fallback이 상속 우선 — 취득원인이 단일이라 실제 위반 불가하나 API에서 명시.
