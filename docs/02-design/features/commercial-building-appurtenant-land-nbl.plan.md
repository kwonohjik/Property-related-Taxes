# 상업용건물·오피스텔(CB) 부수토지 기준면적 초과분 비사업용 중과 — 구현 계획

- **작성일**: 2026-08-05 (rev.3 — Phase 0-1 완료 반영, §10)
- **브랜치**: `worktree-commercial-building-appurtenant-land` (워크트리 — master는 별건 작업 중)
- **채택 설계**: **안 B-2** (§5.2) — 배율 판정 공용 헬퍼 추출 + 기존 부분중과 비율 주입
- **발단**: 세무 교재 발췌 — "상업용 건물의 부수토지는 각 용도지역별 배율이 규정되어 있어 규모 이내의 부수토지는 일반적인 양도소득세 계산과정에 따라 산출되지만 규모를 초과하는 면적에 대해서는 별도로 구분하여 비사업용토지로 중과 계산한다."
- **선행 작업**: 「지방세법 시행령」 §101② 배율표 정본 통일 (별도 브랜치, 미머지). 이 계획은 그 정본(`lib/tax-engine/local-tax-zone-multiplier.ts`)을 전제한다 — **머지 선행 필요**.

---

## 0. 사전 검증 결과 — 착수 전에 읽을 것

**결론: 법령상 누락은 사실이나, 교재가 말한 실무 케이스는 이미 GB 경로에서 처리되고 있다. CB에 넣는 것의 실익은 좁고, 미확정 법령 쟁점(§2.3)과 계산방식 이원화 쟁점(§3.3)이 있다.**

### 0.1 `commercial_building`의 실제 적용 범위

UI 안내 문구가 범위를 명시한다 (`components/calc/transfer/asset-sections/AssetSectionBasic.tsx:157-160`):

> ※ 기준시가 공시된 것 — 국세청이 호별 ㎡당 기준시가를 고시한 상업용건물·오피스텔(**수도권·5대 광역시 3,000㎡ 이상 또는 100호 이상 구분소유 건물 / 구분소유된 오피스텔**)에 한합니다.

즉 CB는 **국세청 호별고시 대상 구분소유 집합건물 전용**이다(「소득세법 시행령」 §164⑥ 고시 대상).

반면 같은 화면의 `general_building`은 (`:164-167`):

> ※ 토지와 건물을 일괄 양도하는 일반건물 — **근린생활시설·단독건물** 등.

⇒ **교재가 말하는 "상업용 건물"(단독 소유 근린상가 등)은 이 앱에서 `general_building`으로 입력된다.** 그리고 GB 경로에는 배율 판정과 초과분 분할 중과가 **이미 구현되어 있다**:

| 위치 | 내용 |
|---|---|
| `lib/tax-engine/general-building-valuation.ts:653` | `getBuildingSiteMultiplier(input.zoneType)` — §101② 배율 조회 |
| `:639-643` | `isUnregistered` → 배율 무관 전량 비사업용 (§101① 단서) |
| `:663-664` | `allowedLandArea = buildingFootprintArea × multiplier` / 초과 판정 |
| `:668-671` | `nonBusinessArea` · `nonBusinessRatio` 산출 |
| `:677-745` | 토지 카드 2장 분할(`land_business` / `land_nbl`) — 초과분만 중과 |
| `lib/tax-engine/general-building-extension.ts:220` | 증축 GB 동일 |
| `app/api/calc/transfer/general-building-route-helper.ts:598` | 실거래가 모드 GB 동일 |
| `__tests__/tax-engine/non-business-land/building-site-multiplier.anchor.test.ts` | 배율·경로 anchor |

### 0.2 그렇다면 CB에 무엇이 없는가

| 항목 | GB | CB |
|---|---|---|
| 정착면적(바닥면적) 입력 | `buildingFootprintArea` (`lib/api/transfer-tax-building-schemas.ts:27`) | **없음** — 전용/공유/대지면적만 |
| 용도지역 입력 | `zoneType` (`:29`) | **없음** |
| 미허가 플래그 | `isUnregistered` (`:33`) | **없음** |
| 배율 판정 | ✅ | **없음** |
| 초과분 중과 | ✅ 카드 2장 분할 | **없음** |

CB 입력 필드는 `lib/stores/calc-wizard-asset-cb.ts:19·21·32` — `cbExclusiveArea`(전용), `cbSharedArea`(공유), `cbLandArea`(대지). 엔진은 `lib/tax-engine/transfer-tax-commercial-step.ts:51-114`가 단건 파이프라인 STEP으로 환산취득가·개산공제만 계산하며, 자산 분할 개념이 없다.

### 0.3 실익 평가 — 구분소유에서 배율 초과가 나오는가

배율 초과는 `대지권 지분면적 > 바닥면적 × 배율`일 때만 발생한다. 구분소유 집합건물은 용적률이 높아 호당 대지 지분이 작으므로 일반적으로 초과하지 않는다. 다만 **저층 대형 구분소유 상가**(예: 단층·2층 상가를 100호로 구분소유)는 이론적으로 초과할 수 있다.

> ⚠️ **미실측**: 실제 발생 빈도를 뒷받침할 사례·통계를 확인하지 못했다. "드물다"는 용적률 산술에 근거한 추론이며 단정하지 않는다. Phase 0-2에서 사례를 찾되, **착수 블로커로는 두지 않는다**(rev.2 — 안 B 채택 지시 반영).

