# 이월과세 × 증여자 신축·증축 건물 — 「소득세법」 §114조의2 환산·감정가액 5% 가산세 수정 계획서

**상태**: Plan 확정 (2026-10-22 사용자 최종 결정 반영 — §1 이력). §11 Q-1~Q-6 전부 확정, 남은 사용자 결정 없음. PR-1(엔진 + ⑫⑭) Do 진행.
**브랜치**: `fix/carryover-donor-built-114-2` (origin/master 1238c1b11 기준)
**선행 계획과의 관계**: `transfer-split-part-carryover-p6.plan.md` §6 Q3(a) 「증여자 신축 현행 유지(가산세 안 붙임)」는 **이 계획의 사용자 확정 결정(2026-10-22)으로 대체**된다. 그 계획의 「해석 확보 후 자산 전체 이월과세와 함께 바꾸는 별건」이 바로 이 문서다.

---

## 0. 한 줄 요약

이월과세(§97의2①)에서 증여자가 신축·증축한 건물을 5년 안에 양도하면서 증여자 취득가액을 **환산취득가액(또는 감정가액)** 으로 쓰면 §114조의2 가산세(해당 건물 환산·감정가액의 5%)를 붙인다. 현재는 **어느 경로에도 입력이 없고**(자산 전체·일반건물·부담부증여) 파트 이월과세(P6)만 「확인 필요」 고지가 있다. 가산세는 **이월과세가 실제로 적용(A 채택)되어 증여자 기준 환산·감정가액이 취득가액이 될 때만** 붙고, B 채택(②3호)·②1호·②2호·③ 배제처럼 수증자 취득가액을 증여 당시 상증법 평가액(영 §163⑨ 실지거래가액)으로 계산하는 경우는 붙지 않는다(R2 확정). 새 입력 `donorBuilt`(증여자 신축·증축 사실)를 이월과세 서브객체에 두고, 가산세는 **기존 `penaltyAxis` 채널**(finalize·손실 조기반환이 이미 읽는다)에 **A 채택 입력에만** 실어 보내므로 finalize·loss-return·aggregate·결과 4뷰의 합산 로직은 **거의 바뀌지 않는다**. 일체 주택의 건물분 base는 **개별주택가격을 토지·건물 기준시가 비율로 나눈 건물분**(저장소의 기존 S3-1 경로 `calcAcqStdPair`·`apportionByStdPrice`·`resolveTransferPriceSplit` 재사용)으로 구한다. 바뀌는 곳은 (1) 이월과세 해결자 3곳이 **A 채택 입력**에 축을 싣는 것, (2) 입력 파이프라인(14지점), (3) 고지 문구다.

---

## 1. 사용자 확정 결정 (2026-10-22 — 재론 금지)

「거주자」(소득세법 §1조의2①1호)는 신분 개념이라 증여자도 포함 → 이월과세에서 증여자가 신축·증축한 건물에도 §114조의2 적용.

| # | 결정 | 이 계획에서의 반영 |
|---|---|---|
| D1 | 5년 기산 = **증여자 신축일**(증축이면 증여자 증축일) ~ 양도일 | 새 입력 `donorBuilt.constructionDate` (§3.2) · 판정은 기존 `calculateBuildingPenalty` 재사용 |
| D2 | base = §97의2에 따라 계산한 **증여자 기준 환산취득가액(또는 감정가액)**, 증축은 증축 부분 | §3.3 base 표 |
| **D3 (최종 = R2)** | §92③ 구조상 ②3호 비교는 결정세액(2호, 가산세 前)이라 채택과 무관하다. 가산세는 **이월과세가 실제로 적용(A 채택)되어 증여자 기준 환산·감정가액이 취득가액이 될 때만** 붙인다. ②3호 비교로 B 채택, ②1호·②2호·③ 배제 등 **수증자 취득가액을 증여 당시 상증법 평가액(영 §163⑨ — 실지거래가액)으로 계산하는 경우는 가산세 없음** | §3.4·§3.5 · §5 실측 · §7 · §8 |
| D4 | **건물 부분에만** 적용(토지분 제외) | §3.3 — 일체 주택은 개별주택가격 토지·건물 비례 안분(**Q-2 확정**) |

**D3 이력**: 최초 확정 문구(2026-10-22 오전)는 「②3호 비교에서 가산세는 양쪽(A·B) 모두에 적용」이었고, 메인 세션은 이를 R1(같은 가산세를 A·B 결정세액에 똑같이 더해 비교 중립, 어느 쪽이 채택돼도 최종에 가산)로 읽었다. 이 계획서 초판은 R1로 작성하고 R2(A 채택에만)·R3(가산세 포함 총결정세액으로 비교)와 갈리는 셀을 실측해 Q-1로 올렸다. **사용자가 R2로 재확정했다**(같은 날 최종 결정). 초판의 R1 전제(B 입력에 `penaltyAxis` 주입, B 채택 시 「같은 금액을 더했다」 고지, 부담부증여 K-5 B base 고정 설계)는 이 문서에서 모두 제거했다. R1·R3 비교 표는 근거 이력으로 §5.1에 남긴다.

> 이 문서는 「적용할지」를 묻지 않는다. §11의 Q-1~Q-6은 사용자 최종 결정으로 모두 확정이다.

---

## 2. 법령 근거 (KoreanLaw MCP 원문 확인 2026-10-22)

| 조문 | 원문 요지 | 이 계획에서의 쓰임 |
|---|---|---|
| 소득세법 §114조의2① (MST 280405, 시행 2026-07-01 본 — 2026-01-01 본과 동일) | 「거주자가 건물을 신축 또는 증축(증축은 바닥면적 합계 85㎡ 초과에 한정)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 감정가액(증축은 증축한 부분) 또는 환산취득가액(증축은 증축한 부분)의 100분의 5를 **제92조제3항제2호에 따른 양도소득 결정세액에 더한다**」 | D1·D2. 「취득가액으로 하는 경우」 = 이월과세에서는 §97의2①1호가 정한 증여자 취득 당시 §97①1호 금액 |
| §114조의2② | 제92조제3항제1호 산출세액이 없어도 적용 | 양도차손·산출세액 0 경로(`loss-return`)에도 같은 축 필요 |
| §97의2①1호 | 취득가액은 배우자·직계존비속이 취득할 당시의 §97①1호 금액 | 증여자 환산/감정이 §114조의2의 「취득가액」이 되는 연결고리 |
| §97의2②3호 | 「제1항을 적용하여 계산한 양도소득 **결정세액**이 제1항을 적용하지 아니하고 계산한 양도소득 **결정세액**보다 적은 경우」 이월과세 배제 | Q-1 근거 — 비교 대상이 「결정세액」 |
| **소득세법 §92③** | 2호 **결정세액** = 산출세액 − §90 감면. **3호 총결정세액 = 2호 + §114조의2·§115·국기법 §47의2~4 가산세** | 🔑 §114조의2 가산세는 3호(총결정세액)에 속하고 ②3호는 2호(결정세액)를 비교한다 → **비교는 가산세와 무관**(§5.1). 코드도 이미 이 읽기다: `transfer-tax-aggregate-carryover-scope.ts:5-12`(비교 단위=§92③2호 결정세액)·`:60`(「결정세액(가산세 前 · §92③2호)」) · 단건 비교는 `finishScenarios`가 `determinedTax`(가산세 前)로 한다(`transfer-tax-carryover.ts:567-568`) |
| 소득세법 §1조의2①1호 | 「거주자」= 국내에 주소를 두거나 183일 이상 거소를 둔 개인 | D1~D4의 전제(사용자 확정). 증여자 신분 판정 입력은 만들지 않는다 |
| 소득세법 시행령 §162①4호 | 자기가 건설한 건축물의 취득시기 = 건축법 §22② 사용승인서 교부일(사실상 사용일·임시사용승인일이 빠르면 그날) | 신축일 입력 칸의 안내 문구 근거. 증여받은 자산의 취득시기는 5호(증여일)라 **수증자가 아니라 증여자의 신축일**이 따로 필요한 이유 |
| 소득세법 §99①1호 (MST 280405) | 가목 토지=**개별공시지가**, 나목 건물=건물의 신축가격·구조·용도·위치·신축연도 등을 고려해 **국세청장이 산정·고시**하는 가액, 라목 주택=**개별주택가격·공동주택가격**(부수토지를 포함한 결합 공시) | Q-2: 주택 공시가격 H는 부수토지 포함 일체이므로 건물분을 따로 구해야 한다 |
| 소득세법 §100② 후단 · 영 §166⑥ (MST 290841) | 토지·건물 가액 구분이 불분명하면 「취득 또는 양도 당시의 기준시가 등을 고려」해 안분(영 §166⑥ → 「부가가치세법 시행령」 §64①1호) | Q-2: 양도가액의 건물분 안분 = 양도 당시 토지:건물 기준시가 비율. 저장소 `resolveTransferPriceSplit`이 구현 |
| 영 §164③ | 새 기준시가가 고시되기 전에 취득·양도하면 직전 기준시가 | Q-2: 증여자 취득 당시·양도 당시 각 시점의 직전 고시분을 쓴다 |
| 조심2016중0801 (재결례 967652, 2016.6.1., 양도) | 「주택 전체는 개별주택가격을 우선 적용할 수 있지만, **주택가액을 토지가액으로 안분하는 경우에는 국세청 고시 규정**을 적용」 — 건물 기준시가는 건축물대장상 연면적으로 산정 | Q-2: 주택가액을 토지·건물로 나누는 안분이 인정되는 구조이고, 그때 건물 기준시가는 국세청 고시 산식(사용자가 입력) |
| 조심2019서3934 (기존 계획서 인용) | 부담부증여 신축 건물 환산 5% 가산세 적법 — **신축자 = 양도자**인 사안 | 증여자=양도자 경로(K-5/K-7)는 이미 구현. 이번 범위(증여자≠양도자)의 직접 해석례는 없음 — 고지에 반영(§7) |

