# 부담부증여 지원 확장 — 조합원입주권·재개발/재건축 APT

> 작성 2026-08-12 · **R3 개정** — 13단계 자가검토 STEP 1~9 반영(설계 문서 검토 60건 · 상충 3건 직접 실측 판정)
> 초판 → R2: 계획서 검토 · R2 → R3: **설계 문서가 계획서를 3곳 뒤집었다**(clamp 서술 · 개산공제 귀속 · R-4 도달성)
> (6-way 병렬 검토 **57건 보고** → 중복 3쌍 병합·전제 오류 1건 기각 후 반영 · Critical 8 · 재검토 파급 정정 11곳)
> 상태 **계획(Plan)** — 착수 전. **Do 진입 게이트 = P0 probe 완료**(U-1이 설계를 바꿀 수 있다)
> 대상 `assetKind`: **`right_to_move_in`(조합원입주권)** · **`redevelopment_apt`(재개발/재건축 APT)**
> ⛔ **`presale_right`(분양권)는 범위 밖** — 사용자 판단(2026-08-12): 부담부증여 실무 사례가 사실상 없다.
> 인용은 전부 실측이다(법령=KoreanLaw 현행 원문 · 코드=`file:line` · 해석례=국세청 본문 직접 조회).
> 미검증은 §9에 **「확인 필요」로 분리**했다 — 본문에는 단정만 남긴다.

---

## §0 요약 — 이 작업의 실체

「미지원 자산에 부담부증여를 켠다」는 **하나의 기능이 아니다**. 대상 2종은 서로 **다른 법령 축**을 타고, 그중 하나(입주권)는 현행 엔진의 자산 모델·분기 구조와 정면으로 어긋난다.

| 축 | 조합원입주권 (`right_to_move_in`) | 재개발 APT (`redevelopment_apt`, subject=`apt`) |
|---|---|---|
| 증여재산 평가 C | 상증법 **§61③** → 상증령 §51② (조합원권리가액+납입금+프리미엄) | 상증법 **§61①4호** (고시주택가격) |
| §159①1호 A 괄호 「취득가액도 기준시가」 | **미발동** — §61③은 괄호 열거에 없다<br>(단 `selectedMode`가 §66·§61⑤면 발동 여지 → §9 U-6) | **발동**(보충적평가 채택 시) — §61①은 열거에 있다 |
| ⇒ 취득가액 | **실지거래가액**(§97①1호가목) — 기존 **K-4 필드 재사용**. 환산(나목)은 §166③ 미점화로 도달 불가 | **기준시가** (현행 housing과 동형) |
| **개산공제(소령 §163⑥)** | **미적용** — K-4 전용이라 실비로 대체(1% 경로는 도달 불가) | 3%(2호가목) 또는 K-4 시 미적용 |
| 자산 축 | **단일 권리** (토지·건물 분리 없음) | 토지·건물 (현행 모델과 호환) |
| 양도차익 산정 | 소령 **§166①** (인가전/인가후) — `redevelopment` 입력 시 | 소령 **§166②**(1호=엔진 3분할 / 2호는 ①2호 준용) |

⇒ **재개발 APT는 기존 축의 확장**이고, **입주권은 새 축의 신설**이다. 한 PR로 묶으면 후자의 난점이 전자를 인질로 잡는다 ⇒ **Phase 분리**(§6).

> ⚠️ **R2에서 뒤집힌 것**: 초판은 재개발 APT를 「housing과 동형이라 쉽다」고 봤으나 실측으로 무너졌다 — 12억 안분 분모가 재개발 경로에 **배선되어 있지 않다**(§5 D-2). **PA**를 먼저 두는 근거는 「쉬워서」가 아니라 **「두 Phase의 공통 인프라를 먼저 깐다」**이다.

---

## §1 현행 실측 — 어디서 막히고, 무엇이 자동으로 열리나

### 1.1 명시적 차단 — 3층

세 곳이 지원 목록을 **독립 하드코딩**한다. 실측 결과 **세 목록의 내용은 완전히 동일**하다(5종).

| # | 층 | 정의 위치 | 타입 |
|---|---|---|---|
| ① | UI | `components/calc/transfer/TransferModeBlock.tsx:51-57` `SUPPORTED_ASSET_KINDS` | `AssetForm["assetKind"][]` |
| ② | validate | `lib/calc/transfer-tax-validate-bg.ts:27-33` `SUPPORTED_KINDS` (사용처 :45-46) | 동상 |
| ③ | 엔진 | `lib/tax-engine/burdened-gift-eligibility.ts:47` `SUPPORTED` | `string[]` |

- ③의 `general_building_unit`은 **주석(:46)에만** 있고 배열에는 없다 — 초판의 「+1종」 서술은 오류였다.
- ①은 **차단이 아니라 안내**다 — 라디오는 눌리지만 `BurdenedGiftBlock`이 렌더되지 않는다(`TransferModeBlock.tsx:144-157`). 입력 경로가 없어 값이 만들어지지 않는다.
- ③은 plain `new Error`이고 `app/api/calc/transfer/route.ts:482-493`이 **`{ status: 500 }`** 으로 응답한다 — 500 본문에 명시 메시지가 실린다(초판의 「500이 아니라」는 오류).
- **Zod(⑫)에는 자산종류 게이트가 없다**(`lib/api/transfer-tax-burdened-gift-schema.ts` 전문 99줄, `assetKind` 참조 0건). 스키마는 통과시키고 ③이 잡는다.
- ③(`propertyType`, 10멤버 `types/transfer.types.ts:98`)과 ①②(`assetKind`, 8멤버)는 **타입이 다르고**, 엔진(Layer 2)은 `lib/calc`·`components`를 import할 수 없다 ⇒ **단일 상수 추출 불가**. §6은 이를 **parity 테스트**로 대체한다.

> ⚠️ 에러 메시지 2곳(`burdened-gift-eligibility.ts:50-52` · `transfer-tax-validate-bg.ts:46`)이 자산 목록을 **한국어로 다시 하드코딩**한다 ⇒ 실질 중복은 5곳이다. 목록을 넓힐 때 메시지도 함께 고칠 것.

### 1.2 🔴 자동으로 열리는 경로 — 게이트를 여는 순간 활성화된다 (초판 누락)

**차단 목록을 넓히면 아래 4개가 아무 추가 작업 없이 켜진다.** 초판의 「3중 게이트」 표는 이것들을 담지 못했다.

