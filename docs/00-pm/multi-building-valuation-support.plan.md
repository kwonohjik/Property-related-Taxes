# 다건 합산(연간 합산 과세)에 상업용건물·오피스텔·일반건물 지원 — 구현 계획서

- 작성: 2026-11-09 · 브랜치 `docs/multi-building-valuation-plan`
- 계기: 사용자 보고 — 같은 해에 **오피스텔(상업용건물)을 먼저 양도하고 아파트를 나중에 양도**한 경우를 연간 합산 화면
  (`/calc/transfer-tax/multi`)에 넣으면 공통 설정 단계에서
  「"양도 1번": 일반건물·상업용건물(토지·건물 일괄/환산취득가)은 단건 계산기에서만 지원됩니다.」로 막힌다.
- 줄 번호는 2026-11-09 master(`35bff2c2b`) 기준이다. 착수 전 현행 코드로 다시 확인할 것.

## 0. 요약

| 트랙 | 대상 | 단건이 계산하는 방식 | 다건에서 빠진 것 | 크기 |
|---|---|---|---|---|
| **C** | 상업용건물·오피스텔(`commercial_building`) | 단건 **엔진**이 서브객체를 직접 읽는다(STEP 0.35 환산 · STEP 0.62 부수토지) | ④가 서브객체 3종을 만들지 않고, ⑫가 그 키를 거부하며, ⑧이 자산 종류로 막는다 | 작음 — 배관 3키 + 차단 해제 |
| **G** | 일반건물(`general_building`) | 단건 **route**가 엔진을 거치지 않고 토지·건물 카드를 만들어 합산 엔진을 직접 부른다 | 다건 route에 카드 전개 단계가 없다 | 큼 — 1 폼 항목 → N 엔진 항목 |

권장 순서: **PR-1 = 트랙 C**(사용자 사례가 바로 풀린다) → **PR-2~ = 트랙 G**.

## 1. 현행 차단 지점 (실측)

| 층 | 위치 | 내용 |
|---|---|---|
| ⑧ 화면 | `lib/calc/multi-transfer-tax-validate.ts:148-150` `validateMultiSupportedMode` | `assetKind === "general_building" \|\| "commercial_building"`이면 **취득 방식과 무관하게** 차단 |
| ⑫ API | `lib/api/transfer-tax-schema-multi-refines.ts:70-74` `MULTI_REJECT_RULES` | `generalBuildingValuation`·`generalBuildingShares`·`commercialBuildingValuation`·`commercialAppurtenantLand`·`commercialInheritanceValuation` 값이 있으면 400 |
| 문구 | `lib/calc/multi-transfer-support-messages.ts:21-22` `MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE` | ⑧·⑫ 공용 |

키 분류 가드: `__tests__/api/transfer.route.multi-key-coverage-f12.test.ts` — 다건 스키마의 모든 키는
「⑭가 `p.<키>`로 매핑」·「`MULTI_REJECT_RULES`」·「`MULTI_IGNORED_KEYS`」 중 하나여야 한다.
거부 목록에서 빼는 키는 **같은 PR에서 ⑭ 매핑을 추가해야** 가드를 통과한다.

## 2. 트랙 C — 상업용건물·오피스텔

### 2.1 단건 경로 (실측)

- route에 상업용건물 전용 분기가 없다(`app/api/calc/transfer/route.ts` 분기는 지분 GB · 일괄 · 겸용 · GB · 이월과세 채무 · 단건뿐).
  상업용건물은 5-b 단건 경로(`calculateTransferTax`)로 간다.
- ⑭ `app/api/calc/transfer/engine-input.ts:476-479`가 `commercialBuildingValuation`·`commercialAppurtenantLand`를 엔진 입력에 싣는다.
  `commercialInheritanceValuation`은 `route-inherited-acquisition.ts:103-104` leaf가 싣는다.
- 엔진: `lib/tax-engine/transfer-tax-commercial-step.ts` `runCommercialBuildingStep`(§164⑥ 환산 · `propertyType === "commercial_building"` +
  `useEstimatedAcquisition` + 서브객체가 모두 있을 때만) · `transfer-tax-judgment-steps.ts:702` 부수토지 초과분.
