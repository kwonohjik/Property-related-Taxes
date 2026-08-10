# 일반건물(토지+건물 일괄) × 지분(%) 분할 취득 — 엔진 설계

**계획서**: [`docs/00-pm/transfer-general-building-fractional-share.plan.md`](../../00-pm/transfer-general-building-fractional-share.plan.md) (개정 3)
**작성**: 2026-08-10 · **브랜치**: `worktree-gb-split-acq`
**전제**: 계획서 §8 착수 조건 **전건 확정**

---

## Context

같은 일반건물을 **지분(%)별로 여러 번 나눠 취득**한 뒤 100%를 일괄 양도하는 케이스
(예: 2009년 60% 매매 + 2015년 40% 매매). 지분마다 취득일·취득원인·취득방식이 달라
**지분별로 양도차익을 계산**해야 한다.

현행은 `assetKind === "general_building"`에서 지분 분할 토글이 **비활성**이고, 강제로 켜면
companion Zod enum에서 **400**이 난다(계획서 §1-1 실측). enum을 넓혀도 `route.ts` if-체인이
일괄(5-a)을 먼저 잡아 일반건물 분기(5-a-3)가 **실행조차 되지 않는다**(계획서 §1-2).

---

## ★ 케이스 인벤토리 (Do 진입 게이트)

| # | 시나리오 | 법령·근거 | anchor | 상태 |
|---|---|---|---|---|
| C-01 | **지분 1개(100%)** — 현행 단건과 **원 단위 동일** | 회귀 불변식 | GBF-02 | ☐ |
| C-02 | 2지분: 60% 매매(환산) + 40% 매매(실가) | 영 §176의2② · 법 §97①1호 | GBF-01 | ☐ |
| C-03 | 2지분: 60% 매매(환산) + 40% **상속**(평가액 의제) | 법 §97①1호 단서 · 영 §163⑨ | GBF-11 | ☐ |
| C-04 | 2지분: 60% 매매 + 40% **증여** | 영 §163⑨ · 단서 max | ☐ | ☐ |
| C-05 | 3지분 (1/3 × 3) — floor 잔액 흡수 | Σ = 총양도가 불변식 | GBF-03 | ☐ |
| C-06 | 지분 × **토지·건물 취득일 분리**(M-1a) | 영 §166⑥ · 법 §95④ | ☐ | ☐ |
| C-07 | 지분 × **증축, 지분이 증축 前 취득** → 3파트 | 영 §162①4호 | GBF-09 | ☐ |
| C-08 | 지분 × **증축, 지분이 증축 後 취득** → **2파트 + 기준시가 합산** | 법 §98 · 영 §162① (§3-3-1) | GBF-09 | ☐ |
| C-09 | 지분 × **용도변경 前 취득** → LTHD 기산일 = 변경일 | 사전-2022-법규재산-0684 | GBF-10 | ☐ |
| C-10 | 지분 × **용도변경 後 취득** → LTHD 기산일 = **지분 취득일** | 실무 확정(계획 §3-3-2) | GBF-10 | ☐ |
| C-11 | 지분 × §99-164-10 최초공시 — 지분별 취득기준시가로 **산식이 자동 분기** | 집행기준 99-164-10 | ☐ | ☐ |
| C-12 | 지분 × **NBL 부수토지 초과** — 지분마다 토지 카드 2장 | 지방세령 §101①2호·② | ☐ | ☐ |
| C-13 | **§97②2호 단서 × 혼합 지분** — 단서는 **환산 지분에만** | 법 §97②2호 단서 (계획 §3-4) | GBF-11 | ☐ |
| C-14 | 지분 × **이월과세**(토지 파트) | 법 §97의2 | ☐ | ☐ |
| C-15 | 개산공제 **지분율 축소** — `ownershipRatio` 도달 | 영 §163⑥ | GBF-04 | ☐ |
| C-16 | **파트별 실가 취득가액 × 지분율 스케일** | 계획 §3-5 | GBF-05 | ☐ |
| C-17 | **차단**: 지분율 합계 ≠ 100% | 기존 `transfer-tax-validate.ts:161~173` 재사용 | ☐ | ☐ |
| C-18 | **차단**: 상속 지분에 환산·감정·매매사례 선택 (**지분 인덱스**로 보고) | 법 §97①1호 단서·영 §163⑨ | GBF-12 | ☐ |
| C-19 | **차단**: 지분 분할 × 부담부증여·공익수용 (범위 밖 유지) | 계획 §2-2 | ☐ | ☐ |
| C-20 | **음성**: 지분 카드에 양도측·물건사건 입력이 **없다** + primary 양성 대조군 | 계획 §4-1 | GBF-08 | ☐ |

> **규칙**: 행 1개 = anchor 1개 이상. ☐가 남은 행은 Do 완료로 보고하지 않는다.
> 사용자가 새 케이스를 제시하면 **표에 행을 먼저 추가**하고 코드를 고친다.

---

## 법령 근거