| 경로 | 위치 | 열리면 무슨 일이 |
|---|---|---|
| **취득시 기준시가 입력·검증** | `lib/calc/burdened-gift-acq-std-price.ts:38-44` `needsBgAcqStdPriceInput`<br>렌더 `AssetSectionTransfer.tsx:152-191` · validate `transfer-tax-validate-bg.ts:181-185` | 술어가 `assetKind !== "general_building"`만 제외 ⇒ **입주권에도 「취득시 기준시가」 카드가 뜨고 필수가 된다**. P-1(입주권은 기준시가 강제 미발동)과 **정면 충돌** — 법적 근거 없는 값을 강제 입력시킨다 |
| **API 조립 catch-all** | `lib/calc/transfer-tax-api-burdened-gift.ts:209-215` | `general_building`·`land`가 **아닌 모든** assetKind가 여기 떨어져 `buildingStdPriceAtTransfer = parseAmount(standardPriceAtTransfer)`로 실린다 ⇒ 입주권 C 산식(권리가액+납입금+프리미엄)이 **엔진에 도달하지 않는다** |
| **④ 증여재산 평가 카드** | `BurdenedGiftBlock.tsx:502`(게이트) · `:520`(라벨 fallback) | 게이트가 `!isMarketMode && assetKind !== "land"` ⇒ **입주권도 렌더**되고, 라벨 fallback으로 **「증여일 현재 기준시가」**가 뜬다. §61③ 자산에 기준시가 라벨은 틀렸다 |
| **양도시 기준시가 카드** | `CompanionSaleModeBlock.tsx:119-125` `toPropertyKind` · `AssetSectionTransfer.tsx:85-91` | 입주권이 `building_non_residential`로 매핑돼 **비주거 건물 공시가격 조회 UI**가 뜬다. 그 값이 위 catch-all로 C에 실린다 |

### 1.3 §166 재개발 분기와의 접점

```
transfer-tax.ts:153  STEP 0.48  부담부증여 §159 (runBurdenedGiftStep)   ← 먼저
transfer-tax.ts:216  STEP 0.65  재개발 §166   (calculateRedevelopmentTax) ← 나중, return
```

`transfer-tax-redevelopment.ts:50` 주석이 명시한다 — 「@param input … (workingInput, **burdenedGift override 후**)」.

⚠️ 그러나 `calculateRedevelopmentTax(input, parsedRates, baseSteps)`(`:56-60`)는 **`transferBurdenedGiftBreakdown`을 받지 않는다**. 일반 경로는 `transfer-tax.ts:400·727`에서 결과에 싣지만 재개발 경로에는 그 배선이 없다 ⇒ **명세가 결과에서 유실된다**.

### 1.4 `isRedevelopmentActive` — subject 축이 진입을 가른다

```ts
// lib/tax-engine/redevelopment.ts:724-732
if (redevelopment == null) return false;                                    // ← 입력 없으면 일반 경로
if (propertyType === "redevelopment_apt")  return redevelopment.subject === "apt";
if (propertyType === "right_to_move_in")   return redevelopment.subject === "right";
return false;
```

⇒ **`redevelopment_apt` + `redevSubject="right"`는 §166을 타지 않는다**. UI는 그 조합을 만들 수 있다 — `RedevelopmentBlock.tsx:161-162`는 `assetKind==="right_to_move_in"`일 때만 `apt`를 disabled 하고 그 역은 막지 않는다.

---

## §2 법령 축 — 검증된 원문

### 2.1 소령 §159 (부담부증여 양도차익)

```
① 1호 취득가액 = A × B/C
   A: 법 제97조제1항제1호에 따른 가액
      (제2호에 따른 양도가액을 「상증법」 제61조제1항·제2항·제5항 및 제66조에 따라
       기준시가로 산정한 경우에는 취득가액도 기준시가로 산정한다)
   B: 채무액   C: 증여가액
② 2호 양도가액 = A × B/C
   A: 「상증법」 제60조부터 제66조까지의 규정에 따라 평가한 가액
```

> 🔑 **A 괄호의 열거는 `§61①·②·⑤ 및 §66`이다. `§61③`은 없다.**
> ⚠️ 다만 괄호의 트리거는 **자산종류가 아니라 「어느 조항으로 양도가액을 산정했는가」**다. 현행 엔진은 `Max(supplementary, mortgage(§66), rental(§61⑤))`를 자산종류와 무관하게 계산한다(`burdened-gift-eligibility.ts:66-72`) ⇒ 입주권이라도 **담보평가(§66)가 채택되면 괄호 발동 여지**가 있다. 본 계획의 P-1은 **`selectedMode === "supplementary"`인 경우로 한정**하고, 나머지는 §9 U-6으로 분리한다.

**§159②**: 과세대상 자산과 비대상 자산을 함께 부담부증여할 때 채무액을 자산가액 비율로 안분 — 현행 엔진 미구현(§10).

### 2.2 상증법 §61③ · 상증령 §51② · 상증칙 §16③ — **조합원입주권** 평가

- **상증법 §61③**: 「지상권 및 **부동산을 취득할 수 있는 권리**와 특정시설물을 이용할 수 있는 권리는 … 대통령령으로 정하는 방법으로 평가한 가액으로 한다」
- **상증령 §51②** (단서 포함 전문):
  > 부동산을 취득할 수 있는 권리(건물이 완성되는 때에 그 건물과 이에 부수되는 토지를 취득할 수 있는 권리를 포함한다) 및 특정시설물을 이용할 수 있는 권리의 가액은 **평가기준일까지 납입한 금액**(「소득세법」 제89조제2항에 따른 **조합원입주권**의 경우 「도시 및 주거환경정비법」 제74조제1항에 따른 관리처분계획을 기준으로 하여 재정경제부령으로 정하는 **조합원권리가액**과 평가기준일까지 납입한 **계약금, 중도금 등**을 합한 금액으로 한다)**과 평가기준일 현재의 프레미엄**에 상당하는 금액을 합한 금액으로 한다. **다만, 해당 권리에 대하여 「소득세법 시행령」 제165조제8항제3호에 따른 가액이 있는 경우에는 해당 가액으로 한다.**
  - 단서의 소령 §165⑧3호는 **시설물이용권**(지방세법 시가표준액)이므로 **조합원입주권과 무관**하다 — 실측 확인.
- **상증칙 §16③** — 「조합원권리가액」:
  > 분양대상자의 종전 토지 및 건축물 가격 × [(정비사업 완료 후의 대지 및 건축물의 총 수입추산액 − 총 소요사업비) ÷ 종전의 토지 및 건축물의 총 가액]

⇒ **입주권 C = 조합원권리가액 + 납입 계약금·중도금 + 프리미엄**

