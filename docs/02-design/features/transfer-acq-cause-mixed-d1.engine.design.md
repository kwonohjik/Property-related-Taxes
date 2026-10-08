# 토지 상속·증여 + 건물 매매 (Phase D1) — 엔진·API 설계

> ⚠️ **엔진·UI 대조 결과와 사용자 결정(2026-10-09)은 계획서 §10이 우선한다** — 특히 U-3(Q-5 소유자 분리 잠금을 신축에도), U-4(공익수용·용도변경 비차단), T-1(echo 필드·표시값 `appliedRateBasisDate`), T-2(G-12를 엔진 leaf에도).

> 작성 2026-10-09 · 워크트리 `Property-related-Taxes-d1` (브랜치 `feat/transfer-acq-cause-mixed-d1`, base `1d3994303` — D0 #2052 포함)
> 계획서: `docs/00-pm/transfer-acq-cause-mixed.plan.md` §4 D1 · §6 Q-1~Q-8(권장안 확정) · §7 V-1~V-11
> 범위: **엔진 + ⑨⑩⑪⑫⑭ + 결과 echo leaf**. UI(⑤⑥⑦·사이드바·4뷰 소비)는 UI 시니어 문서가 따로 다룬다. 이 문서가 UI와 맞물리는 곳은 §2(echo 필드)·§3/§4(leaf 시그니처·사실 공급원)뿐이다.
> 검증: 이 문서의 수치는 전부 `POST /api/calc/transfer` 직접 호출 실측(mock 세율)이고, Pre-Do anchor `__tests__/api/transfer.route.split-land-part-cause.d1.predo.anchor.test.ts`(활성 26 · skip 1 · todo 11)가 같은 값을 고정한다. 법령은 KoreanLaw MCP 본문 조회 2026-10-09(법 MST 280405 시행 2026.1.1. · 영 MST 290841 시행 2026.10.1.)이며 본문을 못 읽은 것은 「확인 필요」로 남겼다.

---

## 0. 결론 표

| # | 항목 | 결론 | 근거 |
|---|---|---|---|
| 1 | 엔진이 「토지 상속·증여 + 건물 매매」를 이미 처리하는가 | **그렇다.** 세율 기산·장특 기산·개산공제 0 모두 손계산과 일치 (153,860,000). 엔진 **계산** 변경은 없다 | §1 |
| 2 | 계획서와 어긋난 실측 | ① 주택은 세율 기산이 `max(법정 기산일, 건물 취득일)`이라 **같은 날·토지가 건물보다 먼저인 조합에서는 통산이 세액에 닿지 않는다**(Q-4 근거가 달라진다) ② 결합 제외 중 **부담부증여·소유자 분리·건물 상속/증여·가업상속**은 침묵으로 틀리게/무시되고, **공익수용·용도변경**은 엔진이 교차해 읽는 곳이 없다 ③ 1990.8.30. 전 토지는 일반건물이 이미 파트 max를 구현했다 — 계획서가 「규모가 크다」고 본 B안의 선례가 있다 | §1.5·§3·§6 |
| 3 | 결과 echo | `SplitPartResult`에 **5필드** 추가(원인·취득일·§104② 법정 기산일·적용 기산일·기산 규칙). 생성은 `calcSplitGain` 한 곳, 표시 정본은 `summarizeSplitGain` | §2 |
| 4 | 결합 제외 가드 | **기존 D0 leaf(`collectSplitPartCauseIssues`)에 규칙 추가 — 별도 leaf 아님** (엔진·⑫·⑧이 이미 이 한 함수를 공유한다). 필수 차단 5종 + Q-7 | §3 |
| 5 | ⑧↔⑫ 격자 | ⑫ 40셀 = 통과 12·차단 28 (**D1 전후 동일**). ⑧은 건물 매매 셀에서 원인을 「없음」으로 읽어 14셀이 어긋나 있고, ⑧ 노출 범위를 매매로 넓히면 40셀 일치 | §4 |
| 6 | Q-4 같은 날 | **⑫ 비차단·엔진 영향 없음**, ⑧(⑤)에서만 안내 차단. 같은 날이면 주택 세율 max 규칙이 통산을 무효로 만든다 | §5 |
| 7 | Q-7 (사용자 결정) | 권장 **A: D1에서 토지 취득일 < 1990-08-30 인 상속·증여 토지 파트를 3중 차단 + 후속 D1b에서 일반건물식 B(파트 max 입력)**. 신축 경로 포함 여부는 Q-D1-1 | §6 |
| 8 | 법령 V-1·V-3·V-5·V-6 | 현행 `isLaterAcquiredLandExemptExcluded` **유지**(정면 근거도 정면 반증도 없음 → 「확인 필요」 표지 유지). §154⑧3호는 문언상 「상속받은 주택」 — 토지만 상속에 적용하지 않는 현행 유지. §154① 조정대상지역 기준은 문언상 「주택」의 취득 당시 | §7 |
| 9 | 별건으로 발견한 기존 결함 | ① 부담부증여에 분리 입력(`landAcquisitionDate`)이 닿으면 양도차손(−125,000,000/−275,000,000) — 취득원인과 무관, API 직접 호출에서만 ② 공익수용 §154①2호가목 + 나중 취득 부수토지 <2년이면 토지분이 계속 과세 제외 — 법 해석 확인 필요 | §3·§12 |

---

## 1. 실측 (시드·손계산 포함)

### 1.1 공통 시드

주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, `isOneHousehold:false`, 별개 취득(`isSeparateAcquisition:true`), 파트 실가(토지 3억·건물 4억), 건물 취득일 2018-03-02 매매. 양도차익 = 토지 4억 + 건물 1억. 기본공제 250만. 장특은 파트별 일반(연 2%·3년 미만 0·최대 30%). 40%대 구간 `× 40% − 25,940,000`.

기준 S0(토지 2008-05-10 매매): 토지 18년 30% = 120,000,000 + 건물 8년 16% = 16,000,000 → 5억 − 1.36억 = 364,000,000 − 2,500,000 = 361,500,000 × 40% − 25,940,000 = **118,660,000** ✅

### 1.2 D1 핵심 조합 — 토지 상속(개시 2022-01-10, 피상속인 취득 2005-01-01) + 건물 매매 2018-03-02

| 항목 | 손계산 | 실측 |
|---|---|---|
| 토지 장특 (개시일부터 4년 → 8%, §95④ — 상속은 열거 없음) | 4억 × 8% = 32,000,000 | 32,000,000 ✅ |
| 건물 장특 (8년 16%) | 1억 × 16% = 16,000,000 | 16,000,000 ✅ |
| 소득금액 − 기본공제 | 5억 − 4,800만 = 452,000,000 − 2,500,000 | 449,500,000 ✅ |
| 세율 (토지 기산 `max(2005, 2018)` = 2018 → 둘 다 2년 이상 → 기본세율) | 449,500,000 × 40% − 25,940,000 | **153,860,000** ✅ |
| 개산공제 | 상속 파트는 실가 → 0 | 0 ✅ |
| 건물 `acquisitionCause` 미지정 vs `"purchase"` | 같음 | 같음 (Q-2 부재 record 재해석 없음) |
| 토지 단순 증여(`gift`) | 같음(두 파트 모두 2년 이상) | 153,860,000 |

**⇒ 계획서 「엔진은 이미 이 조합을 처리」 재확인(T2·W1).** 입력 경로·검증·표시만 필요하다.

### 1.3 세율 기산이 세액에 닿는 조합 (토지 1년 5개월: 토지 취득/상속개시 2025-02-01)

| 토지 원인 | 주택(housing) | 비주택(building) | 손계산 |
|---|---|---|---|
| 상속(피상속인 2000) | **166,660,000** (기본세율) | **166,660,000** | 소득 5억 − 건물장특 1,600만 = 484,000,000 − 250만 = 481,500,000 × 40% − 25,940,000 |
| 단순 증여 | **252,900,000** (60%) | **173,400,000** (40%) | 주택: 토지 397.5M × 60% = 238,500,000 + 건물 84M × 24% − 5,760,000 = 14,400,000. 비주택: 397.5M × 40% = 159,000,000 + 14,400,000. 두 경우 모두 §104⑤ 자산별 합계가 합산 누진 166,660,000보다 크다 |
| 원인 없음 | 252,900,000 | 173,400,000 | 증여와 같다 |
| 상속(피상속인 2025-01-01, 2년 미만) | 252,900,000 | — | 통산해도 단기 |

**V-7 (assetKind `building`)**: 같은 조합이 200으로 계산된다. 차이는 **주택에만 `max(법정 기산일, 건물 취득일)`이 있다**는 것(`transfer-tax-appurtenant-land.ts:38-43`). 비주택은 토지·건물 각자의 기산일이다 — 위 표의 증여 열이 갈리는 이유다. 결과 echo는 두 종류를 구별해야 한다(§2의 `appliedRateBasisDate`).

### 1.4 비과세 축 (W1·W2)

| 시드 | 결과 | 해석 |
|---|---|---|
| 1세대1주택, 건물 8년 거주 96개월, 토지 2025-02-01 상속(피상속인 2000) | **133,060,000** (원인 없음 238,500,000) | 건물분 비과세, 토지분(1년 5개월 <2년)은 `isLaterAcquiredLandExemptExcluded`로 제외. 토지분 397.5M × 40% − 25,940,000 (통산 → 기본세율) |
| 토지 2022-01-10 상속 + 건물 2018 + 12억 이하 | 전액 비과세 (0) | 토지 4년 ≥ 2년 |
| 위 + 공익수용 / 용도변경 | 133,060,000 그대로 | 엔진이 원인 축을 교차해 읽는 곳 없음 |
| 위 + `wasRegulatedAtAcquisition:true` | 133,060,000 그대로 | V-5 — 입력 경로가 단일 플래그뿐(§7) |

경고(`warnings`)는 이 조합에서 **0건**이다 — 토지분이 비과세에서 빠지는 사실도, 「피상속인 보유기간을 통산하지 않았다」는 사실도 고지하지 않는다(Q-D1-4).

### 1.5 계획서와 어긋난 실측

1. **Q-4 근거 정정.** 계획서는 「같은 날이면 `isSeparateAcquisition`이 총액 모델로 보내 8곳에 새 분기가 생긴다」고 보았다. 실측은 다르다. API가 분리 입력(`landAcquisitionDate` + 파트 실가)을 받으면 같은 날이어도 분리 계산이 돌고(`splitDetail` 있음), **주택은 세율 기산이 `max(…, 건물 취득일)`이라 같은 날이면 토지 상속 통산이 무효**다 → 같은 날 토지 상속(피상속인 2000) = 원인 없음 = 298,500,000(60%). 즉 같은 날은 **계산이 틀리는 입력이 아니라 원인이 무의미한 입력**이다. 분리 입력이 아예 없으면(토지 취득일 없음) 원인은 **침묵 무시**된다(`splitDetail` 없음).
2. **통산이 의미 있는 범위가 좁다.** 주택에서 통산이 세액을 바꾸는 것은 「건물이 토지 상속개시보다 먼저 취득됐고 피상속인 취득일이 건물 취득일보다 빠른」 때뿐이다(1.3 표). 나머지는 장특 기산·취득가액만 이 축의 값이다.
3. **결합 제외 중 엔진이 이미 막는 것은 없다.** D0 leaf는 `housing/building` + 토지 취득일이 있을 때만 규칙을 본다. 부담부증여·소유자 분리·건물 상속/증여·가업상속·PHD(간접)는 각각 §3 표의 방식으로 샌다.
4. **일반건물에는 §163⑨ 단서 파트 max 선례가 있다**(`transfer-gb-inheritance-164-max-phase3.plan.md`, 2026-08-07 완료 — 현행 평가액만 쓰면 86,265,000원 과대). 계획서 Q-7이 「max 비교 입력은 규모가 크다」고 본 전제가 약해졌다 → §6.

---

## 2. 결과 echo — `SplitPartResult` 확장

### 2.1 필드

`lib/tax-engine/types/transfer-split-gain.types.ts`의 `SplitPartResult`에 **전부 optional**로 추가한다(구 `resultData`·이력은 없다).

```ts
/** 이 파트의 **유효 취득원인** — 토지: `landAcquisitionCause ?? acquisitionCause`(엔진 컨벤션 그대로), 건물: `acquisitionCause`.
 *  입력이 미지정이면 **생략**한다(「매매」로 지어내지 않는다 — 표시 계층은 라벨을 내지 않는다). */
acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";
/** 이 파트의 취득일(YYYY-MM-DD) = 영 §162①5호 상속개시일·증여일 / 매매 취득일 = **장특 기산일**(§95④ — 상속·단순 증여는 취득일부터).
 *  장특 기산일을 별도 필드로 두지 않는다: D1·D2 범위(이월과세 제외)에서 둘은 항상 같고, 갈리는 것은 §95④ 단서(이월과세·가업상속공제 자산)뿐이다. */
acquisitionDate?: string;
/** §104② 세율 보유기간 **법정 기산일** — 본문 취득일, 단서 1호(상속 → 피상속인 취득일)·2호(이월과세 → 증여자 취득일) 적용 후. 주택 `max` 적용 **전**. */
rateBasisAcquisitionDate?: string;
/** 위 기산일을 정한 규칙 — 표시 계층이 날짜 비교로 재추론하지 않게 엔진이 직접 말한다. */
rateBasisRule?: "own" | "decedent" | "donor";
/** 세율 판정에 **실제 쓰인** 기산일 — 주택 토지 파트는 `max(법정 기산일, 건물 취득일)`(조심 2024인3140·기재부 재산세제과-1354 「주택부수토지로서의 보유기간」), 그 외는 법정 기산일과 같다. */
appliedRateBasisDate?: string;
```

의미 정리(부재 시 포함):

| 상황 | 값 |
|---|---|
| 건물 매매 파트 | `acquisitionCause:"purchase"`(또는 입력값) · `rateBasisRule:"own"` · 두 기산일 = `acquisitionDate` |
| 토지 상속 + 피상속인 취득일 | `rateBasisRule:"decedent"` · `rateBasisAcquisitionDate` = 피상속인 취득일 · `appliedRateBasisDate` = (주택) `max(피상속인 취득일, 건물 취득일)` / (비주택) 피상속인 취득일 |
| 토지 단순 증여 | `rateBasisRule:"own"` · 통산 없음(§104②2호는 §97의2① 이월과세 자산만) |
| 입력 원인 미지정 | `acquisitionCause` **생략**, 기산일 3필드는 채움(원인 없이도 날짜는 사실이다) |
| PHD 경로(`calcSplitGainPreDisclosure`) | 같은 helper로 채운다 — 단 PHD + 토지 상속·증여는 §3에서 차단되므로 실제로는 `own`뿐 |
| 구 결과·`splitDetail` 없음 | 전부 `undefined` — 소비처는 라벨을 내지 않고 종전 표기 유지 |

### 2.2 생성 지점 (한 곳)

- **신규 leaf `lib/tax-engine/transfer-split-part-echo.ts`** (~70줄): `buildSplitPartCauseEcho(input): { land: Partial<SplitPartResult>; building: Partial<SplitPartResult> }`. `calcSplitGain`의 두 반환 지점(일반·PHD)이 `{ ...landPart, ...echo.land }`로 합친다. 산식은 새로 쓰지 않는다 — 아래 두 함수를 **재사용**:
  - `transfer-rate-holding-basis.ts`: `resolveRateBasisAcquisitionDate`를 `resolveRateBasis(facts): { date: Date; rule: "own"|"decedent"|"donor" }`로 일반화하고 기존 함수는 `resolveRateBasis(...).date`로 둔다(+~12줄) — **판정 단일 소스**.
  - `transfer-tax-appurtenant-land.ts`: `resolveLandStatutoryAcquisitionDate`가 `resolveLandRateBasis(input): {date, rule} | undefined`를 거치게 하고(+~8줄), `resolveAppurtenantLandRateBasisDate`는 그대로.
- 건물 파트: `resolveRateBasis({ acquisitionCause: input.acquisitionCause, acquisitionDate: input.acquisitionDate, decedent/donor: 자산 단위 })`. 이는 `calcTax`(`transfer-tax-rate-calc.ts:361-363`)가 자산 단위로 쓰는 호출과 **같은 함수**다.
- 날짜 표기: `toISOString().slice(0,10)` (엔진 Date는 route에서 `toDate`로 UTC 자정이 보장된다). 결과는 JSON을 건너므로 string이다(memory 「엔진 result Map JSON 소실」과 무관 — Record/string뿐).

### 2.3 `summarizeSplitGain` (`transfer-tax-split-display.ts`) — 표시 정본

`SplitGainPartSummary`에 echo 5필드를 **그대로 통과**시킨다(재계산 금지 — memory `feedback_engine_result_display_drift`). 추가 두 가지만 이 파일이 낸다:

- `splitCauseLabel(cause): string` — `splitAcqModeLabel`과 같은 어휘 단일 소스. 입력 화면 라디오 어휘와 일치해야 한다(「매매」「신축」「상속」「증여」「이월과세(증여)」「부담부증여」) — **UI 시니어가 `CompanionAcquisitionCauseSection`의 현행 라벨을 확인해 맞출 것**(이 문서는 라벨 문자열을 정하지 않는다).
- `SplitGainSummary.mixedCause: boolean` — 소유 파트 둘 모두 `acquisitionCause`가 있고 서로 다를 때만 `true`. 4뷰가 「원인 행」을 낼지 판단하는 유일한 근거(원인이 같으면 행을 내지 않아 기존 화면 diff 0).

4뷰(단건 결과·상세명세서·신고서·PDF)와 다건 합산 소비는 UI 시니어 범위다. 신고서 split 2열의 취득일·보유기간은 폼 날짜 차 대신 `acquisitionDate`·`holdingYears` echo로 교체된다(계획서 §4 D1).

### 2.4 단위 anchor (구현 PR)

`__tests__/tax-engine/transfer/split-part-cause-echo.anchor.test.ts` — 엔진 직접(`calcTransferTax`) + leaf 직접:
E-1 토지 상속·피상속인 입력 → `rule:"decedent"`, `rateBasisAcquisitionDate` = 피상속인 취득일, `appliedRateBasisDate` = `max(…, 건물일)` · E-2 단순 증여 → `own` · E-3 `building` propertyType → `applied === rateBasis` · E-4 입력 원인 미지정 → `acquisitionCause` 생략 · E-5 PHD 경로 · E-6 `summarizeSplitGain.mixedCause` 진리표 · E-7 **echo 날짜 = `computeSplitPartTax`가 쓴 `SplitRatePart.basisDate`** (불일치 시 표시가 엔진을 속인다 — 지금 `splitPartDetail`은 단건 결과로 노출되지 않아 echo가 유일한 노출 경로다).

---

## 3. 결합 제외 — 현행 실측과 가드

### 3.1 현행 실측 (토지 상속 + 건물 매매 시드에 결합 요소를 얹어 `landAcquisitionCause`가 들어올 때)

| 결합 | 현행 동작 | 판정 | 가드 |
|---|---|---|---|
| **겸용주택** (`propertyType:"mixed-use-house"`, 컴패니언 `mixed_use_house`) | `calcSplitGain`은 `housing/building`만 → 원인 **읽히지 않음**. 겸용 엔진(`calcMixedUseTransferTax`)이 `landAcquisitionCause`를 읽는 파일 없음(grep 0) | 무관(UI 경로 0, 세액 영향 0) | **불필요** — D0 leaf `isSplitable` 범위가 곧 가드 |
| **재개발/입주권/분양권** (`propertyType` 별도) | 위와 같음 | 무관 | 불필요 |
| **공익수용** (`transferCause:"public_expropriation"`) | 원인 유무와 무관하게 동일 값(133,060,000 ↔ 133,060,000, 비수용 W1과도 같음) | 엔진이 두 축을 교차해 읽지 않음 | **차단하지 않음** (Q-D1-2). 법적 상호작용(수용 비과세 §154①2호가목의 「사업인정 고시일 전 취득」을 토지 상속일로 보는지)은 확인 필요 — 별건 |
| **비주택→주택 용도변경** (`nonHousingToHousingConversion`) | 동일 값 | 교차 없음 | **차단하지 않음** (Q-D1-2) |
| **부담부증여** (`transferType:"burdened_gift"`) | 분리 입력이 닿으면 §159 총액과 어긋나 **토지 −125,000,000 · 건물 −275,000,000 양도차손**(원인 유무와 같은 값). 사용자 화면은 `isSplitPayloadActive`가 부담부증여를 제외해 분리 입력을 안 보낸다 | **침묵 오답(API 직접 호출 한정)** | **차단** R-X1 (원인이 상속·증여일 때). 분리 입력 자체의 차단은 원인과 무관한 기존 결함이라 별건(§12 R-6) |
| **PHD §164⑤** (`preHousingDisclosure`) | PHD 경로는 토지·건물 **둘 다 환산**일 때만 진입 → 상속·증여 토지(환산 불가, D0 G-2)와 구조적으로 양립 불가. 현재는 G-2 메시지(「환산 못 함」)로 막히지만 사용자 레버가 다르다(PHD 토글이 환산을 강제) | 이미 차단되나 **메시지가 틀린 레버를 가리킨다** | **전용 메시지로 차단** R-X2 |
| **가업상속** (`familyBusinessInheritance`) | 건물 매매 자산에서는 읽히지 않는다(153,860,000, 원인만 있는 값과 같음). UI 게이트 `allowsFamilyBusinessInheritance`가 자산 원인 `inheritance`일 때만 열려 D1에서는 입력 경로 0 | **침묵 무시(API 직접 호출 한정)** | **차단** R-X3 |
| **소유자 분리** (`selfOwns ≠ both`) | 토지 원인이 **읽히지 않는다**(land_only: 238,500,000 = 원인 없음; 통산되면 133,060,000). Q-5 | **침묵 무시** | **차단** R-X4 |
| **건물 원인이 상속·증여·이월과세·부담부증여** (D2 영역) | 200으로 계산(원인 없음과 같은 값). 의미(건물만 상속 등)는 D2에서 정한다 | 침묵 허용 | **차단** R-X5 (D2가 해제) |
| **분리 비활성**(토지 취득일 없음) | 원인 침묵 무시 | 잔여 | 차단하지 않음 — ④ 게이트(`effectiveLandAcquisitionCause`)가 막고, API 직접 호출의 잔여는 §12 R-5 |

### 3.2 가드 위치 — 별도 leaf가 아니라 **D0 leaf 확장**

`collectSplitPartCauseIssues`는 엔진(`calcSplitGain` throw)·⑫(`refineSplitPartCause`, 주 자산+컴패니언)·⑧(`validateLandPartCause`)이 이미 공유하는 **단일 소스**다. 결합 제외를 별도 leaf에 두면 호출 지점 3×2곳이 두 벌이 되어 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 생긴다(D0가 막으려던 바로 그것). 규칙을 같은 함수에 얹는다.

```ts
export interface SplitPartCauseFacts {
  // ── D0 (불변) ──
  isSplitable: boolean;
  hasLandAcquisitionDate: boolean;
  landAcquisitionCause?: string;
  hasLandDecedentAcquisitionDate: boolean;
  landMode: PartAcqMode;
  // ── D1 신규 (전부 optional — 생략 = 해당 결합 아님. 엔진 테스트 헬퍼 기본값을 깨지 않는다) ──
  landAcquisitionDate?: string;           // YYYY-MM-DD, Q-7 날짜 판정
  buildingAcquisitionCause?: string;      // 자산 단위 원인
  selfOwns?: "both" | "building_only" | "land_only";
  isBurdenedGift?: boolean;               // transferType === "burdened_gift" || acquisitionCause === "burdened_gift"
  hasPreHousingDisclosure?: boolean;
  hasFamilyBusinessInheritance?: boolean;
}
export type SplitPartCauseField = "landAcquisitionCause" | "landAcqMode" | "landDecedentAcquisitionDate";  // 불변 — 새 규칙의 field는 모두 landAcquisitionCause(토글을 끄는 것이 공통 해소책)
export const SEC_163_9_LAND_FIRST_DISCLOSURE = "1990-08-30";   // 영 §163⑨1호 — 이 leaf가 단일 소스로 export (lib/calc 3곳의 동명 상수는 이 값을 re-export하도록 UI 시니어/별건)
```

규칙 순서(= 첫 항목이 엔진 throw·⑧ 표시): **구조 규칙(R-X1~X5) → G-1 이월과세 → Q-7 → G-2 추계 → G-3 피상속인**. 구조 규칙을 앞에 두는 이유: 조합 자체가 미지원인데 「환산 못 함」을 먼저 말하면 틀린 레버를 가리킨다(PHD가 실례).

모든 새 규칙의 발동 조건은 **`landAcquisitionCause ∈ {inheritance, gift}`**(원인이 없거나 매매면 결합이 아니다 — 회귀 0). `carryover_gift`는 G-1이 먼저 막는다.

| 규칙 | 조건 | 메시지 초안 |
|---|---|---|
| R-X1 | `isBurdenedGift` | 「부담부증여로 양도하는 경우에는 토지·건물의 취득원인을 따로 지정할 수 없습니다 — 채무 인수분을 유상양도로 보는 안분(소득세법 시행령 §159)이 토지·건물 취득가액 구분과 함께 계산되지 않습니다」 |
| R-X2 | `hasPreHousingDisclosure` | 「개별주택가격 미공시 취득(시행령 §164⑤) 환산은 토지·건물을 모두 환산할 때만 성립하는데, 상속·증여로 취득한 토지는 환산할 수 없습니다(시행령 §163⑨) — 「개별주택가격 미공시」를 끄거나 토지의 다른 취득원인을 끄세요」 |
| R-X3 | `hasFamilyBusinessInheritance` | 「가업상속공제 적용 자산(소득세법 §97의2④) 입력은 토지 파트만 상속받은 계산과 함께 쓸 수 없습니다」 |
| R-X4 | `selfOwns` 있고 `≠ both` | 「토지·건물 중 한쪽만 소유한 경우에는 그 파트의 취득원인을 자산 취득원인으로 입력하세요 — 토지 파트 취득원인은 두 파트를 모두 소유한 경우에만 쓰입니다」 |
| R-X5 | `buildingAcquisitionCause ∈ {inheritance, gift, carryover_gift, burdened_gift}` | 「건물을 상속·증여·이월과세·부담부증여로 취득한 경우 토지 파트에 다른 취득원인을 지정하는 기능은 아직 지원하지 않습니다」 |
| R-Q7 | `landAcquisitionDate < SEC_163_9_LAND_FIRST_DISCLOSURE` (엄격 `<` — 1990.8.30. 당일은 고시일이라 「고시되기 전」이 아니다) | 「1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 취득가액은 상증법 평가액과 시행령 §164④ 가액 중 많은 금액인데, 토지·건물을 따로 취득한 경우의 이 비교는 아직 지원하지 않습니다 (소득세법 시행령 §163⑨1호)」 |

**엔진 쪽 사실 공급** (`calcSplitGain` 진입부 — D0 호출부 확장): `landAcquisitionDate: toIso(input.landAcquisitionDate)`, `buildingAcquisitionCause: input.acquisitionCause`, `selfOwns: input.selfOwns`, `isBurdenedGift: input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift"`, `hasPreHousingDisclosure: !!input.preHousingDisclosure`, `hasFamilyBusinessInheritance: !!input.familyBusinessInheritance`. ⚠️ 엔진 테스트 헬퍼 `baseTransferInput`은 `acquisitionCause`를 설정하지 않고 「미지정 = 매매」다 — R-X5는 **명시된 비매매 값일 때만** 발동하므로 안전하다(FB 게이트를 엔진에 걸지 말라는 `transfer-fb-gate.ts` 경고와 같은 이유).

**⑫ 사실 공급** (`refineSplitPartCause` — `Required2aLike`에 `acquisitionCause`·`selfOwns`·`transferType`·`preHousingDisclosure`·`familyBusinessInheritance` 선택 필드를 더한다). 컴패니언(`companionAssets[i]`)은 `preHousingDisclosure`·`familyBusinessInheritance`가 스키마에 없을 수 있다 — **구현 시 컴패니언 스키마(`transfer-tax-schema-companion.ts`)에서 각 필드 유무를 확인하고 없으면 해당 사실은 생략**(추정 금지, 확인 필요).

**⑧ 사실 공급**(UI 시니어): 같은 6사실을 `AssetForm`에서 낸다 — `validateLandPartCause`의 기존 `hasLandAcquisitionDate` 파생처럼 **④가 실제로 보내는 값**이어야 한다(3중 패턴). 대응: `selfOwns` ← `effectiveSelfOwns(asset)`, PHD ← `asset.usePreHousingDisclosure`, 부담부증여 ← `lib/calc/depreciation-scope.ts:38`과 같은 술어, 가업상속 ← `allowsFamilyBusinessInheritance`(D1에선 거의 항상 false라 사실상 ⑫ 전용 방어선), 건물 원인 ← `asset.acquisitionCause`.

⑨⑩⑪⑭는 **변경 없음**: ⑨⑩ enum은 4종 그대로(D2에서 `purchase`가 의미를 가짐 — 이미 enum에 있다), ⑪ 자산-수준 `acquisitionDate` fallback은 이 필드와 무관, ⑭ `engine-input.ts:330-332`·`multi/route.ts:198-200`·`bundled-split-helpers.ts:387-389`가 이미 원인·피상속인·증여자 날짜를 Date 변환해 운반한다(V-10 확인: 단건·다건·컴패니언 3경로 모두 같은 운반).

### 3.3 anchor (구현 PR)

각 규칙마다 **leaf 직접 · 엔진 직접 · ⑫ 스키마 직접(`propertySchema.safeParse`)** 3개 + route 1개. 겹친 방어는 mutation에서 서로를 가리므로(memory) route 테스트 하나로 끝내지 않는다. 긍정 짝: 각 규칙은 「조건 하나만 빼면 200」을 함께 둔다 (R-X4: `selfOwns:"both"` 200 · R-Q7: `1990-08-30` 당일 200 / `1990-08-29` 400).

---

## 4. ⑧↔⑫ 격자 (⑫ 기대값)

### 4.1 40셀 — 토지 원인 5 × 건물 원인 2 × 토지 파트 모드 4 (측정: `propertySchema` 직접 + `validateLandPartCause`)

⑫ 판정은 **건물 원인(매매/신축)에 무관**하고 아래 12/28이다. 이 격자는 D1 전후 동일(결합 제외 규칙은 격자 밖 입력 축).

| 토지 원인 \ 모드 | actual | estimated | appraisal | salesCase |
|---|---|---|---|---|
| 없음 | ✅ | ✅ | ✅ | ✅ |
| 상속 + 피상속인 취득일 | ✅ | ❌ 모드 | ❌ 모드 | ❌ 모드 |
| 상속, 피상속인 취득일 없음 | ❌ 피상속인 | ❌ 모드+피상속인 | ❌ 모드+피상속인 | ❌ 모드+피상속인 |
| 증여 | ✅ | ❌ 모드 | ❌ 모드 | ❌ 모드 |
| 이월과세 | ❌ 원인 | ❌ 원인 | ❌ 원인 | ❌ 원인 |

(통과 12 = 없음 8 + 상속+피상속인·actual 2 + 증여·actual 2 / 차단 28. 표는 건물 원인 2종 각각에 동일.)

### 4.2 ⑧ 현행 vs D1 후

| | 현행 ⑧ | D1 후 ⑧ |
|---|---|---|
| 건물 **신축** 20셀 | ⑫와 일치 | 일치 |
| 건물 **매매** 20셀 | 원인을 「없음」으로 읽어(`landPartCauseApplicable`이 신축 한정, `lib/calc/transfer-land-part-cause.ts:25`) **항상 통과** → ⑫ 차단 14셀과 어긋남. 실사용에서는 ④도 원인을 보내지 않으므로(`effectiveLandAcquisitionCause`가 `""`) 400이 나지 않는다 | `landPartCauseApplicable`을 `acquisitionCause ∈ {newConstruction, purchase}`로 넓히면 40셀 일치 → anchor `D1-Z3`(현재 `it.skip`) 활성화 |

⚠️ 이 확장 한 줄이 ④·⑤·⑥·⑧·`splitBuildingAcqPriceInput`이 같이 쓰는 술어를 바꾼다 — 건물 매매의 `fixedAcquisitionPrice` 후퇴(`splitBuildingAcqPriceInput`)가 **매매에서는 켜지면 안 된다**(건물 매매는 파트 칸 `buildingAcquisitionPrice`가 정본이고 「신축비용」 칸이 없다). `effectiveLandAcquisitionCause`와 신축비용 후퇴를 **다른 술어로 분리**해야 한다(UI 시니어 확인 항목 — 이 문서가 못박는 것은 「매매에서 신축비용 후퇴 금지」뿐).

### 4.3 결합 제외 플래그 축 (⑫ 기대값)

토지 원인 ∈ {상속(+피상속인, actual), 증여(actual)}에서 각 플래그가 켜졌을 때 — 현행은 전부 통과(200), D1 후:

| 플래그 | 현행 ⑫ | D1 후 ⑫ | ⑧(UI 도달) |
|---|---|---|---|
| 부담부증여 | 200(양도차손) | **400** R-X1 | ④가 분리를 안 보냄 → 도달 불가, ⑧도 같은 사실로 차단 |
| PHD | 400(모드 메시지) | **400**(PHD 전용 메시지) R-X2 | PHD 토글 ↔ 토지 원인 토글 상호 배타(UI) |
| 가업상속 | 200(침묵 무시) | **400** R-X3 | D1에서 입력 경로 0 |
| selfOwns≠both | 200(침묵 무시) | **400** R-X4 | 토글 노출 조건(Q-5) |
| 건물 원인 비매매/비신축 | 200 | **400** R-X5 | 토글 노출 조건 |
| 토지 취득일 < 1990-08-30 | 200 | **400** R-Q7 | ⑧ 같은 메시지 |
| 공익수용·용도변경 | 200 | 200 (차단 안 함) | 동일 |
| 같은 날(Q-4) | 200 | 200 (⑫ 차단 안 함) | **⑧ 차단**(§5) |

---

## 5. Q-4 — 같은 날 + 원인 다름

**실측** (건물 매매 2025-02-01, 토지 상속 2025-02-01, 피상속인 2000-01-01, 파트 실가):

| 입력 | 결과 |
|---|---|
| `isSeparateAcquisition:true`, 같은 날 | 200 · 분리 계산 · 298,500,000 · 60% · 보유 1/1년 |
| `isSeparateAcquisition:false`, 같은 날, 파트 실가 | 200 · 같은 값 |
| 원인 없음, 같은 날 | 298,500,000 (동일) |
| 토지 취득일 없음 + 원인 | 200 · `splitDetail` 없음 · 원인 없음과 같은 값 (**침묵 무시**) |

**판정**: 같은 날은 엔진이 틀리게 계산하지 않는다 — 주택 `max(…, 건물 취득일)`이 통산을 무효로 만들고 장특 기산·파트 실가가 같다. 그러므로

- **⑫ 차단 불필요** (차단하면 계산이 맞는 입력을 막는다).
- **⑧(⑤)은 계획서 Q-4대로 안내 차단** — 같은 날 원인 혼합은 UI 정책(분리 ON이 날짜 같으면 `isSeparateAcquisition=false`가 되어 파트 완결 규칙이 꺼진다). 메시지는 「토지·건물의 취득일이 같으면 취득원인을 따로 지정할 수 없습니다 — 취득일이 다르면 지정하세요」. ⑧이 ⑫보다 엄격한 방향이라 막다른 길이 아니다(날짜를 고치거나 토글을 끌 수 있다).
- 비주택(`building`)은 `max`가 없어 같은 날 통산이 기산일 둘 다 같은 날로 **그대로 작동**한다(피상속인 2000 → 토지 25년). 그러나 건물 취득일과 같은 날 상속은 비현실적이라 UI 차단을 주택·비주택 공통으로 둔다(규칙 분기를 줄인다).

---

## 6. Q-7 — §163⑨ 단서 1호·의제취득일 전 상속·증여 토지 (**사용자 결정**)

### 6.1 법령 (본문 확인)

「소득세법 시행령」 제163조 제9항 단서 1호(MST 290841, verbatim): 「「부동산 가격공시에 관한 법률」에 따라 1990년 8월 30일 개별공시지가가 고시되기 전에 상속 또는 증여받은 토지의 경우에는 상속개시일 또는 증여일 현재 「상속세 및 증여세법」 제60조 내지 제66조의 규정에 의하여 평가한 가액과 제164조제4항의 규정에 의한 가액중 많은 금액」. 본문 괄호는 증여의제(상증법 §34~§39 등)를 제외한다.

### 6.2 현행 실측

| 입력 (건물 매매 2018 + 토지 …, 평가액 3억) | 결과 |
|---|---|
| 토지 1984-05-01 상속(피상속인 1960) | 200 · 118,660,000 · 토지 보유 **42년**·장특 30% · 취득가 3억 그대로 |
| 토지 1988-05-01 상속 (의제취득일 후·고시 전) | 200 · 118,660,000 (보유 38년) |
| 토지 1984-05-01 증여 | 200 · 118,660,000 |
| 토지 1984 상속 + 환산 | **400**(D0 G-2) |
| 토지 1991 상속 (단서 밖) | 200 |
| 신축 건물 + 토지 1984 상속 | 200 · 같은 값 (G-10) |

즉 **max 비교 없이 평가액 1칸만** 쓴다. 파트 가액은 split 경로가 `landAcquisitionPrice`만 보고 `pre1990Land`·`inheritedAcquisition`(자산 단위 STEP 0.45)에 닿지 않는다(`transfer-tax-split-acq-price.ts`에 pre1990 참조 0). 평가액이 §164④ 가액보다 작으면 취득가액이 법정보다 작다(일반건물 선례: 현행 421,185,000 ↔ max 334,920,000, **86,265,000원 과대**).

의제취득일(1985.1.1.) 전 상속: 자산 단위 경로는 「가목 확인 불가」 선언 → 환산(§176의2④)을 허용한다(`transfer-tax-validate-clause-a.ts` `needsClauseADeclaration`·`clauseADeclarationError`). 그러나 **파트에서는 D0 G-2가 환산을 막는다**. 일반건물이 같은 입장이다(`transfer-gb-pre1985-163-9.plan.md` §2: 「§163⑨은 의제취득일 조건이 없다 — pre-1985 상속·증여도 §163⑨(가목)이 정본」, 법 §97①1호 단서 verbatim 「가목의 실지거래가액을 확인할 수 없는 경우에 한정하여 나목」, 상증법 §60③ 평가액 부존재 불인정). 따라서 **1985 이전 상속·증여 토지 파트는 평가액(가목)이 정본이고, 1985 이후 1990.8.30. 이전은 거기에 max가 얹힌다** — 한 임계(< 1990-08-30)로 둘 다 덮인다.

### 6.3 선택지

| | A. D1 차단 + 안내 | B. 파트 max 입력 구현 (일반건물식) | C. 허용 + 경고만 |
|---|---|---|---|
| 내용 | 토지 취득일 < 1990-08-30 인 상속·증여 토지 파트를 엔진·⑫·⑧ 3중 차단(R-Q7) | ④에서 `max(평가액, §164④ 가액)`을 파트 슬롯에 싣고(일반건물 `transfer-tax-api-gb.ts` 선례), ⑧ 게이트 시 ② 비교값 요구, ⑤ 토지 상속 영역에 등급환산 섹션(기존 `Pre1990LandValuationInput`·`calculatePre1990LandValuation` 재사용) | 계산은 그대로, 「max 비교 미반영 — 확인 필요」 경고만 |
| 법령 정합 | 침묵 오답 제거(계산 자체를 안 함) | 정본 | 오답 가능성을 고지만 함 |
| 막다른 길 | **있다** — 해당 사용자는 신축·매매 모두 이 조합을 계산할 수 없다(대안: 없음. 토지를 「매매」로 속여 입력하면 §104② 통산을 잃는 또 다른 오답) | 없다 | 없다 |
| 새로 막히는 저장 이력 | D0 이후 「신축 + 토지 상속·증여」 중 토지 취득일 < 1990-08-30 건. **규모 측정 불가**(이력은 사용자 로컬 IndexedDB) — 확인 필요. 1980년대 상속 토지 위 신축은 현실 빈도가 낮지 않을 수 있다 | 없음 | 없음 |
| 엔진·⑫ 영향 | leaf 규칙 1개 | **엔진·⑫ 변경 0** — max가 ④ 값에 이미 반영(일반건물과 같은 한계: API 직접 호출은 max를 강제 못 함) | 엔진 warning 1줄 |
| 규모 | S (leaf + 메시지 + anchor) | L (UI 섹션 + 브리지(일반건물 `transfer-pre1990-gb-bridge.ts` 116줄 선례) + ⑧ V-6 + E2E) — 증여까지 하면 +M | S |
| 프로젝트 정책 | 「법령 정확성 최우선」·「자동 대체 fallback 금지」와 합치, 단 「필수화 전 입력 경로 확인」과 충돌(차단은 하되 경로 없음) | 가장 합치 | 「미입력은 validation 차단」과 충돌(경고로 격하) |

### 6.4 권장 — **A를 D1에 넣고, B를 D1b(별도 PR)로 바로 잇는다**

- 계획서가 이미 확정한 방향(A)과 같다. 이번에 추가로 확인한 사실은 두 가지다: ① 일반건물 선례로 B의 규모가 L(M이 아님)임이 확정됐고 엔진·⑫ 변경이 없다 → **D1 본체를 막지 않고 UI 중심 후속으로 떼기 좋다** ② A의 막다른 길은 실재하므로 메시지에 「이 비교는 후속 지원 예정」이라고 **약속하지 말고** 사실(미지원)만 적는다.
- C는 비권장: 정책(미입력 validation 차단)과 충돌하고, 경고는 읽히지 않는다.
- **결정 필요**: 신축 경로를 포함할지(Q-D1-1). 포함 권장 — 같은 침묵 과대과세가 신축 경로에 이미 있고(G-10), 한쪽만 막으면 형제 경로 불일치가 된다. 대신 안내문에 「토지 취득일(상속개시일·증여일)을 확인하세요」를 넣어 날짜 오입력으로 막힌 경우 스스로 해소하게 한다.

(구현은 A만 설계한다. B는 §8 「D1b 제외」 목록으로만 둔다.)

---

## 7. 법령 확인 결과 (KoreanLaw 본문, 2026-10-09)

| # | 질문 | 확인한 것 | 결론 |
|---|---|---|---|
| **V-1** | 토지·건물 취득원인이 다를 때 1세대1주택 보유·거주기간을 파트별로 따지는가 | ① **조심 2024인3140**(2024.9.3., 기각) 본문 전문: 토지 2008 취득 + 주택 2022-09 신축 → 2023-02 양도 **세율** 사건. 결론: 「법 §104①3호가 보유기간 1년 미만 주택에 70%, 같은 항 제2호가 주택에 부수토지 포함」 + 기재부 재산세제과-1354(2022.10.27.) 「주택부수토지로서의 보유기간」 인용(이 재결의 이유란에서 인용된 형태로만 확인, 원문 미조회). **비과세 보유·거주는 쟁점 아님**. ② **상속증여세과-466**(2013.8.12.) 본문(taxlaw): 환매 취득 토지의 **취득시기**(대금청산일) 문답이며 요지에 부수토지 비과세 판단은 없다. 회신이 인용한 **재일46014-2723(1994.10.21.)**: 「토지를 새로이 취득한 날부터 주택 부수토지의 기간으로 기산하여 비과세 여부를 가리는 것」 — 인용문으로만 확인(원문 미조회). ③ **부동산거래관리과-435**(2010.3.22.) 본문: 수용 비과세는 사업인정 고시일 전 취득분에 한하고 상속경정등기의 취득시기는 사실판단 — 파트별 보유기간 판정이 아님 | `isLaterAcquiredLandExemptExcluded`(나중 취득 부수토지 <2년이면 토지분 제외) **유지**. 근거는 **간접**(환매 토지 선례의 인용문 + 세율 재결의 「주택부수토지로서의 보유기간」). 정면 반증도 없다. **「확인 필요」 표지 유지** + Q-D1-4 고지 |
| **V-3** | 영 §154⑧3호 동일세대 상속 통산이 토지만 상속에 적용되는가 | 본문(verbatim): 「3. 상속받은 **주택**으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간」. DRF에서 「부수토지」+상속 정면 해석례 검색 NOT_FOUND | 문언은 「상속받은 주택」이다. **토지만 상속에는 적용하지 않는 현행 유지**(혜택 불성립 쪽 = memory 「모름 = 혜택 불성립 + 확인 필요」). 자산 단위 필드(`decedent` 동일세대 3키)는 건물 파트 개념이라 D2에서 다시 본다 |
| **V-5** | 조정대상지역 취득 시 거주요건의 기준 취득일 | 영 §154① 괄호(verbatim): 「취득 당시에 …조정대상지역에 있는 **주택**의 경우에는 해당 **주택**의 보유기간이 2년 … 이상이고 그 보유기간 중 거주기간이 2년 이상」. §154⑤: 보유기간 계산은 법 §95④. 부수토지를 따로 취득한 경우의 기준에 대한 명문·해석례 확보 못 함 | 문언상 기준은 「주택」의 취득 당시. 입력 경로는 자산 단위 `wasRegulatedAtAcquisition` 하나(실측 W3: 토지 상속이어도 같은 값) — **토지 취득시점 지역은 묻지 않는다**. 부수토지 별도 기준은 **「확인 필요」**, D1 변경 없음 |
| **V-6** | 증여 파트가 영 §163⑨ 괄호 제외 목록에 해당할 때 | 괄호(verbatim): 「부담부증여의 채무액에 해당하는 부분도 포함하되, 상증법 제34조부터 제39조까지, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2 및 제42조의3에 따른 증여는 제외」. 제외분은 §163⑩1호가 상속·증여재산가액(또는 증여의제이익)을 취득가액에 가산 | 현행 취득원인 선택지의 `gift`는 순수 수증만이다(`transfer-163-9-base-date.ts` 머리 주석). 증여의제 입력 경로가 없으므로 **엔진·⑫ 변경 없음**. 증여의제 토지는 D1 범위 밖 — 사용자 화면 안내 한 줄(UI 시니어) |

추가 확인(소득세법 MST 280405 본문): 법 §104② 단서 1호·2호, §95④ 단서(이월과세·가업상속공제 비율 자산만 증여자·피상속인 취득일 기산, 그 외 취득일부터), §104①2·3호 「주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다)」. 계획서 §1 표와 일치.