**「소득세법」 제97조 제2항 제2호** (법제처 현행 MST 280405 직독, 2026-08-10)

> 2. 그 밖의 경우의 필요경비는 … 의 금액에 **자산별로** 대통령령으로 정하는 금액을 더한 금액.
> **다만**, 제1항제1호나목에 따라 취득가액을 **환산취득가액으로 하는 경우로서** 가목의 금액이
> 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 할 수 있다.
> 　가. 환산취득가액 + **본문 중** 대통령령으로 정하는 금액의 합계액
> 　나. 제1항제2호 및 제3호에 따른 금액의 합계액

**「소득세법」 제97조 제1항 제1호 단서 · 같은 법 시행령 제163조 제9항** — 상속·증여 취득은
평가액이 **취득 당시 실지거래가액으로 의제**되어 환산 대상이 아니다.

**「소득세법」 제98조 · 같은 법 시행령 제162조 제1항** — 취득시기는 **각 취득 건별로** 정해진다.
지분을 나눠 취득했으면 지분마다 취득시기가 따로 있다.

**「소득세법 시행령」 제166조 제6항** — 토지·건물 일괄양도 시 양도가액 안분.
**같은 영 제163조 제6항** — 개산공제(1호 토지 · 2호 건물, **별개 호**).
**「지방세법 시행령」 제101조 제1항 제2호·제2항** — 부수토지 한도 배율(NBL).

> 조문 문자열 리터럴 금지 — `lib/tax-engine/legal-codes/transfer.ts`의 `TRANSFER.*` 상수 사용.

---

## D1. 데이터 전송 계약 — **새 top-level 배열** (계획서 Phase E 정제)

### D1-1. companion 경로를 **쓰지 않는다** ⇒ enum 확장 **불요**

계획서 Phase E는 「companion `assetKind` enum 확장」을 들었으나, 설계에서 **폐기**한다.

지분들을 `companionAssets[]`로 보내지 않고 **전용 배열**로 보내면
- 계획서 §1-1의 400(enum 거부)이 **구조적으로 발생하지 않는다**,
- companion 경로(주택·토지 일괄양도)의 스키마·동작을 **전혀 건드리지 않아 회귀 0**,
- route 분기 조건이 「이 배열의 존재」로 **자명**해진다.

### D1-2. 스키마

```ts
// lib/api/transfer-tax-building-schemas.ts
export const generalBuildingShareSchema = z.object({
  shareId: z.string().min(1),
  shareLabel: z.string().min(1),
  /** 지분율 0 < r ≤ 1. Σ = 1 은 superRefine이 검증(D1-3). */
  ownershipRatio: z.number().positive().max(1),
  /**
   * 그 지분의 **완결된** GB payload.
   * 물건-수준 필드는 ④ API 변환이 primary에서 복사해 채운다(D2) — route는 그대로 쓴다.
   */
  valuation: generalBuildingValuationSchema,
  /** 그 지분의 토지 취득일(M-1a) — 미지정 시 건물 취득일과 동일 */
  acquisitionDate: z.string().date(),
  /** 지분별 자본적지출·양도비 (원, 이미 × r 적용된 값 — D3) */
  capitalExpenditure: z.number().int().nonnegative().optional(),
  transferExpense: z.number().int().nonnegative().optional(),
});

// lib/api/transfer-tax-schema.ts (top-level)
generalBuildingShares: z.array(generalBuildingShareSchema).min(2).max(10).optional(),
```

`.min(2)`인 이유: 지분 1개는 **기존 단건 경로**(5-a-3)가 처리한다. 배열이 있으면 항상 다지분이다.

### D1-3. `superRefine` — 물건-수준 동일성 강제

지분마다 `valuation`을 통째로 실으므로 **물건-수준 값이 어긋나면 조용히 다르게 계산된다.**

키 이름은 **Zod 스키마 정본**(`transfer-tax-building-schemas.ts`)을 따른다 —
`AssetForm`의 `gb*` 이름과 **다르다**(예: 폼 `gbAcqLandPricePerSqm` → payload `acquisitionLandPricePerSqm`).

```ts
/** 전 지분에서 동일해야 하는 **경로** (계획서 §3-1 「물건-수준」). 점 표기 = 중첩. */
const PROPERTY_LEVEL_PATHS = [
  // 면적 (물건 전체 100% — 지분으로 나누지 않는다)
  "landArea", "buildingArea", "buildingFootprintArea",
  // 양도시 기준시가 (양도 시점은 하나뿐)
  "transferLandPricePerSqm", "transferBuildingStdPrice",
  // 양도 계약 단위 (§166⑥ 안분 방식·§100③ 30% 판정·감정 서열)
  "landTransferPrice", "buildingTransferPrice", "saleSplitExemption",
  "landAppraisalAtTransfer", "buildingAppraisalAtTransfer", "appraisalDateAtTransfer",
  // 물건 속성 (NBL 배율)
  "zoneType", "isMetropolitan", "isUnregistered",
  // 물건 사건 ① 증축 — ⚠️ 실가 2필드는 제외(D3에서 × r)
  "extensionInfo.extensionDate", "extensionInfo.extensionArea",
  "extensionInfo.acquisitionMode", "extensionInfo.extensionAcquisitionCause",
  "extensionInfo.extensionFloorArea85",
  "extensionInfo.transferExtensionBuildingStdPrice",
  "extensionInfo.acquisitionExtensionBuildingStdPrice",   // 증축 시점도 하나뿐
  // 물건 사건 ② 주택→상가 용도변경
  "houseToCommercialConversion", "conversionDate", "wasMultiHouseAtConversion",
  // 물건 사건 ③ §99-164-10 최초공시
  "hasFirstDisclosure", "firstDisclosurePrice",
  "firstDisclosureLandStdPrice", "firstDisclosureBuildingStdPrice",
] as const;
```

