# D1-4 — 1990.8.30. 전 상속·증여 토지 파트의 §163⑨ 단서 1호 max — 엔진·API 설계

> 작성 2026-10-09 · 워크트리 `Property-related-Taxes-d14` (브랜치 `feat/transfer-acq-cause-mixed-d1-4`, base `a50ad594c`)
> 선행: 계획서 `docs/00-pm/transfer-acq-cause-mixed.plan.md` §10.1 U-1(= D1-4) · §10.2 T-5·T-6 · §10.3 D1-4 행, D1 설계 `…-d1.engine.design.md` §6, D1-1~D1-3 구현 기록.
> 범위: **엔진 + ⑨⑩⑫⑬⑭ + ④ 페이로드 + ⑧ 규칙**. UI(⑤⑥⑦·위젯·4뷰)는 UI 시니어 문서가 따로 다룬다. 이 문서가 UI와 맞물리는 곳은 §2(입력원)·§3(echo)·§5(leaf 시그니처)이다.
> 검증: 수치는 `POST /api/calc/transfer` 직접 호출 실측(mock 세율)과 Pre-Do anchor `__tests__/api/transfer.route.split-land-part-cause.d1-4.predo.anchor.test.ts`(활성 15 · todo 9, 단일 파일 통과·`tsc` 0건)로 고정했다. 법령은 KoreanLaw MCP 본문 조회 2026-10-09(영 MST 290841 시행 2026.10.1.).

---

## 0. 결론 요약

| # | 질문 | 결론 |
|---|---|---|
| 1 | max를 어느 층에서 | **엔진 split 파트가 max(①평가액, ②§164④)를 계산한다.** ④는 ②(총액)를 파생해 `landSec164Value`로 **함께** 보낸다(일반건물처럼 ④에서 max해 한 값만 보내지 않는다). 이유: ⑫가 「② 필수」를 강제할 수 있고, 채택 값을 echo할 수 있고, 계산 지점이 한 곳이다 (§1) |
| 2 | ② 입력원 | 면적 = 자산 단위 `acquisitionArea`(부수토지 면적, 주택 ①기본정보), 등급 3종 + 1990.1.1. ㎡당가 = 기존 `pre1990*` 5필드 **재사용**. 혼합 원인 자산(건물 매매·신축)에서 이 필드의 **다른 소비처는 전부 불활성**임을 확인했다 (§2). 충돌은 D2(건물 상속)에서 생긴다 |
| 3 | 경계 | `landDate < 1990-08-30`(엄격) 유지. 1985.1.1. 전도 **같은 산식** — 일반건물 anchor와 일치. 계획서 T-6의 「원 날짜가 산식을 가른다」는 **산식이 아니라 ② 입력의 시점 라벨**(의제취득일 현재 등급)과 보유연수 표기만 가른다 (§4) |
| 4 | Q-7 규칙 | 「무조건 차단」을 **「② 미입력 차단」으로 교체**. 같은 leaf 한 곳을 엔진·⑫·⑧이 공유 (§5) |
| 5 | 세율·장특·개산공제 | **취득가액만 바뀐다.** 세율 기산·장특 기산·개산공제 0은 불변 (§6) |
| 6 | Pre-Do | 현행 차단(RED) + 변경 후 손계산 세액(104,660,000 / 90,830,000)을 활성 anchor로 고정 (§8) |

구현은 **2 PR**: D1-4a(엔진·⑫·⑭·④ — 화면 불변, ⑧은 그대로 막음) → D1-4b(UI + ⑧ 해제 + ④ 전송 + ⑥ + E2E). 각 PR 단독으로 막다른 길이 없다 (§9).

---

## 1. max를 어느 층에서 계산하나

### 1.1 세 선택지

| | O1 — ④에서 max (일반건물 선례) | **O2 — 엔진 max + ② 별도 전송 (권장)** | O3 — 원자료(등급 5종) 전송, 엔진이 ②까지 산출 |
|---|---|---|---|
| ④ | `Math.max(①,②)`를 `landAcquisitionPrice` 한 값으로 | ①=`landAcquisitionPrice`, ②=`landSec164Value`(총액) | 등급·면적·1990 ㎡당가 5필드 |
| 엔진 | **변경 없음**(Q-7 규칙만 제거) | `calcSplitAcquisitionPrice` ctx에서 max + echo | 위 + `calculatePre1990LandValuation` 호출 |
| ⑫ 방어 | **없음** — 1984 상속 토지에 평가액만 보낸 API 직접 호출이 침묵 통과(= D1-1이 막은 G-10 재현). 일반건물도 같은 한계(D1 설계 §6.3 표 — ④ 값에 max가 이미 반영되어 엔진·⑫는 비교 여부를 모른다; 구현 `transfer-tax-api-gb.ts:293-415`) | ② 없으면 400 | 5필드 없으면 400 |
| 채택 echo | 불가(엔진은 최종값만 안다) | 가능 | 가능(+ ② 산식 문장까지) |
| 새 Zod 필드 | 0 | 1(`landSec164Value`) | 5+(`pre1990Land` 형 서브객체, 키 충돌 주의) |
| ⑭ 매핑 | 0 | 3곳 | 3곳 + 서브객체 변환 |
| 규모 | S | M | L |

**O1 기각 근거** (비교 요청 항목별):
- **API 직접 호출 방어**: O1은 ⑫가 비교가 일어났는지 알 방법이 없다. 사용자 화면은 ④를 거치지만 ⑫는 화면과 무관한 방어선이다(D1-1이 R-Q7을 ⑫에 둔 이유).
- **echo**: 사용자 요청이 「어느 값이 채택됐는지」 표시를 요구한다. 단건 경로는 `preDeemedBreakdown`·formula로 ①②③을 보여 준다(`inheritance-acquisition-price.ts:130-210`). 분리 경로만 최종값만 보이면 같은 법 규정이 화면에 따라 다르게 보인다.
- **경로 수(G-4 교훈)**: O1·O2 모두 ④ 지점은 **한 곳**이다. `buildSplitPayload`(`transfer-tax-api-split.ts:54`)와 `buildLandPartCausePayload`(`:261`)는 단건(`transfer-tax-api.ts:419·499`)·다건(`multi-transfer-tax-api.ts:290·292`)·컴패니언(`transfer-tax-api-companion-payload.ts:186·205`) **3경로가 공유**한다. 따라서 경로 수는 O1을 고르는 이유가 못 된다 — 반대로 ②를 `buildLandPartCausePayload`에 두면 3경로가 자동으로 같은 값을 보낸다.