미확인: 영 §176의2④ 본문(이번 미재조회 — 계획서 인용 그대로, Q-7의 임계는 §163⑨1호만 근거로 삼았다), 기재부 재산세제과-1354·재일46014-2723 원문.

---

## 8. 변경 파일 목록 (엔진·API 층 — 800줄 cap 대비)

| 파일 | 현재 | 변경 | 예상 |
|---|---|---|---|
| `lib/tax-engine/transfer-split-part-cause.ts` | 62 | 사실 6개 + 규칙 R-X1~X5·R-Q7 + 상수 `SEC_163_9_LAND_FIRST_DISCLOSURE` | ~150 |
| `lib/tax-engine/transfer-rate-holding-basis.ts` | ~85 | `resolveRateBasis`(날짜+규칙) 일반화, 기존 함수는 위임 | +12 |
| `lib/tax-engine/transfer-tax-appurtenant-land.ts` | 277 | `resolveLandRateBasis` (기존 함수가 위임) | +10 |
| `lib/tax-engine/transfer-split-part-echo.ts` | 신규 | `buildSplitPartCauseEcho(input)` | ~70 |
| `lib/tax-engine/transfer-tax-split-gain.ts` | 532 | D0 호출부에 사실 6개, 두 반환 지점에 echo spread | +20 → ~552 |
| `lib/tax-engine/types/transfer-split-gain.types.ts` | 213 | `SplitPartResult` 5필드 + JSDoc | ~245 |
| `lib/tax-engine/transfer-tax-split-display.ts` | 320 | `SplitGainPartSummary` 통과, `splitCauseLabel`, `mixedCause` | ~360 |
| `lib/api/transfer-tax-schema-required-refines-2a.ts` | 449 | `refineSplitPartCause` 사실 공급 확장, `Required2aLike` 선택 필드 | +25 → ~475 |
| `lib/api/transfer-tax-schema.ts` | — | 컴패니언 호출에 사실 전달 (한 줄) | +2 |
| `__tests__/tax-engine/transfer/split-part-cause-echo.anchor.test.ts` | 신규 | §2.4 | — |
| `__tests__/tax-engine/transfer/split-part-cause-guards.anchor.test.ts` | 신규 | §3.3 (leaf·엔진·스키마 직접) | — |
| `__tests__/api/transfer.route.split-land-part-cause.d1.predo.anchor.test.ts` | 이 PR | 전환 줄 뒤집기 + todo 활성화 | — |