---

## 1. 목표

`assetKind === "commercial_building"` 자산의 부수토지 중 「지방세법 시행령」 §101① 기준면적을 초과하는 면적을 비사업용 토지로 구분해 중과 세율을 적용한다.

**비목표**
- GB 경로 재설계 — 단, §5.2에 따라 **배율 판정 로직만 공용 헬퍼로 추출**(동작 불변, 회귀 anchor로 보장)
- 겸용주택(mixed-use) 상가분 토지 (별도 경로 — `transfer-tax-mixed-use.ts`)
- 「지방세법 시행령」 §102 분리과세(공장입지기준면적) 판정
- NBL 엔진 `building_site` 경로 정정 (별건 A-BS-1 — §3.5 참조)

---

## 2. 법령 근거

### 2.1 위임 체인

```
「소득세법」 §104의3①4호나목
  → 「지방세법」 §106①2호 (별도합산과세대상)
    → 「지방세법 시행령」 §101①2호 (건축물 부속토지 = 바닥면적 × §101② 적용배율)
    → 「지방세법 시행령」 §101②  (용도지역별 적용배율 표)
```

체인 상단(「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호)은 기존 anchor의 KoreanLaw 실측분을 인용한다 (`__tests__/tax-engine/non-business-land/building-site-multiplier.anchor.test.ts` 헤더 — MST 소득세법 280405 · 소득세법 시행령 286211, 시행 2026-07-01). 「소득세법 시행령」 §168의11은 §104의3①4호**다목** 위임(체육시설·주차장 등)이며 건물 부속토지 일반 규정이 없다.

### 2.2 §101 원문 (KoreanLaw 실측 — MST 287223, 시행 2026-07-01, 2026-08-05 조회)

> ① 법 제106조제1항제2호가목에서 "공장용 건축물의 부속토지 등 대통령령으로 정하는 건축물의 부속토지"란 다음 각 호의 어느 하나에 해당하는 건축물의 부속토지를 말한다. **다만, 「건축법」 등 관계 법령에 따라 허가 등을 받아야 할 건축물로서 허가 등을 받지 아니한 건축물 또는 사용승인을 받아야 할 건축물로서 사용승인(임시사용승인을 포함한다)을 받지 아니하고 사용 중인 건축물의 부속토지는 제외한다.**
>
> 1. 특별시·광역시(군 지역은 제외한다)·특별자치시·특별자치도 및 시지역(**가.** 읍·면지역 **나.** 「산업입지 및 개발에 관한 법률」에 따라 지정된 산업단지 **다.** 「국토의 계획 및 이용에 관한 법률」에 따라 지정된 공업지역 — 은 제외한다)의 **공장용 건축물**의 부속토지로서 공장용 건축물의 바닥면적(건축물 외의 시설의 경우에는 그 수평투영면적을 말한다)에 제2항에 따른 용도지역별 적용배율을 곱하여 산정한 범위의 토지
>
> 2. 건축물(제1호에 따른 공장용 건축물은 제외한다)의 부속토지 중 다음 각 목의 어느 하나에 해당하는 건축물의 부속토지를 제외한 건축물의 부속토지로서 **건축물의 바닥면적**(건축물 외의 시설의 경우에는 그 수평투영면적을 말한다)에 **제2항에 따른 용도지역별 적용배율**을 곱하여 산정한 면적 범위의 토지
>    **가.** 법 제106조제1항제3호다목에 따른 토지 안의 건축물의 부속토지
>    **나.** 건축물의 시가표준액이 해당 부속토지의 시가표준액의 100분의 2에 미달하는 건축물의 부속토지 중 그 건축물의 바닥면적을 제외한 부속토지
>
> ② 제1항에 적용할 용도지역별 적용배율은 다음과 같다.

| 구분 | 용도지역별 | 적용배율 |
|---|---|---|
| 도시지역 | 1. 전용주거지역 | 5배 |
| 도시지역 | 2. 준주거지역·상업지역 | 3배 |
| 도시지역 | 3. 일반주거지역·공업지역 | 4배 |
| 도시지역 | 4. 녹지지역 | 7배 |
| 도시지역 | 5. 미계획지역 | 4배 |
| — | 도시지역 외의 용도지역 | 7배 |

> ⚠️ **제2항에는 호(號)가 없다.** 표 안의 1~5는 도시지역 세부 구분이다.

### 2.3 ✅ 해소 — 구분소유 건물의 "바닥면적" → **안 ㉮ 채택** (Phase 0-1 완료, 2026-08-05)

§101①2호는 "**건축물의** 바닥면적"이라고만 하고 **구분소유에 대한 안분 규정을 두지 않는다**(§101 전문 실측 — 해당 문구 없음).

CB는 호(戶) 단위 양도인데, 판정 기준을 무엇으로 볼지 세 해석이 가능했다:

| 안 | 기준면적 | 비교 대상 | 판정 |
|---|---|---|---|
| **㉮ 전체-후-안분** | 건물 전체 바닥면적 × 배율 × 대지권 지분율 | 해당 호 대지권 지분면적 | **채택** |
| ㉯ 호별 직접 | 해당 호 전용면적 × 배율 | 해당 호 대지권 지분면적 | 기각 |
| ㉰ 판정 자체 부인 | — | — | 기각 |

#### 검색 결과 — 직접 해소 근거 **0건** (법제처 Open API 실측, 2026-08-05)