- ④ 빌더: `lib/calc/transfer-tax-api-primary-context.ts:165-169`
  (`cbValuation` = 상업용 + 환산 + 상속 아님일 때 `buildCommercialBuildingValuation` · `cbAppurtenantLand` = 취득 방식 무관 `buildCommercialAppurtenantLand`)
  · `lib/calc/transfer-tax-api.ts:709` `buildCommercialInheritanceValuationPayload(primary)`.

### 2.2 합산 엔진은 이미 처리한다 (probe 실측)

throwaway probe(`calculateTransferTax` ↔ `calculateTransferTaxAggregate`, mock 세율, 2026-11-09):

| 입력 | 결정세액 | 양도차익 |
|---|---|---|
| 오피스텔 환산(서브객체 있음) — 단건 엔진 | 27,199,800 | 155,410,000 (환산 취득가 240,000,000) |
| 같은 입력 — 합산 엔진 1건 | **27,199,800** (일치) | 155,410,000 |
| 서브객체 **없이** — 단건 엔진 | 101,060,000 | 400,000,000 (환산 소실) |
| 오피스텔 + 아파트 — 합산 엔진 2건 | 123,591,200 | 155,410,000 / 300,000,000 |

- 합산 엔진은 `commercialBuildingValuation`을 항목별 단건 엔진으로 그대로 넘긴다 ⇒ **엔진 변경 불필요**.
- 서브객체가 빠지면 환산이 사라져 결정세액이 73,860,200 늘어난다 ⇒ 현행 차단은 「침묵 오산 방지」였고,
  배관(④⑭) 없이 차단만 풀면 안 된다.
- 결과 화면: `MultiTransferPropertyBreakdown.tsx:498`이 `ValuationDetailCards`를 그리고, 합산 결과의 자산별 breakdown은
  `transfer-tax-aggregate-pickers.ts:38`이 `commercialBuildingValuationDetail`을 싣는다. 환산 상세 카드가 다건에서 뜨는지는 **V-C3(브라우저 확인 필요)**.

### 2.3 변경 (PR-1)

| 지점 | 파일 | 변경 |
|---|---|---|
| ④ | `lib/calc/multi-transfer-tax-api.ts` `buildPropertyPayload` | 단건과 **같은 leaf** 3개를 같은 게이트로 호출: `buildCommercialBuildingValuation`(상업용 + 환산 + 상속 아님) · `buildCommercialAppurtenantLand` · `buildCommercialInheritanceValuationPayload`. 게이트 술어를 복제하지 말고 `primary-context`의 조건을 공용 함수로 뽑아 둘 다 부른다(3중 패턴) |
| ⑫ | `lib/api/transfer-tax-schema-multi-refines.ts` | `commercialBuildingValuation`·`commercialAppurtenantLand`·`commercialInheritanceValuation` 세 키를 `MULTI_REJECT_RULES`에서 뺀다 |
| ⑭ | `app/api/calc/transfer/multi/route.ts` | `p.commercialBuildingValuation`·`p.commercialAppurtenantLand` 매핑(단건 `engine-input.ts:476-479`와 같은 형태 — Date 없음) · `toEngineSec163_9Inputs`에 `commercialInheritanceValuation: p.commercialInheritanceValuation` 추가(`:509-515` 주석의 「상가 키는 ⑫가 거절」 문장도 갱신) |
| ⑧ | `lib/calc/multi-transfer-tax-validate.ts:148` | 조건을 `general_building`만으로 좁힌다. 건별 필수값은 단건과 같은 `validateStep`이 이미 검사한다(**V-C1**) |
| 문구 | `multi-transfer-support-messages.ts:21-22` | 「일반건물(토지·건물 일괄/환산취득가)은 단건 계산기에서만 지원됩니다.」로 바꾼다(트랙 G 완료 시 삭제) |

### 2.4 검증 (PR-1)

- **parity anchor**(route 수준, 단건 route ↔ 다건 route 1건 결정세액 일치): 오피스텔 환산(공시 후) · 환산(공시 전 §164⑥ 단서) · 실거래가 ·
  부수토지 초과분 있음 · 상속 취득(§163⑨ `commercialInheritanceValuation`) · 공익수용 §164⑨ 1호. 6건.
