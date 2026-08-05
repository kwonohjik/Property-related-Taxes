# 상업용건물·오피스텔(CB) 부수토지 기준면적 초과분 비사업용 중과 — 구현 계획

- **작성일**: 2026-08-05 (rev.8 — Phase D 완료 반영, §10)
- **브랜치**: `worktree-commercial-building-appurtenant-land` (워크트리 — master는 별건 작업 중)
- **채택 설계**: **안 B-2** (§5.2) — 배율 판정 공용 헬퍼 추출 + 기존 부분중과 비율 주입
- **발단**: 세무 교재 발췌 — "상업용 건물의 부수토지는 각 용도지역별 배율이 규정되어 있어 규모 이내의 부수토지는 일반적인 양도소득세 계산과정에 따라 산출되지만 규모를 초과하는 면적에 대해서는 별도로 구분하여 비사업용토지로 중과 계산한다."
- **선행 작업**: 「지방세법 시행령」 §101② 배율표 정본 통일 — **PR #1067 머지 완료(2026-08-05)**. 정본 `lib/tax-engine/local-tax-zone-multiplier.ts` 확보.
- **진행 상태**: Phase 0 전건 ✅ · **A ✅** · **B ✅** · **C ✅** · **D ✅** · Phase E(상호작용 회귀) 대기

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

> 아래는 **Phase A 완료 후** 기준이다. 판정 본체는 공용 헬퍼로 추출됐고 3경로가 이를 호출한다.

| 위치 | 내용 |
|---|---|
| `lib/tax-engine/appurtenant-land-excess.ts` | **판정 본체**(신설) — §101① 단서 → 배율 조회 → 기준면적 → 초과분·비율 |
| `lib/tax-engine/general-building-valuation.ts:641` | 환산 모드 GB — `judgeAppurtenantLandExcess({ context: "일반건물" })` |
| `:663`·`:686`·`:705` | 토지 카드 분할(`land_nbl` / `land_business`) — 초과분만 중과 |
| `lib/tax-engine/general-building-extension.ts:206` | 증축 GB — `context: "일반건물(증축)"` |
| `app/api/calc/transfer/general-building-route-helper.ts:587` | 실거래가 모드 GB — `context: "일반건물(실거래가)"` |
| `__tests__/tax-engine/appurtenant-land-excess.anchor.test.ts` | 헬퍼 계약 anchor 20건 |
| `__tests__/tax-engine/non-business-land/building-site-multiplier.anchor.test.ts` | 배율·경로 anchor |

### 0.2 그렇다면 CB에 무엇이 없는가

| 항목 | GB | CB |
|---|---|---|
| 정착면적(바닥면적) 입력 | `buildingFootprintArea` (`lib/api/transfer-tax-building-schemas.ts:27`) | **없음** — 전용/공유/대지면적만 |
| 용도지역 입력 | `zoneType` (`:29`) | **없음** |
| §101① 단서 플래그 | `isUnregistered` (`:42`) | **없음** |
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
> ✅ **입력 부담은 Phase B에서 해소됐다.** 위 표의 부등식에서 **지분율이 분자·분모에 함께 걸려 약분**되므로, 지분면적·지분율을 받을 필요가 없다:
>
> ```
> 해당 호 지분면적 > 전체 바닥면적 × 배율 × 지분율
> ⟺ 전체 대지면적  > 전체 바닥면적 × 배율          (지분율 소거)
> 초과비율 = 1 − (전체 바닥면적 × 배율) ÷ 전체 대지면적
> ```
>
> ⇒ 신규 입력은 **집합건물 전체 대지면적 + 전체 바닥면적** 2개뿐이며, 둘 다 건축물대장
> 총괄표제부에서 확인된다. R-7 소멸.

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

2. **GB와 계산 방식이 다르다 — 차이는 실측 결과 제한적** (Phase 0-4 완료, §3.3a)

   | | 기본 누진세액 | +10%p 중과분 |
   |---|---|---|
   | **GB (카드 2장 분할)** | 사업용·비사업용 자산이 각각 독립 계산 후 aggregate 합산 | 비사업용 **자산의 과세표준**에 |
   | **안 B (비율 안분)** | **전체 taxBase**에 1회 | 전체 taxBase **× 초과비율**에 |

   > 기존 부분중과 비율은 목장 §168의10③·기타토지 §168의11① **기준면적 초과**에 쓰이는 것으로, §101①2호 초과와 **법적 성격이 같다**(면적 기준 초과분 중과). 오히려 GB의 카드 분할이 예외적 구현이다.