- 경로가 지분 간 불일치 → `issue` (path: `generalBuildingShares[i].valuation.<path>`).
- `Σ ownershipRatio`가 1에서 **0.005** 초과 이탈 → `issue`
  (허용오차는 클라 validate `transfer-tax-validate.ts:167`과 **같은 값**).

> ⚠️ **`extensionInfo.actualAcquisitionPrice`·`actualExpenses`는 목록에서 제외**한다.
> 증축 비용은 그 지분이 부담한 몫이라 **× r 대상**(D3)이고, 동일성을 강제하면 정면 충돌한다.
>
> ⚠️ **물건 사건 필드는 「동일하게 보내고, 적용 여부는 route가 판정」한다**(D4).
> ④ API 변환에서 지분별로 빼버리면 이 동일성 검증이 상시 실패한다 — 순서가 중요하다.
>
> ⚠️ **`PROPERTY_LEVEL_PATHS`는 소스 텍스트 count 가드를 건다.** 경로가 빠지면 검증이 조용히
> 약해진다 (메모리 `project_non_housing_to_housing_conversion`의 Pick 계약 개수 가드).

---

## D2. ④ API 변환 — 물건-수준 병합

`lib/calc/transfer-tax-api-gb.ts`에 추가:

```ts
export function buildGeneralBuildingShares(
  assets: AssetForm[], primary: AssetForm, transferDate: string,
): GeneralBuildingSharePayload[] | undefined
```

- 진입 조건: `isFullFractionalBundle(assets) && primary.assetKind === "general_building"`.
- 각 지분 `a`에 대해 `buildGeneralBuildingValuation(mergeGbPropertyLevel(a, primary), …)`.
- `mergeGbPropertyLevel`은 **`mergePrimaryBasic`(`transfer-tax-api-helpers.ts:364~375`)의 GB 확장판**.
  기존 7키 + `PROPERTY_LEVEL_PATHS`에 대응하는 **AssetForm 필드**를 primary에서 덮는다.

> 🔑 **두 목록은 같은 축이다** — Zod의 `PROPERTY_LEVEL_PATHS`(payload 키)와
> `mergeGbPropertyLevel`(폼 필드)이 어긋나면 superRefine이 자기 자신을 통과시키거나
> 반대로 상시 차단한다. **매핑 표를 코드 주석에 병기**하고 anchor로 고정한다.

`transfer-tax-api.ts`: 이 배열을 만들었으면 **`companionAssets`·`totalSalePrice`·
`primaryActualSalePrice`·`standardPriceAtTransferForApportion`을 보내지 않는다**
(보내면 `bundledOk`가 참이 되어 5-a가 먼저 잡는다 — 계획서 §1-2).

---

## D3. 지분율 스케일 — 적용/금지 (계획서 §3-5)

`applyShareScale(gbv, r)`를 **④ API 변환에서** 적용한다(route가 아니라).
이유: UI 안내문(「100% 기준 입력」)과 **같은 계층**에서 변환해야 3중 mirror가 성립한다.

| × r **적용** (100% 기준 입력값) | × r **금지** |
|---|---|
| `landAcquisitionPrice` · `buildingAcquisitionPrice` | `landArea` · `buildingArea` · `buildingFootprintArea` |
| `landDirectExpenses` · `buildingDirectExpenses` | `acquisitionLandPricePerSqm` · `acquisitionBuildingStdPrice` |
| `capitalExpenditure` · `transferExpense` (share 레벨) | `transferLandPricePerSqm` · `transferBuildingStdPrice` |
| `extensionInfo.actualAcquisitionPrice` · `.actualExpenses` | `extensionInfo.transferExtensionBuildingStdPrice` · `.acquisitionExtensionBuildingStdPrice` |
| 상속·증여 평가액 (`publishedValueAtInheritance` 계열) | `firstDisclosurePrice` · `firstDisclosureLandStdPrice` · `firstDisclosureBuildingStdPrice` |
| 일괄 취득가액·필요경비 (route 인자 `actualAcquisitionPrice`/`actualExpenses`) | |

