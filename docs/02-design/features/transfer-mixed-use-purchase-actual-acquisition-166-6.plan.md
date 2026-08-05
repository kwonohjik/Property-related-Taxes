# 겸용주택 매매 취득 실거래가 안분 계획서 (R1) — 안분 근거 **법 §100②**

> ⚠️ 파일명 `-166-6`은 초안 시점 식별자(내부 id 유지). **정확한 안분 근거는 법 §100② 본칙**(§1 — KoreanLaw 정정). §166⑥은 토지·건물 구분 불분명 시 부가세법 §64① 위임일 뿐.
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `useActualAcquisition`·`acquisitionActualTotalPrice`(`transfer-tax-api-mixed-use.ts:234·237`) + route enum `section97_actual`(`transfer-tax-mixed-use.ts:505-506`) — 계획서 §3.1 설계 그대로.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: **Plan (자가검토 13단계 완료)** · 작성 2026-07-21 · 근거: 감사 memory `project_transfer_special_engine_gift_acquisition_163_9_gap`(R1 확정 버그)~~
> 선행/관련: 겸용 §163⑨ 상속(PR#710)·증여(#726) 취득가액 직접평가 시리즈. 본 건은 **매매(purchase)** 경로.

## 0. 한 줄 요약

겸용주택을 **매매로 취득**하고 **취득 실거래가가 확인 가능**하면 §97①1호가목에 따라 실지거래가액을 취득가액으로 써야 하나, 현행 겸용 엔진은 **취득 실거래가를 받을 통로 자체가 없어 환산(§176의2②③)을 무조건 강제**한다. UI는 "실거래가" 선택·취득가액 입력칸을 노출하지만 엔진이 침묵 폐기(UI↔엔진 불일치). 취득 실거래가를 **법 §100② 비율**(취득 당시 기준시가)로 주택분/상가분·토지/건물에 안분하는 **실가 경로를 신설**한다. (안분 근거 정정: 초안 §166⑥ → §100② 본칙, §1 참조.)

## 1. 법적 근거 (✅ KoreanLaw 검증 완료 2026-07-21 — 법제처 원문 실측)

> 소득세법 MST 280405 · 소령 MST 286211 원문 실측. **정정**: 초안의 "§166⑥ = 취득/양도 비율"은 위임 끝 미추적 → 정확한 본칙은 **법 §100②**.

- **법 §97①1호가목**: 취득가액 = 취득 당시 **실지거래가액**(원칙).
- **법 §100② (본칙 — 안분 근거·실측 인용)**: "양도가액 또는 취득가액을 **실지거래가액**에 따라 산정하는 경우로서 토지와 건물 등을 함께 취득하거나 양도한 경우에는... 가액 구분이 불분명할 때에는 **취득 또는 양도 당시의 기준시가 등을 고려하여** 대통령령으로 정하는 바에 따라 안분계산한다. 이 경우 공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분." → **"취득가액은 취득시 기준시가 비율, 양도가액은 양도시 기준시가 비율"은 §100② 본칙에 직접 명문.**
- **소령 §164 (기준시가 산정)**: 주택분/상가분 안분 비율의 기준시가. codebase `MIXED_USE.APPORTIONMENT = "소득세법 §99 + 시행령 §164"`(transfer-mixed-use.ts:11)와 정합 — **§166⑥ 아님**.
- **소령 §166⑥ (토지·건물 구분 불분명 시 안분방법 위임)**: 실측 원문 = "법 §100② 적용 시 **토지와 건물 등의 가액 구분이 불분명한 때에는 「부가가치세법 시행령」 §64①에 따라 안분**". → §166⑥은 §100②의 시행령 위임(→부가세법 §64①)이지 "취득/양도 비율" 명문 아님. (§166 자체는 재개발 조항.)
- **법 §114⑦ + 소령 §176의2②③ (환산=추계)**: 환산취득가액은 "양도가액 또는 취득가액을 **추계결정·경정**하는 경우"(실지거래가 확인 불가) 순차(매매사례→감정→환산→기준시가). → **실가 확인 가능 시 환산 배제**(실가 강제). 겸용 매매 실가에 환산 강제 = §97①·§100② 위반 확정.
- **소령 §163⑥ 개산공제(3%)**: 환산 전용 → 실가 경로 배제(상속·증여 §163⑨ 실가 경로 동일). 대신 실제 필요경비.

> **위임 체인 요약**: 실가 원칙 = 법 §97①·§100② / 안분 비율(취득·양도 당시 기준시가) = **법 §100② 본칙** / 기준시가 산정 = 소령 §164 / 토지·건물 구분 불분명 안분방법 = 소령 §166⑥ → 부가세법 시행령 §64① / 환산(추계) = 법 §114⑦·소령 §176의2. (`korean-law-citation-verify` 위반사례 정정: 초안 §166⑥→§100② 격상.)

## 2. 감사 결과 (실측 확정)

| 항목 | 실측 |
|---|---|
| 엔진 입력 타입 | `MixedUseAssetInput`(`types/transfer-mixed-use.types.ts`)에 취득 실거래가 필드 **전무**(grep 0) |
| 엔진 계산 | 매매 = `calculateEstimatedAcquisitionPrice`(helpers.ts:326 주택분·commercial.ts:134 상가분) **무조건 환산** |
| API | `transfer-tax-api-mixed-use.ts`가 `fixedAcquisitionPrice` **미운반** |
| UI 불일치 | `CompanionAcqPurchaseBlock.tsx:457` `!useEstimatedAcquisition` 분기가 `isMixedUse`(:516)보다 **먼저** → 겸용 "실거래가" 선택 시 취득가액 입력칸(:476) 렌더되나 엔진 침묵 폐기 |
| 안분 인프라(재사용) | 양도가액: `apportionTransferPrice`(주택분/상가분) → part별 `landTransferPrice`/`buildingTransferPrice`(commercial.ts:145-146). 취득가액: `landAcqPrice = floor(estimatedAcqPrice × acqLandRatio)`(commercial.ts:149) — **`estimatedAcqPrice`만 실가로 교체**하면 안분 로직 그대로 재사용 |

## 3. 설계 방향 (초안 — Design에서 확정)

### 3.1 엔진 (신규 실가 분기)

- **신규 입력 필드**: `MixedUseAssetInput`에 취득 실거래가 1필드(가칭 `acquisitionActualTotalPrice?: number`) + 게이트(가칭 `useActualAcquisition?: boolean`). **배타 불변식(강제)**: 상속(`acquisitionByInheritance`)·증여(`acquisitionByGift`)·실가(`useActualAcquisition`)는 **상호배타**(취득원인 단일 — 셋 중 최대 1개 true). API에서 보장(3중 배타). 셋 다 false면 기존 환산.
- **⚠️ 실가 vs 환산은 납세자 선택이 아니라 법령 강제**: §97①1호가목상 취득 실거래가 확인 가능 시 실가가 **원칙**, 환산은 §176의2②③ "확인 불가 시만". "실거래가/환산" UI 토글은 *취득가액을 아는지 여부*의 표현이지 절세 선택이 아니다(`feedback_no_unfavorable_application_without_legal_basis`·`feedback_tax_calculation_principle` — 유리/불리 표현 금지).
- **분할 알고리즘** (법 §100② 안분 — 취득 당시 기준시가 비율. **실측 확정 2026-07-21**):
  1. 총 취득 실거래가 → 주택분/상가분 = **취득시 기준시가 비율**로 안분. 현행 `apportionTransferPrice`(helpers.ts:100)는 `asset.transferStandardPrice`(양도시)에 **하드코딩** → 취득 실가엔 `asset.acquisitionStandardPrice`(취득시) + `acqDerived`(취득시 상가부수토지면적) 기반 **신규 `apportionAcquisitionPrice`**(양도가액 분할의 취득시 미러) 신설 또는 stdPrice source 매개변수화. `housingRatio_취득 = 취득시주택기준시가 / (취득시주택+상가기준시가)`.
  2. 각 part의 취득가액(주택분·상가분 총액)을 다시 토지/건물 = 취득시 기준시가 비율(`acqLandRatio`, commercial.ts:141)로 안분 — commercial.ts:149·helpers 주택분 동일.
  3. `estimatedAcqPrice` 자리에 위 실가 part 총액 주입(`calculateEstimatedAcquisitionPrice` 미호출) — **토지/건물 안분(commercial.ts:148-150)은 그대로 재사용**(핵심: `estimatedAcqPrice` 값만 실가로 교체).
  - ⚠️ house_to_commercial 시 `acqDerived.commercialLandArea=0`(commercial.ts:101-104 landAreaForUserInput 특례) — 실가 모드에서 취득시 상가부수토지면적 산출 정합 Design에서 확정.
- **개산공제·필요경비(D 확정)**: 실가 경로 개산공제 0(§163⑥ 배제). **초기 출시 = 실비 미입력(필요경비 0)** — 실제 자본적지출·양도비 입력(상속·증여 `*InheritedExpense` 슬롯 재사용)은 후속(§6 R-C).
- **route enum**: `acquisitionConversionRoute`에 `section97_actual`(또는 유사) 추가 — 결과 라벨 단일 소스(신규 result echo 금지, dual-truth 회피 `feedback_ui_engine_dual_truth_avoidance`).
- **불변식**: 상속·증여 경로·기존 환산(매매 실가 미선택) 경로 전건 불변.

### 3.2 API

- `transfer-tax-api-mixed-use.ts`: 겸용 매매 + 실거래가 모드(`acquisitionCause==="purchase" && !useEstimatedAcquisition && !isAppraisal && !isSalesCase`) 시 `fixedAcquisitionPrice`를 신규 엔진 필드로 운반 + 게이트 true.
- **주의(감정가액·매매사례가액)**: 겸용에서 이 두 모드 처리 방식 확정 필요 — 현행 겸용은 환산만. 본 계획은 **실거래가(actual)** 우선, 감정·매매사례는 범위 밖(별도 판단) 또는 후속.

### 3.3 UI

- `CompanionAcqPurchaseBlock.tsx`: 겸용 + 실거래가 모드에서 취득가액 입력칸이 **엔진에 실제 반영됨**을 명확화(현재는 렌더되나 무시). hint 문구로 "법 §100②에 따라 취득시 기준시가 비율로 주택분/상가분·토지/건물 자동 안분" 안내.
- 겸용 취득시 기준시가(주택분·상가분)는 실가·환산 **양 모드 모두 필요**(안분 비율 산출) — 기존 MixedUseSection 입력 유지. 실가 모드에서도 취득시 기준시가는 **비율 산출용**으로 필수(값 자체가 취득가액이 아님).

### 3.4 Validation

- `transfer-tax-validate-mixed-*`: 겸용 매매 실가 모드 시 취득 실거래가(`fixedAcquisitionPrice`) 필수 + 취득시 기준시가(비율용) 필수. silent fallback 금지(`feedback_no_silent_apportion_fallback`).
- **UI↔validate 모순 방지**: UI가 실거래가 입력을 받으면 validate·API·엔진 모두 동일 경로(3중 패턴 `mirror-pattern`).

## 4. 14 동기화 지점 (신규 엔진 필드 기준 — Design에서 전수)

신규 `acquisitionActualTotalPrice`·게이트 → 8클라이언트(①~⑧) + API/Route 6(⑨~⑭). ⑫Zod 입력(`transfer-tax-schema-mixed-use.ts`)·⑬body spread·⑭route 매핑 침묵 strip 주의. 결과카드(⑦) route enum 라벨 분기.

**⑥ 사이드바 = 자동 정합(신규 코드 불요, 실측 2026-07-21)**: `transfer-per-asset-summary.ts:186-190`이 겸용 취득가액을 **엔진 result** `mixedResult.housingPart.estimatedAcquisitionPrice + commercialPart.estimatedAcquisitionPrice`로 읽는다 → 엔진이 실가값을 `estimatedAcquisitionPrice` 슬롯에 담으면 자동 추종. 결과 도착 전 프리뷰는 `directAcqRaw`(`:73` = `fixedAcquisitionPrice`)라 실가 모드에서 사용자가 입력한 실거래가 그대로 표시(일관). → ⑥은 "확인" 항목.

**엔진 result 필드 naming(트레이드오프)**: 실가값을 기존 `estimatedAcquisitionPrice` 슬롯에 담으면 필드명이 실제와 어긋난다(§163⑨ `*Inherited*` 슬롯 재사용과 동일 B1 트레이드오프). 결과 라벨은 route enum(`acquisitionConversionRoute`) 단일 소스로 분기해 dual-truth 회피(신규 result echo 금지). 슬롯 rename은 회귀면적↑라 후속 별건.

## 5. Pre-Do Anchor 계획

- A1: 겸용 매매 실거래가 X → 수정 전 환산값, 수정 후 X를 법 §100② 취득시 기준시가 비율 안분(개산공제 0). 원단위 `toBe()`.
- A2(회귀): 겸용 매매 + 실거래가 미선택(환산 모드) → 현행 환산값 불변.
- A3(회귀): 겸용 상속·증여 §163⑨ 경로 수치 불변.
- 안분 검증: 주택분+상가분 = 총 취득실가(±1원 floor 잔액), 토지+건물 = part 총액.

## 6. 리스크·미결

- ~~R-A KoreanLaw 미검증(차단)~~ **✅해소(2026-07-21)**: 법제처 원문 실측 완료(§1). 근거 = **법 §100② 본칙**("취득/양도 당시 기준시가 고려 안분") + 소령 §164(기준시가) + §166⑥→부가세법§64①(토지·건물 구분방법). 초안 §166⑥ 인용을 §100②로 정정. 설계 법령 정합 확정 — Do 차단 해제.
- **R-B 감정가액·매매사례가액 겸용 경로(동일 버그 클래스)**: 겸용+감정가액(`isAppraisalAcquisition`)·매매사례(`isSalesCaseAcquisition`) 선택도 **실거래가와 동일한 silent-환산 버그**(API `isMixedActual`이 `!isAppraisal && !isSalesCase`로 제외 → 게이트 false → 환산). 즉 겸용은 실거래가·감정·매매사례 3모드 모두 현재 환산으로 침묵 처리됨(감사표 §2 보강). 본 계획은 **실거래가(actual)만** 우선 — 감정·매매사례는 §176의2③ 추계 순서·겸용 안분 상호작용이 달라 **후속 분리**(초기엔 validate 안내 차단, ui.design §3·§6).
- **R-C 필요경비 처리(D 결정 — 초기 확정)**: 실가 경로 개산공제(§163⑥ 3%) 배제. **초기 출시 = 실비 미입력(필요경비 0)**으로 최소 구현(engine.design §8 정합), 실제 자본적지출·양도비 입력(상속·증여 `*InheritedExpense` 슬롯 재사용)은 **후속**. anchor A1은 필요경비 0 기준.
- **R-D 인접 분기 상호작용(가드 필요)**: 실가 모드와 아래 특수 분기의 조합을 Design에서 확정(초기엔 미지원 가드 검토, §163⑨ 상속·증여가 공익수용 조합을 가드한 선례):
  - **Case A 4부분 안분**(`partialUsageChange` house_to_commercial + PHD `fourPartApportionment`, commercial.ts:60) — 별도 어댑터. 실가 모드 겹침 여부.
  - **§164⑨ 공익수용 특례**(commercial.ts:113 `commercialExprVal`·helpers 주택분) — 실가 모드는 환산 분모 개념이 없으므로 조합 가드(상속·증여 §163⑨가 이미 `transferCause === "public_expropriation"` 조합 throw, commercial.ts:66).
  - **부담부증여(§159)·재개발** — 겸용 진입 자체가 배타이나 방어 확인.

## 7. 완료 정의

anchor GREEN + 전체 회귀 0 + tsc 0 + lint 0 + 14지점 self-grep + ~~KoreanLaw 원문 검증~~✅완료(§1) + `.engine.design.md`·`.ui.design.md` 생성✅("대" 규모 — 엔진 input 변경). **Do 진입 전 잔여: D(필요경비)·R-D(Case A/공익수용/용도변경 범위 가드) 확정**(R-A 법령은 해소).
