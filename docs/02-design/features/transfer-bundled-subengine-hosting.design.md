# 일괄양도(5-a)가 「서브엔진 자산」을 호스팅하는 설계 — 일반건물·겸용주택 × 함께양도

**상태**: ✅ 일반건물 구현 완료 (2026-09-03) · 겸용주택 **V-2~V-4 실측 완료 · Q-1 결정 완료** (2026-09-04) — 구현은 ⑭ 25필드 매핑이 선행 조건
**배경**: 「컴패니언 남은 4종」 배치 3·4 (`transfer-companion-remaining-4.plan.md`)
**선행 완료**: 배치 1 분양권 · 배치 2 입주권·재개발APT (둘 다 **배관**으로 끝났다)

---

## 0. 왜 별도 설계문서인가

배치 1·2는 ⑩ enum · ④ fold · ⑫ 서브객체를 잇는 **배관**이었다. 배치 3·4는 다르다 —
실측해 보니 **두 축이 별개의 작업이 아니라 같은 구조 문제 하나**였고, 그 해법이 route의
분기 구조와 세액 계산 단위를 건드린다.

---

## 1. 실측 — 5-a가 반환하면 뒤 분기는 도달 불가

`app/api/calc/transfer/route.ts` 분기 순서:

| 위치 | 분기 | 도달성 |
|---|---|---|
| `:137` | **5-0** 일반건물 × 지분분할(축 B) | 5-a보다 **앞** ⇒ 동작 |
| `:172` | **5-a 일괄양도** — `if (bundledOk) { … return NextResponse.json(…) }` | — |
| `:362` | 5-a-2 겸용주택 분리계산 | ❌ **도달 불가** |
| `:471` | 5-a-3 일반건물 토지·건물 분리 | ❌ **도달 불가** |
| `:576` | 5-b 단건 | ❌ 도달 불가 |

컴패니언이 있으면 5-a가 **반환**하므로 겸용·GB 전용 분기가 **실행조차 되지 않는다**.

**증상 실측** — primary 겸용주택 + 토지 컴패니언:

| | route | `groupTaxes` |
|---|---|---|
| 겸용주택 primary | 200 | progressive 38% · **169,860,000** |
| 일반주택 primary (대조군) | 200 | progressive 38% · **169,860,000** |

**완전히 동일**하다. 겸용 분리계산 산출물이 응답에 하나도 없다. 같은 픽스처를 단건으로
돌리면 **500**(「겸용주택: 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요」)인데,
**일괄에서는 그 필수 검증조차 타지 않는다.**

> ⑧ `SINGLE_ONLY`가 둘 다 막고 있어 **살아 있는 오산은 아니다.** 축 개방 작업이다.

---

## 2. 🔑 두 자산은 산출물 형태가 **비대칭**이다

이것이 설계의 분기점이다.

| | 일반건물(GB) | 겸용주택 |
|---|---|---|
| 파트 분해 | 토지 · 건물(+증축) | 주택 · 상가 (+배율초과 비사토) |
| 산출물 | **`AssetCardForAggregate[]`** | **`MixedUseGainBreakdown`** (자체 완결) |
| 세액 계산 | **aggregate가 한다** | **엔진 내부에서 끝난다**(`total`) |
| aggregate 합류 | `buildProperties(cards) → TransferTaxItemInput[]` **이미 존재** | 경로 없음 |

- GB: `general-building-route-cards.ts:153 buildProperties()`가 카드를 **5-a가 쓰는 것과
  똑같은 `TransferTaxItemInput[]`** 으로 바꾼다. 축 B(`general-building-fractional.ts`)가
  이미 「지분별 카드 concat → **aggregate 1회**」로 이 패턴을 돌리고 있다.
- 겸용: `calcMixedUseTransferTax()`가 `housingPart`·`commercialPart`·`nonBusinessLandPart`로
  **파트별 양도차익까지는 이미 산출**하지만, `total`에서 **자체적으로 세액을 합산**한다.
  ⇒ `transfer-tax-aggregate.ts`·`transfer-tax.ts` **어디에도 `mixed-use-house`가 없다**
  (전수 grep) — aggregate는 겸용 item을 받을 수 없다.

---

## 3. 선택지

### (A) 5-a가 서브엔진 카드를 호스팅한다 — GB·겸용 **공통 해법**

5-a의 컴패니언 확장 이음매(`buildCompanionEngineInputs`가 이미 `TransferTaxItemInput[]`를
반환한다 — 1→N)를 **primary에도 적용**해, GB·겸용 자산을 파트 카드로 펼쳐 aggregate에 넣는다.

