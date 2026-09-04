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

### 9.2 파트 카드 구성 🔴 **아래 표는 틀렸다 — §10.3이 정본**

> 「주택은 토지+건물 **한 카드**」로 적었으나, 주택분 장기보유특별공제는 토지·건물을
> **각각의 보유기간으로** 계산해 더한다(실측 38,272,640원 차이). 카드 1장은 취득일이 하나뿐이라
> 재현할 수 없다. ⇒ **주택은 2카드 + `totalPropertyTransferPrice`**가 정답이다.
> 12억 판정(§9.1)은 그 분모가 담당한다 — 두 요구가 충돌하지 않는다.

| 카드 | `propertyType` | 비고 |
|---|---|---|
| ~~주택(토지+건물)~~ | ~~`housing`~~ | 🔴 §10.3 참조 |
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

---

## 10. 🔑 착수 실측 — **파트를 raw 금액으로 되먹이면 단건과 세액이 같다** (2026-09-04)

§9.4는 「엔진을 그대로 호출해 파트만 쓰고 `total`은 버린다」고 적었지만, **파트는
소득금액(차익−장특) 층위**이고 aggregate가 요구하는 것은 **양도가액·취득가액·필요경비**다.
그 사이를 잇는 재구성이 **드리프트 없이 성립하는가**가 착수 전 유일한 구조적 위험이었다.

⇒ throwaway probe로 4케이스를 쟀다. 재구성 규칙은 파트가 **이미 노출하는 echo 값**뿐이다
(`landTransferPrice`·`landAcqPrice`·`landAppraisalDed`, 건물분 동일 — 새 산식 없음):

| 케이스 | 과세표준 (단건 / aggregate) | 세액 (단건×1.1 / aggregate `totalTax`) |
|---|---|---|
| case14 (배율초과 없음) | 1,670,099,614 / **동일** | 754,165,308 / **754,165,308** |
| 배율초과(비사토 ratio 0.700) | 1,348,935,828 / **동일** | 595,189,234 / **595,189,234** |
| §104⑦ 중과 2주택 | 2,123,794,113 / **동일** | 1,251,108,072 / **1,251,108,072** |
| 1세대1주택 표2 + 12억 | 674,353,403 / 674,353,40**2** | — / **2원 차이** ⚠️ |

**재현되는 것**: 비사토 carve-out(`nonBusinessTransferRatio`로 토지분 3값을 나눈다) · 장특
표1/표2 · §95② 중과 LTHD 배제(`lthd 0`) · §104⑤ 세율군 분리(`multi_house_surcharge` ↔
`progressive`) · §104⑤ MAX(`clause2`).

> 🔑 **왜 재현되는가** — aggregate는 item마다 **단건 엔진을 그대로 돌린다**
> (`transfer-tax-aggregate.ts:210`). `TransferTaxItemInput`은 `TransferTaxInput`에서 4필드만
> 뺀 것이라 `multiHouse`·`residencePeriodMonths`·`isOneHousehold`를 **그대로 싣는다** —
> 겸용 엔진이 파트에 적용하던 판정을 item이 자기 힘으로 다시 판정한다. GB가
> `buildProperties`에서 `isOneHousehold: false`를 **하드코딩**하는 것과 대비된다(GB는 주택이
> 없어 그래도 됐다) ⇒ **겸용은 `buildProperties`를 재사용할 수 없다.**

### 10.1 ~~⚠️ 미해소 — V-8: 12억 안분에서 2원~~ ✅ **해소 — 주택 1카드가 만든 인공물이었다**

단건 `proratedTaxableGain` 314,371,441 vs aggregate 314,371,439. 차익(1,512,314,999)과
장특율(0.8)이 **같은데** 안분 결과만 갈린다 ⇒ **§89① 안분의 절사 순서**가 두 경로에서 다르다
(`applyRate` 소수 rate 1원 부족과 같은 계열). 양도가액을 `apportionment.housingTransferPrice`
그대로 써도 변하지 않았다 — 원인은 재구성이 아니라 **안분 leaf 자체**다.

