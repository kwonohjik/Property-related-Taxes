# 일반건물(토지+건물 일괄) × 지분(%) 분할 취득 지원 — 계획

**작성**: 2026-08-10 · **개정 1**: 2026-08-10 (자가검토 — §9) · **브랜치**: `worktree-gb-split-acq` · **세목**: 양도소득세
**요청**: ③ 취득정보의 「같은 물건을 지분(%)별로 나눠 취득했나요?」 토글이 `assetKind === "general_building"`에서 비활성 — 활성화.

**범위 확정 (사용자 승인, 2026-08-10)**
- **일반건물 축 전면 지원** — §2-1 전 행
- **부담부증여·공익수용 × 지분 분할은 범위 밖** — 전 자산종류 공통 축이라 별건 (§2-2)
- 진행: **계획·설계 문서 선행**

---

## 1. 현행 실측 — 「토글만 풀면 되는 일」이 아니다

### 1-1. 토글만 풀면 **400**으로 죽는다 (probe 실측 · 침묵 오산 아님)

라우트를 직접 호출하는 throwaway probe로 확인했다(검증 후 삭제).

지분 2번째 자산은 `companionAssets[]`로 실린다. `buildAssetPayload`가
`assetKind: toEngineAssetKind(asset.assetKind)`를 그대로 넣는데
(`lib/calc/transfer-tax-api-helpers.ts:565` · `toEngineAssetKind`는 `general_building`을 통과시킨다 — 같은 파일 `:287~292`),
companion Zod enum은 3종만 받는다(`lib/api/transfer-tax-schema-sub.ts:289`).

```
POST /api/calc/transfer  →  400
{"code":"INVALID_INPUT",
 "fieldErrors":{"companionAssets.0.assetKind":
   ["Invalid option: expected one of \"housing\"|\"land\"|\"building\""]}}
```

대조군(단건 100% 일반건물)은 `200` · `mode: "bundled"` · `generalBuildingValuationDetail` 존재로 정상이다.

### 1-2. enum을 넓혀도 **일반건물 계산이 통째로 사라진다** — 독립된 두 이유

> 📌 아래 두 항은 **이 probe로 측정한 것이 아니다**(400에서 멈춰 도달하지 못했다).
> **코드 독해 + 기존 회귀 테스트**가 근거다 — 착수 시 GBF-01이 이것을 실측으로 승격시킨다.

| # | 원인 | 근거 |
|---|---|---|
| a | `companionAssets` 스키마에 `generalBuildingValuation`이 **없다**. GB 페이로드는 top-level 1개(primary)만 만들어진다 | `lib/calc/transfer-tax-api.ts:640` · `lib/api/transfer-tax-schema.ts:441`(top-level) ↔ `:364`(companion 배열) |
| b | `route.ts` if-체인이 **5-a 일괄(`:166`) → 5-a-2 겸용(`:288`) → 5-a-3 일반건물(`:361`) → 5-b 단건(`:423`)** 순서다. 앞에서 `return`하면(`:275`) 뒤는 실행조차 안 된다 | `app/api/calc/transfer/route.ts` |

**(b)의 진입 조건을 정확히** — 「companion이 하나라도 있으면」이 아니다.
`bundledOk`(`route.ts:154~164`)는 `companions.length > 0 && totalSalePrice !== undefined && (…)`이고,
지분 모드는 `isFractionalBundle`(`:149`)이 참이라 세 번째 괄호를 자동 통과한다.
⇒ **지분 모드에서는 항상 5-a로 빨려 들어간다.**

(b)는 이미 알려진 결함이고 회귀 테스트가 문서화하고 있다 —
`__tests__/api/transfer.route.bundled-swallows-special.test.ts` 「🔴 일반건물 — 단건 토지·건물 분리 안분이 함께양도에서 소실」.
(⚠️ 그 파일 헤더의 `:446/:568/:611/:660`은 **구버전 줄번호**다. 현행은 위 표의 값.)

⇒ 현행 UI의 「이 자산 종류는 지분 분할 취득을 지원하지 않습니다」
(`components/calc/transfer/asset-sections/AssetSectionAcquisition.tsx:78`)와
validate 차단(`lib/calc/transfer-tax-validate.ts:75~80`)은 **정확한 안내**다. 같은 이유로
`general_building`은 「함께 양도」에서도 차단돼 있다(`transfer-tax-validate.ts:120`).

> 🔑 **차단을 푸는 것이 아니라, 차단의 근거를 없애는 것**이 이 작업이다.
> 배관을 만들기 전에 UI 게이트만 풀면 400이거나(1-1) 세액이 조용히 틀린다(1-2).

---

## 2. 범위

### 2-1. 이 계획의 범위 (일반건물 축 — 전면)

| 축 | 현행 단건 지원 | 지분 분할에서도 지원 |
|---|---|---|
| 파트별 취득방식 4-way (`landAcqMode`/`buildingAcqMode` = actual·estimated·appraisal·salesCase) | ✅ `calc-wizard-asset.ts:436~438` | ✅ |
| 환산취득가 §176의2② + 개산공제 §163⑥ (경로 A) | ✅ `general-building-route-helper.ts:243` | ✅ |
| 실거래가 경로 (경로 B) | ✅ `general-building-route-actual.ts:135` | ✅ |
| 토지·건물 취득일 분리 (M-1a) | ✅ `hasSeperateLandAcquisitionDate` | ✅ |
| §163⑨ 상속·증여 취득가액 직접 산정 | ✅ `transfer-tax-api-gb.ts:330~343` | ✅ |
| 증축 3파트 (사례 33) | ✅ `general-building-extension.ts` | ✅ 지분별 前/後 자동 판정 (§3-3-1) |
| 주택→상가 용도변경 (사례 35) | ✅ `gbHouseToCommercialConversion` | ✅ 지분별 前/後 자동 판정 (§3-3-2) |
| §99-164-10 환산주택가격 최초공시 | ✅ `gbHasFirstDisclosure` | ✅ 분기 불요 — 산식이 이미 지분별 (§3-3-3) |
| NBL 부수토지 한도 초과 분리 (지방세령 §101①2호) | ✅ `nonBusinessRatio` | ✅ |
| §97②2호 단서 swap | ✅ `general-building-swap.ts` | ✅ **지분 × 파트 2차원** (§3-4) |
| 이월과세 §97의2 (토지 파트) | ✅ `landCarryoverTaxation` | ✅ |

### 2-2. 범위 밖 — 별건 (사용자 승인)

`transfer-tax-validate.ts:81~87`의 부담부증여·공익수용 차단은 **자산종류와 무관한 전역 차단**이다
(주택·토지 지분 분할에도 똑같이 걸린다). 사유도 다르다 — 「지분 분할 양도가액 = 총양도가 × 지분율」이
§159 인수채무액·보상가액 모델과 스케일 충돌한다.