> ⚠️ **`redevelopment.rightsValue`를 그대로 재사용하면 안 된다.** 소령 **§166④1호**의 「기존건물과 그 부수토지의 평가액」 = 「관리처분계획등에 따라 **정하여진 가격**」이고, 상증칙 §16③은 「종전자산가격 **× 비례율**」이다 — 법문이 다르다. 비례율 100%에서만 우연히 같다.
> ⇒ **별도 입력 칸**으로 두고 `rightsValue`는 **초기값 프리필**로만 쓴다. 프리필은 **store write**(진입 시 1회 확정)이며 **display fallback 단독 금지** — 사용자가 손대지 않으면 store가 0으로 남아 ⑧이 침묵 차단한다(`feedback_store_default_vs_ui_display_fallback`, 도출 사례가 같은 `RedevelopmentBlock` 축의 `redevOriginalAssetType`).

### 2.3 🔴 소령 §163⑥ — 개산공제율은 자산마다 다르다 (초판 완전 누락)

```
1. 토지                                      개별공시지가 × 3/100 (미등기 3/1000)
2. 건물  가. §99①1호 다목 건물·라목 주택      해당 가액 × 3/100 (미등기 3/1000)
        나. 가목 외의 건물                    §99①1호 나목 가액 × 3/100 (미등기 3/1000)
3. 법 §94①2호 **나목 및 다목**의 자산(미등기 제외)   취득당시 기준시가 × 7/100
4. **제1호 내지 제3호 외의 자산**                     취득당시 기준시가 × 1/100
```

소득세법 §94①2호: **가목** = 부동산을 취득할 수 있는 권리 / 나목 = 지상권 / 다목 = 전세권·등기된 부동산임차권.

⇒ **조합원입주권은 가목**이라 3호에 열거되지 않는다 ⇒ **4호 = 1%**.
⇒ **재개발 APT(완공 주택)는 2호가목 = 3%**.

> 🔑 **정밀화(설계 단계 · 2026-08-12)** — 「입주권 = 1%」는 **무조건이 아니다**. 개산공제의 대상은 **취득가액을 환산한 그 자산**이다.
> · **§166 경로**(R-1·R-2·R-3·R-6): §166①1호·②1호 산식이 §163⑥ 필요경비를 **인가전양도차익**에서 빼는데, 그 자산은 「**기존건물과 그 부수토지**」(종전 주택·토지)다 ⇒ **3%가 맞다. `redevelopment-split.ts`의 현행 3%는 정당하므로 건드리지 않는다.**
> · **일반 경로**(R-4 — `redevelopment` 미입력): 환산 대상이 **입주권 자체**(§94①2호가목) ⇒ **1%**.
> ⇒ 신설이 필요한 지점은 R-4 하나인데, **그 R-4가 도달 불가다**(2026-08-12 실측 — `transfer-tax-api.ts:175-176`).
> ⇒ **1% 상수 신설 불요.** 위 법령 분석은 분양권 지원 재개·`useEstimatedAcquisition` 강제 해제 시를 위해 **기록으로만** 보존한다.
> ⚠️ 후일 1%를 넣게 되면 `estimatedDeductionRate()`(`legal-codes/transfer-nbl.ts:183`) **SSOT 함수를 확장**할 것 — 그 주석이 리터럴 사용을 금하고 「15곳 3% 고정 → 미등기 10배 오류」 이력을 든다.

**저장소 실측**: `legal-codes/burdened-gift.ts:151·153`에 `REGISTERED_ESTIMATED_DEDUCTION_RATE = 0.03` · `UNREGISTERED_… = 0.003` **둘뿐**이고, **1%·7% 축은 전 코드베이스에 없다**. 계획대로 기존 경로를 재사용하면 입주권 환산(K-5) 케이스에서 **개산공제가 3배 과대 → 세액 과소**가 된다.

> 같은 클래스의 선례가 저장소에 있다 — `legal-codes/transfer-nbl.ts:173-181`: 「15곳이 3% 고정이라 미등기 개산공제가 10배로 산출됐다(2026-07-28 정정)」. 이번은 **새로 만드는** 결함이라는 점이 다르다.

### 2.4 ⚠️ 소령 §163⑨는 **반대편 당사자**의 조문이다 — 혼동 금지

§163⑨는 「상속 또는 증여(**부담부증여의 채무액에 해당하는 부분도 포함**)받은 자산」의 §97①1호가목 가액을 상증법 평가액으로 **의제**한다. 이는 **수증자가 나중에 그 자산을 양도할 때**의 취득가액이다. 본 계획은 **증여자(양도인) 측** 양도세이므로 층위가 다르다.
❌ §163⑨를 근거로 「부담부증여 양도인의 취득가액도 상증 평가액」이라고 읽지 말 것.

### 2.5 국세청 해석례 — 본문 실측

| 문서 | 요지 (원문 발췌) |
|---|---|
| **서면인터넷방문상담4팀-2568** (2005.12.21.) | 「부동산상의 권리를 부담부증여시 … **양도가액 산정을 위한 「당해 재산의 가액」은 상증법 §60~§66 평가액**, **취득가액 산정을 위한 「당해 재산의 가액」은 소득세법 §97①1호에 따른 가액**」 |
| **서면인터넷방문상담4팀-39** (2005.01.05.) | 「비과세 대상 입주권을 부담부증여시 **인계하는 채무액에 대하여는 양도소득세가 과세되지 않습니다**」 |
| **사전답변** (2020.03.19.) | 「장기임대주택+거주주택 1세대가 거주주택을 양도(**부담부증여**)하는 경우 §155⑳ 적용. 다만 **관리처분계획인가 후 조합원입주권 양도에는 적용되지 않는다**」 |

- 2568은 §2.1 판정(취득가액은 상증 평가액이 아니라 §97①1호 가액)을 **직접 뒷받침**한다.
- 4팀-39는 **§89①4호 비과세가 부담부증여에도 적용됨**을 확인 ⇒ `RedevelopmentRightExemptionSection` 경로가 살아야 한다(anchor R-A4).
- ⚠️ 2005년 회신이다. 당시 §96·§97은 기준시가 원칙이었다 — 인용은 **「A는 §97①1호가 정하는 가액」이라는 구조 판단**에 한정하고, 「그 가액이 기준시가다」로 읽지 않는다.

---

## §3 핵심 설계 판정 5건

### P-1 · 입주권 취득가액은 기준시가 강제를 받지 않는다 — **단, 보충적평가 채택 시**
현행 K-1~K-3(`sangjeungbeop_standard` ⇒ 기준시가로 취득가액 산정)는 **§159①1호 A 괄호**에 근거한다. 입주권은 §61③ 평가라 괄호 미발동 ⇒ **취득가액은 실지(§97①1호가목)·불명 시 환산(나목)**.
**적용 조건**: `giftValuation.selectedMode === "supplementary"`. `mortgage`(§66)·`rental`(§61⑤) 채택 시는 §9 U-6.