- **사용자 사례 anchor**: 오피스텔(1번, 먼저 양도) + 아파트(2번) 다건 200 + 오피스텔 항목의 양도차익이 단건과 같음.
- 키 분류 가드(`multi-key-coverage-f12`) 통과 · 기존 거부 anchor(`transfer.route.gb-subobject-nonform-paths` RN-3 등)에서
  상업용 3키 기대값을 「400」→「200 + 단건 일치」로 바꾼다. 일반건물 2키 거부는 그대로 둔다.
- E2E: 다건 화면에서 오피스텔 환산 + 아파트 → 계산 → 결과(환산 상세 카드) 1건.

### 2.5 미검증(V)

- **V-C1** 건별 ⑧이 상업용 환산 필수값(`cb*`)을 단건과 같이 막는가 — 다건은 건마다 단건과 같은 `validateStep(0~2)`을 부른다
  (`multi-transfer-tax-validate.ts:203-211`). 필수값 검사는 `transfer-tax-validate-commercial-asset.ts:151-156`에 있다.
  남은 확인: 그 검사가 `validateStep` 경로에서 실제로 불리는지 — ④ 빌더는 필수값이 비면 `undefined`를 돌려주므로
  (`transfer-tax-api-commercial.ts:93-96`) 못 막으면 **환산 없이 계산**된다. PR-1 첫 anchor로 고정한다.
- **V-C2** 다건 ⑭ base 객체가 상업용 환산이 쓰는 나머지 최상위 키(`transferCause`·`compensationPerSqm`·`compensationBasisStdPrice`·`capitalExpenditure` 등)를 이미 옮기는가 — §2.4 parity 6건이 답한다.
- **V-C3** 다건 결과 화면에 환산 상세 카드가 뜨는가(브라우저).

## 3. 트랙 G — 일반건물

### 3.1 단건 경로 (실측)

- route가 엔진을 거치지 않는다: `route.ts:308-400` → `dispatchGeneralBuilding`(`general-building-route-helper.ts`)이
  토지·건물 **파트 카드**를 만들어 `calculateTransferTaxAggregate`를 직접 부른다. 지분 분할(`generalBuildingShares`)은
  `route.ts:181-207` → `calculateGeneralBuildingFractional`.
- 경로별로 카드 조립 + 집계 1회 **밖에서** 하는 일:

| 경로 | 추가 처리 | 필요한 범위 |
|---|---|---|
| 공통 `dispatchGeneralBuilding` | 지분 계약서 구분 기재 축소 `scaleDeclaredSaleSplitToShare` · 의제취득일 전 상속·증여 ①②③ 재선택 `resolveGbPreDeemedRoute` · §164⑨ 공익수용 최상위 필드 주입 · 증축 일괄 실가 주입 | GB 자기 카드 |
| 환산 A `calculateGeneralBuildingTransfer` | §97②2호 swap(카드 안) · `basicDeductionAllocation: "PARTS_HIGHEST_RATE"` · 결과 슬롯 `generalBuildingValuationDetail` · 사이드바 안분 | swap은 자기 카드, 표시 슬롯은 신고 단위 |
| 실가 B `runActualGeneralBuildingOnce` | A와 같은 집계 옵션 · §159 명세 | 같음 |
| F27 이월과세 `general-building-route-carryover.ts` | 부담부증여 × 이월과세면 집계를 두 번 돌려 **신고 전체 결정세액**으로 비교 | 신고 전체 — 다건은 부담부증여·이월과세가 따로 막혀 닿지 않는다 |
| 지분 `general-building-fractional.ts` | 지분 양도가액 안분 · 외부 비교 단위 등록 | 다건은 한 건 내 다자산을 막아(`multi-transfer-tax-validate.ts:192`) 닿지 않는다 |

### 3.2 재사용할 카드 함수 — 이미 있다