⇒ **이 계획은 건드리지 않는다.** 일반건물에서만 풀면 주택·토지와 규칙이 갈라진다.
필요하면 「지분 분할 × 부담부증여·공익수용」을 전 자산종류 공통 축으로 별도 계획한다.

> 📌 UI에서도 이 조합은 **계속 차단**된다. `AssetSectionAcquisition.tsx:79~81`의
> 부담부증여·공익수용 차단 분기는 `general_building` 분기를 제거해도 **그대로 남는다**
> (if-else 체인이라 앞 분기만 빠지면 뒤로 흘러간다) — 별도 작업 불요.

---

## 3. 핵심 설계 결정

### 3-1. 필드 축 분류 — **물건-수준 ↔ 지분-수준** (이 작업의 심장)

**물건-수준 (전 지분 공통 — primary에서 병합)**

| 필드 | 근거 |
|---|---|
| `gbLandArea` · `gbBuildingArea` · `gbBuildingFootprintArea` | 물건 전체(100%) 면적. `calc-wizard-asset-gb.ts:18~28`이 **2시점 확장 금지**를 명시 — 지분 축으로도 나누지 않는다 |
| `gbTransferLandPricePerSqm` · `gbTransferBuildingValue` · `gbTransferExtensionBuildingStdPrice` | 양도 시점은 하나뿐 |
| `gbZoneType` · `gbIsMetropolitan` · `gbIsUnregistered` | 물건 속성 (NBL 배율 판정) |
| `saleSplitMode` · `landTransferPrice` · `buildingTransferPrice` · `land/buildingAppraisalAtTransfer` · `appraisalDateAtTransfer` | 양도 계약 단위 (`calc-wizard-asset.ts:459~489`) |

**지분-수준 (지분마다 다름 — 지분 카드 고유)**

| 필드 | 근거 |
|---|---|
| `acquisitionDate`(건물) · `landAcquisitionDate`(토지) · `hasSeperateLandAcquisitionDate` | M-1a 규약 (`calc-wizard-asset-gb.ts:77~81`) |
| `acquisitionCause`(토지) · `gbBuildingAcquisitionCause`(건물) | 지분별 취득원인이 다른 것이 이 기능의 존재 이유 |
| `gbAcqLandPricePerSqm` · `gbAcqBuildingValue` | **취득 시점이 지분마다 다르므로 취득시 기준시가도 다르다** |
| `landAcqMode`/`buildingAcqMode` · `land/buildingAcquisitionPrice` · `land/buildingDirectExpenses` | 파트별 4-way |
| `fixedAcquisitionPrice` · `gbBundledAcquisitionExpenses` | |
| `decedentAcquisitionDate` · `donorAcquisitionDate` · `publishedValueAtInheritance` · `gbBuildingInheritedValue` | 상속·증여 보조 |
| `landCarryoverTaxation` | 이월과세 |
| `ownershipNumerator`/`ownershipDenominator` | 지분율 자체 |

**판정 보류 — §3-3**: 증축 6필드 · 용도변경 3필드 · 최초공시 4필드.

### 3-2. 아키텍처 — **cards 병합**이 자연 이음매다

두 경로가 **같은 중간 산출물**로 수렴한다:

```
경로 A(환산): buildGeneralBuildingAssetCards(gbv) → gbOut.assetCards
경로 B(실가): general-building-route-actual.ts:435~457 인라인 조립 → cards
                                 ↓
   AssetCardForAggregate[]  →  buildProperties(cards, nbl, swap)  →  calculateTransferTaxAggregate
                            →  buildApportionment(cards, …)
```

(`general-building-route-cards.ts:47`·`:138` · 경로 B aggregate는 `general-building-route-actual.ts:492~493`,
경로 A는 `general-building-route-helper.ts:282~293`)

⇒ **지분별로 cards를 만들어 concat한 뒤 aggregate를 1회만 호출**한다.

```
for each 지분 k (ratio r_k):
    gbv_k = mergePropertyLevel(share_k, primary)   // §3-1 물건-수준 병합
    gbv_k = applyShareScale(gbv_k, r_k)            // §3-5 — 스케일 대상 엄선
    cards_k = buildCards(gbv_k)                    // 2~3장
    cards_k.propertyId += `#${k}`                  // §3-2-a 충돌 회피