**O3를 고르지 않은 이유**: 단건 토지는 원자료를 보내 엔진이 산출한다(`pre1990Land` → `inheritance-acquisition-helpers.ts:195-257`). 그러나 분리 경로는 화면이 **산출 ㎡당가를 실시간으로 보여 줘야** 하므로 클라이언트 파생(`calculatePre1990LandValuation` — 일반건물·PHD·상가 브리지 3종이 이미 이 방식)이 어차피 필요하다. 엔진이 한 번 더 산출하면 같은 5입력→숫자 연쇄가 두 벌이 되고 새 서브객체 스키마가 생긴다. ②를 숫자로 보내는 O2가 일반건물·상가와 같은 모양이다. (O3로 가려면 `pre1990Land`가 **STEP 0.4에서 자산 단위 환산 모드를 강제**(`transfer-tax-api-primary-context.ts:70` 주석 — 실측 최대 178,196,271원 과대)하므로 다른 키 이름이 필수 → 비용 증가.)

### 1.2 O2 상세

**④ (`buildLandPartCausePayload(primary, { ratioed })` — 시그니처에 `ratioed` 추가, 호출 3곳 모두 보유)**
```
cause = effectiveLandAcquisitionCause(primary)       // 기존
if (cause ∈ {inheritance, gift} ∧ landDate < "1990-08-30")
    sec164Total = deriveHousingLandSec164Total(primary)   // §2, 면적×㎡당가, 100% 기준
    → landSec164Value: ratioed(sec164Total)               // ① 과 같은 지분 스케일 (makeRatioed)
```
- ①(`landAcquisitionPrice`, `transfer-tax-api-split.ts:205`)과 ②가 **같은 `ratioed`** 를 거쳐야 같은 축에서 비교된다(100% 입력 → ×지분율, 절사 규약 `applyRatio` 공용).
- 게이트 술어는 새로 쓰지 않는다 — ⑧·⑥·⑤가 같은 `landSec164Applies(asset)`(= `effectiveLandAcquisitionCause ∈ {상속,증여}` ∧ `landAcquisitionDate < SEC_163_9_LAND_FIRST_DISCLOSURE`)를 import한다 (`mirror-pattern` 3중).

**엔진 (`calcSplitAcquisitionPrice`, `transfer-tax-split-acq-price.ts:415`)**
```
landAcquisitionPrice: resolveLandPartAcquisition(input)   // 신규 leaf 함수
  M = input.landAcquisitionCause ∈ {inheritance, gift} ∧ dayKey(input.landAcquisitionDate) < "1990-08-30"
  M ∧ landSec164Value > 0 → max(landAcquisitionPrice ?? 0, landSec164Value)   // 동점 = 평가액(reported)
  그 밖 → input.landAcquisitionPrice  (landSec164Value는 무시 — 단서 밖에선 비교 안 함)
```
- `landAcquisitionPrice`의 엔진 소비처는 이 ctx 한 곳이다(grep: `transfer-tax-split-acq-price.ts:226·229·234·237·415`, PHD 경로는 R-X2로 상속·증여 토지와 양립 불가). max 지점이 하나다.
- 개산공제는 0 유지: 파트 모드가 `actual`(G-2가 추계 차단)이라 `calcPartAcquisitionPrice`의 `actual` 분기를 그대로 탄다.

**⑫**: leaf 규칙(§5)으로 M ∧ `landSec164Value` 없음/0 → 400(field `landSec164Value`). ⑫ 필드 정의는 `transfer-tax-schema-base-shape.ts`(주 자산, `:335` 인접)와 `transfer-tax-schema-split.ts`(컴패니언, `:45` 인접) 두 곳 — `z.number().int().nonnegative().optional()`.

### 1.3 건드리는 동기화 지점 (O2)

| 지점 | 변경 | 위치 |
|---|---|---|
| ① 폼 타입 | **없음**(`pre1990*` 7필드·`acquisitionArea` 기존) | — |
| ② initial/③ normalize | **없음** (UI 설계가 별도 필드를 추가하면 그때) | — |
| ④ | `buildLandPartCausePayload`에 ② | `lib/calc/transfer-tax-api-split.ts` |
| ⑥ 사이드바 | `separateAcqPartsSum` 토지 가액 = max(①,②) (같은 helper) | `transfer-tax-split-acq-mode.ts` (UI 문서) |
| ⑧ | `validateLandPartCause`가 ② 파생 유무를 leaf 사실로 공급 + 5필드 부분입력 오류 이동 앵커 | `transfer-tax-validate-split.ts`, `sec164-required-fields.ts` |
| ⑨⑩ | 변경 없음(enum 무관) | — |
| ⑪ | 변경 없음 | — |
| ⑫ | 필드 2곳 + `refineSplitPartCause` 사실 공급 | base-shape·schema-split·`required-refines-2a.ts:361-376` |
| ⑬ body spread | `buildLandPartCausePayload` 반환에 포함 → 단건·다건·컴패니언 자동 | — |
| ⑭ | `landSec164Value` 3곳: `app/api/calc/transfer/engine-input.ts:352` 인접 · `multi/route.ts:214` 인접 · `bundled-split-helpers.ts:395` 인접 | |
| 엔진 타입 | `TransferTaxInput.landSec164Value?: number`(`transfer.types.ts:1169` 인접), `SplitPartResult.acquisitionBasis` | |