- **GB**: `buildProperties`를 그대로 재사용 ⇒ 작다.
- **겸용**: 파트별 카드를 **새로 노출**해야 한다. 그 순간 세액 계산 주체가 겸용 엔진에서
  aggregate로 넘어가므로, 겸용 전용 규칙이 aggregate 경로에서 재현되는지 **전건 확인**이 필요하다
  (§89① 12억 안분 · LTHD 표1/표2 선택 · 배율초과 비사토 파트 · §104⑦ 중과).
  ⚠️ 이것이 이 설계의 **최대 위험**이다. 「파트를 카드로 내보내면 된다」는 **아직 검증되지 않았다**.

### (B) GB만 (A)로 열고, 겸용은 별건으로 남긴다

GB는 카드 경로가 이미 있으므로 위험이 낮다. 겸용은 세액 계산 이관이라는 큰 축을
분리해 **근거를 갖춘 뒤** 착수한다.

- 장점: 위험이 낮은 절반을 먼저 닫는다. 겸용의 세법 쟁점을 서두르지 않는다.
- 단점: 「남은 4종」이 1종 남는다.

### (C) 5-a 진입 전에 파트로 펼친다 (route 순서 변경)

5-a보다 앞에서 GB·겸용을 파트 카드로 바꾼 뒤 5-a에 넣는다. 축 B GB(5-0)가 5-a 앞에 있는
것과 같은 형태다.

- 단점: 5-0이 **컴패니언을 상정하지 않는다**(지분 루프 전용). 두 축이 섞이면 진입 조건이
  복잡해진다. (A)와 실질이 같으면서 분기만 늘어난다.

---

## 4. 권고 — **(B) → (A)**

1. **GB 컴패니언**을 (A)의 방식으로 먼저 연다. `buildProperties` 재사용이라 신규 세법 판단이 없다.
2. 그 과정에서 5-a의 「파트 카드 호스팅」 이음매를 실제로 만든다.
3. **겸용주택**은 그 이음매 위에서, 아래 Q·V를 해소한 뒤 별도 PR.

---

## 5. 🔴 착수 전 해소해야 할 미검증 항목 (V)

> 전부 **실측 전에는 단정하지 않는다.** 이 저장소는 ⏸ 사유의 전제가 틀렸던 사례를 두 번
> 기록하고 있다(`transfer-acq-valuation-review-2026-09.completion.md` §14).

| ID | 확인할 것 | 왜 |
|---|---|---|
| ~~**V-1**~~ | ✅ **해소** — **2단 안분**이다. 자산 간 안분은 5-a가, 자산 안의 토지·건물 분해는 GB 엔진이 자기 기준시가 분모로 한다. 두 축이 `buildGbPartCards` **한 leaf를 공유**하므로 경로에 따라 갈리지 않는다. anchor **GBC-4**가 「컴패니언 GB 두 파트 차익 합 = 같은 양도가액 단건 GB」로 고정(기준값을 상수로 박지 않고 같은 테스트에서 계산) | — |
| ~~**V-2**~~ | ✅ **재현된다** — 1세대1주택 · 10.7억 → `isExempt: true` · `exemptReason "1세대1주택 비과세"`. 15억 → 안분 후 차익 228,571,428 기준 LTHD 182,857,142. **단, 🔴 아래 §9.1 함정** | — |
| ~~**V-3**~~ | ✅ **재현된다** — 같은 자산에 거주기간만 바꿔 실측: 거주 120개월 **182,857,142**(표2, 보유 0.4 + 거주 0.4) vs 거주 0 **63,999,999**(표1 14년 0.28) | — |
| ~~**V-4**~~ | ✅ **재현된다** — `non_business_land` 세율군이 **별도로** 생기고 `surchargeRate: 0.10`(appliedRate 0.48), 주택은 `progressive` 0.42로 분리 | — |
| **V-5** | 기본공제 §103② 1회·§104⑤ 비교과세가 **파트 수만큼** 갈라지지 않는가 | 축 B GB가 「aggregate 1회」로 푼 것과 같은 함정 |
| **V-6** | 결과 표시(`BundledAllocationCard`)·신고서 양식 열 구성이 파트 카드를 감당하는가 | GB는 선례 있음(축 B) — 컴패니언에서도 E2E 통과. **겸용은 여전히 미확인** |
| **V-7** | 겸용 경로가 버리던 `penaltyDetail`(리뷰 G-43)이 이관 후에도 같은 상태인지 | 이관이 그 결함을 고치는지·악화시키는지 |

## 6. 사용자 결정이 필요한 항목 (Q)

| ID | 질문 |
|---|---|
| ~~**Q-1**~~ | ✅ **「분리」로 결정**(2026-09-04). ⭐ 실측 결과 **새 정책이 아니라 현행 유지**였다 — 겸용 엔진은 이미 `buildTotalTax(rateParts)`로 파트별 세율군(`housing`/`commercial_land`/`commercial_building`/`non_business_land` + `surchargeAddon`)을 만들고 **§104⑤ MAX**를 수행한다 |
| **Q-2** | (B)로 갈 때 겸용주택을 **⑧ 차단 유지**로 남길 것인가(현행), 아니면 명시 안내 문구를 바꿀 것인가 |

