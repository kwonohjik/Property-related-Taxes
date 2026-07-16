# 공익수용·공매 양도당시 기준시가 특례 — §164⑨ 전면 정합 (rev.11)

> **상태**: Plan — 조사 4건 + 사용자 결정 Q1~Q6 + **STEP 1 자가검토 4-way**(57건) + **STEP 3 blast-radius**(7건) 완료.
> **P1·P2·P9 = Do 완료·머지**(PR #619 `f60f47db` · E2E #620 `2b3b3d84`).
> **다음**: **Q7 결정 → P0-b anchor → P3**. (P3는 신규 엔진 필드 0 = **중 규모** → 설계 문서 STEP 5·12 **불요**)
> **P3 차단**: Q7(§10-3). **P7 차단**: U3 — 단 BR-4로 **재평가 필요**(재개발은 수용 미도달).
> **출발점**: `land-building-split-mode-gating-and-salescase-drift.plan.md` §7 **S2**(전제 오류로 범위 재정의 — §1-2).
> **규모**: 대 (엔진 input/result 변경 → 14 동기화 지점 + 엔진·UI 설계 문서 필수)
> **승인 범위**(사용자): 가~라목 전부 + 법령 상수화 + §164⑨2호 공매·경락 + multi-parcel 배선. 부칙 검증 **완료**(§9).

---

## 0. 요약

| 순위 | 결함 | 세액 영향 | 근거 |
|---|---|---|---|
| ~~1~~ | ~~다필지 토지 수용 + 필지별 환산 → 특례 소실 (D7)~~ | ~~86,784,934원 과다~~ | ✅ **해소 — PR #619 머지**(`f60f47db`) + E2E PR #620(`2b3b3d84`) |
| 2 | UI/validate 게이트가 법령보다 좁음 — 건물·오피스텔/상가·주택 배제 (D1·D2) | 과다 **(방향 추정 — 미실증)** | §2-2 법령 |
| 3 | §164⑨2호 공매·경락 전부 미구현 (D5) | 과다 **(미실증)** | §2-1 법령 |
| 4 | PHD·겸용·재개발·split 경로 특례 우회 (D6·D8·D12·**D15**) | 과다 **(D6만 engine-level 실증)** | §3-0 |
| 5 | 1996~2009 구 문언 미구현 (D10 — 행위시법) | 미실측 | §9 · **X3 별건** |

> ⚠️ **실증된 것은 D7(86,784,934원, API 형태)과 D6(266,666,666원, engine-level)뿐이다.**
> 나머지는 **법령 대조로 방향만 추정**한 것이며 probe 미실측이다 — Do 진입 전 anchor로 확정한다.
> (`feedback_numeric_impact_verify_before_bug_claim` — 과대주장 금지)

---

## 1. 배경

### 1-1. 출발점 — S2 "split 경로 공익수용 특례 소실"

engine-level probe (`propertyType: "housing"`, 양도 10억, 취득시 기준시가 2억, 양도시 5억,
min[2,500,000·1,500,000·2,000,000]/㎡ × 200㎡ = 3억):

| 경로 | 환산취득가 | 양도차익 |
|---|---|---|
| 비-split | 666,666,666 | 327,333,334 |
| split | 400,000,000 | **594,000,000** |

### 1-2. ⚠️ S2 전제의 오류 — 조사로 정정

- `calcSplitGain`은 `propertyType`이 **housing/building일 때만** 활성(`transfer-tax-split-gain.ts:136`).
- 특례 UI는 **`assetKind === "land"`일 때만** 노출(`ExpropriationBlock.tsx:38-42`).
- ⇒ **두 경로의 자산 종류가 겹치지 않는다.** 위 probe는 UI/API 게이트를 우회한 engine-level 측정이다.

⇒ **현행 게이트 하에서 split 미적용은 정상.** S2는 D6으로 강등되며, **게이트 확대(P3) 후에야 유효**하다.

> **⚠️ 이 오류 패턴을 반복하지 말 것**: 세션 중 D7에서도 같은 실수를 했다(engine-level probe로 API 게이트
> 우회). D7은 **API 형태로 재측정해 금액이 유지**됐으나(§3-1), 다른 결함도 **UI/API 경유 도달성을
> 별도 검증**해야 한다. 이것이 §0의 "미실증" 표기 이유다.

---

## 2. 법령 근거 (KoreanLaw MCP 원문 검증 완료)

### 2-1. 진짜 근거는 집행기준이 아니라 **시행령 §164⑨**

현행 코드는 이 특례를 전부 **"집행기준 99-164-12"**로 인용한다(주석 7곳, 상수 0곳 — D4).
집행기준은 국세청 내부 행정규칙이고, 법령 근거는 **소득세법 시행령 제164조 제9항**이다.

> **[소득세법 시행령 §164⑨ 원문 — MST 286211, 시행 2026.7.1.]**
> ⑨ 다음 각 호의 어느 하나에 해당하는 가액이 **법 제99조제1항제1호가목부터 라목까지**의 규정에 따른
> 가액보다 낮은 경우에는 **그 차액을 같은 호 가목부터 라목까지의 규정에 따른 가액에서 차감**하여
> 양도 당시 기준시가를 계산한다.
> 1. 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」에 따른 협의매수ㆍ수용 및 그 밖의 법률에 따라
>    수용되는 경우의 **그 보상액과 보상액 산정의 기초가 되는 기준시가 중 적은 금액**
> 2. 「국세징수법」에 의한 공매와 「민사집행법」에 의한 강제경매 또는 저당권실행을 위하여 경매되는
>    경우의 **그 공매 또는 경락가액**

### 2-2. 적용 대상 = 가목~라목 **전부** (토지 전용 아님 — 확정)

> **[소득세법 §99①1호 원문 — MST 280405]** 가. 토지 / 나. 건물 / 다. 오피스텔 및 상업용 건물 / 라. 주택

하위 행정규칙(집행기준)이 시행령의 범위를 축소할 수 없다.

> ⚠️ **현행(2009.2.4.~) 문언 기준이다.** 과거 양도분은 대상이 다르다(1996판 가목만 / 2005판 가~다목).
> 본 계획 P2~P8은 **2009.2.4. 이후 양도 전제**이며, 그 이전은 **§11-X3(별건 확정)**.

### 2-3. min[] 동치 — **1호 전용** 유도

> ⚠️ **이 유도는 1호(수용)에만 성립한다.** 2호는 후보 구조가 다르다(§4-3).

```
A = 법 §99①1호 각목 가액(통상 기준시가)
m = min(보상액, 보상액 산정 기초 기준시가)        ← 1호 "중 적은 금액"
m < A 이면: 양도당시 기준시가 = A − (A − m) = m
m ≥ A 이면: 차감 없음 → A 유지
∴ 1호 = min(A, 보상액, 보상기초)   ← 3후보
```

**2호 유도**: 후보가 *"그 공매 또는 경락가액"* **하나**뿐("중 적은 금액" 문언 없음).
```
∴ 2호 = min(A, 공매·경락가액)      ← 2후보
```

⇒ 현행 엔진 `Math.min(perSqm, comp, basis)`(`:61`)는 **1호 3후보 전용**이다. 2호는 신규 경로.

### 2-4. 산정 체계 차이는 적용의 장애가 아님

§164⑨은 각목의 **산정 방법**을 건드리지 않고, 산정된 **결과 가액**에 사후 차감한다.

### 2-5. 판례 (참고 — 결정적 아님)

**서울고법 2007누14451** · **서울행법 2006구단11487** — 임야(토지) 사안 + §164⑨ 신설 이전
("규정은 **없지만** … 차감하는 것이 타당"). **건물 적용 여부 판단 없음.**
**수원지법 2025구단10567**(2025.10.22.) — §164⑨ 직접 인용(적용 시점 판단은 없음).

---

## 3. 현행 구현의 결함 (전부 코드 실측)

| # | 결함 | 위치 | 세액 영향 | 도달성 |
|---|---|---|---|---|
| **D7** | **다필지 특례 소실** — **이중 차단막**(§3-1) | `transfer-tax-api.ts:256` · `transfer-tax.ts:323` · `multi-parcel-transfer.ts:298-305` | **86,784,934원 과다 (실증)** | **입력 도달 O** |
| **D1** | UI 게이트가 법령보다 좁음 — `assetKind === "land"` | `ExpropriationBlock.tsx:38-42` · **`:11-12` docblock** | 과다(추정) | 선형 |
| **D2** | validate 게이트가 법령보다 좁음 | `transfer-tax-validate-asset.ts:693-703` | 과다(추정) | 선형 |
| **D5** | §164⑨2호(공매·경락) 전부 미구현 | `transfer-tax-expropriation-valuation.ts:51` | 과다(추정) | 기능 부재 |
| **D6** | split 경로 특례 미적용 | `transfer-tax-split-gain.ts` (import 0건) | engine-level 266,666,666원 실증 | 게이트 확대 후 |
| **D15** | **PHD(§164⑤·⑦) 경로 특례 미적용** — `calcSplitGainPreDisclosure`가 **split보다 먼저** 분기 | `transfer-tax-split-gain.ts:139-141` · `transfer-tax-pre-housing-disclosure.ts`(자체 산식) | 과다(추정) | 선형 |
| **D8** | 겸용(mixed-use) 경로 특례 미적용 | `transfer-tax-mixed-use-helpers.ts:268,519` | 과다(추정) | 선형 |
| **D12** | 재개발 경로 특례 미적용 — STEP 2 skip | `transfer-tax-redevelopment.ts:8` | 과다(추정) | 선형 |
| **D16** | 상업용건물·일반건물 전용 환산 경로가 특례 우회 | **상가**: ✅ **해소(D16-CB)** — 세액 **86,784,934원 과다 실증**. · **일반건물**: ✅ **해소(D16-GB)** — 토지 환산 분모만 §164⑨(안분·건물 무변경). **+82,745,181원 실증** | 모두 해소 | 완료 |
| **D3** | 엔진·API에 자산종류 게이트 없음 (게이트가 UI·validate 2층에만) | `expropriation-valuation.ts:49-57` · `api-helpers.ts:639-647` | (D1 하 미도달) | stale |
| **D11** | **`transferArea` 쓰기가 토지 전용** — `building`·`commercial_building`·`general_building` **4종 전부** store 미저장 | `AssetSectionBasic.tsx:298` · `StandardPriceInput.tsx:105-106` | 게이트만 열면 **특례가 조용히 죽음** | — |
| **D13** | 보상총액이 특례 함수에 미도달 — `reductions[]`의 `cash+bond`가 flat 5필드 전달에서 누락 | `transfer-tax-helpers.ts:311-319` | (총액 트랙 전제) | — |
| **D10** | **구 문언(1996~2009) 미구현** + 게이트 근거 허위. **게이트 유지 = 미지원 갭(정합 아님)** | `expropriation-valuation.ts:2-4,37-38` | 미실측 | 양도일 < 2009.2.4 |
| **D4** | 법령 인용 오류 + 상수 부재 | 주석 7곳 | 없음 | — |
| **D9** | 결과 카드가 토지 전용 문구·단위 하드코딩 + **동률 시 복수 행 강조** | `ExpropriationValuationCard.tsx:5,21,24,29,37,46-47` | 없음(표시) | — |
| **D14** | 주석·구현 드리프트 — `transferCause` "land 전용" 주석 vs `:59 isSupported` 5종 노출. **+ `TransferTaxResultView.tsx:382` 주석 밀림** | `calc-wizard-asset.ts:201` · `TransferModeBlock.tsx:48-59` | 없음 | — |

### 3-0. ⚠️ 구조적 핵심 — 게이트 확대 ≠ 특례 적용

`applyExpropriationValuation` **호출부는 `transfer-tax-helpers.ts:311` 단 1곳**.

| 경로 | 환산 계산 지점 | 특례 | 비고 |
|---|---|---|---|
| 단건 비-split | `helpers.ts:321` | ✅ **적용** | 유일 |
| **pre-1990 토지** | `transfer-tax.ts:93-99`이 `useEstimatedAcquisition: true` 주입 후 `calcTransferGain` 경유 | ✅ **적용** | **우회 아님**(실측 확인) |
| **다필지** | `multi-parcel-transfer.ts:305` (자체 산식) | ❌ | `transfer-tax.ts:323` 조기 반환 **+ API `:256`** |
| **PHD 단독/4부분** | `pre-housing-disclosure.ts` 자체 산식(`P_A_est = floor(P_F × Sum_A / Sum_F)`) | ❌ | `split-gain.ts:139-141`이 **split보다 먼저** 분기 |
| split | `split-gain.ts:91-96` | ❌ | `helpers.ts:275` early-return |
| 겸용 주택분 | `mixed-use-helpers.ts:268` | ❌ | 직접 호출 |
| 겸용 상가분 | 동 `:519` | ❌ | 직접 호출 |
| 재개발 | `redevelopment.ts` (STEP 2 skip) | ❌ | — |
| **상업용건물** | `commercial-building-valuation.ts` (§164⑧·§176의2②2호 전용) | ❌ | `transfer-tax.ts:305` STEP 0.35가 **`useEstimatedAcquisition: false`로 교체** → 게이트 미진입 (**D16** — rev.10 추가) |
| **일반건물** | `general-building-valuation.ts` | ✅ **토지분만 적용(D16-GB)** | `calculateConvertedAcquisition`이 토지 환산 분모만 min[] override. 안분·건물 무변경 |

> **⚠️ rev.10 정정 — 이 표는 rev.2~9에서 전수가 아니었다.** P3 Do 중 코드리뷰 probe가 **상가·일반건물
> 2경로**를 추가 검출했다(총 **8경로 우회**). rev.8까지 "6경로"라 단정한 것은 과소 집계였다.
> ⇒ **P3의 게이트 확대 실효는 `building`(나목) 1종뿐**이다 — 상가·일반건물은 게이트를 열어도
> 세액이 그대로라 UI 노출을 **의도적으로 보류**했다(§4-1c 트랙 목록).

⇒ **게이트 확대만으로는 6개 경로가 여전히 미적용**. 게이트 확대와 경로 배선은 **별개 작업**이다.
⇒ **D15 주의**: PHD가 split보다 먼저 분기하므로, P6가 split을 배선해도 **PHD 조합은 여전히 우회**한다.

### 3-1. D7 상세 — 다필지 (최우선 · 유일한 실증)

**⚠️ 이중 차단막** (rev.6 정정 — 조기 반환 하나가 아니다):

| # | 차단 지점 | 코드 |
|---|---|---|
| 1 | **API가 자산-수준 환산 플래그를 무력화** | `transfer-tax-api.ts:256` `useEstimatedAcquisition: hasPre1990 \|\| parcelModeActive \|\| isMixed \|\| isSalesCase ? false : …` |
| 2 | 엔진 특례 게이트가 그 플래그를 요구 | `expropriation-valuation.ts:50` `!p.useEstimatedAcquisition → null` |
| 3 | 다필지 분기가 특례 지점보다 앞서 반환 | `transfer-tax.ts:323` `if (mpBranchResult) return mpBranchResult;` (특례는 `:325` `calcTransferGain` 내부) |

⇒ 다필지 환산은 자산-수준이 아니라 **필지별 `acquisitionMethod: "estimated"`**로 수행된다
   (`ParcelInput.acquisitionMethod`) → 특례도 **필지별**로 적용해야 한다.

> **✅ Do 환류 (2026-07-16 — P2 구현 결과, 설계 정정)**
> rev.6은 *"수정은 세 지점 모두 다뤄야 한다"*고 했으나, **실제 구현은 세 지점 중 어느 것도 바꾸지
> 않았다.** 다필지 특례를 **`multi-parcel-transfer.ts` 내부에 직접 배선**하면 세 차단막을 **우회할
> 필요 자체가 사라지기** 때문이다:
> - (3) 조기 반환 — 특례를 `mpBranch` **안에서** 적용하므로 조기 반환은 무해. **변경 불요**.
> - (1)(2) API `:256` + 엔진 게이트 — 자산-수준 플래그를 쓰지 않고 **필지별 `acquisitionMethod`**로
>   게이트하므로 무관. `applyExpropriationValuation` 호출 시 `useEstimatedAcquisition: true`를 넘긴다
>   (그 분기 자체가 `parcel.acquisitionMethod === "estimated"` 전용이므로 항상 참).
>
> ⇒ 훨씬 surgical하다(엔진 3파일 · API/UI/validate 배선만, 기존 분기 구조 **무변경**, 회귀 0).
> rev.6의 "세 지점 모두" 서술은 **"다필지를 `calcTransferGain`으로 통과시킨다"는 대안을 전제**한
> 것이었다 — 그 대안은 채택하지 않았다.

**도달성**: UI는 **폼 값** `asset.useEstimatedAcquisition`으로 보상 필드를 노출하므로
(`ExpropriationBlock.tsx:38-42`), 사용자는 다필지 + 수용 + 보상값을 **정상 입력한다**.
그런데 API가 플래그를 false로 바꿔 보내 **그 입력이 아무 일도 하지 않는다**(침묵 무시).

**probe 재측정 (API 형태 — `useEstimatedAcquisition: false` + 필지별 estimated)**:

| | 양도차익 | 산출세액 | exprDetail |
|---|---|---|---|
| 현행(특례 미적용) | 594,000,000 | 167,892,000 | **null** |
| §164⑨ 적용 시 | 327,333,334 | 81,107,066 | — |
| **과다분** | | **86,784,934** | |

> 토지 200㎡, 양도 10억, 공시지가 2,500,000/㎡, 보상 1,500,000/㎡, 보상기초 2,000,000/㎡, 취득 기준시가 2억.
> **같은 다필지 경로 내에서** `parcel.standardPricePerSqmAtTransfer`만 min[]으로 낮춰 비교(순수 특례 효과).

**보상 필드는 필지별이어야 한다**: `multi-parcel-transfer.ts:302`가 `parcel.standardPricePerSqmAtTransfer`로
**필지마다 다른 공시지가**를 쓰고, min[]은 그 공시지가와 대비해 **필지별로** 판정된다.
→ `ParcelInput`에 `compensationPerSqm?`·`compensationBasisStdPrice?` 추가,
   override는 `:302`에서 `min(sqmAtTransfer, compPerSqm, basisPerSqm) × parcel.transferArea`.

> **rev.6 정정**: rev.2~5의 *"`parcelMode`는 토글 자신 외 어디서도 참조되지 않는다"*는 **사실 오류**였다.
> 실제 참조 **13곳**이며 `transfer-tax-api.ts` 8곳(`:95-97,212,224,232,242,249,256,460`)이 취득 필드를
> 대거 재작성한다. UI 노출은 막지 않으나 **API가 값을 갈아끼운다** — 이것이 차단막 (1)의 실체다.

### 3-2. D1 상세 — 게이트 주석의 자기모순 (2곳)

```tsx
// ExpropriationBlock.tsx:36-37
// (건물은 원/㎡·면적 개념 미적용 → 토지로 한정. UI 노출 조건 = validate와 동일)
// ExpropriationBlock.tsx:11-12 (docblock — rev.6 추가)
// #3 환산 min[] 특례는 공시지가(원/㎡)·면적 기반이라 토지 전용
```

**자기모순**: 같은 UI가 건물에 `isAreaMode = true`를 준다(`StandardPriceInput.tsx:98-100`).
건물 기준시가는 국세청장 고시 **㎡당 × 면적**이라 원/㎡ 개념이 **있다**.
원/㎡ 개념이 없는 것은 **주택(라목)** — 개별주택가격은 총액이다.

### 3-3. D3 상세 — 게이트 층 불일치 (**결정 필요 — Q4**)

| 층 | 자산종류 게이트 |
|---|---|
| UI (`ExpropriationBlock.tsx:38`) | `assetKind === "land"` |
| validate (`transfer-tax-validate-asset.ts:693`) | `assetKind === "land"` |
| API (`buildExpropriationInput`) | **없음** |
| 엔진 (`applyExpropriationValuation:49-57`) | **없음** |

✅ **Q4 확정 — 3층(UI·validate·엔진) 모두 명시.** 단, 세 층이 조건을 **재구현하면 드리프트**가 나므로
**`lib/tax-engine/expropriation-scope.ts`(신규)의 `isExprValuationEligible(propertyType)` 단일 함수**를
세 층이 공유한다. API(`buildExpropriationInput`)는 **원값 전달 유지**(변환 계층 — 게이트 아님).
상세 §10-2. 이로써 `api-helpers.ts:635-636` docblock("엔진이 게이트 판정")이 **비로소 사실이 된다**.

**stale 경로 2건**: `AssetSectionBasic.tsx:139`(assetKind만 패치) ·
`TransferModeBlock.selectMode:60-94`(min[] 3필드 미정리 → 수용→일반→수용 왕복 시 잔존).

---

## 4. 설계

### 4-1. 트랙 — **2축 매트릭스** (rev.6: 1축 표 → 2축)

§164⑨은 **가액(총액)** 차감이고 현행 엔진은 `원/㎡ × 면적`이다. 트랙은 **자산종류 × 호(號)** 2축으로 결정된다:

| 목 | 자산 | 기준시가 산정 | **1호(수용)** | **2호(공매·경락)** |
|---|---|---|---|---|
| 가 | 토지 | 개별공시지가 × 면적 | **원/㎡ 3후보** | **총액 2후보** |
| 나 | 건물 | 국세청 고시 ㎡당 × 면적 | **원/㎡ 3후보** (D11 배선 필요) | **총액 2후보** |
| 다 | 오피스텔·상업용 | 국세청 고시 ㎡당 × 면적 | **원/㎡ 3후보** (D11) | **총액 2후보** |
| 라 | **주택** | 개별주택가격 = **총액** | **총액 3후보** | **총액 2후보** |

> **2호는 자산종류 무관 항상 총액**이다 — 공매·경락가액은 낙찰 **총액**이고 원/㎡ 분해가 없다.
> ⇒ rev.5의 "2호는 총액 트랙에 자연 편입"은 맞으나, §4-2 표가 1축이라 **토지 공매가 미정의**였다(정정).

### 4-1b. ⚠️ `propertyType` ↔ 가~라목 매핑 (rev.7 신규 — Q4 3층 게이트의 전제)

엔진 `TransferTaxInput.propertyType`은 **10종**이다(`transfer.types.ts:67`). 폼 `assetKind`는 8종
(`calc-wizard-asset.ts:62`). Q4(3층 명시)를 구현하려면 이 축을 **가~라목에 명시적으로 매핑**해야 한다:

| propertyType | assetKind | 목 | §164⑨ 대상 | 트랙(1호) | Phase |
|---|---|---|---|---|---|
| `land` | `land` | **가** | ✅ | 원/㎡ | 완료(P2 다필지·단건) |
| `building` | `building` | **나** | ✅ | 원/㎡ | **P3** |
| `general_building` | `general_building` | **나** | ✅ | 원/㎡ | **P3** |
| `commercial_building` | `commercial_building` | **다** | ✅ | 원/㎡ | **P3** |
| `housing` | `housing` | **라** | ✅ | **총액** | P5 |
| `mixed-use-house` (겸용) | — (`isMixed` 파생) | **나+라** | ✅ | 주택분·상가분 분리 | P7(D8) |
| `redevelopment_apt` | `redevelopment_apt` | 라? | ⚠️ U3 | — | P7(D12) |
| `right_to_move_in` | `right_to_move_in` | — | ❌ 2호(권리) | — | — |
| `presale_right` | `presale_right` | — | ❌ 2호(권리) | — | — |
| `general_building_unit` | **없음** | 나 | (자산-수준 미도달) | — | — |

> **⚠️ 축이 3층에서 서로 다르다 (rev.8 — blast-radius BR-1·Critical)**
> - **UI·validate 층 = `assetKind`**(8값) / **엔진 층 = `propertyType`**(10값). **같은 enum이 아니다.**
> - 매핑은 **`transfer-tax-api.ts:196-200`에만** 있고, `isMixed`→`mixed-use-house`,
>   `isRedevelopmentRightTransfer`→`right_to_move_in` 파생을 포함한다(순수 assetKind 함수가 아님).
> - **rev.7 §10-2의 "기존 `toPropertyKind` 계열 재사용"은 사실 오류다** — `toPropertyKind`
>   (`CompanionSaleModeBlock.tsx:109-115`)는 `"land" | "building_non_residential" |
>   "house_individual" | "house_apart"` **4값 `propertyKind`**를 반환한다. `StandardPriceInput`
>   전용이며 `propertyType`과 **무관**하다. ⇒ Q4 구현 방식 재설계 필요(§4-1c).
>
> **⚠️ `general_building_unit`은 자산-수준 값이 아니다** (BR-2): `general-building-valuation.ts:698`·
> `general-building-extension.ts:309,347`이 만드는 **엔진 내부 서브카드** propertyType이다.
> 폼에서 오지 않으므로 자산-수준 게이트가 볼 일이 없다.
>
> **✅ 입주권·분양권·재개발은 이미 배제돼 있다** (BR-3 — rev.7의 "명시적 제외" 요구는 **과잉**):
> 수용 3지선다는 `TransferModeBlock.tsx:49` `SUPPORTED_ASSET_KINDS =
> ["housing","land","building","general_building","commercial_building"]` 안에서만 뜬다
> (`:59` `isSupported`). 입주권·분양권·재개발은 **`transferCause`를 설정할 방법 자체가 없어**
> 특례에 도달하지 못한다. → **C-06c는 UI 변경 없이 현행이 이미 정답**(회귀 방어 anchor로만 유지).
>
> **✅ `SUPPORTED_ASSET_KINDS` 5종 = §164⑨ 가~라목과 정확히 일치**한다. 즉 **자산종류 게이트는
> 사실상 이미 존재**하나 **우연한 정합**이다(그 상수의 주석은 "부담부증여 지원 자산 종류" — 다른 목적).
> Q4의 3층 명시는 이 우연을 **의도로 전환**하는 작업이다.
>
> **⚠️ U3 재평가 필요** (BR-4): rev.7은 U3(`redevelopment_apt` 목 판정)가 **P7을 차단**한다고 했으나,
> `redevelopment_apt`는 `SUPPORTED_ASSET_KINDS`에 **없어** 수용 자체가 도달 불가다.
> ⇒ U3는 P7의 차단 요인이 **아닐 수 있다**. P7 착수 시 재판단.

### 4-1c. Q4 구현 재설계 (rev.8 — BR-1 대응)

3층이 축을 공유하지 않으므로 rev.7의 "단일 함수 `isExprValuationEligible(propertyType)`를 3층이 import"는
**그대로는 성립하지 않는다**. 후보:

| 안 | 내용 | 평가 |
|---|---|---|
| **A** | `isExprValuationEligible(propertyType)` 단일 + UI·validate가 **`assetKindToPropertyType()` 신규 공용 매핑**을 거쳐 호출 | 축 통일. 단 API 매핑(`:196-200`)이 `isMixed`·`isRedevelopmentRightTransfer` 파생을 포함해 **순수 함수로 추출 시 그 컨텍스트도 필요** |
| **B** | `isExprValuationEligible(assetKind)`(UI·validate) + `isExprValuationEligibleByPropertyType()`(엔진) **2함수, 1소스 목록** | 축별 진입점 2개지만 **대상 목록은 상수 1개** 공유 → dual-truth 없음. 파생 컨텍스트 불요 |
| **C** | 엔진 단일 게이트만(rev.7 Q4 ①안) | 사용자가 기각 |

> **B안 채택(Q7)** — A안은 `mixed-use-house`·`right_to_move_in` 파생이 UI 시점엔 확정되지 않아
> 순수 매핑이 불가능하다.

> ### ✅ Do 환류 (2026-07-16 — P3 구현 결과, 설계 정정 2건)
>
> **① 목록이 1개가 아니라 2개다 — "법령 적격" ≠ "구현 지원"** (E2E가 검출)
>
> rev.8은 `EXPR_VALUATION_ELIGIBLE` **단일 목록**을 전제했으나, 구현 중 **주택(라목)에서 모순**이 났다:
> 주택은 **법령상 적격**이지만 개별주택가격이 총액이라 원/㎡ 모델이 맞지 않는다(총액 트랙 = P5 미구현).
> 주택을 UI 노출 목록에 넣으면 `transferArea`가 없어(`isAreaMode === false`) 엔진 `area > 0`에 걸려
> **사용자가 보상액을 입력해도 아무 일도 일어나지 않는다** — **방금 P2에서 고친 D7의 침묵 무시와 같은 병**.
>
> ⇒ `expropriation-scope.ts`에 **목록 2개**를 둔다(둘 다 이 파일 단일 소스):
>
> | 목록 | 범위 | 소비 층 | 답하는 질문 |
> |---|---|---|---|
> | `ELIGIBLE_PROPERTY_TYPES` | **가~라목**(주택 포함) | **엔진** | "§164⑨ 대상인가" (법령) |
> | `PER_SQM_TRACK_ASSET_KINDS` | **가~다목**(주택 제외) | **UI·validate** | "지금 실제로 계산되는가" (구현) |
>
> 법령 범위를 구현 한계로 좁히지 않으면서(엔진), 작동하지 않는 입력을 노출하지도 않는다(UI).
> **P5에서 총액 트랙이 붙으면 `PER_SQM_TRACK`에 주택을 추가**하면 된다(적격 목록은 불변).
> 진단용 `isExprValuationLegallyEligibleAssetKind()`도 함께 노출.
>
> **② `propertyType`을 optional이 아니라 필수로 했다**
>
> `ExpropriationValuationParams.propertyType`·`MultiParcelInput.propertyType` 모두 **required**.
> optional이면 신규 호출부가 빠뜨려도 tsc가 못 잡고 게이트가 **조용히 부적격 처리**해 특례가 죽는다
> — 이 특례는 이미 "호출부 1곳뿐이라 5개 경로가 우회"한 전례가 있다(§3-0). **타입으로 막는다.**
> 실제로 필수화 직후 tsc가 낡은 테스트 fixture 3곳 + 다필지 fixture 17곳을 **즉시 검출**했다
> (optional이었다면 전부 침묵 통과 → 특례 무력화).

### 4-2. 모델 — **B안(2-트랙) 채택** ✅

- **A안(총액 단일화)**: 법령 정합 최상·`transferArea` 축 소멸. 그러나 **다필지는 필지별 원/㎡가 본질**
  (§3-1)이라 총액 단일화가 역행한다.
- **B안(원/㎡ + 총액 병존)** ✅: §4-1 매트릭스대로 분기.

> **채택 근거**: **다필지 필지별 원/㎡ 요구**(§3-1)가 결정적. 기존 anchor E6·E6b 보존.
> **rev.6 정정**: rev.2~5가 근거로 든 *"결과 카드 회귀 0"*은 **철회**한다 — P8이 어차피 결과 카드를
> 자산종류별·호별로 분기시키고, 2호 2후보는 현행 `perSqmCandidates` 3필드 구조에 들어가지 않는다(§4-5).

### 4-3. ⚠️ dual-truth 리스크 — 총액 ↔ 원/㎡ (rev.6 신규 · Critical)

**보상액은 이미 2표현으로 존재하며 파생 관계가 코드에 있다**:

```tsx
// ExpropriationBlock.tsx:66-89 deriveFromCompensation
const newTotal = cash + bond;                       // reductions[] — 총액
const area = parseFloat(asset.transferArea || "0");
if (area > 0) {
  const curPerSqm = asset.compensationPerSqm || "";
  if (curPerSqm === "" || parseAmount(curPerSqm) === oldPerSqm)   // ← 수동 수정 감지 시 파생 중단
    patch.compensationPerSqm = String(Math.round(newTotal / area));  // AssetForm — 원/㎡
}
```

⇒ 사용자가 원/㎡를 **수동 수정하면 파생이 끊겨** 총액(`reductions[]`)과 원/㎡(`AssetForm`)가 **영구 괴리**한다.
⇒ 2-트랙 설계는 이 괴리 위에 서 있다 → **엔진이 어느 쪽을 우선하는지 규칙을 명문화**해야 한다.

**규칙(안)**: 트랙이 결정되면 **그 트랙의 필드만** 엔진에 전달하고 다른 표현은 **전달하지 않는다**
(§4-1 매트릭스가 트랙을 유일하게 결정하므로 모호성 없음). D13(보상총액 plumbing)은 **총액 트랙에서만** 수행.
`feedback_ui_engine_dual_truth_avoidance`.

### 4-4. §164⑨2호 (공매·경락) — **별도 불리언 채택** ✅ (Q1)

**필드 (rev.6: 3개 → 2개)**
```ts
isAuctionTransfer?: boolean;   // §164⑨2호 대상
auctionPrice?: string;         // 그 공매 또는 경락가액 (총액, 원)
```
> **`auctionKind` 삭제**(N2 종결) — §164⑨2호 문언 자체가 *"그 공매 **또는** 경락가액"*으로 **통칭**한다.
> 후보값·계산 동일, 라벨도 "공매·경락가액" 하나로 충분. Simplicity First.

**⚠️ UI 배치 (rev.6 Critical 정정)**: `ExpropriationBlock`은 `isExpropriation`일 때만 렌더된다
(`TransferModeBlock.tsx:135-137`). 공매·경락은 수용이 **아니므로** 이 블록에 두면 **영원히 도달 못 한다**.
→ 신규 `AuctionBlock.tsx`를 `TransferModeBlock` 3지선다 **하단·형제 위치**(부담부증여 블록과 동급)에 배치.

**⚠️ `selectMode` 보존 필수 (rev.6 신규)**: `TransferModeBlock.tsx:78-79`의 `burdened_gift` 분기가
`transferCause: "general"`을 **무조건 덮어쓴다**. 축 직교 이득은 **`isAuctionTransfer`가 `selectMode`
3분기 어디서도 정리되지 않을 때만** 성립 → **3분기 모두 보존 명시**.

**리스크 (실측)**

| 항목 | 결과 |
|---|---|
| enum substring 매칭 | **0건** — 전부 `===` ✅ |
| §77 감면 | `reductions[]` 축 → `transferCause` 무관 ✅ |
| NBL 사업용 의제 | `form-mapper-helpers.ts:102` `=== "public_expropriation"` → **별도 불리언은 미접촉** ✅ |
| `selectMode` 프리필 복제 | 안 2는 3지선다 미변경 → **복제 자체가 발생하지 않음** ✅ |
| **컴패니언 스키마** | ⚠️ **rev.6 정정** — `transfer-tax-schema-sub.ts:105`에 `transferCause`만 있고 **compensation 2필드가 없다**. 즉 컴패니언은 **현재 특례 미지원**이며, "메인만 고치면 침묵 strip"은 **사실 오류**였다. **컴패니언 지원 여부 = 신규 결정(Q5)** |

**배타 규칙 (N3 — 실현 가능 확인 ✅)**: §164⑨은 각 호 "어느 하나" → 1호·2호 **배타**.
`RadioCardGroup`은 옵션별 `disabled`(`:99,191-192`), `ToggleCard`는 `disabled`+`disabledReason`
(`:145-155,198`) 지원 → **신규 컴포넌트 불요**. validate에서도 동시 ON 차단.

**2호의 시점 게이트**: 2호 후보 구조는 **1996.1.1.부터 불변**(§9-2). 2009.02.04 게이트가 제한하는 것은
**대상 범위**다. 토지 공매는 1996년부터 법령상 대상이나, **P4도 2009.02.04 게이트를 적용**한다(X3 경계 유지).

### 4-5. result 타입 재설계 (rev.6 신규 — D9 선행)

현행 `perSqmCandidates`/`chosenPerSqm`/`area` 3필드는 (a)총액 트랙 (b)후보 수 가변(1호 3/2호 2)
(c)필지별 (d)토지·건물 분리를 **동시에 담지 못한다**.

```ts
export type ExprValuationBasis = "per_sqm" | "total";

export interface ExprValuationCandidate {
  key: "standard" | "compensation" | "compensation_basis" | "auction";  // 라벨은 UI가 매핑
  value: number;
  chosen: boolean;          // ← 엔진이 단일 확정(동률 복수 강조 원천 차단 — D9)
}

export interface ExpropriationValuationUnit {
  clause: "clause_1" | "clause_2";      // 1호 3후보 / 2호 2후보
  basis: ExprValuationBasis;
  candidates: ExprValuationCandidate[]; // 길이 가변(2~3)
  chosen: number;
  area?: number;                        // basis === "per_sqm"일 때만
  denominator: number;                  // 항상 총액
}

export interface ExpropriationValuationDetail {
  asset?: ExpropriationValuationUnit;                    // 단건·비분리
  land?: ExpropriationValuationUnit;                     // split(B-2)
  building?: ExpropriationValuationUnit;
  parcels?: Record<string, ExpropriationValuationUnit>;  // ⚠️ Map 금지 — Record
  denominator: number;
}
```

> `key`는 내부 키이고 라벨은 UI가 자산종류별로 매핑한다 — "공시지가"(가목)·"건물 기준시가"(나목)·
> "개별주택가격"(라목). **breaking change** — `perSqmCandidates`·`chosenPerSqm`·`area` 제거로
> anchor E6·E6b(`expropriation-unified.test.ts:96-106`) 재작성 필요. P8이 어차피 카드를 바꾸므로
> **추가 비용은 anchor 2건**. `feedback_engine_result_map_json_loss` 준수.

### 4-6. split 분모 주입 (D6) — **B-2 독립 적용 채택** ✅ (Q2)

```
landStdAtTransfer     → min[landStdAtTransfer,     토지분 보상액, 토지분 보상기초]
buildingStdAtTransfer → min[buildingStdAtTransfer, 건물분 보상액, 건물분 보상기초]
```

> **⚠️ 단위 (rev.6 정정)**: `landStdAtTransfer`는 **총액**이다
> (`split-gain.ts:86-89` `Math.floor(totalStdAtTransfer × landRatio)`). rev.5 유사코드가 원/㎡ 후보를
> 총액과 같은 min[]에 넣는 것처럼 읽혔다 → **split의 B-2는 `basis: "total"` 3후보**로 확정.

**B-1(총액 대입 후 안분) 기각 근거**: §164⑨은 **각목별** 차감 구조 / `feedback_no_silent_apportion_fallback`
저촉 / 실무상 토지·건물(지장물) 보상이 별도 산정.

**필드 (rev.6: `splitPair` 재사용으로 축소)**: 기준시가는 `토지분 + 건물분 = 총액`이 성립하므로,
기존 `splitPair`(`split-gain.ts:39-50`)·`isSplitPairOverflow`(`:59-72`) 패턴을 재사용해
**토지분 2필드만 입력 + 건물분은 잔액 도출**한다 → **4필드 → 2필드**. validate는 `isSplitPairOverflow` 재사용.

> ✅ **N1 종결 — housing split 미지원 확정 (Q6)**
> 개별주택가격(라목)은 **총액**이라 토지·건물로 분해되지 않는다 → "토지분 보상기초 기준시가"에
> 대응하는 **법정 가액이 없다**. rev.5의 "총액 단일 min[] 후 안분(B-1 형태)"은 **기각된 B-1이자
> `feedback_no_silent_apportion_fallback` 금지 패턴**이라 제거했다(CLAUDE.md 인정 예외는 PHD §164⑦뿐).
> ⇒ **housing split + 1호/2호 + 환산 = validate 차단**(§10-2 Q6). §164⑦ 준용 가능성은 **X6 별건**.
>
> ⚠️ **원/㎡ 트랙을 split에 쓰려면 건물 면적 필드 신설 필요**: `split-gain.ts:150`은
> `landStdAtAcq = sqmAtAcq × acquisitionArea`(토지)뿐이고 `buildingStdAtAcq = total − landStdAtAcq`
> **잔액**이다 — 건물 면적 필드가 **없다**. §4-6이 `basis: "total"`을 택했으므로 **신설 불요**(정합).

### 4-7. 일반건물(GB) §164⑨ — **토지분만 적용** ✅ (D16-GB, 법령 조사 2026-07-16)

GB는 토지(가목)+건물(나목) 2목이라 안분(§166⑥)과 환산(§176의2②)이 얽힌다. rev.11까지 "안분/환산 분모 분리
법령 해석 선행"으로 **미검증** 표기했던 논점을 KoreanLaw MCP 원문 조사로 해소했다.

**결론 3가지 (검증 완료):**

1. **환산 분모(§176의2②)만** §164⑨로 낮춘다 — 토지 환산취득가↑·차익↓(relief 본질). §164⑨ 문언
   "…차감하여 **양도 당시 기준시가를 계산한다**"는 정의 규정이라 §176의2② 분모에 그대로 적용된다
   (§176의2②이 §164⑧만 괄호 인용하고 §164⑨은 미인용이나, 정의 규정이라 인용 불요).
2. **안분(§166⑥)은 원 개별공시지가 유지** — §166⑥은 §100② 실지거래가 구분 불분명 시 부가세법 §64①
   안분이고, 여기 "기준시가"에 §164⑨-낮춘 값을 넣으라는 **명문이 없다**. 넣으면 토지 상대가치가
   인위적으로 하락해 양도가가 건물로 과다 배분됨(입법의도 밖 왜곡). ⇒ 안분은 원값.
3. **건물분(나목)은 미적용** — **시행규칙 §80⑧**: "영 §164⑨1호에서 보상액 산정 기초 기준시가는 보상금
   산정 당시 해당 **토지**의 개별공시지가를 말한다." 건물엔 "보상 기초 기준시가" 개념 자체가 없다.
   국세청 해석 2건(서면-2016-부동산-4026·사전-2018-법령해석재산-0057)도 전부 토지 사안.

**구현**: `calculateConvertedAcquisition(input, allocation, landStdTotalForValuation?)` — 토지 환산 분모만
override(`applyExpropriationValuation` 재사용). 안분(`allocateBundledTransferPrice`)·건물 환산 무변경.
**증축(3-way, 사례 33)** 경로는 자체 환산이라 제외(§164⑨+증축+수용 3중조합 극희소 — 알려진 갭).

> **근거(법제처 MST 286211 시행령·286379 시행규칙, 조회 2026-07-16)**: §164⑨·§166⑥·§176의2②·규칙 §80⑧.

---

## 5. 케이스 매트릭스 (anchor 대상)

> `[R]`=RED 선행, `[G]`=현행 GREEN 유지(회귀 방어).

| # | 자산 | 목 | 경로 | 호 | 기대 | 상태 |
|---|---|---|---|---|---|---|
| C-01 | 토지 | 가 | 단건 | 1호 | 특례 적용 (현행 E6) | `[G]` |
| C-02 | 토지 | 가 | 단건 | 1호, 2009.02.03 | 미적용 (현행 E7b) | `[G]` 유지 확정(§9-2) |
| C-03 | 건물 | 나 | 단건 | 1호 | 특례 적용(원/㎡) | `[R]` D1·D11 |
| C-04 | 오피스텔/상가 | 다 | 단건 | 1호 | 특례 적용(원/㎡) | `[R]` D1·D11 |
| C-05 | 주택 | 라 | 단건 | 1호 | 특례 적용(**총액 3후보**) | `[R]` D1·§4-1 |
| C-06 | 건물 | 가+나 | **split** | 1호 | **토지·건물 독립 min[]**(총액 3후보) | `[R]` D6·Q2 |
| **C-06b** | 주택 | 라 | split | 1호 | **validate 차단**(미지원 — 라목 총액 미분해) | `[R]` **Q6 확정** |
| C-06c | 입주권·분양권 | — | 단건 | 1호 | **특례 미적용**(§99①2호) — `SUPPORTED_ASSET_KINDS` 밖이라 `transferCause` 설정 불가 | **`[G]` 현행 정답** — 회귀 방어만(BR-3) |
| **C-24** | — | — | — | — | **`isExprValuationEligible` 단위 anchor** — 가~라목 ✅ / 입주권·분양권·`general_building_unit` ❌ | `[R]` BR-6 |
| **C-07** | **토지 다필지** | 가 | **multi-parcel** | 1호 | **필지별 특례** | **`[R]` D7 — 86,784,934원 실증** |
| C-07b | 토지 다필지 | 가 | multi-parcel | 1호 | 필지별 공시지가 상이 → min 독립 선택 | `[R]` §3-1 |
| C-07c | 토지 다필지 | 가 | multi-parcel | 1호 | **API `:256` 무력화 해소 확인**(⑬⑭ 경유) | `[R]` §3-1 차단막(1) |
| **C-08** | **주택(PHD)** | 라 | **PHD** | 1호 | 특례 적용 — **split보다 먼저 분기** | `[R]` **D15** |
| C-08b | 겸용주택 | 나·라 | mixed-use | 1호 | 특례 적용(주택분·상가분) | `[R]` D8 |
| C-08c | 재개발 | — | redevelopment | 1호 | 특례 적용 | `[R]` D12 |
| C-09 | 토지 | 가 | 단건 | **2호 공매** | `min[A, 공매가액]` **총액 2후보** | `[R]` D5 |
| C-10 | 토지 | 가 | 단건 | **2호 경락** | 동상 | `[R]` D5 |
| C-10b | 주택 | 라 | 단건 | 2호 | 특례 적용(총액 2후보) | `[R]` D5 |
| C-11 | 토지 | 가 | 단건 | 2호 | **§77 감면 미발동 + NBL 의제 미부착** | `[R]` 안2로 구조 해소 — 회귀 방어 |
| C-16 | 토지 | 가 | 단건 | **1호+2호 동시 ON** | **차단**(§164⑨ "어느 하나") | `[R]` N3 |
| C-17 | 토지 | 가 | 단건 | **부담부증여 + 2호** | `isAuctionTransfer` **보존**(selectMode 3분기) | `[R]` §4-4 — **현행 반증 → 신규 배선** |
| C-12 | 토지 | 가 | 단건 | 1호, 실지취득가 | 미적용 (현행 E7) | `[G]` |
| C-13 | 토지 | 가 | 단건 | 1호, 보상필드 미입력 | 미적용 (현행 E7d) | `[G]` |
| **C-14** | 주택 | 라 | 단건 | 1호 | **보상액·보상기초 둘 다 A 초과 → chosen === A → 차감 0** | `[R]` — rev.6 재기술(§2-3 `m ≥ A`) |
| C-18 | 토지 | 가 | 단건 | 1호 | **`m === A`** → 차감 0 (경계) | `[R]` |
| C-19 | 토지 | 가 | 단건 | 1호 | 후보 1개만 0 → 게이트 null | `[R]` |
| C-20 | 토지 | 가 | 다필지 | 1호 | 면적 소수(300.55) × 신규 경로 | `[R]` `feedback_area_rounding_consistency` |
| C-15 | 토지 | 가 | 단건 | — | 수용→일반→수용 왕복 시 stale 미잔존 | `[R]` D3 |
| C-22 | 토지 | 가 | **수정신고** | 1호 | 특례 필드 **보존**(amendment strip 전례) | `[R]` `project_transfer_multi_amendment_correction` |
| C-23 | 토지 | 가 | **부담부증여 + 1호** | 1호 | §159 안분 후 특례 필드 보존 | `[R]` `burdened-gift-step.ts` |

> **C-14 rev.6 정정**: rev.5의 "min이 A보다 큼"은 `Math.min`이 A를 후보에 포함하므로 **정의상 불가능**
> = 테스트 불가 케이스였다. "보상액·보상기초가 **둘 다** A 초과 → chosenPerSqm === A → 차감 0"으로 재기술.

---

## 6. Phase 계획 · PR 분리

| PR | Phase | 내용 | 세액 | 선행 |
|---|---|---|---|---|
| **PR#1** | **P1** | ✅ **부분 완료**(B1·B2 — `legal-codes` 상수 신설 + 엔진 주석 전면 개정). 잔여 B3~B7(UI·store·결과카드 주석)는 P3/P8에서 해당 파일 수정 시 동반. **D4·D14** 법령 근거 정정 — 인용 → `소득세법 시행령 §164⑨` + `legal-codes/transfer.ts` 상수 + 주석 드리프트(`ExpropriationBlock.tsx:11-12,36-37` · `calc-wizard-asset.ts:201` · `TransferTaxResultView.tsx:382`) | 없음 | — |
| **PR#1** | **P9** | ✅ **완료** — **D10-a** 게이트 근거 정정(주석·상수만) + **미지원 명시**(X3) + U1 "확인 필요". 게이트 값 유지 | 없음 | P1 |
| **PR#2** | **P0-a** | ✅ **완료** — anchor 8건(C-07·C-07b·C-07c·C-19·C-19b·C-02·C-20·C-12) RED→GREEN | — | PR#1 |
| **PR#2** | **P2** | ✅ **완료** — **D7 다필지**: `multi-parcel-transfer.ts` 내부 배선(차단막 3지점 **무변경** — 환류 §3-1) + `ParcelInput` 필지별 2필드 + `MultiParcelInput.transferCause` + `ParcelResult.expropriationValuationDetail` + **`parcelSchema`(⑫)** + UI/validate | **86,784,934원 해소** | P0-a |
| PR#3+ | P0-b | 잔여 anchor RED (§5 `[R]`) | — | PR#2 |
| PR#3+ | **P3** | ✅ **완료** — **D1·D2·D3·D11** 게이트 확대 — `showValuationMin`·validate의 `assetKind === "land"` → **`building`·`general_building`·`commercial_building` 추가**(나·다목) + D11 `transferArea` 배선(**`AssetSectionTransfer.tsx:92-93`** — 환류 아래) + `expropriation-scope.ts` 신설(Q7 B안) + 엔진 게이트 5조건. **입주권·분양권 UI 제외 불요**(BR-3) | 과다 해소 | P0-b · Q7 |

> **✅ D11 환류 — 수정 지점이 계획과 다르다.** rev.8은 `AssetSectionBasic.tsx:298`(면적 정보 섹션)
> 게이트 확대를 지목했으나, 그 섹션엔 **`areaScenario` 4종 중 3종이 토지 전용**이다
> (일부 양도·**감환지·증환지** — 환지는 소득령 §162의2 토지 개념). 건물에 그대로 노출하면 오답이다.
> ⇒ 대신 **`AssetSectionTransfer.tsx:92-93`**을 고쳤다 — 건물은 `StandardPriceInput`에서 **이미 면적을
> 입력**하는데(`isAreaMode === true`) `assetKind === "land"`일 때만 controlled라 값이 내부 state로
> 빠지고 있었다. 그 조건만 적격 판정으로 바꾸면 **중복 필드 없이** store에 저장된다.
> 계획의 "신규 위젯 불요"는 맞았으나 **자리가 틀렸다**.
| PR#3+ | **P3b** | ⏭️ **별건 분리**(다자산 `transfer-tax-aggregate` 경로 검증 필요 — `buildAssetPayload`에 특례 필드 0건 실측) — **Q5 컴패니언 지원** — ⑫ `schema-sub.ts:105` 필드 추가 + `buildExpropriationInput` 호출부를 컴패니언까지 확장(UI는 이미 렌더됨) | 과다 해소 | P3 |
| PR#3+ | **P4** | **D5** 공매·경락 — **신규 `AuctionBlock.tsx`**(3지선다 형제) + 2필드 + 배타(N3) + `selectMode` 3분기 보존 | 과다 해소 | P3 |
| PR#3+ | **P5** | **라목(주택) 총액 트랙** + D13 보상총액 plumbing(총액 트랙 전용 — §4-3) | 과다 해소 | P3 |
| PR#3+ | **P6** | **D6·D15** split(B-2) + **PHD 배선** — PHD가 split보다 먼저 분기하므로 **동시 처리** | 과다 해소 | P3·P5 |
| **완료** | **D16-CB** | ✅ **상가 배선 — `runCommercialBuildingStep` 내부에 `applyExpropriationValuation`(양도시 호별총액 min[]) + `PER_SQM_TRACK` 재추가 + ① 참조행 CB 분기. 86,784,934원 실증** | 해소 | — |
| **완료** | **D16-GB** | ✅ **일반건물 배선 — 토지 환산 분모만 §164⑨.** `calculateConvertedAcquisition`에 토지 분모 override(`applyExpropriationValuation` 재사용) + `PER_SQM_TRACK` 재추가 + route ⑭ 전달 + ① 참조행 GB 분기. **안분(§166⑥)·건물분 무변경**. +82,745,181원 실증(사례31 베이스) | 해소 | ✅ 법령조사 완료 |
| PR#3+ | **P7** | **D8·D12** 겸용·재개발 배선 (각 전용 경로 내부) | 과다 해소 | P3 |
| PR#3+ | **P8** | **D9** result 타입(§4-5) + 결과 카드 재작성 + **`<ToneCard>` 전환** + **`ALL_LEAVES` 등록** + CalculationStep | 없음(표시) | P3·P4·P5 |

> **PR 분리 근거**: P2는 **세액 실증 유일** · land 전용 · P3와 **독립**(다필지 게이트가 이미 land라
> 게이트 확대 불요) → 즉시 머지 가능. P3~P8은 신규 필드+14지점+결과 카드 재설계라 리뷰 부담이 질적으로 다르다.
>
> **P1 → P2 순서 강제**: P2가 `ParcelInput`에 새 코드를 넣는데, P1 전이면 **집행기준 인용을 새 코드에 복제**하게 된다.
>
> ⚠️ **`ParcelInput` 최종 형상을 P2 착수 전 §4에 확정**할 것 — P4(2호 총액)·P5(총액 트랙)가 같은 타입을
> 재차 수정하면 마이그레이션이 3회 발생한다.

---

## 7. 14 동기화 지점

| # | 지점 | 파일 | P2(다필지) | P4(공매 2필드) | P5(주택 총액) | P6(split 2필드) |
|---|---|---|---|---|---|---|
| ① | 폼 상태 | `calc-wizard-asset.ts:202,208-211` | 필지별 2필드 | `isAuctionTransfer`·`auctionPrice` | 총액 1필드 | 토지분 2필드 |
| ② | initial | `calc-wizard-asset-factory.ts:57,59-60` | `""` | `false`/`""` | `""` | `""` |
| ③ | normalize | `calc-wizard-asset-migrate.ts:41,44-45` | `undefined → ""` | 동상 | 동상 | 동상 |
| ④ | API 변환 | `api-helpers.ts:639-647` · **`transfer-tax-api.ts:256`(차단막!)** · `non-business-land-request.ts:94` | 필지 매핑 + `:256` | 2필드 | reductions 조회(D13) | 2필드 |
| ⑤ | UI 위젯 | `ExpropriationBlock.tsx:145-180` · **`Step5.tsx:241`** · `AssetSectionAcquisition.tsx:201` | 필지 카드 2필드 | **신규 `AuctionBlock.tsx`**(형제 위치) | 주택 총액 칸 | `LandBuildingSplitSection` 2칸 |
| ⑥ | 사이드바 | `calc-wizard-store.ts:432-440` | **해당 없음** — `totalAcqPrice`가 `fixedAcquisitionPrice`/`similarSalesValue`만 읽어 환산 모드는 0(0원 제외 정책). 세액은 `result` echo로 자동 반영 | ← | ← | ← |
| ⑦ | 결과 카드 | `ExpropriationValuationCard.tsx` + **`transfer-result.types.ts:91`** + CalculationStep + **`ALL_LEAVES`** | 필지별 | 2후보 | 총액 단위 | 토지·건물 2 unit |
| ⑧ | validate | `transfer-tax-validate-asset.ts:693-703` | 필지별 필수 | 2필드 + **배타 차단**(N3) | 모드별 필수 | `isSplitPairOverflow` 재사용 |
| ⑨⑩ | Zod enum | `schema.ts:126` · `schema-sub.ts:105` | — | **무관**(안2는 enum 미변경) ✅ | — | — |
| ⑪ | 자산-수준 fallback | — | 해당 없음 | — | — | — |
| ⑫ | **Zod 입력 객체 — 3곳 전부 필수(Q5)** | **`schema.ts:125-130`(메인) · `schema-sub.ts:547`(`parcelSchema`) · `schema-sub.ts:105`(컴패니언)** | **`parcelSchema`** | 메인+컴패니언 | 메인+컴패니언 | 메인+컴패니언 |
| ⑬ | body spread | `transfer-tax-api.ts:279-280` | 필지 전달 | 2필드 | 신규 필드 | 2필드 |
| ⑭ | Route 매핑 | `route.ts:128,131-132` | 필지 매핑 | 2필드 | 신규 필드 | 2필드 |
| 엔진 | | `transfer.types.ts:105,341` · `expropriation-valuation.ts:12-21,25,51` · `transfer-result.types.ts:91` · `helpers.ts:313` · `multi-parcel-transfer.ts:298-305` · `split-gain.ts:85-89,139-141` · `pre-housing-disclosure.ts` | | | | |
| **P3 신규** | **`lib/tax-engine/expropriation-scope.ts`** (신규 — 자산종류 적격 단일 소스) | — | — | — | — |

> **⚠️ `expropriation-scope.ts`는 14지점 축이 아니라 "3층 공유 소스"다** (rev.8 — BR-5).
> 신규 필드가 아니므로 ①~⑭ 어디에도 안 들어가지만, **UI(`ExpropriationBlock`)·validate
> (`transfer-tax-validate-asset`)·엔진(`applyExpropriationValuation`) 3곳이 import**하므로
> 셋 중 하나라도 자체 조건을 재구현하면 **드리프트**다. P3 구현 시 **3곳 전부 이 파일 경유**를 grep 확인.

> **⚠️ ⑫가 3곳이다** (rev.6 정정 — rev.5는 2곳이라 했다). `parcelSchema`(`schema-sub.ts:547`,
> `schema.ts:192`에서 `parcels: z.array(parcelSchema)`)가 **최우선 Phase P2의 스키마 지점**인데 표에서 빠져 있었다.
> **컴패니언**(`schema-sub.ts:105`)은 현재 `transferCause`만 있고 compensation 필드가 **없다** → 지원 여부 = **Q5**.

---

## 8. 정책 준수 체크

- [x] **법 근거 없이 불리 적용 금지** — D1·D2·D5·D7 정면 위반. 본 계획의 핵심 동기
- [x] **법령 인용 검증** — §164⑨·§99①1호·§164⑧(2005)·§164⑪(1996) 원문 확인
- [x] **enum substring 매칭 금지** — 실측 0건
- [x] **numeric 영향 먼저 검증** — **실증 = D7·D6만**. 나머지는 "추정" 표기(§0)
- [x] **Simplicity First** — `auctionKind` 삭제(3→2필드) · split `splitPair` 재사용(4→2필드)
- [x] **자동 안분 fallback 금지** — B-1 기각 + **N1의 B-1 형태 재등장 차단**(§4-6)
- [ ] **법령 조문 상수** — P1에서 리터럴 → 상수
- [ ] **dual-truth 회피** — §4-3 트랙별 단독 전달 규칙 + **`expropriation-scope.ts` 단일 함수 3층 공유**(Q4)
- [x] **3중 패턴** — **Q4 확정**: UI·validate·엔진 3층 명시 + 단일 함수 공유(재구현 금지)
- [ ] **result Record** — §4-5 확장 시 Map 금지·Record 유지 (조건부)
- [ ] **면적 반올림** — `round2`/`residualArea`. C-20 anchor
- [ ] **print leaf `ALL_LEAVES` 동기화** — P8 (`feedback_print_leaf_add_unit_test_sync`)
- [ ] **ToneCard·라벨 정본·testid** — §4-4·P8 (`components/calc/CLAUDE.md`)
- [ ] **E2E 회귀** — 기존 공익수용 E2E 3건. P3·P4가 게이트/UI를 바꾸므로 각 Phase에서 확인 (`feedback_blocking_validation_full_e2e_regression`)
- [ ] **토글 자동노출 정책** — `feedback_ui_toggle_auto_visibility_policy` (신규 `AuctionBlock` 노출 조건)
- [ ] **placeholder 숫자 예시 금지** — 신규 필드

---

## 9. 2009.02.04 게이트 (D10) — 조사 완료

### 9-1. 명분은 허위, 게이트 값은 **잠정 유지**(정합 아닌 미지원)

§164⑨ 전신은 **1996.1.1. 제14860호 §164⑪** 신설이다(2009 아님).

**[제14739호, 시행 1995.7.20. — 직접 조회]** §164 ①~⑨에 수용·공매 문언 **전무**.
**[제14860호, 시행 1996.1.1. — 직접 조회]**
> ⑪…법 제99조제1항제1호 **가목**에 의한 가액보다 낮은 경우… 1. …수용되는 경우의 **그 보상금액**
> 2. …공매 또는 경락가액

**[신구대조 20081231↔20090204 — 직접 조회]** 신설 조문 **3건(제2조의2·제50조의2·제184조의3)뿐, §164 미포함.**
⇒ 제21301호는 §164를 **변경**했을 뿐 신설하지 않았다. 항 번호: ⑪(1996) → ⑧(2001~2005) → ⑨(2009~).

### 9-2. 게이트 삭제 = 새 오류 — 행위시법

| 시점 | 근거 | 대상 | 1호 후보 |
|---|---|---|---|
| 1996.1.1. | 제14860호 §164⑪ | **가목만** | 보상금액 (**1후보**) |
| 2005.2.19. | 제18705호 §164⑧ | 가목~**다목** | 보상금액 (**1후보**) |
| **2009.2.4.~** | 제21301호 §164⑨ | 가목~**라목** | 보상액 **과 보상기초 중 적은 금액** (**2후보**) |

| 선택 | 결과 | 판정 |
|---|---|---|
| 게이트 삭제(또는 날짜만 1996으로 하향) | 구법(1후보·좁은 대상)에 **현행 3후보 모델** 적용 | ❌ **새 오류** |
| 게이트 유지(현행) | 1996~2009.2.3. 양도분의 **법령상 존재하던 특례 미지원** | ⚠️ **알려진 갭 — 정합 아님** |
| 시점별 문언 분기 | 1996판/2005판/2009판 각각 | ✅ 정답 → **X3 별건** |

> **⚠️ 날짜만 낮추는 정정 금지**: 게이트가 `basis > 0`을 AND로 요구(`:55`) → 구법 사안에 신법 3번째 후보 강제.

### 9-3. 남은 미확인 2건

| # | 항목 | 상태 |
|---|---|---|
| U1 | 제14860호·제21301호 **부칙 적용례** 원문 | **확인 불가** — `get_historical_law` 내용 없음 · `jo="부칙"`·`efYd=20090204` NOT_FOUND · 결정례 인용 미발견. 양도일 기준이 자연스러운 해석이나 **단정 않음** → 주석에 "확인 필요" 명시 |
| U2 | "보상기초" **2후보 추가 시점** | 2005.2.19.~2009.2.4. 사이. 2007·2008판 §164 조회 **API 파싱 결함**으로 실패 → X3 착수 시 재조사 |
| **U3** | **`redevelopment_apt`가 §99①1호라목(주택)인가 2호가목(권리)인가** | **관리처분계획 인가 전후로 성질이 바뀐다** → 법령 확인 필요. **확정 전까지 P7의 D12(재개발 배선) 착수 불가**(§4-1b) |

> **⚠️ 후속 조사자용 함정**: `applicable_law`/`get_law_text`의 **NOT_FOUND는 "미신설"이 아니라 조회 실패**다.
> 2007.3.1.(제19890호)에서 §154·§165는 전문이 나오는데 **§164만 NOT_FOUND**(④~⑦ 산식 이미지 파싱 추정).
> **NOT_FOUND를 미신설로 읽으면 정반대 결론이 난다.**

---

## 10. 사용자 결정

### 10-1. 확정 (2026-07-16) — **Q1~Q6 전부**

| Q | 사안 | 결정 | 파생 |
|---|---|---|---|
| **Q1** | §164⑨2호 축 | **별도 불리언** — enum 미변경 → §77·NBL 리스크 구조적 소멸 | §4-4 |
| **Q2** | split 분모 | **B-2 독립 적용** — B-1 기각 | §4-6 |
| **Q3** | 구 문언(1996~2009) | **X3 별건 분리** | §11-X3 |
| **Q4** | 게이트 층 | **3층 모두 명시** — UI·validate·**엔진** 전부 가~라목 게이트 | §3-3 · §4-1b |
| **Q5** | 컴패니언 자산 | **지원 확대** — ⑫ 컴패니언 스키마 + API 변환 | §4-4 · §7 ⑫ |
| **Q6** | housing split | **미지원 확정** + validate 차단 | §4-6 |

### 10-3. STEP 3 blast-radius 파생 — 확정

| Q | 사안 | 결정 |
|---|---|---|
| **Q7** | Q4 3층 공유 구현 방식(§4-1c) | **B안** — 진입점 2개 + **`EXPR_VALUATION_ELIGIBLE` 상수 목록 1개** 공유. A안은 `mixed-use-house`·`right_to_move_in` 파생이 UI 시점에 미확정이라 순수 매핑 불가 |

### 10-2. Q4·Q5·Q6 파생 사항

**Q4 (3층 명시)**
- 게이트 대상 = §4-1b 매핑표의 ✅ 자산. **`right_to_move_in`·`presale_right`는 명시적 제외**(§99①2호).
- 엔진: `applyExpropriationValuation` 파라미터에 `propertyType` 추가 + 게이트 조건 추가
  (현행 4조건 AND → **5조건**). 이로써 `api-helpers.ts:635-636` docblock("엔진이 게이트 판정")이
  **비로소 사실이 된다** — 현재는 자산종류 축이 없어 허위.
- API(`buildExpropriationInput`)는 **원값 전달 유지**(게이트 아님). "3층"은 UI·validate·엔진이며
  API는 변환 계층이다 — 여기에 게이트를 두면 **4중 소스**가 되어 오히려 정책 역행.
- **단일 소스 강제**: 세 층이 같은 조건을 재구현하면 드리프트가 난다 →
  **`lib/tax-engine/expropriation-scope.ts`(신규) 에 `isExprValuationEligible(propertyType)` 단일 함수**를 두고
  UI·validate·엔진이 **동일 함수를 import**한다(`feedback_ui_engine_dual_truth_avoidance`).
  UI는 `assetKind → propertyType` 변환 후 호출(기존 `toPropertyKind` 계열 재사용).

**Q5 (컴패니언 지원 확대)**
- **UI는 이미 준비됨** — `AssetSectionTransfer.tsx:49`가 **자산마다** `TransferModeBlock`을 렌더하므로
  컴패니언 자산에도 `ExpropriationBlock`이 이미 나온다. **빠진 것은 ⑫ 스키마 + ④ API 변환뿐**이다.
- ⑫ `schema-sub.ts:105` 컴패니언 스키마에 **compensation 2필드 + `isAuctionTransfer`·`auctionPrice`** 추가.
- ④ `buildExpropriationInput(primary)`가 **주 자산 전용**이다 → 컴패니언 자산에도 적용되도록 호출부 확장 필요.
  다자산은 `transfer-tax-aggregate.ts`가 자산별로 단건 엔진을 반복 호출하므로 **엔진 변경 불요**.
- ⚠️ **anchor C-11b가 이 결정으로 의미가 바뀐다** — "침묵 strip 방지"가 아니라 "**신규 지원**" 검증.

**Q6 (housing split 미지원 확정)**
- 차단 조건: `propertyType === "housing"` **AND** `landAcquisitionDate` 존재(split) **AND** 1호/2호 **AND** 환산.
- validate 메시지에 **사유 명시**: 개별주택가격(§99①1호라목)은 총액이라 토지·건물로 분해되지 않아
  각목별 차감(§164⑨)을 적용할 수 없음.
- **자동 안분으로 우회하지 않는다** — `feedback_no_silent_apportion_fallback`("미입력은 검증 오류로 차단").
- ⚠️ **트레이드오프 명시**: 차단은 해당 조합의 **계산 자체를 막는다**. 대안(특례 없이 계산)은 세액 과다를
  침묵 산출하므로 더 나쁘다고 판단 — 사용자 결정(Q6).
- **X6 별건**: §164⑦ 예외 준용 가능성은 별도 법령 검토 과제로 남긴다(§11).

---

## 11. 별건 (본 계획 범위 밖)

| # | 항목 | 사유 |
|---|---|---|
| X1 | 집행기준 99-164-12 원문 확보 | 법제처 API·NTS 모두 본문 추출 실패. §164⑨으로 대체 가능 → 불요 |
| X2 | `land-building-split-mode-gating…` §7 S1(미등기 0.3%)·S3(swapApplied) | 별개 계열 |
| **X3** | **구 문언(1996~2009) 행위시법 분기** (2호 1996~ 구간 포함) | **별건 확정(Q3)** — ① 시점별 분기가 자체로 대 규모(`feedback_historical_tax_tables`) ② U2 재조사 선행 ③ 부과제척기간 도과 개연성(**미검증** — 수정신고·경정청구 경로 존재하므로 0은 아님) ④ 세액 **미실측**. **P9가 "미지원"을 주석에 명시**하는 것으로 갈음 |
| X4 | `transfer-reductions/phd-helper.ts` 감면 조문 PHD 자체 환산 | 감면 기준가액에 §164⑨이 미치는지 **법령 판단 필요** — 미조사 |
| X5 | `ExpropriationBlock.tsx:174-180` ③이 `CurrencyInput` — 개별공시지가는 `LandPriceLookupField` 필수 정책 | ③은 **보상 산정에 쓰인 과거 시점** 공시지가 → 조회 미지원이면 `CurrencyInput` 유지가 맞음. **사유를 주석에 명시**할 것(판단 근거 기록) |
| **X6** | **housing split에 §164⑦ 예외 준용 가능성** | Q6에서 **미지원 확정**했으나, CLAUDE.md가 자동 안분 fallback의 유일한 예외로 인정한 §164⑦(개별주택가격 미공시 3시점 환산)이 주택의 토지·건물 분해를 실제로 수행한다 → §164⑨ 분모에도 준용 가능한지 **법령 검토 과제**. 성립하면 Q6를 재개정 |

---

## 12. 개정 이력

- **rev.11** (2026-07-16): **D16-CB(상가) 배선 완료.** `runCommercialBuildingStep` 내부에서
  `applyExpropriationValuation` 재사용(양도시 호별총액 = `unitPriceAtTransfer × 연면적`을 min[]으로) —
  **신규 필드 0**(full `TransferTaxInput` 접근). 세액 **86,784,934원 과다 실증**(probe). `PER_SQM_TRACK`에
  `commercial_building` 재추가·① 참조행 CB 분기(`cbUnitPriceAtTransfer`)·detail 승격(cbStep→result).
  STEP 0.35를 `applyCommercialBuildingStep` helper로 추출(800줄). anchor 4 + E2E 2. **D16-GB(일반건물)는
  별건** — route early-return + 안분/환산 분모 분리 법령해석 + 신규필드 2 + UI 신규.
- **rev.10** (2026-07-16): **P3 Do 완료 + 코드리뷰 반영.** **D16 신규** — 코드리뷰 probe가 §3-0 표의
  **누락 2경로**(상업용건물·일반건물 전용 환산)를 검출. 상가는 `transfer-tax.ts:305` STEP 0.35가
  `useEstimatedAcquisition: false`로 교체해 게이트 미진입, 일반건물은 `route.ts:736` **early return**으로
  `calculateTransferTax` **미호출** ⇒ 게이트를 열어도 **세액 불변**. ⇒ **P3 실효는 `building`(나목) 1종**으로
  좁혀졌고, 상가·일반건물은 UI 노출을 **보류**(노출 시 침묵 무시 + 차단 validation만 추가되는 순손실).
  §4-1c 목록 3개 → **2개**(dual-truth 제거 — `ELIGIBLE_ASSET_KINDS`가 `ELIGIBLE_PROPERTY_TYPES`와
  바이트 동일·소비자 0이었음). `MIN_TRANSFER_DATE` **4중 복제 → 단일 소스**. `showValuationMin`에
  `!parcelMode` 추가(다필지 자산-수준 칸 침묵 무시 차단). C-04 anchor **삭제**(cbValuation을 뺀
  도달 불가 구성을 GREEN으로 고정해 **거짓 확신**을 주고 있었음).
- **rev.8** (2026-07-16): **STEP 3 blast-radius 7건 반영**(Critical 1·High 2).
  **BR-1(Critical)**: rev.7 §10-2의 *"`toPropertyKind` 계열 재사용"*은 **사실 오류** — 그 함수는 4값
  `propertyKind`(StandardPriceInput 전용)를 반환하며 10값 `propertyType`과 무관. **3층 축 불일치**
  (UI·validate=`assetKind` / 엔진=`propertyType`, 매핑은 `transfer-tax-api.ts:196-200`에만) → §4-1c
  구현 재설계 + **Q7 신설**(P3 차단). **BR-2**: `general_building_unit`은 엔진 내부 서브카드라 자산-수준
  미도달 — 매핑표 정정. **BR-3(High)**: 입주권·분양권·재개발은 `SUPPORTED_ASSET_KINDS`
  (`TransferModeBlock.tsx:49`) 밖이라 **`transferCause` 설정 자체가 불가** → rev.7의 "명시적 제외"는
  **과잉**, C-06c는 `[G]` 현행 정답으로 강등. 그 5종이 **§164⑨ 가~라목과 정확히 일치** — 자산종류
  게이트가 **우연히 이미 존재**함을 명시. **BR-4**: U3가 P7을 차단한다는 rev.7 판단 재평가 필요
  (재개발도 수용 미도달). **BR-5**: §7에 `expropriation-scope.ts` 행 추가(14지점 축 아닌 3층 공유 소스).
  **BR-6**: C-24(`isExprValuationEligible` 단위 anchor) 추가. **BR-7**: §0 D7 해소 표기.
- **rev.7** (2026-07-16): **Q4·Q5·Q6 확정 반영**. Q4=**3층 명시** + **`expropriation-scope.ts` 단일 함수
  공유**(재구현 드리프트 차단, API는 원값 전달 유지). Q5=**컴패니언 지원 확대**(UI는 이미 렌더 중 —
  ⑫ 스키마 + ④ 호출부만 확장 · C-11b 의미 변경). Q6=**housing split 미지원 확정**(validate 차단 + 사유 명시,
  §164⑦ 준용은 X6 별건). **§4-1b `propertyType` ↔ 가~라목 매핑표 신설** — **입주권·분양권은 §99①2호라
  §164⑨ 대상 아님**(신규 발견, C-06c anchor) · **U3 `redevelopment_apt` 목 판정 미확정 → P7 착수 차단**.
  P3b(컴패니언) 신설.
- **rev.6** (2026-07-16): **STEP 1 자가검토 4-way 병렬 완료** — 57건 병합(Critical 10·High 16), 전건 코드 실측 검증 후 반영.
  주요: **D7 메커니즘 정정**(조기 반환 단독 → **API `:256` 포함 이중 차단막**) + **API 형태로 재측정해
  86,784,934원 유지**. **§2-3을 1호 전용으로 한정** + 2호 2후보 유도 분리. **§4-1 트랙을 2축 매트릭스**로
  (토지 공매 미정의 해소). **§4-3 dual-truth**(deriveFromCompensation) 신규. **§4-5 result 타입 재설계**.
  **N1의 B-1 형태를 정책상 제거**(→Q6). **D15 PHD 경로** 신규(split보다 먼저 분기). **⑫ Zod 3곳**
  (`parcelSchema` 누락 발견). **`AuctionBlock` 별도 컴포넌트**(ExpropriationBlock은 `isExpropriation` 전용).
  `auctionKind` 삭제(3→2필드) · split 4→2필드(`splitPair` 재사용). **"과다" 미실증 단정 → "추정" 표기 분리**.
  C-14 재기술(정의상 불가 → `m ≥ A`). Q4·Q5·Q6 신규. rev.2~5의 사실 오류 2건 정정
  (`parcelMode` 미참조 주장 · 컴패니언 "침묵 strip" 주장). PR 3분리.
- **rev.5** (2026-07-16): 사용자 결정 Q1~Q3 반영(별도 불리언 · B-2 · X3 별건).
- **rev.4** (2026-07-16): D10 표현 정밀화 — 삭제 불가 ∧ 유지=미지원 갭 ∧ 정답=시점별 분기.
- **rev.3** (2026-07-16): D10 조사 착지 — §164⑨ 전신 1996.1.1. 신설, 문언 시점별 상이.
- **rev.2** (2026-07-16): D7 다필지 실증 → 최우선. §3-0 "호출부 1곳" 구조적 핵심. B안 채택.
- **rev.1** (2026-07-16): 최초. S2 오진 정정 → §164⑨ 전면 정합으로 범위 재정의.
