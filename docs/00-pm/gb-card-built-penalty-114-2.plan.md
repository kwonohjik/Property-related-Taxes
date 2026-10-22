# 일반건물 카드 조립 × 「소득세법」 §114조의2 환산·감정가액 5% 가산세 — 본인 신축 + 증여자 신축 수정 계획서 (PR-5)

**상태**: Plan 초안 (2026-10-23) — 사용자 결정 §11 Q-8~Q-14 대기. 구현 금지(계획서까지).
**브랜치**: `docs/gb-card-self-donor-built-114-2-plan` (origin/master 8a720d11e 기준)
**상위 계획**: `docs/00-pm/carryover-donor-built-114-2.plan.md` (PR-1~4 머지: #2430·#2433·#2440·#2443). 그 §10 PR-5(M6)와 §17 「Q-7 (a)」(일반건물 부담부증여 M9/F27 제외)를 이어받는다. 사용자 지시(2026-10-23): **본인 신축과 증여자 신축을 일반건물 카드 조립에서 함께 검토**한다.
**상위 계획의 사용자 확정 결정은 재론하지 않는다**: D1 거주자=신분 개념(증여자 포함) · 5년 기산=신축자(증여자면 증여자) 신축일 · D4 건물분만(토지 제외) · R2 이월과세는 A 채택일 때만 · Q-6 b 양도가액 건물분은 법정 서열.

---

## 0. 한 줄 요약

일반건물(토지+건물 일괄)은 엔진 입력이 **토지·건물 카드로 이미 나뉘어** 있어 D4(건물분만)가 카드 구조로 충족된다 — 일체 주택용 Q-2 안분(H·L·N)이 필요 없다. 실측한 결과 「본인 신축 가산세가 아예 없는」 경로는 **일반건물 부담부증여(§159) 환산(K-5)·감정(K-7)** 뿐이고(환산·지분·함께 양도·증축은 이미 붙는다, 실가 경로는 실지거래가액이라 대상이 아니라 0이 정답), 증여자 신축은 **일반건물 건물 카드의 이월과세**(비부담부증여 M6, 부담부증여 F27)가 입력·엔진·⑫ 모두 막혀 있다. 설계는 (a) 비부담부증여 이월과세는 PR-1~3이 만든 **엔진 후크(`withDonorBuiltPenalty`)를 건물 카드에 그대로 태우고**(게이트 `general_building_unit` 허용 + base=`scenarioA.acquisitionPrice`), (b) 부담부증여는 카드 조립(`buildActualGeneralBuildingCards`)에서 **카드 단위 §114조의2 신호**(`penaltyAxis`+신축일)를 싣는 두 갈래다. **본인 신축 K-5/K-7은 기존 계산이 바뀐다(가산세가 새로 붙어 세액 증가)** — §5에 수치.

---

## 1. 법령 (KoreanLaw MCP 원문 확인 2026-10-23, 소득세법 MST 280405 · 시행 2026-01-01)

- §114조의2①: 「거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에 한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액(증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 제92조제3항제2호에 따른 양도소득 결정세액에 더한다」 — ②: 산출세액이 없어도 적용.
- §97의2①1호: 취득가액은 배우자·직계존비속이 취득할 당시의 §97①1호 금액. §97의2②3호: 결정세액 비교(가산세 前 §92③2호).
- 증여자 신축분·일반건물 부담부증여에 대한 **정면 해석례는 확인하지 못했다**(상위 계획 V-4와 동일) — 본인 신축 부담부증여는 조심2019서3934(단건, 신축자=양도자)가 선례이고 일반건물 직접 해석례는 미확인 → 결과 고지에 「확인 필요」 유지.

---

## 2. 현행 실측 — 일반건물 경로별 §114조의2 (throwaway probe, mock 세율)

probe: `scratchpad/dnb5/g2·g3·g4·e1·e2·h1·u1.probe.ts` (route `POST` 직접 호출 + 카드 조립 함수 직접 호출). 공통 픽스처: 토지 100㎡·양도시 200만/㎡·건물 양도시 기준시가 2억·총 양도가 10억(→ 토지 5억/건물 5억), 취득시 토지 100만/㎡·건물 1억, 양도일 2026-03-01.

### 2.1 코드 구조(왜 그런가)

| 구조 | 근거 |
|---|---|
| 모든 일반건물 경로(단독·지분 축 B·함께 양도·증축)가 **카드 → `buildProperties` 한 곳**에서 엔진 item이 된다 | `app/api/calc/transfer/general-building-route-cards.ts:158-302` (지분·컴패니언은 `general-building-part-cards.ts:76-` `buildGbPartCards` → 같은 `buildProperties`) |
| 환산 경로(A, `actualPriceMode≠true`)의 건물 카드: `isSelfBuilt`는 `buildingAcquisitionCause==="newConstruction"`에서 도출, 신축일=`buildingAcquisitionDate`, base=`estimatedBase`(환산)/`penaltyAxis`(감정) | `general-building-valuation.ts:561-585`, `cards.ts:220-234`; 증축 건물2: `general-building-extension.ts:589-618` |
| 실가 경로(B, `actualPriceMode===true`)의 모든 카드: `usedEstimatedAcquisition:false`·`estimatedBase:0`·`isSelfBuilt`/`buildingAcquisitionDate`/`penaltyAxis` **없음** | `general-building-route-actual.ts:402-438` — 두 파트가 **실지거래가액**이라 §114조의2(「감정가액 또는 환산취득가액」) 대상이 아님 → 0이 **정답** |
| 단 **부담부증여(§159)** 는 실가 경로로 가면서도 K-5(환산)·K-7(감정)을 쓸 수 있다 — 같은 카드 조립이 K-5/K-7 신호를 **버린다** | `route-actual.ts:255-295`(breakdown은 만들지만 카드엔 신호 없음) · `route-helper.ts:152-157`(BG는 환산 경로로 새지 않게 실가 경로) |
| 이월과세 건물 카드: `card.carryoverTaxation`→ 단건 엔진 `calcCarryoverScenarios`(카드별 A/B) → PR-1 후크 `withDonorBuiltPenalty`가 `propertyType==="general_building_unit"`을 **거부** | `cards.ts:271-273` · `transfer-tax-carryover-donor-penalty.ts:93-94`(`주택·건물에만 적용`) |
| ⑫: GB 파트 wire는 PR-1이 **명시 거부**(침묵 strip 방지) | `transfer-tax-building-schemas.ts:105`(`carryoverPartShape.donorBuilt: donorBuiltRejectedKey`), `:369·:374`(`rejectDonorBuiltRefine`) |
| 입력 UI: 토글 술어가 일반건물을 제외 | `lib/calc/donor-built-scope.ts:33` (`assetKind` housing/building만) |

### 2.2 경로별 실측표 (붙는다 / 안 붙는다 / 틀린 base)

| ID | 경로 (route 직접 호출) | 현행 §114조의2 | 실측 | 판정 |
|---|---|---|---|---|
| A1 | 환산 · 본인 신축 2022-01-10 · 건물 환산 | **붙는다** | 건물 pen 12,500,000 / base 250,000,000 (총납부 154,852,000→+) | 정상 |
| A2 | 〃 신축 2020-01-10(5년 초과) | 안 붙음 | 0 | 정상(경계) |
| A3 | 환산 경로 · 건물 **감정** 300M · 본인 신축 | 붙는다 | pen 15,000,000 / base 300,000,000 | 정상(라벨은 §7 별건) |
| A4 | 증축(건물2) 본인 증축 100㎡·환산 | 붙는다(증축 부분만) | pen 2,222,222 / base 44,444,444 | 정상 |
| A4b | 증축 85㎡ | 안 붙음 | 0 | 정상(경계) |
| SH1 | 지분 60%만 본인 신축(축 B) | 붙는다 | building#0 pen 7,500,000 / base 150,000,000 | 정상 |
| CP1 | 함께 양도(컴패니언) GB 본인 신축 | 붙는다 | building pen 6,000,000 / base 120,000,000 | 정상 |
| B1 | **실가**(actualPriceMode) · 본인 신축 | 안 붙음 | 0 | **정상**(실지거래가액은 비대상) |
| **G1** | 일반건물 **부담부증여 K-5(환산)** · 본인 신축 2022-01-10 | **안 붙는다** | 가산세 0 · determined 58,891,000 · total 64,780,100 | **누락** (단건 building 같은 조건은 S1: pen 12,500,000) |
| **G2** | 〃 **K-7(감정)** | **안 붙는다** | 0 · total 63,317,100 (단건 S2: pen 7,500,000) | **누락** |
| A5 | 환산 경로 · 건물 이월과세(donor 환산, 증여자 신축 입력 불가) | 안 붙는다 | 가산세 0 · scenarioA.acquisitionPrice 250,000,000 · A 채택 · total 285,945,000 | 증여자 신축 **입력 경로 없음** |
| A6 | A5 + `buildingCarryoverTaxation.donorBuilt` | 400 거부 | `…donorBuilt: 이 입력 경로(토지·건물 파트 / 일반건물 파트)의 증여자 신축·증축 가산세는 아직 지원하지 않습니다` | PR-1 의도된 거부 |
| B2 | 실가 경로 · 건물 이월과세(donor 환산) | 안 붙는다 | 0 · scenarioA.acquisitionPrice 250,000,000 | 입력 경로 없음 |
| **A7** | **증축(3-way) + 원건물 이월과세(donor 환산)** | 안 붙는다 + **별건 결함** | scenarioA.acquisitionPrice **0**(A5는 250,000,000) → A 채택, 결정세액 347,493,120 | §10.2 (본 계획 범위 밖, 발견) |
| H1 | (별건) 비이월 **일체 주택**·건물 단독 본인 신축 환산 | 붙는다(주택은 **토지 포함 base**) | housing pen 25,000,000 / base **500,000,000** · building 동일(건물 단독은 정상) | §10.1 Q-12 |

**「본인 신축 가산세가 아예 없는」 경로의 정확한 범위** = **일반건물 부담부증여(`transferType==="burdened_gift"`) 중 시가 모드 K-5(환산)·K-7(감정)** 한 곳이다(G1·G2). 그 밖의 일반건물 경로에서 0인 것은 ① 실지거래가액(B1) 또는 ② 요건 불충족(A2·A4b)이라 정상이다. 일반건물 부담부증여 증축은 UI가 토글을 숨기므로(`GeneralBuildingAcquisitionCards.tsx:299`) 신축만 다룬다 — 단 서버/⑫가 증축×부담부증여를 막는지는 미확인(V-3).
증여자 신축은 일반건물 이월과세 **전 경로**(A5·B2·지분·컴패니언·F27)가 입력·엔진 모두 없다.

### 2.3 채널 동작 확인(Pre-Do emulation, 구현 없이 카드에 필드를 직접 주입)

| 주입 | 결과 |
|---|---|
| E1 이월과세 건물 카드(A5)에 `isSelfBuilt+penaltyDonorBuilt+penaltyAxis{estimated,250M}+constructionDate 2022-01-10` | 건물 pen **12,500,000**, 결정세액 불변(259,950,000), 총납부 285,945,000→299,695,000 (+13,750,000) |
| E2 신축일 2020-12-31(5년 초과) | pen 0 |
| E3 `card.carryoverTaxation.donorBuilt` 직접 | 엔진 `assertDonorBuiltInput`이 `general_building_unit`을 던진다 — 후크 게이트가 설계 변경 지점 |
| E-K5 / E-K7: 부담부증여 카드(G1·G2)에 `isSelfBuilt+constructionDate+penaltyAxis` 주입 (base=채무안분 후 건물분: K-5 125,000,000 / K-7 150,000,000) | K-5 pen **6,250,000**(총납부 64,780,100→71,655,100, +6,875,000) · K-7 pen **7,500,000**(63,317,100→71,567,100, +8,250,000) · 결정세액 불변 |

즉 **finalize STEP 10.5·aggregate 합산은 코드 변경 없이 GB 카드에서 동작**한다(상위 계획 §3.4와 같은 결론). 바뀌는 곳은 카드 신호·게이트·입력 파이프라인뿐이다.

---

## 3. 설계

### 3.1 원칙
- D4는 카드 구조로 충족: **건물 카드에만** 신호를 싣고 토지 카드(`land`·`land_business`·`land_nbl`)는 어떤 경우에도 싣지 않는다.
- 이월과세는 **A 채택일 때만**(R2): 비부담부증여는 기존 후크가 보장, 부담부증여(F27)는 route 비교에서 채택 시나리오 A의 호출에만 싣는다. 비교는 가산세 前 결정세액(`aggregated.determinedTax`)이라 가산세를 실어도 채택이 바뀌지 않는다(E1·E-K5 결정세액 불변으로 실측).
- 본인 신축 vs 증여자 신축 **이중 부과 방지는 입력 구조로 배타**: 건물 취득원인은 단일 선택(`newConstruction` XOR `carryover_gift`)이라 같은 카드에 둘이 공존할 수 없다. 그래도 ⑫에서 `buildingAcquisitionCause==="newConstruction"`+`donorBuilt` 동시 입력은 거부(PR-4의 `refineBgDonorBuilt` 동형).
- 신호 신설을 최소화: 비부담부증여 이월과세는 **새 카드 신호 없음**(엔진 후크 재사용). 부담부증여만 카드 신호 1개.

### 3.2 PR-5a — 일반건물 이월과세(비부담부증여) × 증여자 신축 (M6)

| 계층 | 변경 |
|---|---|
| 엔진 | `assertDonorBuiltInput` 게이트: `propertyType` 허용에 `general_building_unit` 추가. 일체 주택 `housing` 분기는 불필요(GB는 카드가 건물분). base: 신축은 기존 `건물 단독` 분기(`detail.scenarioA.acquisitionPrice`, swap 前 값), 증축은 기존 `calculateEstimatedAcquisitionPrice(transferPrice, extStd, standardPriceAtTransfer)` — 카드의 `transferPrice`=건물 양도가액(법정 서열 `allocateBundledTransferPrice` 결과, Q-6 b 자동 충족), `standardPriceAtTransfer`=`standardPriceAtTransferForCarryover`(건물 양도시 기준시가)로 이미 주입됨(`cards.ts:284-291`). 후크·finalize·loss-return·aggregate 합산은 **0줄 변경**. 파일 `transfer-tax-carryover-donor-penalty.ts` 433줄 → +~8줄. |
| ⑭ | `composeGbCarryover`(`general-building-entry.ts:56-109`)의 `fromPart`·`legacy` 두 갈래 모두에서 `donorBuilt.constructionDate`를 `toEngineDonorBuilt`(`lib/api/donor-built-engine-input.ts`)로 Date 변환 — 한 갈래만 빠지면 `Date<string` 침묵 false(상위 §6 ⑭ 교훈). 이 파일은 서버 전용 의존 금지라 `donor-built-engine-input`(date-coerce만 import)만 쓴다. |
| ⑫ | `buildingCarryoverTaxation`(`building-schemas.ts:374`)과 `buildingCarryoverPart`(`:105` 계열)에서 **거부 → 수용 전환**, 토지 쪽은 거부 유지. 수용 형태는 PR-4의 `bgDonorBuiltShape` 선례처럼 `housing` 금지 `.strict()`. 추가 refine: ① 환산(`useEstimatedAcquisition`)일 때만 ② `buildingAcquisitionCause==="carryover_gift"` ③ **3-way(`extensionInfo`) 동시 입력 거부**(§10.2 선결) ④ `isSelfBuilt`(newConstruction) 동시 거부 ⑤ 신축일 ∈ [증여자 취득일, 증여 등기접수일]. `transfer-tax-building-schemas.ts` 749줄이므로 새 shape·refine은 `transfer-tax-schema-donor-built.ts`(186)에 두고 이쪽은 참조만(+≤10줄). |
| ④ | `buildPart`/`buildEngineShaped`(`transfer-tax-api-gb-carryover.ts:73-128`)에 `donorBuilt` 중첩 객체 추가(토글 OFF·환산 OFF·범위 밖 stale은 미전송). `PART_SCALE`·`ENGINE_SHAPED_SCALE`(`Record<keyof …, boolean>`)에 새 키를 **false**로 분류 — 키 누락은 tsc가 막는다. 지분(축 B)은 지분마다 자기 valuation이라 별도 로직 불필요. 입력 원천은 건물 파트 서브폼 `asset.buildingCarryover`의 기존 `donorBuilt*` 8칸(PR-2가 `CarryoverTaxationForm`에 이미 추가; 일체 주택 3칸은 미사용) — 폼 ①②③ **변경 없음**(`normalizeCarryoverForm`이 구 세션 OFF 복원). |
| 술어 leaf | `lib/calc/donor-built-gb-scope.ts` 신설(~30줄): `donorBuiltGbApplicable(asset)` = 일반건물 + 건물 파트 이월과세(`gbBuildingAcquisitionCause==="carryover_gift"`, `buildingCarryover` 또는 토지 이월과세 연동) + 부담부증여 아님 + 환산 ON·`general` 방식(`carryoverEstimationModeSupported`) + 증축(`gbHasExtension`) 아님. ⑤·⑧·④가 같은 술어. `donor-built-scope.ts:33`의 일반건물 제외는 그대로(상호배타). |
| ⑤ | `CarryoverGiftBlock.tsx`의 기존 마운트(`:273`) 옆에 `<CarryoverDonorBuiltSection mode="gb">` — `part==="building"`일 때만(분리 OFF `GbBuildingCarryoverCard`와 분리 ON 건물 카드가 둘 다 이 컴포넌트를 `part="building"`으로 재사용: `GeneralBuildingAcquisitionCardsParts.tsx:316`, `GeneralBuildingAcquisitionCards.tsx:628` 부근). `CarryoverDonorBuiltSection`은 `mode` 4번째 값 + 술어 분기 + 일체 주택 칸 비노출. |
| ⑧ | `validateGbCarryover`(`transfer-tax-validate-gb-carryover.ts:80-` 건물 파트 환산 블록 뒤)에 `validateDonorBuiltGb`: 구분·신축일 필수, 신축일 범위, 증축이면 바닥면적·증축 부분 기준시가 필수, 환산 OFF/증축 동시/범위 밖은 요구하지 않음(토글 OFF 취급). 규칙은 `transfer-tax-validate-donor-built*.ts` 선례를 재사용. |
| ⑦ 결과 | 건물 카드의 `carryoverTaxationDetail.donorBuiltPenalty`(PR-1 echo) 는 이미 카드 단위로 산출된다. GB 결과뷰는 `result.carryoverTaxationDetail` 단일 접점이 아니라 `aggregated.properties[]`를 읽으므로(§7) 카드 echo 수집 leaf 필요. |

### 3.3 PR-5b — 일반건물 부담부증여 K-5/K-7 × **본인 신축** (M9의 본인 신축, 기존 계산이 바뀜)

핵심: `buildActualGeneralBuildingCards`가 이미 `breakdown`(채무안분 후 건물분 취득가액·`acquisitionMethodUsed`)을 만든다. 단건 `runBurdenedGiftStep`(`transfer-tax-burdened-gift-step.ts:100-205`)과 **같은 규칙**을 카드에 옮긴다.

| 계층 | 변경 |
|---|---|
| 카드 타입 | `AssetCardForAggregate`에 선택 필드 `penalty114?: { axis:{acquisitionMethod:"estimated"\|"appraisal"; base:number}; constructionDate: Date; donor?: true }` 1개(`types/general-building.types.ts` 742줄 — 타입 전용 예외 구간이나 ≥750 위험 접근, +~12줄 → ~754: 신규 타입은 `general-building-penalty-signal.types.ts`로 두고 카드 타입은 참조 1줄만). |
| 카드 조립 | `general-building-route-actual.ts`의 건물 카드(`:428-438`) 직전에 신호 산출(순수 함수, 신규 leaf `general-building-bg-penalty-signal.ts` ~50줄 — actual.ts는 626→~640): 조건 = `burdenedGiftInfo` + `breakdown.acquisitionMethodUsed ∈ {converted, appraisal}`(담보평가 승으로 기준시가가 강제된 경우 1h-G1-2 제외) + `buildingAcquisitionCause==="newConstruction"` + 신축일 존재. base: **K-5 = `convertedAcquisitionBeforeSwap?.building ?? perAsset.building.acquisitionPrice`**(W-6 단서 前 값), **K-7 = `perAsset.building.acquisitionPrice`**. 증축은 GB 부담부증여에서 UI가 숨기므로 신축만; 증축 입력이 서버에 오면 `buildingType`을 싣지 않고 거부(V-3 확정 후). |
| `buildProperties` | `cards.ts:218-234` 근처: `card.penalty114`가 있으면 `isSelfBuilt:true`·`constructionDate`·`buildingType:"new"`·`penaltyAxis`를 싣는다(기존 감정 모드 `penaltyAxis`는 이 값이 없을 때만). `acquisitionMethod`를 `"appraisal"`로 싣지 말 것(`calcTransferGain` 감정 분기가 카드 `expenses`를 0으로 덮는 G-2 — `cards.ts:221-224` 주석). 토지 카드는 `isBuilding` 가드로 불가. |
| ⑫ | 신규 wire 없음(`buildingAcquisitionCause`·`buildingAcquisitionDate`는 이미 실가 payload에 있음: `transfer-tax-api-gb.ts:545-548`). |
| ⑧ | 신규 필수 없음. 신축일 필수는 기존 `transfer-tax-validate-gb.ts:546` 유지. K-5/K-7 필수 입력은 기존 BG ⑧. |
| ⑤ | 신규 입력 없음. **배지** `gbPenaltyBadgeMethod`(`GeneralBuildingAcquisitionCardsParts.tsx:55-62`)가 BG에서 항상 null(`u1` 실측: 부담부증여 K-5/K-7/K-4 모두 null)이라, 엔진이 붙이게 되면 BG K-5→estimated, K-7→appraisal을 반환하도록 확장(안내 표시 전용·엔진 leaf `buildingPenaltyMethodApplies` 재사용). |
| ⑥ 사이드바 | 변경 없음(가산세는 사이드바 합계에 안 들어간다 — 상위 PR-2와 동일). |
| 결과 | §7. |

### 3.4 PR-5c — 일반건물 부담부증여 × 이월과세(F27) × **증여자 신축** (M9의 증여자 신축, 선택)

`general-building-route-carryover.ts:90-103`의 **A 호출 payload에만** 증여자 신축 정보를 실어 PR-5b의 신호 leaf가 `donor:true`·증여자 신축일로 산출하게 한다(B 호출은 그대로 — R2, B 채택·배제 시 가산세 없음). 입력 위치는 PR-4와 같은 `burdenedGiftInfo.carryoverDonorBasis.donorBuilt`(`bgDonorBuiltShape` 재사용, `housing` 금지), 술어 `donorBuiltBgApplicable`(`donor-built-bg-scope.ts:18-`)에 `general_building` 허용 추가(현행 housing/building만), `buildDonorBuiltBgPayload`·`validateDonorBuiltBg`·⑫ `refineBgDonorBuilt` 확장. 신축일이 카드의 `acquisitionDate`(증여자 취득일, LTHD용)와 달라 별도 필드(`penalty114.constructionDate`)가 필요하므로 PR-5b 설계가 전제다. 일반건물 부담부증여 × 이월과세 × 환산/감정 × 증여자 신축 5년 이내는 매우 드문 조합이라 **Q-10에서 포함 여부를 묻는다**.

### 3.5 재사용 요약
`penaltyAxis` 채널(finalize `:325-326`·loss-return `:104-105`) · `calculateBuildingPenalty`·`resolveExtensionPenaltyBase` · PR-1 leaf `transfer-tax-carryover-donor-penalty.ts`(5a) · PR-2 표시 정본 `transfer-tax-carryover-donor-display.ts`(5a·5c) · PR-4 `bgDonorBuiltShape`·`donorBuiltBgApplicable`(5c) · 단건 `runBurdenedGiftStep`의 K-5/K-7 base 규칙(5b·5c).

---

## 4. 케이스 매트릭스

| ID | 경로 | 현행 | 변경 | PR |
|---|---|---|---|---|
| N1 | GB 환산·단독·본인 신축/증축·감정 | 붙음 | **변화 0** | — |
| N2 | GB 지분(축 B)·함께 양도 본인 신축 | 붙음 | 변화 0 | — |
| N3 | GB 실가·본인 신축 | 0(정답) | 변화 0 | — |
| M6a | GB 건물 이월과세(환산 donor)·2-way·단독 | 가산세 입력 불가 | donorBuilt ON·A 채택·5년 내 → 건물 카드 환산취득가 5% | 5a |
| M6b | M6a 지분(축 B) | 〃 | 지분 카드별 자기 donorBuilt(지분마다 valuation) | 5a |
| M6c | M6a 함께 양도(컴패니언) | 〃 | 컴패니언 GB도 `buildGbCompanionItems`로 같은 카드 → 자동. ⑫ 컴패니언 shape(`carryoverTaxationEngineShape`)은 이미 donorBuilt 수용이라 GB wire만 전환 | 5a |
| M6d | M6a 증축(3-way) | donor 환산 취득가 0 결함(A7) | **본 계획에서 거부 유지** | 선결(§10.2) |
| M6e | M6a 실가 경로(B) 건물 이월과세 | 불가 | 엔진·⑫ 동일, 카드 형태 동일 → 동작(B2 실측 A.acq 250M) | 5a |
| M6f | B 채택(②3호)·②1호·②2호·③ 배제 + donorBuilt | — | 가산세 0 + 중립 안내(PR-1~2 후크가 이미 처리) | 5a |
| M9a | GB 부담부증여 K-5·본인 신축·5년 내 | 0(누락) | 건물분 환산(W-6 前) 5% | 5b |
| M9b | GB 부담부증여 K-7·본인 신축·5년 내 | 0(누락) | 건물분 감정가액 5% | 5b |
| M9c | GB 부담부증여 K-1~K-4·K-6 | 0 | 변화 0(조문 비대상) | — |
| M9d | GB 부담부증여 × 이월과세(F27) × 증여자 신축 K-5/K-7 | 입력 불가 | A 채택 호출에만 | 5c |
| M9e | GB 부담부증여 지분·컴패니언 | route가 `burdenedGiftInfo` 미전달 또는 ⑫ 거부 | 범위 밖(V-4) | — |

---

## 5. 현행 대비 세액 변화 (⚠️ 기존 계산이 바뀌는 셀 — 사용자 확인 필요)

mock 세율 기준 상대값. 지방소득세 10% 포함 총납부 기준.

| 셀 | 현행 | 구현 후 | 차이 | 성격 |
|---|---|---|---|---|
| **M9a** GB 부담부증여 K-5 · 본인 신축 2022-01-10 · 양도 2026-03-01 (base 125,000,000) | 64,780,100 | 71,655,100 | **+6,875,000** (가산세 6,250,000 + 지방소득세 625,000) | **기존 입력의 세액이 오른다**(본인 신축 가산세가 신규로 붙음). 결정세액 58,891,000 불변 |
| **M9b** 〃 K-7 감정 (base 150,000,000) | 63,317,100 | 71,567,100 | **+8,250,000** (7,500,000 + 750,000) | 〃 |
| M6a 이월과세 건물 환산 donor · 증여자 신축 입력 ON · 신축 2022-01-10 | 285,945,000 | 299,695,000 | +13,750,000 (12,500,000 + 1,250,000) | 신규 입력 ON일 때만(기본 OFF → 기존 입력 불변) |
| M6a 〃 신축 2020-12-31(5년 초과) | 285,945,000 | 285,945,000 | 0 | 경계 |
| M6f B 채택 | 불변 | 불변 | 0 | R2 |
| N1~N3, M9c | — | — | 0 | 회귀 0 |

- M9a·M9b는 **저장된 이력/세션에 일반건물 부담부증여 + 건물 신축 + K-5/K-7**가 있으면 **재계산 시 총납부가 늘어난다**(가산세가 법 §114조의2에 따라 새로 반영되는 정정). 입력 칸은 늘지 않는다(⑧ 신규 차단 없음). 결과 화면에 적용 고지(「일반건물 부담부증여 K-5/K-7에서 §114조의2 가산세를 적용했습니다 — 조심2019서3934(단건)에 의하며 일반건물 정면 해석례는 확인 필요」)를 싣는다.
- 증여세·§97의2 비교·채택·결정세액은 모든 셀에서 불변(가산세는 §92③3호 총결정세액 쪽).

---

## 6. 14 동기화 지점 · ⑧↔⑫ 격자

| # | 5a (이월과세 비BG) | 5b (BG 본인 신축) | 5c (F27 증여자) |
|---|---|---|---|
| ① 폼 | 변경 없음(기존 `buildingCarryover.donorBuilt*` 8칸) | 없음 | 없음(`carryover.donorBuilt*` 재사용) |
| ② initial | 없음 | 없음 | 없음 |
| ③ normalize | 없음 | 없음 | 없음 |
| ④ | `transfer-tax-api-gb-carryover.ts` donorBuilt 중첩 + SCALE 표 분류 | 없음 | `buildDonorBuiltBgPayload` 일반건물 허용 |
| ⑤ | `CarryoverDonorBuiltSection mode="gb"` + `donor-built-gb-scope.ts` | 배지 확장 | `donorBuiltBgApplicable` 확장 |
| ⑥ | N/A | N/A | N/A |
| ⑦ | 카드 echo 수집·라벨(§7) | 〃 | 〃 |
| ⑧ | `validateDonorBuiltGb` | 없음 | `validateDonorBuiltBg` 일반건물 |
| ⑨⑩ | N/A | N/A | N/A |
| ⑪ | N/A | N/A | N/A |
| ⑫ | 건물 파트 수용 전환(+refine, land 거부 유지) | 없음 | `bgDonorBuiltShape` 경로 일반건물 허용 + 이중 입력 거부 |
| ⑬ | 점검(`generalBuildingValuation` 서브객체째 spread — 신규 키 자동 통과 확인) | — | `burdenedGiftInfo` 째 |
| ⑭ | `composeGbCarryover` 두 갈래 Date 변환 | — | 스키마 transform(PR-4 방식) |

**⑧↔⑫ 격자(5a)**

| 조건 | ⑤ | ⑧ | ⑫ | 엔진 |
|---|---|---|---|---|
| 토글 ON·구분/신축일 미입력 | 필수 표시 | 차단 | 차단 | throw |
| 신축일 ∉ [증여자 취득일, 증여 등기접수일] | — | 차단 | superRefine | throw |
| 증축인데 바닥면적 ≤0 / 증축 부분 기준시가 ≤0 | — | 차단 | 차단 | 게이트 |
| 환산 OFF(실가 승계) + donorBuilt | 비노출 | 무시(미전송) | 거부 | throw |
| 증축(3-way) 동시 | 비노출 | 무시 | 거부 | — |
| 건물 취득원인이 이월과세 아님(`newConstruction` 포함) | 비노출 | 무시 | 거부 | — |
| 토지 파트(`landCarryover*`) donorBuilt | 비노출 | — | 거부(유지) | throw |
| 부담부증여 | 비노출 | 무시 | 거부 | throw(기존 가드) |

3중 패턴: 신규 필드는 UI display fallback·API fallback이 없고(자동 채움 금지) 신축일은 증여자 취득일/건물 취득일로 **채우지 않는다**. 5b는 입력 변경이 없어 fallback 이슈가 없다.

---

## 7. 결과 4뷰 · 고지

- 합산은 이미 반영: GB 결과는 `aggregated.properties[].penaltyTax/penaltyBase`를 합산(`BundledAllocationSubCards.tsx:164-167`·`:255-263`). 숫자 수정 불필요.
- **표시 정본**: PR-2의 `transfer-tax-carryover-donor-display.ts`(`donorBuiltPenaltyView`)를 재사용하되, 그 접점 `resultDonorBuiltEcho(result)`는 `result.carryoverTaxationDetail`/`splitDetail`만 읽는다. GB는 카드(properties)에 echo가 있으므로 **`gbResultDonorBuiltEchoes(aggregated)`**(건물 카드의 `carryoverTaxationDetail.donorBuiltPenalty` 수집) leaf를 신설해 카드·상세명세서·신고서·PDF가 같이 쓴다(확인 필요: GB가 4뷰에서 어떤 어댑터를 타는지 — `DetailedStatementLateStages.ts:176-199`가 「집계·건별 어댑터」 경로로 `resultDonorBuiltEcho(result)`를 호출. 어댑터 result에 echo가 실리는지 PR-5a Pre-Do로 실측).
- 5b(본인 신축 BG)는 증여자 echo가 아니라 **본인 신축**이라 신규 echo 불필요하지만 라벨이 필요: 카드 행 `· 환산취득가액 가산세 … = 건물 환산취득가 X × 5%`(`BundledAllocationSubCards.tsx:262`)가 **고정 문구**라 감정가액(A3·K-7)이면 틀린 라벨이다(현행에도 존재하는 표시 결함 — Q-13). base·방식·신축자(본인/증여자)를 per-card `penaltyEcho`(방식·신축일)로 받아 라벨을 파생한다.
- 고지 3종: (i) 증여자 신축 적용(`DONOR_BUILT_APPLIED_NOTICE` 재사용), (ii) B 채택·배제 중립 안내(`DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE` 재사용 — 자산 전체 이월과세에 없던 고지가 GB에도 필요), (iii) 5b 적용 고지(신규 문구, 「정면 해석례는 확인 필요」).
- `TransferTaxResultView.tsx`(790줄)는 건드리지 않는다.

---

## 8. 800줄 정책 (`wc -l` 실측 2026-10-23)

| 파일 | 줄 | 변경 | 판정 |
|---|---|---|---|
| `lib/tax-engine/transfer-tax-carryover-donor-penalty.ts` | 433 | +~8 | 여유 |
| `app/api/calc/transfer/general-building-route-actual.ts` | 626 | +~15(신호 호출만; 로직은 신규 leaf) | ≤700 유지 |
| `app/api/calc/transfer/general-building-route-cards.ts` | 377 | +~10 | 여유 |
| `app/api/calc/transfer/general-building-route-carryover.ts` | 120 | 5c +~15 | 여유 |
| `lib/tax-engine/general-building-entry.ts` | 304 | +~6 | 여유 |
| `lib/tax-engine/types/general-building.types.ts` | 742 | +~3(타입은 별 파일) | 위험구간 — 신규 타입 별 파일 |
| `lib/api/transfer-tax-building-schemas.ts` | 749 | ≤+10 | 새 shape는 `transfer-tax-schema-donor-built.ts`(186)에 |
| `lib/calc/transfer-tax-api-gb-carryover.ts` | 369 | +~20 | 여유 |
| `lib/calc/transfer-tax-validate-gb-carryover.ts` | 108 | +~25 | 여유 |
| `components/calc/transfer/CarryoverGiftBlock.tsx` | 414 | +~8 | 여유 |
| `components/calc/transfer/CarryoverDonorBuiltSection.tsx` | 217 | +~25 | 여유 |
| `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` | 724 | **0** | 마운트는 `CarryoverGiftBlock`/`Parts`에서 |
| `components/calc/results/BundledAllocationSubCards.tsx` | 333 | +~20 | 여유 |
| 신규 | `general-building-bg-penalty-signal.ts`(~50) · `donor-built-gb-scope.ts`(~30) · `general-building-penalty-signal.types.ts`(~15) · `gbResultDonorBuiltEchoes`(~30) | | |

---

## 9. PR 분할 · Pre-Do anchor

선결(별건, 사용자 결정 Q-11): **PR-0** 증축×건물 이월과세×환산 donor 취득가액 0 결함(§10.2) — 수정 또는 ⑧ 차단. 5a는 3-way를 거부하므로 PR-0 없이도 착수 가능하나 결함은 남는다.

| PR | 범위 | 핵심 anchor |
|---|---|---|
| **5a** | 엔진 게이트 + ⑭ + ⑫ + ④ + ⑤ + ⑧ + 결과 echo(GB) | A5·B2 + donorBuilt → pen 12,500,000 · 신축 2020-12-31 → 0 · ②3호 B 채택 → 0 + 중립 안내 · 증축 85/85.01 · 토지 카드 pen 0 · 3-way/환산 OFF/`newConstruction` 동시 → 거부 · donorBuilt 부재 회귀 0(A5 현행 285,945,000) · 지분·컴패니언 · ⑧↔⑫ 격자 |
| **5b** | 신호 leaf + 카드 필드 + `buildProperties` + 배지 + 라벨/고지 | G1 → pen 6,250,000(+6,875,000) · G2 → 7,500,000(+8,250,000) · 신축 아님/5년 초과/시행일 전(환산 2018·감정 2020) → 0 · 담보평가 승(1h-G1-2) → 신호 없음 · K-1~K-4·K-6 → 0 · 토지 카드 0 · 단건 building 동조건(S1 12,500,000/S2 7,500,000) 불변 · W-6 단서 발동 시 base가 swap 前 값 |
| **5c** (선택) | F27 A 호출 한정 증여자 신축 | A 채택 → 가산세 / B 채택·배제 → 0 · 본인 신축(`newConstruction`) 동시 거부 |

각 PR 전 Pre-Do anchor 선작성, 회귀 0 격자(5a: 이월과세 GB 격자 donorBuilt 미전송 응답 JSON 해시 불변 / 5b: BG GB 격자에서 `newConstruction`이 아닌 모든 셀 해시 불변 + 신축 셀만 pen 추가), 뮤테이션 probe(백업 키 label+file md5 · 전 변경 파일 sha 전후 대조 — 상위 §16 교훈).

---

## 10. 관련 별건 (범위 결정 Q로만 올림)

### 10.1 일체 주택 **본인 신축** 환산 base가 토지 포함 전체 (상위 §3.3 관찰, Q-12)
- 실측(H1): housing 본인 신축 환산(양도가 10억·취득시 2억·양도시 4억) → penaltyBase **500,000,000**, pen 25,000,000. D4(건물분만)와 같은 쟁점이다.
- 건물분으로 바꾸려면 이월과세와 달리 본인 신축에는 토지·건물 분할 입력(취득 당시 L·N, 양도 당시 L_T·N_T, 양도가액 구분 Q-6 b)이 **전혀 없다** — 신설하면 ① 기존 저장 입력이 ⑧에 막히거나(자동 안분 fallback 금지) ② 새 필수 칸이 생긴다. 상위 픽스처(H=2억·L=1억·N=6천만, H_T=4억·L_T=2.4억·N_T=1.6억) 기준 base 187,500,000 → 가산세 **25,000,000→9,375,000(−15,625,000, 총납부 −17,187,500)**: 기존 계산이 **내려가는** 방향.
- 권장: **별건 계획서로 분리**(PR-5와 묶지 않음). 이유: 입력 신설·⑧ 영향·세액 감소 방향이라 PR-5(5b는 세액 증가, 입력 불변)와 위험 성격이 다르다. 상위 PR-1~2의 `housingBase`/`LandBuildingSaleSplitSection` 재사용 설계를 그대로 쓸 수 있다.

### 10.2 발견 결함: 증축(3-way) × 건물 이월과세 × 환산 donor → 증여자 취득가액 0 (D-X1)
- 실측 A7: 증축 + 원건물 `carryover_gift` + `useEstimatedAcquisition:true`(분자 1억 입력) → 건물1 `scenarioA.acquisitionPrice` **0**(A5 2-way는 250,000,000). 원인(코드): 환산 기준시가 주입 `applyCarryoverEstimationBasis`가 2-way 분기(`general-building-valuation.ts:625`)와 실가 경로(`route-actual.ts:480`)에만 있고 증축 분기(`general-building-extension.ts`, `buildGeneralBuildingAssetCardsWithExtension`)에는 없다. ⑧(`validateGbCarryover`)은 분자를 필수로 요구하는데 엔진이 버린다(입력 강제·미반영). 기존 anchor GX-1~4(`gb-carryover-card-wiring.anchor.test.ts`)는 **실가 donor**만 검증해 가렸다.
- 본 계획은 3-way를 거부로 격리하고 이 결함은 건드리지 않는다. 별건 수정 여부는 Q-11.

### 10.3 표시 결함(현행): 결과 카드 §114조의2 행 라벨이 항상 「환산취득가액」
`BundledAllocationSubCards.tsx:262` — 감정가액(A3)에서도 「환산취득가액 가산세 = 건물 환산취득가 × 5%」로 표기. 5b가 같은 행을 건드리므로 함께 정정(Q-13).

---

## 11. 사용자 결정 Q (권장안 포함)

| Q | 질문 | 권장 |
|---|---|---|
| **Q-8** | 일반건물 부담부증여 K-5/K-7 **본인 신축**에 §114조의2를 신설(= **기존 계산이 바뀌어 세액이 오른다**, §5 M9a +6,875,000 / M9b +8,250,000) 할 것인가 | **예(5b).** 단건 선례(조심2019서3934·`runBurdenedGiftStep`)와 같은 규칙이고 조문상 대상이다. 단 고지에 「일반건물 정면 해석례 확인 필요」 유지 |
| **Q-9** | 비부담부증여 일반건물 건물 이월과세 × 증여자 신축(M6)을 2-way·실가/환산 경로·지분·함께 양도로 열 것인가(증축 3-way는 제외) | **예(5a).** 엔진은 기존 후크 재사용이라 위험이 작다 |
| **Q-10** | F27(부담부증여×이월과세×일반건물) 증여자 신축(5c)을 이번에 함께 할 것인가 | **5b 완료 후 5c까지 진행**(신호 leaf 재사용, A 호출 한정이라 증분 작음). 빈도가 낮으니 보류도 가능 — 보류 시 ⑫ 명시 거부 유지 |
| **Q-11** | §10.2 결함(증축×이월과세×환산 donor 취득가액 0)을 PR-5와 별개로 먼저 고칠 것인가 | **PR-0로 먼저**(최소: ⑧에서 환산 donor×증축 차단, 이상적: 증축 분기에도 기준시가 주입). 사용자 확정 대기 |
| **Q-12** | §10.1 일체 주택 본인 신축 base를 건물분으로 바꿀 것인가 / PR-5와 묶을 것인가 | **바꾸되 별건 계획서로 분리**(입력 신설·세액 감소·⑧ 영향). PR-5에는 포함하지 않음 |
| **Q-13** | 결과 카드 §114조의2 행의 고정 「환산취득가액」 라벨(감정가액에서 오표기, §10.3)을 PR-5b에서 함께 정정할 것인가 | **예**(같은 행 수정, 표시 전용) |
| **Q-14** | 5b 적용 고지 문구: 「일반건물 부담부증여 K-5/K-7에서 §114조의2 가산세를 적용했습니다 … 정면 해석례는 확인 필요」로 할 것인가(기존 이력 재계산 시 세액이 오르는 점을 결과 화면이 알려 줌) | **예** |

---

## 12. 미확인·검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | GB 결과 4뷰(상세명세서·신고서·PDF)가 어댑터 경유 시 건물 카드의 `carryoverTaxationDetail.donorBuiltPenalty`를 `result`로 전달하는지(`DetailedStatementLateStages.ts:176-199`, `resultDonorBuiltEcho`) | 확인 필요 — 5a Pre-Do로 실측 |
| V-2 | `card.buildingAcquisitionDate`가 `constructionDate` 외에 결과 표시 등에서 쓰이는지(5c에서 증여자 신축일을 별도 필드로 두는 이유 검증) | 확인 필요 |
| V-3 | 서버 ⑫/⑧이 일반건물 **부담부증여 × 증축**(`extensionInfo`)을 막는지(UI는 토글 숨김) | 확인 필요 — 5b 착수 전 |
| V-4 | 일반건물 지분(`generalBuildingShares`)·컴패니언 + 부담부증여 조합: 지분 분기는 `burdenedGiftInfo`를 넘기지 않고(`route.ts:169-189`) 컴패니언 GB는 `generalBuildingValuation`만 넘김(`bundled-split-helpers.ts:715-721`) — 조용히 무시되는지 ⑫/⑧이 막는지 | 확인 필요(M9e 범위 밖 근거) |
| V-5 | 일반건물 `hasFirstDisclosure`(§99-164-10 환산주택가격)와 donor 환산 base의 상호작용 | 확인 필요 — 5a ⑫에서 동시 입력 거부 여부 결정 |
| V-6 | 상가(`commercial_building`) 본인 신축 환산 base가 건물분인지 | 이번 범위 밖·미확인 |
| V-7 | §114조의2 시행 부칙(환산 2018.1.1., 감정·증축 2020.1.1.)의 증여자 신축·부담부증여 적용 | 상위 V-4 승계 — 기존 게이트 재사용, 부칙 재대조 안 함 |
| V-8 | 법령 MST: 소득세법 280405(시행 2026-01-01) §114조의2·§97의2 원문 확인 | **확인 완료** |

---

## 13. 자가 점검

- [x] useEffect → store 미러링: 신규 입력 없음(5a는 기존 8칸 재사용, 모든 쓰기 `onChange`). 5b는 입력 없음.
- [x] 자동 안분 fallback 금지: 신축일은 증여자 취득일 등으로 채우지 않고 ⑧ 차단. 일반건물은 H 안분이 아니라 카드 구조라 안분 자체 없음. 일체 주택 본인 신축(10.1)은 입력 신설 + ⑧ 차단 전제로 별건.
- [x] ⑧ 동기화: §6 격자(5a) 작성 — 구현 시 전수 대조 필요.
- [ ] 14지점 grep(⑫⑬⑭), anchor, tsc, vitest, 브라우저 확인 — Do 단계 항목(이번은 계획서만).