| 대상 | 쿼리 | 결과 |
|---|---|---|
| `expc` 법령해석례 (제목) | "적용배율" | 0건 |
| `expc` 법령해석례 (제목) | "별도합산" | 2건 — §101① 단서 건(아래 §2.4)·§131① 멸실 건. **구분소유 무관** |
| `expc` 법령해석례 (제목) | "구분소유" | 5건 — 공항소음법·도시정비법·건축물대장 규칙. **§101② 무관** |
| `prec` 판례 (제목) | "별도합산과세대상" | 58건 — 구분소유 배율 안분 쟁점 **없음** |
| `prec` 판례 (제목) | "대지권" | 216건 — 주택 부수토지 배율(§154③)·집합건물법 분리처분. **§101② 무관** |
| `detc` (제목) | "부속토지" | 0건 |
| `decc` 행정심판 (본문) | "별도합산 적용배율" | 4건 — 지방세정정신청 등 **무관** |
| 조세심판원 | — | 법제처 DRF API에 **target 없음** (§9 별건 참조) |

#### ㉮ 채택 근거 (문언·체계 해석)

1. **문언** — §101①2호는 "**건축물의** 바닥면적"이라 한다. 집합건물에서 "건축물"은 전체 1동이며, ㉯는 이를 "전유부분 면적"으로 바꿔 읽는 것이라 문언에 반한다. 「건축법」상 바닥면적도 동(棟) 단위 개념이다.
2. **과세단위 정합** — 재산세·양도세 모두 인별 과세이고 각 구분소유자는 **대지권 지분만** 소유한다. 전체 기준면적을 산정한 뒤 지분비율로 안분해야 "그 사람이 가진 부속토지"와 "그에 대응하는 기준면적"이 같은 축으로 비교된다.
3. **입법취지** — 별도합산 제도는 "해당 토지가 **정상적인 경제활동**에 활용된다는 전제 아래 일정 범위의 건축물 부속토지"에 낮은 누진세율을 적용하려는 것이다(헌재 2010.12.28. 2009헌바145 — 법제처 해석례 25-0823이 인용). 건물 단위 판정을 전제한 취지다.
4. **㉰ 기각** — §101①2호는 건축물의 종류·소유형태를 제한하지 않으므로 구분소유를 적용 대상에서 배제할 근거가 없다.

> ⚠️ **직접 판례·해석례가 아닌 문언·체계 해석이다.** 실무 적용 시 재확인할 것. 반대해석(㉯)이 제기되면 초과분 면적이 달라진다.
>
> ㉮의 **입력 부담**: 사용자가 "건물 전체 바닥면적"과 "대지권 지분율"을 알아야 한다. 등기부·건축물대장에서 확인 가능하나 CB 폼에 현재 없는 값이다 → Phase D 입력 설계에 반영(R-7 — 기존 `building-register-*` 조회 자산 활용 검토).

### 2.4 ✅ §101① 단서의 범위 — 법제처 해석례 25-0823 (2026.02.03, 일련번호 342727)

> **회답**: 「건축법」 제11조 건축허가·제22조 사용승인을 받은 뒤 ①**용도변경 허가**(§19②1호)를 받지 않거나 ②그에 따른 **사용승인**(§19⑤ 본문·§22)을 받지 않고 용도를 변경해 사용 중인 경우, **용도변경 이후 도래하는 과세기준일을 기점으로** 그 건축물의 부속토지는 §101①**단서**에 따라 별도합산과세대상에서 **제외된다**.
>
> 이유 요약: 단서가 "허가 등"·"사용승인"을 건축허가·준공 사용승인으로 **한정하지 않는다**. 불법 용도변경도 "용도변경을 기점으로 건축물을 불법 사용"한다는 점에서 차이가 없고, 세제 혜택을 주면 조세공평에 반한다. (인용: 헌재 2009헌바145 · 조심2023지4424 · 조심2018지0661)

**함의**:
- 계획서 C-6의 직접 근거.
- 🔴 **기존 GB 구현의 개선점** — `general-building-valuation.ts:632`는 이 분기를 "**무허가건축물**"로만 라벨링하고 입력 필드도 `isUnregistered`다. 해석례에 따르면 **불법 용도변경·사용승인 미이행**도 같은 취급이므로, 필드 의미·UI 문구가 좁다. Phase A(헬퍼 추출) 시 함께 정리한다(C-6b).

---

## 3. 현행 구현 실측

### 3.1 CB 파이프라인

| 단계 | 위치 | 내용 |
|---|---|---|
| UI | `components/calc/transfer/CommercialBuildingBlock.tsx` (450줄) | cbEra·전용/공유면적·대지면적·시점별 기준시가 |
| Store | `lib/stores/calc-wizard-asset-cb.ts` (`:19`·`:21`·`:32`) | `cbExclusiveArea` / `cbSharedArea` / `cbLandArea` |
| Validate | `lib/calc/transfer-tax-validate-asset.ts:156` | CB 환산 전용 검증 |
| API 변환 | `lib/calc/transfer-tax-api-helpers.ts:125` `buildCommercialBuildingValuation` | AssetForm cb* → 서브객체 |
| Zod | `lib/api/transfer-tax-building-schemas.ts:256-292` | `commercialBuildingValuationSchema` |
| Refine | `lib/api/transfer-tax-schema-refines.ts:192-245` | era별 필수 필드 |
| Route | `app/api/calc/transfer/engine-input.ts:322` | `commercialBuildingValuation` 통과 |
| 엔진 | `lib/tax-engine/transfer-tax-commercial-step.ts:51-114` | 환산취득가·개산공제 |
| 엔진 | `lib/tax-engine/commercial-building-valuation.ts` (449줄) | §164⑥ 환산 산식 |
| 결과 | `lib/tax-engine/transfer-tax-finalize.ts:529` | `commercialBuildingValuationDetail` |