> **Q-2 산식(사용자 최종 결정, 재론 금지)**: 「주택 공시가격을 토지공시가격(개별공시지가×면적)과 건물기준시가의 비율로 나누어 계산한 값이 토지·건물 기준시가가 된다」. 즉 건물분 기준시가 = 주택공시가격 × 건물기준시가 ÷ (토지공시가격 + 건물기준시가). 법령 직접 명문은 §99①1호·§100②·영 §166⑥의 구조까지이고, 「H를 가목:나목 비율로 나눈다」는 구체 산식은 저장소가 양도소득세 집행기준 99-164-9·조심2016중0801·기재부 재산세제과-802에 근거해 이미 구현한 S3-1 경로다(`transfer-tax-split-acq-price.ts:33-39` 주석). 이번에 새로 만드는 산식이 아니라 **그 경로를 증여자 취득 당시·양도 당시에 적용**하는 것이다.

시행일 게이트(환산: 양도일 ≥ 2018-01-01, 감정: ≥ 2020-01-01, 증축: ≥ 2020-01-01 + 85㎡ 초과)는 기존 `buildingPenaltyMethodApplies`/`calculateBuildingPenalty`(`transfer-tax-building-penalty.ts:28-69`(note `:63-67`))를 그대로 쓴다. 이 부칙을 증여자 신축에 대해 다시 대조하지는 않았다 → V-4.

---

## 3. 현행 실측과 설계

### 3.1 현행 — 왜 증여자 신축이 가산세를 못 붙이는가 (file:line)

| 지점 | 현행 | 근거 |
|---|---|---|
| ④ 입력 억제 | `selfBuiltActive`가 `acquisitionCause === "purchase"`만 허용 → 이월과세 자산은 `isSelfBuilt`·`constructionDate`가 엔진에 안 간다 | `lib/calc/self-built-scope.ts:36-45`, 사용처 `lib/calc/transfer-tax-api.ts:422-425` |
| 폼 | 이월과세 서브폼 `CarryoverTaxationForm`에 신축·증축 필드 없음. 증여자 취득원인(`donorAcquisitionCause`)은 「참고 표시 전용」 | `lib/stores/calc-wizard-asset-carryover.ts:33-50` |
| 일반건물 | `isSelfBuilt`는 `gbBuildingAcquisitionCause === "newConstruction"`에서만 true → 이월과세 건물 카드는 항상 false | `lib/calc/transfer-tax-api-gb.ts:501,687` (인벤토리 조사) |
| 엔진 시나리오 | A 입력은 `{...rawInput}`을 퍼뜨릴 뿐 증여자 신축 정보를 모른다 | `lib/tax-engine/transfer-tax-carryover.ts:207-243` |
| 엔진은 막지 않는다 | 취득원인을 보지 않으므로 API 직접 호출로 `isSelfBuilt:true`를 보내면 **수증자 기준** 값으로 붙을 수 있다(막는 곳은 ④뿐) | `transfer-tax-building-penalty.ts:42` |
| P6 파트 | 건물 파트 환산을 하고도 가산세는 안 붙이고 「확인 필요」 고지만 | `transfer-tax-split-carryover-display.ts:274-277`, `p6.plan.md:88-91` |
| 부담부증여 | 이월과세 × 감정가액 × 본인 신축이면 **throw**(기산점·base 미정이라는 사유) | `transfer-tax-carryover-burdened-gift.ts:152-165`, anchor `burdened-gift-carryover-presumed.anchor.test.ts` G-4·G-4b |
| 자산 전체 | **고지도 없다** — `donor` 신축 관련 `확인 필요` 문구는 P6 파트와 겸용 부담부증여 차단문뿐(grep) | `lib/tax-engine/transfer-tax-split-carryover-display.ts:274`, `mixed-use-burdened-gift-prepare.ts:196` |

### 3.2 입력 모델 — `donorBuilt` (새 필드 vs 재사용 판단)

`CarryoverTaxationInput`(엔진)·`CarryoverTaxationForm`(폼)에 **중첩 선택 객체**를 둔다(`carryoverTaxation` Zod가 이미 13필드 parity 규약이라 객체 1개로 묶는 편이 ⑫ 누락 면적이 작다).

| 필드 | 의미 | 필수 조건 |
|---|---|---|
| `donorBuilt.buildingType` | `"new"` 신축 / `"extension"` 증축 | 토글 ON |
| `donorBuilt.constructionDate` | 증여자의 신축 취득일(영 §162①4호 사용승인일 등) 또는 증축 완공일 | 토글 ON |
| `donorBuilt.extensionFloorArea` | 증축 바닥면적 합계(㎡) | 증축 |
| `donorBuilt.extensionStdPriceAtAcquisition` | 증축 부분의 증여자 취득(완공) 당시 기준시가 총액 | 증축 |
| `donorBuilt.housing` (일체 주택·건물분 산정용 묶음, 아래 표) | 개별주택가격을 토지·건물로 나누는 입력 | `propertyType: housing`(토지+건물 일체 공시) 일 때만 |

`donorBuilt.housing`(Q-2 확정 — 종전 (b) 「건물분 기준시가 1칸」 안은 폐기):

| 시점 | 필드 | 의미 | 비고 |
|---|---|---|---|
| 증여자 취득 당시 | 주택공시가격 H | 기존 환산 입력 `donorStandardPriceAtAcquisition`(총액) **재사용** | `transfer-tax-api-carryover.ts:96-112` general 모드 |
| 〃 | `landPricePerSqmAtAcquisition` · `landArea` | 토지 기준시가 L = ㎡당 개별공시지가 × 면적 | `calcLandStdPriceAtAcq`(`transfer-tax-split-acq-mode.ts:324`) |
| 〃 | `buildingStdPriceAtAcquisition` | 건물 기준시가 N(국세청 고시 산식 — 조심2016중0801) | |
| 양도 당시 | 주택공시가격 H_T | 기존 `donorStandardPriceAtTransfer` **재사용** | |
| 〃 | `landStdPriceAtTransfer` · `buildingStdPriceAtTransfer` | 양도 당시 토지 L_T·건물 N_T 기준시가 — B_tr 안분과 S_b의 기준시가 basis에 **둘 다** 쓰인다 | 항상 필수(양쪽 > 0) |
| 〃 (Q-6 b) | `sale.landTransferPrice` · `sale.buildingTransferPrice` | 계약서 토지·건물 **구분 기재**(`saleSplitMode: "actual"`) | 구분 기재 → §100③ 30% 판정 |
| 〃 | `sale.landAppraisalAtTransfer` · `sale.buildingAppraisalAtTransfer` | 양도 당시 **감정평가가액**(`"appraisal"`) — 양쪽이 모두 있어야 채택 | 기준시가보다 우선 |
| 〃 | `sale.saleSplitExemption` | 영 §166⑧ 예외(`other_law`·`demolished_land_only`) | 선택 |

**Q-6 (b) 입력 경로 확정 (V-9 해소 — file:line)**
- **폼 칸은 기존 자산 수준 칸을 재사용한다(신규 폼 칸 없음)**: `saleSplitMode`(`lib/stores/calc-wizard-asset-split-acq.ts:107`) · `landAppraisalAtTransfer`/`buildingAppraisalAtTransfer`(`:115,117`) · `saleSplitExemption`(`:127`) · `landTransferPrice`/`buildingTransferPrice`(`:135,137`) · `landStandardPriceAtTransfer`/`buildingStandardPriceAtTransfer`(`:147,149`). 일체 주택 자산 전체 이월과세는 split 경로가 아니라서 이 칸들이 지금은 **화면에도 body에도 없다**(`isSplitPayloadActive` 거짓 — `lib/calc/transfer-tax-api-split.ts:79-100`).
- **UI는 기존 컴포넌트를 재사용한다**: 축 A 양도가액 섹션 `LandBuildingSaleSplitSection`(`components/calc/transfer/LandBuildingSaleSplitSection.tsx`, 144줄 — 이미 `CarryoverPartsSaleAxis.tsx:49`·`CompanionAcqDateSection.tsx:282`·`LandPartCauseBlock.tsx:32`가 같은 방식으로 마운트). `saleStdPlacement()`(`transfer-tax-split-acq-mode.ts:420`)는 항상 「축 A」라 양도시 기준시가 카드가 같이 열린다.
- **전송(④)은 최상위가 아니라 `donorBuilt.housing`의 중첩 객체로 한다**: 최상위에 `landTransferPrice` 등을 실으면 split 경로(`calcSplitGain`)·다른 소비자와 섞인다. 기존 ④ 빌더(`transfer-tax-api-split.ts:142-288`의 `saleDirectActive`·감정·예외 게이트)의 sale 부분집합을 함수로 뽑아 `donorBuilt.housing.sale`에 채운다(PR-2). 엔진 leaf는 이 중첩 값으로 합성 입력을 만들어 `resolveTransferPriceSplit`을 호출한다(PR-1).
- ⑧은 기존 규칙을 같은 술어로 재사용한다: `validateSaleStdAndAppraisal`(`transfer-tax-validate-split-sale-std.ts:30`) · `saleAppraisalIsBasis`(`:26`) · `needsSaleStdPart`(`transfer-tax-split-acq-mode.ts:438`).