✅ **주택을 토지·건물 2카드로 나누자 차이가 0이 됐다.** 원인은 안분 leaf가 아니라 **주택 1카드**
였다 — 한 카드로 합치면 §89① 안분 base가 겸용 엔진의 것과 미세하게 어긋난다. 지금은 anchor를
**완전 일치**로 쓴다(EQ-1~EQ-5 전건).

> ⭐ **교훈** — 「2원 차이는 절사 계열이니 허용 오차로 두자」로 갈 뻔했다. 실제 원인은 **구조**였고,
> 구조를 고치니 오차 자체가 사라졌다. 오차를 허용하기 전에 **오차가 어느 구조에서 나오는지**를
> 먼저 볼 것.

### 10.2 확정된 구현 형태

| 지점 | 내용 |
|---|---|
| leaf 승격 | route 5-a-2의 `mixedAsset` 조립(25필드)을 **`buildMixedUseAssetInput`으로 승격**해 route와 컴패니언이 **한 소스**를 쓴다 — §9.3의 「손으로 25필드를 옮기면 안 된다」를 구조로 푼다(GB가 `buildGbPartCards`를 승격한 것과 같은 층위). `satisfies` + 키 커버리지 가드도 leaf 안으로 함께 간다 |
| ⑩⑫ | `companionAssetSchema.assetKind` += `"mixed_use_house"` · `mixedUse: mixedUseAssetSchema.optional()` |
| ⑬ | ④가 컴패니언마다 `buildMixedUsePayload(a, form)`을 싣는다(그 함수는 이미 `AssetForm`을 받는다 — primary 전용이 아니다) |
| ⑭ | `bundled-split-helpers.ts`에 겸용 분기 — 엔진 1회 호출 후 파트 4건을 `TransferTaxItemInput`으로. `rates`를 `CompanionBuildContext`에 추가 |
| ⑧ | `transfer-tax-validate.ts:172`의 차단을 **primary 겸용만**으로 좁힌다(컴패니언 겸용은 개방) |

### 10.3 ✅ 확정된 카드 구성 (구현본)

| 카드 | `propertyType` | 세대 축 | 취득일 |
|---|---|---|---|
| 주택 토지 | `housing` | **싣는다** + `totalPropertyTransferPrice`(주택분 합계) | 토지 취득일 |
| 주택 건물 | `housing` | **싣는다** + 같은 분모 | 건물 취득일 |
| 상가 토지 | `land` | 없음 | 토지 취득일 |
| 상가 건물 | `building` | 없음 | 건물 취득일 |
| 배율초과 비사토 | `land` + `isNonBusinessLand` | 없음 | 토지 취득일 |

🔴 **상가·비사토에 세대 축을 실으면 상가가 1세대1주택 표2 80% 장특을 받는다**(실측 — 처음
프로브에서 실제로 그렇게 나왔다). GB `buildProperties`가 `isOneHousehold: false`를 하드코딩하는
것과 같은 규약이다.

⇒ 이 세 결정은 anchor `mixed-use-part-cards.equivalence.anchor.test.ts`가 뮤테이션으로 고정한다
(MUT-1 분모 제거 · MUT-2 세대 축 누출). §10.1의 **2원 차이도 사라졌다** — 그것은 주택 1카드가
만든 인공물이었다.

~~**⑧을 primary까지 열지 않는 이유**~~ ⇒ §11에서 함께 열었다.

---

## 11. primary 겸용도 열었다 (2026-09-04)

5-a의 primary는 `{...engineInput}` 스프레드라 겸용이어도 **평범한 주택 item**이 됐다.
그 자리에 **컴패니언과 같은 leaf**(`buildMixedUseCompanionItems`)를 달아 파트 4~5장으로 대체한다.