변경 **없음**(grep 확인): ⑭ `app/api/calc/transfer/engine-input.ts`·`multi/route.ts`·`bundled-split-helpers.ts`(운반 완료), ⑨⑩ enum, ⑪. 전부 800줄 미만.

UI 시니어와의 접점(이 문서가 정하는 것만): `SplitPartResult` 5필드 이름·의미(§2.1) · `summarizeSplitGain`의 `mixedCause`·`splitCauseLabel` · leaf 사실 6개 시그니처(§3.2) · 「매매에서 신축비용 후퇴 금지」(§4.2).

**D1b로 제외**: Q-7 B(파트 max 입력)·§154⑧3호 파트 적용·D2 전체.

---

## 9. Pre-Do anchor 목록

파일: `__tests__/api/transfer.route.split-land-part-cause.d1.predo.anchor.test.ts` — **활성 26 · skip 1 · todo 11, 단일 파일 실행 통과**(2026-10-09).

| ID | 내용 | 상태 | D1 후 |
|---|---|---|---|
| D1-0 | 기준 118,660,000 | 활성 | 유지 |
| D1-1/1′/1″ | 토지 상속 2022 + 건물 매매 = 153,860,000, 파트 세부, 원인 미지정=매매, 단순 증여 동일 | 활성 | 유지 |
| D1-2a~d | 세율 기산: 상속 166,660,000 / 증여·미지정 252,900,000 / 피상속인 2025-01 252,900,000 | 활성 | 유지 |
| D1-3a~c | V-7 `building`: 166,660,000 / 173,400,000 / 173,400,000 | 활성 | 유지 |
| D1-4a/4b | Q-4 같은 날 298,500,000 동일 · 분리 비활성 침묵 무시 | 활성 | 유지 (⑫ 비차단 근거) |
| D1-5a | **Q-7 현행**: 1984/1988 상속·1984 증여 토지 200 + 118,660,000 | 활성 | **전환 → 400** |
| D1-5b/5c | 1991 상속 200 · 1984 상속 환산 400 | 활성 | 유지 (긍정 짝) |
| D1-6a/b | 1세대1주택 W1 133,060,000 / 238,500,000 · W2 비과세 | 활성 | 유지 |
| D1-6c | 공익수용·용도변경 무관 | 활성 | 유지 |
| D1-6d/6e/6f/6g | 가업상속·소유자 분리·건물 상속/증여·부담부증여 **침묵 현행** | 활성 | **전환 → 400** (R-X3·X4·X5·X1) |
| D1-6h | 토지 propertyType 원인 무시 | 활성 | 유지 |
| D1-Z1 | ⑫ 40셀 = 12/28 | 활성 | 유지 |
| D1-Z2 | ⑧ 현행: 신축 20셀 일치 · 매매 14셀 어긋남 | 활성 | **삭제**(Z3로 대체) |
| D1-Z3 | ⑧ ≡ ⑫ 40셀 | **skip** | 활성화 |
| todo ×11 | Q-7 400 · R-X1~X5 · PHD 전용 메시지 · echo 3종 · `summarizeSplitGain` · 비과세 고지 | todo | 활성화 |