**기존 필드를 재사용하지 않는 이유(분리 판단)**
1. 최상위 `isSelfBuilt/buildingType/constructionDate`를 재사용하면 **수증자(양도자)의 신축**과 의미가 섞인다. 수증자는 증여받았으므로 신축할 수 없다(영 §162①5호 — 취득시기는 증여일). A·B 두 시나리오가 `{...rawInput}`을 공유해서 B(수증자 기준)까지 증여자 신축일을 읽는 오류 경로가 생긴다. 게다가 `selfBuiltActive`·`housing-flag-reset`·부담부증여 가드가 이 필드를 「매매 취득 + 본인」 전제로 읽는다(`self-built-scope.ts:36-45`, `housing-flag-reset.ts:69`).
2. `donorAcquisitionDate`와도 분리한다 — 증축은 취득일(원 건물)과 증축일이 다르고, 일체 주택은 `donorAcquisitionDate`가 토지 선취득일일 수 있다. **자동 채움 금지**(정책: 자동 안분·fallback 금지). ⑧은 `donorAcquisitionDate ≤ donorBuilt.constructionDate ≤ giftRegistryDate`만 검사한다 (Q-3 확정).
3. 증여자 취득원인 `donorAcquisitionCause`는 「참고 표시 전용」이라(`calc-wizard-asset-carryover.ts:50`) 게이트로 쓰지 않는다. 대신 토글 노출 조건 = `useEstimatedAcquisition && 건물성 자산(housing|building|일반건물 건물 카드)`.

### 3.3 base 규칙 (D2·D4) — 경로별로 「건물분」을 어떻게 얻는가

| 경로 | 게이트(§114조의2) | base | 근거 |
|---|---|---|---|
| 비주택 건물 단독(`propertyType: building`) 환산(general) | 증여자 환산 | 증여자 환산취득가액 전체(`donorAcqPrice`) = 양도가 × 증여자 취득시 기준시가 ÷ 양도시 기준시가 | `transfer-tax-carryover.ts:164-174`. 건물 단독이라 토지 없음. 증축은 `양도가 × donorBuilt.extensionStdPriceAtAcquisition ÷ 양도시 기준시가`(`resolveExtensionPenaltyBase` `building-penalty.ts:83-103`와 같은 식) |
| **일체 주택**(토지+건물 일체 기준시가) 환산 | 〃 | **Q-2 확정**: ① 취득 당시 건물분 `B_acq = H − floor(H × L ÷ (L+N))` ② 양도 당시 건물분 `B_tr = H_T − floor(H_T × L_T ÷ (L_T+N_T))` ③ 건물 양도가액 `S_b` = `resolveTransferPriceSplit`의 법정 서열(구분 기재 → §100③ 30% 판정 → 감정평가 → 양도 당시 기준시가 비율 `양도가 − floor(양도가 × L_T ÷ (L_T+N_T))`, **Q-6 b**) ④ **base = `calculateEstimatedAcquisitionPrice(S_b, B_acq, B_tr)`** (= S_b × B_acq ÷ B_tr). 증축은 분자 `B_acq` 자리에 증축 부분 취득(완공) 시 기준시가를 넣는다 | **재사용 헬퍼(전부 기존)**: ①`calcAcqStdPair` 주택 비-별개 분기(`transfer-tax-split-acq-price.ts:93-119`) 또는 `apportionByStdPrice`(`std-price-apportion.ts:20`) 직접 · ②`calcSplitAcquisitionPrice`의 양도시 안분과 같은 호출(`:507-512`) · ③`resolveTransferPriceSplit`(`transfer-tax-split-sale-price.ts:71`, 서열 전체를 그대로 연결: 구분 기재 있음→§100③ `judgeDeemedUnclearSplit`, 없음→`resolveBasis` 감정>기준시가) · ④`calculateEstimatedAcquisitionPrice`(`tax-utils.ts:385`, `calcPartAcquisitionPrice` `:234-239`가 쓰는 같은 식). 절사 규약(토지 floor·건물 잔액 흡수)이 기존 split 경로와 한 함수라 갈라지지 않는다 |
| 일체 주택, PHD/APD 환산 | — | **도달 불가로 보고 차단**: 신축·증축 후 5년 이내 양도 + 양도일 ≥ 2018 ⇒ 신축일 ≥ 2013, 개별주택가격 최초공시(2005~)·공동주택(2005~) 이후다. ⑧이 phd/apd 모드면 토글 비노출·엔진 거부 | 추정이 아니라 날짜 산술이지만 최초공시일은 사용자 입력이라 완전 보증은 아님 → ⑧에서 모드 상호배타로 차단 |
| split 파트(P6) 건물 파트 환산 | 파트 `partEstimated` | 건물 파트 환산취득가(`SplitPartResult.acquisitionPrice`) — 증축은 `splitExtensionPenaltyBase`와 같은 식으로 증축 부분 | `building-penalty.ts:161-203`. 이미 「건물 파트가 판정 축」 |
| 일반건물 건물 카드 환산 | 카드가 환산 이월과세 | 건물 카드의 증여자 환산취득가(카드 자체가 건물 파트) | `general-building-valuation.ts:316-331`(분자=증여자 취득시 기준시가, 분모=그 파트 양도시 기준시가), 카드 매핑 `general-building-route-cards.ts:208-227` |
| 부담부증여 × 이월과세 K-5(환산) | A 시나리오 | 채무비율 안분 **후** 건물 환산취득가(`building.acquisitionPrice` 또는 W-6 swap 전 `convertedAcquisitionBeforeSwap`) | 기존 `transfer-tax-burdened-gift-step.ts:144-205`(`isK5SelfBuilt`) |
| 부담부증여 × 이월과세 K-7(감정) | A 시나리오 | 안분 후 건물 감정가액(증축은 `presumedExtensionAppraisalValue` 안분) | 〃 `:106-170`(`isAppraisalSelfBuilt`) |
| 자산 전체 이월과세 + **증여자 감정가액** | — | **입력 자체가 없다**(증여자 취득가액은 실가 1칸 또는 환산 3모드). 이번 범위에서 신설하지 않음 → **Q-4** | `calc-wizard-asset-carryover.ts:45-60` |

**대표 셀 실측(probe p6, 기존 헬퍼를 실제 호출)**: H=2억(㎡당 100만 × 100㎡ → L=1억, N=6천만), H_T=4억(L_T=2.4억, N_T=1.6억), 양도가 10억.
- `calcAcqStdPair` → 토지분 125,000,000 · **건물분 B_acq = 75,000,000**
- 양도 당시 `apportionByStdPrice(4억, 2.4억, 1.6억)` → 토지 240,000,000 · **건물 B_tr = 160,000,000**
- `resolveTransferPriceSplit` → 토지 600,000,000 · **건물 S_b = 400,000,000** (basis=std_price)
- **base = 400,000,000 × 75,000,000 ÷ 160,000,000 = 187,500,000 → 가산세 9,375,000**
- 참고(폐기된 (a) 일체 전체 환산): 10억 × 2억 ÷ 4억 = 500,000,000 → 25,000,000 (토지분 포함, D4 위반)
- 증축(증축 부분 취득시 기준시가 1,500만 가정): S_b × 15,000,000 ÷ B_tr = 37,500,000 → 1,875,000. ⚠️ 분자(증축 부분, 나목 척도)와 분모(H 비례 건물분)의 척도가 다르지만 이는 기존 분리 취득 경로 `splitExtensionPenaltyBase`(`building-penalty.ts:~190`)와 **같은 관행**을 따른 것이다 → V-9.

> 관찰(범위 밖, 수정 안 함, **별건 유지**): 비이월 **일체 주택** 신축 환산은 현재 **자산 전체(토지 포함) 환산취득가**가 base다. 실측: 양도가 10억·취득시 2억·양도시 4억 → penaltyBase 500,000,000(probe p4). 이월과세 경로는 위 Q-2 산식으로 건물분만 쓰므로 비이월 쪽과 불일치가 생기지만 이번 계획은 **이월과세 경로만** 다루며, 비이월 쪽은 별건으로 남긴다.

### 3.4 엔진 주입 방식 — 기존 채널 재사용 (실측 근거)

finalize STEP 10.5와 loss-return은 이미 `splitBuildingAxis ?? input.penaltyAxis ?? effectiveInput.penaltyAxis`를 읽고(`transfer-tax-finalize.ts:325-326`, `transfer-tax-loss-return.ts:104-105`) 게이트는 `effectiveInput`의 `isSelfBuilt/constructionDate/buildingType/extensionFloorArea`를 읽는다. 따라서 **A 채택 입력**(`workingInput = adoptedInput`, `transfer-tax-precalc.ts:177-198`)에 아래를 싣기만 하면 정상 경로·손실 경로·aggregate 합산이 그대로 작동한다.