### 3.3a Phase 0-4 실측 — 두 방식의 세액 차이 (2026-08-05)

**조건**: 토지 양도 12억 · 취득 6억 · 2014-06-01 → 2024-06-01(10년) · mock 세율(비사업용 +10%p)
**방식 A**: 사업용분 + 비사업용분 2자산 aggregate (GB 모델 — 양도가·취득가를 **면적비로 안분**)
**방식 B**: 1자산 단건 + `isNonBusinessLand:true` + `nonBusinessLandAreaRatio`

| # | 시나리오 | A (카드분할) | B (비율안분) | 차이 (B−A) |
|---|---|---|---|---|
| ① | 초과비율 **1/10** | 169,860,000 | 169,860,000 | **0** |
| ② | 초과비율 **1/4** | 169,860,000 | 169,860,000 | **0** |
| ③ | 초과비율 **1/3** | 169,860,000 | 169,860,000 | **0** |
| ④ | 초과비율 **1/2** | 170,480,000 | 170,605,000 | **+125,000** (0.07%) |
| ⑤ | 초과비율 **3/4** | 184,920,000 | 185,013,750 | **+93,750** (0.05%) |
| ⑥ | 단기보유(1년 미만), 비율 1/3 | 298,750,000 | 298,750,000 | **0** |
| ⑦ | **비대칭 안분**(차익이 비사업용분에 편중) | 209,810,000 | 179,289,999 | −30,520,001 |
| 참고 | 전량 사업용 / 전량 비사업용 | 169,860,000 / 218,810,000 | — | — |

**판독**

- **①~③(비율 ≤ 1/3)·⑥: 완전 일치.** 이 구간은 A·B 모두 전량 사업용과 같은 값이 나오는데, **§104⑤ 비교과세**에서 그룹별 합산세액이 전체 일반 누진세액을 넘지 못해 일반세액이 채택되기 때문이다(중과 효과가 법령상 소멸). 두 방식이 같은 결론에 도달한다.
- **④⑤(비율 ≥ 1/2): 차이 발생.** B가 크다(납세자 불리). 원인은 +10%p를 거는 밑변이 다르기 때문 — A는 비사업용 **자산의 과세표준**, B는 **전체 과세표준 × 비율**. 다만 차이는 **세액의 0.05~0.07%**다.
- **⑦은 실무상 발생하지 않는다.** GB는 양도가·취득가를 모두 **같은 면적비**로 안분하므로(`general-building-area-apportion.ts` `apportionLandByBusinessArea(amount, businessArea, totalArea)` — 양도가·환산취득가·개산공제 3항목 동일 비율) ①~⑤의 구조에 해당한다. ⑦은 인위적으로 비대칭 값을 준 대조군이며, 같은 필지 내 사업용·비사업용분은 단가가 같아 이런 분포가 나오지 않는다.

**결론**: 안 B-2는 **초과비율 1/3 이하에서 GB와 완전히 같고**, 그 위에서 0.05~0.07% 차이가 난다. §0.3에서 평가한 대로 CB의 초과비율은 크지 않을 것으로 보이므로 실무 영향은 작다. ⇒ **안 B-2 유지.** 다만 결과 화면에 기준면적·초과면적·배율 산식을 노출해 사용자가 검증할 수 있게 한다(R-2).