### P-2 · 입주권은 「토지·건물」 2분 모델이 성립하지 않는다 → **`building` 슬롯에 매핑**
`perAsset`은 `{ land, building }` **고정 2슬롯**이다(`types/transfer-burdened-gift.types.ts:407-436`).
**현행 관행 실측**: 단일자산 3종(housing·building·commercial_building)은 전부 **`building` 슬롯에 총액**을 싣고 `land=0`이다(`transfer-tax-api-burdened-gift.ts:211-214`). `land` 슬롯은 `land` assetKind 전용(:195-201).
**하류 실측**: `splitRealExpenseByNature`(`burdened-gift-apportionment.ts:277-291`)는 실비를 `landStd / (land+building)` 비율로 나누는데, 두 값이 0이면 `capexLand = 0` → **전액이 `building`으로** 간다(:286·:290).
⇒ 초판의 「`land` 슬롯에 권리 전액」은 관행·하류 동작 **양쪽과 반대**였다. **`building` 슬롯 채택**.

> 🔴 **STEP 6 추가 판정** — 슬롯뿐 아니라 **입력 필드도 같은 관행을 따라야 한다**. 초판 UI 설계는 `landStdPriceAtTransfer` 등 4필드를 **0으로 두고** `rightValuation`만 쓰려 했는데, 그러면 `sangjeungbeopValuation`(양도가액 안분 분모)·`wholePropertySupplementary`(12억 분모)가 **동시에 0**이 되어 `transferDenominator === 0` 가드(`burdened-gift-apportionment.ts:168-171`)가 발동, **양도가액 0 → 세액 0**이 된다(침묵 오류).
> ⇒ **입주권 평가액 총액을 `buildingStdPriceAtTransfer`에 싣는다**(엔진 설계 D-1). `rightValuation`은 **명세·검증·표시 전용**이다.
> 🔑 엔진에는 평가가 **둘**이다 — `sangjeungbeopValuation`(양도세 축) / `giftValuation`(증여세 축). 「C 산정」 한 줄로 뭉개면 전자를 놓친다.
결과 표시는 `assetKind`를 직접 읽어 라벨 분기한다(`feedback_ui_mode_flag_not_domain_semantics`).

> ⚠️ **소비처 전수는 미완**이다 — `wholePropertySupplementary`(:115-118)·STEP 5 개산공제(:293-298) 등을 **P0 3**에서 실측한 뒤 확정한다(§6).
> ❌ **재제안 금지**: `building` 슬롯에 청산금을 넣는 안. 청산금은 §166 산식의 항이지 §159 안분 대상 자산이 아니다.

### P-3 · §159와 §166은 **직렬**이며 §159가 먼저다
§159는 「양도로 보는 부분」의 양도가액·취득가액을 정하고, §166은 그 양도가액으로 양도차익을 시기별 분할한다. 현행 STEP 순서(0.48 → 0.65)가 이미 그 방향이다(§1.3).
⇒ 새로 만들 것은 순서가 아니라 **`calculateRedevelopmentTax`가 breakdown을 받아 결과에 싣는 배선**이다.

### ~~P-4~~ · 개산공제 1% 축 — **구현 불요(도달 경로 없음)**
근거 §2.3. 법문상 조합원입주권은 §163⑥4호 **1%**가 맞으나, 그 율이 쓰일 유일한 경로(R-4 일반 경로 환산)가 **도달 불가**다(`transfer-tax-api.ts:175-176`). 게다가 입주권을 **K-4 전용**으로 좁혔으므로(엔진 설계 D-2) **개산공제 자체가 미적용**(실비 대체)이다.
⇒ **상수 신설·율 분기 모두 불요.** 법령 분석은 §2.3에 기록으로 보존.
❌ **§166 경로의 3%를 1%로 바꾸지 말 것** — 그 개산공제의 대상은 입주권이 아니라 **종전 부동산**이다.
⚠️ §163⑥4호에는 **미등기 단서가 없다**(1호·2호에만 있다) — 입주권에 0.3%를 적용하지 말 것.

### P-5 · 엔진 4-way 분기가 P-1을 구조적으로 막는다 → **재구성 필요** (신설)
```ts
// burdened-gift-apportionment.ts:205-250
if (info.valuationMode === "sangjeungbeop_standard") { ... }   // K-1~K-3 (기준시가 강제)
else if (info.acquisitionMethod === "actual")    { ... }       // K-4
else if (info.acquisitionMethod === "converted") { ... }       // K-5
else { ... }                                                   // legacy
```
`acquisitionMethod`는 **첫 분기를 빠져나온 뒤에만** 읽힌다 ⇒ **`standard` + `actual/converted` 조합은 도달 불가**.
UI도 같다 — 취득가액 산정방식 라디오(`BurdenedGiftBlock.tsx:291-313`)와 K-4 입력(:344-351)이 **전부 `{isMarketMode && …}` 안에 중첩**(:279~:378).
⇒ P-1을 실행하려면 **최상위 조건을 `valuationMode` → 「괄호 발동 판정」으로 교체**해야 한다.

> ✅ **STEP 6에서 범위가 줄었다** — 입주권을 **K-4 전용**으로 좁히면(엔진 설계 D-2) 산정방식 라디오·취득시 기준시가·§97②2호 swap 상호작용이 **한꺼번에 사라진다**. 남는 것은 위 조건 교체 **한 곳**과 UI에서 K-4 입력을 게이트 밖으로 꺼내는 것뿐이다.

---

## §4 케이스 매트릭스

`R` = 조합원입주권 · `A` = 재개발 APT. **케이스 ID와 Phase 이름은 분리한다**(Phase는 0/A/R/Z가 아니라 §6의 명명 참조).

| # | 자산 | subject | 청산금 | §166 | 평가(C) | 취득가액 | 개산공제 | 현행 표현 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| R-1 | R | right | 납부 | ①1호 | §61③ 보충 | 실지 | 3%(§166) | **불가**(P-5) | 기본 |
| R-1r | R | right | 수령 | ①2호 | §61③ 보충 | 실지 | 3%(§166) | **불가** | 가·나목 2조각 |
| ~~R-2~~ | R | right | 납부 | ①1호 | §61③ 보충 | ~~환산~~ | — | ⛔ **도달 불가** | `useEstimatedAcquisition:false` 강제로 §166③ 환산 미점화 |
| R-3 | R | right | 납부 | ①1호 | 시가(§60②) | 실지·환산 | 3%(§166) | 가능(K-4/K-5) | 기존 축 재사용 |
| ~~R-4~~ | R | right | — | ~~비활성~~ | — | — | — | ⛔ **도달 불가** | `isRedevelopment`가 `assetKind`만 판정(`transfer-tax-api.ts:175-176`) ⇒ 입주권은 항상 §166 |
| R-5 | R | right | — | ① | — | — | — | — | **§89①4호 비과세** ⇒ 채무액분도 비과세(4팀-39) |
| R-6 | R | right | 납부 | 승계 | §61③ 보충 | 실지 | 3%(§166) | 불가 | **승계조합원**(`isSuccessorMember`) — 인가전/후 안분 우회, 기산일 `completionDate` |
| A-2 | A | apt | 납부 | ②1호 | §61①4호 | 기준시가 | 3% | 가능 | 기본 |
| A-3 | A | apt | 수령 | ②2호→①2호 | §61①4호 | 기준시가 | 3% | 가능 | |
| A-4 | A | apt | 납부 | ②1호 | 시가 | 실지·환산(K-4/K-5) | 3% | 가능 | A괄호 **미발동** |
| A-5 | A | apt | 납부 | ②1호 | §61①4호 | 기준시가 | 3% | **분모 배선 없음** | 1세대1주택 + 12억 초과 (§5 D-2) |
| X-1 | A | **right** | — | 비활성 | — | — | — | — | §1.4 — 부담부증여 조합만 UI 차단 |