```
adoptedInput += { isSelfBuilt: true, buildingType, constructionDate(=donorBuilt.constructionDate),
                  extensionFloorArea, penaltyAxis: { acquisitionMethod: "estimated"|"appraisal", base } }
```

실측으로 채널이 동작함을 확인했다(§5): A 채택 입력에 필드를 심으면 비주택 셀 penaltyTax 25,000,000, 일체 주택 건물분 셀 9,375,000이 붙는다(probe p1·p6). 초판에 있던 「B 채택 입력에 `penaltyAxis`만 심는」 경로(probe p5)는 R2 확정으로 **쓰지 않는다**. **finalize·loss-return·aggregate 코드는 변경하지 않는다**(회귀 면적 최소). 한 가지 예외 — 파트 이월과세(P6)는 `resolveSplitBuildingPenaltyAxis`가 **원본 `input`**(`building-penalty.ts:161`, finalize `:325`)의 `buildingType`을 읽어 증축 base를 정하므로 증축×파트 환산은 `effectiveInput`을 읽게 하는 1줄 수정이 필요하다(§4 M4, V-3).

신규 leaf: `lib/tax-engine/transfer-tax-carryover-donor-penalty.ts` (순수 함수)
- `resolveDonorBuiltPenaltyAxis(ctx)` → `{ axis, patch }`: 게이트(`donorBuilt` 존재 · 환산/감정 · 건물성) · base 계산(§3.3 표 — 일체 주택은 위 ①~④ 기존 헬퍼 호출) · 증축 85㎡·미입력 오류.
- `applyDonorBuiltPenalty(input, axis)` → 채택 입력 사본.
- 후크: `transfer-tax-carryover.ts` `finishScenarios` 꼬리(`:567-587`) — **`adoptedScenario === "A"`일 때만** `inputAFinal`에 적용, B 분기(`inputB`)는 손대지 않는다 · `transfer-tax-split-carryover.ts` 6단계 `adoptedInput`(`:289`) · 부담부증여 A(`transfer-tax-carryover.ts:238-275`) · 일반건물 카드는 단건 엔진을 그대로 타므로 자동. `transfer-tax-carryover.ts`가 688줄이라 **본문에는 후크 호출 10줄 미만만** 넣는다(§9).

### 3.5 ②3호 비교와 B 채택 (D3 = R2 확정)

- **비교는 바뀌지 않는다.** 가산세는 §92③3호(총결정세액)에 속하고 ②3호는 §92③2호(결정세액)를 비교하므로, 가산세를 붙이든 안 붙이든 비교 값(`determinedTax`, 가산세 前)과 채택 결과는 현행과 **모두 같다**. 기존 코드의 읽기도 이미 그렇다(§2 표).
- **가산세는 A 채택일 때만 붙는다.** B가 채택되면(②3호 포함) 수증자 취득가액은 증여 당시 상증법 평가액(영 §163⑨, 실지거래가액)이므로 §114조의2의 「감정가액·환산취득가액을 취득가액으로 하는 경우」에 해당하지 않는다. 적용배제가 이월과세를 확정한 경우(②1호 수용 · ②2호 1세대1주택 · ③ 기간·관계 부적격 — `transfer-tax-carryover.ts:120-145`, `:534-549`의 조기 반환)도 같다.
- 구현은 B 분기를 **아예 건드리지 않는 것**이다(후크가 `adoptedScenario === "A"`에만 걸린다). 다건 `scenarioOverride`(신고단위 비교)가 A를 강제해도 같은 A 경로를 탄다.
- 입력은 받았는데 B가 채택돼 가산세가 안 붙는 경우를 사용자에게 설명한다(§7 중립 안내 한 줄).

---

## 4. 케이스 매트릭스 — 영향 경로 전수

(「경로 인벤토리」는 코드 판독 기준이며 실행 검증은 안 했다. 확인 못한 것은 V-n으로 올렸다.)

| ID | 경로 | carryover_gift 열림 | 현행 | 변경 | PR |
|---|---|---|---|---|---|
| M1 | 단건 비주택 건물(`building`) 자산 전체 환산 | 열림 `CompanionAcquisitionCauseSection.tsx:44`, ④ `transfer-tax-api.ts:706` | 가산세 없음 | 신축·증축 모두. base = 증여자 환산취득가 | 1·2 |
| M2 | 단건 일체 주택(`housing`) 자산 전체 환산 general | 열림 | 가산세 없음 | Q-2·Q-6(b): `donorBuilt.housing` 입력(L·N·L_T·N_T + 구분 기재·감정·예외 `sale`)으로 건물분 base — 기존 `apportionByStdPrice`·`resolveTransferPriceSplit` 재사용. 폼 칸·`LandBuildingSaleSplitSection` UI는 기존 것을 재사용(§3.2) | 1·2 |
| M3 | 일체 주택 PHD/APD 환산 | 열림 | — | 토글 비노출·⑧/엔진 차단 | 1·2 |
| M4 | 주택 split 파트 이월과세 B(건물만)·C(통째) 환산 | `LandPartCauseBlock.tsx:52,63`, `transfer-land-part-cause.ts:119` | 고지만 | 건물 파트 환산취득가 base. 증축은 `effectiveInput` 판독 | 3 |
| M5 | split 토지만(A) · 건물은 본인 취득 | 열림 | 변화 없음 | **대상 아님**(토지는 §114조의2 제외, 건물은 본인 신축 경로 그대로) | — |
| M6 | 일반건물(`general_building`) 건물 카드 환산 | `GeneralBuildingAcquisitionCards.tsx:72,520,545,655`, ④ `transfer-tax-api-gb-carryover.ts:299` | 가산세 없음(`isSelfBuilt`가 newConstruction 한정, `transfer-tax-api-gb.ts:501,687`) | 카드 `carryoverTaxation.donorBuilt`가 단건 엔진 후크를 탄다. 카드 매핑이 `donorBuilt`를 보존하는지 확인 필요 | 5 |
| M7 | 부담부증여 × 이월과세 K-5(환산) | `transfer-tax-validate-bg.ts:159` | 본인 신축 플래그만 | A 입력에 증여자 신축 → 기존 step 분기를 탄다. **B 채택이면 가산세 없음(R2)** 이라 B(K-5)의 별도 base 설계가 필요 없다 | 4 |
| M8 | 부담부증여 × 이월과세 K-7(감정) | 〃 | **throw**(`carryover-burdened-gift.ts:152-165`) | throw를 「`donorBuilt` 없이 본인 신축 플래그만 온 경우」로 좁혀 유지, `donorBuilt`가 있으면 통과. G-4·G-4b 반전 | 4 |
| M9 | 일반건물 부담부증여 × 이월과세(F27) | `general-building-route-carryover.ts:63` | 가산세 없음 | 카드 2회 호출 중 **A 호출에만** 증여자 신축 정보 전달(B 호출은 종전 그대로) — 구조가 달라 PR-4 안에서 별도 확인 | 4 |
| M10 | 함께 양도(컴패니언) 이월과세 자산 | `transfer-tax-schema-companion.ts:278` | 억제 | 컴패니언 ④·⑫·`bundled-split-helpers.ts:625` Date 변환에 `donorBuilt` 추가 | 2 |
| M11 | 연간 다건(multi) | **차단**(`multi-transfer-tax-validate.ts:147-149`, 직접 확인) | — | 영향 없음. 단 단건 route의 함께 양도·일반건물 카드가 쓰는 aggregate는 가산세를 자산별로 합산(`aggregate.ts:395,437,617`)하므로 자동 | — |
| M12 | 겸용주택 · 상가(commercial) · 분양권 · 재개발 입주권 | UI 열림(분양권·재개발은 ⑧ 경로 차이) | 엔진이 이월과세를 읽는지 확인 못함 | **범위 제외** — 건물 신축 사실이 의미 없는 권리이거나 엔진 미연결. 토글 노출 게이트에서 제외(`selfBuiltSectionApplicable`와 같은 종류 술어 재사용) | V-2·V-3 |
| M13 | 양도차손·산출세액 0 | — | — | §114조의2② — `loss-return`이 같은 채널을 읽어 자동 | 1 |
| M14 | 5년 경계 | — | — | 신축일 +5년 당일 **포함**, 다음 날 제외(§5.3 실측) · 2/29 신축은 `addYears`가 2/28 | 1 |
| M15 | 증축 85㎡ | — | — | 85.00 제외, 85.01 포함(§5.3) | 1 |
| M16 | 실지취득가액 승계 · 5년 초과 · 증여자 신축 아님 · **B 채택/적용배제** | — | 변화 0 | **회귀 0 대상**(§8) | — |

---

## 5. 현행 대비 세액 변화 실측 (throwaway probe — `scratchpad/dnb/p1~p6.ts`)

mock 세율(상대 비교만 의미). **probe는 구현이 없으므로 A 채택 입력에 §3.4 필드를 직접 심어 엔진 채널의 결과를 본 것**이다 — 구현이 같은 숫자를 재현하는 것이 Pre-Do anchor(§10)다.