⑫⑬⑭는 TypeScript가 못 잡는다(CLAUDE.md). 구현 전 `grep -n landDecedentAcquisitionDate`로 얻은 목록(`engine-input.ts:331` · `bundled-split-helpers.ts:389` · `multi/route.ts:199` · `base-shape.ts:280` · `schema-split.ts:32` · `required-refines-2a.ts:72·361·376`)과 1:1로 대조한다.

---

## 2. §164④ 가액(②)의 입력원

### 2.1 법령 (본문 확인 2026-10-09)

- 영 §163⑨ 단서 1호: 「「부동산 가격공시에 관한 법률」에 따라 1990년 8월 30일 개별공시지가가 고시되기 전에 상속 또는 증여받은 토지의 경우에는 상속개시일 또는 증여일 현재 「상속세 및 증여세법」 제60조 내지 제66조의 규정에 의하여 평가한 가액과 제164조제4항의 규정에 의한 가액중 많은 금액」.
- 영 §164④: 「1990년 8월 30일 개별공시지가가 고시되기 전에 취득한 토지의 취득당시의 기준시가는 다음 산식에 의하여 계산한 가액」 = 1990.1.1. 기준 개별공시지가 × (취득당시 시가표준액 ÷ ((1990.8.30. 현재 시가표준액 + 그 직전 시가표준액) ÷ 2)).
- 영 §163⑨ 본문 괄호: 상증법 §34~§39·§39의2·§39의3·§40·§41의2~§41의5·§42·§42의2·§42의3 증여(의제)는 제외, ⑩1호는 그 증여의제이익을 취득가액에 가산한다 → 현행 `gift` 선택지에 증여의제 경로가 없으므로(`transfer-163-9-base-date.ts` 머리 주석) 변경 없음. 화면 안내 한 줄만(UI) — V-6 유지.

### 2.2 필드 출처

| ② 구성 | 출처 | 근거 |
|---|---|---|
| 면적(㎡) | 자산 단위 `acquisitionArea` — **부수토지 면적**. 일부양도(`areaScenario === "partial"`)는 `resolveAcqAreaForStdPrice`(양도분, `transfer-tax-api-helpers.ts:299-310`) | 주택 ①기본정보 축 A (`AssetAreaSection.tsx:66-76`·`84-` housing `["same","partial"]`, building `["same"]`) |
| 등급 3종(취득시·1990.8.30. 현재·직전) | `pre1990Grade_atAcq` · `pre1990Grade_current` · `pre1990Grade_prev` (+ `pre1990GradeMode`) | 기존 7필드 |
| 1990.1.1. 개별공시지가 | `pre1990PricePerSqm_1990` | 기존 |
| 취득일(CAP-2 판정) | **토지 파트 취득일**(`landAcquisitionDate` = 상속개시일·증여일) | `calculatePre1990LandValuation`의 `acquisitionDate`가 1990-01-01 이후면 비율 1.0 상한(CAP-2, anchor C-3). 일반건물 `gbLandAcquisitionDate`와 같은 규약 |
| 양도일 | 산식에 쓰이지 않는다(`pre-1990-land-valuation.ts:287-` 어디에도 소비 없음, `validateInput`만) → 더미 Date | PHD 브리지도 동일(`transfer-pre1990-phd-bridge.ts:99`) |

신규 브리지 `lib/calc/transfer-pre1990-housing-land-bridge.ts`(≈60줄): `landSec164Applies(asset)` · `deriveHousingLandSec164PerSqm(asset)` · `deriveHousingLandSec164Total(asset)`(㎡당 × 면적, `multiplyByArea`/`safeMultiply` — 인라인 곱 금지). `transfer-pre1990-gb-bridge.ts`의 3단 구조(게이트·파생·effective)를 미러링하되, GB의 `pre1990Enabled` 래치는 **요구하지 않는다**: §163⑨1호 비교는 법이 정한 계산이라 사용자가 켜고 끄는 선택이 아니다(`sec164LandFieldsAlwaysOpen` 주석 B3 — 칸을 토글 뒤에 숨기면 보이지 않는 값이 취득가액을 바꾼다). 래치 없이도 5필드가 모두 찰 때만 ②가 생긴다 → 부분입력은 ⑧이 차단.

### 2.3 `pre1990*` 필드 충돌 실측 (소비처 전수)

| 소비처 | 게이트 | 근거 | 혼합 원인 주택(건물 매매·신축)에서 |
|---|---|---|---|
| 토지 §164④ 환산(`hasPre1990LandEstimation`) | `assetKind === "land"` | `transfer-pre1990-land-gate.ts:62-65` | 불활성 |
| 토지 §163⑨1호 ②(`hasPre1990ForSec164`) | `assetKind === "land"` ∧ 자산 원인 ∈ 상속·증여 | `transfer-tax-api-primary-context.ts:93-94` | 불활성 |
| 매매 토지 환산 UI(`showPre1990`) | `isLand` | `CompanionAcqPurchaseBlock.tsx:182-186` | 불활성 |
| 주택 상속 §164⑤~⑦ 3시점(`sec164HouseStatus` · `buildInheritedHouseValuationPayload`) | housing ∧ **자산 원인(건물)** ∈ 상속·증여 | `sec164-required-fields.ts:111-114` · `transfer-tax-api-inheritance.ts:181` | 건물이 매매·신축이므로 불활성 |
| 일반 주택 PHD(`derivePre1990PlainHousePhdLandPricePerSqmAtAcq`) | `usePreHousingDisclosure` | `PreHousingDisclosureSection.tsx:89` | 토지 원인 유효 시 PHD 무시(`phdFlagEffective`, D1-1 F1·D1-2 F1) → 불활성. 단 PHD가 자동 ON이던 이력이 **같은 5필드에 값을 남겼을 수 있다** |
| 겸용주택 PHD | `isMixedUseHouse` | — | 혼합 원인 호스트에서 제외(`landPartCauseApplicable`) |
| 일반건물·상가 | `assetKind` | — | 무관 |