> 「현행 표현」 열이 **불가**인 행이 P-5 재구성의 대상이다 — 초판은 이 행들을 이미 존재하는 조합처럼 나열했다.

---

## §5 구조적 난점 → 대응 Phase

| ID | 난점 | 근거 | 대응 |
|---|---|---|---|
| D-1 | **평가 축 ↔ 취득 축 분리** — 엔진 4-way·UI `isMarketMode` 중첩이 P-1을 막는다 | P-5 | **PR 본체**(3·4) |
| D-2 | **12억 안분 분모가 재개발 경로에 없다** — `burdenedGiftDenominator`는 `transfer-tax-exemption.ts` **7곳에서만** 소비되고 재개발 경로 **0건**. `transfer-tax-redevelopment.ts:84·542·564`가 `input.transferPrice`로 독립 판정하는데, BG override 후 그 값은 **채무액**이라 문턱이 잘못 걸린다 | 실측 | **PA 4** (신규 배선 3곳) |
| D-3 | **§159 × §166 결합의 음수** — §166 산식의 「평가액·청산금」은 물건 전체값인데 양도가액만 채무비율로 줄어 인가후양도차익이 음수가 된다 | ✅ **실측 §11** | **β 채택** — PA·PR 공통 |
| D-8 | 🔴 **음수 처리 비대칭** — 두 pay 분기 모두 자체 clamp 없음. APT는 `splitAptPay:82` early-return이 삼키고, `computeRightPay:432`는 음수를 그대로 싣는다 | ✅ 실측 §11 ④ | PR — 원인 규명 우선, clamp는 최후 수단(조문 근거 없음) |
| D-4 | **결과 명세 유실** — `calculateRedevelopmentTax`가 breakdown을 안 받는다 | §1.3 | **PA 3** |
| D-5 | **자동 활성 경로 4개** — 게이트를 여는 순간 켜진다 | §1.2 | **PA·PR 각각** |
| D-6 | **3중 패턴** — 신규 3필드의 필수/0허용 정책이 UI·API·validate에서 갈리면 침묵 차단. `rightsValue` 프리필은 store write | §2.2 | **PR 6** |
| ~~D-7~~ | 개산공제 1% 축 — **적용 지점(R-4)이 도달 불가** ⇒ 구현 불요 | P-4 | ⛔ 삭제 |

---

## §6 Phase 계획

> Phase 이름은 케이스 ID와 충돌하지 않게 **`P0 / PA / PR / PZ`**로 쓴다.
> 원칙: **Pre-Do anchor 우선**(`feedback_pre_anchor_verification`). 「현행 일치 예상」으로 시작하지 않는다.

### P0 · 실측 probe — ✅ **완료 (2026-08-12). 결과·판정은 §11** (프로덕션 코드 변경 0 · probe 미커밋)

엔진 게이트를 **임시로** 통과시킨 throwaway probe로 실측한다.

1. **§166② × §159** (A-2 기준) — 인가후양도차익 음수 여부 · breakdown 유실 여부(D-4)
2. **§166① × §159** (R-1 기준) — 입주권은 산식이 달라 **독립적으로** 같은 위험을 갖는다
3. **`perAsset` 2슬롯 소비처 전수** — 최소 `splitRealExpenseByNature`(:277-291)·`wholePropertySupplementary`(:115-118)·STEP 5 개산공제(:293-298)

**결정 규칙** (초판의 「음수면 재설계」를 구체화):
- **α안** = §159가 양도가액만 안분(현행 순서 유지, §166 평가액·청산금은 물건 전체)
- **β안** = §166 산식 전 항(평가액·청산금·필요경비)에 채무비율 적용
- 판정: ① 인가후양도차익 < 0 이면 **α 기각** ② β에서 항등식 성립 확인

> ✅ **결과: α 기각 · β 확정.** 음수는 인가후뿐 아니라 **인가전에서도** 났다(취득가액만 안분되고 평가액은 물건 전체값이라 스케일 불일치). 항등식은 `Σ = 양도가액 − 취득가액 − 납부청산금×r − 필요경비`로 정정됐다(납부청산금 항이 있다). 상세 §11.

### PA · 재개발 APT (`redevelopment_apt`, subject=`apt`)
두 Phase의 **공통 인프라를 먼저 깐다**(쉬워서가 아니다).

1. 게이트 3층에 `redevelopment_apt` 추가 + **에러 메시지 2곳** 동기화(§1.1)
2. **게이트 parity 테스트** 1건 — 세 배열 내용 동일 단언(타입이 달라 상수 통합은 불가·§1.1). ❌ 단일 상수 추출은 **하지 않는다**(안 깨진 것 리팩터 금지)
3. `calculateRedevelopmentTax`에 breakdown 전달 → 결과 부착 (D-4). **optional 파라미터로** — 기존 호출부 무변경(롤백 비용 최소)
4. **12억 분모 배선 3곳** (`transfer-tax-redevelopment.ts:84·542·564`) — D-2
5. `GIFT_STD_PRICE_FIELD`에 `redevelopment_apt` 라벨(§61①4호 — housing과 동일 축)
6. `BurdenedGiftDetailCard.tsx:44-50` `PROPERTY_TYPE_LABEL` 2종 추가 + `propertyType` union 확장(:39) — 없으면 헤더 라벨이 `undefined`로 **사라진다**
7. **X-1 UI 차단** — `RedevelopmentBlock.tsx:161-162`에 대칭 조건. **부담부증여일 때만** 적용(일반 양도 경로 무변경)
8. **런처 사양 확인필** — `bgGiftStdPriceLauncherSpec`(`burdened-gift-std-price-launcher.ts:99`)은 대상 2종에 `null` 반환. §61①4호·§61③ 모두 건물기준시가 계산기 비대상이므로 **현행 null이 정답**. 변경 없음(후속 세션 재조사 방지용 기재)
9. anchor A-A2·A-A3·A-A4·A-A5 + **기존 anchor 갱신**(아래 §8)
10. **종료 게이트**: 14지점 self-grep · `npx vitest run __tests__ -t burden`(47파일) · `npm run test:transfer` · 브라우저 실측