**「금지」가 정확성의 근거다.** 기준시가·면적은 환산 산식에서 분자·분모로 함께 나타나 **약분**되고
(`types/general-building.types.ts:317~321`), `ownershipRatio`가 이미 개산공제 base를 줄인다 —
기준시가까지 줄이면 **개산공제가 이중 축소**된다.

상속·증여 신고가액은 기존 규약(`transfer-tax-api-helpers.ts:519~522`, 100% 기준 × r)을 **그대로** 따른다.

절사는 `applyRatio`(기존 헬퍼) 사용. `Math.round()` 금지.

---

## D4. 물건 사건의 지분별 前/後 판정 — **route에서 게이팅**

물건 사건 필드는 전 지분에 **동일하게** 실려 오고(D1-3), **적용 여부만 지분별로 판정**한다.
④ API 변환에서 미리 빼면 D1-3 동일성 검증이 상시 실패한다.

`lib/tax-engine/general-building-share-events.ts` (신규, 무의존 순수 leaf):

```ts
/** 그 지분에 증축 3파트 모델이 성립하는가 — 증축일이 그 지분의 건물 취득일보다 뒤일 때만. */
export function extensionAppliesToShare(extensionDate: Date, buildingAcqDate: Date): boolean;

/** 그 지분에 용도변경 LTHD 기산일 이동이 성립하는가. */
export function conversionAppliesToShare(conversionDate: Date, buildingAcqDate: Date): boolean;

/** 위 둘을 적용해 그 지분용 gbv를 만든다. 미적용 사건은 제거 + 기준시가 폴딩(D4-1). */
export function gateShareEvents(gbv: GeneralBuildingInput, buildingAcqDate: Date): GeneralBuildingInput;
```

`extensionApplies` / `conversionApplies` 모두 **`사건일 > 취득일`** 일 때만 `true`.
동일자(`===`)는 `false` — 현행 validate가 `<=`로 하한을 막고 있어
(`transfer-tax-validate-gb.ts:545`) 규칙이 일치한다.

`gateShareEvents`가 하는 일:

| 판정 | 처리 |
|---|---|
| `extensionApplies === false` | `extensionInfo` **제거** + **D4-1 폴딩** |
| `conversionApplies === false` | `houseToCommercialConversion`·`conversionDate`·`wasMultiHouseAtConversion` **제거** |
| 최초공시 | **무처리** — D4-2 |

### D4-1. 🔴 증축 미적용 지분의 **양도측 기준시가 폴딩** (C-08 — 세액 직결)

`extensionInfo`를 제거하면 2파트 경로로 가는데, 그 경로는 `transferBuildingStdPrice` **하나**만
읽는다. 그대로 두면 안분 분모에서 증축분이 사라져 **건물 양도가액이 과소 안분**된다.

```
transferBuildingStdPrice += extensionInfo.transferExtensionBuildingStdPrice
```

**취득측은 폴딩하지 않는다.** `acquisitionBuildingStdPrice`는 **지분-수준**이고, 사용자는
그 지분 취득시점(= 증축 완료 후)의 **건물 전체** 기준시가를 입력하기 때문이다.
이 **비대칭**이 GBF-09가 지키는 핵심이다 — 양쪽 다 더하면 환산 분자가 이중 계상된다.

### D4-2. 최초공시(§99-164-10)는 분기하지 않는다

날짜 필드가 없고(`hasFirstDisclosure` boolean 하나 — `general-building-converted-housing.ts:47`),
산식 분자의 취득당시 기준시가가 지분-수준이라 **지분마다 다른 환산주택가격이 자동으로 나온다**.
3필드는 물건-수준으로 전 지분 공유. **추가 로직 없음.**

---

## D5. 알고리즘 — cards 병합

`app/api/calc/transfer/general-building-fractional.ts` (신규):