### 3.2 ★ STEP 실행 순서 (실측 — rev.2 정정)

`lib/tax-engine/transfer-tax.ts`:

| 코드 위치 | STEP | 내용 |
|---|---|---|
| `:180` | STEP 0.6 | `runNonBusinessLandStep(...)` → `effectiveInput`에 `isNonBusinessLand`·`nonBusinessLandAreaRatio` 주입 |
| `:249` | STEP 0.35 | `applyCommercialBuildingStep(effectiveInput)` → 환산·swap 재구성 |

> ⚠️ **STEP 이름 순서와 코드 실행 순서가 다르다.** "STEP 0.35"라는 이름과 달리 NBL 판정(`:180`)이 **먼저** 실행되고 CB 환산(`:249`)이 나중이다.
>
> ✅ **이 순서는 안 B에 유리하다** — `applyCommercialBuildingStep`이 `{...input, useEstimatedAcquisition:false, acquisitionPrice, expenses, ...}` spread로 재구성하므로 (`transfer-tax-commercial-step.ts:148-157`) 먼저 주입된 `isNonBusinessLand`·`nonBusinessLandAreaRatio`가 **보존된다**. 순서 충돌 없음.

### 3.3 ★ 부분 비사업용 비율 메커니즘 — 소비 조건과 계산 방식 (실측)

`lib/tax-engine/types/transfer.types.ts:179`:
```ts
nonBusinessLandAreaRatio?: number; // 부분 면적비율(목장 §168의10③·기타토지 §168의11①·복합용도
                                   // §168의11⑥·연접 다필지 §168의11⑤·바닥면적 외 §101①2호나목)
                                   // — 엔진 파생(judgeNonBusinessLand), 미지정=1 전량중과
```

소비 지점 `lib/tax-engine/transfer-tax-rate-calc.ts:354-363`:
```ts
if (input.isNonBusinessLand && surchargeRates.non_business_land) {   // ← ★ 플래그 동반 필수
  const ratio = input.nonBusinessLandAreaRatio ?? 1;
  const { progressiveTax, ... } = computeBracketBreakdown(taxBase, brackets);
  const surchargedBase = applyRate(taxBase, ratio);                  // ← 중과분만 안분
  const surchargeAmount = applyRate(surchargedBase, additionalRate);
  const nblTax = progressiveTax + surchargeAmount;                   // 기본누진은 전체 taxBase
}
```

**두 가지가 계획에 중요하다** (rev.2 추가):

1. **`isNonBusinessLand: true`를 함께 세팅해야 한다.** 비율만 주입하면 분기에 진입하지 못해 아무 효과가 없다.

2. **🔴 GB와 계산 방식이 다르다.**

   | | 기본 누진세액 | +10%p 중과분 |
   |---|---|---|
   | **GB (카드 2장 분할)** | 사업용·비사업용 자산이 각각 독립 계산 후 aggregate 합산 | 비사업용 카드에만 |
   | **안 B (비율 안분)** | **전체 taxBase**에 1회 | 전체 taxBase × 초과비율 |

   같은 법령 상황(§101①2호 기준면적 초과)에 **두 계산이 공존하게 된다.**

   > 다만 기존 부분중과 비율은 목장 §168의10③·기타토지 §168의11① **기준면적 초과**에 쓰이는 것으로, §101①2호 초과와 **법적 성격이 같다**(면적 기준 초과분 중과). 오히려 GB의 카드 분할이 예외적 구현일 수 있다.
   >
   > **Phase 0-4에서 두 방식의 세액 차이를 실측**하고, 어느 쪽이 법령 정합적인지 판단해 문서화한다. 차이가 유의하면 GB 통일 여부를 별건으로 제기한다(이 계획의 비목표).

### 3.4 GB 참조 모델 (다자산 확장)

`app/api/calc/transfer/general-building-route-helper.ts:427-483`:
```
buildGeneralBuildingAssetCards(gbv)        // 토지-사업용 / 토지-비사업용 / 건물 카드
  → resolveGeneralBuildingSwap(...)        // §97②2호 자산총액 swap
  → buildProperties(cards, nonBusinessRatio, swap)
  → calculateTransferTaxAggregate(...)     // 다자산 엔진
```

### 3.5 ★ NBL 엔진에 CB를 태우는 것의 제약 (실측 — rev.2 추가, 안 B-1 기각 근거)

`lib/tax-engine/non-business-land/types.ts:460-499` `NonBusinessLandInput` 필수 필드:
`landType` · `landArea` · `zoneType` · `acquisitionDate` · `transferDate` · `businessUsePeriods`