### PR · 조합원입주권 (`right_to_move_in`)

1. ~~개산공제 1% 축 신설~~ — **삭제**(도달 경로 없음 · §2.3). 입주권은 **K-4 전용**이라 개산공제 자체가 미적용(실비 대체)
2. **legal-codes 상수 신설** — 상증령 §51②·상증칙 §16③. ❌ 기존 `SUPERFICIES: "상증법 §61③·상증령 §51·상증규 §16"`(`legal-codes/inheritance-gift.ts:317`) **재사용 금지** — 그것은 **지상권**(§51①·§16①②) 전용이다(주석 :316). `burdened-gift.ts`의 §61 계열 상수군 옆에 배치
3. **엔진 4-way 분기 재구성** (P-5) — 평가 축(`valuationMode`)과 취득 축(`acquisitionMethod`)을 분리. 입주권은 `standard` + `actual/converted` 조합이 도달 가능해야 한다
4. **UI `isMarketMode` 게이트 재구성** (`BurdenedGiftBlock.tsx:279-378`) — 취득 축 노출 조건을 `isMarketMode`가 아니라 **「A괄호 발동 여부」**로
5. **`needsBgAcqStdPriceInput` 술어 확장** (`burdened-gift-acq-std-price.ts:38-44`) — 입주권 제외. **UI·validate 공용 술어이므로 한 곳 수정으로 양쪽이 함께 움직인다** — 그 사실을 anchor로 고정
6. **입주권 C 전용 필드 3종** 신설 — 조합원권리가액·납입 계약금중도금·프리미엄. `rightsValue`는 **store write 프리필**(D-6)
7. **입주권 취득시 벌 2종** 신설 — 환산(K-5) 분자·개산공제 base가 **취득시** 값이다(`burdened-gift-apportionment.ts:230-237`·:324). 근거 **소령 §165①**(취득일까지 납입금 + 취득일 프리미엄)
8. **API 조립 전용 분기 신설** — `transfer-tax-api-burdened-gift.ts`의 catch-all(:209-215) **위에**. `buildBurdenedGiftInfo`(:102, 호출부 `transfer-tax-api.ts:185`)
9. **④ 증여재산 평가 카드 숨김** (`BurdenedGiftBlock.tsx:502` 게이트에 입주권 추가) — 전용 3필드 섹션으로 대체. ❌ `GIFT_STD_PRICE_FIELD`에 입주권 엔트리 추가 **금지**(단일 필드 모델로 되돌아감 = dual-truth)
10. **양도시 기준시가 카드 처리** — `toPropertyKind`(`CompanionSaleModeBlock.tsx:119-125`) 매핑 분기 또는 카드 숨김 결정
11. **③-b 이월과세 블록 분기** (`BurdenedGiftBlock.tsx:443`) — `general_building || land` vs else 중 입주권이 어디로 갈지 결정. §97의2 × 부담부증여는 **완료된 살아있는 경로**라 게이트를 열면 즉시 도달 가능
12. **위젯 명세** — 신규 섹션은 `<ToneCard tone sectionNum>`, 금액은 `CurrencyInput`+`FieldCard`, 라벨은 정본 클래스, **placeholder 숫자 예시 금지**. testid는 `bg-right-*` 계열(기존 관행 `bg-gift-building-std`·`bg-acq-std-price`·`bg-codonor-*`)
13. anchor **R-A1·R-A3·R-A4·R-A5·R-A7·R-A8**(R-A2·R-A2b·R-A6은 도달 불가로 삭제) + E2E
14. **종료 게이트**: PA와 동일

### PZ · 마감
문서 환류(계획서 U-1 수치 반영) · 메모리 갱신. ⚠️ 14지점 self-grep·회귀·브라우저 실측은 **PZ가 아니라 PA·PR 각각의 종료 게이트**다(마지막에 몰면 PA 머지가 미검증으로 나간다).

---

