# 일반건물(general_building) 상속 취득가액 엔진 정합 수정 계획서

> 상태: **STEP 1~4 자가검토 완료(fork 3-way + KoreanLaw) · Q1·Q2 해소 · 설계문서(STEP 5·12) 생성 전 · Do 미착수**
> 선행: 겸용주택 상속 취득가액 수정([[transfer-mixed-use-inheritance-acquisition.plan.md]] · PR#710)과 **동일 클래스 버그**. 감사 근거: memory `project_transfer_special_engine_inheritance_acquisition_bugs`.
> 방향: **엔진 정합**(B) — 사용자 확정 "일반건물 먼저"(2026-07-20).

## §1. 문제 정의 (실측 확증)

일반건물(토지+건물 일괄)을 **상속**으로 취득해 양도 시, 취득가액을 §163⑨(상속개시일 평가액을 실지거래가액으로 의제)이 아니라 **환산 또는 0**으로 계산해 세액이 틀린다. 겸용주택 버그와 동일 뿌리이나, GB는 **상속개시일 평가액 입력 UI 자체가 없고**(건물분), 엔진이 사용자 상속 평가액을 **소비하지 않는다**.

### 근본 원인 — 별도 dispatch가 메인 상속 STEP 우회
- `app/api/calc/transfer/route.ts:715~761`: `propertyType === "general_building"`이면 `dispatchGeneralBuilding` 호출 후 **즉시 `return NextResponse.json`(:749)**.
- 메인 오케스트레이터 `calculateTransferTax`(route.ts:780)를 **타지 않음** → 그 안의 **STEP 0.45 `runInheritedAcquisitionStep`**(`lib/tax-engine/transfer-tax.ts:126`, 상속개시일 평가액을 `acquisitionPrice`로 override)가 **실행되지 않음**.
- 대조: 재개발은 route.ts:380에서 engineInput에 주입 후 :780 메인 경로로 흘러 STEP 0.45 적용됨(그래서 CLEAN, PR#710 감사 확인).

### GB 엔진·라우트헬퍼는 상속 평가액을 미판독
- `general-building-valuation.ts`·`general-building-route-helper.ts`에 `inheritanceValuation`/`publishedValueAtInheritance` read **0건**(grep).
- 상속 취득원인은 **단기보유 기산점(§95④ 피상속인 취득일)에만** 사용: `general-building-valuation.ts:697`, 라우트헬퍼 `buildProperties`(`:135~159` `acquisitionCause`·`decedentAcquisitionDate` 패스스루).

### 두 실패 경로 (모두 실측)
GB API 변환 `buildGeneralBuildingValuation`(`lib/calc/transfer-tax-api-helpers.ts:281~402`)이 두 모양 산출:

**경로 A — 환산 모드** (`useEstimatedAcquisition || gbHasExtension`, api-helpers:308)
- 취득시 기준시가(`acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`) + `estimatedDeductionRate: 0.03` 포함(:317~322) → `calculateGeneralBuildingTransfer`(route-helper:382)가 `buildGeneralBuildingAssetCards`로 **토지·건물 환산 + 개산공제 3%**.
- 도달: 토지(primary 자산)=매매(`useEstimatedAcquisition` 접근 가능) + 건물 취득원인=상속(독립 선택, GeneralBuildingAcquisitionCards.tsx:44). 실무 흔한 "토지 매매·건물 상속".
- 결과: 건물 상속분을 환산(양도가 스케일)으로 산정 + §163⑥ 개산공제 오적용 → §163⑨·§97②2호 위반.

**경로 B — 실거래가/actual 모드** (`actualPriceMode: true`, api-helpers:387)
- `calculateGeneralBuildingActualTransfer`(route-helper:435)가 `actualAcquisitionPrice`를 §166⑥ 비율로 토지·건물 안분 — **환산·개산공제 없음(구조는 §163⑨ 정합, `estimatedDeduction:0` route-helper:541·549·556·563)**.
- 그러나 취득가 소스 = route.ts:720 `bundledAcq = gbv.bundledAcquisitionPrice ?? engineInput.acquisitionPrice ?? 0`.
  - 순수 actual 모드(api-helpers:382~401)는 `bundledAcquisitionPrice`를 **미설정**(오직 `gbHasExtension` 분기 :344~346만 설정).
  - `engineInput.acquisitionPrice`는 상속 시 0 — `fixedAcquisitionPrice`가 **purchase(actual)/gift/newConstruction만** 채움(api-helpers:564~567). 상속은 `publishedValueAtInheritance`/`inheritanceValuation`로만 가는데(:551) GB 미판독.
  - → **취득가 0 → 양도가 전액 과세**(명백한 세액 과대).
- ⚠️ 근본은 "입력 부재"가 아니라 **단절**: 토지 상속 평가액은 `CompanionAcqInheritanceBlock`(GeneralBuildingAcquisitionCards.tsx:186)로 입력되나 `inheritanceValuation`으로만 흘러 GB 경로와 연결 안 됨. GB 취득가는 `bundledAcquisitionPrice ?? engineInput.acquisitionPrice`(둘 다 0)에서만 온다.
- 도달: 토지(primary)=상속 → 환산 토글 미노출(obs 13403 "상속 시 useEstimatedAcquisition 접근 불가"·정확 게이트 조건은 설계서 확인) → actual 모드.

### UI 현황
- 건물 취득원인 라디오에 상속 포함(`GeneralBuildingAcquisitionCards.tsx:44`), 토지도(:36). validation·Zod 허용.
- 토지(primary) 상속: `CompanionAcqInheritanceBlock`(:186)로 보충적평가(개별공시지가·`publishedValueAtInheritance`) 입력 O — 단 GB 엔진 미소비.
- **건물 상속 평가액 입력: 미구현**(:279 "건물 상속·증여 보조 입력은 후속 PR에서 구현 · 본 PR 스코프 미포함").

## §2. 법령 근거 (KoreanLaw 검증 완료 — 소득세법 시행령 MST 286211, 시행 20260701)

- **§163⑨ 본문**: 상속·증여 자산 = "상속개시일 현재 상증법 §60~66 평가액을 취득당시 **실지거래가액으로 본다**"(§97①1가목). → 환산 아님. (겸용 PR#710에서 소득세법 시행령 MST 286211로 검증 완료)
- **§163⑥ ↔ §97②2호**: 개산공제(취득기준시가 × 3%)는 환산취득가(나목) **전용** → 상속(가목) 미적용.
- **§163⑨1호(토지)·2호(건물)** — ✅KoreanLaw 원문 확인(MST 286211, 시행일 20260701): 미공시 상속 **토지**(1990.8.30 개별공시지가 고시 전) = max(상증법 평가액, §164**④**); 미공시 상속 **건물**(건물기준시가 고시 전) = max(상증법 평가액, §164**⑤~⑦**). Phase 1은 **공시된 정상 케이스(§163⑨ 본문 직접)** 처리, 미공시 max는 Phase 2/설계 확정(Q2).
- **§166⑥** — ✅**Q1 해소(원문)**: "토지와 건물 등의 가액의 구분이 **불분명한 때에는**" 부가세법 시행령 §64①로 안분. 상속은 §163⑨로 **토지·건물 각각 상속개시일 평가액이 별도 명확**(구분 불분명 요건 **미충족**) → **§166⑥ 안분 대상 아님**. **결론: 취득가액은 자산별 상속평가액 직접 배정**(번들 안분 X). **양도가액만** §166⑥ 안분(양도시 기준시가 비율) 유지.
- **1985.1.1 의제취득일 환산 예외의 근거는 §176조의2④**(§163⑨ 아님 — §163⑨ 원문엔 1985 없음). 정상 케이스(공시된 post-1985 상속)는 §163⑨ 본문 직접. pre-1985 상속은 Phase 2/기존 환산 fallback으로 격리(회귀-safe). GB에 1985 게이트 실측 0건(겸용과 동일).

## §3. 정답 참조 (안전 구현)
`lib/tax-engine/inheritance-acquisition-price.ts` `calcPostDeemed`(:141): post-deemed 상속=상속개시일 평가액 직접 반환·환산/개산공제 없음, 미공시 주택만 max(신고가,§164⑦). 단건 엔진이 STEP 0.45로 사용. GB 수정은 이 로직을 **GB 별도 경로에 이식**(또는 재사용).

## §4. 수정 방향 (개요 — 상세는 설계문서)

핵심: **상속 취득 GB의 취득가액 = 상속개시일 평가액 직접(토지분·건물분 각각), 환산·개산공제 미적용.** 경로 B의 "실거래가 안분(환산·개산공제 없음)" 구조가 이미 §163⑨ 정합에 가까우므로, **상속 평가액을 GB 취득가 소스로 배선**하는 것이 골자.

### 유력 최소경로 (설계 착점 — 경로 B 재사용)
경로 B(`calculateGeneralBuildingActualTransfer`)는 **이미 §163⑨ 정합 구조**(환산·개산공제 없이 §166⑥ 안분·`estimatedDeduction:0`). 따라서 **신규 엔진 분기를 만들 필요가 없을 가능성** — 상속 평가액을 GB 취득가 소스로 배선하고 상속 시 actual 모드를 강제하면 정합. 겸용 수정(별도 leaf·resolve 3함수) 대비 훨씬 작게 끝날 수 있음(Simplicity First). 단 아래 **자산별 배정 정밀도**(Q1) 확정 후 최종 결정.

1. **입력(⑤)**:
   - **건물 상속 평가액**: amber 건물카드(`GeneralBuildingAcquisitionCards.tsx:225~280`, 현재 :279 미구현)에 상속개시일 건물 평가액 입력 위젯 신설 — 신고가 `CurrencyInput` + (§163⑨2호 미공시) 건물기준시가. 겸용 `MixedUseAssetMajorStdPrice`(:50·142 "상속개시일" 라벨·신고가 override) 패턴 차용.
   - **토지 상속 평가액**: **신규 토지 UI 신설 금지(dual-truth 회피)** — 토지(primary)=상속이면 기존 `CompanionAcqInheritanceBlock`(:186)의 `publishedValueAtInheritance`(토지 개별공시지가)를 재사용, 토지 평가액 = 개별공시지가 × **gbLandArea**(GB 전용 면적·표준 landArea 아님).
   - **3중 동일 fallback**: UI display ↔ API(④) ↔ validate(⑧)([[mirror-pattern]]·useEffect→store 미러링 금지).
2. **API 변환(④)**: 상속 GB 시 `buildGeneralBuildingValuation`(api-helpers:281)에 상속개시일 토지·건물 평가액을 **명시 2필드**로 전달(예: `inheritedLandValue`·`inheritedBuildingValue` + 게이트 `acquisitionByInheritance`).
   - ⚠️ **기존 `inheritanceValuation`(api-helpers:550~561) 재사용 불가** — 단일자산용 단일값(assetKind·publishedValueAtInheritance·landAreaM2 각 1개)이라 GB의 토지·건물 **2평가액**을 못 실음. GB 전용 신규 2필드 필수(fork 1 #2).
   - `bundledAcquisitionPrice` **침묵 0 fallback 금지**([[feedback_no_silent_apportion_fallback]]) — 미입력은 validate 차단.
3. **엔진 — 배정 방식(Q1) ✅확정 = (b) 자산별 직접배정** (KoreanLaw §166⑥ "구분 불분명" 요건 미충족·§163⑨ 자산별 평가액 명확).
   - 토지 취득가 = 토지 상속개시일 평가액(개별공시지가 × **gbLandArea**, 표준 landArea 아님) · 건물 취득가 = 건물 상속개시일 평가액(건물기준시가/신고가). 각 자산 카드에 직접 배정. 개산공제 0.
   - **번들+§166⑥ 안분은 채택 안 함**: 총취득가(L+B)는 동일하나 토지:건물 split이 양도시 기준시가 비율로 왜곡 → **토지 NBL 중과·토지≠건물 보유기간(상이 LTHD)·상이 세율 도달 시 세액 오차**(fork·KoreanLaw 독립 일치). 최소수정 유혹 있으나 §163⑨ 부정확이라 기각(Simplicity First 트레이드오프 명시).
   - **양도가액**은 §166⑥ 안분 유지(단일 양도가의 토지:건물 구분은 불분명 → 안분 정당).
4. **경로 A 특수처리(토지 매매+건물 상속)**: 환산 토글 ON 시 경로 A 진입 → 토지분 환산 유지·**건물분만 상속 직접배정**(자산별 독립). 최소경로보다 난이도 큼 — 설계서에서 경로 A 상속 도달을 (i) 건물분 상속 직접배정 지원 vs (ii) 상속 자산은 actual 모드로 강제(경로 A 차단) 중 택. Phase 1 범위 확정.
5. **1985 이전 게이트**: `acquisitionByInheritance = acquisitionCause==="inheritance" && acquisitionDate>="1985-01-01"`. pre-1985는 기존 환산 fallback(회귀-safe).
6. **결과 표시(⑦)**: `generalBuildingValuationDetail`(GeneralBuildingOutput)에 상속 echo(`acquisitionByInheritance`·자산별 상속평가액) 추가 → 결과 카드 라벨을 겸용처럼 "상속개시일 평가액(취득가액)"로 분기.
7. **검증(⑧)**: `lib/calc/transfer-tax-validate-gb.ts:100~`에 (a) 상속 GB 시 건물·토지 상속평가액 필수(mirror fallback: override‖기존필드), (b) 경로 A 도달(C2 토지매매+건물상속+환산) 시 상속+환산 조합 처리 정책(§4-4의 (i)/(ii) 결정에 동기화). API/UI 통과 ↔ validate 차단 모순 금지.
8. **사이드바(⑥)**: 상속 GB 취득가액은 환산과 동일하게 **결과 도착 후 노출**(입력 시점 계산 불가 항목 — 0원 표시 회피).
9. **14 동기화 지점**: 클라이언트 8(①폼 `AssetForm` 신규 필드·②initial·③normalize·④api-helpers:281·⑤위젯·⑥사이드바·⑦결과카드·⑧validate) + API/Route 6. 특히 ⑫Zod(`lib/api/transfer-tax-building-schemas.ts:21 generalBuildingValuationSchema`·refines `transfer-tax-schema-refines.ts:52·203`)·⑬body·⑭route(`dispatchGeneralBuilding` 인자·`general-building-route-helper.ts`) — 별도 dispatch라 침묵 strip 위험 높음([[feedback_explicit_prop_mapping_strip]]). 필드별 8+6 도달 경로 표는 설계문서에서 상세.
10. **회귀 격리**: 비상속 GB(매매·증여·신축·부담부증여·증축 사례31~35)는 완전 불변. `acquisitionByInheritance` 게이트로 격리. 상속 성분(토지 or 건물=상속) 포함 조합만 수정 대상.

## §5. 도달 조합 매트릭스 (토지=primary `acquisitionCause` × 건물 `gbBuildingAcquisitionCause`)

토지·건물 취득원인은 **독립 선택**(토지=자산-수준 `acquisitionCause`, 건물=`gbBuildingAcquisitionCause` GeneralBuildingAcquisitionCards.tsx:44). 상속 관련 도달 조합:

| # | 토지 | 건물 | 모드 | 현행 결함 | 수정 취득가 소스 |
|---|---|---|---|---|---|
| C1 | 상속 | 상속 | 경로 B(actual, 환산토글 미노출) | 취득가 **0** | 토지 상속평가액 + 건물 상속평가액 |
| C2 | 매매 | 상속 | 경로 A(환산 ON 시) | 건물 **환산+개산공제** | 토지 환산 유지 · 건물 상속평가액 직접 |
| C2′ | 매매 | 상속 | 경로 B(환산 OFF) | 건물분 `bundledAcq` 안분(상속평가액 무반영) | 건물 상속평가액 반영 |
| C3 | 상속 | 매매/신축 | 경로 B | 토지분 취득가 **0**(건물분만 fixedAcq?) | 토지 상속평가액 · 건물 기존경로 |

(비상속: 토지·건물 모두 매매/증여/신축 = 현행 정상, 회귀 격리 대상.)

## §5-b. 열린 질문 (설계에서 해소)
- **Q1 ✅해소**(§166⑥ 원문·§163⑨): **자산별 직접 배정** 확정(§4-3). 취득가=자산별 상속평가액 직접, 양도가만 §166⑥ 안분.
- **Q2 ✅해소**(§163⑨1·2호 원문): 미공시 토지=max(평가액,§164④)·건물=max(평가액,§164⑤~⑦). **Phase 1은 공시 정상 케이스만**(§163⑨ 본문 직접), 미공시 max는 Phase 2. (겸용은 주택 §164⑦; GB 건물은 §164⑤~⑦ 준용 — 조문 확인 완료)
- **Q3**: C2(토지 매매+건물 상속, 경로 A) — 건물분 상속 직접배정 지원 vs 상속 자산 actual 강제(경로 A 차단). Phase 1 범위.
- **Q4**: C3(토지 상속+건물 매매/신축) — 토지분만 상속평가액, 건물분 기존 `fixedAcquisitionPrice`/신축비용 경로. 혼합 배선.
- **Q5**: 부담부증여·NBL·용도변경(사례35)·증축(사례33)과 상속 조합 — Phase 2 throw 가드 범위.
- **Q6**: 상속 평가액 입력 UI를 기존 겸용 `MixedUseAssetMajorStdPrice` 패턴/신규 카드/`CompanionAcqInheritanceBlock` 연동 중 어느 것으로.

## §6. Pre-Do anchor (P0 — 설계 후 실측 예정)
현행 GB 상속 케이스 2종 throwaway probe로 baseline 확정:
- 경로 B(토지·건물 모두 상속): 취득가 0 → 양도차익 = 양도가 전액(과대) 확인.
- 경로 A(토지 매매+건물 상속, 환산): 건물 환산취득가 + 개산공제 실측값.
- direct golden(상속개시일 토지·건물 평가액 직접)과 대비해 세액 차이·방향 단정. anchor 파일은 신규 타입 참조라 Do에서 생성(tsc 차단 회피).

## §7. 범위 밖 (별도)
- 상가건물 상속 버그(같은 감사 CONFIRMED, 별도 후속 — 사용자 "일반건물 먼저").
- 재개발 pre-1985 극소 코너(감사 관찰).
- 메모리 `project_general_commercial_building_estimated_swap_unplumbed_open`(§97② swap 미플럼) — 같은 뿌리 다른 결함, 본 수정과 독립.

---
관련: [[project_transfer_special_engine_inheritance_acquisition_bugs]] · [[transfer-mixed-use-inheritance-acquisition.plan.md]] · [[mirror-pattern]] · [[feedback_no_silent_apportion_fallback]] · [[feedback_explicit_prop_mapping_strip]]