| | |
|---|---|
| ⑭ | primary 분기가 `data.propertyType === "mixed-use-house" && data.mixedUse`면 파트로 대체 |
| ⑧ | 겸용 함께양도 차단 **전부 제거** |
| 공용화 | `mixedUseCtx`를 `items` 앞으로 끌어올려 **primary·컴패니언이 같은 객체**를 쓴다 — 폼-전역 값이라 자산마다 달라질 수 없고, 두 곳에서 따로 조립하면 한쪽만 필드를 빠뜨린다 |

### 11.1 🔑 위치 불변이 핵심 anchor다

겸용과 일반주택의 **자리만 바꾼 거울상** 두 폼이 같은 세액을 내야 한다 —
실측 **과세표준 453,500,002 · 총세액 171,006,000**으로 일치(PM-3 · E2E).

종전 상태는 「⑧이 막기 전에는 200이면서 겸용 산출물이 하나도 없는 **침묵 오산**」이었으므로,
확장을 제거하는 뮤테이션에서 PM-2·PM-3가 함께 RED가 된다(실측).

### 11.2 ⚠️ 겸용 × 지분 분할은 **계속 차단**이다

`totalPropertyTransferPrice`가 두 의미로 충돌한다 — 지분 축에서는 「물건 전체 양도가액」,
겸용 파트에서는 「주택분 합계」다. `transfer-tax-validate.ts:81`의 기존 차단이 살아 있어
두 축이 만나지 않는다. **반전이 이 안전망을 지우지 않도록** 양성 대조군을 두 곳에 뒀다
(PM-4 · `burdened-gift-fractional-validate`).

---

## 12. 겸용 × 공유지분 — §89① 12억 분모 (2026-09-04)

### 12.1 🔴 축 A(단건 공유지분)에 **살아 있던 오산**

겸용 엔진은 12억 판정·안분 분모로 `apportionment.housingTransferPrice`를 썼는데 그 값은
**내 지분분**이다. 지분 60%면 문턱이 `1/0.6`만큼 올라간다.

| | 주택분 안분액 | §89① | 산출세액 |
|---|---:|---|---:|
| 단독 100% | 1,666,666,666 | 과세 | 153,322,963 |
| 60% 지분 (종전) | 1,000,000,000 | **전액 비과세** 🔴 | 17,983,739 |
| 60% 지분 (정정) | 분모 **1,666,666,666** | 과세 | **58,057,815** |

⚠️ **도달 경로가 있었다** — 「나머지 지분은 타인 소유」(축 A 선언)를 고르면 ⑧을 통과한다.
「막혀 있다」가 아니라 **열려 있는데 틀린** 상태였다.

**법령** — 「소득세법 시행령」 제156조
① "1주택 및 이에 딸린 토지의 일부를 양도하거나 **일부가 타인 소유인 경우**로서 실지거래가액
합계액에 양도하는 부분(**타인 소유부분을 포함한다**)의 면적이 전체 주택면적에서 차지하는
비율을 나누어 계산한 금액이 12억원을 초과하는 경우에는 고가주택으로 본다."
② 겸용주택은 "제154조제3항 본문에 따라 **주택으로 보는 부분**(이에 부수되는 토지를 포함한다)에
해당하는 실지거래가액을 포함한다."

⇒ 분모 = **물건 전체 양도가액 × 주택 기준시가 비율**. 일반 주택 경로는
`TransferTaxInput.totalPropertyTransferPrice`로 이미 같은 규약이었고 **겸용만 빠져 있었다**.

### 12.2 파트 카드 분모도 같은 소스로 묶었다 — 44,115,471원 갈림

파트 카드는 12억 분모로 **카드 합계**를 쓰고 있었다. 두 지점에서 엔진과 갈린다:

- **지분** — 카드 합계는 내 지분분이다(위와 같은 오산이 aggregate 쪽에서 재발).
- **배율초과 비사토** — 카드 합계는 carve-out **후**, 엔진 분모는 carve-out **전**.
  실측(배율초과 + 1세대1주택 + 주택분 12억 초과): 과세표준 **783,112,090 vs 827,227,561**
  = **44,115,471 과소**.

⇒ `apportionment`를 단일 소스로 쓴다. anchor **EQ-6**이 두 뮤테이션을 모두 RED로 만든다.

### 12.3 비사토 carve-out은 **양도가액이 잔액을 흡수**한다

엔진은 **차익**을 비율로 쪼개고(`floor(landGain × ratio)`) 파트 카드는 **금액 3종**을 쪼갠다.
각각 절사하면 차익이 1원 어긋난다(실측). ⇒ 취득가액·개산공제만 절사하고 **양도가액을 역산**해
비사토 카드 차익이 `nonBusinessTransferredGain`과 정확히 같아지게 한다. 합은 불변이다.

> ⚠️ 한때 「원시연산 불일치(부동소수점 비율 vs `calculateProration`)」를 원인으로 보고 엔진을
> 고쳤으나, **되돌려도 전건 통과**했다 — 원인이 아니었다. 안 깨진 것을 고치지 않기 위해 되돌렸다.
> (겸용 엔진의 부동소수점 비율은 P0-2 원칙과 어긋나지만 이 축과 무관한 기존 사안이다.)

### 12.4 ✅ 축 B(지분 분할 취득) **개방** — 장벽은 절대금액 스케일이었다 (같은 날 후속)

⑧을 걷고 실측하면 배관은 **완전히 통한다**(파트 카드 10장 = 5 × 2지분). 그런데 세액이
단건 100%와 크게 다르다. 원인은 **취득가액이 두 카드에서 동일**하다는 것 —
`buildMixedUsePayload`가 절대금액 성분에 지분 스케일을 걸지 않아 **2배 계상**된다.

스케일이 필요한 후보(각각 「약분되는가 / 절대금액인가」 판정 필요 — 상가·수용에서 그 판정이
뒤집힌 이력이 있다):

```
acquisitionActualTotalPrice · capitalExpenditure · transferExpense
housingInheritedValue · commercialInheritedValue
housingInheritedExpense · commercialInheritedExpense
housingCompensationTotal · commercialLandCompensationTotal
housingCompensationBasisTotal · commercialLandCompensationBasisTotal
totalTransferPriceForFourPart
```

기준시가(㎡당·총액)와 **면적**은 스케일 불요다 — 전자는 분자·분모 약분, 후자는 물건 단위 사실
(상가 축 B가 같은 근거로 열렸다). 재개발이 「청산금·권리가액이 절대금액」이라 막혀 있는 것과
**같은 형태의 장벽**이다.

#### 판정표 (④ `buildMixedUsePayload`)

| 필드 | 스케일 | 근거 |
|---|---|---|
| `acquisitionActualTotalPrice` | **한다** | 취득 실거래가·감정가액·매매사례가액 **총액** |
| `capitalExpenditure`·`transferExpense` | **한다** | 자산 단위 공통 필요경비 |
| `housing·commercialInheritedValue` | **한다** | 상속·증여 신고 **평가액** |
| `housing·commercialInheritedExpense` | **한다** | 파트별 필요경비 |
| `totalTransferPriceForFourPart` | **한다** ✅실측 | §12.7 |
| 기준시가 전부 | 안 한다 | 환산 산식에서 분자·분모 약분 |
| 면적 전부 | 안 한다 | 물건 단위 사실 |
| **보상액 4종** | **안 한다** | 기준시가 총액과 `min`으로 겨루는 값이라 **같은 스케일**이어야 한다(§164⑨1호 환산 분모) |
| `totalPropertyTransferPrice` | 안 한다 | 정의가 「물건 전체」다(영 §156①) |

**실측**: 축 B 60/40 합계 **152,203,211 = 단건 100% ×1.1 완전 일치**.