## §7 14 동기화 지점

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-asset.ts` | 입주권 C 3필드 + **취득시 2필드**(§165①) |
| ② | initial | `makeDefaultAsset` | 0/미입력 |
| ③ | normalize | `migrateAsset` | stale sessionStorage 가드 |
| ④ | **API 조립** | **`lib/calc/transfer-tax-api-burdened-gift.ts:102` `buildBurdenedGiftInfo`** (호출부 `transfer-tax-api.ts:185`) | **입주권 전용 분기를 catch-all(:209-215) 위에 신설** |
| ⑤ | UI 위젯 | `BurdenedGiftBlock.tsx` · **`burdened-gift-acq-std-price.ts:38-44`** · `AssetSectionTransfer.tsx:152-191` · `CompanionSaleModeBlock.tsx:119-125` | PR **4·5·6·7·9·10·11·12** (6·7은 ①에 필드를 만들고 ⑤에 **입력 위젯**을 그린다 — 두 지점 모두 필요) |
| ⑥ | 사이드바 | `lib/stores/calc-wizard-store.ts` `computeTransferSummary` | 양도가액=채무액 기존 로직 재사용 가능 여부 — **확인 필요** |
| ⑦ | 결과 카드 | **`components/calc/results/transfer/BurdenedGiftDetailCard.tsx:39·44-50`** | `PROPERTY_TYPE_LABEL` 2종 + union 확장. 라벨은 `asset-labels.ts:10-19`와 단일 출처화 검토 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-bg.ts:27-33·181-185` | 목록 확장 + 3필드별 **필수/0허용 정책을 UI·API와 동일 적용** |
| ⑨⑩ | Zod enum | `lib/api/transfer-tax-schema.ts:70` | **변경 없음 — 실측 확인**(`right_to_move_in`·`redevelopment_apt` 이미 존재) |
| ⑪ | acquisitionDate fallback | route | **확인 필요** |
| ⑫ | Zod 객체 | `lib/api/transfer-tax-burdened-gift-schema.ts` | 신규 5필드 + **`valuationMode` enum 확장 여부 판단**(입주권 C는 현행 `supplementary` 산식으로 못 만든다) — **누락 시 침묵 strip** |
| ⑬ | body spread | `lib/calc/transfer-tax-api.ts:654` | 동상 |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts` | 엔진 input 매핑 |
| — | **엔진 분기 구조** | `burdened-gift-apportionment.ts:205-250` | **4-way 재구성**(P-5) — 14지점 밖이지만 누락 시 P-1이 조용히 미실행 |
| — | 법령 검증 manifest | `lib/legal-verification/manifest/` | **신규 등록 불요 — 확인필**: 상증령 §51(`additions-inheritance-decree.ts:365`, keywords에 "조합원권리가액" 포함된 상증칙 §16은 :394)·소령 §159(`additions-transfer-decree.ts:97`)·§166(:181) 모두 기등록 |

---

## §8 anchor·테스트

| ID | 케이스 | 검증 |
|---|---|---|
| **P0-1** | A-2 | §166② × §159 — 음수 여부·breakdown 유실 **실측**(수치를 U-1에 환류) |
| **P0-2** | R-1 | §166① × §159 — 동상 |
| **P0-3** | — | `perAsset` 소비처 전수 → P-2 확정 |
| R-A1 | R-1 | 취득가액이 **기준시가가 아니라 실지 × 채무비율**. **조건 명시**: `selectedMode === "supplementary"` |
| ~~R-A2·R-A2b~~ | — | ⛔ **삭제** — R-2·R-4 도달 불가(§4). 입주권은 K-4 전용이라 개산공제 미적용 |
| R-A3 | C 산식 | C = 권리가액 + 납입금 + 프리미엄. **`rightsValue`와 다른 값을 넣어** 혼용 시 실패하게 |
| R-A4 | R-5 | 비과세 입주권 부담부증여 → **채무액분 세액 0** (4팀-39) |
| R-A5 | R-3 | 시가 모드 — 기존 **K-4** 축 회귀(입주권은 K-4 전용) |
| ~~R-A6~~ | — | ⛔ **삭제** — R-4 도달 불가 |
| R-A7 | R-1r | 청산금 **수령** — §166①2호 가·나목 2조각 |
| R-A8 | R-6 | **승계조합원** — 인가전/후 안분 우회(`runSuccessorMember`)·기산일 `completionDate` |
| A-A2/A-A3 | A-2/A-3 | 청산금 납부·수령 §166② 정합 |
| A-A4 | A-4 | 시가 모드 → A괄호 미발동 |
| A-A5 | A-5 | 12억 분모 = C(해석 B) — **신규 배선 검증**(D-2) |
| **G-1** | 게이트 | 3목록 **parity** — 한 곳만 넓히면 실패 |
| **X-A1** | X-1 | `redevelopment_apt`+`right`+부담부증여에서 입력 UI **미렌더** + **양성 대조군**(`apt` 선택 시 렌더됨)을 **같은 spec에** |
| **기존 갱신** | — | `__tests__/components/burdened-gift-supported-asset-notice.anchor.test.tsx:19` — 기본값이 `right_to_move_in`이라 **지원 목록에 넣는 순간 깨진다**. `presale_right`로 교체(:58은 이미 그러함) |

> 🔑 **mutation probe 필수** — anchor를 심은 뒤 구현을 일부러 무력화해 빨개지는지 확인한다. 부정 단언(X-A1)은 **대조군을 spec 안에** 둔다(`project_transfer_gb_extension_burdened_gift_axis`의 「부정 단언은 대조군이 있어야 한다」 — 던지는 probe보다 낫다).

---

## §9 미결 — 확인 필요

| ID | 항목 | 상태 |
|---|---|---|
| ✅ **U-1** | β(§166 항 스케일)의 **법적 근거** — **조사 완료 · (a)안 채택**(2026-08-12) | **명문 없음 · 선례 부존재 확정**(2026-08-12). §159는 취득가액·양도가액 **두 항만** 정하고, §166④1호 「평가액」은 물건에 관한 사실이다 ⇒ **문언상은 α**. 선례: nts·조세심판원 4질의 0건 + nts 통합검색 547건 상위 전수 **전부 비과세·LTHD 축**. ⇒ β는 **목적론적 해석**이다.<br>⇒ **(a) β + 결과 화면 고지 채택.** 산식 정합성을 우선하되 엔진 `warnings`로 불확실성을 고지한다(문구·배선은 엔진 설계 §법령근거 4). ⚠️ 법적 불확실성 자체는 남아 있으므로 **신규 예규 등장 시 재검토** |
| **U-8** | R-5(입주권 §89①4호 비과세) 12억 분모 | `applyOneRightExemption` 주석(`transfer-tax-redevelopment.ts:514`)이 「국세청 해석례 근거 — **분모 = transferPrice 단일(해석 A)**」를 명시. 부담부증여에서 해석 B(C 분모)로 바꾸려면 **해석 A와의 충돌을 먼저 해소** |
| **U-2** | `redevelopment.rightsValue`가 §166④(관리처분 가격)와 상증칙 §16③(권리가액) **어느 값으로 입력되는지** | 타입 주석(`types/transfer-redevelopment.types.ts`)이 두 개념을 병기. U-2 결과가 PR 6의 프리필 설계를 정한다 |
| **U-3** | X-1의 현행 동작이 의도인지 | 부담부증여와 **독립된 기존 이슈**. 본 작업은 부담부증여 조합만 차단 |
| **U-5** | 입주권 **세율**(§104①)·LTHD와 §159 결합 | PR에서 실측 후 anchor 또는 명시적 범위 밖 선언 |
| **U-6** | 입주권에서 `selectedMode`가 **`mortgage`(§66)·`rental`(§61⑤)** 로 잡힐 때 A괄호 발동 여부 | P-1의 경계. 발동하면 「입주권의 기준시가」 = 소령 §165①(납입금+프리미엄) |
| **U-7** | ⑥ 사이드바 · ⑪ acquisitionDate fallback | 착수 시 grep |

> ✅ **해소됨**: 초판 U-4(⑨⑩ Zod enum) — `transfer-tax-schema.ts:70`에 대상 2종 **이미 존재**, 변경 불요.

---

## §10 범위 밖

- **분양권(`presale_right`)** — 사용자 판단(2026-08-12). §2.1~§2.3의 법령 판정은 분양권에도 동일 적용되므로(§61③·§163⑥4호) 후일 재개 시 이 문서를 승계할 수 있다.
- **소령 §159②** — 과세·비과세 자산 혼합 시 채무 안분. 현행 엔진 전반 미구현.
- **U-2·U-3** — 기존 결함 후보. 발견 사실만 기록하고 **수정하지 않는다**. 단 **X-1은 예외** — 부담부증여를 여는 순간 `redevelopment_apt`+`right`가 §166 없이 일반 경로로 빠져 조용히 틀린 답을 내므로, **이번 작업이 만든 위험**이다. 따라서 「부담부증여 조합에 한정한 차단」만 추가한다(§6 PA 7).
- **`PROPERTY_TYPE_LABEL` ↔ `ASSET_KIND_LABELS` 복제** — 본 작업으로 3종째 복제가 되나 부담부증여와 독립된 기존 이슈.
- 부담부증여 × 이월과세(§97의2) × 입주권 3중 결합의 **세액 산정** — 별건. 단 **입력 분기(③-b)는 이번에 정한다**(PR 11).

---

## §11 P0 probe 실측 (2026-08-12 · 완료)

probe는 커밋하지 않았다(프로덕션 코드 변경 0 — 게이트만 `vi.mock`으로 우회). 아래가 **환류된 근거**다.

**공통 픽스처**: 취득 2009-03-01 → 인가 2015-06-01 → 양도(증여) 2024-03-01 · 권리가액 219,218,500 + 납부청산금 92,781,500 = **312,000,000** · 증여재산 평가 C = 1,000,000,000 · 취득시 기준시가 500,000,000 · 채무 B를 바꿔 비율 조절.

| probe | 자산 | B/C | §159 양도가액 | preApproval | postApproval | settlement | total | breakdown |
|---|---|---|---|---|---|---|---|---|
| P0-1a | APT | 0.5 | 500,000,000 | **−30,781,500** | 132,093,198 | 55,906,802 | 157,218,500 | 🔴 **없음** |
| P0-1b | APT | 0.3 | 300,000,000 | +69,218,500 | **0** | **0** | 69,218,500 | 🔴 없음 |
| P0-2a | 입주권 | 0.5 | 500,000,000 | **−30,781,500** | 0 | 188,000,000 | 157,218,500 | 🔴 없음 |
| P0-2b | 입주권 | 0.3 | 300,000,000 | +69,218,500 | 0 | **−12,000,000** | 57,218,500 | 🔴 없음 |

### 판정

**① D-4 확정 — breakdown이 재개발 경로에서 유실된다.** 4건 모두 `transferBurdenedGiftBreakdown`이 결과에 없다(§1.3).

**② α 기각.** 음수가 두 방향으로 발생한다.
- **인가전 음수**(P0-1a·P0-2a): §159가 취득가액을 `500,000,000 × 0.5 = 250,000,000`으로 override하는데 §166은 그 값을 「기존건물과 그 부수토지의 취득가액」으로 그대로 쓴다 ⇒ `219,218,500 − 250,000,000 = −30,781,500`. **평가액은 물건 전체값인데 취득가액만 안분돼** 스케일이 어긋난 것이다.
- **인가후 음수**(P0-1b·P0-2b): 양도가액(=채무액)이 `평가액+청산금`보다 작으면 `300,000,000 − 312,000,000 = −12,000,000`.

**🔑 세액이 실제로 틀어지는 경로는 합계가 아니라 LTHD다.** 합계는 산술적으로 일관하다(`total = 양도가액 − 취득가액 − 납부청산금 − 필요경비`, P0-2b 57,218,500이 정확히 일치). 그러나 `splitLthdAmount`(`redevelopment.ts:530-531`)가 **`gainAmt <= 0`이면 LTHD를 0으로 반환**하므로, 음수가 된 분기는 장기보유공제를 못 받는다. P0-1a에서는 **보유 15년의 인가전 분이 음수라 LTHD 0**이 되고 보유가 짧은 인가후 분만 공제를 받는다 ⇒ **LTHD 과소 → 세액 과대**.

**③ β 확정** — §166 산식의 **평가액·청산금에도 채무비율을 적용**한다. 손계산 검증(취득시 기준시가 1억·C 4억·B 2억 → r=0.5):
- 인가전 = `219,218,500×0.5 − 50,000,000 = +59,609,250` (양수)
- 인가후 = `200,000,000 − (219,218,500+92,781,500)×0.5 = +44,000,000` (양수)
- 항등식: `Σ = 양도가액 − 취득가액 − 납부청산금×r − 필요경비` ✅

**④ 🔴 음수 처리 비대칭 (D-8)** — ⚠️ **초판의 clamp 서술은 틀렸다**(2026-08-12 STEP 6 정정). 실측: `computeAptPay`의 `postApprovalGain`(`redevelopment-split.ts:278`)에는 `Math.max`가 **없고**, `:375`의 clamp는 **`computeAptReceive`**(`:306~`) 소속이다. APT가 0/0으로 관측된 진짜 원인은 하류 **`splitAptPay:82`의 early-return**(`postApprovalGain <= 0` → `{0,0}`)이다.
⇒ 정확한 서술: **두 pay 분기 모두 자체 clamp가 없다.** APT는 하류가 음수를 삼키고, 입주권(`computeRightPay:432`)은 `settlement.gain`에 **그대로 싣는다**.
⚠️ 이 비대칭은 **부담부증여와 무관하게 이미 존재**한다 — 일반 양도에서는 「입주권을 권리가액+청산금보다 싸게 판다」가 비현실적이라 잠복해 있었다. **부담부증여는 양도가액을 채무액으로 강제하므로 그 상황이 일상화된다.**

**⑤ P0-3 — `perAsset` 2슬롯 소비처 전수 (6곳)**

`general-building-route-actual.ts`(GB 전용) · `BurdenedTransferTaxResultCard.tsx` · `BurdenedGiftDetailCard.tsx` · `DetailedStatementFormulaBuilders.ts` · `transfer-tax-burdened-gift-step.ts` · `transfer-tax-carryover.ts`(`building.acquisitionPrice`).
(상속세 측 동명 `perAsset`은 별개 타입 — 제외.)
⇒ 표시 계층 2곳은 `acquisitionPrice > 0` 조건부 렌더라 `land=0`이면 land 행이 자연히 사라지고, 엔진 2곳은 이미 `building`을 읽는다 ⇒ **P-2의 `building` 슬롯 채택이 소비처와 정합**. 확정.

### P0가 계획에 미친 변경

- §5 **D-3 → β 채택**(PA·PR 공통 선행) · **D-8 신설**
- §9 U-1 **재개**(법적 근거 미확인 — STEP 6 정정) · **U-8 신설**
- PA·PR 양쪽에 **β 배선**이 들어가므로 두 Phase의 공통 인프라가 하나 더 늘었다(§1.3 breakdown 배선과 함께)

---

## 부록 · 참조

- 선례 계획: `burdened-gift-carryover-159-97-2.plan.md` · `gift-burdened-transfer-tax.design.md` · `transfer-gb-inheritance-extension-3part.plan.md`
- 엔진: `burdened-gift-{apportionment,eligibility,valuation}.ts` · `transfer-tax-burdened-gift-step.ts` · `redevelopment.ts` · `transfer-tax-redevelopment.ts`
- 클라이언트: `transfer-tax-api-burdened-gift.ts` · `burdened-gift-acq-std-price.ts` · `BurdenedGiftBlock.tsx` · `BurdenedGiftDetailCard.tsx`
- 법령: 소령 §159 · §163⑥ · §163⑨ · §165① · §166 / 상증법 §61 / 상증령 §51② / 상증칙 §16③
- 해석: 서면인터넷방문상담4팀-2568(2005.12.21.) · 4팀-39(2005.01.05.) · 사전답변(2020.03.19.)
