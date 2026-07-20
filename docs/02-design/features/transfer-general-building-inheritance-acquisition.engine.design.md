# 일반건물(general_building) 상속 취득가액 — 엔진 설계 문서 (STEP 5)

> 단일 소스 계획서: [`transfer-general-building-inheritance-acquisition.plan.md`](./transfer-general-building-inheritance-acquisition.plan.md)(STEP 1~4 자가검토·Q1·Q2 해소). UI 설계: [`.ui.design.md`](./transfer-general-building-inheritance-acquisition.ui.design.md)(STEP 12, Phase 1 = C1 확정).
> 본 문서는 그 §4 확정 결정을 구현하는 **엔진 input/result 타입·알고리즘·API/Route 6 동기화 지점(⑨~⑭)**. 확정 결정 재-open 금지.
> 겸용 선행: [`transfer-mixed-use-inheritance-acquisition.engine.design.md`](./transfer-mixed-use-inheritance-acquisition.engine.design.md)(PR#710) — 동일 §163⑨ 패턴.

---

## §0. ⚠️ UI 문서 §8-2 정정 — Phase 1(C1) 수정 위치 = 경로 B(actual), 환산 경로 아님

UI 설계 §8-2는 엔진 수정을 `buildGeneralBuildingAssetCards()`/`WithExtension`(환산 경로) 신규 분기로 인계했으나 **이는 부정확**하다. UI §0가 확정한 대로 **C1(토지·건물 모두 상속)은 actual 모드(경로 B)**를 탄다:
- 상속 취득 시 환산 토글(`useEstimatedAcquisition`) UI 미노출 → false → `buildGeneralBuildingValuation`이 `actualPriceMode: true` 반환(api-helpers:387) → route.ts:735 `dispatchGeneralBuilding` → `coercedGbRaw.actualPriceMode === true` 분기(general-building-route-helper.ts:314) → **`calculateGeneralBuildingActualTransfer`**(route-helper:435) 호출.
- `buildGeneralBuildingAssetCards`(general-building-valuation.ts:523)는 **환산 경로(경로 A)** 전용 — C2(토지매매+건물상속, 환산 ON)에서만 도달하며 이는 **Phase 2**(§8에서 validate 차단).

**∴ Phase 1 엔진 수정의 실제 위치 = `calculateGeneralBuildingActualTransfer`(route-helper:435~613) + `dispatchGeneralBuilding` actualPriceMode 분기(:314~338) + `GeneralBuildingActualPricePayload` 타입(:34).** general-building-valuation.ts(`GeneralBuildingInput`/`buildGeneralBuildingAssetCards`)는 Phase 1에서 **거의 손대지 않음**(echo 타입만). 이 정정은 실측 근거(위 배선 체인) — 겸용과 달리 GB는 별도 dispatch 이원(환산/actual) 구조라 함수 지목이 중요.

---

## §1. 케이스 인벤토리

| # | 토지 취득 | 건물 취득 | 모드 | 현행 결함 | Phase 1 수정 | 상태 |
|---|---|---|---|---|---|---|
| **C1** | 상속 | 상속 | actual(경로 B) | `actualAcquisitionPrice`=0(bundledAcq/fixedAcq 미충전) → 취득가 0·양도가 전액 과세 | 토지 취득가=`inheritedLandValue`·건물 취득가=`inheritedBuildingValue` 직접 배정, 개산공제 0 | ✅ Phase 1 |
| C2 | 매매 | 상속 | 환산(경로 A) | 건물 환산+개산공제 오적용 | — (validate V1 차단) | ⛔ Phase 2 |
| C2′ | 매매 | 상속 | actual(경로 B) | 건물분 `bundledAcq` 안분(상속평가액 무반영) | — (validate V1 차단) | ⛔ Phase 2 |
| C3 | 상속 | 매매/신축 | actual(경로 B) | 토지분 취득가 0 | — (validate V1 차단) | ⛔ Phase 2 |
| 비상속 | 매매/증여/신축 | 동상 | 환산/actual | 없음(정상) | 불변(회귀 격리) | ✅ 회귀 |

**Phase 1 = C1 단독**(UI §0). C2/C2′/C3(부분 상속)은 "실거래가 안분값 + 상속 직접배정"의 혼합 배선이 미설계 → validate 차단·Phase 2 이월. 개산공제 0은 actual 모드가 **이미** 전 카드 `estimatedDeduction:0`(route-helper:541·549·556·563)이므로 C1에서 자동 충족 — 별도 0 처리 불요(겸용과 다른 점: 겸용은 개산공제 명시 0 처리 필요했음).

---

## §2. 입력 타입 diff (엔진·Route·Zod)

### ⑫ Zod — `lib/api/transfer-tax-building-schemas.ts` `generalBuildingValuationSchema`(:21)
`actualPriceMode`(:45)·`bundledAcquisitionPrice`(:182) 인근에 4필드 추가(미정의 시 침묵 stripping):
```ts
acquisitionByInheritance: z.boolean().optional(),
buildingAcquisitionByInheritance: z.boolean().optional(),
inheritedLandValue: z.number().int().positive().optional(),
inheritedBuildingValue: z.number().int().positive().optional(),
```

### ⑭ Route payload — `GeneralBuildingActualPricePayload`(`general-building-route-helper.ts:34`)
actual 모드 payload 타입에 상속 4필드 + **기존 결측 3필드**(UI §8-4 load-bearing 발견 — actual 분기가 단기보유 기산점 §95④ 필드 결측) 추가:
```ts
  // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1)
  acquisitionByInheritance?: boolean;
  buildingAcquisitionByInheritance?: boolean;
  inheritedLandValue?: number;
  inheritedBuildingValue?: number;
  // §95④ 단기보유 기산점 — actual 분기 기존 결측(회귀 동반 수정)
  landAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";
  decedentAcquisitionDate?: Date;
  donorAcquisitionDate?: Date;
```

### GeneralBuildingInput (general-building-valuation.ts) — Phase 1 **불변**
C1은 `buildGeneralBuildingAssetCards`(환산 경로)를 타지 않으므로 `GeneralBuildingInput`에 상속 4필드 추가는 **Phase 2(C2)에서** 필요. Phase 1은 result echo만(아래 ⑦).

### result echo — `GeneralBuildingOutput`(general-building-valuation.ts:386~438)
결과 카드(⑦) 라벨 분기용 echo 2필드:
```ts
  /** §163⑨ 상속 취득가액 직접 산정 여부 — 토지분(결과 라벨용). */
  acquisitionByInheritance?: boolean;
  /** §163⑨ 상속 취득가액 직접 산정 여부 — 건물분. */
  buildingAcquisitionByInheritance?: boolean;
```
(`acquisition.land`/`.building`은 상속값을 그대로 담아 반환 → 별도 echo 불요. `GeneralBuildingAcquisition = {land,building}` 타입 :267 불변.)

---

## §3. 알고리즘 — `calculateGeneralBuildingActualTransfer`(route-helper:435)

현행 비-부담부증여 분기(:500~507)가 번들 `actualAcquisitionPrice`를 §166⑥ 비율(`landRatioNum`)로 안분:
```ts
landAcq = Math.floor(actualAcquisitionPrice * landRatioNum);
buildingAcq = actualAcquisitionPrice - landAcq;
landExp = Math.floor(actualExpenses * landRatioNum);
buildingExp = actualExpenses - landExp;
```

**C1 상속 분기 신규**(위 else 앞에 우선 분기):
```ts
const isC1Inheritance =
  payload.acquisitionByInheritance && payload.buildingAcquisitionByInheritance;

if (isC1Inheritance) {
  // §163⑨: 자산별 상속개시일 평가액을 취득당시 실지거래가액으로 직접 배정 (§166⑥ 안분 아님).
  // KoreanLaw: §166⑥은 "구분 불분명한 때" 안분 — 상속은 자산별 평가액 명확 → 안분 대상 아님.
  landAcq = payload.inheritedLandValue ?? 0;      // 개별공시지가×gbLandArea or 신고가 (총액, 원)
  buildingAcq = payload.inheritedBuildingValue ?? 0;
  // 필요경비(자본적지출·양도비)는 §166⑥ 비율 안분 유지 (개산공제 아님 — actual 모드는 이미 estimatedDeduction:0).
  landExp = Math.floor(actualExpenses * landRatioNum);
  buildingExp = actualExpenses - landExp;
} else if (burdenedGiftInfo) {
  ... (기존)
} else {
  ... (기존 번들 안분)
}
```
- **양도가액**(`landTransfer`/`buildingTransfer`)은 §166⑥ 안분 **유지**(:501~502 불변 — 단일 양도가의 토지:건물 구분은 불분명하므로 안분 정당, 계획서 §2).
- **개산공제**: actual 모드는 이미 전 카드 `estimatedDeduction:0`(:541·549·556·563) → C1도 자동 0. §163⑥ 미적용 정합.
- **NBL 판정**(:509~529)·**카드 생성**(:532~565)·**aggregate**(:577)는 불변 — landAcq/buildingAcq 값만 상속 직접값으로 바뀜.
- **결과 echo**(:601~610 `aggregated.generalBuildingValuationDetail`)에 `acquisitionByInheritance`·`buildingAcquisitionByInheritance` 추가.

### `dispatchGeneralBuilding` actualPriceMode 분기(:314~338) — object literal 필드 추가(⑭ 침묵 strip 방지)
```ts
if (coercedGbRaw.actualPriceMode === true) {
  return calculateGeneralBuildingActualTransfer(
    {
      ... (기존),
      acquisitionByInheritance: coercedGbRaw.acquisitionByInheritance as boolean | undefined,
      buildingAcquisitionByInheritance: coercedGbRaw.buildingAcquisitionByInheritance as boolean | undefined,
      inheritedLandValue: coercedGbRaw.inheritedLandValue as number | undefined,
      inheritedBuildingValue: coercedGbRaw.inheritedBuildingValue as number | undefined,
      landAcquisitionCause: coercedGbRaw.landAcquisitionCause as ... | undefined,
      decedentAcquisitionDate: coercedGbRaw.decedentAcquisitionDate as Date | undefined,
      donorAcquisitionDate: coercedGbRaw.donorAcquisitionDate as Date | undefined,
    },
    taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
  );
}
```
(⚠️ UI §8-4 발견: 이 분기는 명시 나열 방식 — spread 아님 → 필드 누락 시 침묵 strip. `decedentAcquisitionDate`는 `coercedGbRaw`에서 이미 Date 변환됨 :256.)

---

## §4. 14 동기화 지점 (신규 필드별 도달 경로)

| 필드 | ①폼 | ②init | ③norm | ④api-helpers | ⑤UI | ⑥사이드바 | ⑦결과 | ⑧validate | ⑫Zod | ⑬body | ⑭route |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gbBuildingInheritedValue`(폼) | asset-gb.ts | factory | migrate-p3 | :387 분기 → `inheritedBuildingValue` | 위젯(amber) | 무변경 | echo | V4 | — | — | — |
| `publishedValueAtInheritance`(재사용) | 기존 | 기존 | 기존 | :387 분기 → `inheritedLandValue` | 기존 블록 | 무변경 | echo | V3 | — | — | — |
| `inheritedLandValue`(payload) | — | — | — | api-helpers 출력 | — | — | acquisition.land | — | ⑫추가 | body | dispatch:314→calc:435 |
| `inheritedBuildingValue` | — | — | — | api-helpers 출력 | — | — | acquisition.building | — | ⑫추가 | body | dispatch:314→calc:435 |
| `acquisitionByInheritance`·`buildingAcquisitionByInheritance` | — | — | — | api-helpers 출력 | — | — | echo→라벨 | — | ⑫추가 | body | dispatch:314→calc:435 |

⑬body: `callTransferTaxAPI`가 `generalBuildingValuation` 서브객체를 그대로 spread(api-helpers → route body). ⑨⑩⑪은 GB 별도 dispatch라 단건/컴패니언 Zod enum·fallback 무관(N/A).

---

## §5. anchor 스펙 (Do에서 파일 생성 — 신규 필드 참조로 tsc 차단 회피)

`__tests__/tax-engine/transfer/general-building-inheritance-acquisition.anchor.test.ts`:
- **C1 golden**: 토지·건물 모두 상속. 입력 `inheritedLandValue`·`inheritedBuildingValue`·양도가·양도시 기준시가·gbLandArea·용도지역. 검증: `apportionment.apportioned[land].allocatedAcquisitionPrice === inheritedLandValue`·`[building] === inheritedBuildingValue`·전 카드 `estimatedDeduction===0`·양도가는 §166⑥ 안분값.
- **현행 대비**: 동일 입력에서 현행은 취득가 0(bundledAcq 미충전) → 양도차익 = 양도가 전액. golden은 취득가 = 상속평가액 → 양도차익 정상.
- **회귀**: 비상속 GB(사례31~35) 기존 anchor 전부 GREEN 유지(값 불변).
- Pre-Do P0(계획 §6): throwaway probe로 현행 "취득가 0" 실측 확정 후 golden 세액 확정.

---

## §6. 파일·800줄 정책
- 수정 파일: `general-building-route-helper.ts`(현재 613줄 — C1 분기 ~15줄 추가 시 ~630줄, 정책 내). `general-building-valuation.ts`(echo 타입 2줄). `transfer-tax-building-schemas.ts`(Zod 4줄). `transfer-tax-api-helpers.ts`(④ 분기, UI §2-④). 신규 leaf 불요(겸용 대비 훨씬 작음 — 계획 예측 부합).

## §7. Phase 2 인계 (범위 밖)
- C2(환산 경로): `GeneralBuildingInput` 상속 4필드 + `buildGeneralBuildingAssetCards` 분기(건물분만 상속 직접·토지분 환산 유지).
- C2′/C3(혼합): "실거래가 안분 + 상속 직접" 혼합 배선.
- §163⑨1·2호 미공시 max(토지 §164④·건물 §164⑤~⑦).
- 부담부증여·증축·용도변경 × 상속 조합.

---
관련: [[project_transfer_special_engine_inheritance_acquisition_bugs]] · [[transfer-mixed-use-inheritance-acquisition.engine.design.md]] · [[feedback_explicit_prop_mapping_strip]] · [[feedback_no_silent_apportion_fallback]]
