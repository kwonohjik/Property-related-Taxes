# 일반건물(토지+건물 일괄) × 배우자등 이월과세(§97의2) — 배선 계획

**작성**: 2026-08-10 · **선행**: PR #1163(지분 anchor) · #1167(표시 계층 접미사)
**상태**: 계획 — **착수 조건 미충족**(§6). 구현 미착수.

---

## 1. 서술 정정 — 「UI 부재」가 아니라 **「배선 부재」**였다

PR #1163·#1167의 완료 보고에서 나는 이렇게 적었다:

> C-14는 폼에서 도달할 수 없다 — `landCarryoverTaxation`의 생산자가 `lib/calc/`·`components/`에
> **0건**이다(grep 실측). 일반건물 토지 이월과세는 현재 **API 전용**이다.

**필드 이름으로 grep한 결과는 맞았지만, 결론이 틀렸다.** 이번에 경로를 끝까지 따라가 보니:

- **UI는 이미 있다** — `GeneralBuildingAcquisitionCards.tsx:47~56`의 `LAND_CAUSE_OPTIONS`에
  「이월과세(증여)」가 있고, 선택하면 `:577~583`이 `CarryoverGiftBlock`을 렌더한다.
  전용 입력 컴포넌트 3개(`CarryoverGiftBlock`·`CarryoverEstimationSection`·
  `CarryoverGiftExclusionSection`)가 전부 동작한다.
- **④ 변환도 값을 만든다** — `transfer-tax-api-helpers.ts:660~669`가 `buildCarryoverPayload`로
  **top-level `carryoverTaxation`** 을 만들어 보낸다.
- **끊긴 곳은 route다** — `route.ts:425`의 `dispatchGeneralBuilding(...)` 인자에
  `carryoverTaxation`이 **없다**. 엔진이 읽는 키는 `generalBuildingValuation.landCarryoverTaxation`인데
  ④는 그 키를 만들지 않는다.

⇒ 할 일은 「UI 신규 개발」이 아니라 **④↔엔진 키 연결**이다. 규모가 한 자릿수로 줄었다.

> 📌 **교훈** — 「생산자 grep 0건」은 *그 필드가* 안 만들어진다는 뜻이지 *기능이* 없다는 뜻이 아니다.
> 같은 개념을 **다른 키 이름**으로 만드는 경로가 있으면 결론이 뒤집힌다.
> (메모리 `feedback_sibling_path_already_implements_rule` · `feedback_open_item_wording_is_also_unverified`)

---

## 2. 실측 (2026-08-10, throwaway probe · mock 세율)

픽스처: 일반건물 환산 · 총양도가 10억 · 토지 100㎡ 2,000,000/㎡ · 건물기준시가 2억 ·
취득시 토지 1,000,000/㎡ · 건물 1억 · 증여 2021-03-01 · 증여자 취득 2005-06-15 ·
증여자 취득가액 1.5억 · 증여세 3천만 · 증여 당시 평가액 4억

| # | payload | status | 결정세액 | 판정 |
|---|---|---|---|---|
| 기준 | 이월과세 없음 | 200 | **170,660,000** | — |
| ① | top-level `carryoverTaxation` (④가 실제로 만드는 것) | 200 | **170,660,000** | 🔴 **변화 0 — 미도달** |
| ② | `generalBuildingValuation.landCarryoverTaxation` (엔진이 읽는 것) | 200 | **161,460,000** | ✅ 도달 |
| ③ | **UI가 실제로 만드는 조합** — `landAcquisitionCause: "carryover_gift"` + top-level `carryoverTaxation`, 서브객체 없음 | 200 | **170,660,000** | 🔴 **오류·경고 없이 조용히 무시** |

③이 이 계획의 대상이다. 사용자는 이월과세를 선택하고 6~10칸을 입력하지만 **세액이 1원도 바뀌지 않고,
안내 문구도 뜨지 않는다**(메모리 `feedback_api_trigger_without_input_path_is_noop`의 거울상 —
입력 경로는 있는데 배선이 없다).

---

## 3. 현행 경로 전수