> ⚠️ mock 세율 기준 실측이다. 실제 DB 세율·연도별 누진표에서는 절대액이 달라진다. **차이의 유무·방향**이 이 실측의 결론이며 금액 자체는 조건 의존이다.

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
| C-1 | 상업지역 구분소유 상가, 지분 ≤ 기준면적 | 3배 | 전량 사업용 (현행과 동일 — 회귀 가드) | ✅ |
| C-2 | 상업지역, 지분 > 기준면적 | 3배 | 초과분만 중과 | ✅ |
| C-3 | 일반주거지역 오피스텔, 지분 > 기준면적 | 4배 | 초과분만 중과 | ☐ |
| C-4 | 전용주거지역 | 5배 | 초과분만 중과 | ☐ |
| C-5 | 도시지역 외 | 7배 | 초과분만 중과 | ☐ |
| C-6 | 미허가·미사용승인 건축물 (§101① **단서**) | — | **부속토지 전량 비사업용**(배율 무관) — 근거 해석례 25-0823 | ✅ |
| C-6b | **불법 용도변경**(허가·사용승인 미이행) 건축물 (§101① 단서) | — | 용도변경 이후 과세기준일부터 전량 비사업용. GB의 `isUnregistered`가 이 케이스를 포괄하는지 확인·정정 | ☐ |
| C-7 | 건물 시가표준액 < 부속토지 2% (§101①2호**나목**) | — | 바닥면적분만 사업용 유지 | ☐ |
| C-8 | **법 §106①3호다목 토지 안의 건축물** (§101①2호**가목**) | — | 별도합산 제외 → 전량 비사업용 | ☐ |
| C-9 | 용도지역 미입력 | — | 계산 차단(추정 배율 금지) | ✅ |
| C-10 | 세분 전 주거지역(`residential`) 입력 | — | 계산 차단 | ☐ |
| C-11 | 상속 취득 CB (§163⑨ — 환산 미적용 경로) | — | 배율 판정은 **취득방법과 무관하게** 동작 | ✅ |
| C-12 | §97②2호 swap 발동 + 초과분 존재 | — | swap과 부분중과가 독립 동작 (§3.2 순서로 보존 확인) | ☐ |
| C-13 | 공익수용 §164⑨ + 초과분 존재 | — | 동상 | ☐ |
| C-14 | **비율 주입 시 `isNonBusinessLand` 미세팅** | — | 중과 미적용(회귀 가드 — §3.3의 함정) | ✅ |
| C-15 | **동일 입력의 GB vs CB 세액 비교** | — | §3.3a 실측표를 anchor로 고정 — 비율 1/10·1/4·1/3·단기는 **차이 0**, 1/2·3/4는 기록된 차이 | ☐ |

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
| 0-4 | §3.3 계산방식 차이 실측 | 동일 입력 GB(카드 분할) vs CB(비율 안분) 세액 비교 → 차이·법령 정합성 문서화 (C-15) | 🔴 예 | **✅ 완료 (2026-08-05)** — §3.3a. 비율 ≤1/3·단기는 **차이 0**, ≥1/2에서 0.05~0.07%. 안 B-2 유지 |

> **0-3 미해소 시 Phase B 진입 금지.** (0-1·0-4 해소 완료)

### Phase A — 공용 헬퍼 추출 (GB 동작 불변) ✅ **완료 (2026-08-05)**

> 결과: `lib/tax-engine/appurtenant-land-excess.ts`(134줄) 신설 · GB 3경로 교체 ·
> 헬퍼 anchor 20건 신설 · **전체 13,475건 GREEN**(baseline 13,455 + 신규 20) · lint 0 errors.
> GB 판정 baseline 390건이 변경 전후 동일하게 통과해 **동작 불변**을 확인했다.
>
> ⚠️ `general-building-valuation.ts`는 880 → **856줄**로 줄었으나 여전히 800줄 정책 초과다
> (이번 변경이 만든 위반이 아니라 기존 상태). 분리는 별건으로 남긴다.

- `lib/tax-engine/appurtenant-land-excess.ts` 신설 — §101① 단서·2호 가목·나목·배율 판정
- GB 3경로(`general-building-valuation.ts` · `general-building-extension.ts` · `general-building-route-helper.ts`)를 헬퍼 호출로 교체
- **C-6b 정리**: `isUnregistered` 분기가 §101① 단서의 **불법 용도변경**까지 포괄하도록 필드 의미·UI 문구 확장 (§2.4 해석례 25-0823)
- **주석 드리프트 정리**: `lib/api/transfer-tax-building-schemas.ts:26·28·32`가 아직 옛 조문을 가리킨다 — `buildingFootprintArea`/`zoneType` 주석이 "§168의12 배율", `isUnregistered` 주석이 "§168의11①1호". 실제 코드는 2026-07-30에 §101②·§101① 단서로 정정됐다(`general-building-valuation.ts:632-633`). 헬퍼 추출하는 김에 함께 정정
- verify: **기존 GB 테스트 전건 GREEN**(동작 불변 증명) + `building-site-multiplier.anchor.test.ts` GREEN