cards = concat(cards_0 … cards_n)
aggregated = calculateTransferTaxAggregate({ properties: buildProperties(cards, …) })
```

**(a) `propertyId` 충돌은 실재한다.** 현행 id는 고정 리터럴이다 —
`land`·`land_business`·`land_nbl`(`general-building-valuation.ts:393,416,435,455`),
`building`(`:483`), `building1`/`building2`(`general-building-extension.ts:488,526`),
실가 경로도 동일(`general-building-route-actual.ts:435~457`).
접미사 없이 concat하면 두 item이 같은 id를 갖고
`swap.allocation`(`Map<propertyId,…>`)이 지분을 구분하지 못한다(`general-building-route-cards.ts:56`).

**(b) 기존 단건 경로의 id는 바꾸지 않는다.** 지분 1개(=단건)면 접미사 미부착 → 회귀 0.

**(c) 리팩터 필요 지점** — 두 경로 모두 「cards → aggregate」를 내부에서 끝낸다.
- 경로 A: `buildGeneralBuildingAssetCards`가 이미 cards를 반환하므로 **분리 불요**.
  `swap`·`nonBusinessRatio`를 함께 꺼낼 지점만 필요(`general-building-route-helper.ts:256~282`).
- 경로 B: `calculateGeneralBuildingActualTransfer`(`:135`~, 파일 537줄) 안에 cards 조립이
  인라인(`:435~457`)이고 곧바로 aggregate(`:492`). **`buildActualGeneralBuildingCards()` 추출 필요.**

**(d) `buildApportionment`의 분모·잔액 흡수**를 지분 축으로 재검토해야 한다.
`totalStandardAtTransfer`(`route-cards.ts:181`) · `displayRatio = stdAtTransfer / totalStandAtTransfer`(`:174`) ·
`residualAbsorbedBy: cards[0]?.propertyId`(`:182`) — 전부 단일 지분 전제다.

**(e) 기본공제 배분은 손대지 않아도 된다.** 두 경로 모두 `basicDeductionAllocation: "MAX_BENEFIT"`이고
(`route-helper.ts:289` · `route-actual.ts:498`), aggregate를 **1회만** 부르므로 250만원도 1회만 적용된다.

**(f) 안분과 지분의 순서 = floor 절사 위치.** 「총양도가 × r_k → 토지·건물 안분」과
「토지·건물 안분 → × r_k」는 1원 단위로 갈릴 수 있다. **전자로 고정**한다 — 지분이 먼저 확정되고
그 안에서 §166⑥이 적용되는 것이 법 구조에 맞다. Σ(지분 양도가액) = 총양도가 불변식은
GBF-03이 지킨다(마지막 지분이 잔액 흡수).

### 3-3. ✅ **확정** — 「물건 사건」은 primary 1회 입력 + **지분별 前/後 자동 판정**

> ✅ **2026-08-10 실무 확정**(세무 담당 사용자):
> 「1-a: 40% 지분은 **증축이 완료된 건물 취득**임 / 1-b: 장기보유특별공제 **기산일은 지분 취득일**」
> ⇒ 아래 (1)(2)의 ㉯가 **확정**됐다. 근거 등급은 **실무 판단 + 법령·코드 구조**이며 예규는 아니다.

증축·용도변경·최초공시는 **물건에 일어난 사건**이지 지분에 일어난 사건이 아니다.
조사 결과 **세 사건이 서로 다르게 갈린다** — 하나의 규칙으로 묶으면 틀린다.

#### (1) 증축 (`gbHasExtension`, 사례 33) — 前/後 자동 판정 **가능**

| 지분 취득일 vs 증축일 | 처리 |
|---|---|
| 취득일 **<** 증축일 | **3파트**(토지·건물1·건물2). 건물2 취득일 = 증축일 |
| 취득일 **≥** 증축일 | **2파트**. 증축분을 포함한 건물 전체를 그 날 취득 — 증축 모델 미적용 |

**근거 (전부 코드·법령 실측)**
- 건물2 카드의 `acquisitionDate = ext.extensionDate`이고 §114조의2 5년 기산점도 증축일이다
  (`general-building-extension.ts:535,542`). ⇒ **증축일에 아무것도 취득하지 않은 지분**에는 성립할 수 없다.
- 현행 validate가 이미 「증축일은 토지·건물1 취득일 중 늦은 날 이후여야 한다」를 **강제**한다
  (`transfer-tax-validate-gb.ts:538~547`). ⇒ 증축 後 취득 지분에 3파트를 적용하는 것은 **현행 규칙 위반**이다.
- 취득시기는 지분별로 각각 정해진다 — 「소득세법」 제98조 · 같은 법 시행령 제162조 제1항.

> 🔴 **2파트로 빠지는 지분은 기준시가를 합산해 넣어야 한다.** 2파트 경로는
> `transferBuildingStdPrice` **하나**만 쓴다(`general-building-valuation.ts`). 지분 B의
> 양도가 안분 분모·환산 분자에는 **본체 + 증축분 합산** 기준시가가 들어가야 한다
> (`gbTransferBuildingValue + gbTransferExtensionBuildingStdPrice`, 취득측도 동일).
> 그냥 본체 값만 넣으면 **건물 양도가액이 과소 안분**된다. 설계에서 명시 배선.

#### (2) 주택→상가 용도변경 (사례 35) — 前/後 자동 판정 **가능**

`gbConversionDate`가 있고, 하한이 **건물 취득일**임을 validate가 명시한다
(`transfer-tax-validate-gb.ts:555~559` — 「용도변경은 **건물**의 공부상 용도를 바꾸는 사건 → 하한은 건물 취득일」).

⇒ 지분 취득일 **≥** 용도변경일이면 그 지분은 **애초에 상가로 취득**한 것이다 → 미적용
(적용하면 LTHD 기산일이 취득일보다 앞서 **공제 과대**).

#### (3) §99-164-10 최초공시 (`gbHasFirstDisclosure`) — ⚠️ **前/後 판정이 불가능하고, 필요도 없다**

> **개정 2 정정**: 초판·개정 1은 「최초공시일 前後로 환산 산식이 갈린다」고 썼다. **틀렸다.**

- **최초공시「일」 필드가 존재하지 않는다.** 입력은 `gbFirstDisclosurePrice`(최초공시주택가격) ·
  `gbFirstDisclosureLandStdPrice` · `gbFirstDisclosureBuildingStdPrice` **3개뿐**이고
  엔진 게이트도 `if (!input.hasFirstDisclosure) return input`**만**이다
  (`general-building-converted-housing.ts:47`). 비교할 날짜가 없다.
- 산식은
  `환산주택가격 = 최초공시주택가격 × (취득당시 토지+건물 기준시가) ÷ (최초공시당시 토지+건물 기준시가)`
  (`general-building-converted-housing.ts:21~33`).
  분자의 **취득당시 기준시가가 지분-수준**(§3-1)이므로 **지분마다 다른 환산주택가격이 자동으로 나온다.**

⇒ 최초공시 3필드는 **물건-수준 공유**, 적용 여부는 **현행처럼 사용자 토글 1개**.
지분별 분기 로직 **불요** — 산식이 이미 지분별로 갈린다.

> 📌 최초공시 後 취득 지분에 오적용할 위험은 **현행 단건에도 똑같이 있다**(날짜가 없어 시스템이
> 판정 못 한다). 지분 축에서 새로 생기는 결함이 아니므로 **이 작업에서 고치지 않는다**
> (Surgical Changes — 범위 확대 금지). 별도 관찰 항목으로만 남긴다.

#### 공통 — UI 배치

증축·용도변경 토글은 **물건 사건**이므로 지분 카드에서 **숨기고 primary에서만 입력**한다(§4-1).
적용 여부는 위 (1)(2) 규칙으로 **자동 도출**한다 — 지분마다 다시 묻지 않는다.
(날짜 두 개를 비교하는 결정적 도출이므로 「자동 안분 fallback 금지」 정책과 무관하다 —
그 정책은 *미입력 값을 임의로 채우는 것*을 막는 규칙이다.)

### 3-4. ✅ **확정** — §97②2호 단서 swap은 **지분별 × 파트별**로 판정한다

> ✅ **2026-08-10 실무 확정**(세무 담당 사용자):
> 「지분 취득 시 60% 환산, 40% 실가로 취득가액 계산 시, 「가목 < 나목이면 나목을 필요경비로」
> 규정 적용은 **환산가액 부분 즉 60%에만** 적용해야 함(**논리상 당연한 결과**)」
>
> 🔴 **함께 받은 정정 — 초판·개정2의 예시가 법적으로 성립하지 않았다** (§3-4-1).

#### 3-4-1. 🔴 예시 정정 — **상속 지분은 환산 대상이 될 수 없다**

초판~개정 2는 예시를 「60%(2009 **상속**, 취득가액 불명 → **환산**)」로 들었다. **성립하지 않는다.**

> 「취득원인이 **상속**인 경우 **의제취득일 이후** 취득은 **환산취득가액이 있을 수 없음**
> (상속세법에 의한 평가액이 실가로 간주됨)」 — 사용자, 2026-08-10

근거 조문은 **「소득세법」 제97조 제1항 제1호 단서 · 같은 법 시행령 제163조 제9항**이고,
**이 저장소가 이미 같은 인용으로 차단하고 있다**:

```
lib/calc/transfer-tax-validate-gb.ts:118
  「{상속으로} 취득한 {토지는} 취득가액을 환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다.
   상속 당시 평가액이 취득당시 실지거래가액이므로 「실거래가」를 선택하세요
   (소득세법 §97①1호 단서·같은 법 시행령 §163⑨).」