| 제약 | 실측 근거 | 영향 |
|---|---|---|
| `businessUsePeriods`(사업용 사용기간) 필수 | `types.ts:499` | CB 사용자에게 새 입력 요구 + **§168의6 기간기준 판정이 끼어든다**. GB는 카드에 `isNonBusinessLand: true`를 직접 세팅해 기간기준을 타지 않는다 → **GB와 결과가 갈린다** |
| `landType`에 `building_site`("건물 부수 토지") 존재 | `types.ts:33` | 그러나 `land-category.ts:41`이 이를 **`housing` 그룹**으로 보내고, `housing-land.ts:71-75`가 **주택 배율 `getHousingMultiplier`(「소득세법 시행령」 §168의12)** 를 적용한다 — §101②가 아니다 |
| 위 `building_site` 경로는 **기지(known) 별건** | `__tests__/.../building-site-multiplier.anchor.test.ts:212-225` — `describe("A-BS-1 [별건 격하] — building_site 분류 (UI 선택 불가 = 도달 불가)")` | 현재 UI 도달 불가라 방치됨. **안 B-1은 이 dead path를 살리는 형태가 되어 배율 오류를 먼저 고쳐야 한다** |

⇒ **NBL 엔진 전체를 태우는 형태(안 B-1)는 비용·위험이 크다.** §5.2의 B-2로 대체한다.

### 3.6 NBL 엔진의 현재 한계 (참고 — 이 계획의 범위 밖)

`lib/tax-engine/non-business-land/other-land.ts`(606줄)는 §101①2호 **나목**(시가표준액 2% 미달)만 자동 안분하고, **본문(바닥면적 × 배율)은 판정하지 않는다** — 대신 "재산세 종합합산/별도합산"을 사용자에게 직접 묻는다 (`components/calc/transfer/nbl/OtherLandDetailSection.tsx:218-219`).

| 경로 | §101① 배율 자동 판정 |
|---|---|
| GB (일반건물) | ✅ |
| land 자산 (기타토지 NBL) | ❌ 사용자가 종합/별도합산 선택 |
| CB (구분소유) | ❌ 부수토지 개념 부재 ← **이 계획의 대상** |

> rev.1은 "안 B가 `land` 자산도 함께 해소한다"를 장점으로 들었으나, 이는 **범위 확대**이고 사용자 입력(종합/별도합산 선택)과 충돌한다. rev.2에서 비목표로 명시하고 장점에서 제거한다.

---

## 4. 케이스 매트릭스

행 1개 = anchor 테스트 1개 이상. **Phase 0에서 §2.3이 해소되기 전에는 기대값을 확정할 수 없다.**

| # | 시나리오 | 배율 | 기대 | 상태 |
|---|---|---|---|---|
| C-1 | 상업지역 구분소유 상가, 지분 ≤ 기준면적 | 3배 | 전량 사업용 (현행과 동일 — 회귀 가드) | ☐ |
| C-2 | 상업지역, 지분 > 기준면적 | 3배 | 초과분만 중과 | ☐ |
| C-3 | 일반주거지역 오피스텔, 지분 > 기준면적 | 4배 | 초과분만 중과 | ☐ |
| C-4 | 전용주거지역 | 5배 | 초과분만 중과 | ☐ |
| C-5 | 도시지역 외 | 7배 | 초과분만 중과 | ☐ |
| C-6 | 미허가·미사용승인 건축물 (§101① **단서**) | — | **부속토지 전량 비사업용**(배율 무관) — 근거 해석례 25-0823 | ☐ |
| C-6b | **불법 용도변경**(허가·사용승인 미이행) 건축물 (§101① 단서) | — | 용도변경 이후 과세기준일부터 전량 비사업용. GB의 `isUnregistered`가 이 케이스를 포괄하는지 확인·정정 | ☐ |
| C-7 | 건물 시가표준액 < 부속토지 2% (§101①2호**나목**) | — | 바닥면적분만 사업용 유지 | ☐ |
| C-8 | **법 §106①3호다목 토지 안의 건축물** (§101①2호**가목**) | — | 별도합산 제외 → 전량 비사업용 | ☐ |
| C-9 | 용도지역 미입력 | — | 계산 차단(추정 배율 금지) | ☐ |
| C-10 | 세분 전 주거지역(`residential`) 입력 | — | 계산 차단 | ☐ |
| C-11 | 상속 취득 CB (§163⑨ — 환산 미적용 경로) | — | 배율 판정은 **취득방법과 무관하게** 동작 | ☐ |
| C-12 | §97②2호 swap 발동 + 초과분 존재 | — | swap과 부분중과가 독립 동작 (§3.2 순서로 보존 확인) | ☐ |
| C-13 | 공익수용 §164⑨ + 초과분 존재 | — | 동상 | ☐ |
| C-14 | **비율 주입 시 `isNonBusinessLand` 미세팅** | — | 중과 미적용(회귀 가드 — §3.3의 함정) | ☐ |
| C-15 | **동일 입력의 GB vs CB 세액 비교** | — | 차이를 실측·문서화 (§3.3 방식 이원화) | ☐ |

> C-8은 rev.2 추가(§101①2호 가목 누락). C-14·C-15는 rev.2 추가(검토에서 드러난 함정·쟁점).
> C-11~C-13은 기존 CB 분기와의 상호작용이며, §3.2 실측으로 **순서 충돌은 없음**이 확인되었다 — anchor로 고정만 한다.

---

## 5. 설계안

### 5.1 기각안