```ts
export function calculateGeneralBuildingFractional(
  shares: GeneralBuildingSharePayload[],
  totalTransferPrice: number,      // 물건 전체(100%) 양도가액
  transferDate: Date,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const allCards: AssetCardForAggregate[] = [];
  const allApportioned: BundledLikeApportionmentResult["apportioned"] = [];
  let allocatedSum = 0;

  shares.forEach((s, k) => {
    // (1) 지분 양도가액 — 마지막 지분이 잔액 흡수 (Σ = total 불변식)
    const sharePrice = k === shares.length - 1
      ? totalTransferPrice - allocatedSum
      : applyRatio(totalTransferPrice, s.ownershipRatio);
    allocatedSum += sharePrice;

    // (2) 물건 사건 게이팅(D4) → 그 지분의 cards. 기존 두 경로를 **그대로** 재사용
    const gbv = gateShareEvents({ ...s.valuation, totalTransferPrice: sharePrice },
                                buildingAcqDateOf(s));
    const { cards, nonBusinessRatio } = buildShareCards(gbv, transferDate);

    // (3) §97②2호 swap — 지분 루프 **안에서** 기존 함수 호출 ⇒ 지분 × 파트 2차원
    const swap = resolveGeneralBuildingSwap(cards, s.capitalExpenditure, s.transferExpense, partAxis(s));

    // (4) propertyId 접미사 — 지분 간 충돌·swap Map 오귀속 방지
    const tagged = cards.map((c) => ({ ...c, propertyId: `${c.propertyId}#${k}`,
                                             propertyLabel: `${s.shareLabel} ${c.propertyLabel}` }));
    allCards.push(...buildProperties(tagged, nonBusinessRatio, remapSwap(swap, k)));
    allApportioned.push(...buildApportionment(tagged, …, swap).apportioned);
  });

  // (5) aggregate는 **1회만** — 기본공제 250만원·§104⑤ 비교과세가 전 지분에 걸쳐 1번 적용된다
  const aggregated = calculateTransferTaxAggregate(
    { taxYear, properties: allCards, annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT", priorReductionUsage },
    rates,
  );
  …
}
```

### D5-1. 안분 순서 — **지분 먼저, 그다음 §166⑥**

「총양도가 × r_k → 토지·건물 안분」으로 **고정**한다. 반대 순서는 floor 절사 위치가 달라
1원 단위로 갈린다. 지분이 먼저 확정되고 그 안에서 §166⑥이 적용되는 것이 법 구조에 맞다.

### D5-2. `propertyId` 접미사 규칙

- 지분 ≥ 2일 때만 `#k`를 붙인다. **지분 1개(단건)는 무접미사** ⇒ 기존 anchor·E2E 셀렉터 불변.
- `swap.allocation`·`swap.addition`은 `Map<propertyId, …>`(`general-building-route-cards.ts:56,62`)라
  **접미사와 같은 시점에 remap**해야 한다. 순서가 어긋나면 swap이 조용히 미적용된다.
- 「파트 내부 카드 합산 후 배분」(`general-building-swap.ts` 헤더)은 **지분 루프 안**에서
  그 지분 카드만 보고 일어나므로 지분을 넘나들 수 없다 — 구조적 보장.

### D5-3. `buildApportionment` 분모·잔액 (계획서 §3-2-d)

지분마다 `buildApportionment`를 따로 호출하므로
`totalStandardAtTransfer`·`displayRatio`는 **그 지분 안에서** 계산된다(의미가 맞다 —
「이 지분의 양도가액 중 토지가 차지하는 비율」). 상위 결과의
`totalStandardAtTransfer`는 **지분 합**, `residualAbsorbedBy`는 **마지막 지분의 첫 카드**로 채운다.

### D5-3-1. 🆕 `swapApplied` · `swapComparison`의 **지분 간 병합** (GBF-11 작성 중 발견)

단건 경로는 swap 발동 시 `aggregated.swapApplied = true`와
`swapComparison { estimatedSide, directSide, chosen }`를 채운다
(`general-building-route-helper.ts:304~318`). 이때 **파트 단위 판정에서는 발동한 파트만 합산**한다
— 미발동 파트까지 더하면 표시와 실제 채택액이 어긋나기 때문이다
(메모리 `feedback_engine_result_display_drift`).

**지분 축에도 같은 규칙을 적용한다**:

```
swapApplied    = 어느 한 지분·파트라도 발동했으면 true
swapComparison = 발동한 (지분 × 파트)만 estimatedSide·directSide 합산
```

미발동 지분(예: 실가 지분 전체)의 가목·나목을 더하면 화면 금액이 채택액과 어긋난다.

### D5-4. `buildShareCards` — 두 경로 재사용

```
s.valuation.actualPriceMode === true
  → 경로 B: buildActualGeneralBuildingCards(…)   ← Phase A에서 추출
  → 그 외  : buildGeneralBuildingAssetCards(…)   ← 이미 cards 반환 (분리 불요)
```

---

## D6. route 분기

```ts
// app/api/calc/transfer/route.ts — 5-a(일괄, :166) **앞**
if (data.generalBuildingShares && data.generalBuildingShares.length > 1) {
  const { apportionment, aggregated } = calculateGeneralBuildingFractional(
    data.generalBuildingShares,
    data.totalPropertyTransferPrice ?? data.transferPrice,   // 물건 전체 양도가액
    transferDate, transferDate.getFullYear(),
    data.annualBasicDeductionUsed, data.priorReductionUsage ?? [], rates,
  );
  return NextResponse.json({ data: { mode: "bundled" as const, apportionment, aggregated } }, { status: 200 });
}
```

- 조건에 `propertyType === "general_building"`을 **명시하지 않아도** 배열 자체가 GB 전용이라
  다른 특수 경로를 삼킬 수 없다. 다만 **방어적으로 함께 검사**한다
  (메모리 `feedback_route_if_chain_order_swallows_branches`).
- `mode: "bundled"`를 유지해 결과뷰·사이드바가 기존 경로를 그대로 쓴다(⑦ 변경 최소화).

---

## D7. ⑧ validate (Phase G)