```
① 폼        asset.acquisitionCause = "carryover_gift"       ✅ 있음 (LAND_CAUSE_OPTIONS)
⑤ UI        CarryoverGiftBlock (13필드 + 배제선언 3)         ✅ 있음 (:577)
④ 변환      buildCarryoverPayload → carryoverTaxation        ✅ 만듦 (top-level)
            buildGeneralBuildingValuation                     🔴 landCarryoverTaxation 미생성
                                                                 (landAcquisitionCause만 전달 — :396·:531)
⑨⑫ Zod     top-level carryoverTaxation                      ✅ 통과 (schema:354)
            generalBuildingValuation.landCarryoverTaxation    ✅ 스키마 존재 (building-schemas:214)
⑭ route     dispatchGeneralBuilding(gbv, …)                   🔴 carryoverTaxation 인자 없음 (route:425)
엔진        buildGeneralBuildingAssetCards
              → 토지 카드 carryoverTaxation: input.landCarryoverTaxation   ✅ 배선 있음
              → 단건 엔진 STEP 0.475 (transfer-tax.ts:129)
                 조건: acquisitionCause==="carryover_gift" && carryoverTaxation
                 ⇒ 서브객체가 undefined라 **조건 불충족 → skip**
⑧ validate  GB × 이월과세 검증 **0건** (grep 실측)             🔴 없음
```

**끊긴 지점은 ④ 한 곳**이다. Zod·엔진·UI는 이미 준비돼 있다.

---

## 4. 범위

### 포함

1. ④가 `buildCarryoverPayload`의 결과를 GB payload의 `landCarryoverTaxation`으로도 싣는다.
2. ⑧ validate — 이월과세 선택 시 필수 칸(증여등기일·증여자취득일·증여 당시 평가액 등) 검증.
   현재 GB 경로에는 이월과세 검증이 **0건**이라, 빈 칸으로도 계산이 진행된다.
3. ⑦ 결과 표시 — 비교과세 결과(`carryoverTaxationDetail`)가 GB 결과 화면에 노출되는지 확인.
   `CarryoverComparisonCard`가 이미 있으나 GB aggregate 경로에서 렌더되는지 **미확인**.
4. anchor + E2E.

### 제외 (근거 명시)