lib/calc/transfer-tax-validate-gb.ts:126~127
  if (isLandInherited && landMode !== "actual") return blockEstimation("토지", "상속");
  if (isBuildingInherited && buildingMode !== "actual") return blockEstimation("건물", "상속");
```

**정정된 예시** — 같은 물건을
**60%(2009 매매, 계약서 분실 → 환산)** + **40%(2015 매매, 실가 확인)**.

#### 3-4-2. 이 제약이 결론을 **더 강하게** 만든다

상속 지분은 구조적으로 **항상 실가(평가액 의제)** 파트다 ⇒ 단서 요건
「취득가액을 **환산취득가액으로 하는 경우**」의 **밖**이다.
「상속 지분 + 매매(환산) 지분」은 지분 분할에서 **가장 흔한 조합**이므로,
물건 전체 1회 판정은 **요건을 충족하지 않는 지분을 단서로 끌어들이는 일이 상시 발생**한다.

⇒ 지분별 판정은 선택이 아니라 **요건상 필수**다.

#### 3-4-3. 설계 귀결 (Phase G·C)

- **Phase G**: `transfer-tax-validate-gb.ts:120~127`의 상속 파트 추계 차단이 **지분마다** 돌아야 한다.
  현행은 자산 1건 전제라 primary만 검사한다.
- **Phase C**: 상속 지분은 `landAcqMode`/`buildingAcqMode`가 **`"actual"` 강제**이므로
  그 지분의 `estimatedSide`는 0이고 단서에 진입하지 않는다 —
  지분 루프 안에서 기존 `resolveGeneralBuildingSwap`을 부르면 **자동으로 그렇게 된다**.

> 📌 **범위 밖 관찰**: 위 차단은 **의제취득일 前 상속**(부동산 1985.1.1. 이전)에도 무조건 걸린다.
> 그 구간은 「소득세법」 §97②1호 나목(물가상승률 합산)·시행령 §163⑨2호(§164⑥ max)의 별도 경로다.
> **현행 단건에 이미 있는 논점**이며 지분 축이 새로 만드는 것이 아니다 — 이 작업에서 다루지 않는다
> (관련 메모리 `project_transfer_pre_deemed_164_max_and_clause_a_b`).
> 어느 쪽이든 **환산이 아니므로** §3-4의 결론은 영향받지 않는다.

---

#### 이하: 확정 전 도출 논증 (기록 보존)

#### 법문 (법제처 현행 MST 280405 `제97조` 직독, 2026-08-10)

> ② 2. 그 밖의 경우의 필요경비는 … 의 금액에 **자산별로** 대통령령으로 정하는 금액을 더한 금액.
> **다만**, 제1항제1호나목에 따라 취득가액을 **환산취득가액으로 하는 경우로서** 가목의 금액이
> 나목의 금액보다 적은 경우에는 나목의 금액을 필요경비로 **할 수 있다**.
> 　가. 제1항제1호나목에 따른 환산취득가액과 **본문 중** 대통령령으로 정하는 금액의 합계액
> 　나. 제1항제2호 및 제3호에 따른 금액의 합계액

**읽어낸 것 3가지**
1. 「자산별로」는 **본문**의 「대통령령으로 정하는 금액(= 개산공제, 영 §163⑥)」을 수식한다.
   **단서 자체에는 「자산별로」가 없다.**
2. **가목이 「본문 중」을 품는다** ⇒ 가목이 자산별이면 단서 비교도 그 단위를 따라간다.
3. 단서 요건은 「**취득가액을 환산취득가액으로 하는 경우**」 ⇒ **환산인 단위만** 단서에 들어간다.

#### 이미 같은 논증이 이 저장소에 있다 (2026-08-05 O-1)

`general-building-swap.ts` 헤더가 **파트 축**에서 정확히 위 3논거로 판정 단위를 정했다:
「가목이 본문의 자산별 개산공제를 품으므로 가목 자체가 자산별」 ·
「영 §163⑥ **1호 토지·2호 건물**이 별개 호 = 「자산별」의 단위가 파트」 ·
「자산총액 1회 판정은 **실가 파트까지 단서에 끌어들여 요건에 반한다**」.

**그 논거가 지분 축에 그대로 적용된다.** 지분 A는 환산·지분 B는 실가일 수 있고
(지분별 취득원인·취득방식이 다른 것이 이 기능의 존재 이유다),
물건 전체 1회 판정은 실가 지분을 단서에 끌어들여 같은 요건 위반이 된다.

⇒ **판정 단위 = 지분 × 파트 (2차원).**

#### 코드베이스 선례가 이미 지분별이다 (실측)

주택·토지의 기존 지분 분할은 각 지분이 별개 `TransferTaxItemInput`이 되어 단건 엔진을 각각 타고,
swap은 `calcNecessaryExpense`(`transfer-tax-helpers.ts:221~266`)에서 **item(=지분)마다** 판정된다.
**일반건물만 달리 할 근거가 없다.**

#### 구현 귀결

지분 루프 **안에서** 기존 `resolveGeneralBuildingSwap`을 호출하면 자동으로 지분별×파트별이 된다.
**새 판정 로직을 쓰지 말 것** — 「파트 내부 카드는 합산 후 배분」 규칙이 지분을 넘나들면 안 되는데,
지분별 호출이면 그 파트에 그 지분 카드만 들어가므로 구조적으로 보장된다.

#### 예규 조사 (참고 — 결론을 바꾸지 않음)

| 도메인 | 질의 | 결과 |
|---|---|---|
| `nts` | `환산취득가액 자산별`·`환산취득가액 자본적지출 비교`·`지분 환산취득가액` | 0건 |
| `tax_tribunal` | `환산취득가액 자산별`·`지분별 취득시기`·`환산취득가액 자본적지출 지분` | 0건 |
| `nts` | `환산취득가액` (단일 키워드) | 34건 — 판정 **단위**를 다룬 것은 0건 |

`general-building-swap.ts` 헤더도 「예규·심판례는 이 쟁점에 **0건**」이라 적고 있다 —
**독립적으로 같은 결론**에 도달했다.

> ⚠️ **「0건」은 부존재 증명이 아니다.** 법제처 API는 공백 키워드를 AND로 처리한다.
> 이 결론은 **예규가 아니라 법문 구조 + 저장소 확립 선례**에 근거한다.

**본문 확보한 해석 (직접 근거 아님 — 원용 금지)**
- `기준-2017-법령해석재산-0183`(법령해석과-2522, 2017.09.07, Playwright 직독):
  「토지의 **실제 취득가액은 확인되나 자본적지출액이 확인되지 않는 경우**는 환산취득가액
  적용대상에 해당하지 않는다」 — 단서 **진입 요건**을 좁게 본 사례. 판정 단위는 다루지 않는다.
- `[1732175]`「주택의 **각 지분별 취득시기가 다른 경우** 거주요건 판정방법」(2025.06.12):
  과세관청이 지분별 취득시기를 **각각** 본다는 축. 대상이 §154①이라 §97②의 직접 근거는 아니다.

### 3-5. 🔴 지분율 스케일 — **파트별 실가 취득가액에 지분율이 적용되지 않는다** (신규 발견)

현행 `ownershipRatio`는 **개산공제(§163⑥) base 축소 전용**이라고 타입이 명시한다
(`lib/tax-engine/types/general-building.types.ts:317~325`).
일반 경로는 `fixedAcquisitionPrice`(`api-helpers.ts:548`)·`directExpenses`(`:607`)를 `applyRatio`로 줄이는데,
**GB 페이로드 안의 금액은 어디서도 줄지 않는다** — `transfer-tax-api-gb.ts:330~351`이
`parseAmount(asset.landAcquisitionPrice)`를 그대로 싣는다.

UI 안내는 「모든 금액을 **100% 기준**으로 입력하세요 … 시스템이 지분율을 자동으로 적용합니다」다
(`AssetSectionAcquisition.tsx:119~131`).
⇒ 안내대로 입력하면 **파트 취득가액이 지분으로 줄지 않아 취득가액 과대 → 세액 과소**가 된다.

**스케일 규칙 (설계 확정 대상)**

| × r_k **적용** | × r_k **금지** |
|---|---|
| `totalTransferPrice` (지분 양도가액) | `gbLandArea` · `gbBuildingArea` · `gbBuildingFootprintArea` |
| `landAcquisitionPrice` · `buildingAcquisitionPrice` | `gbAcqLandPricePerSqm` · `gbAcqBuildingValue` |
| `landDirectExpenses` · `buildingDirectExpenses` | `gbTransferLandPricePerSqm` · `gbTransferBuildingValue` |
| `capitalExpenditure` · `transferExpense` (자산 총액) | (증축·최초공시 기준시가 전부) |
| `bundledAcquisitionPrice` · `bundledExpenses` (증축) | |
| `publishedValueAtInheritance` · `gbBuildingInheritedValue` (⚠️ 아래) | |

**「금지」 쪽이 정확성의 근거다.** 기준시가·면적은 환산 산식에서 분자·분모로 함께 나타나 **약분**되고
(`general-building.types.ts:317~321`), `ownershipRatio`가 이미 개산공제 base를 줄이고 있다 —
기준시가까지 줄이면 **개산공제가 이중 축소**된다.

#### ✅ 상속·증여 신고가액 입력 규약 — **이미 확립돼 있다** (개정 2에서 해소)

개정 1은 이것을 미결(안 ① vs ②)로 올렸으나, **기존 규약이 존재한다**:

```ts
// lib/calc/transfer-tax-api-helpers.ts:519~522
// 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
publishedValueAtInheritance: fractional
  ? applyRatio(parseAmount(asset.publishedValueAtInheritance), ratio)
  : parseAmount(asset.publishedValueAtInheritance),