### Phase B — CB 엔진 주입 ✅ **완료 (2026-08-05)**

- `types/commercial-appurtenant.types.ts` 신설 — `CommercialAppurtenantLandInput`
- `transfer-tax-judgment-steps.ts` `runCommercialAppurtenantLandStep` (STEP 0.62)
- `transfer-tax.ts:190` — STEP 0.6 직후 호출. 미제공 시 no-op
- anchor 12건 신설 · **전체 13,487건 GREEN** · tsc 0 · lint 0 errors

> **★ 입력이 2개로 줄었다.** 모델 ㉮에서 대지권 지분율이 판정식의 분자·분모에 함께 걸려
> **약분**되므로(§2.3), 지분면적·지분율을 받을 필요가 없다:
>
> ```
> 해당 호 지분면적 > 전체 바닥면적 × 배율 × 지분율
> ⟺ 전체 대지면적  > 전체 바닥면적 × 배율
> 초과비율 = 1 − (전체 바닥면적 × 배율) ÷ 전체 대지면적   ← 지분율과 무관
> ```
>
> ⇒ 신규 입력은 **집합건물 전체 대지면적 + 전체 바닥면적** 2개(+ 용도지역·§101①단서 플래그).
> 계획서 R-7(지분율 입력 부담)이 **소멸**했다. Phase D 입력 설계도 그만큼 가벼워진다.

> ⚠️ `types/transfer.types.ts`가 799 → **807줄**로 800을 넘었다. CLAUDE.md의 **타입 전용 파일
> 예외**(로직 없이 선언만 — 분리 가치 낮음)를 적용해 분리하지 않았다. 별도 판단 필요 시 재검토.

### Phase C — API 배관 (⑨⑩⑫⑭) ✅ **완료 (2026-08-05)**

> ⚠️ **rev.1의 설계를 정정했다.** 당초 `commercialBuildingValuationSchema`에 필드를 얹으려 했으나,
> 그 스키마는 **환산 전용**(`useEstimatedAcquisition` 게이트)이라 실거래가·상속 취득 CB에는
> 존재하지 않는다. 부수토지 판정은 **취득방법 무관**(C-11)이므로 **별도 최상위 필드**로 분리했다.

- `commercialAppurtenantLandSchema` 신설(`transfer-tax-building-schemas.ts`) — superRefine 포함
- `transfer-tax-schema.ts` 최상위 `commercialAppurtenantLand` optional 추가(⑨⑫)
- `engine-input.ts` 조건부 spread 매핑(⑭)
- **refine 규칙(⑩)**: `isUnregistered`가 아니면 `zoneType` 필수 — 엔진이 throw하기 전에 API가 400으로 차단
- anchor 7건 · **전체 13,494건 GREEN** · tsc 0 · lint 0 errors

**14지점 자가 grep 결과**: ⑫(스키마 정의·최상위)·⑭(route 매핑)·엔진 타입·STEP **모두 도달**.
**⑬(`lib/calc/transfer-tax-api.ts` body spread)만 미연결** — store 폼 필드가 없어 Phase D와 함께 한다.

### Phase D — UI (①②③⑤⑦⑧⑬) ✅ **완료 (2026-08-05)**

- store ①②③ — `cbTotalLandArea`·`cbTotalBuildingFootprintArea`·`cbZoneType`·`cbIsUnregistered`
  (factory 초기값 + migrate stale 가드)
- ⑤ `CommercialAppurtenantLandSection.tsx` 신설 — **환산 게이트 밖**에 마운트해 상속 취득 CB에서도 노출.
  배율·기준면적·초과면적·초과비율 미리보기는 엔진 정본 `getZoneAreaMultiplier` 재사용(UI 재계산 금지)