### 12.5 🔴 파트 카드가 필요경비를 **이중계상**하고 있었다 (#1466·#1467 잠재 결함)

겸용 엔진은 공통 필요경비를 **파트 개산공제에 접어 넣는다**(`resolvePartNecessaryExpense` —
법 §100② 후문). 파트 카드가 `capitalExpenditure`·`transferExpense`를 **또** 들고 있으면
aggregate가 카드마다 다시 빼서 **카드 수만큼 배가**된다.

**실측**(자본적지출 1억 + 양도비 2천만): 과세표준 **1,670,099,614 → 1,317,564,948
= 352,534,666 과대차감**. ⇒ 카드에서 두 필드를 중화한다. anchor **EQ-7**.

> ⚠️ #1466·#1467의 등가 anchor가 못 잡은 이유는 픽스처의 필요경비가 **0**이었기 때문이다 —
> 「픽스처 기본값이 게이트 결함을 가린다」의 전형이다.

### 12.6 대조군을 **두 번** 옮겼다

겸용 함께양도 차단(→ 열림) → 겸용 × 지분 분할(→ 같은 날 열림) → **재개발APT × 지분 분할**.
반전할 때마다 「무엇이 아직 살아 있는가」를 다시 골라야 한다. 재개발이 남는 근거는 분명하다 —
**청산금·권리가액이 절대금액**이라 지분 스케일 배관이 필요한데 없다(겸용이 같은 이유로
막혀 있다가 ④ 스케일로 열렸다).

---

## 13. 재개발APT·입주권 × 지분 분할 (2026-09-04)

### 13.1 🔴 차단 사유가 **stale**이었다

⑧은 「§166 서브객체가 컴패니언에 없고, 청산금·권리가액이 **절대금액 성분**이라 지분 스케일이
필요하다」로 재개발APT를 막고 있었다. **둘 다 이미 있었다**:

- `buildRedevelopmentPayload`는 `rightsValue`·`preApprovalExpenses`·`postApprovalExpenses`
  스케일러(`share()`)를 **처음부터 갖고 있었다**. 청산금만 제외돼 있고 그 근거도 적혀 있다 —
  §166①1호 「**납부한** 청산금」은 사실이고 UI가 지분 모드에서 「(지분 납부분)」을 직접 받는다.
- ⑫ `redevelopment` 서브객체는 **2026-09-03에 등록**됐다(컴패니언 재개발 개방 때).

막고 있던 것은 **컴패니언 호출부가 `ownershipRatio`를 넘기지 않는 것** 하나였다:

```ts
// 종전 — 「컴패니언은 각 자산이 자기 물건의 100%」라는 전제
buildRedevPayloadForCompanion(asset)
```

그 전제는 **함께양도(다른 물건)에서는 맞지만 축 B(지분 분할)에서는 틀리다** — 그쪽 컴패니언은
**같은 물건의 다른 지분**이다.

**실측**: 축 B 60/40 합계 **453,700,500 = 단건 100%와 완전 일치**.

### 13.2 🔴 입주권은 ⑧ 목록에 없어 **이미 열려 있었고, 그래서 틀려 있었다**

같은 미전달로 40% 카드의 권리가액·필요경비가 **100% 값**으로 남아 과대 계상됐다 —
실측 **579,390,900 → 624,772,500 (45,381,600 과소)**.