### 5.1 D3 = R2 — 채택별 최종 세액 (자산 전체 · 비주택 건물 · 증여자 환산 5억 · 신축 2022-01-10 · 양도 2026-03-01)

표는 **결정세액 + §114조의2 가산세**(지방소득세 제외). p = 25,000,000(= 5억 × 5%).

- **R2 (최종 확정)**: 비교는 가산세 前, 가산세는 **A 채택일 때만**.
- (이력) R1: 채택과 무관하게 가산 — 초판 권장안, 기각. R3: 가산세 포함 총결정세액으로 비교 — 문언(§92③2호) 불일치.

| 증여 당시 평가액(B 취득가) | A 결정세액 | B 결정세액 | **R2 채택 / 최종 (확정)** | R1 최종 (기각) | R3 채택 / 최종 (기각) |
|---|---|---|---|---|---|
| 5.0억 | 154,852,000 | 199,000,000 | B / **199,000,000** | 224,000,000 | B / 199,000,000 |
| 5.4억 | 154,852,000 | 183,000,000 | B / **183,000,000** | 208,000,000 | B / 183,000,000 |
| 5.6억 | 154,852,000 | 175,000,000 | B / **175,000,000** | 200,000,000 | A / 179,852,000 |
| 5.8억 | 154,852,000 | 167,000,000 | B / **167,000,000** | 192,000,000 | A / 179,852,000 |
| 6.0억 | 154,852,000 | 159,000,000 | B / **159,000,000** | 184,000,000 | A / 179,852,000 |
| 6.2억 이상 | 154,852,000 | ≤151,000,000 | A / **179,852,000** | 179,852,000 | A / 179,852,000 |

읽는 법
- R2에서 **채택(A/B)은 현행과 모든 셀에서 같고**, B 채택 셀의 최종 세액도 현행과 같다(차이 0). 달라지는 것은 **A 채택 셀에 가산세 p가 붙는 것**뿐이다.
- R3만 채택이 뒤집힌다(5.6~6.0억) — ②3호의 「결정세액」이 아니라 §92③3호 총결정세액을 비교하는 읽기라 기각.
- R2는 정책 메모(`feedback_no_unfavorable_application_without_legal_basis`: 불리한 적용에는 명문 근거)와도 충돌하지 않는다 — 가산세는 §114조의2가 말하는 「감정가액·환산취득가액을 취득가액으로 하는 경우」(A)에만 붙는다.

### 5.2 현행 대비 총 납부세액 변화 (R2 기준, 지방소득세 포함 — 대표 셀)

| 셀 | 현행 총납부 | 구현 후(R2) | 차이 | 가산세 base |
|---|---|---|---|---|
| 자산 전체 · 비주택 건물 · **A 채택** (평가액 8억) | 170,337,200 | 197,837,200 | +27,500,000 (가산세 25,000,000 + 지방소득세 2,500,000) | 500,000,000 (환산 전체) |
| 자산 전체 · **일체 주택 건물분(Q-2)** · **A 채택** (평가액 8억) | 170,337,200 | 180,649,700 | +10,312,500 (가산세 9,375,000 + 지방소득세 937,500) | 187,500,000 (건물분만) |
| 〃 참고: 폐기된 (a) 일체 전체 환산 base | 170,337,200 | 197,837,200 | +27,500,000 | 500,000,000 (토지 포함 — D4 위반) |
| 자산 전체 · ②3호 **B 채택** (평가액 5억) | 218,900,000 | 218,900,000 | **0** | — (가산세 없음) |
| P6 건물 파트 · **A 채택** (증여자 건물 환산 1억) | 170,997,200 | 176,497,200 | +5,500,000 | 100,000,000 (건물 파트만, 토지 제외) |
| P6 건물 파트 · **B 채택** | 243,870,000 | 243,870,000 | **0** | — |

일체 주택 셀은 **실제 기존 헬퍼(`calcAcqStdPair`·`apportionByStdPrice`·`resolveTransferPriceSplit`·`calculateEstimatedAcquisitionPrice`)로 base를 산출**한 뒤 채널에 주입했다(probe p6). P6 A 채택 셀은 기존 `resolveSplitBuildingPenaltyAxis`가 이미 파트 환산 base(건물 파트)를 내고 토지분이 base에 섞이지 않음을 확인했다(D4).

### 5.3 경계 (`calculateBuildingPenalty` 직접 호출)

| 입력 | 결과 | 비고 |
|---|---|---|
| 신축 2021-08-01, 양도 2026-08-01 | 가산세 O | 5년 되는 날 당일 포함 |
| 신축 2021-08-01, 양도 2026-08-02 | 없음 | |
| 신축 2020-02-29, 양도 2025-02-28 / 2025-03-01 | O / 없음 | 2/29 → `addYears` = 2/28 |
| 환산, 양도 2017-12-31 | 없음 | 환산 시행일 2018-01-01 |
| 감정, 양도 2019-12-31 / 2020-01-01 | 없음 / O | 감정 시행일 2020-01-01 |
| 증축 85㎡ / 85.01㎡ | 없음 / O | 85㎡ 초과 |

---

## 6. 14 동기화 지점 (엔진 input·result 변경)

| # | 지점 | 변경 | 파일 | 비고 |
|---|---|---|---|---|
| ① 폼 상태 | O | `CarryoverTaxationForm`에 `donorBuilt`(boolean)·`donorBuildingType`·`donorConstructionDate`·`donorExtensionFloorArea`·`donorExtensionStdPriceAtAcquisition` + 일체 주택 취득 당시 묶음 `donorHousingLandPricePerSqm`·`donorHousingLandArea`·`donorHousingBuildingStdAtAcq`(신규 3칸). **양도 당시 L_T·N_T와 구분 기재·감정·예외(Q-6 b)는 신규 칸 없이 기존 자산 수준 칸을 재사용**(§3.2 file:line) | `lib/stores/calc-wizard-asset-carryover.ts:33-` | 파트 서브폼(`landCarryover`/건물 파트)이 같은 타입을 공유(`normalizeCarryoverForm`) |
| ② initial | O | `CARRYOVER_DEFAULTS` — `donorBuilt:false`, 나머지 `""` | 같은 파일 `:134-` | 기본 OFF = 회귀 0 |
| ③ normalize | O | `normalizeCarryoverForm`에 타입 검사(boolean/enum/문자열) | 같은 파일 `:166-` | 구 세션 호환: 없으면 OFF |
| ④ API 변환 | O | `buildCarryoverPayload`가 `donorBuilt` 객체를 만들되 **토글 ON + 환산 ON + 건물성 자산일 때만** 전송(stale 방지: 환산 OFF·자산 종류 변경 시 미전송). 파트: `transfer-tax-api-split-carryover.ts`, GB: `transfer-tax-api-gb-carryover.ts`, 컴패니언: `transfer-tax-api-companion-payload.ts:618-624` | `lib/calc/transfer-tax-api-carryover.ts:72-` | 게이트 술어는 ⑤·⑧과 같은 leaf 1개(`donorBuiltApplicable`) — `self-built-scope.ts` 교훈 |
| ⑤ UI 위젯 | O | `CarryoverGiftBlock` ② 증여자 취득가액 블록의 환산 패널 **직후**(계산 순서=표시 순서)에 `ToggleCard` 「증여자가 신축·증축한 건물입니까?」 — 일체 주택이면 토글 안에 H·L(㎡당×면적)·N 취득 당시 입력 카드(`LandPriceLookupField` 필수 — 공시지가 조회 규약) + **기존 `LandBuildingSaleSplitSection`**(양도 당시 L_T·N_T·구분 기재·감정·예외). 기존 `SelfBuiltSection`은 제목·설명이 「본인」 고정이라 title/description prop을 열거나 얇은 래퍼 | `components/calc/transfer/CarryoverGiftBlock.tsx`, `SelfBuiltSection.tsx` | `useEffect` 미러링 없음 — 전부 `onChange` |
| ⑥ 사이드바 | **N/A** | 현행 사이드바는 가산세를 합산하지 않는다(`transfer-per-asset-summary.ts`에 `가산세` grep 0건). 본인 신축 가산세도 마찬가지 | — | 일관성 유지 |
| ⑦ 결과 | O | 가산세 step note·`CarryoverTaxationDetail.donorBuiltPenalty` echo(§7) | `transfer-tax-building-penalty.ts` note, `types/transfer-carryover.types.ts` | 합산·4뷰 표시는 `result.penaltyTax/penaltyBase`를 이미 읽는다 |
| ⑧ validate | O | 아래 ⑧↔⑫ 격자 | `lib/calc/transfer-tax-validate-carryover-asset.ts:78-` (e) 환산 블록 뒤, 파트 `transfer-tax-validate-split-carryover.ts`, GB `transfer-tax-validate-gb-carryover.ts`, BG `transfer-tax-validate-bg.ts:159` | |
| ⑨ Zod enum 메인 | N/A | `acquisitionCause` enum 변경 없음 | | |
| ⑩ Zod enum 컴패니언 | N/A | 〃 (`addPropertyRefines`는 ⑫ 쪽 refine로 처리) | | |
| ⑪ 자산 acquisitionDate fallback | N/A | 이월과세의 `acquisitionDate` fallback(`carryoverAcquisitionDateFallback`)은 변경 없음 | | |
| ⑫ Zod 입력 객체 | **O (gap-prone)** | `carryoverTaxation`에 `donorBuilt: z.object({...}).optional()` — **메인 `base-shape.ts:532-`(별도 z.object), 컴패니언(`schema-companion.ts:388`)·GB 파트는 `carryoverTaxationEngineShape`(`building-schemas.ts:76,95`) 한 곳, 파트 이월과세 `schema-split-carryover.ts:60-`** 전수(메인 객체와 엔진 shape는 parity 규약, `base-shape.ts:554`). 누락 시 **침묵 strip**(TS 미감지 — `engine-input.ts:130-148` 주석 probe 실측) | | `buildingType` enum은 기존 `z.enum(["new","extension"])`(`base-shape.ts:299`) 재사용 |
| ⑬ body spread | 확인 | `carryoverTaxation`은 객체째 전달되는 구조이므로 신규 키 자동 통과. **그래도 grep으로 확인**(`gift-burdened-transfer-api.ts`, `multi`는 차단이라 해당 없음) | | |
| ⑭ Route 엔진 매핑 | **O** | `engine-input.ts:134-147`, `bundled-split-helpers.ts:625-640`의 `carryoverTaxation` 변환에 `donorBuilt.constructionDate` → `toDate(...)`(`date-coerce` 강제, `new Date(x)` 직접 금지 — 정책 / `Date < string` silent false) | | |

