# 토지·건물 취득원인 혼합 (Phase D) — 계획서 (rev.0)

> 작성 2026-10-08 · 브랜치 `docs/transfer-acq-cause-mixed` · 워크트리 `Property-related-Taxes-d` (base `0211f4558`)
> 선행: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` A·B·C 머지 완료(#1995·#1999·#2008·#2013·#2022·#2027·#2038·#2044). 그 계획서 H-3(:65)·Q-3(:340)이 이 문서다.
> 상태: **Plan 확정(2026-10-08 사용자 「순서대로 진행」 — Q-1~Q-8 권장안).** D0 머지(#2052). **D1 Design 확정(2026-10-09 — §10)**: 설계 `docs/02-design/features/transfer-acq-cause-mixed-d1.{engine,ui}.design.md`, 두 문서와 어긋나면 §10이 우선한다. D1-1 머지(#2058) · D1-2 머지(#2060) · D1-3 머지(#2063) · **D1-4 Design 확정(2026-10-09 — §11)**.

---

## 0. 요청과 결론 요약

**요청**: 토지와 건물의 **취득원인**이 다른 자산(「토지 상속 + 건물 매매」·「토지 매매 + 건물 상속·증여」·「토지 증여 + 건물 매매」)을 계산할 수 있게 한다. 사용자가 A·B·C 이후 후속 작업으로 지시했다(2026-10-06).

**결론** (§2 상세 — 엔진은 API 직접 호출 실측, UI는 Playwright·코드 추적):

| 자산 종류 | 파트별 취득원인 | 판정 |
|---|---|---|
| **일반건물**(`general_building`) | ✅ 토지 4종 × 건물 5종 독립 선택 | **이미 완료** — `GeneralBuildingAcquisitionCards.tsx:46-74`, 상속·증여 파트 추계 차단 `transfer-tax-validate-gb.ts:145-172`, 테스트 `general-building-case-4a/6/7a/7b`·`different-decedent-donor` |
| **주택·건물(토지 포함)**(`housing`·`building`, 겸용 아님) | ⚠️ 「건물 신축 + 토지 상속·증여」 1조합만 | **D의 실질 범위** — 나머지 조합은 UI 입력 경로 0, API는 받지만 일부를 조용히 틀리게 계산 |
| 겸용주택 | ❌ | **범위 밖** — 4부분 안분(B1)과 이중 안분 위험, 별도 축 |
| 상업용 건물·오피스텔·토지만 | ❌ (토지·건물 분리 자체가 없음) | **범위 밖** — `isLandBuildingSplitable`(`lib/calc/self-owns-scope.ts:21-23`) = `housing`·`building`뿐 |

⇒ D는 **주택 split 경로에 「파트별 취득원인」을 여는 일**이다. 그런데 그 전에 **지금 API가 받아서 조용히 틀리게 계산하는 결함**(이월과세 토지 무시·상속 파트 환산 통과 등, §2.3)을 먼저 막아야 한다. 권장 단계: **D0(안전장치·기존 결함) → D1(토지 상속·증여 + 건물 매매) → D2(건물 상속·증여 + 토지 매매)**, 이월과세 파트는 D 밖 별건(§5).

---

## 1. 법령 근거 (KoreanLaw 본문 조회 2026-10-08 — 법 MST 280405 시행 2026.1.1. · 영 MST 290841 시행 2026.10.1.)

| 조문 | 요지(본문 발췌) | D에서의 역할 |
|---|---|---|
| 「소득세법」 제94조 제1항 제1호 | 양도소득 = 「토지 … 또는 건물 …의 양도로 발생하는 소득」 | 토지·건물이 **별개 자산** — 파트별 원인·취득가액·보유기간의 출발점 |
| 「소득세법」 제100조 제2항 | 토지와 건물 등을 **함께** 취득·양도한 경우 각각 구분 기장 | 별개 취득은 파트 가액이 실재 → 총액 안분 모델 밖 |
| 「소득세법」 제104조 제2항 | 세율 보유기간 = 해당 자산의 취득일~양도일. 단서 **1호 상속받은 자산은 피상속인이 그 자산을 취득한 날**, **2호 제97조의2제1항 자산은 증여자가 그 자산을 취득한 날** | 세율 기산일을 **파트 원인별로**. 단순 증여는 통산 없음 |
| 「소득세법」 제95조 제4항 | 장특 보유기간 = 그 자산의 취득일~양도일. 단서: §97의2① → 증여한 배우자·직계존비속이 취득한 날, §97의2④1호 가업상속공제 비율 자산 → 피상속인 취득일 | 장특 기산. **상속은 열거 없음 → 상속개시일부터**. 이월과세는 증여자 취득일부터 |
| 「소득세법」 제97조의2 제1항 | 10년 이내 배우자·직계존비속 증여 자산 → 취득가액 = 증여자의 취득 당시 금액, 증여세 상당액 필요경비 | 이월과세 파트(§5에서 D 밖으로) |
| 「소득세법 시행령」 제162조 제1항 제5호 | 상속·증여 취득 자산의 취득시기 = 상속이 개시된 날 또는 증여를 받은 날 | 파트 취득일 |
| 「소득세법 시행령」 제163조 제9항 | 상속·증여 자산에 법 §97①1호가목을 적용할 때 상속개시일·증여일 현재 상증법 §60~§66 평가액을 **취득당시 실지거래가액으로 본다**. 단서 1호 1990.8.30. 개별공시지가 고시 전 상속·증여 토지 → 평가액과 영 §164④ 가액 중 많은 금액, 2호 건물 기준시가 고시 전 상속·증여 건물 → 영 §164⑤~⑦ 가액 중 많은 금액 | 상속·증여 파트 취득가액 = 그 파트의 평가액(**추계 아님**). 단서는 파트별 max |
| 「소득세법 시행령」 제163조 제6항 | 개산공제: 토지 = 개별공시지가 × 3/100, 건물 = 기준시가 × 3/100 | 상속·증여 파트는 실가 취급 → 개산공제 0 |
| 「소득세법 시행령」 제163조의2 제2항 | 증여세 상당액 = 산출세액 × 해당 자산가액 / 증여세 과세가액 | 이월과세 파트 안분(§5) |
| 「소득세법 시행령」 제176조의2 제4항 | 의제취득일 전 취득 자산(**상속·증여 자산 포함**)의 의제취득일 현재 취득가액 = … 중 많은 것. 부동산 의제취득일 = 영 §162⑦1호 **1985.1.1.** | 1985.1.1. 전 상속·증여 파트 |
| 「소득세법 시행령」 제154조 제8항 제3호 | 「상속받은 **주택**」으로서 동일세대 상속이면 동일세대 거주·보유 기간 통산 | 비과세 축 — 토지만 상속인 경우 적용 여부 V-3 |
| 「소득세법」 제89조 제1항 제3호 | 「주택 및 이에 딸린 토지」 실지거래가액 합계 12억 초과 고가주택 제외 | 비과세는 주택+부수토지 한 단위 |

**인용 정정** (코드·화면에 남은 오류):
- **「시행령 §95④」는 존재하지 않는 인용**이다(영 §95는 재고자산 평가방법). 단기보유 기산은 법 §104②, 장특은 법 §95④가 맞다. 남은 곳: 사용자 화면 `NewConstructionLandAcqBlock.tsx:111`(「소득세법 시행령 §166⑥·§95④」), 주석 `general-building.types.ts:175·182·184·204·210·555·562·564`.
- 영 §163④는 2000.12.29. 삭제. 의제취득일은 영 §176의2④·§162⑥⑦.
- 영 §159의4는 장특 「1세대 1주택」 정의 조문이지 보유기간 계산 조문이 아니다.

---

## 2. 현황

### 2.1 주택 split 조합표 (토지 원인 × 건물 원인)

| 토지 \ 건물 | 매매 | 신축 | 상속 | 증여 | 이월과세 |
|---|---|---|---|---|---|
| 매매 | ✅ | ✅ | ❌ UI 없음 · API는 받음 | ❌ UI 없음 · API는 받음 | ❌ API 400(`carryoverTaxation` 필수) |
| 상속 | ❌ UI 없음 · API는 받음 | ✅ `NewConstructionLandAcqBlock` | ❌ UI 없음 · API는 받음 | ❌ | — |
| 증여 | ❌ UI 없음 · API는 받음 | ✅ (단, G-8) | ❌ | ❌ | — |
| 이월과세 | ❌ UI 타입 없음 · **API는 받고 엔진이 무시**(G-1) | ❌ | — | — | — |

**막는 층** [코드]:
- ⑤ UI: 취득원인이 매매가 아니면 「취득일 다름」을 강제 OFF(`CompanionAcquisitionCauseSection.tsx:99`). 그 토글은 매매 블록 안에만 있다(`CompanionAcqDateSection.tsx`). 상속·증여 블록에는 날짜 2열이 없다.
- ① 폼 타입: `landAcquisitionCause: "" | "inheritance" | "gift"`(`calc-wizard-asset.ts:578`) — `purchase`·`carryover_gift` 불가.
- ⑫ Zod: 4종 모두 받고 의존 refine 없음(`transfer-tax-schema-base-shape.ts:258-262`, `transfer-tax-schema-split.ts:30-34`).
- 기존 주석도 같은 공백을 적어 두었다: `NonPurchaseSplitInputsBlock.tsx:23-25`(「건물만 상속받고 토지는 이전에 매매 취득한 경우 … 현 데이터 모델이 표현하지 못한다」).

**모델 컨벤션** [코드]: 주택 split은 자산 단위 `acquisitionCause` = **건물** 파트 원인, `landAcquisitionCause` = 토지 overlay(미설정이면 자산 원인을 따름 — `appurtenant-land.ts:53-70`). 일반건물은 반대로 `acquisitionCause` = 토지, `gbBuildingAcquisitionCause` = 건물. D는 주택 컨벤션을 유지한다(Q-2).

### 2.2 축별 처리 위치 (주택 split)

| 축 | 현행 | 근거 |
|---|---|---|
| (a) 취득가액 | **원인을 보지 않는다.** 파트 4방식(실가·환산·감정·매매사례)만 안다. 상속·증여 파트는 사용자가 평가액을 실가 파트 가격으로 넣는 규약 | `transfer-tax-split-acq-price.ts:248-323`, `NewConstructionLandAcqBlock.tsx:10-20` |
| (b) 세율 보유기간 §104② | 토지 파트만 `landAcquisitionCause`로 통산(상속 → 피상속인, 이월과세 → 증여자, 단순 증여 → 없음). 건물 파트는 자산 단위 원인 | `appurtenant-land.ts:53-70`, `transfer-rate-holding-basis.ts:57-69`, `transfer-tax-split-rate.ts:204` |
| (c) 장특 보유기간 §95④ | 파트별 `calculateHoldingPeriod(파트 취득일, 양도일)`. 상속은 개시일부터라 맞음. **이월과세 단서 미반영** | `transfer-tax-split-gain.ts:278-285` |
| (d) 개산공제 | 실가 파트 0 — 상속·증여 평가액을 실가로 넣으면 법령과 합치. 상속 파트를 환산으로 두는 것을 막는 장치 없음(G-2) | |
| (e) §97의2 비교과세 | **파트 단위 구현 없음**(자산 단위 `transfer-tax-carryover.ts`뿐) | |
| (f) §163⑨ 단서·의제취득일 | 자산 단위 STEP 0.45에만 있고 split 파트에 닿지 않음 | `inheritance-acquisition-helpers.ts:40`, `transfer-163-9-base-date.ts:43-48`, `sec164-required-fields.ts:113·155·179` |
| (g) 비과세 보유·거주 | 자산 단위. 부수토지가 건물보다 늦게 취득되고 보유 2년 미만이면 토지분만 과세(`isLaterAcquiredLandExemptExcluded`) — 상속 토지도 개시일 기준으로 작동(실측 W1·W2). §154⑧3호 동일세대 통산은 자산 단위 필드뿐 | `appurtenant-land.ts:94` |
| (h) 결과·신고서 표시 | split echo(`SplitPartResult`)에 원인·통산일 필드 없음. 라벨은 방식(실거래가·환산…)뿐. 신고서 split 2열의 취득일·보유기간은 엔진 echo가 아니라 폼 날짜 차 | `transfer-split-gain.types.ts`, `split-acq-text.ts`, `FilingFormTableHelpers.ts:334-352` |

### 2.3 실측 결함

공통 시드: 주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, 비과세 아님, 별개 취득, 파트 실가(토지 3억·건물 4억). `POST /api/calc/transfer` 직접 호출(⑫부터 거침, mock 세율). 기준 S0(매매/매매) 결정세액 **118,660,000**(손계산 일치). G-1·G-2는 이 문서 작성자가 재실행해 값을 다시 확인했다.

| # | 등급 | 결함 | 실측 |
|---|---|---|---|
| **G-1** | 🔴 | **토지 `carryover_gift`가 조용히 무시된다.** 장특 기산이 §95④ 단서(증여자 취득일)를 따르지 않고 §97의2① 취득가액·비교과세도 없다. UI 입력 경로는 0이지만 ⑫가 받는다 | 토지 2022-01-10 이월과세(증여자 2005) + 건물 2012: **S4a(`carryover_gift`) = S4b(`gift`) = 149,060,000**, 토지 보유 4년·장특 8%. 단서대로면 보유 21년·30% |
| **G-2** | 🔴 | **상속 토지 파트를 환산으로 보내도 통과한다**(⑧·⑫·엔진 모두). 일반건물은 막는다(`validate-gb.ts:145-172`) | S5: 토지 상속 + `landAcqMode: estimated` → 200, 토지 취득가 1억(환산)·개산공제 300만, 결정세액 173,820,000. UI 도달 여부(stale `landAcqMode`)는 확인 필요 V-9 |
| **G-3** | 🟠 | 상속 토지 파트에서 **피상속인 취득일 미입력이 차단되지 않는다** — 통산이 조용히 빠져 단기 세율 | V1: 건물 2015 + 토지 2025-02-01 상속, 피상속인일 미입력 → 세율 60%(입력 시 T2 기본세율 42%) |
| **G-4** | 🟠 | **컴패니언(함께 양도) ④가 `landAcquisitionCause`·`landDecedentAcquisitionDate`를 안 보낸다.** ⑫·⑭(`bundled-split-helpers.ts:387-389`)엔 칸이 있다 | probe: `buildAssetPayload` 결과에 두 키 없음. 화면 요청 body 재확인 V-8 |
| **G-5** | 🟠 | 사이드바 취득가액 합계 0 — 신축 + 토지 상속 시드에서 `separateAcqPartsSum` → `{sum: 1억, pending: true}`. ④·⑧은 신축비용(`fixedAcquisitionPrice`) fallback을 갖는데 ⑥만 없다(3중 패턴 이탈) | probe |
| **G-6** | 🟡 | **stale 잔존** — 「신축 + 토지 상속」에서 원인을 매매·상속으로 바꿔도 `landAcquisitionCause`·`landDecedentAcquisitionDate`·`hasSeperate…`가 남고, 지우는 UI가 없다. `buildLandPartCausePayload`(`transfer-tax-api-split.ts:260-272`)는 원인·분리 여부로 게이트하지 않는다. 원인 전환 정리(`CompanionAcquisitionCauseSection.tsx:93-108`)에 `landAcquisitionCause`가 빠져 있다 | Playwright |
| **G-7** | 🟡 | 인용 오류 「시행령 §95④」(§1 정정) — **사용자 화면** 포함 | 코드 |
| **G-8** | 🟡 | 신축 + **토지 증여**에서 「증여자 취득일」 칸과 「§104②2호로 통산합니다」 안내가 뜬다(`NewConstructionLandAcqBlock.tsx:150-169`). 그러나 엔진은 단순 증여를 통산하지 않는다(`transfer-rate-holding-basis.ts:62-65` — 2호는 §97의2① 이월과세만). **입력해도 반영되지 않는 칸 + 법령과 다른 안내** | 코드 |
| **G-9** | 🟡 | 주석 드리프트 — `calc-wizard-asset.ts:571-577`「엔진에 전달하지 않는다, UI 전용」(실제로는 ④가 보냄), `NewConstructionLandAcqBlock.tsx:21-27`·계획서 H-3「단기보유 통산 미반영」(G-4 구현으로 반영됨, 실측 T2·W1) | 코드 |
| **G-10** | 🟡 | §163⑨ 단서(1990.8.30. 전 토지 → max(평가액, 영 §164④))·의제취득일(1985.1.1.) 전 상속이 **파트에 없다**. 신축 + 토지 상속 경로는 숫자 1칸뿐. 엔진은 1984년 상속 토지도 입력값 그대로·보유 42년 | U2·U2b |

| **G-11** | 🟠 | (D0 Check에서 발견, 기존) **신축 분기 ⑧이 분리 검증에 닿지 않는다** — `transfer-tax-validate-acquisition.ts` 신축 분기가 `return null`로 끝나 `validateSplitDirectInputs`(V1 토지 평가액·V4 양도가액 구분 근거 등)를 건너뛴다. 「신축 + 토지 상속」에서 토지 평가액을 비우면 ⑧ 통과 → ⑫ V1 400(막다른 길). D0는 토지 원인 규칙만 그 분기에서 부르고(`validateLandPartCause`), **분리 검증 전체 연결은 D1**(총액 초과 검사 등이 신축비용=건물분 총액과 만나 새로 깨어날 수 있어 격자 확인 필요) | 정적 + probe |

**법령상 쟁점이지만 결함 판정 보류**:
- **S3d** — 건물 상속(피상속인 2000, 개시 2025-05-01) + 토지 매매 2025-01-10 → 건물 파트 기본세율, 토지 파트 60%로 **세율이 갈린다**(결정세액 258,060,000, 둘 다 매매인 S2a는 298,500,000). §94①1호 별개 자산 독법으로는 맞을 수 있으나 주택 단기세율(§104①2·3호 「주택(이에 딸린 토지 포함)」)과의 관계를 확인해야 한다(V-2). D2 범위.

---

## 3. 해석례·결정례

| 문헌 | 확인 | 요지 | 쓰임 |
|---|---|---|---|
| 조심 2022인5993 (2022.9.8., 기각) | **본문** | 토지 2006 상속 + 건물 1995 신축 겸용주택. 영 §163⑨가 상속 자산 평가액을 실지거래가액으로 본다고 정리. 「각 취득일자가 상이함에도 … 취득일을 상속기준일로 동일하다고 보아 감정가액을 산정」한 것은 합리적 감정이 아니라고 판단 | **토지·건물 원인이 다르면 취득가액·취득일을 파트별로** 본다는 직접 근거(취득가액 쟁점 한정) |
| 국세청 부동산거래관리과-436 (2010.3.22.) | **본문**(taxlaw, Playwright) | 부수토지 취득시기가 건물과 다르면 자산별(토지·건물) 기준시가 안분 | 취득시기가 다른 토지·건물 = 별개 자산(간접) |
| 국세청 재일46014-1771 (1999.10.4.) | **본문** | 아파트·부수토지 취득시기 상이 → 조합아파트 취득가액 산정방법에 준함 | 간접 |
| 국심1997부2011 | 본문 | 토지·건물 **소유자** 상이 쟁점 | 무관(소유자 분리 축) |
| 상속증여세과-466(2013.8.12.)·부동산거래관리과-435(2010.3.22.)·조심 2024인3140 | **미확인**(repo 인용만, 이번에 본문 미재확인) | 비과세 보유기간 파트별 판정·주택 일체과세 | V-1·V-2 |

「주택 부수토지만 상속」·「건물 매매 + 토지 상속 시 1세대1주택 보유기간을 각각 따짐」의 **정면 해석례는 찾지 못했다**(DRF 본문 검색 NOT_FOUND).

---

## 4. 단계 분할 (권장)

### D0 — 선행 안전장치·기존 결함 (독립 PR, 화면 기능 추가 없음)

지금 사용자가 이미 쓰는 「신축 + 토지 상속·증여」 경로와 API가 받는 조합의 오답을 먼저 막는다. D1이 이 경로를 일반화하므로 결함이 퍼지기 전에 고친다.

| 항목 | 내용 | 층 |
|---|---|---|
| G-1 | 주택 split `landAcquisitionCause: "carryover_gift"` 차단 refine(UI 경로 0이라 사용자 영향 없음). 엔진 throw 또는 ⑫ 400 + 메시지 「주택 토지·건물 별개 취득의 파트 이월과세는 지원하지 않습니다」 | ⑫·엔진 |
| G-2 | 상속·증여 파트 추계(환산·감정·매매사례) 차단 — 일반건물 O-3과 같은 규칙. 허용표 leaf를 하나 두고 ⑤ 필터·⑧·⑫가 공유(일반건물 `gbPartAllowedModes` 재사용 또는 승격) | leaf·⑧·⑫ |
| G-3 | 상속 토지 파트 피상속인 취득일 필수(입력 칸은 이미 있음 — `NewConstructionLandAcqBlock.tsx:150-169`) | ⑧·⑫ |
| G-4 | 컴패니언 ④에 `buildLandPartCausePayload` 연결 | ④ |
| G-5 | 사이드바 `separateAcqPartsSum`에 신축비용 fallback(④·⑧과 같은 규칙) | ⑥ |
| G-6 | 원인 전환·토글 OFF 시 토지 원인 3키 정리 patch + ④ `buildLandPartCausePayload` 게이트(분리 활성일 때만) | ⑤·④ |
| G-7·G-9 | 인용·주석 정정 | 문서 |
| G-8 | 단순 증여의 「증여자 취득일」 칸·통산 안내 제거(법 §104②2호는 이월과세만). Q-6 | ⑤ |

**D0 구현 (2026-10-08)**: 엔진 leaf `lib/tax-engine/transfer-split-part-cause.ts`(G-1·G-2·G-3 — 엔진 `calcSplitGain` throw·⑫ `refineSplitPartCause` 주 자산+컴패니언·⑧ `validateLandPartCause` 공유), 클라이언트 leaf `lib/calc/transfer-land-part-cause.ts`(유효 원인 `effectiveLandAcquisitionCause` — 블록 범위 + 분리 ON일 때만, 건물 가격 후퇴 `splitBuildingAcqPriceInput` — ④·⑥·⑧·⑤ 토글 상태 공유). G-6은 저장값을 지우는 전환 patch 대신 **읽는 쪽 파생**으로 해소(남은 값은 「없음」으로 읽는다). G-8은 칸 제거 + ④ 미전송. G-7은 화면·주석·테스트 주석 전역. 검증: Pre-Do anchor RED → GREEN, mutation 14/14 KILLED, 신규 E2E 3건.

### D1 — 「토지 상속·증여 + 건물 매매」

- 모델: `acquisitionCause = "purchase"`(건물) + `landAcquisitionCause = inheritance | gift`. **엔진 세율 기산은 이미 이 조합을 처리**한다(실측 T2·W1). 새로 필요한 것은 입력 경로·검증·표시다.
- ⑤: 「토지는 다른 원인으로 취득」 토글(현재 신축 전용 `NewConstructionLandAcqBlock`)을 **매매 건물에도 연다**(Q-3). 켜면 토지 파트 = 원인 라디오(상속·증여) + 상속개시일·증여일 + 평가액(실가 고정, G-2 leaf) + 피상속인 취득일(상속만, G-8). 건물 파트 = 기존 매매 파트 블록(4방식 그대로).
- 「취득일 다름」 토글과의 관계: 원인이 다르면 토지 취득일 칸이 필수로 열린다. 같은 날짜 허용 여부는 `isSeparateAcquisition`(`transfer-tax-split-acq-mode.ts:298-305`, 같은 날이면 false)과 충돌 — Q-4.
- 소유자 분리(`selfOwns`)와 결합: 한쪽 파트만 소유하면 원인 혼합은 의미가 없다 → 토글은 `selfOwns = both`일 때만(Q-5).
- §163⑨ 단서(1990.8.30. 전 토지 상속·증여)·1985.1.1. 전 상속: Q-7.
- 결과 표시: `SplitPartResult`에 `acquisitionCause`·`rateBasisAcquisitionDate` echo → `summarizeSplitGain` 한 곳에서 4뷰(단건 결과·상세명세서·신고서·PDF, 다건)가 받는다. 신고서 split 2열의 폼 기반 일자 계산은 echo 기반으로 교체.
- 결합 제외(⑧·⑫·엔진 3중 가드): 겸용주택·부담부증여·PHD(개별주택가격 공시 전 취득 주택 환산 — 영 §164⑦)·용도변경·공익수용·재개발/입주권/분양권·가업상속(주택 단위 판정).
- G-11: 원인 혼합 자산의 ⑧이 분리 검증(`validateSplitDirectInputs`) 전체에 닿게 한다 — 신축 경로 포함, 깨어나는 규칙 격자 확인.

### D2 — 「건물 상속·증여 + 토지 매매」

- 모델: `acquisitionCause = inheritance | gift`(건물) + `landAcquisitionCause = "purchase"`(① 타입 확장).
- 별도 단계인 이유: 상속 블록(`CompanionAcqInheritanceBlock`)은 **자산 단위 20여 칸**(상속개시일 3키 동시 기록 `:62-70`, 피상속인 취득일, 개별주택가격 평가 `inhHouseVal*` 9칸, `pre1990*`, 동일세대 3키)을 쓴다. 개별주택가격은 부수토지를 포함한 **결합 공시**라 「건물만 상속」과 의미가 충돌한다(V-4). 자산 단위 원인 소비처(상속주택 특례 `transfer-tax-api-houses.ts:140-166`, 동일세대 상속 `-residence.ts:84-90`, 가업상속 `transfer-fb-gate.ts:36`, §163⑨ 판정 3곳)가 「건물만 상속」에서 반쪽이 된다.
- S3d 세율 분기 판정(V-2)과 §154⑧3호 파트 적용(V-3)이 착수 조건.

### D 밖 — 이월과세 파트(§97의2)

주택 split 파트 이월과세는 증여자 취득일·취득가액·증여세 상당액 자산별 안분(영 §163의2②)·비교과세를 파트로 쪼개야 한다. 일반건물엔 인프라(`landCarryoverTaxation`·`buildingCarryoverTaxation`)가 있으나 주택 split엔 없다. D0에서 입력을 막고 별건으로 둔다(Q-1).

---

## 5. 범위 밖 (명시)

- 일반건물 — 이미 완료. 단 G-7 인용 정정은 일반건물 주석도 함께.
- 겸용주택 — B1 파트 모델(`mixed-use-part-acq.ts`)은 매매 전용. 원인 혼합 결합은 별건.
- 상업용 건물·오피스텔·토지만·재개발·입주권·분양권.
- 지분별 분할 취득(`splitMode === "fractional"`) — 지분마다 원인이 다른 별개 축.

---

## 6. 사용자 결정 질문

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-1** | 범위·순서 | **D0 → D1 → D2**, 이월과세 파트는 D 밖 별건(D0에서 차단) | D0 결함은 지금도 오답 가능(G-1·G-2). D1은 엔진이 이미 세율 기산을 처리해 입력·검증·표시만 필요. D2는 상속 블록 재설계와 법령 확인(V-2·V-3)이 걸림 |
| **Q-2** | 모델 컨벤션 | **주택 split overlay 유지** — `acquisitionCause` = 건물, `landAcquisitionCause` = 토지(D2에서 `purchase` 추가) | 엔진 `appurtenant-land.ts:53-70`·`split-rate.ts:204`가 이미 이 컨벤션. 부재 record = 「토지 원인 = 자산 원인」이라 마이그레이션 불필요. 일반건물식으로 바꾸면 `acquisitionCause`가 가리키는 파트가 뒤집혀 구 이력이 재해석됨 |
| **Q-3** | 위젯 배치 | **기존 「토지는 다른 원인으로 취득」 토글(취득원인 라디오 직하)을 매매(D1)·상속·증여(D2) 건물로 확대** — 별도 토글 신설 안 함 | 같은 의미의 토글이 이미 그 자리에 있음. 위→아래 인과 순서 규약(소유자 토글 이동 때 확립). 일반건물도 토글을 원인 블록 밖으로 올렸다(`GeneralBuildingAcquisitionCards.tsx:155`) |
| **Q-4** | 토지·건물 취득일이 **같은 날**인데 원인이 다른 경우(예: 같은 날 토지 상속·건물 매매) | **허용하지 않고 안내** — 원인 혼합은 날짜가 다를 때만 | `isSeparateAcquisition`이 같은 날을 총액 모델로 보낸다(`:301`). 같은 날 원인 혼합은 현실 빈도가 낮고, 허용하면 그 게이트를 공유하는 8곳에 새 분기가 생긴다(B1 Q-5와 같은 판단) |
| **Q-5** | 소유자 분리(`selfOwns`)와의 결합 | **`selfOwns = both`일 때만 원인 혼합 노출** | 한 파트만 소유하면 그 파트의 원인이 곧 자산 원인 |
| **Q-6** | G-8 단순 증여 「증여자 취득일」 칸 | **칸과 안내를 제거**(저장값은 남겨도 ④가 안 보냄) | 법 §104②2호는 §97의2① 이월과세 자산만. 엔진 동작(통산 없음)이 법령과 맞고 안내가 틀림 |
| **Q-7** | §163⑨ 단서(1990.8.30. 전 토지 상속·증여 → max(평가액, 영 §164④))·1985.1.1. 전 상속 파트 | **D1에서는 해당 날짜 이전 토지 상속·증여를 ⑧ 차단 + 안내**, max 비교 입력은 후속 | 자동 안분·자동 대체 금지. 자산 단위 STEP 0.45(`inheritance-acquisition-helpers.ts`)를 파트로 쪼개는 일은 규모가 큼. 현행 신축 + 토지 상속 경로도 같은 공백(G-10)이므로 같은 차단을 D0에 넣을지 함께 결정 필요(⚠️ 기존 사용자 입력이 새로 막힘) |
| **Q-8** | 원인 × 산정방식 허용표 | **일반건물과 동일**: 상속·증여 파트 = 실가(평가액) 1종, 매매 파트 = 4종. leaf 1개를 ⑤·⑧·⑫가 공유 | 형제 경로 기확정 정책(`validate-gb.ts:145-172`, §163⑨·§97①1호 단서) |

---

## 7. 확인 필요 (착수 조건 표시)

| # | 내용 | 착수 조건 |
|---|---|---|
| V-1 | 토지·건물 취득원인이 다를 때 1세대1주택 보유·거주기간을 파트별로 따지는지 — 상속증여세과-466·부동산거래관리과-435·조심 2024인3140 본문 재확인 | D1 Design (현행 `isLaterAcquiredLandExemptExcluded` 유지 여부) |
| V-2 | S3d 세율 분기(건물 상속 → 기본세율, 토지 매매 → 단기)가 주택 단기세율 문언과 합치하는지 | **D2** |
| V-3 | 영 §154⑧3호 동일세대 상속 통산이 「토지만 상속」에 적용되는지(문언 「상속받은 주택」) | D1(토지 상속 + 비과세) · D2 |
| V-4 | 「건물만 상속」일 때 건물분 상증법 평가액의 입력원(개별주택가격 결합 공시와의 관계) | **D2** |
| V-5 | 조정대상지역 취득 시 거주요건(영 §154① 괄호)의 기준 취득일 — 부수토지를 나중에 상속·매매한 경우 | D1 Design |
| V-6 | 증여 파트가 영 §163⑨ 괄호의 제외 목록(상증법 의제증여 등)에 해당할 때 취득가액 | D1 Design |
| V-7 | `assetKind: "building"`(건물·토지 포함 비주택)에서 D1 조합의 동작 | D1 Design |
| V-8 | 컴패니언 G-4가 실제 화면 요청 body에서도 같은지(Playwright) | D0 |
| V-9 | G-2(상속 파트 환산)가 화면에서 도달 가능한지(stale `landAcqMode`) — 도달 불가면 방어선, 가능하면 사용자 영향 | D0 |
| V-10 | 다건(`multi`) 경로 D1 조합 동작 — `buildLandPartCausePayload`를 단건·다건이 공용(`multi-transfer-tax-api.ts:288`)까지만 확인 | D1 |
| V-11 | D2에서 `acquisitionCause = inheritance` + split일 때 자산 단위 §163⑨ STEP 0.45가 파트 가격을 덮어쓰는지 | D2 |

---

## 8. 검증 계획

- **Pre-Do anchor**(memory `feedback_pre_anchor_verification`): D0 = G-1(S4a=S4b 149,060,000)·G-2(S5 173,820,000)·G-3(V1 60%)를 **변경 전 RED 기준**으로 고정 → 변경 후 각각 차단(400)으로 전환. D1 = 「토지 상속 + 건물 매매」 결정세액 손계산 anchor(엔진은 현행 그대로여야 함 — 입력 경로만 여는지 확인).
- **mutation probe**: 허용표 leaf·피상속인 필수·컴패니언 ④·stale 정리 patch 각 1건 이상 KILLED.
- **⑧ ↔ ⑫ 격자**: 토지 원인 × 건물 원인 × 파트 모드 × 결합 제외 플래그 — 「⑧ 차단 ⇔ ⑫ 차단」(memory `feedback_fe8_vs_12_parity_grid`).
- **E2E**: D1 신규 조합 입력 → 계산 → 4뷰 표시(원인 라벨·통산일), 요청 body 신규 필드 확인. 원인 전환 stale 정리.
- **회귀**: 「신축 + 토지 상속·증여」 기존 테스트 전건, 일반건물 원인 혼합 테스트 전건, FULL pre-push.
- Check: `ui-engine-sync-checker`(14지점) + `acquisition-cost-review`(§163⑨·§104②·§95④ 체인).

## 9. 위험

- 토글 확대가 `isSeparateAcquisition`을 공유하는 8곳(주택·사이드바·validate·lump-sum 게이트 등)에 상속·증여 자산을 새로 끌어들임(memory `feedback_ui_gate_expansion_activates_latent_defect`) — `hasSeperateLandAcquisitionDate` 비매매 강제 OFF(`:99`)를 푸는 순간 V1·V2 파트 완결 규칙이 비매매에서 켜진다. 「칸 없는 차단」 격자 대조 필수.
- G-3·Q-7 차단은 기존 저장 이력을 새로 막을 수 있다 — 안내 문구와 입력 칸 위치(필드 이동)를 함께.
- 다건·컴패니언·단건 3경로의 ④가 갈림(G-4 실례).

---

## 10. D1 Design 확정 — 엔진·UI 설계 대조와 결정 (2026-10-09)

설계: 엔진 `docs/02-design/features/transfer-acq-cause-mixed-d1.engine.design.md`(transfer-tax-senior) · UI `…-d1.ui.design.md`(transfer-tax-ui-senior), Pre-Do anchor `__tests__/api/transfer.route.split-land-part-cause.d1.predo.anchor.test.ts`(활성 26 · skip 1 · todo 11 통과) · `__tests__/calc/transfer-land-part-cause.d1.predo.test.ts`(활성 12 · todo 11 통과). **두 문서와 이 절이 어긋나면 이 절이 우선한다.**

### 10.1 사용자 결정 (2026-10-09, 전부 권장안)

| # | 결정 | 설계 문서에 미치는 영향 |
|---|---|---|
| **U-1** (Q-7 = 엔진 Q-D1-1 · UI Q-D1-UI4) | **A — 토지 취득일 < 1990-08-30 인 상속·증여 토지 파트를 엔진·⑫·⑧ 3중 차단**, 이미 열린 「신축 + 토지 상속·증여」 경로 포함. 파트 max 비교 입력(B, 일반건물 선례)은 D1 직후 별도 PR(**D1-4**) | 엔진 R-Q7 · UI §4 Q-7 행 그대로 |
| **U-2** (G-11 = 엔진 Q-D1-6 · UI Q-D1-UI5) | **D1에 포함** — 신축 블록에 파트 자본적지출 칸(`landDirectExpenses`·`buildingDirectExpenses`) 신설 + 신축 분기 ⑧을 `validateSplitDirectInputs`로 연결 | UI §5 그대로 |
| **U-3** (Q-5 범위 = UI Q-D1-UI3) | **신축·매매 모두** 소유자 분리 ↔ 토지 원인 토글 상호 잠금. 엔진 R-X4(⑫ 차단)는 호스트 무관 그대로 | **UI 문서 수정**: §4 Q-5 행 「매매만」→「신축·매매」, §7 신축 N 셀 「`selfOwns≠both` 현행 유지」 → 차단, §1.2 셀 14 → Q-5 차단. 매매만 잠그면 신축 셀 14가 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 된다 |
| **U-4** (결합 제외 = 엔진 Q-D1-2) | **공익수용·비주택→주택 용도변경은 막지 않는다**(엔진이 두 축을 교차해 읽지 않음 — 실측 D1-6c). 막는 것: 부담부증여(R-X1)·PHD(R-X2)·가업상속(R-X3)·소유자 분리(R-X4)·건물 비매매·비신축(R-X5) | **UI 문서 수정**: §4 「결합 제외」 행에서 용도변경·공익수용 제거. 공익수용 + 나중 취득 부수토지 비과세 해석(엔진 R-7)은 원인 무관 기존 동작 — 별건 |

### 10.2 기술 대조 결정 (설계자 간 불일치 해소)

| # | 불일치 | 결정 |
|---|---|---|
| T-1 | echo 필드 — 엔진 5필드(`acquisitionCause`·`acquisitionDate`·`rateBasisAcquisitionDate`·`rateBasisRule`·`appliedRateBasisDate`) + `mixedCause` / UI 가칭 2필드 | **엔진안 채택.** 화면 「세율 기산일」은 **`appliedRateBasisDate`**(세율 판정에 실제 쓰인 값 — 주택 토지는 `max(법정 기산일, 건물 취득일)`), 보조 문구는 `rateBasisRule`(「피상속인 취득일」 등 — 날짜 비교로 재추론 금지). 원인·기산일 행은 **`mixedCause`일 때만** 렌더(기존 화면 diff 0). 신고서 split-2열 취득일 = `acquisitionDate` echo, 구 이력은 폼 후퇴 |
| T-2 | G-12(원인 유효 + 토지 취득일 비움) — UI ⑧만 차단, 엔진 leaf는 토지일 없으면 `[]`(엔진 R-5 「잔여」) | **엔진 leaf에 규칙 추가**(⑧ 차단 ⇔ ⑫ 차단). `isSplitable ∧ 원인 ∈ {상속, 증여} ∧ 토지 취득일 없음` → 「토지 상속개시일(증여일)을 입력하세요」, field `landAcquisitionDate`(`SplitPartCauseField` 확장). 구현 전 `landAcquisitionCause`만 있고 토지일 없는 기존 픽스처를 전수 grep(엔진 R-1) |
| T-3 | PHD — 엔진 R-X2 ⑫ 전용 메시지 차단 / UI 「무시」(⑤ 미렌더·④ 미전송·⑧ 미요구 — 건물 취득일 < 2005-04-29 자동 ON 플래그) | **둘 다 채택** — 층이 다르다. 화면 경로는 ④가 PHD를 보내지 않아 ⑫에 닿지 않고, R-X2는 API 직접 호출 방어선. 「⑧ 통과 ↔ ⑫ 400」 셀 없음 |
| T-4 | Q-4 같은 날 | **⑧(⑤)만 차단, ⑫ 비차단**(엔진 Q-D1-3). 같은 날이면 주택 `max`가 통산을 무효로 만들어 엔진 값이 원인 없음과 같다(D1-4a) — ⑧이 더 엄격한 방향이라 막다른 길 아님 |
| T-5 | 1990.8.30. 상수 | 엔진 leaf `SEC_163_9_LAND_FIRST_DISCLOSURE`가 정본, `lib/calc`의 같은 값 상수는 re-export |
| T-6 | 의제취득 클램프(`CompanionAcqDateSection.tsx:70-75` — 토지일을 1985-01-01로 덮어씀, UI 발견) | 토지 원인 유효 시 **클램프 비활성**. ⚠️ D1-2 정정: 「끄지 않으면 Q-7이 발동하지 않는다」는 틀렸다(1985-01-01도 1990-08-30 전이라 어느 쪽이든 차단된다). 근거는 원값 저장·사용처 파생 — 상속개시일은 사실값이고, D1-4 max 비교에서 원 날짜가 의제취득일(영 §176의2④) 전인지가 산식을 가른다 |
| T-7 | 비과세 축 안내 — 엔진 Q-D1-4(warning 추가) / UI Q-D1-UI10(엔진 결론 후) | **엔진 warning 1줄 추가**(1세대1주택 + 나중 취득 상속 토지로 토지분이 비과세에서 빠질 때 — 세액 불변). 별도 UI caption 없음(V-1·V-5는 「확인 필요」 유지) |
| T-8 | UI 단독 결정 | 채택: 호스트 태그 `landCauseHost`(Q-D1-UI1 — 클라이언트 전용, ⑨~⑭ 무영향), X안 레이아웃(UI2), `LandPartCauseBlock` 개명(UI6), 매매 호스트 이월과세 고지 카드(UI9), 신고서 echo 우선(UI8), 매매 경로 `validateLandPartCause` 선호출(UI §4), 건물가 신축비용 후퇴를 신축 호스트로 한정(S7) |

### 10.3 PR 순서 (D1 내부)

| PR | 범위 | 이유 |
|---|---|---|
| **D1-1** | 엔진 leaf 확장(R-X1~X5·R-Q7·T-2) + ⑫ 사실 공급 + 신축 경로 정비(G-11 연결·파트 자본적지출 칸·G-12·G-13 칸 앵커·Q-5 상호 잠금·T-6 클램프) | 지금 열려 있는 신축 경로의 침묵 오답·막다른 길을 먼저 닫는다. 매매 개방 전에 규칙이 서 있어야 게이트 확대가 결함을 퍼뜨리지 않는다 |
| **D1-2** | 매매 호스트 개방 — `landCauseHost` ①②③, `landPartCauseApplicable` 확대, X안 위젯, PHD 무시(T-3), ⑧ 순서 | D1 본체 |
| **D1-3** | 결과 echo(엔진 5필드 + `mixedCause`) + 4뷰·다건 표시 + T-7 warning | 표시 전용(세액 불변) |
| **D1-4** | Q-7 B — 1990.8.30. 전 상속·증여 토지 파트 max 비교 입력(일반건물 `transfer-pre1990-gb-bridge.ts` 선례) | U-1 후속 |

각 PR: Pre-Do anchor RED → GREEN, mutation probe, ⑧↔⑫ 격자, FULL pre-push, Check(`ui-engine-sync-checker` + `acquisition-cost-review`).

**D1-1 구현 (2026-10-09)**:
- 엔진 leaf `transfer-split-part-cause.ts`에 D1 규칙 추가. 발동 조건은 `landAcquisitionCause ∈ {상속, 증여}`일 때만이다. 순서 = 구조(R-X1 부담부증여 · R-X2 PHD · R-X3 가업상속 · R-X4 소유자 분리 · R-X5 건물 비매매) → G-12 토지 취득일 → G-1 → Q-7(`< 1990-08-30`) → G-2 → G-3.
- 엔진 호출을 `calcSplitGain`의 토지 취득일 조기 반환 **앞**으로 옮겼다. 그래야 G-12가 엔진에서도 throw된다. ⑫ `refineSplitPartCause`는 같은 사실을 주 자산·컴패니언 양쪽에 공급하고, ⑧ `validateLandPartCause`는 ④가 실제로 보내는 값으로 공급한다. Q-4 같은 날은 ⑧ 전용이다.
- 신축 분기 ⑧은 이제 `validateSplitDirectInputs`를 반환한다(G-11).
- 신축 블록 변경:
  - 칸 앵커 추가(G-13): `landAcquisitionDate`·`landAcquisitionPrice`·`landAcquisitionCause`.
  - 파트 자본적지출 칸 신설.
  - 날짜 안내: Q-4·Q-7.
- 소유자 분리 ↔ 토지 원인 토글 상호 잠금(Q-5)은 켜는 방향만 막는다.
- 검증: route anchor 전환 8건(D1-4b·5a·6d·6e·6f·6g + 신규 D1-5a′·5a″·6i), 클라이언트 B1~B8 전환, leaf·엔진·⑫ 컴패니언 테스트 28건, mutation 16/16 KILLED, E2E 신규 3건 + 신축·소유자 분리 관련 E2E 59건 통과.
- T-6(매매 날짜 칸 의제취득 클램프)은 매매 호스트에만 있어 D1-2로 넘긴다.
- **Check 후속(sync 검사 F1~F4)** — D1-1이 만들거나 신축으로 넓힌 막다른 길:
  - **F1**: 매매에서 자동으로 켜진 PHD 플래그가 남은 신축 자산은 끌 토글이 없는데 ⑧ R-X2로 막혔다. T-3를 앞당겨 ④ `phdPayloadActive`가 토지 원인 유효 시 거짓을 반환하게 했다. ⑧ 사실도 같은 값을 쓰고, ⑫ R-X2는 API 직접 호출 방어선으로 남는다. ⑧의 `usesPhdGate`(11칸 요구)는 매매 경로에서만 닿으므로 D1-2에서 같은 조건을 건다.
  - **F2**: 신축 + 소유자 분리 + 자산 단위 자본적지출이면 파트 칸이 없었다. 공용 `SplitPartCapexFields`를 비-매매 소유자 분리 블록에도 두었다(소유 파트만 렌더). ⑧ 이동 칸은 소유 파트로 정했다(건물만 소유 → 건물 칸 — 매매 호스트의 같은 결함도 해소).
  - **F3**: 부담부증여 + 소유자 분리에서 ⑧ V4·V7이 화면에 없고 ④도 보내지 않는 양도측 칸을 요구했다. 부담부증여면 요구하지 않는다(매매 꼬리 호출의 기존 막다른 길도 해소).
  - **F4**: 부담부증여면 토지 원인 토글 켜기를 막는다.
  - 검증: mutation M17~M19 KILLED. M20(`usesPhdGate`)은 D1-1에서 도달 불가라 그 변경을 되돌렸다.
- **법령 리뷰 정정**: PHD 메시지 인용 「영 §164⑤」 → **§164⑦**. 영 §164⑤는 「기준시가 고시 전 취득 **건물**」이고, 개별주택가격·공동주택가격 공시 전 취득 **주택**은 ⑦이다(MST 290841 본문). 저장소 주석 약 35곳에 남은 「PHD §164⑤」 관용 표기는 별건이다.

**D1-2 구현 (2026-10-09)**:
- `landCauseHost`(①②③, 클라이언트 전용). 구 세션은 `deriveLandCauseHost`가 도출한다: 신축+원인 → `newConstruction`, 그 밖 → `""`(잔재 무효).
- 클라이언트 leaf: 호스트를 신축·매매로 넓혔다. 유효 원인은 호스트 태그가 지금 취득원인과 같을 때만 성립한다. 신축비용 후퇴는 신축 호스트로 한정했다(S7).
- `NewConstructionLandAcqBlock` → `LandPartCauseBlock`(호스트 분기, testid 분리). 매매 호스트는 X안이다:
  - 「취득일 다름」 강제 ON·잠금, 토지 칸 라벨(상속개시일·증여일·평가액), 토지 방식 고정 안내(`part-acq-mode-land-fixed`).
  - PHD 토글 미렌더, 의제취득 클램프·배지 비활성(T-6), 같은 날·1990 전 안내.
- ⑧: 매매 경로에서 `validateLandPartCause`를 먼저 호출한다. `usesPhdGate`에도 토지 원인 조건을 걸었다(T-3 완결).
- 검증:
  - D1-Z3 ⑧≡⑫ 40셀 활성, C1~C11.
  - mutation 11/11 KILLED(단위 6 + E2E 5).
  - 신규 E2E 4건 + 관련 E2E 191건 통과.
- **Check 후속(sync 검사 F1·F2)**:
  - **F1**: 원시 `usePreHousingDisclosure`를 읽는 4곳이 PHD 무시에 빠져 있었다. 매매 호스트에선 정상 흐름이었다 — 건물 취득일이 2005-04-29 전인 주택은 플래그가 자동으로 켜진다. 4곳은 ④ `usesPhd` 단건·다건, ⑧ `validateLandPartCause` 토지 취득일 후퇴, ⑤ 기준시가 안내다.
    - 증상: 토지일을 비우면 G-12를 건너뛰어 토지 원인이 침묵 탈락했다. 레거시 환산에서는 ⑧ 통과 후 ⑫ 400이 났다.
    - 수정: 공용 술어 `phdFlagEffective`(플래그 ∧ 토지 원인 무효)로 통일했다. `phdPayloadActive`·`usesPhdGate`도 같은 술어를 쓴다.
  - **F2**: 원인 라디오가 토글을 켠 호스트를 떠나면 `landCauseHost`를 비운다(원인 값은 보존). 종전엔 매매 → 상속 → 매매 후 「취득일 다름」만 켜도 그 방문에서 켠 적 없는 원인이 되살아났다.
  - 검증: C12~C14, E2E 1건 추가. mutation P1·P2b·P3·P4 KILLED, P2(토지일 후퇴식의 PHD 항)는 동치 변이다 — 원인 유효 시 `phdFlagEffective`가 항상 거짓이고, 토지일이 비면 G-12에서 먼저 반환된다.

**D1-3 구현 (2026-10-09, 표시 전용 · 세액 불변)**:
- 엔진 echo — `SplitPartResult`에 5필드(`acquisitionCause`·`acquisitionDate`·`rateBasisAcquisitionDate`·`rateBasisRule`·`appliedRateBasisDate`). 생성은 leaf `transfer-split-part-echo.ts` 한 곳, `calcSplitGain` 두 반환 지점(일반·PHD)이 spread한다. 판정 함수는 새로 쓰지 않았다 — `resolveRateBasis`(규칙까지 내도록 일반화)·`resolveLandRateBasis`·`resolveAppurtenantLandRateBasisDate` 재사용.
- `summarizeSplitGain`: echo 통과 + `mixedCause`(소유 파트 둘 다 원인이 있고 서로 다름) + `rateBasisShown`. 어휘는 `splitCauseLabel`(입력 라디오와 같은 단어), 보조 문구는 `splitRateBasisNote` — 4뷰가 같은 문장을 쓴다.
- 4뷰(원인이 같거나 echo 없는 구 이력이면 종전 화면 그대로):
  - 결과 카드: 「취득 원인」·「세율 기산일 (소득세법 §104②)」 행, 보유연수 라벨 「(장기보유특별공제)」.
  - 상세명세서: 산출세액 행 ※(명세서 화면은 일자 그룹을 렌더하지 않는다 — 처음 「취득일자」 항목에 달았다가 E2E에서 화면에 안 보이는 것을 발견해 옮겼다), 취득가액 파트 태그 「토지(상속개시일 평가액)」.
  - 신고서 split-2col: 토지 취득일 = echo, 취득일 칸 각주.
  - PDF: 카드와 같은 행. 다건 카드는 같은 컴포넌트라 자동.
- T-7: `laterInheritedLandExemptNotice` — 토지만 나중에 상속받아 2년 미만으로 비과세에서 빠질 때 경고 1줄(영 §154⑧3호 문언 「상속받은 주택」 — MST 290841 본문 확인).
- **Check 후속(sync 검사, 사용자 「제안대로」)**:
  - **F1**: 파트 세율 게이트(결손·소유자 분리·세율 특칙 등)로 자산 단위 세율이 쓰이면 파트 「세율 기산일」은 계산에 쓰이지 않았는데 화면에 났다(실측: 건물 2025-03 차손 + 토지 상속 → 화면 피상속인 기산 · 실제 단기세율). `evaluateSplitPartTax`가 `judged`(파트 기산일로 세율 판정 — 세율이 같아 합친 게이트 7 포함)를 내고, 실제 세액 호출부(단건 STEP 7 · 다건 `assetTaxOf`)가 `splitDetail.partRateBasisApplied`로 싣는다(§99의3 감면 전 재계산은 싣지 않는다 — 같은 헬퍼 2회차가 덮어쓰지 않게). 뷰는 `rateBasisShown`일 때만 세율 기산일을 내고, 아니면 원인만.
  - **F2**: 신고서 토지 취득일 echo는 원인이 다를 때만 — 원인이 같으면 종전 폼(이월과세 증여자 취득일 override가 토지 열에 이어지던 동작 보존).
- 검증: 엔진 anchor 29건(E-1~E-8·T-7)·UI anchor 19건·E2E 2건 신규, 관련 vitest 18,904건·E2E 46건 통과. mutation 27건 중 26 KILLED — N9(다건 `assetTaxOf` 대입 제거)는 단건 엔진이 같은 객체에 이미 같은 판정을 써 두어 구별 불가(다건 재계산 판정이 단건과 갈리는 시드 미확보).
- 남긴 것(Low): 다건 상세명세서·건별 신고서에는 ※·각주가 없다(카드는 있음 — 건별 신고서 어댑터가 `splitDetail`을 싣지 않는다) · §155⑳ 임대 특례 경로는 G-3 제외 자체가 없어 T-7도 없다(기존 동작) · 소유자 분리 자산의 `appliedRateBasisDate`는 주택 `max` 값이라 실제 세율 입력(토지일)과 다르다(표시 안 됨 — `rateBasisShown` 거짓).

---

## 11. D1-4 Design 확정 — 1990.8.30. 전 상속·증여 토지 파트 max 비교 (2026-10-09)

설계: 엔진 `docs/02-design/features/transfer-acq-cause-mixed-d1-4.engine.design.md` · UI `…-d1-4.ui.design.md`. Pre-Do: `__tests__/api/transfer.route.split-land-part-cause.d1-4.predo.anchor.test.ts`(활성 15 · todo 9) · `__tests__/calc/transfer-land-part-cause.d1-4.predo.test.ts`(활성 23 · todo 14). **두 문서와 이 절이 어긋나면 이 절이 우선한다.**

### 11.1 결정

| # | 결정 | 비고 |
|---|---|---|
| D14-1 | **엔진이 max** — ④는 ①평가액(`landAcquisitionPrice`)과 ②§164④ **총액**(신규 `landSec164Value`, ①과 같은 지분 스케일)을 함께 보낸다. 엔진이 split 파트 취득가액 산정 한 곳에서 `max(①, ②)`(동점 = 평가액), land 파트 echo `acquisitionBasis{reported, sec164, adopted}` | 사용자 결정(2026-10-09, 「총액 1개 전송」). UI V2(㎡당 전송) 기각. ㎡당 × 면적은 클라이언트 브리지 한 함수(`multiplyByArea`)가 정본 — ⑤ 표시와 ④가 같은 함수 |
| D14-2 | 단서 구간(유효 토지 원인 상속·증여 ∧ 토지 취득일 < 1990-08-30)에서 ② **필수** — 미입력이면 엔진·⑫·⑧ 차단(field `landSec164Value`, ⑧은 첫 미완 칸으로 이동) | 엔진·UI 합의. 현행 Q-7이 전부 막고 있어 새로 막히는 사용자 없음 |
| D14-3 | 증여 토지 포함(영 §163⑨ 단서 1호 「상속 또는 증여받은 토지」) | 합의 |
| D14-4 | **1985.1.1. 전도 산식 동일**(영 §163⑨ 가목 — 의제취득일 조건 없음, 영 §176의2④는 나목 계열). 엔진 클램프 없음. **T-6 근거 문장 정정**: 원 날짜가 가르는 것은 ② 시점 라벨·보유연수 표기뿐이다 | 합의, `gb-pre1985-163-9` anchor·`calcPreDeemed`와 일치 |
| D14-5 | **일부 양도(`areaScenario === "partial"`) + 단서 구간은 이번엔 차단**(엔진·⑫·⑧ — leaf 사실 추가). 평가액이 취득 전체분인지 양도분인지 미확정, 자동 안분 금지 | 사용자 결정(2026-10-09) |
| D14-6 | 입력 카드는 토글 없이 상시(단서 구간이면 열림), `pre1990Enabled` 래치 불사용. 신규 `AssetForm` 키 0 — 등급 3·1990 ㎡당가·등급 모드·`acquisitionArea` 재사용(혼합 원인 상태에서 다른 소비처 전부 불활성 실측) | 합의 |
| D14-7 | ⑥ 사이드바 취득가액은 단서 구간에서 pending(결과 도착 전 숨김) | UI 권장 |
| D14-8 | **PR 2분할** — D1-4a 엔진·⑫·⑭·④·브리지(⑧은 계속 막음 — 화면 변화 0, 막다른 길 없음) → D1-4b ⑤ 위젯·⑧ 완화·⑥·⑦ 4뷰·E2E | 합의 |

**D1-4a 구현 (2026-10-09, 엔진·⑫·⑭·④·브리지 — 화면 변화 0)**:
- 엔진 `resolveLandPartAcquisition`(`transfer-tax-split-acq-price.ts`)이 단서 구간에서 `max(①, ②)`, land echo `acquisitionBasis{rule, reported, sec164, adopted}`. 공유 술어 `isSec163_9LandProviso`(leaf)를 엔진·⑫·④·브리지가 쓴다.
- leaf R-Q7 교체: 단서 구간 ∧ 일부 양도 → `areaScenario`(⑫ 경로 `isPartialAreaTransfer`) · ② 없음 → `landSec164Value`. ⑧은 화면에 ② 칸이 없어 계속 막는다(문구는 「이 계산기 화면은 §164④ 가액 입력을 받지 않아」 — 화면 사실).
- ④ 브리지 `lib/calc/transfer-pre1990-housing-land-bridge.ts`: 5필드 + `acquisitionArea`(`resolveAcqAreaForStdPrice`) → ㎡당 × 면적 × 지분(`multiplyByAreaShare`, floor 1회). `buildLandPartCausePayload` 한 곳이라 단건·다건·컴패니언 동일(실측).
- **Check 후속**:
  - (취득가액 리뷰 Low) ① 없음 + ② 있음이면 ②만으로 취득가액이 됐다(엔진 직접 호출 — 「미입력 → null 승격 → 차단」 우회). ① 없으면 비교하지 않는다.
  - (sync 검사 Low-2) 별개 취득이 아니면(총액 안분) 파트 ①을 쓰지 않는데 echo가 「② 채택」이라 했다(API 직접 호출). 별개 취득일 때만 비교·echo.
  - (sync 검사 Low-1) ⑧ 이동 칸 `areaScenario` 앵커가 화면에 없었다 → 「면적 입력 방식」 래퍼에 `data-field`.
  - 세 수정 모두 되돌리면 실패하는 테스트로 고정(mutation 3/3 KILLED).
- 검증: tsc 0, 관련 vitest 13,617건(에이전트) + 추가 3건, mutation 27건 중 25 KILLED(2건 동치 — ⑫가 먼저 막아 엔진 `isPartialAreaTransfer`에 닿지 않음) + Check 후속 3/3.
- **D1-4b로 넘김**: ⑧ ② 사실을 브리지 파생값으로 교체할 때 날짜는 ⑧의 `landDateSent`와 같은 식을 쓸 것(브리지는 `asset.landAcquisitionDate` 직독 — 지금은 소유자 분리·PHD가 구조 규칙으로 막혀 어긋나지 않음). 1985.1.1. 전 취득의 ② 「취득시」 등급 시점 라벨(법률 제4803호 부칙 §8 · 조심2010서1195 — 본문 미조회, 확인 필요)은 위젯 라벨 `sec164AcqTimePointLabel` 규약 확인.
- 별건(기존 동작, D1-4 신규 아님): `pre-1990-land-valuation.ts`의 100% 상한(CAP-2)을 「취득일 ≥ 1990-01-01」로 대리하는 판정 — 규칙 §80⑥ 조건(직전 시가표준액 동일)과의 정합 확인 필요.

**D1-4b 구현 (2026-10-09, UI — ⑤⑥⑦⑧ · 세액 불변)**:
- ⑤ `LandSec164Card`(신규) — `Pre1990LandValuationInput`을 `alwaysOpen`으로 재사용(`onCalculatedPrice` 미사용 = 미러링 0). 신축 호스트는 `LandPartCauseBlock` 그리드 아래, 매매 호스트는 `LandBuildingSplitSection` ① 토지 평가액 아래. 노출은 브리지 `landSec164Applies`일 때만. 표시 ㎡당·② 총액은 ④와 같은 브리지 함수. `Pre1990LandValuationInput`은 좁은 폭(모바일)에서 등급 3칸·공시지가 칸이 잘려 `max-w-24 min-w-0`·`flex-wrap`으로 보정(공용 컴포넌트, 스크린샷 확인).
- ⑧ `validateLandPartCause`의 ② 사실 = `deriveHousingLandSec164Total`(날짜는 `landDateSent`를 넣은 사본). 단서 구간 필수: 면적 → 현재 → 직전 → 취득시 등급 → 1990 공시지가(`sec164LandPartStatus`) → 불량 등급(`invalidSec164GradeField`). 임시 문구 `LAND_SEC164_SCREEN_MESSAGE` 삭제, `landPartCauseDateNotice`는 Q-4만. ⑧≡⑫ 128셀 격자(호스트 2 × 원인 2 × 날짜 4 × 입력 8) 활성 — 전 셀 일치.
- ⑥ `separateAcqPartsSum` — 토지 소유 ∧ 단서 구간이면 `pending`.
- ⑦ `splitAcqBasisView`/`splitAcqBasisFormula`(display leaf)로 4뷰 공통: 카드 비교 블록·상세명세서 파트 태그(② 채택이면 「토지(영 §164④ 가액)」)와 한 줄 산식·신고서 취득가액 각주·PDF 행. echo 없는 구 이력은 종전.
- 1985.1.1. 전 ② 「취득시」 등급 라벨은 기존 `sec164AcqTimePointLabel` 규약을 그대로 쓴다(`Pre1990LandValuationInput`이 `landAcquisitionDate`를 받음). 「소득세법」 부칙(법률 제4803호, 1994.12.22.) **제8조 본문 확인(2026-10-09, 법제처 DRF `target=law` 현행 MST 280405의 부칙단위 — 「[전문개정 1995.12.29]」)**: 「제94조제1호에 규정하는 자산으로서 1984년 12월 31일이전에 취득한 것은 1985년 1월 1일에 취득한 것으로 보며 …」 ⇒ 1985 전 취득 토지의 ② 「취득시」 등급 = 1985.1.1. 시점 등급이 맞고 기존 라벨 규약과 일치한다(조심2010서1195 재결 요지와도 같다). MCP 조회 실패는 MST 오진이었다(memory `feedback_addenda_query_needs_amendment_mst` — 현행 MST로 부르면 부칙 전부가 딸려 온다).
- **D1-4b Check 후속(sync 검사)**:
  - **Medium**: 단건 결과 도착 후에도 사이드바 취득가액이 「계산 후 표시」에 갇혔다(단건 fallback 체인이 `splitDetail`을 읽지 않음 — D1-4b의 입력 단계 pending이 만든 퇴행, 세액 불변). 단건 결과에 `acquisitionBasis`가 있으면 `summarizeSplitGain().acquisitionDeducted`(bundled split 분기와 같은 정본)로 해소. 회귀 `__tests__/calc/split-land-sec164-sidebar.d1-4b.test.ts`(route 경유 신축·매매) — 수정 제거 시 2건 실패.
  - **Low**: ④ 브리지 면적 파싱이 콤마를 지우지 않아 stale 「1,200」에서 카드 ②와 ④ ②가 갈렸다 → 단건 §164④ 경로와 같은 콤마 제거. 제거 변이 KILLED.
  - 남김(기존 관행 — 신규 아님): ⑧ 메시지 「1990.1.1. 개별공시지가」 ↔ 공용 위젯 라벨 「1990.8.30. 개별공시지가」 문구 차이(`sec164LandStatus`·`sec164HouseStatus` 공통), `pre1990GradeMode` 미지정 해석(factory·migration이 항상 채움). 다건 합산 신고서 비교 각주 없음(swap 각주와 같은 계열 갭).

---

## 12. D2 Design 확정 — 건물 상속·증여 + 토지 매매 (2026-10-09)

설계: 엔진·법령 `docs/02-design/features/transfer-acq-cause-mixed-d2.engine.design.md`(V-2·V-3·V-4·V-11 법령 확인 절 포함) · UI `…-d2.ui.design.md`. Pre-Do: `__tests__/api/transfer.route.split-building-cause.d2.predo.anchor.test.ts` · `__tests__/calc/transfer-land-part-cause.d2.predo.test.ts` · `…d2.predo.render.test.tsx`. **두 문서와 이 절이 어긋나면 이 절이 우선한다.**

### 12.1 사용자 결정 (2026-10-09)

| # | 결정 | 근거 |
|---|---|---|
| D2-Q1 | 토지가 상속 **전**에 취득된 경우 토지 파트 세율 기산 = **현행 상속개시일 앵커**(주택 토지 `max(법정 기산일, 건물 취득일)`의 건물 취득일 = 상속개시일) + 두 기산이 갈릴 때 결과 고지 1줄 | 소유자 기준 해석(서면-2024-부동산-0428 등)과 일치·현행 구현. 피상속인 앵커(유리, 최대 85,000,000 차이)는 정면 근거 없음 |
| D2-Q3 | 건물만 상속 → 영 §154⑧3호(동일세대 상속주택 통산) **적용**(엔진 현행) — 동일세대 3키 화면 유지·④ 전송, 「확인 필요」 표기. §155②(상속주택 특례)·§167의3①7호는 **미적용** + 확인 필요 | 「상속받은 주택」= 건물(문언). D1 「토지만 상속 = 미적용」과 대칭 |
| D2-Q5 | 토지 overlay 부재 + 건물 상속·증여 + 분리 입력 → **⑫·엔진 차단(Y8)** | 현행은 매매 토지를 상속 토지로 읽어 238,500,000 → 133,060,000 침묵 과소 |

### 12.2 합의(두 설계 일치 — 권장안 채택)
- 범위: 건물 {상속, 단순 증여} × 토지 매매(4방식). 건물 평가액 직접 입력 1칸(실가 1종 — V-4: 개별주택가격 결합 공시, 서면4팀-1462 안분은 후속). 세액 산식 변경 0.
- 건물 취득일(상속개시일·증여일) < 2005-04-30(영 §163⑨ 단서 2호 구간의 보수적 상위 집합)은 D2-1에서 엔진·⑫·⑧ 3중 차단, max 입력은 D2-4.
- leaf D2 분기(Y1 구조 차단 · Y2 토지 취득일 · Y3 건물 실가 1종 · Y4 경계일 · Y7 자산 단위 평가 payload 동봉 차단 · Y8), R-X5 개정(건물·토지 둘 다 상속·증여는 계속 차단 — D3). 같은 날은 ⑧ 전용.
- **술어 분리**(UI §): D1 `effectiveLandAcquisitionCause`는 상속·증여만 반환(의미 유지), D2는 `effectiveBuildingCauseMix` + 합성 술어 — `purchase`를 D1 술어에 넣으면 D1 소비처 약 9곳이 매매 토지를 상속 토지 UI로 고정한다.
- 위젯: 토지 = 매매 고정, 매매 블록을 건물 원인 모드로 재사용(R안), 상속 블록 미마운트, 숨김 칸 약 25(결합 공시 계열), 호스트 태그 cause별.
- V-11: 자산 단위 STEP 0.45는 파트 가격을 덮지 않음(세액 불변)이나 표시가 어긋나고, ⑧ `postDeemedClauseARequiredError`·컴패니언 CP-1이 막다른 길 → D2-1에서 Y7과 같이 해소.
- 다건: 허용(⑧ 신고가액 요구 면제) — 구현 전 multi route 실측, 불가면 명시 차단.
- PR 4분할: **D2-1** 엔진·⑫·CP-1·④·⑧ 술어·고지(화면 변화 0 — 토글 미노출) → **D2-2** 위젯·⑥ → **D2-3** ⑦ 표시(`splitRateBasisNote` 건물 방향 문구) → **D2-4** 2005-04-30 전 건물 max 입력.

### 12.3 D2-1 구현 (2026-10-09, 엔진·⑫·CP-1·④·⑧ 술어·고지 — 화면 변화 0, 세액 산식 불변)

- **leaf** `transfer-split-part-cause.ts`: 조건 = overlay `purchase` + 건물 {상속, 증여}. 순서 구조(Y1 부담부증여·PHD·가업상속·소유자 분리) → Y2 토지 취득일 → Y4 건물 경계일(`< 2005-04-30`, field `acquisitionDate`) → Y3 건물 실가 1종(field `buildingAcqMode`) → Y7 자산 단위 평가 payload 동봉(field `inheritedAcquisition`). **Y8**: overlay 부재 + 건물 상속·증여 + 분리 입력(토지일 ≠ 건물일, 소유자 분리·PHD 후퇴 송신은 같은 날이라 비해당) → 400. R-X5 개정: 건물 이월과세·부담부증여 + 토지 매매 차단 / 건물 상속·증여 + 토지 상속·증여는 계속 차단(접두 문구 유지 + 「토지 취득원인은 매매만 지정할 수 있습니다」).
- **사실 공급**: 엔진 `calcSplitGain`(호출 시점 입력 — STEP 0.45가 필드를 지우지 않아 Y7 판정 가능) · ⑫ 주 자산/컴패니언 `refineSplitPartCause` · ⑧ `validateLandPartCause`(④가 보내는 값).
- **V-11 막다른 길 2건 해소**: ⑧ `validateAssetAcquisition`이 D2 유효 시 `validateBuildingCauseSplit`(신규 36줄)으로 먼저 갈라 자산 단위 상속 요구(§164·E-1·PD-1·post-deemed)에 도달하지 않음 · 컴패니언 CP-1(`refineCompanionInheritedValue`)은 overlay `purchase` + 분리 입력이면 건너뜀. ④는 D2 유효 시 `inheritedAcquisition`·`inheritedHouseValuation`·컴패니언 `inheritanceValuation`·`primaryInheritanceValuation`을 싣지 않음.
- **클라이언트 술어 분리**: `effectiveLandAcquisitionCause`는 D1 의미 불변(반환형 `"" | "inheritance" | "gift"`, `purchase`는 `""`), D2는 `effectiveBuildingCauseMix` + 합성 `landCauseMixActive`·`engineLandOverlay`·`withBuildingActualWhenMix`. 합성 술어 소비처: `phdFlagEffective` · 같은 날(`landPartCauseSameDay`) · ④ `buildLandPartCausePayload`(overlay `purchase`만 전송) · ⑧ 사실 · 가업상속 게이트 · 다건 ⑧(신고가액 요구 면제). 건물 방식은 D2 유효 시 ④·⑧·⑥ 모두 `actual` 고정, 자산 단위 추계 플래그(환산·감정·매매사례, stale 포함)는 ④(단건 `primary-context`·다건)에서 무시. ⑥ 자산 행은 숨은 `publishedValueAtInheritance`를 읽지 않음(pending 0).
- **D2-Q3**: 동일세대 3키 ④ 전송 유지(§154⑧3호 적용 — 엔진 현행). `houses[]` 양도 주택의 `isInherited`·`inheritedDate`·`decedentSameHouseholdAtInheritance`·합가·선순위는 D2 유효 시 미전송(§155②·§167의3①7호 미적용).
- **D2-Q1 고지**: `landBeforeBuildingAcquisitionRateNotice`(Check 후속에서 개명 — 종전 `landBeforeInheritanceRateNotice`) — 상속·증여 건물 + 토지 매매 + 파트 세율 판정(`partRateBasisApplied`) + 토지 자기 취득일 기산과 상속개시일 기산의 세율 구간(1년 미만/1~2년/2년 이상)이 다를 때만 warnings 1줄. 세액 불변.
- **실측(구현 전 필수 3건)**: 다건 route(`/api/calc/transfer/multi`)는 D2 payload를 수용(단건과 같은 세액, 건물 증여 동일) · 컴패니언(일괄양도) 취득가액은 파트 합 7억(안분 단계 allocated 0이어도 파트 가액이 이김), 자산 단위 평가·overlay 부재는 400 · 12억 초과 고가주택(표2) 파트 보유연수 건물 8년(개시일)·토지 11년(자기 취득일), 건물 매매 대조군과 장특·세액 동일.
- **전환된 기존 테스트(근거 한 줄씩)**: `split-part-rate.anchor` A-14b(overlay 부재 + 건물 상속 + 분리 입력 → Y8 throw, 종전 191,490,000 침묵 과소) · `split-part-cause.d1` 「회귀 0」 시드(purchase + 건물 상속은 D2 규칙 대상) · `split-acq-cause-mixed-d1-3.ui.anchor` 「자산 전체 상속」 시드(분리 입력은 같은 날로 — Y8) · UI Pre-Do B1~B6 뒤집기 + C1~C17 활성화 · 엔진 Pre-Do D2-B3·C·D 뒤집기.
- 검증: 신규 `split-part-cause.d2.test.ts` 49 · `…d2.predo.anchor` 20 · `…d2-1.routes.anchor` 6 · UI Pre-Do 23(+3 todo = D2-3 표시). 관련 vitest 1567파일 18,086 통과, E2E 38(acq-cause 계열 23 + 상속·다건·§164 15) 통과. mutation 34건 전부 KILLED(최초 3건 SURVIVED → 테스트 보강 후 KILLED).
- 남은 것: D2-2 위젯·⑥ 표시(`BuildingCauseMixBlock`, 토글 노출) · D2-3 ⑦ 표시(건물 방향 `splitRateBasisNote`·건물 가액 태그) · D2-4 경계일 전 max 입력. 확인 필요 레지스트리는 엔진 설계 §10.

**D2-1 Check 후속 (2026-10-09, sync 검사 + 취득가액 리뷰)**
- **[Medium] Y8이 기존 화면 경로에 닿음 → 읽는 쪽 파생**: 일반건물에서 「취득일 다름」 + 토지 상속·증여를 입력하고 자산 종류를 주택·건물로 전환(전환 patch가 `hasSeperate…`를 끄지 않음)하거나 2026-07-30 이전 저장분은 「상속·증여 호스트 + `hasSeperate=true` + 토지일 ≠ 건물일」이 된다. HEAD는 토지를 상속으로 침묵 계산(예 134,046,000), D2-1 최초 구현은 ⑧·⑫ 차단인데 고칠 칸(토지 취득원인 토글)이 화면에 없었다. 신규 술어 `hasStaleSplitInput`(상속·증여 호스트 ∧ D2 유효 아님 ∧ 소유자 분리 아님 ∧ 부담부증여 아님 ∧ `hasSeperate=true`) + `normalizeBuildingCauseInputs`(stale 무시 + D2 건물 방식 실가 고정)를 ④(`isSplitPayloadActive`·`buildSplitPayload`)·⑧(`validateLandPartCause`·`validateSplitDirectInputs`·날짜 정합)·⑥(`isSeparateAcquisition`·`separateAcqPartsSum`·자산 행 환산 미리보기)가 공유한다. 저장값은 지우지 않는다. 소유자 분리의 `landAcquisitionDate` 후퇴 송신·D1 호스트·부담부증여·일반건물·겸용은 같은 객체를 돌려준다(body 바이트 동일 — 테스트 `same()` + 소유자 분리 ④ 값 단언). Y8(API 직접 호출 방어)은 유지. 미처리(별건): `transfer-tax-validate-expropriation.ts:44`·`-usage-conversion.ts:70`도 `hasSeperate…`를 직독한다(stale 상속·증여 호스트에서 수용·용도변경 검증이 분리 입력을 본다 — 이번 범위 밖).
- **[Medium] 컴패니언 건물 증여 D2: ⑧ 통과 ↔ ⑫ 400** → 컴패니언 증여 arm(`fixedAcquisitionPrice` 필수)에 상속 arm CP-1 면제와 같은 술어(`isBuildingCauseMixCompanion`) 적용. 번들 안분은 파트 합 7억을 취득가액으로 쓴다(route anchor, `splitDetail` 건물 gift/own). 면제는 D2 한정(overlay 없는 컴패니언 증여는 종전대로 400).
- **[Low] 다건 ⑧ `phdFlagEffective` 교체**: D1(토지 상속·증여 유효) + PHD 플래그 다건이 이제 ⑧을 통과한다. ④(`usesPhd`)가 원래 같은 술어라 ⑧을 ④에 맞춘 **정합 방향의 의도된 변경**이다(종전: 다건 ⑧만 원시 플래그를 읽어 ④가 PHD를 무시하는데도 막힘).
- **취득가액 리뷰 (a) 같은 날 + 파트 가액 없음**: 같은 날은 `isSeparateAcquisition`이 false라 파트 완결 규칙(V1·V2)이 꺼져 있고, 컴패니언은 CP-1까지 면제돼 **취득가액 0**이 조용히 계산됐다(실측: 주 자산 472,935,000 · 컴패니언 474,060,000, `splitDetail` 없음). **Y9**(건물 가액 필수 · 토지 실가·감정이면 토지 가액 필수)를 leaf에 추가해 엔진·⑫·⑧이 막는다.
- **(b)** 일괄양도 주 자산 `primaryInheritanceValuation`을 Y7 사실에 추가(⑫ 주 자산 — ④는 D2 유효 시 이미 미전송).
- **(c)** D2 토지 매매 파트 환산·개산공제 값 고정(손계산): 환산취득가 = 7억 × 1억 ÷ 7억 = 1억, 개산공제 = 1억 × 3% = 3,000,000, 토지 양도차익 597,000,000 → 376,260,000. 건물 개산공제 0.
- **(d)** Y4 문구: 「개별주택가격이 공시되기 전」만 말하던 것을 「건물 기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전」 + 「정확한 고시일은 자산 종류별로 달라 2005.4.30. 이전 취득을 보수적으로 모두 막는다」로 정정(비주택 `building` 포함).
- **고지의 증여 확장**: 증여 건물도 토지 적용 기산 = 증여일이라 구간이 갈리면 같은 고지를 증여일 문구로 낸다(Q-D2-2 + 사용자 결정 「두 기산이 갈릴 때 고지」). 상속·증여 각 11시드 실측(2018-03-02·2020-01-10·2024-01-10·2024-07-01 고지 / 2024-07-02·2025-01-10·2025-04-30·같은 날·개시 후 3종 무고지) — 초일 산입으로 2024-07-01은 양도 2026-06-30까지 딱 2년(2년 이상 구간).
- **재검사(sync, HEAD 사본 대조) 결과**: 비-stale 46시드 ④·⑧·⑫·⑥ HEAD 동일, stale 시드 전부 ⑧ 통과·⑫ 200·자산 단위 계산과 세액 일치(새로 막히는 셀 0), D2 유효 격자 「⑧ 통과 + ⑫ 400」 0.
- **별건(기존 결함 — D2-1이 만들지 않음)**: 상속·증여 주택에 매매 시절 자동 ON된 `usePreHousingDisclosure`가 남으면 ⑧은 PHD를 보지 않는데 ④ `usesPhd`가 분리를 켜 ⑫ 400(`landStandardPriceAtTransfer` 필요) — HEAD에서도 `inh_phd` 시드가 이미 「⑧ 통과 ↔ ⑫ 400」. stale 분리 + PHD 시드는 종전 ⑧ 차단 → 이제 같은 막다른 길로 이동. 뿌리: `phdToggleReachable`이 자산 종류만 보고 토글이 실제로 렌더되는 취득원인(매매 블록)을 보지 않는다. 다음 PR 후보. → **D2-2 Check에서 해소(아래)**.

**D2-2 구현 (2026-10-09, ⑤ 위젯·⑥ — 세액 산식 불변, 토글 노출)**:
- ⑤ `BuildingCauseMixBlock`(신규) — 상속·증여 호스트에 「토지는 다른 원인으로 취득」(토지 = 매매 고정, 원인 라디오 없음). 켜면 상속·증여 블록·증여 §164 섹션·의제 전 선언 대신 **`CompanionAcqPurchaseBlock`을 건물 원인 모드(`buildingCause` prop)**로 마운트: 「취득일 다름」 강제 ON·잠금, 건물 칸 라벨 상속개시일·증여일(의제취득 클램프·배지 끔), 건물 파트 실거래가 고정 칩 + 평가액 칸, 상단 자산 단위 축·PHD 토글·신축/증축 특례 숨김. 토글 패널에 건물 피상속인 취득일(상속) · 동일세대 통산 카드(`InheritedCohabitationCard` — 상속 블록에서 추출, §154⑧3호 + 「확인 필요」, §155②·7호 미적용 문구) · 증여자 취득일(선택) · 증여 이월과세 고지. 부담부증여·가업상속 입력이 있으면 토글 미노출(켜진 쪽은 끌 수 있음). 소유자 분리와 켜는 방향만 상호 잠금(`landCauseMixActive`). 호스트 전환·OFF의 stale은 D2-1 읽는 쪽 파생이 처리 — 전환 patch 추가 없음(OFF만 `hasSeperate…`를 되돌린다).
- 3키 쓰기 leaf `buildingDatePatch`(상속 블록·D2 건물 날짜 칸 공용) · 경계일 전·같은 날 입력 중 안내 `buildingCauseDateNotices`(⑧·⑫와 같은 술어).
- ⑥ 단건 자산 행: D2 유효 + 결과 도착이면 `summarizeSplitGain().acquisitionDeducted`(토지 환산·감정 pending이 결과 후에도 「-」에 갇히던 것 — 일반 매매 split 환산 파트도 같은 고착이 있으나 D2 밖).
- 검증: UI Pre-Do render 23(활성) · ⑥ 사이드바 5 · 격자 1(⑧ 통과 76셀 모두 ⑫ 200 · ⑧ 차단 52셀 모두 화면 앵커) · E2E 신규 12, 기존 acq-cause·상속·증여·사이드바·분리 계열 944건 중 923 통과·21 skipped(기존)·실패 0. mutation 22/22 KILLED(최초 M10 SURVIVED → 테스트 보강). vitest 1572파일 18,141 통과. 스크린샷 데스크톱·모바일 확인.
- D2-3로 넘김: 토지 파트 `splitRateBasisNote`(「주택 취득일」 문구 ↔ 건물 행 「피상속인 취득일」) · 건물 방향 라벨 상수 이름(`LAND_CAUSE_META.valueLabel`을 건물 파트도 사용).

**D2-2 Check 후속 (2026-10-09, sync 검사 실측 4건)**
- **[Medium] #1 PHD 자동 ON 잔재 → ⑧ 통과 ↔ ⑫ 400 (D2-1 별건 해소)**: 건물 취득일 < 2005-04-29 주택은 매매 블록의 effect가 `usePreHousingDisclosure`를 자동 ON한다. D2 건물 원인 모드에서도 effect가 돌아 켜 놓은 플래그가 토글 OFF·날짜 수정 뒤에도 남았고, ④ `usesPhd`가 분리 계산을 켜 ⑫가 화면에 없는 양도시 기준시가 칸(`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`)으로 400. 두 겹: (a) effect는 `buildingCause`에서 돌지 않는다 (b) 뿌리 — **PHD 토글은 `CompanionAcqPurchaseBlock` 한 곳이고 그 블록은 취득원인 매매에서만 마운트**(코드 확인: 이월과세는 `CarryoverEstimationSection`, 겸용은 `MixedUseLegacyStdPrice`가 자기 패널)이므로 `phdToggleCauseReachable`(상속·증여·신축·부담부증여는 미도달, 매매·미지정·이월과세·겸용은 종전 그대로)를 `phdToggleReachable`·`phdFlagEffective`에 걸었다. ④·⑧·⑤가 공유하는 읽는 쪽 파생이고 저장값은 지우지 않는다(매매로 돌아오면 복귀). `ownerSplitHousingNeedsBuildingStd`의 raw 플래그 읽기도 `phdFlagEffective`로 맞췄다(잔재가 PHD로 취급되지 않으면 나목 요구가 ④·⑤와 같아야 한다). 효과: 상속·증여·신축 + PHD 잔재 → ⑧ 통과 + ⑫ 200 + **자산 단위 계산**(분리 없는 같은 자산과 body 바이트 동일·세액 동일). 매매·이월과세·겸용 PHD 시드는 불변(관련 vitest·E2E 전수 통과).
- **[Medium] #2 증여 D2 ON → 부담부증여**: 토글이 숨는데 `hasSeperate…`가 켜져 ⑧이 입력칸 없는 `landAcquisitionPrice`를 요구했다. `hasStaleSplitInput`의 부담부증여 제외를 「D2 토글 잔재(호스트 태그 상속·증여 + overlay `purchase`)가 없을 때」로 좁혔다 — 부담부증여 자체 경로의 분리 입력(태그·overlay 없음, D1 잔재 포함)은 종전처럼 보호된다.
- **[Low] #3 ⑥ D2 결과 분기**: 「입력 프리뷰가 pending일 때만」(`acqPending`). 실가·평가액처럼 프리뷰로 확정되는 경우는 결과 도착 후 입력을 고쳐도 실시간 프리뷰를 따른다.
- **[Low] #4 D2 ON → 매매 전환 시 「취득일 다름」이 켜진 채 남는 것은 수용**: 매매 호스트에서는 그 토글이 화면에 보이고 끌 수 있으며 건물 가액 칸도 보여 막다른 길이 아니다(D1-2 신축 → 매매 S1과 같은 기존 현상).
- 검증: `d2-2.check.test.ts` 11 · 렌더 C15 · mutation 7/7 KILLED(N1~N7) · E2E 1건 추가.