`buildGbCompanionItems`(`app/api/calc/transfer/general-building-part-cards.ts:342`)는 GB 1건을 엔진 항목 배열(토지·건물 카드)로 펼친다.
단건 일괄양도에서 주 자산 GB가 이미 이 함수로 펼쳐진다(`bundled-route.ts:286`). 결과 상세는 `onDetail` 콜백으로 자산 id별로 받는다
(단건 슬롯 `generalBuildingValuationDetail`에 넣지 않는다 — 수정신고 판별자 `transfer-amendment-entry.ts:74`).

**probe 실측**(2026-11-09, `transfer.route.gb-amendment.predo.anchor.test.ts`와 같은 물건, mock 세율):

| 경우 | 단건 route | 카드를 합산 엔진에 끼움: `EARLIEST_TRANSFER` | `PARTS_HIGHEST_RATE` | `FIRST` | + 다른 토지 1건(EARLIEST) |
|---|---|---|---|---|---|
| 실가 | 198,210,000 | **198,210,000** | 198,210,000 | 198,210,000 | 267,090,000 |
| 환산 | 111,380,000 | **111,380,000** | 111,380,000 | 111,380,000 | 177,126,000 |

- 카드 id는 `land#gb1`·`building#gb1`이다(부모 id에 접미사).
- ⚠️ **한 사례 실측**이다. 두 카드가 같은 세율 구간이라 배분 축 차이가 드러나지 않는 물건일 수 있다 — **V-G1**.

### 3.3 「폼 1건 = 엔진 항목 1건」에 기대는 곳 (다건 route·화면)

| # | 위치 | 문제 | 처리 |
|---|---|---|---|
| G-1 | `multi/route.ts:164` `data.properties.map` | 1:1 변환 | GB면 `buildGbCompanionItems`로 `flatMap` |
| G-2 | `multi/route.ts:645-676` 예정신고 세액(`computePreliminaryFilingTaxes`)·가산세 enrich가 **인덱스**로 맞춘다 | 카드마다 별개 신고로 계산된다 → GB 예정신고 base 오류 · 가산세를 카드마다 실으면 **배가** | GB 1건 단위로 예정신고 세액을 구하고(카드 묶음을 합산 엔진 1회) 가산세는 카드 한 장(토지)에만 싣는다 — **V-G2**에서 단건 GB의 가산세 처리(`transfer-tax-aggregate-once.ts:377-390`)와 대조 |
| G-3 | 기본공제 축 — 다건 `EARLIEST_TRANSFER`(`:597`), 단건 GB `PARTS_HIGHEST_RATE` | 같은 날 파트 사이 순서가 다를 수 있다 | §3.2 probe에서는 같았다. 세율 구간이 갈리는 물건(토지 비사업용 중과 + 건물 일반)으로 **V-G1** 재측정 |
| G-4 | 화면이 결과를 **propertyId로** 폼에 붙인다(`MultiTransferTaxResultView.tsx:94·268` · `build-aggregate-meta.ts` · `MultiTransferFilingFormSection.tsx`) | `land#gb1`로는 라벨·양도일·지분이 조회되지 않는다 | `baseCardId`(`general-building-share-id.ts`)로 부모 id를 되찾는다 — 표시 방식은 **Q-2** |
| G-5 | 단건 전용 결과 슬롯(`generalBuildingValuationDetail`·`swapComparison`) | GB가 2건 이상이면 덮어쓴다 | 일괄양도 선례 `generalBuildingDetailsByAsset`(`bundled-route.ts:460`)를 다건 결과에도 싣는다 |
| G-6 | `buildGbCompanionItems`의 `engine` 인자 `Pick`에 `transferCause`가 없고 `estimatedPayloadOf`에 §164⑨ 주입이 없다 | 공익수용 GB가 단건과 갈릴 수 있다(의도 여부 확인 못 함) | **V-G3** — 단건 공익수용 GB ↔ 카드 함수 결과 대조. 갈리면 함수에 추가하거나 다건에서 공익수용 GB만 계속 막는다 |
| G-7 | `resolveGbPreDeemedRoute`(의제취득일 전 상속·증여 ①②③)가 `dispatchGeneralBuilding`에는 있고 카드 함수에는 있는지 확인 못 함 | — | **V-G4** |

이력 저장은 결과 전체를 그대로 저장해 인덱스 결합이 없다(`MultiTransferTaxCalculator.tsx:163-169`).