### ⑧↔⑫ 정합 격자 (UI 통과 ↔ validate 차단 모순 금지)

| 조건 | ⑤ UI | ⑧ validate | ⑫ Zod refine | 엔진 |
|---|---|---|---|---|
| 토글 ON인데 구분 미선택 | 구분 필수 표시 | 차단 | 차단 | throw |
| 신축일 미입력 | — | 차단 | 차단 | throw |
| 신축일 < 증여자 취득일 또는 > 증여 등기접수일 | — | 차단 | `superRefine` | throw |
| 증축인데 바닥면적 ≤ 0 | — | 차단 | 차단 | 85㎡ 게이트 |
| 증축인데 증축 부분 기준시가 ≤ 0 | — | 차단 | 차단 | throw |
| 일체 주택 · 구분 기재(`actual`)인데 토지·건물 양도가액 미입력 / 감정(`appraisal`)인데 한쪽 감정가액 미입력(구분 기재가 §100③으로 안분값에 되돌려지는 경우는 차단이 아니라 의제·고지) | 기존 `LandBuildingSaleSplitSection` 필드 | 차단 — `validateSaleStdAndAppraisal`(`transfer-tax-validate-split-sale-std.ts:30`) 규칙 재사용 | `donorBuilt.housing.sale` 조건부 필수 refine | `resolveTransferPriceSplit` throw |
| 일체 주택인데 L·N·L_T·N_T(또는 H·H_T) 중 하나라도 ≤ 0 | — | 차단 — 기존 split 경로와 같은 메시지 규약(`transfer-tax-split-gain.ts:112-125`, `split-acq-price.ts:513-520`). **0·합계 역산 fallback 금지** | 차단 | throw |
| 환산 OFF(실가 승계)인데 `donorBuilt` 전송 | 토글 비노출 | 토글 상태 stale이면 무시(미전송) | 환산 OFF + `donorBuilt` → 거부 | throw |
| phd/apd 환산 | 토글 비노출 | 차단 | 거부 | throw |
| 비건물 자산(land·분양권·재개발·겸용·상가) | 비노출 | 무시(미전송) | 거부 | — |

**3중 패턴**: 신규 필드는 UI display fallback이 없고(자동 채움 금지) API 변환에도 fallback이 없다. 일체 주택의 토지·건물 비례 안분은 **비어 있는 칸을 메우는 fallback이 아니라** 입력된 H·L·N을 법정 구조대로 나누는 산식(S3-1)이며, 입력 하나라도 비면 쌍을 만들지 않고 차단한다(자동 안분 fallback 금지 정책과 충돌 없음). 즉 「미입력 = ⑧ 차단」이 세 계층에서 동일하다. 토글 기본값(`donorBuilt:false`)은 ②·③·④가 모두 같다.

---

## 7. 결과 4뷰 · 고지

- 합산·표시: 결과 카드(`TransferTaxResultView.tsx:428-436` 합계), 상세명세서(`DetailedStatementLateStages.ts:168-214` — `penaltyBase > 0`이면 `§114조의2 환산취득가액 가산세 = base × 5%`), 신고서(`FilingFormTableHelpers.ts:684`, aggregate `:326-349,466`), PDF(`ResultPdfTransferSections.tsx:82,105` — 합계만)는 **`penaltyTax/penaltyBase`를 이미 읽는다** → 숫자는 자동 반영. 실제 변경은 **원인 표기**다.
- 추가: `emitPenaltySteps`의 note(`transfer-tax-penalty-steps.ts:62`)가 「신축 5년 이내 양도 + 환산취득가액 적용」으로 나오는데, 증여자 신축은 「**증여자 신축** … + 증여자 취득가액 환산취득가액 적용」으로 구분한다(`calculateBuildingPenalty` note 분기). 상세명세서의 `penaltyMethod` 판별이 note 문자열 포함 검사(`DetailedStatementLateStages.ts:192`)라 **문구를 바꿀 때 검사 키(「감정가액 적용」)를 깨지 않게** 한다.
- `CarryoverTaxationDetail`에 echo `donorBuiltPenalty?: { buildingType; constructionDate; fifthAnniversary; base; penalty }`(A 채택일 때만 존재, 일체 주택은 `housingSplit: { B_acq; B_tr; S_b }` 포함) — `CarryoverComparisonCard.tsx`(361줄)·`SplitCarryoverComparisonCard.tsx`(152줄)에 한 줄 표시. `TransferTaxResultView.tsx`는 790줄이라 **여기에는 건드리지 않는다**(§9).
- **「확인 필요」 고지 — 문구 교체안(권장 유지, Q-5)**:
  - 종전(`split-carryover-display.ts:277`): 「…가산세 적용 여부는 확인이 필요합니다 — … 이 계산은 양도자 본인이 신축·증축한 건물만 가산세를 붙입니다.」
  - 변경: 「증여자가 신축·증축한 건물을 그 신축·증축일부터 5년 이내에 양도하는 경우의 소득세법 §114조의2 가산세를 **적용했습니다**(증여자 신축일 기산, 증여자 기준 환산취득가액의 5%, 증축은 증축 부분). 증여자 신축분에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.」
  - ~~B 채택 시 「같은 금액을 더했다」 한 줄~~ — **삭제**(R2: B 채택에는 가산세가 없다).
  - B 채택/적용배제인데 `donorBuilt`가 입력된 경우의 **중립 안내 한 줄 — 사용자 확정(2026-10-22)**: 「이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 §114조의2 가산세는 붙지 않았습니다.」 `donorBuiltPenalty.applied=false`(+`notAppliedReason`) echo가 소스다.
  - **자산 전체 이월과세에는 현재 이 고지가 없다** → 같은 문구를 `CarryoverComparisonCard`/경고 경로에 신설(M1·M2·M6).

---

## 8. 회귀 0이어야 하는 셀 (Pre-Do anchor로 고정)

| 셀 | 기대 |
|---|---|
| `donorBuilt` 미전송(토글 OFF·구 이력·구 세션) 이월과세 전 셀 | 가산세·세액 현행과 동일 |
| 증여자 실지취득가액 승계(환산 OFF) + `donorBuilt` 전송 시도 | ⑧/⑫ 거부(실가는 §114조의2 대상 아님) — 침묵 무시 금지 |
| 증여자 신축이어도 신축일 + 5년 < 양도일 | 가산세 0 (경계 당일은 부과) |
| 환산 양도일 < 2018-01-01 · 감정 양도일 < 2020-01-01 · 증축 ≤ 85㎡ | 0 |
| **②3호 비교로 B 채택** (`donorBuilt` 입력됨) | 가산세 0·세액 현행과 동일(§5.2 차이 0 셀) · 채택 시나리오도 현행과 같다 |
| ②1호/②2호/③ 적용배제로 B 고정 (`donorBuilt` 입력됨) | 가산세 0 |
| P6 파트 B 채택(`excluded`) | 가산세 0 |
| 수증자(양도자) 본인 신축 경로(`acquisitionCause: purchase`) | 변화 없음 — `donorBuilt`와 독립 |
| 비이월 일체 주택 신축 환산(base 5억 실측) | 변화 없음(§3.3 관찰) |
| split 토지만 이월과세(A) · 일반건물 #7-b(토지 이월과세 + 건물 본인 신축) | 변화 없음 |
| multi(연간 다건) 이월과세 | 계속 차단 |
| 부담부증여 실가(K-4)·K-6(매매사례) × 이월과세 | 변화 없음 (G-5 유지) |
| 부담부증여 본인 신축 플래그 + `donorBuilt` 없음 | 종전 throw 유지 |
| 겸용 부담부증여 | 종전 차단 유지(`burdened-gift-mixed-use-scope.ts:277`) |

---

## 9. 파일 줄 수 (800줄 정책) — `wc -l` 실측