- 용도지역 선택지를 `appurtenant-zone-options.ts`로 **GB와 공유**(중복 제거)
- ⑬ `buildCommercialAppurtenantLand` + body spread — 취득방법 무관 게이트
- ⑧ validate — "둘 다 공란(생략) / 둘 다 입력(판정) / 하나만 입력(차단)"을 API 변환 조건과 1:1 정합
- ⑦ 결과 표시 — 엔진 STEP이 명세서 카드의 "전체 엔진 계산 과정"에 자동 노출(별도 카드 불필요)
- ⑥ 사이드바 — **해당 없음**(면적 판정이라 금액 합계에 들어갈 항목이 없다)

**검증**: anchor 12건 · **E2E 3건** · 전체 13,506건 GREEN · tsc 0 · lint 0 errors

> ⚠️ **E2E에서 접힘 두 겹을 실측으로 발견했다.** 자산 카드 ③ 취득 섹션과 결과의 "전체 엔진 계산 과정"이
> 모두 기본 접힘이라, 펴지 않으면 `toBeVisible`이 hidden으로 실패한다(정확히는 **단언이 조용히 약해지는**
> 반대 상황을 막아준 것). `expandAssetSection(page, 3)` + step 토글 클릭을 spec에 넣었다.

### Phase E — 상호작용 회귀

- C-11~C-13(상속·swap·수용) anchor
- verify: `npm test` 전건 GREEN

---