```

UI 안내문도 이미 같은 말을 한다 — 「상속 보충적평가는 **공동주택가격(100%)을 그대로 입력**하면 됩니다」
(`AssetSectionAcquisition.tsx:133~136`).

⇒ **안 ① 채택**: 100% 기준 입력 + 시스템 × r. **신규 규약 창설이 아니라 기존 규약 준수**다.
GB의 `publishedValueAtInheritance`·`gbBuildingInheritedValue`도 **같은 규칙**을 적용한다
(현재는 GB 페이로드라 ×r이 안 걸린다 — 위 표의 「적용」열).

---

## 4. UI

### 4-1. ⚠️ 「양도시 카드만 숨기면 된다」는 **틀렸다** (개정 1에서 정정)

`GeneralBuildingBlock.tsx`의 ①·② 섹션은 취득시(amber)/양도시(emerald) 하위 카드로 갈려 있다
(`:325~372` 토지 공시지가, `:375~481` 건물 기준시가). 여기까지는 emerald만 숨기면 된다.

**그러나 ⑤ 증축 섹션(`:487~672`)은 그 구분 밖에 있다.**
`gbHasExtension` ToggleCard 안에 「**양도시** 건물2 기준시가 총액」(`:537~`)이 들어 있다.
⇒ 지분 카드에서 증축 섹션을 그대로 렌더하면 **양도시 값을 지분마다 따로 받게 되고**,
증축 토글 자체도 지분별로 켜지는 모순이 생긴다(§3-3).

**⇒ `hideTransferSide` 하나로는 부족하다.** 최소 두 축이 필요하다:
- `hideTransferSide` — ①② emerald 카드 숨김
- **물건 사건 섹션(⑤ 증축·용도변경·최초공시)은 지분 카드에서 통째로 숨김** — §3-3 확정 후 결정

### 4-2. 🔴 지분 카드는 `assetKind`가 **"housing"** 이라 GB 블록이 애초에 안 뜬다

**실측**: 지분 토글 ON 시 2번째 지분은 `makeDefaultAsset(2)`로 생성되고
(`app/calc/transfer-tax/steps/Step1.tsx:90~94`), 기본값은
`assetKind: "housing"`이다(`lib/stores/calc-wizard-asset-factory.ts:66`). **primary 자산종류를 복사하지 않는다.**

- API·validate는 `mergePrimaryBasic`이 `assetKind`를 primary값으로 덮으므로 문제없다
  (`transfer-tax-api-helpers.ts:364~375` — 현행 병합은 `assetKind`·`acquisitionArea`·`transferArea`·
  `areaScenario`·`landNature`·`transferType`·`transferCause` **7개**, GB 필드 **0개**).
- **UI는 덮지 않는다.** `AssetSectionAcquisition.tsx:326`이 `asset.assetKind === "general_building"`을
  직접 읽어 `GeneralBuildingBlock`을 게이트한다 ⇒ 지분 카드에
  **취득시 토지 공시지가·취득시 건물 기준시가·파트별 취득방식 입력 UI가 통째로 없다.**

⇒ Zod·route·엔진을 다 고쳐도 **입력 경로가 없어 세액이 변하지 않는다**
(메모리 `feedback_api_trigger_without_input_path_is_noop` · `feedback_ui_gate_removes_sole_input_path`).

**대응 — ㉯ 권장 (개정 1에서 정밀화)**

| 안 | 내용 | 평가 |
|---|---|---|
| ㉮ | sibling 생성 시 primary의 물건-수준 필드를 **복사** | primary 수정 시 stale — 단일 진실 붕괴. **기각** |
| ㉯ | 지분 카드 ③에 **`assetKind`만** primary값으로 주입(**표시 게이트 전용**) | API·validate의 `mergePrimaryBasic`과 같은 규칙. 채택 |

> ⚠️ **㉯에서 「병합 자산 전체」를 주입하지 말 것**(개정 1 정정). ③은 `onChange`로 **쓰기**도 한다 —
> 병합된 면적·양도 필드를 그대로 넘기면 지분 카드에서 물건-수준 값을 편집해 primary와 갈라진다.
> **읽기 게이트에 필요한 `assetKind` 하나만** 주입하고, 물건-수준 입력칸은 §4-1대로 **숨긴다**.

> 📌 **부수 관찰(수정 대상 아님)**: 같은 이유로 `land` primary의 지분 카드도 ③에서
> 다필지 토글·`landNature`가 안 뜬다(`AssetSectionAcquisition.tsx:220,228`).
> 기존 동작이며 범위 밖 — ㉯를 택하면 부수적으로 함께 해소된다.

### 4-3. 재사용 가능 — 추가 작업 불요

- **지분율 합계 100% 검증**은 자산종류 무관으로 이미 있다(`transfer-tax-validate.ts:161~173`, 허용오차 0.5%p).
- **지분율 미입력 차단**도 있다(`:147~157`).
- ①② 섹션 숨김·안내배너는 이미 동작한다(`CompanionAssetCard.tsx:262~322`, `hideInheritedSections`).
  ③ 취득정보는 항상 렌더된다(`:325~347`).

---

## 5. Phase 분해 · 14 동기화 지점 매핑

| Phase | 내용 | 동기화 지점 | 파일 |
|---|---|---|---|
| **A** | 경로 B에서 `buildActualGeneralBuildingCards()` 추출 (동작 무변경 리팩터) | — | `general-building-route-actual.ts` |
| **B** | 경로 A에서 cards+swap+nbl 반환 지점 노출 | — | `general-building-route-helper.ts` |
| **C** | 지분 루프 + **§3-5 스케일** + cards concat + `propertyId` 접미사 + apportionment 분모 재계산 | ⑭ | 신규 `general-building-fractional.ts` |
| **D** | route 새 분기 — **5-a보다 앞**, 조건 `isFullFractionalBundle && propertyType === "general_building"` | ⑭ | `route.ts` |
| **E** | Zod — 지분별 GB 페이로드 배열 + companion `assetKind` enum 확장 | ⑨⑩⑫ | `transfer-tax-schema.ts` · `-sub.ts` · `-building-schemas.ts` |
| **F** | ④ API 변환 — 지분별 `buildGeneralBuildingValuation` + 물건-수준 병합 확장 | ④⑬ | `transfer-tax-api-gb.ts` · `transfer-tax-api-helpers.ts` |
| **G** | ⑧ validate — 차단 제거 + 지분별 GB 필수필드 검증 + §3-5 스케일 규칙 정합 | ⑧ | `transfer-tax-validate.ts:75~80` · `-validate-asset.ts` |
| **H** | ⑤ UI — 토글 게이트 해제 + `assetKind` 주입(§4-2 ㉯) + 양도측·물건사건 섹션 숨김(§4-1) + 안내문(§3-5) | ①②③⑤ | `AssetSectionAcquisition.tsx:75~78,326` · `CompanionAssetCard.tsx:335` · `GeneralBuildingBlock.tsx` |
| **I** | ⑥⑦ 사이드바 합계 · 결과 카드 (N지분 × 2~3파트 라벨) | ⑥⑦ | `transfer-per-asset-summary.ts` · 결과뷰 |
| **J** | E2E + 회귀 | — | |

> **Phase 순서 근거**: 배관(A~G)이 먼저다. **H를 먼저 하면 UI는 열렸는데 validate가 막아** 오류만 뜬다.
> 반대(G→H)는 validate만 풀린 무해 상태를 거친다.
> **F는 H보다 앞**이어야 한다 — H가 F의 물건-수준 병합 목록에 의존한다
> (메모리 `project_non_housing_to_housing_conversion`의 「Phase 분할 시 UI가 읽을 값의 출처까지 추적」).

> **800줄 정책**: 경로 B는 537줄 → A 추출로 감소. 신규 `general-building-fractional.ts`는
> 착지 목표 ≤700줄.

---

## 6. Pre-Do anchor (착수 전 필수 — 메모리 `feedback_pre_anchor_verification`)

**"현행 엔진 일치 예상" 가정 금지.** 아래를 먼저 작성해 실패시킨 뒤 Do에 들어간다.

| ID | 내용 | 착수 시 기대 |
|---|---|---|
| GBF-01 | 지분 60%(2009 매매)+40%(2015 매매) 환산 모드 → route 200 · `generalBuildingValuationDetail` 존재 · 파트 **4장**(NBL 초과분 없는 케이스) | **현재 400** (§1-1) |
| GBF-02 | 지분 1개(100%) 결과가 **현행 단건과 원 단위 동일** — 회귀 0 불변식 | 통과해야 함 |
| GBF-03 | Σ(지분별 양도가액) = 총양도가 (마지막 지분 잔액 흡수, §3-2-f) | |
| GBF-04 | 개산공제(§163⑥)가 지분율만큼 축소 — `ownershipRatio` 도달 확인 | |
| GBF-05 | **§3-5**: 파트별 실가 취득가액을 100% 기준으로 넣으면 지분율만큼 축소된 값이 엔진에 도달 | **현재 미축소** |
| GBF-06 | **mutation probe**: 지분 축을 제거해도 GBF-01·05가 실패하는지 (메모리 `feedback_negative_assertion_needs_mutation_probe`) | |
| GBF-07 | **E2E 입력경로**: 지분 카드 ③에서 「취득시 토지 공시지가」·「취득시 건물 기준시가」가 **렌더**되고, 값을 바꾸면 결정세액이 **변한다** (§4-2) | 현재 렌더 자체가 없음 |
| GBF-08 | **E2E 음성**: 지분 카드에 **양도시** 기준시가·증축·용도변경 토글이 **없다** + 양성 대조군(primary에는 있다)을 같은 spec에 (§4-1) | |
| GBF-09 | **증축 × 지분** (§3-3-1): 지분 A(증축 前 취득)=3파트 · 지분 B(증축 後 취득)=**2파트**이고, B의 건물 기준시가가 **본체+증축 합산**으로 들어가 건물 양도가액이 과소 안분되지 않는다 | |
| GBF-10 | **용도변경 × 지분** (§3-3-2): 변경일 이후 취득 지분은 LTHD 기산일이 **취득일**(변경일로 당겨지지 않음) | |
| GBF-11 | **§97②2호 단서 × 혼합 지분** (§3-4): 60% 환산 + 40% 실가에서 단서가 **환산 지분에만** 발동 — 실가 지분의 필요경비는 §97②**1호 가산**으로 남는다 | |
| GBF-12 | **상속 지분 추계 차단** (§3-4-3): 상속으로 취득한 **지분**에 환산·감정·매매사례를 선택하면 그 **지분 인덱스**로 차단된다(primary만이 아니라) | 현재 primary만 검사 |

> ⚠️ **anchor가 「어느 단계를 보는가」를 맞출 것**(메모리 `feedback_anchor_observes_wrong_stage`).
> 중간 안분값이 정상이어도 결정세액이 틀릴 수 있다 — **파이프라인 끝(결정세액)까지 단언**한다.
> ⚠️ **E2E `toHaveText`는 hidden도 통과**한다 — 접힌 섹션을 펴고 단언할 것
> (메모리 `project_non_housing_to_housing_conversion`).

---

## 7. 회귀 위험

| 위험 | 방어 |
|---|---|
| 단건 일반건물 세액 변동 | GBF-02 원 단위 동일 anchor + `__tests__/tax-engine/transfer/general-building-*` 전수 |
| `propertyId` 접미사가 기존 테스트 셀렉터를 깬다 | 지분 1개면 접미사 미부착 (§3-2-b) |
| route if-체인에 분기 추가 → 다른 특수 경로를 삼킴 | 새 분기 조건에 `propertyType === "general_building"` **명시** + `bundled-swallows-special.test.ts` 유지 (메모리 `feedback_route_if_chain_order_swallows_branches`) |
| Zod enum 확장이 다른 자산종류 차단을 푼다 | enum은 넓히되 **validate·route 게이트는 general_building만** 허용 |
| §3-5 스케일을 기준시가까지 적용 → 개산공제 이중 축소 | GBF-04 + 「금지」열 anchor |
| ⑫⑬⑭는 TypeScript가 안 잡는다 | Phase E·F 후 grep 자가 점검 (메모리 `feedback_api_zod_schema_sync`) |
| 배관 미완 상태로 UI만 열림 | Phase 순서 A~G → H 고정 (§5) |
| 워크트리 E2E가 메인 트리 서버를 재사용 | `E2E_PORT` 지정 (메모리 `feedback_worktree_e2e_port_isolation`) · `.env.local` 복사 완료 (메모리 `feedback_worktree_missing_env_local_server_gate`) |

---

## 8. 착수 조건 — **전건 확정** (2026-08-10)

| # | 항목 | 상태 | 근거 등급 |
|---|---|---|---|
| 1 | §3-3 증축·용도변경 × 지분 취득 시점 | ✅ **확정** — 사건 後 취득 지분은 그 사건 미적용(증축=2파트, LTHD 기산일=지분 취득일) | **실무 확정** + 법령·코드 구조 |
| 1′ | §3-3-3 §99-164-10 최초공시 | ✅ 분기 **불요** — 날짜 필드 부재, 산식이 이미 지분별 | 코드 실측 |
| 2 | §3-4 §97②2호 판정 단위 | ✅ **확정** — 지분 × 파트 2차원. 「환산 부분에만 적용」 | **실무 확정** + 법문 3논거 + O-1 선례 |
| 2′ | §3-4-1 상속 지분은 환산 대상 아님 | ✅ **확정**(예시 정정) — §97①1호 단서·영 §163⑨ | **실무 확정** + 코드가 이미 동일 인용으로 차단 |
| 3 | §3-5 상속·증여 신고가액 입력 규약 | ✅ 기존 규약(100% 기준 ×r) 준수 | 코드 실측 |
| 4 | §2-2 범위 | ✅ 확정 | 사용자 승인 |

> 📌 **근거 등급을 구분해 둔다.** 1·2는 **예규가 아니라** 실무 판단 + 법문 구조 + 저장소 선례다.
> 예규를 나중에 찾으면 이 문단을 갱신할 것(사용자가 국세법령정보시스템에서 별도 검색 중).
> 세액을 직접 가르는 지점은 anchor로 고정했다 — **GBF-09**(2파트 기준시가 합산) ·
> **GBF-11**(단서는 환산 지분에만) · **GBF-12**(상속 지분 추계 차단).

⇒ **다음 산출물**: `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md`
(케이스 매트릭스 전수 + 파트 조립 규칙 + Zod/API 필드 스펙)

---

## 9. 개정 이력

### 개정 1 (2026-08-10) — 자가검토

**사실 오류 2건 정정**

| # | 초판 서술 | 정정 |
|---|---|---|
| 1 | 「경로 B: **537줄 함수** 안에 cards 조립이 인라인」 | 537은 **파일** 길이. 함수는 `:135~537` (§3-2-c) |
| 2 | 「지분 카드는 **emerald(양도시) 카드만 숨기면** 된다 — 새 컴포넌트 불요」 | **틀렸다.** ⑤ 증축 섹션(`:487~672`) 안에 「양도시 건물2 기준시가」(`:537~`)가 있어 그 구분 밖이다 (§4-1) |

**중대 누락 1건 추가**

- **§3-5 지분율 스케일** — `ownershipRatio`는 개산공제 base 축소 **전용**이라 파트별 실가 취득가액
  (`landAcquisitionPrice` 등)이 **지분으로 줄지 않는다**. UI는 「100% 기준 입력」을 안내하므로
  그대로 두면 **취득가액 과대 → 세액 과소**. 스케일 대상/금지 표 + 상속 신고가액 입력 규약 미결로 승격.

**정밀화**

- §1-2: probe로 측정한 것(1-1)과 코드 독해·기존 테스트 근거(1-2)를 **구분**. `bundledOk` 진입 조건을
  「companion이 하나라도 있으면」 → 실제 3항 조건으로 정확히 기술. 기존 테스트 헤더 줄번호가 stale임을 표시.
- §4-2 ㉯: 「병합 자산 주입」 → **`assetKind`만 주입**. ③이 `onChange`로 쓰기도 하므로 전체 병합은
  물건-수준 값 편집 경로를 열어 단일 진실을 깬다.
- §5: Phase 순서에 **근거**를 붙임(G→H인 이유, F→H 의존). 초판 §6의 「Phase H를 마지막에」는
  Phase 표(H 뒤에 I·J)와 **모순**이었다 → 「배관 A~G 완료 후」로 정정.
- §2-2: 부담부증여·공익수용 UI 차단이 if-else 체인이라 `general_building` 분기 제거만으로 **그대로 남는다**는
  점을 확인해 추가(별도 작업 불요).

**추가 확인으로 해소된 우려**

- 기본공제 250만원 이중 적용 → 두 경로 모두 `MAX_BENEFIT` · aggregate 1회 호출이라 무해 (§3-2-e).
- 지분율 합계 100% 검증 → 자산종류 무관으로 이미 존재, 재사용 (§4-3).

**추가 anchor**: GBF-05(스케일) · GBF-08(음성 단언 + 양성 대조군).

---

### 개정 2 (2026-08-10) — 착수 조건 1~3 조사·해소

**사실 오류 1건 정정**

| 초판·개정 1 | 정정 |
|---|---|
| 「§99-164-10 최초공시 — **최초공시일 前後로 환산 산식이 갈림**」 | **틀렸다.** 최초공시「일」 필드가 **없다**. 입력은 금액 3필드뿐이고 엔진 게이트는 `if (!input.hasFirstDisclosure)` **하나**다(`general-building-converted-housing.ts:47`). 비교할 날짜가 없어 前/後 판정이 **불가능**하고, 산식 분자의 취득당시 기준시가가 지분-수준이라 **이미 지분별로 갈린다** — 분기 로직 자체가 **불요** (§3-3-3) |

**해소 3건**

- **§3-3**: 증축·용도변경은 `gbExtensionDate`·`gbConversionDate`로 **前/後 자동 판정**.
  근거는 「건물2 취득일 = 증축일」(`general-building-extension.ts:535`) ·
  현행 validate의 하한 강제(`transfer-tax-validate-gb.ts:538~547,555~559`) ·
  취득시기 지분별 원칙(법 §98·영 §162①). 최초공시는 §3-3-3대로 분기 불요.
- **§3-4**: 법제처 현행 §97 원문 직독으로 **「자산별로」가 본문 수식어이고 단서에는 없다**를 확인.
  가목이 「본문 중」을 품는 구조 + 단서 요건 「환산취득가액으로 하는 경우」 ⇒ **지분 × 파트 2차원**.
  같은 3논거가 2026-08-05 O-1(`general-building-swap.ts` 헤더)에 **파트 축으로 이미** 쓰여 있고,
  주택·토지 지분 분할은 `calcNecessaryExpense`가 item마다 판정해 **이미 지분별**이다.
- **§3-5**: 상속·증여 신고가액은 `api-helpers.ts:519~522`가 **100% 기준 ×r**로 이미 처리한다 —
  기존 규약 준수(신규 창설 아님).

**신규 발견 (세액 직결)**

- **증축 後 취득 지분의 기준시가 합산** — 2파트 경로는 `transferBuildingStdPrice` 하나만 쓰므로
  **본체+증축 합산값**을 넣지 않으면 건물 양도가액이 **과소 안분**된다 (§3-3-1). GBF-09로 고정.

**추가 anchor**: GBF-09(증축×지분) · GBF-10(용도변경×지분).

**범위 밖으로 남긴 것**: 최초공시 後 취득 지분에 토글이 오적용될 위험은 **현행 단건에도 동일**하므로
이 작업에서 고치지 않는다(Surgical Changes). 관찰 항목으로만 기록.

**조사 방법 메모**: 국세청 해석 본문은 KoreanLaw MCP가 제공하지 않는다(`NOT_SUPPORTED`).
Playwright로 `taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=…` 직독은 **성공**했다
(메모리 `feedback_nts_taxlaw_readable_via_playwright` 재확인).
집행기준은 통합검색 경로로 도달하지 못했다 — **부존재 증명 아님**.

---

### 개정 3 (2026-08-10) — 실무 확정 + 예시 정정

**사용자(세무 담당) 확정 3건**

| 쟁점 | 확정 |
|---|---|
| 1-a 증축 | 사건 後 취득 지분은 **증축이 완료된 건물을 취득**한 것 ⇒ 2파트 |
| 1-b 용도변경 | 장기보유특별공제 **기산일 = 지분 취득일** (변경일로 당겨지지 않음) |
| 2 §97②2호 단서 | 「가목 < 나목 → 나목」은 **환산 부분(60%)에만** 적용 — 「논리상 당연한 결과」 |

⇒ 개정 2의 결론(㉯)과 **전부 일치**. 근거 등급만 「도출」 → 「**실무 확정**」으로 승격.

**🔴 사실 오류 1건 정정 — 초판~개정 2가 3회 반복한 예시**

「60%(2009 **상속**, 취득가액 불명 → **환산**)」는 **법적으로 성립하지 않는다.**
상속 취득은 상증법 평가액이 취득 당시 실지거래가액으로 **의제**되므로(「소득세법」 제97조 제1항
제1호 단서 · 같은 법 시행령 제163조 제9항) 환산 대상이 아니다(의제취득일 이후 취득 기준).

**이 저장소가 이미 같은 조문 인용으로 차단하고 있었다** —
`transfer-tax-validate-gb.ts:118`(메시지 문구에 조문 명시) · `:126~127`(파트별 mode 강제).
계획서를 쓰면서 이 코드를 §3-4 예시에 반영하지 못했다.

**정정된 예시**: 60%(2009 매매, 계약서 분실 → 환산) + 40%(2015 매매, 실가 확인).

**결론에 미친 영향: 강화**(§3-4-2). 상속 지분은 **구조적으로 항상 실가**라 단서 요건 밖이고,
「상속 지분 + 매매(환산) 지분」은 지분 분할에서 가장 흔한 조합이다 ⇒
물건 전체 1회 판정은 **요건 미충족 지분을 단서로 끌어들이는 일이 상시 발생**한다.
지분별 판정은 선택이 아니라 **요건상 필수**.

**신규 설계 항목**
- Phase G: 상속 파트 추계 차단(`transfer-tax-validate-gb.ts:120~127`)이 **지분마다** 돌아야 한다
  (현행은 자산 1건 전제 — primary만 검사).

**추가 anchor**: GBF-11(단서는 환산 지분에만) · GBF-12(상속 지분 추계 차단이 지분 인덱스로).

**범위 밖 재확인**: 위 차단은 **의제취득일 前 상속**에도 무조건 걸린다(별도 경로 §97②1호 나목 ·
영 §163⑨2호). **현행 단건의 기존 논점**이므로 이 작업에서 다루지 않는다 —
어느 쪽이든 환산이 아니라 §3-4 결론은 불변.