> ⭐ **세 번 연속으로 「열려 있는 인접 축」에서 나왔다** — 겸용 12억 분모(#1468) ·
> 겸용 절대금액(#1469) · 입주권 지분(#1470). 새 축을 열려고 조사하면 **이미 열린 쪽**을
> 먼저 재는 것이 규칙이 되어야 한다.

### 13.3 자산 종류 차단 목록이 **비었다** — 대조군 3차 인계

| 자산 | 열린 날 | 막고 있던 진짜 원인 |
|---|---|---|
| `general_building` | 2026-08-10 | 전용 경로 부재(진짜) |
| `commercial_building` | 2026-09-03 | 「경로 부재」가 아니라 **⑩ enum 3종** |
| 겸용주택 | 2026-09-04 | 「모델 비양립」이 아니라 **절대금액 미스케일** |
| `redevelopment_apt` | 2026-09-04 | 사유가 **stale** — 스케일도 서브객체도 이미 있었다 |

⇒ 「이 가드가 살아 있음」 대조군이 성립하지 않는다. 지분 축의 살아 있는 게이트는
`transfer-tax-validate-asset.ts`의 **Gate-A**(「지분 모드 자산은 **단독으로** 계산할 수 없다」)
이고, 대조군을 그리로 옮겼다(GBF-13 · GBF-21 · burdened-gift 3곳). Gate-A를 지우는 뮤테이션에서
2건이 RED가 되는 것을 확인했다.


---

## 12.7 ✅ PHD 4부분 분모 스케일 — 실측 완료 (2026-09-04 후속)

§12.4 판정표에서 `totalTransferPriceForFourPart`만 「판정 근거는 세웠으나 **PHD 픽스처로
실측하지 못했다**」로 남아 있었다. Case A 픽스처로 닫았다.

### 근거 (엔진 구조)

4부분 분기는 `totalTransfer4`에서 **모든 값을 파생**한다
(`transfer-tax-pre-housing-disclosure.ts`): 양도가액 4분할이 그 총액을 나눠 갖고
(`commercialBuildingTransferPrice = totalTransfer4 − 나머지 셋`), 환산취득가 총액도
`floor(totalTransfer4 × P_A_est / H34)`다. 기준시가 3시점은 **비율 산정에만** 쓰여 물건 전체로
유지되고, 개산공제는 `computeEstimatedDeduction(..., input.ownershipRatio)`가 따로 줄인다.

### 실측

| | 4분할 분모 | 주택 차익 | 산출세액 |
|---|---:|---:|---:|
| 단독 100% | 1,500,000,000 | 919,976,978 | 325,318,906 |
| 60% 지분 (스케일 O) | **900,000,000** | 551,986,187 (**0.6배**) | **180,395,344** |
| 60% 지분 (스케일 X) | 1,500,000,000 | 921,700,921 (**물건 전체**) | 326,162,218 |

⇒ 스케일하지 않으면 **60% 지분인데 물건 전체 차익**이 나온다(145,766,874 과대).

축 B 60/40: 스케일 O **357,850,801** vs 단건×1.1 357,850,796 — **5원 차**.
스케일 X면 **782,727,113**(단건의 2.2배).

> ⚠️ **5원은 구조에서 나온다** — 4부분은 개산공제를 「성분별 독립 floor(잔액 흡수 없음)」로
> 계산하고(엔진 주석), 지분 카드마다 그 floor가 다시 걸려
> `floor(0.6x) + floor(0.4x) ≤ floor(x)`가 성분 수만큼 누적된다.
> **비-PHD 겸용 축 B는 완전 일치**한다(그쪽엔 이 floor가 없다). anchor는 ±10원 허용 + 상수 고정.

### 🔴 함께 발견 — 겸용 × 환산 컴패니언이 **안내 없는 400**이었다

⑩ `addCompanionAcquisitionCauseRefines`가 컴패니언-수준 `standardPriceAtAcquisition`을
요구하는데, 겸용은 그 값을 **자기 `mixedUse` 서브객체**(3시점 기준시가)가 갖고 ⑧도 요구하지
않는다 ⇒ **⑧ 통과 ↔ ⑩ 400**. 일반건물·부담부증여가 같은 이유로 이미 예외였고 **겸용만
빠져 있었다**. #1466·#1467의 픽스처가 전부 **실가 모드**라 드러나지 않았다
(「픽스처 기본값이 게이트 결함을 가린다」의 세 번째 사례).