**결론**: 혼합 원인 주택에서 `pre1990*`의 **동시 소비처는 없다**. 의미도 같다(「토지 취득시 등급」 — PHD 브리지도 `landAcquisitionDate || acquisitionDate`를 취득일로 쓴다). stale 위험은 PHD 자동 ON 이력이 남긴 값이 새 블록에 **보이는 채로 미리 채워지는** 형태라 침묵이 아니다(입력 칸이 그 값을 표시·수정 가능). 별도 필드(`landPre1990*`)는 ①②③ 포함 14지점×7필드 비용인데 얻는 안전이 없어 **재사용 권장**.

**충돌이 생기는 곳 = D2.** 건물이 상속·증여면 `sec164HouseStatus`가 같은 5필드를 **자산 원인 기준 날짜**로 요구한다(`deriveSec163_9BaseDate(primary)`). 건물 상속 + 토지 상속·증여 조합이 열리면 두 소비처가 한 필드를 다른 시점으로 읽는다. 지금은 R-X5(건물 비매매·비신축 차단)가 그 조합을 막는다 — D2 설계 때 필드 분리를 재검토한다(기록).

**개별주택가격(결합 공시)과의 관계**: 무관하다. ②는 **토지 파트 단독** §164④ 가액이며 주택가격 결합 공시는 건물 매매 파트의 취득시 기준시가(`standardPriceAtAcq`/`buildingStandardPriceAtAcq`) 축이다. D1-1~3은 별개 취득에서 결합 총액 전송을 이미 차단한다(`transfer-tax-api-split.ts:166` `standardPriceAtAcquisition: undefined` 덮어쓰기).

---

## 3. 결과 echo

`SplitPartResult`(land 파트에만)에 optional 1필드 추가 — D1-3의 5필드와 같은 생성 지점(`transfer-split-part-echo.ts`)을 쓰되, 값은 취득가액 계산에서 나오므로 `calcSplitAcquisitionPrice`가 `acquisitionBasis`를 돌려주고 `calcSplitGain`이 land 파트에 spread한다.

```ts
/** 영 §163⑨ 단서 1호 비교가 적용된 토지 파트만. 구 결과·단서 밖은 생략. */
acquisitionBasis?: {
  rule: "sec163_9_1";
  reported: number;        // ① 상속개시일·증여일 평가액 (지분 스케일 후)
  sec164: number;          // ② §164④ 가액 (지분 스케일 후)
  adopted: "reported" | "sec164";   // 동점 = reported
};
```
- `summarizeSplitGain`(`transfer-tax-split-display.ts`)이 그대로 통과 → 4뷰·다건이 같은 문장을 쓴다(D1-3 규약). 표시 문구는 UI 문서: 「상속개시일 평가액 X과 영 §164④ 가액 Y 중 많은 금액 Z」 + 채택 표지.
- 재계산 금지(memory `feedback_engine_result_display_drift`): 뷰는 `adopted`를 읽고 비교를 다시 하지 않는다.
- `acquisitionDate`·`rateBasis*`(D1-3) 와 독립이다. 1985 전이어도 `acquisitionDate`는 원값을 echo한다(§4).

---

## 4. 경계 — 1990-08-30 · 1985 전 · 증여 vs 상속 · 괄호 제외

### 4.1 케이스 매트릭스 (단순 케이스부터)

공통: 주택 split, 건물 2018-03-02 매매, `selfOwns=both`, 토지 파트 `actual`. 「②」= `landSec164Value`.

| # | 토지 원인 | 토지 취득일 | ② | ①(평가액) | 현행(D1-1) | D1-4 후 | 근거 |
|---|---|---|---|---|---|---|---|
| 1 | 상속 | 2022-01-10 | — | 3억 | 200 · 153,860,000 | 동일 | 단서 밖 — 비교 안 함 |
| 2 | 상속 | 1991-05-01 | 보내도 무시 | 3억 | 200 | 200 · ②는 무시(비교 안 함) | 단서는 「고시되기 전」만 |
| 3 | 상속 | **1990-08-30** | 없음 | 3억 | 200 | **200 (유지)** | 「고시되기 전」 아님 — `<` 엄격 |
| 4 | 상속 | 1990-08-29 | 없음 | 3억 | 400 | **400**(메시지 「② 필요」) | R-Q7 → ② 필수 |
| 5 | 상속 | 1988-05-01 | 3.5억 | 3억 | 400 | **200 · 취득가 3.5억 · 104,660,000** · adopted=sec164 | anchor B-1 |
| 6 | 상속 | 1988-05-01 | 3.5억 | 4억 | 400 | **200 · 4억 · 90,830,000** · adopted=reported | B-2 |
| 7 | 상속 | 1988-05-01 | 3.5억 | 3.5억 | 400 | 200 · 104,660,000 · adopted=**reported**(동점) | B-3 |
| 8 | **증여** | 1988-05-01 | 3.5억 | 3억 | 400 | 200 · 104,660,000 | 단서 1호가 「상속 **또는 증여**」 · B-4 |
| 9 | 상속 | **1984-05-01 (1985.1.1. 전)** | 3.5억 | 3억 | 400 | **#5와 같은 값** | §4.2 |
| 10 | 증여 | 1984-05-01 | 3.5억 | 3억 | 400 | #8과 같은 값 | §4.2 |
| 11 | 상속 | 1988-05-01 | 3.5억 | 3억 + **환산 모드** | 400(G-2) | **400 유지** | 상속·증여 파트 추계 차단은 불변 |
| 12 | 상속 | 1988-05-01 | 3.5억, **부담부증여** | — | 400(R-X1) | 400 유지 | 구조 규칙이 먼저 |
| 13 | 매매 토지 | 1988-05-01 | — | — | 200 | 200 | 단서는 상속·증여만(anchor A-5) |
| 14 | 상속, 일부양도 `partial` | 1988-05-01 | 양도면적 기준 | 양도분 평가액 | 400 | 200 — **확인 필요** | §4.5 |

### 4.2 1985.1.1. 전 상속·증여 — T-6 충돌의 확정

**결론: 산식은 1985 전후가 같다 (§163⑨ 가목이 정본). 계획서 T-6의 「원 날짜가 의제취득일 전인지가 산식을 가른다」는 정정 대상이다.**