**설계에 반영된 pre-do 관찰**: D1-4a(같은 날 무효)·D1-2(통산이 세액에 닿는 범위)가 §5·§1.5를 바꿨다.

---

## 10. mutation probe 계획 (구현 PR)

하네스: 변형은 **복사본 위에서**(`git checkout` 금지 — memory), 중단 시 원복 trap, bash 3.2 호환, 변형마다 **파일 단위** vitest. KILLED만 기록하고 SURVIVED는 anchor를 고친다.

| # | 변형 | 기대 KILLED 테스트 |
|---|---|---|
| M1 | R-Q7 `<` → `<=` | 경계(1990-08-30 당일 200) |
| M2 | R-Q7 임계 상수 1990-08-29 | 경계 |
| M3 | R-Q7 규칙 삭제 | leaf·엔진·스키마·route 각각 (겹친 방어 확인: 하나 삭제 시 나머지 통과, 각 층 단독 테스트가 KILL) |
| M4 | R-X1~X5 각각 삭제/조건 반전 | 규칙별 leaf·엔진·스키마 |
| M5 | 구조 규칙 순서를 모드 규칙 뒤로 | PHD 전용 메시지 anchor |
| M6 | echo 토지 `rateBasisAcquisitionDate`를 `acquisitionDate`로 | E-1 |
| M7 | `appliedRateBasisDate`에서 `max` 제거 | E-1·E-3(주택/비주택) |
| M8 | 토지 echo 원인을 항상 `input.acquisitionCause`로 | E-1 (혼합 원인) |
| M9 | `mixedCause` 비교를 `===`로 반전 | E-6 |
| M10 | ⑧ 확장: `landPartCauseApplicable`에서 purchase 제외 | D1-Z3 |
| M11 | ⑧ 확장 시 매매에도 신축비용 후퇴 적용 | 건물 매매 V1 필수 anchor (UI 시니어 측) |
| M12 | `resolveRateBasis` 단서 1호 삭제 | D1-2a (+ 기존 split-part-rate 앵커 A-14) |
| M13 | R-X5 조건을 「명시값이 아닐 때」로 확대(엔진 헬퍼 기본값 포함) | `baseTransferInput` 기반 엔진 테스트 전건 (회귀 확인) |