`lib/calc/transfer-tax-validate.ts:75~80`의 `general_building` 차단 **제거**
(`commercial_building`·`redevelopment_apt`는 **유지**). 대신:

**Phase G의 실질 작업은 「자산종류 차단 한 줄 제거」뿐이다** — 나머지는 기존 로직이 이미 커버한다.
아래는 anchor 실행(2026-08-10)으로 **실측 확인**한 것이다.

| 검증 | 상태 | 근거 |
|---|---|---|
| **자산종류 차단 제거** | 🔨 **해야 할 일** — `transfer-tax-validate.ts:75~80`의 `general_building`만 뺀다(`commercial_building`·`redevelopment_apt`는 유지) | GBF-13 |
| **상속 지분 추계 차단** (C-18) | ✅ **이미 지분별로 동작** — 추가 작업 **불요** | GBF-12 (green) |
| 지분마다 GB 필수필드 | ✅ 이미 전 자산 루프 | 같은 근거 |
| 지분율 합계 100% | ✅ 기존 `:161~173` 재사용 | GBF-15 (green) |
| 부담부증여·공익수용 차단 | ⏳ Phase G 후 **자동 노출** (아래 D7-1) | GBF-14 (`it.fails`) |
| 물건-수준 필드 지분 간 동일성 | 🔨 신규 — Zod superRefine과 **같은 목록**을 클라에도 | — |

### D7-1. 🔴 설계 D7 초안의 오류 2건 (anchor가 잡았다)

**(a) 「상속 파트 추계 차단이 primary만 검사한다」— 틀렸다.**
`collectStepIssues`의 자산 루프(`transfer-tax-validate.ts:136~143`)가 **전 자산**에
`validateAssetEntry`를 돌리고, 지분 companion은 `mergePrimaryBasic`이 `assetKind`를 채워주므로
`validateGeneralBuildingAsset`에 그대로 도달한다. **GBF-12는 지금도 green이다.**

**(b) 「부담부증여·공익수용 차단은 지금도 뜬다」— 틀렸다.**
`collectStepIssues:72~88`은 **if-else 체인**이고 자산종류 분기(`:75~80`)가 부담부증여
분기(`:81~87`)보다 **앞**이다. 일반건물이면 앞이 먼저 잡아 뒤가 실행되지 않는다.
⇒ **Phase G가 앞 분기에서 `general_building`을 빼는 순간 뒤로 흘러가 자동 노출**된다.
「별도 작업 불요」라는 결론은 유지되지만 **메커니즘이 「유지」가 아니라 「복원」**이다.
GBF-14가 `it.fails`로 그 전환을 강제한다.

> UI 게이트(`AssetSectionAcquisition.tsx:75~81`)도 같은 if-else 구조라 동일하게 동작한다.

---

## D8. 파일 분해 · 800줄 정책

| 파일 | 현재 | 변화 |
|---|---|---|
| `general-building-route-actual.ts` | 537 | **감소** (Phase A로 cards 조립 추출) |
| `general-building-route-helper.ts` | 335 | 소폭 증가 (cards 반환 지점) |
| `general-building-fractional.ts` | — | **신규** (착지 목표 ≤700) |
| `general-building-share-events.ts` | — | **신규** (D4, 순수 함수 leaf ~80줄) |
| `transfer-tax-api-gb.ts` | 547 | 증가 → **≥750이면 지분 변환을 `-gb-shares.ts`로 분리** |
| `transfer-tax-building-schemas.ts` | 414 | 증가 (share 스키마) |

---

## D9. Phase 순서 (계획서 §5 확정)

```
A 경로 B cards 추출 ──┐
B 경로 A cards 노출 ──┤
D4 물건사건 leaf ─────┼→ C 지분 루프 → D route 분기 → E Zod → F API 변환 → G validate → H UI → I 결과 → J E2E
```

**F → H 순서 고정** — H가 F의 `mergeGbPropertyLevel` 목록에 의존한다.
**G → H 순서 고정** — 반대면 UI만 열려 사용자에게 오류만 뜬다.

---

## D10. 미결 · 재확인 여지

| # | 항목 | 처리 |
|---|---|---|
| 1 | §3-3·§3-4 결론의 근거 등급이 **실무 확정 + 법문 구조**이고 **예규는 0건** | 예규 발견 시 계획서 §8 표 갱신. 세액 갈림 지점은 GBF-09·11·12로 고정 |
| 2 | 최초공시 토글이 「최초공시 後 취득 지분」에 오적용될 위험 | **현행 단건에도 동일** — 범위 밖(Surgical). 관찰만 |
| 3 | 의제취득일 前 상속(§97②1호 나목·영 §163⑨2호) | 현행 단건의 기존 논점 — 범위 밖. 환산이 아니므로 D3·D7 결론 불변 |
| 4 | 지분 분할 × 부담부증여·공익수용 | **범위 밖**(계획서 §2-2). 전 자산종류 공통 축으로 별건 |
| 5 | 지분별 **감면**(reductions) | GB는 현재도 파트에 감면을 싣지 않는다(`route-cards.ts:86` `reductions: []`) — 이 작업에서 넓히지 않음 |