### 3.4 범위

- **포함**: 단독 소유(지분 축 A 포함) GB의 실가·환산·감정, 토지·건물 취득 방식 분리, 증축.
- **계속 차단**(이번 범위 밖): 지분 분할 취득 `generalBuildingShares`(⑫ 거부 유지) · 부담부증여 · 이월과세(각자 기존 차단 유지) ·
  V-G3/V-G4에서 단건과 갈리는 것으로 나온 하위 모드.

### 3.5 변경

| PR | 지점 | 변경 |
|---|---|---|
| PR-2 (서버) | ⑭ `multi/route.ts` | GB 항목을 `buildGbCompanionItems`로 펼침 · `onDetail`로 `generalBuildingDetailsByAsset` 수집 · G-2 예정신고 세액·가산세를 GB 단위로 |
| | ⑫ `multi-refines.ts` | `generalBuildingValuation` 거부 해제(`generalBuildingShares`는 유지) |
| | anchor | 단건 GB = 다건 GB 1건(실가·환산·분리·증축) · GB + 다른 자산 합산 · 가산세 1회만 · V-G1~V-G4 |
| PR-3 (화면) | ④ `multi-transfer-tax-api.ts` | `buildGeneralBuildingValuation(primary, form.transferDate)` + 지분 축 A는 단건처럼 `applyShareScale(…, getOwnershipRatio(primary))`(`transfer-tax-api-primary-context.ts:177-180`) |
| | ⑧ `multi-transfer-tax-validate.ts:148` | GB 차단 해제 · 문구 상수 삭제 |
| | ⑦ 결과 화면 | G-4 부모 id 묶음 · GB 환산 상세 카드(자산별) |
| | E2E | 다건: GB 환산 + 다른 자산 → 계산 → 결과 |

PR-2를 먼저 머지해도 화면은 ⑧이 막고 있어 사용자 경로에 영향이 없다. API를 직접 부르면 PR-2부터 200이 된다.

### 3.6 미검증(V)

- **V-G1** 세율 구간이 갈리는 GB(토지 비사업용 + 건물 일반)에서 `EARLIEST_TRANSFER` ↔ `PARTS_HIGHEST_RATE` 결정세액이 같은가. 다르면 **Q-3**으로 올린다.
- **V-G2** GB 예정신고 base(G-2)를 GB 단위 합산으로 구한 값이 단건 GB 가산세와 같은가.
- **V-G3** 공익수용 §164⑨ GB — 단건 route ↔ 카드 함수.
- **V-G4** 의제취득일 전 상속·증여 GB(①②③ 재선택) — 단건 route ↔ 카드 함수.

## 4. 사용자 결정(Q)

- **Q-1 순서** — (a) 트랙 C만 먼저 PR-1로 내고 트랙 G는 PR-2·PR-3 **(권장: 사용자 사례가 PR-1만으로 풀리고, 트랙 C는 엔진 변경이 없다)** ·
  (b) C·G를 한 번에.
- **Q-2 다건 결과의 GB 표시** — (a) 자산 1행(부모 id로 묶음) + 펼치면 토지·건물 카드 **(권장: 화면의 자산 번호와 결과 행이 맞는다)** ·
  (b) 카드마다 별도 행(「양도 2번 — 토지」「양도 2번 — 건물」).
- ✅ **결정(2026-11-09 사용자)**: Q-1 **a**(트랙 C를 PR-1로 먼저) · Q-2 **a**(자산 1행 + 펼치면 토지·건물).
- **Q-3**(V-G1 결과에 따라서만) 같은 날 양도한 GB 토지·건물 사이의 기본공제 순서.

## 5. 완료 기준

- [ ] 트랙 C: parity anchor 6건 + 사용자 사례 anchor 통과 · 키 분류 가드 통과 · E2E 1건 · 브라우저 확인(V-C3)
- [ ] 트랙 G: V-G1~V-G4 실측 후 anchor · 가산세 1회 anchor · E2E 1건 · 브라우저 확인
- [ ] `npx tsc --noEmit` 0건 · `npx vitest run __tests__/calc/ __tests__/api/` 통과