---

## 11. 사용자 결정 질문

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-D1-1** (Q-7) | 1990.8.30. 전 상속·증여 토지 파트: (A) 3중 차단 / (B) 파트 max 입력 / (C) 경고만. 그리고 **신축 경로(D0 이후 이미 열린 입력)도 같이 막는가** | **A + 신축 포함**, B는 D1b 별 PR | §6. 막다른 길과 「새로 막히는 저장 이력」(규모 측정 불가)은 사용자가 수용해야 한다 — 수용하지 않으면 B를 D1에 포함(규모 L) |
| **Q-D1-2** | 결합 제외 목록 확정 — 필수 차단: 부담부증여·PHD(전용 메시지)·가업상속·소유자 분리·건물 상속/증여/이월과세/부담부증여. 공익수용·용도변경은 **차단하지 않음**(엔진 교차 없음, 수용 법적 상호작용은 별건 확인) | 이대로 | §3. 계획서는 공익수용·용도변경도 제외 목록에 넣었으나 가드할 엔진 동작이 없다. 막으려면 레버 없는 막다른 길이 될 수 있다 |
| **Q-D1-3** | Q-4: ⑫는 같은 날을 차단하지 않고 ⑧(⑤)만 안내 차단 | 이대로 | §5 |
| **Q-D1-4** | 1세대1주택 + 나중 취득 토지 상속으로 토지분이 비과세에서 빠질 때 엔진 warning 1줄(「피상속인 보유기간 통산은 영 §154⑧3호 문언(상속받은 주택)상 적용하지 않았습니다 — 확인 필요」) 추가 | 추가 | §7 V-1·V-3. 지금은 사실이 침묵이다(경고 0건). 세액 변경 없음. 위치 `applyHousingLandExclusions` 근처 |
| **Q-D1-5** | echo 5필드 + `mixedCause` 승인(장특 기산일 별도 필드 없음) | 승인 | §2. 이월과세 파트를 열 때(D 밖)에만 장특 기산일 필드가 필요하다 |
| **Q-D1-6** | G-11(신축 분기 ⑧→분리 검증 연결)을 D1에 포함 | UI 시니어 문서와 합의 후 결정 — 이 문서는 ⑧ 격자(원인 규칙)까지만 | 계획서 §4 D1 마지막 항목 |