## 7. 14 동기화 지점

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-asset-cb.ts` | ✅ `cbTotalLandArea`·`cbTotalBuildingFootprintArea`·`cbZoneType`·`cbIsUnregistered` |
| ② | initial | `calc-wizard-asset-factory.ts` | ✅ |
| ③ | normalize | `calc-wizard-asset-migrate.ts` (기존 cb* 가드 옆) | ✅ stale 가드 |
| ④ | API 변환 | `transfer-tax-api-helpers.ts` `buildCommercialAppurtenantLand` | ✅ 신설(환산 변환과 별개) |
| ⑤ | UI 위젯 | `CommercialAppurtenantLandSection.tsx` (환산 게이트 밖 마운트) | ✅ |
| ⑥ | 사이드바 | — | ✅ 해당 없음(금액 항목 아님) |
| ⑦ | 결과 카드 | 명세서 카드 「전체 엔진 계산 과정」 | ✅ STEP 자동 노출 |
| ⑧ | validation | `transfer-tax-validate-asset.ts` | ✅ ⑬과 1:1 정합 |
| ⑨ | Zod 최상위 필드 | `lib/api/transfer-tax-schema.ts` | ✅ `commercialAppurtenantLand` |
| ⑩ | Zod refine | `transfer-tax-building-schemas.ts` superRefine | ✅ 단서 아니면 `zoneType` 필수 |
| ⑪ | 자산-수준 fallback | `app/api/calc/transfer/engine-input.ts` | — |
| ⑫ | **Zod 입력 객체** | `transfer-tax-building-schemas.ts` `commercialAppurtenantLandSchema` | ✅ 신설 |
| ⑬ | **body spread** | `lib/calc/transfer-tax-api.ts` | ✅ 조건부 spread |
| ⑭ | **Route 엔진 매핑** | `app/api/calc/transfer/engine-input.ts` | ✅ 조건부 spread |

---

## 8. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R-1 | ㉮(전체-후-안분)가 **문언·체계 해석**이라 반대해석(㉯ 호별 전용면적) 시 초과분 면적이 달라진다 — 직접 판례·해석례 0건 | 결과 화면에 판정 근거·기준면적 산식을 노출해 사용자가 검증 가능하게 한다. 반대 해석례가 나오면 §2.3부터 재검토 |
| R-2 | GB(카드 분할) vs CB(비율 안분) 세액 불일치 | **실측 완료(§3.3a)** — 비율 ≤1/3·단기 차이 0, ≥1/2에서 0.05~0.07%. 결과 화면에 기준면적·초과면적·배율 산식을 노출해 검증 가능하게 한다 |
| R-3 | 비율만 주입하고 `isNonBusinessLand` 누락 → 조용히 무효 | C-14 anchor |
| R-4 | Phase A 헬퍼 추출이 GB 동작을 바꿈 | 기존 GB 테스트 전건 GREEN을 완료 기준으로 |
| R-5 | 정본 브랜치 미머지 → 배율 4벌 재발 | Phase 0-3 블로커 |
| R-6 | `commercial-building-valuation.ts` 449줄 + 신규 로직 → 800줄 정책 | 판정은 신설 헬퍼 파일(§5.2)에 두므로 해당 없음 |
| R-7 | ~~㉮ 채택 시 지분율 입력 부담~~ → **소멸(Phase B)** — 지분율이 판정식에서 약분되어 입력이 전체 대지·바닥면적 2개로 줄었다. 두 값은 건축물대장 총괄표제부에서 확인 가능 |
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

### rev.8 (2026-08-05) — Phase D 완료

| 항목 | 결과 |
|---|---|
| **마운트 설계** | CB 환산 블록(`CommercialBuildingBlock`)은 `acquisitionCause !== "inheritance"` + `useEstimatedAcquisition` 이중 게이트라 **상속 CB에서 아예 마운트되지 않는다**. 부수토지 섹션은 취득방법 무관이어야 하므로 **게이트 밖 별도 마운트**로 분리 |
| **중복 제거** | 용도지역 선택지를 `appurtenant-zone-options.ts`로 추출해 GB 섹션과 공유 |
| **⑧ 정합 규칙** | "둘 다 공란=생략 / 둘 다 입력=판정 / 하나만 입력=차단" — API 변환(`buildCommercialAppurtenantLand`)의 payload 생성 조건과 1:1 |
| **⑥⑦ 판정** | ⑥ 해당 없음(면적이라 금액 합계 항목 아님) · ⑦ 엔진 STEP이 명세서 카드에 자동 노출되어 별도 카드 불필요 |
| **검증** | anchor 12건 · **E2E 3건** · 전체 13,506건 GREEN · tsc 0 · lint 0 errors |

**E2E 실측 발견** — 접힘이 **두 겹**이다: 자산 카드 ③ 취득 섹션(progressive disclosure)과 결과의 "전체 엔진 계산 과정" 토글. 펴지 않으면 요소가 DOM에 있어도 hidden이라 `toBeVisible`이 실패한다. `expandAssetSection(page, 3)`과 step 토글 클릭을 spec에 넣었다.

**동명 파일 주의** — `e2e/commercial-building-appurtenant-land-61.spec.ts`가 이미 있으나 **상속·증여세 상증법 §61 보충적 평가** 경로로 이 작업과 무관하다. 혼동을 피해 신규 spec은 `commercial-appurtenant-excess.spec.ts`로 명명했다.

### rev.7 (2026-08-05) — Phase C 완료

| 항목 | 결과 |
|---|---|
| **rev.1 설계 정정** | 당초 `commercialBuildingValuationSchema`에 필드를 얹으려 했으나 그 스키마는 **환산 전용**이라 실거래가·상속 CB엔 없다. 부수토지 판정은 취득방법 무관(C-11) ⇒ **별도 최상위 필드**로 분리 |
| **⑨⑫** | `commercialAppurtenantLandSchema` 신설 + `transfer-tax-schema.ts` 최상위 optional |
| **⑩** | superRefine — `isUnregistered`가 아니면 `zoneType` 필수. 엔진 throw 전에 API가 400으로 차단 |
| **⑭** | `engine-input.ts` 조건부 spread |
| **검증** | anchor 7건(스키마 보존·refine·route 매핑) · 전체 13,494건 GREEN · tsc 0 · lint 0 errors |

**14지점 자가 grep** — ⑫⑭·엔진 타입·STEP 도달 확인. **⑬만 미연결**(store 필드 선행 필요 → Phase D).

### rev.6 (2026-08-05) — Phase B 완료

| 항목 | 결과 |
|---|---|
| **엔진 주입** | `runCommercialAppurtenantLandStep`(STEP 0.62) 신설 → `transfer-tax.ts:190`에서 STEP 0.6 직후 호출. 판정 본체는 Phase A 헬퍼 재사용 |
| **★ 입력 2개로 축소** | 모델 ㉮에서 **지분율이 약분**됨을 유도 → 전체 대지면적·전체 바닥면적만 받는다. **R-7(지분율 입력 부담) 소멸** |
| **주입 규칙** | 초과분이 있을 때만 `isNonBusinessLand: true` + `nonBusinessLandAreaRatio` 동시 주입. 초과 0이면 기존 값 불변 |
| **anchor 12건** | C-1(회귀)·C-2(중과)·C-6(§101①단서)·C-9·C-10(차단)·C-11(상속)·C-14(플래그 누락 함정) |
| **검증** | 전체 13,487건 GREEN(Phase A 13,475 + 12) · tsc 0 · lint 0 errors |

**실측 정정** — anchor 작성 중 `TransferTaxResult`에 `isNonBusinessLand`가 **없음**을 확인했다(입력 전용 필드). 판정 여부는 결과 `steps`의 라벨로 검증하도록 고쳤다.

**남은 것**: Phase C(API 배관 ⑫⑬⑭) · D(UI ①②③⑤⑥⑦⑧) · E(상호작용 회귀). 현재는 엔진 input에 직접 넣어야 동작하며 **UI/API로는 도달하지 않는다**.

### rev.5 (2026-08-05) — Phase 0-3·A 완료

| 항목 | 결과 |
|---|---|
| **Phase 0-3** | PR #1067 머지 → 계획서 브랜치 리베이스. §101② 정본 확보. **Phase 0 블로커 전건 해소** |
| **Phase A** | `appurtenant-land-excess.ts` 신설, GB 3경로(환산 `general-building-valuation.ts` · 증축 `general-building-extension.ts` · 실거래가 `general-building-route-helper.ts`) 교체 |
| **동작 불변 증명** | GB baseline 390건이 변경 전후 동일 통과. 전체 13,475건 GREEN · tsc 0 · lint 0 errors |
| **C-6b 반영** | `isUnregistered`의 의미를 §101① 단서 범위(허가·사용승인 미이행 — 불법 용도변경 포함)로 확장. 엔진 주석·Zod 주석·store 주석·UI 토글 제목/설명 4곳 정정. **판정 로직은 불변**(플래그 의미만 확장) |
| **주석 드리프트 정리** | `transfer-tax-building-schemas.ts`의 `buildingFootprintArea`/`zoneType`/`isUnregistered` 주석이 §168의12·§168의11①1호를 가리키던 것을 §101①2호·§101②·§101①단서로 정정 |

**설계 메모** — 3경로의 에러 메시지가 서로 달랐으나(`"일반건물 …"` / `"일반건물(증축) …"` / `"일반건물(실거래가): …"`) 테스트·UI 어디서도 문구를 검증하지 않음을 확인하고 `context` 파라미터로 접두사만 유지한 채 본문을 통일했다.

**미구현 명시** — §101①2호 **가목**(법 §106①3호다목 토지 안 건축물)·**나목**(시가표준액 2% 미달)은 판정 입력이 폼에 없어 헬퍼가 다루지 않는다(헤더에 기록). 나목은 `land` 자산에 한해 `non-business-land/other-land.ts` `isBareLand`가 별도 처리한다.

### rev.4 (2026-08-05) — Phase 0-4 완료

throwaway probe로 방식 A(카드 분할)와 B(비율 안분)를 7개 시나리오에서 비교 실측(§3.3a). 측정 후 probe 삭제.

| 결과 | 내용 |
|---|---|
| **rev.2의 우려가 부분 반증** | "두 방식은 세액이 다르다"고 적었으나, **초과비율 1/3 이하와 단기보유에서는 차이 0**이다. §104⑤ 비교과세가 그룹세액을 일반세액으로 되돌려 두 방식이 같은 결론에 도달한다 |
| **차이 구간 확정** | 비율 ≥1/2에서 B가 크다(0.05~0.07%). 원인은 +10%p의 밑변 — A는 비사업용 자산 과세표준, B는 전체 과세표준×비율 |
| **⑦ 비대칭은 대조군** | GB가 양도가·취득가·개산공제를 **모두 같은 면적비**로 안분함을 코드로 확인(`general-building-area-apportion.ts`) → 실무에서 비대칭 분포는 발생하지 않는다 |
| **결정** | 안 B-2 유지. R-2를 "불일치 위험"에서 "실측된 제한적 차이 + 산식 노출로 검증 가능"으로 갱신 |

> mock 세율 기준이므로 **차이의 유무·방향**이 결론이고 금액은 조건 의존이다.

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