| 안 | 방식 | 기각 사유 |
|---|---|---|
| A | GB처럼 route에서 3카드 다자산 확장 | CB의 환산·§97②2호 swap·수용 특례(`transfer-tax-commercial-step.ts:122-166`)가 단건 input 기반이라 다자산으로 옮기면 swap 판정 단위가 바뀐다(단건 → 자산총액). 회귀 위험 큼 |
| **B-1** | NBL 엔진(`other-land.ts`)에 배율 본문 판정 추가 | **§3.5** — `businessUsePeriods` 필수(기간기준 개입) + `building_site`가 주택 배율을 타는 기지 별건(A-BS-1)을 먼저 고쳐야 함. rev.1의 원안이나 실측으로 기각 |
| D | 구현 없이 "GB로 입력" 안내 | §164⑥ 호별고시 환산과 충돌 시 어느 쪽도 정확히 계산 불가 |

### 5.2 ★ 채택 — 안 B-2 (공용 헬퍼 추출 + 부분중과 비율 주입)

**NBL 엔진을 태우지 않고**, GB에 이미 있는 배율 판정 로직을 **공용 헬퍼로 추출**해 CB가 재사용한다. 판정 결과를 `isNonBusinessLand: true` + `nonBusinessLandAreaRatio`로 주입해 기존 부분중과 경로(§3.3)를 탄다.

```
lib/tax-engine/appurtenant-land-excess.ts  (신설 — 공용 leaf)
  judgeAppurtenantLandExcess({
    landArea, buildingFootprintArea, zoneType, isUnregistered, ...
  }) → { allowedArea, nonBusinessArea, nonBusinessRatio, multiplier, detail, legalBasis }
       배율은 정본 getZoneAreaMultiplier 호출 (재구현 금지)

GB: general-building-valuation.ts:632-671 → 이 헬퍼 호출로 교체 (동작 불변 — 회귀 anchor)
CB: transfer-tax.ts STEP 0.6 직후 → 헬퍼 호출 → effectiveInput에 주입
```

| 항목 | 평가 |
|---|---|
| 기간기준(§168의6) 개입 | **없음** — GB와 동일하게 초과 자체로 비사업용 |
| `land` 자산 회귀 | **없음** — NBL 엔진 무변경 |
| 배율 판정 위치 | **1곳으로 수렴** — GB·CB가 같은 헬퍼 사용 (정본 통일 작업과 정합) |
| 카드 분할 | 불필요 |
| GB 동작 변경 | 없음(리팩터만) — C-1 계열 회귀 anchor로 보장 |
| 남는 쟁점 | §3.3 계산 방식 이원화 — GB는 카드 분할, CB는 비율 안분 |

**주입 지점**: `transfer-tax.ts:180`(STEP 0.6) 직후, `:249`(CB step) 이전. §3.2에서 CB step이 spread로 보존함을 확인했으므로 순서 안전.

**`isNonBusinessLand` 세팅 규칙**: 초과분이 있을 때만 `true`. 초과분이 0이면 기존 값을 건드리지 않는다(C-1 회귀 가드).

---

## 6. Phase 분할

### Phase 0 — 착수 조건 (법령·설계 검증)

| # | 작업 | 완료 기준 | 블로커 | 상태 |
|---|---|---|---|---|
| 0-1 | §2.3 구분소유 바닥면적 기준 해소 | 해석례·심판례 인용 확보, 또는 0건 확인 후 ㉮ 채택 근거 문서화 | 🔴 예 | **✅ 완료 (2026-08-05)** — 직접 근거 0건 확인 → ㉮ 채택·근거 문서화. 부수 수확: 해석례 25-0823(§2.4) |
| 0-2 | 실무 발생 케이스 확인 | 배율 초과 사례 1건 이상 | 아니오(우선순위 자료) | ☐ |
| 0-3 | §101② 정본 브랜치 머지 | `lib/tax-engine/local-tax-zone-multiplier.ts` master 반영 | 🔴 예 | ⏳ PR #1067 리뷰 중 |
| 0-4 | §3.3 계산방식 차이 실측 | 동일 입력 GB(카드 분할) vs CB(비율 안분) 세액 비교 → 차이·법령 정합성 문서화 (C-15) | 🔴 예 | ☐ |

> **0-3·0-4 미해소 시 Phase B 진입 금지.** (0-1 해소 완료)

### Phase A — 공용 헬퍼 추출 (GB 동작 불변)

- `lib/tax-engine/appurtenant-land-excess.ts` 신설 — §101① 단서·2호 가목·나목·배율 판정
- GB 3경로(`general-building-valuation.ts` · `general-building-extension.ts` · `general-building-route-helper.ts`)를 헬퍼 호출로 교체
- **C-6b 정리**: `isUnregistered` 분기가 §101① 단서의 **불법 용도변경**까지 포괄하도록 필드 의미·UI 문구 확장 (§2.4 해석례 25-0823)
- **주석 드리프트 정리**: `lib/api/transfer-tax-building-schemas.ts:26·28·32`가 아직 옛 조문을 가리킨다 — `buildingFootprintArea`/`zoneType` 주석이 "§168의12 배율", `isUnregistered` 주석이 "§168의11①1호". 실제 코드는 2026-07-30에 §101②·§101① 단서로 정정됐다(`general-building-valuation.ts:632-633`). 헬퍼 추출하는 김에 함께 정정
- verify: **기존 GB 테스트 전건 GREEN**(동작 불변 증명) + `building-site-multiplier.anchor.test.ts` GREEN

### Phase B — CB 엔진 주입