---

## 12. 위험

| # | 위험 | 대응 |
|---|---|---|
| R-1 | 구조 규칙(R-X1~X5)이 D0 이후 저장된 이력·API 소비자를 새로 막는다. 특히 R-X4(소유자 분리)·R-X5(건물 비매매)는 일반건물 등 다른 경로의 컴패니언이 `landAcquisitionCause`를 같은 키로 보낼 때 영향 | 규칙은 `isSplitable`(housing/building) + 토지 취득일 있음 + 원인 ∈ {상속, 증여}일 때만. 구현 전 `grep landAcquisitionCause`(테스트 25파일 중 `split-part-rate`·`rate-104-2-2-gift-scope` 등 엔진 직접 호출) 전수 확인 — 건물 원인이 비매매인 기존 픽스처가 있으면 R-X5가 깬다 |
| R-2 | 엔진 헬퍼 기본값이 `acquisitionCause` 미지정(= 매매)이라 규칙을 「미지정일 때」로 쓰면 엔진 테스트 전건이 깨진다 (`transfer-fb-gate.ts` 경고) | 규칙은 **명시된 비매매 값일 때만** (M13) |
| R-3 | ⑧ 확장(`landPartCauseApplicable` 매매 포함)이 `splitBuildingAcqPriceInput`·사이드바·validate 8곳에 신축비용 후퇴를 매매로 번지게 한다 (memory 「게이트 확장이 잠자던 결함을 활성화」) | 두 술어 분리(§4.2). UI 시니어 격자 대조 |
| R-4 | `appliedRateBasisDate`가 「단일 자산 경로(파트별 세율 미진입)」에서는 실제 `calcTax`에 쓰이지 않은 값일 수 있다 — 파트 세율이 모두 같으면(`uniform`) `computeSplitPartTax`가 `null`을 돌려 자산 단위 기산(건물)을 쓴다 | 같은 세율이라 세액 동일. JSDoc에 「파트 세율 판정에 쓰였을 기산일」로 못박고, E-7로 `SplitRatePart.basisDate`와 일치를 잠근다 |
| R-5 | 토지 취득일 없는 `landAcquisitionCause`(API 직접 호출)는 여전히 침묵 무시 — D0가 의도한 범위 | 잔여로 기록. ④·⑧이 같은 사실(`hasLandAcquisitionDate`)을 쓰므로 UI 경로에서는 발생하지 않는다 |
| R-6 | 부담부증여에 `landAcquisitionDate`가 닿으면 원인과 무관하게 양도차손 — D1은 원인 조합만 막는다 | **별건**(분리 입력 자체를 `transferType==="burdened_gift"`에서 막는 ⑫ 규칙). D1-6g가 현행을 고정하고 있어 별건 PR에서 뒤집으면 된다 |
| R-7 | 공익수용 + 나중 취득 부수토지 <2년이면 `isLaterAcquiredLandExemptExcluded`가 수용 비과세(영 §154①2호가목: 보유·거주 제한 없음, 사업인정 고시일 전 취득) 판정과 무관하게 토지분을 제외한다 (원인 없는 매매에서도 동일, E1n 238,500,000) | 원인 축과 무관한 기존 동작. **법 해석 확인 필요** — 별건 |
| R-8 | `SEC_163_9_LAND_FIRST_DISCLOSURE` 가 `lib/calc` 3곳(`LAND_PRICE_NOTICE_START` 등)의 동명 상수와 두 벌 | leaf를 정본으로 하고 `lib/calc`는 re-export (UI 시니어 영역) — 값이 같아 당장 어긋나지 않는다 |
| R-9 | Q-7 A 임계(`<`)의 날짜가 상속개시일/증여일이므로 날짜를 잘못 입력해 막힌 사용자는 이유를 모를 수 있다 | 메시지에 입력 날짜 확인 문구, ⑧이 `landAcquisitionDate` 칸으로 보내는지는 UI 시니어 결정 |