근거:
1. **영 §163⑨ 본문·단서 1호에 「의제취득일」 조건이 없다** (위 §2.1 본문 직독). 조건은 「1990.8.30. 개별공시지가 고시 전 상속·증여받은 토지」뿐이다.
2. **영 §176의2④**(본문 확인): 의제취득일 현재 취득가액은 **추계결정 ③항 1~3호를 적용할 때**의 규정이다. 나목(환산) 계열이므로 가목(실지거래가액 의제, §163⑨)이 확인되면 도달하지 않는다. 일반건물이 이미 이렇게 정리했다 — `gb-pre1985-163-9.anchor.test.ts` P85-1(max, 443,235,000 → 334,920,000)·`transfer-tax-api-gb.ts:231-253`. 단건 pre-deemed도 같다: `calcPreDeemed`가 `clauseA = max(①,②) > 0 ? clauseA : converted`(`inheritance-acquisition-price.ts:164-168`) — ③ 환산은 가목이 0일 때만.
3. 분리 경로는 G-2가 상속·증여 파트 환산을 막으므로 ③은 **도달 불가**다. 따라서 pre-deemed(<1985)와 post-deemed(1985~1990.8.29.)가 단건에서 갈리는 유일한 지점(③ fallback)이 분리 경로에 없다.
4. **원 날짜가 실제로 가르는 것은 두 가지뿐이고 세액은 아니다:**
   - **② 입력의 시점**: 1985 전은 「취득당시」 = 의제취득일 현재 등급(B-1 결정 — `sec164AcqTimePointLabel`, `transfer-163-9-base-date.ts`). 엔진 산식에는 시점 파라미터가 없고(`inheritance-acquisition-price.ts` 주석 probe), 라벨이 유일한 통제점이다. 입력 위젯 `Pre1990LandValuationInput`이 이미 이 라벨 함수를 쓴다(`:19`) → 재사용하면 자동.
   - **보유연수 표기**: 엔진은 의제취득일을 보유기간 시작점으로 클램프하지 않는다(grep: 의제취득일 클램프는 `CompanionAcqDateSection`의 UI blur뿐). 1984-05-01 상속은 42년으로 표기된다. 장특은 15년+ 30% 포화, 세율은 기본세율이라 **세액 0 차이**(anchor B-6이 1991 vs 1995로 포화를 고정; 구현 PR이 1984 vs 1985-01-01 쌍으로 직접 고정한다 — todo D-1).
5. 따라서 **T-6의 결정(토지 원인 유효 시 UI 클램프 비활성 → 원값 저장)은 유지**한다. 이유는 계획서가 이미 정정했듯 「원값 저장·사용처 파생」이고, D1-4에서 그 원값은 ② 라벨 분기(`isDeemedAcquisitionApplied(landDate)`)에 쓰인다. 엔진 클램프는 추가하지 않는다 — 표기만 다른 변경은 범위 밖(Simplicity).

한 임계(`< 1990-08-30`)가 1985 전후를 모두 덮는다는 D1 설계 §6.2 결론과 일치한다.

### 4.3 1990-08-30 당일

「1990년 8월 30일 개별공시지가가 고시되기 전에」 — 현행 `<`(엄격) 유지(anchor A-2). 고시일 당일 상속·증여를 「고시 후」로 본 해석례는 이번에 확보하지 못했다 → **확인 필요**(반대 해석이면 당일도 max 대상). ⑧·⑫·엔진·⑤ 안내가 모두 `SEC_163_9_LAND_FIRST_DISCLOSURE` 한 상수를 쓰므로(T-5) 바뀌어도 한 줄이다.

### 4.4 증여 vs 상속 · 괄호 제외 (V-6)

- 증여도 같은 단서를 받는다(단서 1호 문언 「상속 **또는 증여**받은 토지」, 일반건물 `transfer-tax-api-gb.ts:277-296` 동일 판단). ①의 소스는 분리 경로에서 상속·증여 모두 파트 칸 `landAcquisitionPrice`다(상속 전용 `publishedValueAtInheritance`는 자산 단위 경로 필드).
- 괄호 제외(증여의제) 증여는 입력 경로가 없다 — 현행 `gift` 선택지는 순수 수증(`transfer-163-9-base-date.ts` 머리 주석). 증여세를 **과세받은** 경우(⑩1호의 가감)는 사용자가 ①에 반영해야 하는 값이라 엔진 변경 없음. UI 안내 한 줄.
- 부담부증여: R-X1이 앞서 막는다(채무 인수분 §159 안분과 비교가 한 번에 계산되지 않음).

### 4.5 일부양도(`areaScenario === "partial"`) — 확인 필요

housing은 `partial`이 허용된다(`AssetAreaSection.tsx` housing `["same","partial"]`). 기존 규약: 사용자가 **양도분에 대응하는 금액**을 직접 넣는다(`transfer-tax-validate-acquisition.ts:441-468` B4-2b, 「자동 안분 fallback 금지」). ②의 면적을 `resolveAcqAreaForStdPrice`(= 양도면적, `partial`일 때)로 두면 ①(양도분 평가액)과 같은 축이다. 다만 분리 경로 × `partial` × 토지 상속 **전체 조합의 기존 동작을 이번에 실측하지 않았다** → D1-4b 착수 전 probe 필요(Q-D14-5). `building`(비주택)은 `["same"]`만이라 해당 없음.

---

## 5. 엔진·⑫·⑧ 규칙 변경 (leaf 한 곳)

`lib/tax-engine/transfer-split-part-cause.ts` 변경:

| 항목 | 변경 |
|---|---|
| 사실 | `landSec164Value?: number`(양수 = 있음) 추가. 생략 = 「② 없음」 |
| 규칙 R-Q7 | 현행: `mixed ∧ landDate < 1990-08-30` → `LAND_CAUSE_PRE_1990_MESSAGE`(field `landAcquisitionDate`). **신규**: 같은 조건 ∧ `!(landSec164Value > 0)` → `LAND_SEC164_REQUIRED_MESSAGE`, field **`landSec164Value`**(`SplitPartCauseField` 확장) |
| 메시지 | 「1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 취득가액은 평가액과 시행령 §164④ 가액 중 많은 금액입니다 — 토지등급 환산(§164④) 입력이 필요합니다 (소득세법 시행령 §163⑨ 단서 1호)」. 약속(「후속 지원」) 문구 금지(D1 §6.4) |
| 순서 | 현재 위치 유지(구조 규칙 → G-12 → G-1 → Q-7 → G-2 → G-3). Q-7이 G-2(환산 불가)보다 앞이라 「환산 모드 + 1988 상속」은 Q-7 메시지가 먼저 뜬다 — 현행과 같은 순서 |
| 상수 | `LAND_CAUSE_PRE_1990_MESSAGE`는 삭제(또는 이름 정정). 참조처: `__tests__/tax-engine/transfer/split-part-cause.d1.test.ts:19·77-81·102·140`, `lib/calc/transfer-land-part-cause.ts`(안내문), D1 predo anchor A-1과 동일 문구 단언 — 일괄 갱신 |

호출부 사실 공급:

| 층 | 공급 | 위치 |
|---|---|---|
| 엔진 | `landSec164Value: input.landSec164Value`, `calcSplitGain` 진입 호출 | `transfer-tax-split-gain.ts:73-91` |
| ⑫ | `refineSplitPartCause`의 `d.landSec164Value` (주 자산·컴패니언 prefix 공통) | `required-refines-2a.ts:355-380` |
| ⑧ | `validateLandPartCause`가 `deriveHousingLandSec164Total(asset) > 0`을 사실로 — **④가 실제로 보내는 값과 같은 함수** | `transfer-tax-validate-split.ts:117-` |

### 5.1 ⑧ 차단 ⇔ ⑫ 차단 격자 (구현 시 전수 활성)

축: 호스트 {신축, 매매} × 원인 {상속(+피상속인), 증여} × 토지일 {1984-05-01, 1990-08-29, 1990-08-30, 1991-05-01} × ② {없음, 있음}.

| 토지일 | ② 없음 | ② 있음 |
|---|---|---|
| 1984 / 1990-08-29 (M) | **둘 다 차단** | 둘 다 통과 |
| 1990-08-30 / 1991 | 둘 다 통과 | 둘 다 통과 (② 무시) |

「② 있음」의 ⑧ 해석 = 5필드가 모두 차서 `calculatePre1990LandValuation`이 양수를 낸다. 이 조건 하나를 ⑧(`deriveHousingLandSec164Total`)과 ④(같은 함수)가 쓰므로 ⑧ 통과 ⇒ ④가 ②를 보냄 ⇒ ⑫ 통과가 구조적으로 성립한다. 부분입력(1~4필드만)은 ⑧이 필드별 오류로 따로 막고(`sec164LandStatus` 패턴 — 새 `sec164HousingLandStatus`), ④는 ②를 안 보낸다 → ⑫ 400이므로 「⑧ 통과 ↔ ⑫ 400」 셀 없음.

### 5.2 기존 결합 제외와의 순서

R-X1~X5·G-12·G-1은 불변이고 Q-7보다 앞이다. R-X4(소유자 분리)·R-X5(건물 비매매)·R-X2(PHD)는 D1-4와 무관하게 먼저 걸린다. 따라서 ②가 도달하는 조합은 「건물 매매·신축 + `selfOwns=both` + PHD 무시 + 비부담부」로 한정된다.

---

## 6. 세율·장특·개산공제 영향

| 항목 | 변경 | 근거 |
|---|---|---|
| 토지 취득가액 | **max(①,②)** | 이 PR의 유일한 변화 |
| 개산공제(§163⑥) | **0 유지** | ②도 「실지거래가액으로 본다」(가목 의제) — 파트 모드 `actual` 분기. anchor B-5 |
| 장특 보유기간(§95④) | 불변 — 상속·증여는 열거 없음 → 상속개시일·증여일부터 | `transfer-tax-split-gain.ts:305-306` 부근 `calculateHoldingPeriod`. B-6: 1991 vs 1995 모두 30% |
| 세율 기산(§104②) | 불변 — 상속은 피상속인 취득일 통산, 주택은 `max(법정 기산일, 건물일)` | D1-2a 등 기존 anchor |
| 비과세·12억 안분 | 취득가액이 양도차익에 들어가므로 12억 안분·1세대1주택 계산이 자동 추종 | 엔진 변경 없음 |
| 지분 | ①②를 같은 `ratioed`로 스케일 | §1.2 |

비교 대상이 아니라 **교체**임에 주의: ①이 ②보다 작을 때 ②를 쓰면 세액이 줄고(anchor B-1: 118,660,000 → 104,660,000), ①이 크면 ①을 쓴다(B-2). 납세자 유불리가 아니라 법문(「많은 금액」)을 따른다.

---

## 7. 변경 파일 목록 (800줄 cap 대비)

| 파일 | 현재 | 변경 | 예상 |
|---|---|---|---|
| `lib/tax-engine/transfer-split-part-cause.ts` | 135 | R-Q7 교체·사실 1·상수 | ~145 |
| `lib/tax-engine/transfer-tax-split-acq-price.ts` | 449 | `resolveLandPartAcquisition` + `acquisitionBasis` 반환 | +30 |
| `lib/tax-engine/transfer-tax-split-gain.ts` | 532 | 사실 공급 · echo spread | +8 |
| `lib/tax-engine/types/transfer.types.ts` · `transfer-split-gain.types.ts` | — | 필드 2 | +12 |
| `lib/tax-engine/transfer-tax-split-display.ts` | 320 | `acquisitionBasis` 통과 | +5 |
| `lib/api/transfer-tax-schema-base-shape.ts` · `-split.ts` · `required-refines-2a.ts` | 449(refines) | 필드·사실 | +8 |
| `app/api/calc/transfer/engine-input.ts` · `multi/route.ts` · `bundled-split-helpers.ts` | — | 매핑 3 | +3 |
| `lib/calc/transfer-tax-api-split.ts` | 270 | ② 페이로드 | +20 |
| `lib/calc/transfer-pre1990-housing-land-bridge.ts` | 신규 | 게이트·파생·total | ~70 |
| `lib/calc/transfer-tax-validate-split.ts` · `sec164-required-fields.ts` | 587 | ⑧ 사실·`sec164HousingLandStatus` | +40 |
| `lib/calc/transfer-land-part-cause.ts` | — | `landPartCauseDateNotice`의 1990 안내 문구 교체 | ±5 |
| 테스트 | | 아래 §8·§10 | |