---

---

## 개정 1 (2026-08-10) — Pre-Do anchor 실행 환류

anchor 2파일을 작성·실행했다 (**12 green / 19 expected-fail**, 스위트 green 유지):
- `__tests__/api/transfer.route.gb-fractional.predo.anchor.test.ts` — GBF-01~06·09~11
- `__tests__/calc/gb-fractional-validate.predo.anchor.test.ts` — GBF-12~15

**설계 가정 2건이 실행으로 뒤집혔다** (D7-1)
1. 상속 지분 추계 차단은 **이미 지분별로 동작**한다 → Phase G 작업 **1건 감소**
2. 부담부증여·공익수용 차단은 **지금은 안 뜬다**(if-else 앞 분기가 삼킴) → Phase G 후 **자동 복원**

**설계 누락 1건 발견** (D5-3-1)
- `swapApplied`·`swapComparison`의 **지분 간 병합 규칙**이 설계에 없었다 → 발동분만 합산으로 확정

**anchor 설계 교훈 1건**
- 「Σ allocatedSalePrice === 총양도가」는 **단건 경로에서도 참**이라 판별력이 없었다
  (`it.fails`가 「Expect test to fail」로 되레 실패). 순수 불변식은 green 가드로 두고,
  **카드 수(4장)와 결합**해야 지분 축 도달을 판별한다
  (메모리 `feedback_anchor_observes_wrong_stage`).

**Phase G 범위 축소 반영**: 실질 작업은 「자산종류 차단 한 줄 제거」 + 「물건-수준 동일성 클라 검증」뿐.

---

## 개정 2 (2026-08-10) — Do 착지 환류

전 Phase 구현 완료. **전체 1,304파일 14,543 테스트 통과 · tsc 0 · lint 0 errors.**

### 설계 대비 바뀐 것

| # | 설계 초안 | 구현 |
|---|---|---|
| 1 | (없음) | 🔴 **Date 변환 누락** — 지분 경로가 `dispatchGeneralBuilding`의 Date 변환을 통째로 건너뛰어 `conversionDate`가 문자열로 도달, `getTime is not a function` **500**. ⇒ `coerceGeneralBuildingPayload()`를 **공용 추출**해 단건·지분이 공유 |
| 2 | (없음) | 🔴 **결과 카드 크래시** — `GeneralBuildingValuationDetailCard:415`가 `detail.buildingFootprintArea.toFixed(2)`를 **가드 없이** 읽는다. ⇒ fractional detail을 첫 지분의 완전한 `gbOut`으로 채우고, 실가 경로에 `nblDetail` 반환을 추가 |
| 3 | share 레벨 `capitalExpenditure`·`transferExpense` | **제거**. `buildGeneralBuildingValuation`이 이미 `valuation`에 넣고 `applyShareScale`이 × r 한다 — 두 곳에 두면 **단일 진실 위반** |
| 4 | `PROPERTY_LEVEL_PATHS` | 이름 `GB_SHARE_PROPERTY_LEVEL_PATHS`(Zod, 경로 29개) ↔ `GB_PROPERTY_LEVEL_FORM_FIELDS`(폼, **30개**) 두 축. 개수 가드는 폼 쪽에 GBF-19 |

### 부수 처리

- **800줄 정책**: `transfer-tax-schema.ts`가 807줄이 되어 §155⑳ 클러스터를
  `transfer-tax-schema-rental-exception.ts` leaf로 분리(**807 → 769**). 전량 re-export라 소비처 무변경.
  > ⚠️ 착지가 **769**로 ≤700 목표에는 못 미친다. 더 깊은 이음매(`propertyBaseShape` 373줄 추출)는
  > `transfer-tax-schema-sub.ts` ↔ `transfer-tax-schema.ts` **기존 import 순환**에 얽혀 있어
  > 이 작업 범위 밖으로 남긴다(별건 리팩터).

### 실측으로 확인한 기존 동작 (검증 대상 아님)

- LTHD 연수 산정이 **(실제 연수 − 1)** 로 나온다(2020→2024 = 3년 6%). **단건 경로도 동일**하므로
  이 작업의 회귀가 아니다. GBF-10은 절대 공제율 대신 **ON/OFF 차분**으로 판정하도록 바꿨다.
- 용도변경 LTHD 기산일 이동은 **`wasMultiHouseAtConversion: true`일 때만** 일어난다.
  `false`로는 게이트를 검증할 수 없어 anchor 픽스처를 `true`로 정정했다.

### anchor 최종 (48건 green)

| 파일 | 건수 | 범위 |
|---|---|---|
| `__tests__/api/transfer.route.gb-fractional.predo.anchor.test.ts` | 21 | GBF-01~06·09~11 (route) |
| `__tests__/calc/gb-fractional-api-shares.anchor.test.ts` | 17 | GBF-05·16~19 (④ 변환) |
| `__tests__/calc/gb-fractional-validate.predo.anchor.test.ts` | 10 | GBF-12~15 (⑧ validate) |