---

## 7. 검증 계획 (착수 시)

- **Pre-Do anchor**: GB 컴패니언이 토지·건물 **2 item**으로 aggregate에 들어가고, 그 합이
  단건 GB와 일치하는지. 축 B GB(60/40 합계 = 단건 100%)가 쓴 것과 같은 형태의 판별력.
- **뮤테이션**: 카드 확장 제거 · 안분 키 교체 · aggregate 1회→N회.
- **대조군**: 겸용주택이 **여전히 차단**되는지(B안 채택 시) — 한 항목이 두 자산을 함께 보면
  한쪽 반전이 다른 쪽 안전망을 지운다(배치 2에서 GBF-21이 실제로 그랬다).

---

## 8. 일반건물 구현 결과 ✅ (2026-09-03)

### 8.1 복제하지 않고 leaf 2건을 승격했다

`general-building-fractional.ts`의 **비공개 지역 함수**였던 것을 신규
`general-building-part-cards.ts`로 옮겨 두 축이 공유한다:

| 승격한 것 | 일반화 |
|---|---|
| `buildShareCards` → **`buildGbPartCards`** | `share: GeneralBuildingSharePayload` → `ownershipRatio: number \| undefined` |
| `tagCards`·`remapSwap` → **`tagGbCards`·`remapGbSwap`** | 접미사 `shareIdx: number` → `suffix: string`(컴패니언은 `assetId`) |

⚠️ `general-building-route-cards.ts`에 두면 **순환**이 된다(route-helper·route-actual이 그
파일을 import한다) — 그래서 새 파일이다.

🔴 카드 태깅과 swap Map 재맵핑은 **같은 시점에** 해야 한다 — 한쪽만 접미사가 붙으면
`buildProperties`가 `swap.allocation.get(card.propertyId)`에서 조용히 미스한다(원 주석의 경고).

### 8.2 🔴 E2E가 잡은 「⑧ 통과 ↔ ⑩ 400」 모순

⑩ `addCompanionAcquisitionCauseRefines`가 `purchase` + 환산에 컴패니언-수준
`standardPriceAtAcquisition`을 요구했다. 일반건물은 그 값을 **자기 서브객체가 갖고**, ⑧은 GB를
`validateGeneralBuildingAsset`에 통째로 위임해 요구하지 않는다 ⇒ **안내 없는 dead-end**.

부담부증여가 같은 이유로 이미 예외였다(§159가 취득가액을 산정하고 UI가 칸을 숨긴다) —
**같은 규율**을 GB에 적용했다. 판정 기준도 같다: 「누가 취득가액을 산정하는가」를 말해 주는 것은
`assetKind`가 아니라 **그 서브객체의 존재**다.

> ⚠️ **유닛 anchor GBC-1~4는 이 결함을 못 잡았다** — 기본 픽스처가 `standardPriceAtAcq`를 들고
> 있어 refine이 만족돼 버렸다. E2E의 GB 자산에는 그 칸이 없어 먼저 드러났고, 그 뒤 **GBC-5**로
> 유닛에 고정했다. 픽스처가 우연히 채워 준 값이 결함을 가리는 전형이다.

### 8.3 검증

| | |
|---|---|
| anchor | 5건(GBC-1~5) · **뮤테이션 7축 전부 RED** |
| E2E | 1건 — 파트 id `land#<assetId>`·`building#<assetId>` 고정 |
| 회귀 | 0건 (497파일 4,672테스트) · 축 B GB 79건 무변경 |

**뮤테이션**: ⑩ enum 제거(3) · ⑫ 서브객체 제거(2) · ⑬ emit 제거(2) · ⑭ 확장 제거(1) ·
⑭ 2단 안분 키 교체(1) · ⑭ 카드 태깅 제거(1) · ⑩ refine 예외 되돌림(1).

> 🔴 **GBC-4는 처음에 구별력 0이었다.** 합계만 보면 확장이 없어도(컴패니언 1건이 일반 자산으로
> 계산돼) 단건과 **우연히 같은 값**이 나왔다 — ⑫ 제거 뮤테이션에서 실측으로 드러났다.
> 「파트가 정확히 2건」을 먼저 단언해 고쳤다.

### 8.4 겸용주택에 남는 것

V-2~V-5·V-7 미해소 + **Q-1**(파트별 세율군 분리 허용 여부)·**Q-2**(차단 문구). ⑧은 계속
차단하며, 그 차단을 지키는 **양성 대조군**은 `gb-fractional-validate.predo` GBF-21의
「겸용주택 함께양도 차단은 그대로다」 항목이다(뮤테이션으로 구별력 확인 — 겸용 가드 제거 시 RED).