| 파일 | 줄 수 | 이번 변경 | 판정 |
|---|---|---|---|
| `lib/tax-engine/transfer-tax-carryover.ts` | 688 | 후크 호출 <10줄 | 착지 ≤700 유지 — 로직은 신규 leaf로 |
| `lib/tax-engine/transfer-tax-split-carryover.ts` | 419 | 후크 + base 회수 ~25줄 | 여유 |
| `lib/tax-engine/transfer-tax-carryover-burdened-gift.ts` | 257 | throw 완화 ~15줄 | 여유 |
| `lib/tax-engine/transfer-tax-finalize.ts` | 650 | 0줄(채널 재사용) | 변경 없음 |
| `lib/tax-engine/transfer-tax-building-penalty.ts` | 203 | note 분기 ~10줄 + (P6 증축 `effectiveInput` 판독) | 여유 |
| `lib/tax-engine/types/transfer.types.ts` | 1808 | 타입만 | 타입 전용 예외(정책) — 신규 타입은 `transfer-carryover.types.ts`(345)에 둔다 |
| `lib/api/transfer-tax-schema-base-shape.ts` | 654 | zod 객체 1개 공용 export + 4곳 참조 | 공용 `donorBuiltSchema`를 `transfer-tax-schema-split-carryover.ts`(198) 등 작은 파일에 두고 참조 |
| `lib/calc/transfer-tax-api-carryover.ts` | 229 | ~20줄 | 여유 |
| `lib/stores/calc-wizard-asset-carryover.ts` | 263 | ~25줄 | 여유 |
| `components/calc/transfer/CarryoverGiftBlock.tsx` | 404 | 토글 블록 ~30줄(별 컴포넌트로 분리 권장) | 여유 |
| `components/calc/results/TransferTaxResultView.tsx` | **790** | **건드리지 않는다** | 이미 위험구간 — 표시는 하위 카드에서 |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | 719 | 변경 없음 | — |
| `lib/tax-engine/transfer-tax-aggregate.ts` | 760 | 변경 없음 | — |

신규 파일: `transfer-tax-carryover-donor-penalty.ts`(~120줄 예상), `donor-built-scope.ts`(`lib/calc`, 술어 leaf ~40줄).

---

## 10. PR 분할 · Pre-Do anchor

워크플로: 엔진(타입·leaf·후크·⑫·⑭) → 입력 파이프라인·UI(④⑤⑧) → 결과 순서. 각 PR 전에 anchor 선작성(`pre-do-anchor-verification`).

| PR | 범위 | 핵심 anchor |
|---|---|---|
| **PR-1 엔진 + ⑫⑭** | `donorBuilt` 타입(`housing.sale` 포함)·Zod(메인·컴패니언 shape 수용, GB 파트·split 파트 wire는 **명시 거부**로 침묵 strip 차단)·Date 변환(⑭)·leaf·`calcCarryoverScenarios` A 채택 후크(래퍼 방식 — `finishScenarios` 본문 무변경)·손실 경로 확인. **M1·M13~M16**(자산 전체 비주택 건물, API 직접 호출로 검증). 일체 주택(M2)은 Q-2 결과에 따라 같은 PR | 5.1 격자(R2: 채택 불변·A 셀만 +p) · 일체 주택 base 187,500,000 · 경계 5.3 · 5년 당일/익일 · 증축 85㎡ · 손실 경로 · `donorBuilt` 부재 회귀 0 · 환산 OFF 거부 · 직접 호출 raw `isSelfBuilt` 무영향 |
| **PR-2 입력·UI·결과(자산 전체)** | ①②③④⑤⑧ · 일체 주택은 `LandBuildingSaleSplitSection` 재마운트 + ④의 sale 부분집합 함수 추출(`transfer-tax-api-split.ts:142-288`) · 컴패니언(M10) · 결과 echo·고지(§7 중립 안내 포함) · E2E(폼→계산→결과, Network body 확인) | ⑧↔⑫ 격자 전수 · 토글 stale 미전송 · 자산 종류 변경 시 비노출 |
| **PR-3 split 파트(P6)** | 해결자 후크(A 적용 파트만)·`resolveSplitBuildingPenaltyAxis`가 `effectiveInput` 판독(증축) · `SplitPartCarryoverCard` 토글 · P6 고지 문구 교체 · `p6.plan.md` Q3 정정 주석 | §5.2 P6 두 셀(A +5,500,000 · B 차이 0) · 증축×파트 환산 · 토지 base 미혼입 |
| **PR-4 부담부증여 × 이월과세** | `assertCarryoverDonorBasis` throw 완화 · A 입력에만 증여자 신축 정보 전달(K-5/K-7) · 일반건물 F27(M9) A 호출 한정. **B는 가산세 없음(R2)이라 K-5 B base 설계가 불필요해졌다** | G-4·G-4b 반전 · B 채택 시 가산세 0 · K-7 증축 안분 · 겸용 차단 유지 |
| **PR-5 일반건물 카드(M6)** | 카드 ⑤ UI(`GeneralBuildingAcquisitionCards.tsx:520,545,655`)·`transfer-tax-api-gb-carryover.ts:299` ⑧ GB | GB 건물 카드 환산 이월과세 가산세 · V-1 확인 |

PR-1~2는 한 세트로 머지해야 사용자에게 열린다(엔진만 머지돼도 입력이 없으므로 회귀 0).

---

## 11. 결정 사항 (사용자 최종 결정 2026-10-22 — 전부 확정)

| Q | 결정 | 반영 위치 |
|---|---|---|
| **Q-1** (D3) | **R2 확정** — 가산세는 이월과세 적용(A 채택)으로 증여자 기준 환산·감정가액이 취득가액이 될 때만. ②3호 B 채택·②1호·②2호·③ 배제(수증자 취득가액 = 증여 당시 상증법 평가액, 영 §163⑨)는 가산세 없음. 종전 「양쪽 모두」는 사용자가 R2로 재확정(§1 이력) | §1·§3.4·§3.5·§5·§7·§8 |
| **Q-2** (D4 일체 주택) | **확정** — 주택 공시가격을 토지공시가격(개별공시지가×면적)과 건물기준시가의 비율로 나눈 값이 토지·건물 기준시가. 증여자 취득 당시·양도 당시 각각 건물분을 구해 환산. 종전 (b) 「건물분 기준시가 1칸」 안은 폐기 | §2·§3.2·§3.3 |
| **Q-3** | **확정** — 신축일은 별도 칸, 증여자 취득일 자동 채움 없음 | §3.2 |
| **Q-4** | **확정** — 자산 전체 이월과세에 증여자 감정가액 입력 신설 안 함(감정 경로는 부담부증여 K-7에서만) | §3.3 |
| **Q-5** | **확정** — 고지를 「적용했다 + 정면 해석례 미확보 — 확인 필요」로 교체(B 채택 문구는 Q-1에 따라 삭제) | §7 |

### Q-6 (확정 2026-10-22: **(b)**)

| Q | 결정 | 반영 위치 |
|---|---|---|
| **Q-6** | **(b) 확정** — 일체 주택 이월과세의 양도가액 건물분 `S_b`는 `resolveTransferPriceSplit` 법정 서열(구분 기재 → §100③ 30% 판정 → 감정평가 → 기준시가)을 그대로 연결한다. 입력은 기존 자산 수준 칸·`LandBuildingSaleSplitSection`을 재사용하고 ④는 `donorBuilt.housing.sale` 중첩 객체로 전송 | §3.2·§3.3·§6·§10 |
| 중립 안내 | **확정** — B 채택·적용배제 + `donorBuilt` 입력 시 「이월과세를 적용하지 않아 … 가산세는 붙지 않았습니다」 | §7 |

---

## 12. 미확인·검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 일반건물 건물 카드에서 증여자 환산 이월과세 시 `card.usedEstimatedAcquisition`이 true인지(게이트 `general-building-route-cards.ts:225`)와 카드 매핑이 `donorBuilt`를 보존하는지 | 확인 필요 — PR-5 착수 전 anchor |
| V-2 | 분양권 × 이월과세 차단 코드 | 인벤토리에서 확인 못함 — 토글 비노출로 처리 |
| V-3 | 겸용주택·상가 엔진이 `carryoverTaxation`을 읽는지; `resolveSplitBuildingPenaltyAxis`의 증축 판독이 원본 `input` 기준(`building-penalty.ts:161`, finalize `:325`)이라 파트 증축에서 `effectiveInput` 판독이 필요한지 | 확인 필요 — 후자는 PR-3 anchor로 실측 |
| V-4 | §114조의2 시행 부칙(환산 2018.1.1., 감정·증축 2020.1.1.)이 **증여자 신축·증여 후 양도**에 양도일 기준으로 같게 적용되는지 | 기존 게이트 승계, 부칙 재대조 안 함 — 확인 필요 |
| V-5 | ~~부담부증여 K-5 × 이월과세 B 시나리오 base~~ | **해소** — R2로 B 채택은 가산세 없음이라 단순화(초판 R1 전제 삭제) |
| V-6 | 다필지 분기(`multi-parcel-branch.ts:263-301`; 환산 base 0·감정만)가 이월과세와 공존하는지 | 인벤토리: 환산 base 0 고정 — 공존 여부 확인 필요 |
| V-7 | PDF에서 자산 전체 이월과세 비교(`carryoverTaxationDetail`)가 출력되는지 | 인벤토리: lib/pdf·lib/print grep 0건 — 숫자는 합계로 반영되나 원인 표기는 PDF에 없음 |
| V-9 | ~~(a) 일체 주택 이월과세 폼의 양도 당시 칸 재사용 가능 여부~~ **해소**(§3.2 Q-6 (b) 입력 경로: 기존 자산 수준 칸 재사용, 전송은 중첩 객체) · (b) 증축 부분 기준시가(나목 척도)와 H 비례 건물분 분모의 척도 차이 — 기존 분리 취득 증축 경로(`splitExtensionPenaltyBase`)와 같은 관행을 승계 | 확인 필요 — PR-2 착수 전 앵커·폼 대조 |
| V-8 | 법령 MST는 소득세법 280405(시행 2026-01-01/07-01 본), 시행령 290841(시행 2026-10-01: §162·§164·§166 원문 확인). 조심2016중0801은 재결례 967652 요지 확인 | 확인 완료 |