- `transfer-tax.ts` STEP 0.6 직후 CB 부수토지 판정 → `isNonBusinessLand` + `nonBusinessLandAreaRatio` 주입
- 표 미등재 용도지역 → 차단 (추정 배율 금지)
- verify: C-1·C-2·C-6·C-9·C-10·C-14 anchor GREEN

### Phase C — API 배관 (⑫⑬⑭)

- `commercialBuildingValuationSchema`에 `buildingFootprintArea`(또는 §2.3 ㉮ 채택 시 건물전체 바닥면적+지분율)·`zoneType`·`isUnregistered` 추가
- `transfer-tax-schema-refines.ts` 필수 조건
- `engine-input.ts` 매핑
- verify: grep 자가 점검 + Network 탭 request body 신규 필드 도달 확인

### Phase D — UI (①②③⑤⑥⑦⑧)

- `CommercialBuildingBlock.tsx`에 입력 섹션 (GB의 `GeneralBuildingNblSection.tsx` 146줄 패턴 차용)
- 용도지역은 **세분 10종**(정본 키와 일치)
- store 필드 추가 + stale sessionStorage 가드
- validate 동기화 (UI 통과 ↔ validate 차단 모순 금지)
- 결과 카드에 배율·기준면적·초과면적 산출근거 표시 — **부분중과 비율 표시가 GB의 카드 2장 표시와 다르므로 표시 문안 별도 설계**
- verify: C-3~C-5 E2E

### Phase E — 상호작용 회귀

- C-11~C-13(상속·swap·수용) anchor
- verify: `npm test` 전건 GREEN

---

## 7. 14 동기화 지점

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-asset-cb.ts` | `cbBuildingFootprintArea` · `cbZoneType` · `cbIsUnregistered` |
| ② | initial | 동상 | 빈 문자열·false |
| ③ | normalize | `lib/stores/calc-wizard-asset-migrate.ts:530-533` (기존 cb* 가드 옆) | stale 이력 가드 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-helpers.ts:125` `buildCommercialBuildingValuation` | 신규 필드 포함 |
| ⑤ | UI 위젯 | `components/calc/transfer/CommercialBuildingBlock.tsx` | 입력 섹션 |
| ⑥ | 사이드바 | `lib/stores/` summary | 초과면적 표시 여부 판단 |
| ⑦ | 결과 카드 | CB 결과뷰 + `FilingFormTableHelpers.ts:474` | 배율·기준면적 산출근거 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts:156` | ④와 동일 조건 |
| ⑨ | Zod enum 메인 | `lib/api/transfer-tax-schema.ts:410` | — |
| ⑩ | Zod 컴패니언 | `lib/api/transfer-tax-schema-refines.ts:192` | 필수 조건 |
| ⑪ | 자산-수준 fallback | `app/api/calc/transfer/engine-input.ts` | — |
| ⑫ | **Zod 입력 객체** | `lib/api/transfer-tax-building-schemas.ts:256` | 🔴 누락 시 침묵 strip |
| ⑬ | **body spread** | `lib/calc/transfer-tax-api.ts` | 🔴 |
| ⑭ | **Route 엔진 매핑** | `app/api/calc/transfer/engine-input.ts:322` | 🔴 |

---

## 8. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R-1 | ㉮(전체-후-안분)가 **문언·체계 해석**이라 반대해석(㉯ 호별 전용면적) 시 초과분 면적이 달라진다 — 직접 판례·해석례 0건 | 결과 화면에 판정 근거·기준면적 산식을 노출해 사용자가 검증 가능하게 한다. 반대 해석례가 나오면 §2.3부터 재검토 |
| R-2 | GB(카드 분할) vs CB(비율 안분) 세액 불일치 | Phase 0-4 실측·문서화. 유의하면 GB 통일을 별건 제기 |
| R-3 | 비율만 주입하고 `isNonBusinessLand` 누락 → 조용히 무효 | C-14 anchor |
| R-4 | Phase A 헬퍼 추출이 GB 동작을 바꿈 | 기존 GB 테스트 전건 GREEN을 완료 기준으로 |
| R-5 | 정본 브랜치 미머지 → 배율 4벌 재발 | Phase 0-3 블로커 |
| R-6 | `commercial-building-valuation.ts` 449줄 + 신규 로직 → 800줄 정책 | 판정은 신설 헬퍼 파일(§5.2)에 두므로 해당 없음 |
| R-7 | ㉮ 채택 시 사용자가 건물 전체 바닥면적·지분율을 모름 | Phase D에서 건축물대장 조회 연동 검토(`building-register-*` 기존 자산 활용) |
| R-8 | 실익 없는 기능 추가 | Phase 0-2가 우선순위 자료(블로커 아님) |

---

## 9. 참고

### 법령 근거 (실측)

- 「지방세법 시행령」 §101 원문 — 법제처 MST 287223, 시행 2026-07-01 (2026-08-05 조회)
- 법제처 법령해석례 **25-0823** (2026.02.03, 일련번호 342727) — §101① 단서의 "허가 등"·"사용승인" 범위. 상세: `https://www.law.go.kr/DRF/lawService.do?target=expc&ID=342727`
- 인용 판례·심판례 (위 해석례 경유): 헌재 2010.12.28. 2009헌바145 · 조심2023지4424 · 조심2018지0661

### 🔵 별건 발견 — `DECISION_DOMAINS` 주석이 실제 API와 다름

`lib/korean-law/types.ts:23-41`의 target 주석을 법제처 API 응답으로 실측한 결과 어긋난다:

| target | 코드 주석 | 실측 |
|---|---|---|
| `ppc` | 조세심판원 결정 | **개인정보보호위원회** (응답 `기관명` 필드) |
| `expc` | 헌재결정례 | **법령해석례** (응답에 `법령해석례일련번호`·`회신기관명`) |
| `detc` | 법령해석례 | 응답 키 `DetcSearch` — 제목검색 "부속토지" 0건. 법제처 표준상 헌재결정례 |

`/law` 화면의 도메인 드롭다운 라벨이 잘못 표시될 수 있다. **조세심판원은 법제처 DRF API에 target이 없어** 별도 경로가 필요하다(현재 프로젝트에 조세심판 검색 경로 부재). 이 계획의 범위 밖 — 별건 이슈로 제기할 것.

### 코드

- 정본: `lib/tax-engine/local-tax-zone-multiplier.ts` (별도 브랜치)
- GB 참조 구현: `lib/tax-engine/general-building-valuation.ts:615-745`
- GB UI 참조: `components/calc/transfer/GeneralBuildingNblSection.tsx` (146줄)
- 부분중과 메커니즘: `lib/tax-engine/transfer-tax-judgment-steps.ts:83-98` · 소비 `transfer-tax-rate-calc.ts:354-363`
- 기지 별건: `__tests__/tax-engine/non-business-land/building-site-multiplier.anchor.test.ts:212-225` (A-BS-1 `building_site`)
- 관련 정책 메모리: `feedback_unverified_authority_blocks_tax_change` · `feedback_api_zod_schema_sync` · `feedback_new_asset_field_stale_sessionstorage_guard` · `feedback_no_unfavorable_application_without_legal_basis` · `feedback_sibling_path_already_implements_rule`

---

## 10. 검토 이력

### rev.3 (2026-08-05) — Phase 0-1 완료

법제처 Open API 직접 조회(프로젝트 `KOREAN_LAW_OC` 사용 — MCP 공유 쿼터 초과로 폴백).

| 결과 | 내용 |
|---|---|
| **§2.3 해소** | 구분소유 배율 안분 직접 근거 **0건** 확인(7개 쿼리·5개 도메인) → **㉮ 전체-후-안분 채택**, 문언·과세단위·입법취지 4개 근거로 문서화. 착수 블로커 해제 |
| **§2.4 신설** | 법제처 해석례 **25-0823**(2026.02.03) 확보 — §101① 단서가 **불법 용도변경**까지 포괄. C-6 직접 근거 |
| **C-6b 추가** | 위 해석례로 드러난 **기존 GB 구현 개선점** — `isUnregistered`가 "무허가건축물"로만 라벨링돼 불법 용도변경을 포괄하지 못할 수 있다. Phase A에서 정리 |
| **별건 발견** | `lib/korean-law/types.ts:23-41` `DECISION_DOMAINS` 주석 3건이 실제 API와 불일치(§9). 조세심판원 검색 경로 부재 |

> ㉮ 채택은 **직접 판례·해석례가 아닌 문언·체계 해석**이다. 실무 적용 시 재확인 필요를 §2.3에 명시했다.

### rev.2 (2026-08-05) — 자가 검토

실측으로 확인한 rev.1의 결함:

| 구분 | 내용 | 근거 | 조치 |
|---|---|---|---|
| **오류** | "CB STEP 0.35 재구성 전후 주입 순서가 결과를 가른다" | `transfer-tax.ts:180`(NBL) < `:249`(CB) — NBL이 **먼저**이고 CB step은 spread로 보존 | §3.2 신설, C-12·C-13을 "순서 충돌 없음, anchor로 고정"으로 격하 |
| **오류** | 안 B = "NBL 엔진에 배율 판정 추가" | `types.ts:499` `businessUsePeriods` 필수 → §168의6 기간기준 개입 / `land-category.ts:41`+`housing-land.ts:71-75` — `building_site`가 **주택 배율**을 탐 | B-1 기각, **B-2**(공용 헬퍼 추출)로 대체 |
| **오류** | 안 B 장점 "`land` 자산도 함께 해소" | 사용자 입력(종합/별도합산 선택)과 충돌하는 범위 확대 | §3.6에서 비목표로 명시, 장점에서 제거 |
| **누락** | 부분중과 비율은 `isNonBusinessLand: true` 동반 필수 | `transfer-tax-rate-calc.ts:354` | §3.3 + C-14 |
| **누락** | GB(카드 분할)와 안 B(비율 안분)의 **계산 방식이 다름** | `transfer-tax-rate-calc.ts:359-363` — 기본누진은 전체 taxBase, 중과분만 안분 | §3.3 + C-15 + Phase 0-4 블로커 |
| **누락** | §101①2호 **가목**(법 §106①3호다목 토지 안 건축물) 케이스 | §2.2 원문 | C-8 |
| **모순** | Phase 0-2(실무 사례)를 블로커로 두면 사용자 진행 지시와 충돌 | — | 블로커에서 제외, 우선순위 자료로 격하 |

기지(known) 사항으로 확인되어 **신규 결함이 아닌 것**:
- `building_site`에 주택 배율 적용 → `building-site-multiplier.anchor.test.ts:212` "A-BS-1 [별건 격하] — UI 선택 불가 = 도달 불가"로 이미 문서화됨. 이 계획의 비목표로 명시(§1).