---

## 9. 겸용주택 — 실측 완료 · 구현 선행 조건 (2026-09-04)

### 9.1 🔴 12억 판정은 **카드 단위**다 — 주택분을 쪼개면 안 된다

| 카드 구성 | 결과 |
|---|---|
| 각 8억 2카드(합 16억) · 분모 미지정 | **둘 다 `isExempt: true`** — 전액 비과세 🔴 |
| 각 8억 2카드 + `totalPropertyTransferPrice: 16억` | 정상 과세 — 각 차익 600,000,000 · LTHD 120,000,000 |

⇒ **주택분은 토지·건물을 합쳐 한 카드**로 만든다. 겸용 엔진의 `rateParts`도 주택을
`kind: "housing"` **하나**로 본다(토지·건물 합산 income) — 규약이 일치한다.
쪼갤 수밖에 없는 경우에는 `totalPropertyTransferPrice`를 **반드시** 실어야 한다.

### 9.2 파트 카드 구성 (겸용 엔진 `rateParts`와 1:1)

| 카드 | `propertyType` | 비고 |
|---|---|---|
| 주택(토지+건물) | `housing` | §104①2·3호 괄호 — 딸린 토지 포함 |
| 상가 토지 | `land` | |
| 상가 건물 | `building` | |
| 배율초과 비사토 | `land` + `isNonBusinessLand` | §104⑤ 후단(별개 자산) · §104①8호 · **주택분 토지에서 carve-out**(`housingPart.nonBusinessTransferRatio`) |

### 9.3 🛑 착수 선행 조건 — ⑭ **25필드 매핑**

컴패니언 겸용은 route 5-a-2(`route.ts:363~440`)의 `mixedAsset` 조립을 컴패니언 컨텍스트로
다시 이어야 한다. 그 매핑은 **25개 필드**이고 대부분 **폼-전역**이다:

```
firstDisclosureDate isMixedUseHouse ownershipRatio isUnregistered wasRegulatedAtAcquisition
regionCode oneHouseExemptionProviso temporaryTwoHouse householdHousingCountForExclusion
assetContractDate specialHouseExclusions multiHouse houses sellingHouseId presaleRights
isOneHousehold isRegulatedArea marriageMerge parentalCareMerge gracePeriod surchargeFallback
householdHousingCount landAcquisitionDate buildingAcquisitionDate
```

🔴 **전부 optional이라 TypeScript가 누락을 못 잡는다.** 하나만 빠져도 세액이 조용히 틀린다 —
`CompanionRawAsset`이 손으로 쓴 인터페이스라 겪은 F13·F15와 **같은 실패 모드**다.

⇒ 착수 시 **⑫ 스키마에서 타입을 파생**시켜(`CompanionSplitFields` 선례) 컴파일러가 누락을
잡게 할 것. 그 장치 없이 손으로 25필드를 옮기면 안 된다.

📐 **그 장치의 구현 계획**: [`companion-derived-type-guard.plan.md`](./companion-derived-type-guard.plan.md)
— 갭이 **두 개**(타입 부재 / 조립부 미탑재)이고 F13·F15가 터진 곳은 **후자**라는 점,
가드가 조건부 spread에서도 작동함을 실측한 결과, 그리고 「반환 타입을 명시하면 가드가
무의미해진다」는 함정이 거기 있다.

### 9.4 엔진은 수술하지 않는다

파트 산출은 `buildHousingPart`·`buildCommercialPart`(rate-free)가 하지만, 그 **입력 조립**은
`calcMixedUseTransferTax` 안에서 rates 기반 판정(§104⑦ 중과·감면)을 거친다. 550줄 함수를
`buildTotalTax` 경계에서 쪼개는 것은 세액 계산 핵심을 건드리는 일이라,
**엔진을 그대로 호출해 파트만 쓰고 `total`은 버리는** 편이 위험이 훨씬 낮다
(세액을 두 번 계산하는 낭비는 감수한다 — GB가 `buildGbPartCards`로 카드만 얻는 것과 같은 층위).
`rates`는 `CompanionBuildContext`에 추가해 전달한다.

### 9.5 지금 남긴 것

`__tests__/api/transfer.route.companion-mixed-use.anchor.test.ts` — **MU-2 대조군 1건**만 둔다
(「primary 겸용은 계속 차단된다」). 개방 단언 4건(⑧ 해제·⑫ 도달·파트 확장·세율군 분리)은
착수 시 함께 넣는다. **지금 RED로 두면 CI가 상시 빨간불이 되어 게이트 구실을 못 한다.**