모두 800줄 미만.

---

## 8. Pre-Do anchor (이 PR 산출물)

파일: `__tests__/api/transfer.route.split-land-part-cause.d1-4.predo.anchor.test.ts` — **활성 15 · todo 9, 단일 파일 통과, `tsc --noEmit` 0건** (2026-10-09).

| ID | 내용 | 상태 | D1-4 후 |
|---|---|---|---|
| A-1 | 1984·1988 상속 / 1984 증여 + 평가액만 → 400, 문구 「1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지」 | 활성 | **전환**: 400 유지·문구만 「② 필요」로 |
| A-2 | 1990-08-29 400 · 1990-08-30 200 | 활성 | 유지 |
| A-3 | ⑫ 스키마 직접 `landAcquisitionDate` 경로 | 활성 | field → `landSec164Value` |
| A-4 | ⑧ 직접(신축·매매 2호스트) | 활성 | ② 있으면 통과로 전환 |
| A-5 | 1991 상속 200 · 1988 매매 토지 200 | 활성 | 유지(긍정 짝) |
| B-1~B-7 | 손계산: ② 채택 104,660,000 · ① 채택 90,830,000 · 동점 · 증여 · 개산공제 0 · 장특 포화 · 평가액만이면 118,660,000(14,000,000 과대) | 활성 | **유지** — D1-4는 같은 값을 1988·1984 날짜로 내야 한다 |
| C-1~C-3 | ② 파생 손계산(㎡당 3,500,000 → 350,000,000), 1984 산식 동일, CAP-2 경계(1989-12-31 ↔ 1990-01-01) | 활성 | 유지 |
| D-1~D-9 | 구현 기대값 | todo | 활성화 |

B군은 「엔진이 D1-4에서 취득가액 입력만 바꾼다」는 설계 전제를 **지금** 검증한다: 같은 값을 차단 밖 날짜(1991)로 보내면 엔진이 손계산과 정확히 일치한다(장특 30% 포화로 날짜 무관). 이 전제가 깨지면(예: 엔진이 날짜별로 다른 값을 내면) B-6이 먼저 실패한다.

## 9. PR 분할과 단독 안전성

| PR | 내용 | 화면 | 안전성 |
|---|---|---|---|
| **D1-4a** | 엔진 max·echo · leaf R-Q7 교체 · ⑫ 필드·사실 · ⑭ 3곳 · ④ `buildLandPartCausePayload` ② 전송 · 브리지 · ⑧ 사실 공급 | **불변**(⑤ 위젯 없음) | ⑧은 ② 파생 불가(입력 칸 없음 → 5필드 비어 있음)라 **여전히 막는다**. ⑫는 ②가 오면 통과·없으면 400. 막다른 길 없음 — 「API만 열면 no-op」(memory) 위험을 ⑧이 막아 둔다 |
| **D1-4b** | ⑤ 위젯(신축·매매 두 호스트의 `Pre1990LandValuationInput`·알림 교체) · ⑥ 사이드바 · ⑦ 4뷰 · E2E | 변경 | 입력 경로와 ⑧ 해제가 같은 PR |

## 10. mutation probe 계획 (구현 PR)

하네스: 복사본 위 변형(`git checkout` 금지), bash 3.2 호환, 변형마다 파일 단위 vitest.

| # | 변형 | 기대 KILLED |
|---|---|---|
| M1 | max → `Math.min` | B-1·B-2 (D-1·D-2) |
| M2 | 동점 `>=` → `>` (채택 표기 반전) | D-3 |
| M3 | 임계 `<` → `<=` | A-2 / D-5 경계 |
| M4 | ②에 `ratioed` 미적용 | 지분 anchor (구현 시 추가: 지분 50% 시드) |
| M5 | ①에만 `ratioed` | 같음 |
| M6 | 엔진에서 증여 제외(`inheritance`만) | D-4 |
| M7 | leaf에서 ② 필수 규칙 삭제 | 엔진·⑫·⑧ 층별 단독 테스트 (겹친 방어 확인) |
| M8 | ④가 `M` 밖에서도 ② 전송 | D-6 |
| M9 | `acquisitionBasis.adopted` 항상 `reported` | D-2·D-9 |
| M10 | 브리지 CAP-2 취득일을 양도일로 | C-3 계열 (브리지 단위 테스트) |
| M11 | `pre1990Enabled` 래치를 게이트에 추가 | 래치 OFF 시 ②가 파생되는지 단언 |

---

## 11. 사용자 결정이 필요한 질문

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-D14-1** | 층 배치: O1(④ max, 일반건물식) / **O2(엔진 max + ② 별도 전송)** / O3(원자료 전송) | **O2** | ⑫ 방어·채택 echo·계산 지점 1곳. O1은 API 직접 호출에서 G-10(침묵 과대과세)을 재현, 비용 차이는 M |
| **Q-D14-2** | 1990.8.30. 전 + ② 미입력 → 400(필수) | **필수** | 「미입력은 validation 차단」·「모르면 혜택 불성립」 정책. ②를 비운 채 ①만 쓰면 법문(많은 금액)을 어긴 계산 |
| **Q-D14-3** | 증여 토지도 포함 | **포함** | 단서 1호 문언·일반건물 선례 동일. 증여의제(괄호 제외)는 입력 경로가 없어 영향 없음 |
| **Q-D14-4** | 1985.1.1. 전: 산식 동일 + 엔진 클램프 없음(보유연수 표기만 원값) | **이대로** | §4.2. 세액 차이 0이며 클램프 추가는 표기 변경뿐 |
| **Q-D14-5** | 일부양도(`partial`) 조합: ② 면적 = 양도면적, ①은 양도분 평가액(기존 규약) | **허용 + D1-4b 착수 전 probe** | §4.5 — 이 조합의 기존 분리 경로 동작 미실측. 문제가 있으면 `partial`일 때 이 조합을 ⑧·⑫에서 막는 대안 |
| **Q-D14-6** | PR 2분할(D1-4a 엔진·API / D1-4b UI) | **2분할** | §9 — 각 PR 단독 막다른 길 없음, 리뷰 단위 축소 |