---

## 개정 3 (2026-08-10) — E2E·브라우저 확인 환류

`e2e/general-building-fractional-share.spec.ts` 3건(GBF-07·08·20) 신설.
**vitest anchor 48건이 전부 green인 상태에서 E2E가 결함 2건, 스크린샷이 2건을 더 잡았다.**

### 왜 vitest가 못 잡았나

anchor는 **payload를 손으로 만들어** route·변환기를 호출한다. 그래서
「폼에서 그 payload가 실제로 만들어지는가」와 「입력 UI가 렌더되는가」를 검증하지 못한다.

| # | 결함 | 계층 | 잡은 도구 |
|---|---|---|---|
| ① | `SINGLE_ONLY`(함께양도 차단)가 **지분 분할까지** 막아 계산 자체가 불가 | ⑧ validate | E2E |
| ② | validate가 **UI에서 숨긴** 물건-수준 필드를 요구 → 「자산 2: 토지면적을 입력하세요」 | ⑧ validate | E2E |
| ③ | 지분 카드에 NBL **「용도지역 (필수)」** 노출 — 실제로는 병합돼 통과하는데 **거짓 경고** | ⑤ UI | 스크린샷 |
| ④ | 카드 제목이 **「자산 2 — 주택」** (③ 본문은 일반건물) — 한 카드가 두 자산종류를 말함 | ⑤ UI | 스크린샷 |

**①②의 공통 뿌리**: `collectStepIssues`에는 차단 블록이 **둘**인데(지분 모드 / 함께양도) 앞의 것만 고쳤고,
자산별 검증 루프의 병합이 `mergePrimaryBasic`(7키)이라 GB 물건-수준을 못 채웠다.
⇒ 루프도 ④ API와 **같은 함수**(`mergeGbPropertyLevel`)를 쓰도록 통일했다.

**③④의 공통 뿌리**: 「물건-수준은 지분 카드에서 숨긴다」를 **입력 칸에만** 적용하고
**판정 섹션·카드 제목**에는 적용하지 않았다.

### 추가된 계약

- anchor **GBF-21** — `SINGLE_ONLY`는 함께양도 전용(양성 대조군: 지분율 100% 2건은 계속 차단)
- anchor **GBF-22** — 화면에 없는 칸을 validate가 요구하지 않는다(양성 대조군: 지분 고유 필수값은 계속 차단)
- E2E **GBF-07** — 지분 카드 ③에 GB 취득 입력이 **렌더된다**(assetKind 주입 회귀 방어)
- E2E **GBF-08** — 양도측·물건사건이 **없다** + 자산1 양성 대조군
- E2E **GBF-20** — 폼 → `generalBuildingShares` 전송 → 200 → 4파트, `companionAssets` 미전송

### 브라우저 손 검산 (mock 세율표)

지분 60%(2009 매매·환산) + 40%(2015 매매·환산), 총 양도가 10억:

| | 양도가액 | 환산취득가 | 개산공제 |
|---|---|---|---|
| A 토지 | 300,000,000 | 150,000,000 | `floor(100M × 0.6 × 3%)` = 1,800,000 |
| A 건물 | 300,000,000 | 150,000,000 | 1,800,000 |
| B 토지 | 200,000,000 | `200M × 150M/200M` = 150,000,000 | `floor(150M × 0.4 × 3%)` = 1,800,000 |
| B 건물 | 200,000,000 | 150,000,000 | 1,800,000 |
| **합** | **1,000,000,000** | **600,000,000** | **7,200,000** |

화면 표시값과 **원 단위 일치** — 양도차익 392,800,000.

**최종**: vitest 14,548 통과 · tsc 0 · lint 0 errors · 일반건물 E2E **37건**(기존 34 + 신규 3) 통과.

---

## 자가 점검 (완료 보고 전)

- [ ] 케이스 인벤토리 C-01~C-20 전 행 anchor 존재
- [ ] Pre-Do anchor GBF-01~GBF-12 작성·실패 확인 후 착수
- [ ] 14 동기화 지점 — 특히 ⑫⑬⑭ grep 자가 점검
- [ ] `PROPERTY_LEVEL_PATHS` ↔ `mergeGbPropertyLevel` 매핑 개수 가드 (payload 키 ↔ `AssetForm` `gb*` 필드명이 **다르다**)
- [ ] `extensionInfo.actualAcquisitionPrice`·`.actualExpenses`가 동일성 목록에 **없는지** (있으면 × r과 충돌)
- [ ] `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer/`
- [ ] E2E는 **워크트리에서 `E2E_PORT` 지정** (메모리 `feedback_worktree_e2e_port_isolation`)
- [ ] 브라우저 수동 확인 (지분 카드 ③에 취득시 기준시가 렌더 · Network 탭 `generalBuildingShares` 확인)