---

## 13. 자가 점검

- [x] useEffect → store 미러링: 신규 필드는 전부 `onChange`·`useMemo`, 자동 채움 없음.
- [x] 자동 안분 fallback 금지: 건물분 기준시가·신축일·바닥면적 미입력은 ⑧ 차단(§6 격자). 일체 주택 건물분은 사용자가 입력한 H·L·N을 기존 S3-1 산식으로 나누는 것이며 비어 있는 칸을 메우는 안분 fallback이 아니다(하나라도 비면 ⑧ 차단).
- [x] ⑧ 동기화: ⑧↔⑫↔엔진 격자 작성(§6). 구현 시 ⑧ 전수 대조 필요.
- [ ] 14지점 grep(⑫⑬⑭), anchor, tsc, vitest, 브라우저 확인 — **Do 단계 항목(이번은 계획서만)**.

---

## 14. PR-1 Do 기록 (2026-10-22) — 계획 대비 이탈

| 항목 | 계획 | 실제 | 이유 |
|---|---|---|---|
| 후크 위치 | `finishScenarios` 꼬리 | `calcCarryoverScenarios`를 얇은 래퍼로 감싸고 기존 본문은 `calcCarryoverScenariosCore`로 개명 — 래퍼가 `assertDonorBuiltInput`(입력 거부)과 `withDonorBuiltPenalty`(A 채택 후크)를 부른다 | `finishScenarios` 반환 지점이 5곳(적용배제 조기 반환 2·②2호·정상 2)이라 곳곳에 후크를 넣으면 688줄 파일이 800줄 쪽으로 간다. 래퍼는 한 곳에서 `donorBuilt` 부재 시 core 결과를 그대로 돌려준다(회귀 0). |
| 가산세 설명 문구 | `calculateBuildingPenalty` note 분기 | 내부 표식 `TransferTaxInput.penaltyDonorBuilt`(와이어에 없음)를 A 채택 입력에 싣고 note 앞에 「증여자 」를 붙임 | note 가 입력만 보는 순수 함수라 «증여자 신축 여부»를 넘길 채널이 필요했다. `DetailedStatementLateStages`의 「감정가액 적용」 부분 문자열 판별은 보존. |
| GB 파트·split 파트 wire | 「전 스키마 parity」 | **수용이 아니라 명시 거부**: `carryoverPartShape`·`splitCarryoverPartShape`에 거부용 키(`donorBuiltRejectedKey`), GB `landCarryoverTaxation`·`buildingCarryoverTaxation`에 `rejectDonorBuiltRefine` | 이 PR에서 엔진이 읽지 않는 경로에 키를 열어 두면 «받아서 무시» = 침묵 오답. PR-3(split)·PR-5(GB)에서 거부를 수용으로 바꾼다. 메인 인라인 shape·엔진 shape(컴패니언)는 수용(parity 유지). |
| 입력 거부 위치 | ⑫·⑧·엔진 | ⑫: 서브객체 규칙(`refineDonorBuiltInCarryover`) + 자산 종류·취득원인 규칙(`refineDonorBuiltOuter`, `addPropertyRefines`) / 엔진: `assertDonorBuiltInput` | ⑧은 PR-2(입력 UI) 범위. |
| 일체 주택 `sale` 전송 | PR-2에서 ④ | PR-1 엔진·⑫가 `donorBuilt.housing.sale`을 수용(anchor DB-2b·DBR-1) | Q-6(b) 법정 서열을 엔진에서 먼저 고정. |
| 신규 법령 상수 | 필요 시 manifest 등록 | 신규 상수 없음(`TRANSFER.BUILDING_PENALTY`·`CARRYOVER_DONOR_BASIS`·`PRE_HOUSING_DISCLOSURE_APPORTION`·`BUNDLED_APPORTIONMENT` 재사용) | manifest 등록 불필요. |

---

## 15. PR-2 Do 기록 (2026-10-22) — 입력·UI·결과(자산 전체) · 계획 대비 이탈

| 항목 | 계획 | 실제 | 이유 |
|---|---|---|---|
| ① 폼 필드 | 취득 당시 3칸 + 양도 당시·sale 은 기존 칸 재사용 | 그대로. `CarryoverTaxationForm`에 8칸(`donorBuilt`·`donorBuiltType`·`donorBuiltDate`·`donorBuiltExtensionArea`·`donorBuiltExtensionStdPrice`·`donorBuiltLandPricePerSqm`·`donorBuiltLandArea`·`donorBuiltBuildingStdAtAcq`) | `normalizeCarryoverForm`이 구 세션·이력(필드 없음)을 OFF로 복원 — anchor DBC-N |
| ④ 위치 | `buildCarryoverPayload` 안 | 신규 `lib/calc/transfer-tax-api-donor-built.ts`(`withDonorBuilt`)를 주 자산(`transfer-tax-api.ts`)·컴패니언(`transfer-tax-api-companion-payload.ts`) 호출부에서 얹음 | `transfer-tax-api-carryover.ts` → `donor-built-scope` → `transfer-tax-api-split` → `transfer-tax-api-carryover` 순환을 피하려고 분리 |
| ④ sale 부분집합 | 기존 `transfer-tax-api-split.ts` sale 부분집합 함수 추출 | **추출하지 않고** 그 게이트 규약(구분 기재=`actual` 모드·감정=`actual`/`appraisal`·예외=양도일 2025.1.1.+)을 새 빌더에 옮겨 적용 | 기존 빌더는 `isSplitPayloadActive`·`partInputsActive` 등 분리 계산 게이트와 얽혀 있어 추출이 회귀 면적을 키운다. 규약은 anchor(안분 모드 stale 미전송 · 감정/예외)가 고정 |
| 지분 스케일 | 확인 | 구분 기재 양도가액만 `transferPrice`와 같은 축으로 스케일, 기준시가·감정·취득 당시 입력은 미스케일(anchor 50% 셀) | 환산 산식에서 분자·분모로 약분 |
| ⑧ sale 규칙 | `validateSaleStdAndAppraisal` 재사용 | 그대로(`landMode`·`buildingMode`=estimated로 호출 — 양쪽 양도 당시 기준시가 필수) | 엔진이 B_tr 안분·S_b 기준시가 basis 둘 다에 L_T·N_T를 요구 |
| ⑦ echo | `donorBuiltPenalty` | 엔진 echo에 `formula`(`base = multiplicand × numerator ÷ denominator`) 추가 + 안내 문장을 `result.warnings`에도 싣음(`transfer-tax-precalc.ts` 4줄) | 4뷰가 같은 문장 정본(`transfer-tax-carryover-donor-display.ts`)을 읽게 하려고 |
| ⑦ 산식 표기 | 한국어 풀어쓰기 | 문자열 산식은 `× (분자) ÷ (분모)` 괄호 피연산자 규약 — 결과 카드는 `FormulaText`가 분수(Frac)로 그림, 평문 매체(PDF·상세명세서 문자열)는 그대로 읽힘 / 「건물분 기준시가 = H × N ÷ (L+N)」 식은 `÷` 없이 말로 풀어 씀 | `formula-fraction-render-path.anchor.test.tsx`(산식 나눗셈 분수 변환 감사)가 첫 실행에서 2건 적발 → 규약에 맞춤 |
| ⑦ 신고서 | 4뷰 | 신고서 「가산세액」 칸 각주(`setRoseNote`) + 상세명세서 가산세액 항목 문구 + PDF 행 + 결과 카드 | `TransferTaxResultView.tsx`(790줄)는 건드리지 않음 |
| ⑥ 사이드바 | 변경 여부 확인 | **변경 없음** — `transfer-per-asset-summary.ts`가 가산세를 합산하지 않는다(본인 신축 가산세도 동일) | 계획서 §6 N/A 유지 |
| 겸용·상가·분양권·입주권 | 토글 비노출 | `donorBuiltApplicable`이 housing·building 외·겸용·부담부증여·분리 계산·파트 이월과세·환산 OFF·phd/apd를 모두 비노출 | 엔진·⑫ 거부 조합과 같은 집합 — DBC-S 격자 |
| 인쇄(print) E2E | 「전체 선택」 먼저 | **하지 않음** — 인쇄 경로는 vitest PDF·신고서 anchor로만 확인 | 가산세 근거는 같은 view 정본을 읽고 별도 인쇄 전용 분기가 없다. 필요 시 PR-3 이후 E2E에 추가 |