## 12. 확인 필요 (착수 조건)

| # | 내용 | 시점 |
|---|---|---|
| V-14-1 | 고시일 당일(1990-08-30) 상속·증여의 「고시되기 전」 해당 여부 해석례 | D1-4a 전(현행 `<` 유지, 한 상수) |
| V-14-2 | 분리 경로 × `partial` × 상속 토지의 ① 평가액 입력 규약 실측 | D1-4b 전 |
| V-14-3 | 1985 전 ② 입력 시점(「의제취득일 현재 등급」)은 B-1 결정(`sec164AcqTimePointLabel`)을 그대로 따른 것 — 이번에 부칙 §8 본문을 재조회하지 않았다 | UI 라벨 확정 시 |
| V-14-4 | 컴패니언 경로 ⑭(`bundled-split-helpers.ts`)에서 `landSec164Value` 수신 후 컴패니언 분리 엔진(`calcSplitGain`)이 같은 `ctx`를 쓰는지 | D1-4a (grep으로 `landAcquisitionPrice` 소비처 단일성은 확인) |
| V-14-5 | 증여세를 과세받은 증여(⑩1호 가감)의 ① 처리 안내 문구 | UI |
| V-14-6 | PHD 자동 ON 이력이 남긴 `pre1990*` 값이 새 블록에 미리 채워지는 UX(침묵 아님 — 표시됨) 수용 여부 | UI 문서 |

---

## 13. D1-4a 구현 기록 (2026-10-09 — 계획서 §11이 정본, 아래는 설계 대비 차이만)

사용자 결정 반영: O2 채택(②총액 `landSec164Value` 별도 전송, 엔진 max·echo), **D14-5 일부 양도 + 단서 구간 차단**, ② 필수·증여 포함·1985 동일 산식·PR 2분할 권장안 그대로.

| 항목 | 설계(위) | 구현에서 달라진 점 |
|---|---|---|
| 일부 양도 사실 | 미정(§4.5 확인 필요) | `isPartialAreaTransfer`(신규 ⑫ boolean)를 ④가 `areaScenario === "partial"` ∧ 단서 구간일 때만 보낸다. `areaScenario`는 ⑫·엔진에 없어 새 사실이 필요했다. leaf 규칙은 ② 필수보다 앞(② 입력으로 풀리지 않는 사유가 먼저). field는 ⑧ `areaScenario`, ⑫ 경로는 실제 입력 필드 `isPartialAreaTransfer`로 매핑 |
| ② 지분 스케일 | `makeRatioed` | 브리지가 `getOwnershipRatio`로 직접 `multiplyByAreaShare`(단가×면적×지분, floor 한 번 — `feedback_unit_price_area_float_undercount`). ①(`ratioed`=floor(금액×지분))과 같은 축. `buildLandPartCausePayload` 시그니처는 그대로(호출 3곳 무변경) |
| leaf 술어 | `landSec164Applies` | `isSec163_9LandProviso(cause, landDate)`를 엔진 leaf에 두고 엔진·⑫·브리지·⑤ 안내가 공유(T-5 상수와 한 곳) |
| ⑧ (D1-4a) | 「② 있음이면 통과」(§5.1) | 화면에 ② 입력 칸이 없어 **계속 막는다**(⑧ ⊇ ⑫ — ⑧ 통과 ↔ ⑫ 400 셀 없음). 문구는 엔진 문구 대신 화면 사실(`LAND_SEC164_SCREEN_MESSAGE`: 「이 계산기 화면은 … 입력을 받지 않아 … 지원하지 않습니다」), 칸은 토지 취득일. 일부 양도는 `areaScenario` 칸 + 일부 양도 사유 |
| 브리지 파일명 | — | `lib/calc/transfer-pre1990-housing-land-bridge.ts` 하나(UI 설계 문서의 `transfer-land-cause-sec164.ts` 표기도 이 이름으로 고쳤다). 완결 상태(`sec164LandPartStatus`)는 D1-4b가 같은 파일에 추가 |
| 상수 | `LAND_CAUSE_PRE_1990_MESSAGE` 교체 | 삭제. 엔진·⑫: `LAND_SEC164_REQUIRED_MESSAGE`(field `landSec164Value`), `LAND_SEC164_PARTIAL_MESSAGE`; 화면: `LAND_SEC164_SCREEN_MESSAGE` |

### 검증 요약
- 층별 단독 테스트: leaf(`split-part-cause.d1.test.ts`) · 엔진 직접 · ⑫ 컴패니언 스키마 · route 단건 · route 다건 · route 컴패니언 · 브리지/④/⑧ 단위. 겹친 방어가 mutation에서 서로를 가리므로 층마다 따로 잠갔다.
- mutation 27건 중 25 KILLED. **M15·M16(⑭ `isPartialAreaTransfer` 매핑 누락)은 SURVIVED = 동치 변이**: 단서 구간의 일부 양도는 ⑫가 먼저 400으로 막아 엔진 입력에 닿지 않고, 구간 밖에서는 어느 층도 읽지 않는다. 엔진 직접 단독 테스트(`D14-5 일부 양도 → throw`)가 엔진 층 방어를 잠근다. ⑭ 매핑은 ⑫ 규칙이 바뀔 때를 위한 운반 지점으로 남긴다.
