# 일반건물 파트별 감정가액·매매사례가액 — 엔진·API 설계서 (Phase A)

> 🔀 **두 설계서의 충돌 해소는 계획서 `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §4 「A-통합」이 정본이다(2026-10-06).** 이 문서의 해당 항목과 다르면 그쪽을 따른다.

> 작성 2026-10-06 · 브랜치 `feat/transfer-land-bldg-split-acq` · base `c47885ccd` · 상태 **Design (엔진·API 측)** — UI 설계서와 §1 필드 계약으로 대조한다.
> 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.2(G-1·G-2) · §4(Phase A) · §7(V-n)
> Pre-Do anchor: `__tests__/api/transfer.route.gb-part-appraisal-salescase.predo.anchor.test.ts` (활성 8 GREEN · skip 5 RED 기대값)
> 소스 코드는 수정하지 않았다. 모든 file:line은 이 워크트리에서 직접 열어 확인했다(감사 보고의 행 번호는 §7에 정정 표기).

---

## 0. 요약·권장안

**확진 — G-2는 실재한다.** Route Handler(`POST /api/calc/transfer`)로 감사 시드를 넣어 재현했다. 「토지 감정 + 건물 실가」·「건물 감정 + 토지 실가」의 결정세액이 「둘 다 실가」와 **1원도 다르지 않다**(300,333,515). 개산공제(§163⑥)가 0으로 고정된다(§2).

**권장안 D-1 = (b)**: 비환산이라도 **파트 모드 중 하나라도 `estimated`·`appraisal`·`salesCase`면 환산 경로(`general-building-part-acq.ts`)로 보낸다**. 두 파트가 모두 `actual`일 때만 실가 경로에 남는다. 근거 3가지(§3):

1. **이미 사용자가 확정한 라우팅 규칙의 연장이다** — `general-building-part-acq.ts:8-12` 「산정방식이 파트마다 다른 자산은 환산 경로로 라우팅한다(사용자 확정 2026-08-05)」. 지금은 그 술어가 `anyEstimated`(환산만)라 감정·매매사례가 규칙 밖에 떨어졌을 뿐이다.
2. **개산공제 구현이 이미 한 곳에 있다** — `part-acq.ts:101-102`(`mode !== "actual"`) · `general-building-swap.ts` 갈래 4(감정·매매사례는 §97②2호 **본문**, swap 불개입). 실가 경로(a안)에 넣으면 GB에 세 번째 개산공제 구현이 생긴다.
3. **지분·컴패니언·증축·NBL·미등기·감가상각이 공짜로 따라온다** — 특히 **공유지분율**: 환산 경로는 세 호출부(`route-helper.ts:190`, `part-cards.ts:110`, `bundled-split-helpers.ts:644`) 모두 `ownershipRatio`를 개산공제 base에 넘기지만, **실가 경로는 세 곳 어디서도 안 넘긴다**(`route-helper.ts:145-170`, `part-cards.ts:77-91`). (a)안은 지분 일반건물에서 개산공제를 지분 축소 없이 100%로 공제 = **과소과세 방향의 신규 결함**을 만든다.

`route-actual.ts`(721줄)는 (b)안에서 **0줄 증가**한다. (a)안은 최소 항목(payload 필드 5·분기 1블록·카드 4곳)만 세어도 +60줄 이상 → 781줄+ (800 트리거 근접, 분리 필수).

**UI를 열기 전에 막아야 하는 선행 결함이 G-2 하나가 아니다.** 같은 UI 개방이 즉시 활성화시키는 침묵 오계산이 7개 더 있다(F-1~F-7, §2.3). 이 중 F-1·F-2·F-3은 **G-2와 같은 PR에서** 고쳐야 UI 개방이 안전하다.

**필드 계약 변경 제안: 없음.** 계약(파트 모드 4종 · 감정 = `*AcquisitionPrice` · 매매사례 = `*SalesCaseValue` · 자산 단위 = 기존 플래그+금액 필드)을 그대로 쓴다. 단 UI 시니어에게 **요청 2건**(§1.3)이 있다 — 계약 위반이 아니라 계약이 전제하는 것의 확인이다.

---

## 1. 필드 계약

> ⚠️ **계약 변경 제안: 없음.** (아래 §1.3 요청 2건은 UI 쪽 동작 확인이다.)

### 1.1 파트 단위 (분리 ON = 「토지·건물 취득일 다름」)

| 파트 모드 | 모드 필드 | 금액 필드 (AssetForm → ④ payload `generalBuildingValuation` 동명) | 개산공제 (§163⑥) | 비고 |
|---|---|---|---|---|
| `actual` | `landAcqMode`/`buildingAcqMode` | `landAcquisitionPrice`/`buildingAcquisitionPrice` | 없음 | 현행 |
| `estimated` | 동 | — (환산) | 있음 | 현행 |
| `appraisal` | 동 | **`landAcquisitionPrice`/`buildingAcquisitionPrice`에 감정가액** | **있음** | `calcPartAcquisitionPrice` appraisal 분기 = `own ?? null` (`transfer-tax-split-acq-price.ts:187-194`) — actual과 같은 슬롯 |
| `salesCase` | 동 | **`landSalesCaseValue`/`buildingSalesCaseValue`** | **있음** | `split-acq-price.ts:175-186`. **⑫ Zod에 필드가 없다 → strip (F-1)** |

### 1.2 자산 단위 (분리 OFF)

| 방식 | 플래그 | 금액 (AssetForm) | ④가 싣는 곳 | 비고 |
|---|---|---|---|---|
| 감정가액 | `isAppraisalAcquisition` | `fixedAcquisitionPrice` | **신규: `generalBuildingValuation.bundledAcquisitionPrice`** | 현행 ④는 이 값을 GB payload에 싣지 않는다(F-2) |
| 매매사례가액 | `isSalesCaseAcquisition` | `similarSalesValue` | 동 | ⑧ I3′(`validate-gb-required.ts:69`)는 `fixedAcquisitionPrice`만 본다 → 모드별 분기 필요(§7) |

`bundledAcquisitionPrice`는 이미 ⑫ Zod(`transfer-tax-building-schemas.ts:360`)·`applyShareScale`(`api-gb-shares.ts:124-136` — 지분 × r 스케일 대상)·route(`route.ts:533`)에 있다. 의미를 「토지·건물 **일괄** 취득가액 — 해당 취득가액 산정 방식의 값(증축 실가·감정·매매사례)」로 넓힌다. 새 필드를 만들면 14지점이 하나 더 늘 뿐이다. 최상위 `appraisalValue`/`similarSalesValue`(`transfer-tax-api.ts:392-401`)는 이미 실려 오지만 ⑫ I2는 **서브객체만으로 판정**하는 규칙(`required-refines-gb.ts:75-77` 머리말)이라 서브객체에 두는 것이 정합적이다.

### 1.3 UI 시니어에게 요청 2건

1. **분리 OFF 전환 시 파트 값 정리.** `GeneralBuildingAcquisitionCards.tsx:215-226` `setSeparate(false)`는 `landAcqMode`·`buildingAcqMode`·파트 금액·`*SalesCaseValue`·`*DirectExpenses`를 **비우지 않는다**(직접 확인). 실측(§2.2 S1~S2): 분리 OFF + 파트 라디오 stale(`estimated`/`actual`) → ④가 그대로 싣고 **환산 경로로 간다**. 4종 개방 후에는 stale 감정·매매사례가 같은 길로 샌다. UI는 전환 patch에서 비우고, 엔진 쪽 방어는 §7 ④ 항목에 둔다(3중 패턴).
2. **감정·매매사례 파트의 「취득시 기준시가」 칸 노출.** 개산공제 base = 취득 당시 기준시가(§163⑥1호 토지 개별공시지가·2호 건물). 현행 `showAcqStdPrice`류 술어는 환산 파트만 연다. ④·⑫·⑧·⑤ **같은 술어**(`requiresAcqStdPricePart(part, flags, ctx)` — `transfer-tax-split-acq-mode.ts` `mode !== "actual" → true`)를 쓸 것.

---

## 2. G-2 anchor 실측 결과

### 2.1 실행

```
npx vitest run __tests__/api/transfer.route.gb-part-appraisal-salescase.predo.anchor.test.ts
→ Tests 8 passed | 5 skipped (13)      (npx tsc --noEmit 0건)
```

경로: Route Handler `POST` 직접 호출(⑫ Zod 통과) — 엔진 직접 anchor는 Zod를 안 거쳐 F-1·F-2를 못 잡는다. 기존 일반건물 route 테스트 관례(`__tests__/api/transfer.route.*.anchor.test.ts`, `…predo.anchor…` 선례 `gb-carryover.predo`)에 맞춰 `__tests__/api/`에 뒀다(지시서의 `__tests__/tax-engine/transfer-tax/`는 엔진 직접 anchor 위치이고 Route 레벨은 관례상 `__tests__/api/`다 — 의도적 이탈). 시드는 감사 시드 그대로(양도 20억 · 토지 1999-05-24 · 건물 2015-03-01 · 취득시 공시지가 1,500,000×85㎡ · 건물 취득시 기준시가 28,144,700). `makeMockRates()`로 감사의 라이브 세율 수치(300,333,515)가 **1원 단위로 재현**됐다.

### 2.2 수치 (활성 테스트 = 현행 특성화)

| # | 입력 | 결정세액 | 토지 필요경비 | 건물 필요경비 | 판정 |
|---|---|---|---|---|---|
| A1 | 둘 다 실가 (300M / 400M) | **300,333,515** (총납부 330,366,866) | 0 | 0 | 기준선 |
| A2 | **토지 감정** + 건물 실가 | **300,333,515** | **0** (정답 3,825,000) | 0 | 🔴 = A1, 개산공제 누락 |
| A3 | **건물 감정** + 토지 실가 | **300,333,515** | 0 | **0** (정답 844,341) | 🔴 대칭 |
| A4 | 토지 **매매사례**(`landSalesCaseValue` 3.5억) + 건물 실가 | **400** `generalBuildingValuation.landAcquisitionPrice` | — | — | 🔴 값이 Zod에서 strip → I3가 막음 (F-1) |
| A5 | 자산 단위 감정(분리 OFF, 총액 7억) | **400** `acquisitionPrice` | — | — | 🔴 총액이 GB 경로에 도달 못함 (F-2) |
| A6 | 건물 감정 + 신축 5년 이내(2023-03-01 → 2026-02-16) | penaltyTax **0** / penaltyBase 0 | — | — | 🔴 §114조의2 가산세 누락 (F-3) |
| O1 | oracle: 실가 + `landDirectExpenses` 3,825,000 | **299,208,965** | 3,825,000 | 0 | 기대값 oracle |
| O2 | oracle: 실가 + `buildingDirectExpenses` 844,341 | **299,978,892** | 0 | 844,341 | 기대값 oracle |

**stale 실측**(일회성 probe, 파일 미보존 — `buildGeneralBuildingValuation` 직접 호출):
- S1 분리 OFF + `landAcqMode:"estimated"`/`buildingAcqMode:"actual"`(stale) → payload에 `actualPriceMode` **없음**(= 환산 경로). 
- S2 분리 OFF + `appraisal`/`actual`(stale) + 파트 금액 stale → `actualPriceMode:true`, 파트 값 그대로 전송.
- S3 분리 OFF 자산 단위 감정 플래그 → `landAcqMode`·`buildingAcqMode` = `appraisal`, **`bundledAcquisitionPrice`·파트 금액 없음** → 총액 7억이 payload에 없다.
- S4 분리 ON 토지 감정 + 건물 실가 → `actualPriceMode:true`(**실가 경로**), 두 파트 금액만 전송.

### 2.3 손계산 근거 (기대값)

「소득세법」 제97조 제2항 제2호 본문(그 밖의 경우) = 제1항제1호 **나목**(매매사례가액·감정가액·환산취득가액)의 금액 + 자산별 대통령령 금액. 「소득세법 시행령」 제163조 제6항 1호 = 토지 취득당시 개별공시지가 × 3/100(§104③ 미등기 3/1000), 2호 나목 = 건물 취득당시 나목 가액 × 3/100(동). (MST 280405·290841 본문 2026-10-06 직접 확인 — §8 V-5)

**X1 (토지 감정 + 건물 실가)**
```
토지 개산공제   = 1,500,000 × 85 × 3% = 3,825,000
토지 양도차익   = 1,956,162,578 − 300,000,000 − 3,825,000        = 1,652,337,578
장특 30%        = floor(1,652,337,578 × 0.3)                       =   495,701,273
토지 소득금액   = 1,156,636,305
건물 차손       = 43,837,422 − 400,000,000                          =  −356,162,578   (§102② 동일그룹 통산)
통산 후         = 800,473,727   −기본공제 2,500,000 → 과세표준 797,973,727  (42% 구간)
산출세액        = floor(797,973,727 × 0.42) − 35,940,000            = 299,208,965   ✔ (O1과 일치, 지정값 ±0)
```
**X2 (건물 감정 + 토지 실가)**: 건물 개산공제 = 28,144,700 × 3% = 844,341 → 건물 차손 −357,006,919 → 토지 소득 1,159,313,805 − 357,006,919 − 2,500,000 = 799,806,886 → ×0.42 − 35,940,000 = **299,978,892** ✔

**X4 (자산 단위 감정 7억, 분리 OFF)**: 취득시 기준시가 비율(「소득세법」 §100② 본문 「취득 당시」) 토지 127,500,000 : 건물 28,144,700 → 토지 취득가액 = floor(700,000,000 × 127,500,000 ÷ 155,644,700) = **573,421,388**(나머지 91,156,400), 건물 = 잔액 **126,578,612**. 개산공제 3,825,000 / 844,341. oracle(실가 경로 총액 안분 + 파트 직접귀속)도 같은 카드 값을 낸다(실행 확인).

**X5 (§114조의2)**: 신축·5년 이내·감정가액 → 건물 감정가액 400,000,000 × 5% = **20,000,000**(「소득세법」 §114의2① — MST 280405 본문 확인). 매매사례가액은 조문 문언(「감정가액 또는 환산취득가액」)에 없어 가산세 대상이 아니다.

### 2.4 추가 결함 목록 (UI 개방 시 활성화)

| # | 결함 | 증거 | 시급도 |
|---|---|---|---|
| **F-1** | 매매사례 파트 값이 엔진에 도달하지 못한다 — ④ `partModePayload`(`api-gb.ts:402-408`)가 `*SalesCaseValue`를 안 싣고, ⑫ `generalBuildingValuationSchema`(`building-schemas.ts:187-194`)에 필드가 없어 strip, `GeneralBuildingInput` 타입(`general-building.types.ts:133-138`)에도 없다. ⑫ I2(`required-refines-gb.ts:95`)는 `salesCase`를 「이 칸을 읽지 않는다」며 제외 → 비어도 400 아닌 엔진 `missingParts` throw. ⑧ V-7(`validate-gb.ts:415·422`)은 `landMode !== "estimated"`면 **`landAcquisitionPrice`**를 요구 → 매매사례 파트에서 **UI에 없는 칸을 요구하는 dead-end** | A4 실측 | G-2와 같은 PR |
| **F-2** | 자산 단위(분리 OFF) 감정·매매사례 총액이 GB 경로에 도달하지 못한다 — 상단 취득가액 = 0(`transfer-tax-api.ts:282-286`), 값은 `appraisalValue`/`similarSalesValue`에만 있는데 GB 분기 `route.ts:533`은 `engineInput.acquisitionPrice`만 읽는다. ⑧ I3′는 이미 `isAppraisalAcquisition`을 「감정가액」으로 안내하며 통과시킨다(`validate-gb-required.ts:68-70` — 환산만 제외) → **⑧ 통과 ↔ ⑫ I3 400** 모순 | A5·S3 실측 | G-2와 같은 PR |
| **F-3** | §114조의2 감정 가산세 누락 — `buildProperties`가 `acquisitionMethod: isBuilding && card.usedEstimatedAcquisition ? "estimated" : "actual"`(`route-cards.ts:216`)로 **환산만** 싣는다. 카드에 「감정」을 나타낼 필드가 없고(`AssetCardForAggregate`), `calculateBuildingPenalty`는 `method === "appraisal"`만 감정으로 읽는다(`building-penalty.ts:27-29`) | A6 실측 + 코드 추적 | UI 개방 전 |
| **F-4** | 취득시 기준시가가 개산공제 base인데 비-환산 파트에서는 요구도 전송도 안 한다 — ④ `needLandStd = landMode === "estimated" || ext`(`api-gb.ts:423`) · ⑧ V-5(`validate-gb.ts:446`) · ⑫(`building-schemas.ts:459`) 셋 다 환산만. 비워 두면 ④는 payload를 **통째로 undefined**로 돌려 route 일반건물 게이트가 실패(`api-gb.ts:421-426` 주석 「validate 통과 ↔ API 침묵 drop」과 같은 모양) | 코드 | G-2와 같은 PR |
| **F-5** | 분리 OFF stale 파트 모드 (§1.3-1) | S1·S2 실측 | UI 요청 + ④ 방어 |
| **F-6** | 증축(3파트) × **자산 단위** 감정·매매사례 — 3-way 경로가 파트 값이 없으면 원건물을 「일괄 실가」로 계산하고 개산공제 0(`general-building-extension.ts:314-345` `landPartApplied`는 파트 값이 있을 때만 참). UI가 열면 G-2의 3-way판 | 코드 | 차단(§5) |
| **F-7** | 지분 스케일 목록(`api-gb-shares.ts:124-136`)에 `*SalesCaseValue` 없음 → 새 필드를 추가하면 **100%로 새어 과소과세** | 코드 | 필드 추가와 동시 |

---

## 3. D-1 결정 — 비교

| 항목 | (a) 실가 경로에 파트 모드 분기 | **(b) 비환산이라도 감정·매매사례 파트가 있으면 환산 경로** (권장) |
|---|---|---|
| 핵심 변경 | `general-building-route-actual.ts` — payload 타입(`:39-173`)에 `landAcqMode`·`buildingAcqMode`·`*SalesCaseValue`·`ownershipRatio` 추가, 취득가액 분기(`:434-471`)·필요경비(`:472-491`)·카드 4곳(`:533·542·550·558` `estimatedDeduction:0`)에 개산공제 | ④ 라우팅 술어(`api-gb.ts:343·412`) `anyEstimated` → `anyNonActual` + 입력 요구(`:423-426`) 확장 + 매매사례 필드 전송. 엔진 `part-acq.ts`는 감정·매매사례를 **이미 처리**(`:101-102·122-129`) |
| 개산공제 구현 | GB 안에 **세 번째 사본**(part-acq · split-gain `:526-527` 계열 · 신규) — dual-truth | 기존 단일 정본 재사용 (`general-building-valuation.ts:367` → `applyPartAcqModes`) |
| 지분(`ownershipRatio`) | **실가 경로는 세 호출부 모두 안 넘김**(`route-helper.ts:145-170` · `part-cards.ts:77-91` · `fractional.ts`는 part-cards 경유) → 3곳 배선 신설. 놓치면 지분 건물 개산공제 100% = 과소과세 | 이미 전달(`route-helper.ts:190` · `part-cards.ts:110` · `bundled-split-helpers.ts:644`) |
| 증축(3-way) | 별개 경로(`general-building-extension.ts` Step 2.5 이미 파트 모드 처리) — 실가 경로 변경과 무관 → **감정이 2경로에서 두 방식으로 구현**됨 | 이미 같은 `applyPartAcqModes` 호출(`extension.ts:277-281`) — 한 방식 |
| 자산 단위 총액(F-2) | 기존 총액 안분 코드(`route-actual.ts:462-466` 취득시 비율 + `requireAcqStd`)를 **그대로 재사용** — (b)보다 쉬움 | `part-acq.ts`에 **비-분리 지원 신설** 필요(§4.3) — `calcPartAcquisitionPrice`가 `isSeparate:false`+`landRatio`를 이미 지원하므로(`split-acq-price.ts:175-199`) ~40줄 |
| 파일 크기 | `route-actual.ts` 721 → **≥781**(최소 항목 산술) — 800 트리거 근접, 분리 계획 필수(아래) | `route-actual.ts` **721 불변**. 증가: `part-acq.ts` 145→~190 · `api-gb.ts` 681→~710 · `building-schemas.ts` 696→~720 · `validate-gb.ts` 707→~735(모두 <750) |
| 회귀 위험 | 실가 경로를 건드림 → **「둘 다 실가」 전 조합**(NBL·상속 C1·부담부증여·구분양도·이월과세)이 같은 함수를 지난다 | 실가 경로 **불변**. 라우팅이 바뀌는 입력 = 「한 파트 이상 감정·매매사례 + 환산 아님」뿐 — 현재 UI 도달 불가·API 직접 호출만. 저장 이력은 GB에 감정 UI가 없어 해당 레코드 없음(확인 필요 V-17) |
| 위험의 모양 | 새 개산공제가 틀리면 **실가 전 조합**이 오염 | 라우팅 술어가 틀리면 **감정·매매사례 조합만** 오염 |
| 부담부증여 | §159 분기가 실가 경로에만 있음(`route-actual.ts:380-420`) → 영향 없음 | **함정** — 환산 경로는 `burdenedGiftInfo`를 소비하지 않는다(`route-helper.ts:145-170`은 실가 분기에만 전달). stale 감정 플래그 + 부담부증여가 환산 경로로 새면 §159 침묵 소실 → ④ 라우팅에 `burdened_gift ⇒ 실가 경로` 가드 필요(§5 행) |

**(a)안을 택할 경우의 분리 계획**(참고): 취득가액·필요경비 결정 블록(`:434-492`)을 `general-building-route-actual-acq.ts`로 추출(~140줄, 순수 함수 `resolveActualPartAcq(payload) → {landAcq, buildingAcq, landExp, buildingExp, …}`), `route-actual.ts` ≈ 620줄. 단 지분·개산공제 base 배선 3곳은 별개로 남는다.

### 3.1 (b)안의 라우팅 규칙

```
anyNonActual = landMode !== "actual" || buildingMode !== "actual"      // landMode = effectivePartAcqMode(…)
if (isBurdenedGift)              → 실가 경로        // §159가 취득가액을 정한다 (신규 가드)
else if (anyNonActual || ext)    → 환산 경로
else                             → 실가 경로        // 둘 다 actual — 현행 그대로
```
`needLandStd`/`needBuildingStd` = `mode !== "actual" || ext` (환산 → 비-actual로 확장). `gbHasFirstDisclosure && anyEstimated`(`api-gb.ts:600` §164⑦ 환산주택가격 override 게이트)는 **그대로 둔다** — 감정 파트에는 override가 안 걸린다(§5·§9 V-13).

---

## 4. 계산 규칙

### 4.1 파트 모드별 취득가액·필요경비

| 파트 모드 | 취득가액 | 필요경비 | 법령 |
|---|---|---|---|
| `actual` | 그 파트 실지거래가액 | 자본적지출·양도비 **가산** (§97②1호) | 법 §97①1호 가목 · §97②1호 |
| `estimated` | 양도가 × 취득시 기준시가 ÷ 양도시 기준시가 | 개산공제 (+ §97②2호 단서 가목·나목 **택일**) | 법 §97①1호 나목 · 영 §176의2② · §163⑥ |
| `appraisal` | 감정가액 | **개산공제만** (자본적지출·양도비 불산입) | 법 §97①1호 나목 · §97②2호 **본문** · 영 §163⑥ · §163⑫ |
| `salesCase` | 매매사례가액 | **개산공제만** | 동 (영 §176의2③1호) |

- §97②2호 **단서**(가목↔나목 택일)는 「취득가액을 **환산취득가액**으로 하는 경우」에 한정된다(법 본문 직독) → 감정·매매사례 파트는 swap 비대상. 엔진 선례: `general-building-swap.ts` 「`appraisal`·`salesCase` → 갈래 4 아무것도 하지 않음」 · 단건 `transfer-tax-helpers.ts:282` `isConversionMode`.
- 개산공제 base(영 §163⑥): 토지 = 취득당시 개별공시지가 × 면적 (1호), 건물 = 취득당시 기준시가 (2호 나목 — 일반건물은 법 §99①1호 나목). 율 3/100, **미등기양도자산(§104③) 3/1000** — 토지·건물 각각(`estimatedDeductionRate(unregisteredLand/Building)`, `general-building-valuation.ts` 2-way 경로가 이미 파트별 율을 쓴다).
- 공유지분: base를 **지분 기준시가**로 축소(`computeEstimatedDeduction(base, rate, ownershipRatio)`, `tax-utils.ts:87`). 기준시가·면적 자체는 스케일 금지(`api-gb-shares.ts:108-111` 주석).
- 감정·매매사례 파트의 양도차익 계산에서 **자산 단위 자본적지출·양도비는 해당 파트로 안분되는 몫도 소실**된다 — 본문이 나목+개산공제만 허용하기 때문이다. 실가 파트에 안분된 몫은 `swap.addition`으로 유지(현행 `resolvePerPart`).
- 정수 연산: 개산공제 `applyRate`(floor), 안분 `floor(총액 × 토지기준시가 ÷ (토지+건물 기준시가))` — **정수 곱 후 나눗셈**, 중간곱이 2^53을 넘을 수 있으므로 `safeMultiplyThenDivide`(`tax-utils.ts:195`) 사용. 건물 = 총액 − 토지(잔액 흡수). `Math.round` 금지. (참고: `calcPartAcquisitionPrice`→`splitPair`는 float 비율 `Math.floor(total × ratio)`를 쓴다 — 새 비-분리 경로는 정수 산식을 쓰고 `splitPair`는 건드리지 않는다. 주택 split 회귀 0.)

### 4.2 조합별 손계산 예

§2.3의 X1·X2·X4·X5. 추가 예 — **매매사례 토지 + 실가 건물**(X3): 토지 취득가액 = 350,000,000, 개산공제 3,825,000, 건물 400,000,000 → 결정세액 **284,508,965**(oracle 실행값 = 「토지 3.5억 실가 + 토지 직접귀속 3,825,000」). 손계산: 토지 양도차익 1,956,162,578 − 350,000,000 − 3,825,000 = 1,602,337,578, 장특 30% = 480,701,273 → 1,121,636,305 − 356,162,578 − 2,500,000 = 762,973,727 → ×0.42 − 35,940,000 = 284,508,965 ✔.

### 4.3 비-분리(자산 단위) 엔진 규칙 — `part-acq.ts` 확장

입력 신설: `PartAcqModeInput.bundledAcquisitionPrice?`(분리 OFF 총액). 규칙:
- **파트 값(own)이 둘 다 없고 `bundledAcquisitionPrice > 0`** 이면 비-분리: `ctx.isSeparate=false`, 총액을 **취득시 기준시가 비율**로 토지·건물에 안분(§100② 본문 「취득 당시」 — 양도시 비율로 후퇴 금지, 실가 경로 `route-actual.ts:274-296`과 같은 근거). 분모 0이면 throw(`requireAcqStd`와 같은 메시지 계열, 자동 후퇴 금지).
- 파트 값이 **한쪽만** 있으면 throw(`missingParts` 계열) — 분리 ON은 ⑧ V-7이 둘 다 요구하므로 도달 불가이고, 분리 OFF는 한쪽 값이 stale이라는 뜻이다(F-5).
- 둘 다 없고 총액도 없으면 `missingParts`(현행).
- 모드는 양 파트 동일(분리 OFF 불변식 — `effectivePartAcqMode` 머리말). 불일치는 stale이므로 ④가 분리 OFF에서 legacy 파생값으로 통일해 보낸다(§7).

---

## 5. 연관 경로 매트릭스

| 경로 | 감정·매매사례 파트 도달? | 계산 방식 | 막을 것 / 필요 조치 |
|---|---|---|---|
| **지분**(`api-gb-shares.ts` → `fractional.ts` → `buildGbPartCards`) | 도달 (지분마다 ④ 변환) | (b)안이면 지분마다 환산 경로 `ownershipRatio` 배선으로 개산공제 base 지분 축소 자동. 양도가액은 지분 먼저 → §166⑥ | `applyShareScale` 목록에 `landSalesCaseValue`·`buildingSalesCaseValue` **추가**(F-7). 100% 기준 입력 × r. 기준시가·면적은 스케일 금지 |
| **컴패니언**(`bundled-split-helpers.ts:638` → `buildGbPartCards`) | 도달 (같은 leaf) | 지분과 동일 — ④가 만든 gbv를 `actualPriceMode`로 분기 | 컴패니언 Zod도 같은 `generalBuildingValuationSchema`(`schema-companion.ts:137`) → ⑫ 한 곳 수정으로 닫힘. E2E/anchor는 컴패니언 1건 포함 |
| **증축**(3파트) × 분리 ON 파트 감정 | 도달 (`ext`는 이미 환산 경로) | `general-building-extension.ts:277-281` Step 2.5가 `applyPartAcqModes` 재사용 — 개산공제 인자는 **환산 개산공제를 그대로** 넘긴다(`:266-276` 주석). 코드는 이미 감정·매매사례를 처리 | 필요 입력: 원건물 취득시 기준시가 두 칸은 `ext`가 이미 요구(`api-gb.ts:423-424`·V-5). 건물2(증축분)의 모드는 `actual`/`estimated` 2종뿐(`building-schemas.ts:247` `acquisitionMode`)이라 **건물2 감정은 범위 밖** — UI가 건물2 라디오를 확장하지 않을 것 |
| **증축 × 자산 단위(분리 OFF) 감정·매매사례** | 도달(UI가 열면) | 3-way는 파트 값 없는 파트를 「일괄 실가」로 계산(`extension.ts:314-345`) → 감정 모드가 **조용히 무시**, 개산공제 0 (F-6) | **차단**: ⑧ + ⑫ refine(3중 거울). Phase A에서는 구현하지 않는다(미결 Q-A3). 3-way에 자산 단위 추계 총액 안분을 넣는 별건 |
| **용도변경**(`houseToCommercialConversion`) | 도달 | 취득가액 산정 모드와 직교 — 모든 카드에 전파되어 장특 축만 건드림(`valuation.ts:591-597` · `route-actual.ts:608-614`) | §164⑦ 환산주택가격 override 게이트는 `gbHasFirstDisclosure && anyEstimated`(`api-gb.ts`) — **감정 파트에는 override 미적용**. 최초공시 전 취득 주택이면 개산공제 base가 §164⑦ 값이어야 할 수 있음 → **확인 필요 V-13**, Phase A는 현행 게이트 유지 |
| **이월과세**(`carryover_gift` 파트) | 도달 가능 — ⑧ blockEstimation은 상속·증여만(`validate-gb.ts:143-155`), 이월과세는 모드 검사 없음 | 이월과세 카드는 시나리오 A(증여자 취득가액)·B(증여 당시 평가액)가 취득가액을 **통째로 교체**(`transfer-tax-carryover.ts:410·622`)해 파트 취득가액 입력이 쓰이지 않음. 단 카드 `expenses`에 담긴 개산공제가 A/B에 잔존하는지는 **미확인**(환산 파트 선례 동일 구조) | UI는 이월과세 파트에서 모드 라디오 숨김, ⑧은 `carryover_gift` 파트의 `appraisal`/`salesCase` **차단**(보수적). 잔존 여부는 Do에서 anchor로 확인(V-14) |
| **부담부증여** | UI 숨김(`GeneralBuildingAcquisitionCardsParts.tsx:110` `transferType === "burdened_gift" → null`) | §159가 양도가·취득가·개산공제를 채무비율로 정한다(`route-actual.ts:380-420`) — 실가 경로에서만 | ⑧은 부담부증여 분기에서 조기 종결(`validate-gb.ts:49-52` `isBurdenedGiftGB`)해 모드를 안 본다. **(b)안 가드 필수**: ④ 라우팅에서 부담부증여는 파트 모드 무시·실가 경로(§3.1). stale 플래그가 환산 경로로 새면 `burdenedGiftInfo`가 소비되지 않아 §159 소실 |
| **상속 파트** | 도달 불가 (⑧ `blockEstimation`) | `landMode !== "actual"` → 차단(`validate-gb.ts:143-157`) — 감정·매매사례 포함. 평가액은 `landAcquisitionPrice` 슬롯 | 변경 없음. 「토지 상속 + 건물 감정」은 토지=actual(평가액 슬롯)·건물=감정으로 **허용** — 환산 경로가 처리(§97②1호·2호 파트별) |
| **증여 파트** | 도달 불가 (동 차단) | 동 | G-5(UI의 「환산취득가」 노출)는 UI 선택지 필터. 엔진·⑧은 변경 없음 |
| **§114조의2 가산세** (신축 5년) | 건물 감정 파트 ← **전달 안 됨** (F-3) | 해당 건물 감정가액 × 5%(법 §114의2①). 매매사례 제외 | §7 엔진 변경 참조 |
| **NBL 초과**(토지 2분할) | 도달 | 환산 경로가 개산공제를 사업용·비사업용에 면적 안분(`valuation.ts` `apportionLandByBusinessArea` 3곳) | 변경 없음 |
| **미등기**(§104③) | 도달 | 율 3/1000 파트별(환산 경로 `estimatedDeductionRate`) | 변경 없음 |
| **다건**(`multi/route.ts`) | GB 미지원 | — | 변경 없음 |

---

## 6. 분리 OFF 자산 단위 감정·매매사례

**현행 엔진이 이미 받는가: 아니오.** 세 단계에서 끊긴다.

1. ④가 총액을 GB payload에 안 싣는다(S3). 최상위 `acquisitionPrice=0` + `appraisalValue`/`similarSalesValue`(`transfer-tax-api.ts:282-286·392-401`)에만 있다.
2. ⑫ I3(`required-refines-gb.ts:121-122·138`)가 `bundled = v.bundledAcquisitionPrice ?? data.acquisitionPrice ?? 0`을 보고 「토지·건물 일괄 취득가액 또는 파트별 취득가액 두 칸이 필요합니다」 400(A5).
3. 통과해도 `route.ts:533` `bundledAcq`는 `acquisitionPrice`(=0)를 읽어 실가 경로 총액 안분이 0.

**(b)안에서 무엇이 계산돼야 하나**:
- 총액 7억(감정)을 **취득시 기준시가**로 토지·건물 안분(§4.3) → 토지 573,421,388 / 건물 126,578,612.
- 개산공제 토지 3,825,000 · 건물 844,341(미등기 3/1000, 지분 축소 포함).
- 자본적지출·양도비는 본문상 불산입 — 입력해도 세액이 안 변하므로 UI는 「감정·매매사례는 개산공제만 인정」 안내가 필요하다(「입력했는데 세액 그대로」 방지).
- 필요한 취득시 기준시가 두 칸: `requiresAcqStdPricePart`가 비-actual이면 참 → ⑧·⑫·④·⑤ 같은 술어.
- 매매사례 총액은 `similarSalesValue`. ⑧ I3′는 모드별 분기 필요(현행은 `fixedAcquisitionPrice`만).
- 증축이면 **차단**(F-6).
- 한 가지 모순 방지: ④는 분리 OFF에서 `landAcquisitionPrice` 등 파트 값을 **싣지 않는다**(§7). 총액·파트 값이 동시에 있으면 엔진은 「파트 값 우선」이 아니라 throw한다(§4.3).

---

## 7. 엔진·API 측 변경 지점 (14동기화 중 ④⑨⑩⑪⑫⑬⑭ + 엔진)

> file:line은 base `c47885ccd` 기준. **감사 보고 대비 정정**: `part-acq.ts:105-106` → 실제 **`:101-102`**(`landDeductible`/`buildingDeductible`); 나머지(`route-actual.ts:454-461`, `api-gb.ts:412`, 카드 `estimatedDeduction: 0` = `:533·542·550·558`)는 일치.

### 엔진 (Layer 2)

| 파일:위치 | 변경 |
|---|---|
| `lib/tax-engine/types/general-building.types.ts:133-134` (모드)·`:137-138` 근처(파트 금액) | `GeneralBuildingInput`에 `landSalesCaseValue?`·`buildingSalesCaseValue?`·`bundledAcquisitionPrice?` 추가 (런타임은 spread로 이미 흐르나 타입에 없음 — F-1) |
| `lib/tax-engine/general-building-part-acq.ts:31-41·72-145` | ① 비-분리 규칙(§4.3) ② 비-환산 파트 `acquisition` 산정을 정수 안분으로 ③ **카드가 알 감정 모드**를 돌려줌 — `PartAcqModeResult`에 `landMode`/`buildingMode` echo(§F-3) |
| `lib/tax-engine/general-building-valuation.ts:540` 건물 카드 · 3-way `general-building-extension.ts:526` 건물1 카드 | 카드에 `acquisitionMode` echo(`AssetCardForAggregate` `general-building.types.ts:468` 근처) — 건물 카드의 모드만 필요(§114의2는 건물 한정) |
| `app/api/calc/transfer/general-building-route-cards.ts:216` `buildProperties` | 건물 카드 `acquisitionMode ∈ {estimated, appraisal}`이면 §114의2 판정 축을 단건 input에 싣는다. **`acquisitionMethod:"appraisal"`로 싣지 말 것** — 단건 `calcTransferGain` 감정 분기(`transfer-tax-helpers.ts:374-384`)가 개산공제를 `standardPriceAtAcquisition`(카드엔 없음)으로 **다시 계산해 카드 `expenses`를 덮어써 G-2를 엔진 안에서 재현**한다. 권장: `TransferTaxInput.penaltyAxis?: {acquisitionMethod: "estimated"\|"appraisal"; base: number}` 신설 |
| `lib/tax-engine/transfer-tax-finalize.ts:425-440` · `transfer-tax-loss-return.ts:88-96` · `transfer-tax-multi-parcel-branch.ts:255-259` | 가산세 판정 축 해소를 **단일 헬퍼**로 통일(`resolveSplitBuildingPenaltyAxis`(`finalize.ts:106`)와 같은 자리, 같은 export). 손실 조기반환 경로도 읽는다 — 법 §114의2②가 산출세액 0에도 적용(finalize 주석 `:97-100`이 「배선할 때 재사용」이라 명시). `calculateBuildingPenalty`의 `appraisal && transferDate >= 2020-01-01` 날짜 게이트(`building-penalty.ts:27-29`)는 그대로 재사용 |
| `lib/tax-engine/types/transfer.types.ts` (`acquisitionMethod` `:803` 근처) | `penaltyAxis?` 필드 추가 |

### API / Route

| 지점 | file:line | 변경 |
|---|---|---|
| **④** 변환 | `lib/calc/transfer-tax-api-gb.ts:341-343` 모드 파생 | `separate = !!asset.hasSeperateLandAcquisitionDate`; `!separate`이면 `landMode = buildingMode = deriveLegacyPartAcqMode(asset)`(explicit 무시 — F-5·S1 방어). **미결 Q-A2**: 이 방어가 현행 환산축(S1)의 거동도 바꾸므로 사용자 확인 |
| ④ | `:343` `anyEstimated` → `anyNonActual`; `:412` 분기 `|| asset.gbHasExtension` 유지; 부담부증여 가드(`asset.transferType === "burdened_gift"` → 실가 return) | 라우팅(§3.1) |
| ④ | `:423-426` `needLandStd`/`needBuildingStd` | `mode !== "actual" \|\| ext` (F-4) — ⑧·⑫와 같은 술어 `requiresAcqStdPricePart` |
| ④ | `:387-408` `partModePayload` | `landSalesCaseValue`/`buildingSalesCaseValue` 추가(`separate && mode==="salesCase"`일 때만, `parseAmount`, 0이면 미전송); 분리 OFF면 파트 값 4종 미전송; 자산 단위일 때 `bundledAcquisitionPrice` = 감정 → `fixedAcquisitionPrice` / 매매사례 → `similarSalesValue` (지분 스케일은 `applyShareScale`) |
| ④ | `:471` 증축 spread의 `bundledAcquisitionPrice: parseAmount(fixedAcquisitionPrice)` | 의미 확장과 충돌 점검 — 증축 실가 전용 로직이 비-증축 감정에서 오동작하지 않도록 `gbHasExtension` 게이트 유지, 신규는 별도 키 조립 |
| ④ 지분 | `lib/calc/transfer-tax-api-gb-shares.ts:124-136` | 스케일 목록에 두 `*SalesCaseValue` 추가(F-7) |
| **⑨** Zod enum 메인 | `lib/api/transfer-tax-schema-base-shape.ts:260-267` | 변경 없음 — 이미 4종·`*SalesCaseValue`(`:284-286`) (주택·건물 split용). GB는 서브스키마가 별도 |
| **⑩** 컴패니언 + `addPropertyRefines` | `lib/api/transfer-tax-schema-companion.ts:137` | 같은 `generalBuildingValuationSchema` 재사용 — ⑫ 수정으로 자동 |
| ⑩ 최상위 refine | `lib/api/transfer-tax-schema-refines.ts:257·266` | 변경 없음 — `acquisitionMethod==="appraisal"`이면 `appraisalValue`, `salesCase`면 `similarSalesValue` 요구(이미 존재, A5 body는 `appraisalValue` 싣고도 I3가 먼저 400) |
| **⑪** 자산-수준 `acquisitionDate` fallback | — | 해당 없음 (파트 취득일 규약 M-1a 불변) |
| **⑫** Zod 입력 객체 | `lib/api/transfer-tax-building-schemas.ts:187-194` 근처 | `landSalesCaseValue`·`buildingSalesCaseValue: z.number().int().nonnegative().optional()` 추가(**없으면 strip — A4**) |
| ⑫ | `:459-466` | `needLandStd`/`needBuildingStd` = `mode !== "actual" \|\| ext` |
| ⑫ | `lib/api/transfer-tax-schema-required-refines-gb.ts:95-98` I2 | 모드별로: `actual`/`appraisal` → 파트 값, `salesCase` → `*SalesCaseValue`; 단 **분리 OFF 총액 규칙**(두 파트 own 없음 + `bundledAcquisitionPrice>0`) 허용. 증축 × 자산 단위 비-actual 차단 refine 추가 |
| ⑫ | `:121-122·138` I3(`actualPriceMode`) | 실가 경로는 둘 다 actual일 때만 → 변경 없음 |
| **⑬** body | `lib/calc/transfer-tax-api.ts:599` | 서브객체를 통째로 싣는다 — 새 키는 자동으로 흐름. **변경 없음**(스프레드 나열형이 아님) |
| **⑭** Route | `app/api/calc/transfer/route.ts:533` `bundledAcq` | 환산 경로 비-증축에서는 미사용 — (b)안이면 변경 없음. (a)안이면 `appraisalValue`/`similarSalesValue` fallback 필요 |
| ⑭ | `app/api/calc/transfer/general-building-route-helper.ts:145-170` 실가 / `:172-216` 환산 | 변경 없음 — 둘 다 gbv를 **스프레드**로 전달(구조 가드 `gb-route-actual-payload-forwarding.anchor.test.ts`). 새 키가 자동으로 흐름 |
| ⑭ | `general-building-route-cards.ts:216` | 위 엔진 표 참조 (§114의2 축) |
| ⑧ 참고(클라이언트) | `lib/calc/transfer-tax-validate-gb.ts:435·446-447`(V-5), `:415·422`(V-7), `validate-gb-required.ts:68-70`(I3′) | V-5 게이트·`needLandStd` → 비-actual; V-7: `salesCase`는 `*SalesCaseValue` 요구·`appraisal`은 `*AcquisitionPrice`; I3′: 매매사례는 `similarSalesValue`; 증축 × 자산 단위 비-actual 차단; 이월과세 파트 × 비-actual 차단. **UI 시니어 몫이지만 ⑫ 거울이므로 목록에 둔다** |

**3중 패턴 점검**(정책 #3): UI display fallback이 아니라 **모드 파생**(`effectivePartAcqMode`/`deriveLegacyPartAcqMode`)이 4 레이어(⑤ 표시 · ④ 전송 · ⑧ 검증 · ⑫ 거울)에서 같아야 한다. 이 설계는 `useEffect → store` 미러링을 쓰지 않고, 자동 안분 fallback도 없다 — §4.3의 비-분리 안분은 법정 안분(§100② 본문, 사용자가 총액을 명시 입력)이고 **파트 값이 일부만 있으면 throw**한다. PHD 예외 아님.

---

## 8. 검증 항목(V-n) 결과

| # | 결과 | 근거 |
|---|---|---|
| **V-3** G-2 vitest 고정 | ✅ 완료 | §2 — A1~A6 활성(현행 특성화) + X1~X5 `it.skip`(기대). 감사 시드 300,333,515를 Route로 재현 |
| **V-4** G-3 막다른 길 | ⏸ 미수행 (UI 몫) | 엔진 측 접점: F-5 stale 파트 모드 — S1·S2 실측 |
| **V-5** §163⑥ 1·2호 본문 | ✅ 확인 | MST 290841(소득세법 시행령, 시행 2026-10-01) 제163조 제6항: 「법 제97조제2항제2호 각 목 외의 부분 본문에서 대통령령으로 정하는 금액」 = **1호 토지** 취득당시 개별공시지가×3/100(미등기 3/1000) · **2호 나목** 가목외 건물 취득당시 법 제99조제1항제1호 나목의 가액×3/100(미등기 3/1000). 법 §97②2호 본문(MST 280405)이 「제1항제1호나목(…)의 금액에 자산별로 대통령령으로 정하는 금액을 더한 금액」 — **매매사례가액·감정가액·환산취득가액 모두 나목**이므로 세 방식 모두 개산공제 대상. 단서(택일)는 「환산취득가액으로 하는 경우」 한정 |
| **V-6** §114조의2 | ✅ 법문 확인 · ❌ **전달 안 됨** | 법 §114의2①(MST 280405): 「신축 또는 증축(바닥면적 합계 85㎡ 초과)하고 취득일·증축일부터 5년 이내 양도 + **제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액**을 취득가액으로 하는 경우 → **해당 건물의** 감정가액(증축은 증축 부분)·환산취득가액의 100분의 5를 결정세액에 더한다」. 판정은 `building-penalty.ts:27-29`가 `acquisitionMethod==="appraisal"` + 양도일 ≥2020-01-01로 한다. 그런데 GB 카드는 `buildProperties`(`route-cards.ts:216`)가 **환산만** `"estimated"`로 싣는다 — 파트 감정 모드는 카드 필드가 없어 판정에 도달하지 못한다(A6 실측 0원). 주택·건물 split 선례는 `resolveSplitBuildingPenaltyAxis`(`finalize.ts:106`)가 파트 신호에서 가져온다 — GB 카드용 동일 축이 없다 |
| V-7 §176의2③ 요건 | ✅ 본문 확인 (신규) | 영 §176의2③(MST 290841): 매매사례 1호 「양도일 또는 취득일 전후 각 3개월 이내 동일성·유사성 있는 자산의 매매사례」; 감정 2호 「전후 각 3개월 이내 **둘 이상** 감정평가법인등이 평가한 신빙성 있는 감정가액(기준일 3개월 이내)의 평균액, 단 기준시가 10억 이하는 **하나**」. §163⑫가 §97①1호 나목을 영 §176의2②~④로 위임 → 요건은 실재한다 |
| **D-2** 주택 경로의 감정 검증 범위 | ✅ 확인 | 주택 split은 감정평가기준일·감정기관 수를 **검증하지 않는다** — `appraisalDate*` 심볼은 `appraisalDateAtTransfer`(양도시 안분 basis 축) 뿐(grep). 매매사례만 「값 입력」 요구(`validate-split.ts:93`). **Phase A도 새 규칙을 만들지 않는다**(§176의2③ 요건은 안내문 수준, UI 몫) |

---

## 9. 미결·확인 필요

**사용자 결정(Q-A)**
- **Q-A1** D-1 (b)안 채택 확인(§3). (a)로 가면 §3 말미 분리 계획.
- **Q-A2** 분리 OFF에서 ④가 파트 모드를 legacy 파생값으로 통일(§7 ④) — 감정·매매사례뿐 아니라 **현행 환산축의 stale 거동(S1)도 바뀐다**. 한정(감정·매매사례만) vs 전면. 권장 전면(분리 OFF 불변식 「두 파트가 같은 값」, `split-acq-mode.ts` `effectivePartAcqMode` 머리말).
- **Q-A3** 증축 × 자산 단위 감정·매매사례: 차단(권장, F-6) vs 3-way에 총액 안분 구현.
- **Q-A4** 이월과세 파트 × 감정·매매사례: ⑧ 차단(권장) — 개산공제 잔존 확인(V-14) 후 완화 가능.
- **Q-A5** §114조의2 감정 가산세(F-3)를 이번 PR 범위에 포함(권장 — UI 개방 즉시 활성화되는 침묵 누락).

**확인 필요**(미검증 — 추정 금지)
- **V-13** 용도변경(주택→상가) × 최초공시 전 취득 × 감정 파트: 영 §164⑦ 환산주택가격이 개산공제 base여야 하는지. 현행 `anyEstimated` 게이트 유지 시 감정 파트엔 override 미적용.
- **V-14** 이월과세 카드의 `expenses`(개산공제)가 시나리오 A/B(`transfer-tax-carryover.ts:410·622`)에 잔존하는지 — 환산 파트 선례와 같은 구조인지 anchor로 실측.
- **V-15** 부담부증여 + stale 비-actual 플래그가 현행(환산)에서도 환산 경로로 새는지 — `burdened_gift` 선택 시 플래그 정리 여부 probe. (b)안 가드는 어쨌든 필요.
- **V-16** 지분 단건(`assets.length=1`, ownership<1)이 GB에서 도달 가능한가 — `buildGeneralBuildingShares`는 2건 이상만. 도달 가능하면 단건 경로의 파트 금액 지분 스케일 누락 여부.
- **V-17** (b)안 라우팅 변경 대상의 저장 이력 존재 여부 — GB UI에 감정 라디오가 없어 레코드 없음으로 보이나 IndexedDB 실측은 안 했다.
- **V-18** `aggregate`의 item→단건 input 매핑이 신규 `penaltyAxis`를 보존하는지(⑭ 침묵 strip) — Do 시 anchor.
- 감정 총액 안분의 float 비율(`splitPair`) vs 정수 산식 — 주택 split은 건드리지 않음(회귀 0). 필요하면 별건.
- 800줄: `validate-gb.ts` 707→~735, `building-schemas.ts` 696→~720 예상(추정 — 구현 후 측정). ≥750이면 기회주의적 분리.

---

## 10. 테스트 계획

### 10.1 Pre-Do (완료)
`__tests__/api/transfer.route.gb-part-appraisal-salescase.predo.anchor.test.ts` — A1~A6 현행 특성화 · O1·O2 oracle · X1~X5 `it.skip`. Do 단계에서 **skip 해제 = 완료 기준**. X4·X5는 ④ 변경 후 body 모양(분리 OFF 총액을 `bundledAcquisitionPrice`로)이 바뀌므로 body 조립을 그때 갱신한다(A5/X4는 현재 「UI 변환 전」 모양).

### 10.2 조합 매트릭스 anchor (Do)
일반건물 4×4(토지 모드 × 건물 모드 ∈ {actual, estimated, appraisal, salesCase}) 16조합 — 지정값은 범위가 아니라 ±0 동등성(memory `feedback_range_assertion_misses_spec_violation`).
- (actual, actual): **회귀 0** — 라우팅 불변, 세액 300,333,515 · 카드 전 필드 동일.
- 비환산 신규 조합 감정/실가·실가/감정·감정/감정·매매사례/실가·실가/매매사례·매매사례/매매사례·감정/매매사례(7): 각 oracle(§2.3 방식) 대비 결정세액 ±0 + 카드 `acquisitionPrice`·`necessaryExpense` 단언.
- 환산 혼합(감정/환산·매매사례/환산 등 4): 환산 경로 기존 anchor(`general-building-part-acq-modes.anchor.test.ts`)와 같은 형식 + 개산공제 보존.
- 축 교차: 지분 2건(60/40 — `*SalesCaseValue` 스케일 포함) · 컴패니언 1건 · NBL 초과 + 감정 · 미등기 3/1000(토지만/건물만) · 감가상각(§97③) × 건물 감정 · 증축 × 분리 ON 파트 감정 · 상속 토지 + 건물 감정(허용) · 분리 OFF 자산 단위 감정·매매사례(§6) · 증축 × 자산 단위(차단) · 이월과세 파트(차단) · 부담부증여 stale 플래그(실가 경로 유지).
- §114조의2: 건물 감정 5% · 건물 매매사례 0 · 2019-12-31 이전 양도 0(날짜 게이트 경계 ±1일) · 신축 5년 정확히/+1일 · 손실 건(산출세액 0)에도 가산세 · 토지 감정은 0.
- 정수 정밀: 총액 안분 `safeMultiplyThenDivide` — 2^53 초과 입력(예: 총액 100억 × 기준시가 수십억)에서 BigInt 경로 동등.

### 10.3 Mutation probe 대상 (각 ≥1건 KILLED)
1. `part-acq.ts:101-102` `landMode !== "actual"` → `=== "estimated"` (G-2의 원인 복원 — X1·X2가 죽어야 함)
2. ④ 라우팅 `anyNonActual` → `anyEstimated`
3. ④/⑫/⑧ `needLandStd`에서 `!== "actual"` → `=== "estimated"`
4. `applyShareScale`에서 `*SalesCaseValue` 제거 (지분 매매사례 과소과세)
5. 자산 단위 안분의 취득시 비율 → 양도시 비율 교체
6. 미등기 율 3/1000 → 3/100
7. `penaltyAxis` 제거(§114의2 0원 복귀) · 손실 조기반환 경로에서만 제거
8. 부담부증여 가드 제거 (stale 플래그 + `burdenedGiftInfo` 소실)
9. 비-분리 규칙의 「한쪽만 있으면 throw」 → 잔액 도출

> mutation 하네스 주의(memory): cwd 리셋 가짜 KILLED·zsh 단어분할·`git checkout` WIP 파괴 — 변형 후 원복을 `git diff --stat`로 확인, 워크트리 단일 작업.

### 10.4 회귀·E2E
`npm run test:transfer` + 공유 헬퍼(`effectivePartAcqMode`·`requiresAcqStdPricePart`)를 건드리면 전체. E2E는 UI 시니어 몫 — request body에 `landAcqMode:"appraisal"`·`landAcquisitionPrice`·(분리 OFF) `bundledAcquisitionPrice` 단언. 브라우저 수동 확인 미수행(엔진 설계 단계).