| 항목 | 제외 근거 |
|---|---|
| **건물 파트 이월과세** | `BUILDING_CAUSE_OPTIONS`(:59~64)에 `carryover_gift`가 **없다** — 매매·상속·증여·신축 4종뿐. 엔진에도 건물 파트 carryover 배선이 없다(`landCarryoverTaxation` 단일). 법령상으로는 대상이므로(§5) **Q1로 승격**해 별도 판단한다. |
| **부담부증여 × 이월과세** | 다른 작업 줄기가 진행 중이다(PR #1159·#1162·#1165 계열, `burdened-gift-carryover-159-97-2.plan.md`). §159가 취득가액을 정하는 축이라 이 계획과 **결론이 충돌할 수 있다** — 그쪽이 끝난 뒤 교차한다. |
| **주식 이월과세** | 기존 계획 `transfer-tax-carryover-taxation.plan.md` §3.3에서 v2로 이미 분리. |

---

## 5. 법령 근거

**「소득세법」 제97조의2 제1항** — 배우자·직계존비속에게서 증여받은 **토지·건물** 또는 대통령령으로
정하는 자산을 증여일부터 10년(2022.12.31. 이전 증여분 5년) 이내에 양도하는 경우, 취득가액은
**증여자의 취득 당시 제97조 제1항 제1호에 따른 가액**으로 하고, 납부한 **증여세 상당액은 필요경비에 산입**한다.

**같은 법 시행령 제163조의2 제1항** — 「대통령령으로 정하는 자산」 = §94①2호 가목(부동산을 취득할 수
있는 권리) 및 §94①4호 나목(특정시설물 이용권 등).

⇒ **일반건물의 토지·건물은 둘 다 §97의2 제1항 본문의 「토지·건물」에 해당한다.** 건물 파트를
지원하지 않는 것은 법령상 근거가 있는 제한이 아니라 **구현 범위**다(§6 Q1).

**같은 조 제2항** — 적용배제 3사유(수용·1세대1주택 비과세·비교과세). **제4항** — 가업상속공제 자산.
기존 계획 `transfer-tax-carryover-taxation.plan.md` §3.4에 정리돼 있고 엔진이 구현하고 있다.

> ⚠️ 위 인용은 기존 계획서(`transfer-tax-carryover-taxation.plan.md` §2·§3.3)가 법제처 원문
> 확인을 마친 내용을 인용한 것이다. **착수 전 §97의2 ① 본문을 다시 직독**해 10년/5년 경과규정과
> 「토지·건물」 문언을 재확인할 것(`feedback_law_citation_must_name_statute_and_tier`).

---

## 6. 착수 조건 — 아래 4건이 확정되기 전에는 구현하지 않는다

### Q1. 건물 파트 이월과세를 이번에 넣는가 🔴 **가장 큰 분기**

법령상 건물도 대상인데(§5) UI·엔진 모두 토지만 지원한다. **토지+건물을 함께 증여받은 경우가
오히려 전형**이므로, 토지만 배선하면 「반쪽 지원」이 된다.

선택지:

| 안 | 내용 | 대가 |
|---|---|---|
| **A. 파트별 입력 2벌** | 건물 취득원인에 `carryover_gift` 추가 + `buildingCarryoverTaxation` 신설. 엔진 건물 카드에도 배선 | 입력 칸 2배(각 10칸). 안분 근거 불요 — 사용자가 파트별로 안다 |
| **B. 자산 단위 1벌 + 파트 안분** | 지금 UI 그대로 받아 route가 토지·건물로 안분 | **안분 근거가 필요하다.** 저장소 선례는 있다 — 일괄 취득가액을 **취득시 기준시가 비율**로 나눈다(사례 33, `buildGbAcquisitionFormula`). 다만 이월과세의 「취득시」는 **증여자의 취득 당시**라 그 시점 파트별 기준시가를 사용자가 갖고 있어야 한다 |
| **C. 토지만 (이번 범위)** | 현행 구조 유지. 건물 이월과세는 **차단 + 안내** | 반쪽 지원이지만 **틀린 답을 내지 않는다**. 건물 옵션이 애초에 없어 사용자가 잘못 고를 여지도 없다 |

**미확정.** B의 안분 근거(증여자 취득 당시 파트별 가액을 어떻게 나누는가)에 대한 **법령·예규를
확인하지 못했다** — 「확인 필요」이지 「없다」가 아니다(`feedback_no_statute_claim_needs_requirement_article`).

### Q2. 환산 모드(`estimationMode === "general"`)를 GB에서 어떻게 다루는가

`buildCarryoverPayload`가 환산 모드에서 **top-level** `standardPriceAtAcquisition`/
`standardPriceAtTransfer`를 override한다(`transfer-tax-api-carryover.ts:58~65`).
그런데 **GB 경로는 그 top-level 필드를 읽지 않는다** — 파트별 기준시가
(`acquisitionLandPricePerSqm` 등)로 환산한다.

⇒ 환산 모드 이월과세를 GB에 그대로 태우면 **증여자 기준시가가 무시되고 수증자 기준시가로 환산**될
위험이 있다. **미검증** — 배선하기 전에 probe로 확인해야 한다.

### Q3. 지분(%) 분할 × 이월과세 — 금액 필드를 × 지분율 하는가

`applyShareScale`(`transfer-tax-api-gb-shares.ts:105~143`)의 스케일 목록에
`landCarryoverTaxation`이 없다. 배선하면 지분 분할과 교차하므로 다음을 정해야 한다:

- `donorAcquisitionPrice` · `giftTaxAmount` · `giftDateValuation` · `donorCapitalExpenditure`를
  **100% 기준으로 입력받아 × r** 할 것인가, **지분 기준으로 입력**받을 것인가.
- 결정은 **UI 안내 문구와 3중 일치**해야 한다(메모리 `feedback_store_default_vs_ui_display_fallback`).

> 지분 분할 anchor **GBF-27**은 route에 **이미 × r 된 값**이 온다고 가정하고 통과한다.
> Q3을 반대로 정하면 그 anchor를 함께 고쳐야 한다.

### Q4. 부담부증여 줄기와의 순서

`burdened-gift-carryover-159-97-2.plan.md`가 §159 ↔ §97의2 교차를 다루고 있고, **§159가 취득가액을
삼킨다**는 결론이 이미 나와 있다(그 계획서 D-2·D-3). GB 배선이 그 결론과 충돌하지 않는지
**그쪽 착지 후** 대조한다.

---

## 7. 케이스 인벤토리 (Do 진입 게이트)

| # | 시나리오 | 근거 | anchor | 상태 |
|---|---|---|---|---|
| K-01 | GB 토지 이월과세 — 10년 이내 증여, 적용 | 법 §97의2① | ☐ | ☐ |
| K-02 | 10년 초과 증여 → 배제(`period_exceeded`), 취득가액 = 증여 당시 평가액 | 법 §97의2① | ☐ | ☐ |
| K-03 | 비교과세 — 이월 세액 < 통상 세액이면 통상 채택 | 법 §97의2②3호 | ☐ | ☐ |
| K-04 | 적용배제 선언 3종이 GB 파트까지 도달 | 법 §97의2② | ☐ | ☐ |
| K-05 | 보유기간 기산이 증여자 취득일로 당겨져 LTHD가 커진다 | 법 §95④ | ☐ | ☐ |
| K-06 | 증여세 상당액이 필요경비에 산입된다 | 법 §97의2① | ☐ | ☐ |
| K-07 | **음성** — 건물 파트는 영향받지 않는다(토지 전용 배선) | Q1 결정 전 현행 | ☐ | ☐ |
| K-08 | **회귀** — 이월과세 미선택 GB는 원 단위 동일 | 회귀 불변식 | ☐ | ☐ |
| K-09 | ⑧ 필수 칸 미입력 시 **차단**(현재는 빈 칸으로도 통과) | 계획 §4-2 | ☐ | ☐ |
| K-10 | 환산 모드 — Q2 결정에 따름 | Q2 | ☐ | ☐ |
| K-11 | 지분 분할 × 이월과세 — Q3 결정에 따름 (GBF-27과 정합) | Q3 | ☐ | ☐ |
| K-12 | **E2E** — 폼에서 입력 → 세액이 실제로 바뀐다 | §2 ③ 재발 방지 | ☐ | ☐ |

> K-12가 이 작업의 **핵심 anchor**다. §2 ③이 「vitest는 통과하는데 화면에서는 아무 일도 없다」였으므로,
> 폼→payload→세액 전 구간을 브라우저로 봐야 재발을 막는다.

---

## 8. 14 동기화 지점 매핑

| # | 지점 | 상태 |
|---|---|---|
| ① 폼 상태 | `AssetForm.carryover: CarryoverTaxationForm` | ✅ 있음 |
| ② initial | `CARRYOVER_DEFAULTS` | ✅ 있음 |
| ③ normalize | 기존 마이그레이션 | ✅ 있음 |
| ④ **API 변환** | `buildGeneralBuildingValuation`에 `landCarryoverTaxation` 추가 | 🔴 **이번 작업** |
| ⑤ UI 위젯 | `CarryoverGiftBlock` | ✅ 있음 |
| ⑥ 사이드바 | 취득가액이 비교과세 후 값으로 바뀌는지 | 🟡 확인 필요 |
| ⑦ 결과 카드 | `CarryoverComparisonCard`가 GB aggregate에서 렌더되는지 | 🟡 확인 필요 |
| ⑧ **validation** | GB × 이월과세 검증 **0건** | 🔴 **이번 작업** |
| ⑨⑩ Zod enum | `landAcquisitionCause`에 `carryover_gift` 존재 | ✅ 있음 |
| ⑪ 자산-수준 `acquisitionDate` fallback | 증여일 = 취득일 | ✅ 있음 |
| ⑫ Zod 입력 객체 | `landCarryoverTaxation` 스키마 | ✅ 있음 |
| ⑬ body spread | top-level `carryoverTaxation`은 이미 감 | ✅ (GB는 미사용) |
| ⑭ route 매핑 | `coerceGeneralBuildingPayload`가 날짜 2필드 변환 | ✅ 있음 |

**변경은 ④·⑧ 두 곳**이고 나머지는 확인 작업이다. ⑥⑦은 🟡 — **확인하지 않았다.**

---

## 9. Definition of Done

- [ ] §6 Q1~Q4 **전건 확정** (사용자 결정 + 법령 확인)
- [ ] 케이스 인벤토리 K-01~K-12 전 행 anchor
- [ ] **K-12 E2E** — 브라우저에서 세액이 실제로 바뀌는 것 확인
- [ ] mutation probe — ④ 배선을 되돌리면 K-12가 실패함을 실측
- [ ] tsc 0 · lint 0 errors · `npm run test:transfer` 회귀 0
- [ ] ⑥⑦ 확인 결과를 문서에 기록 (렌더되지 않으면 그것도 이번 범위)
