# 겸용주택 신고서 양식 — 주택분·상가분을 토지/건물로 4분할 표시 (계획서)

## 0. 요약 (한 줄)

겸용주택 결과뷰의 "신고서 양식" 표에서 현재 **합계 / 주택부분 / 상가부분 (3열)** 을
**합계 / 주택분 토지 / 주택분 건물 / 상가분 토지 / 상가분 건물 (5열)** 로 확장한다.
**엔진 변경 0 — 순수 UI(표시) 변경.** 엔진이 이미 4분할 값을 계산·노출하고 있고,
동일한 5열 렌더 경로(`fourpart` 모드)가 이미 Case A(용도변경)용으로 존재하기 때문이다.

---

## 1. 배경 · 현황 (실측 근거)

### 1.1 표를 그리는 컴포넌트

- 겸용주택 결과뷰 컨테이너: `components/calc/results/mixed-use/MixedUseResultCard.tsx`
  - 신고서 양식 표 호출: `MixedUseResultCard.tsx:421-446` — 공용 `<FilingFormTable result={mixedFilingResult} />`
  - 어댑터: `mixedUseToFilingResult(breakdown)` (`MixedUseResultCard.tsx:24-53`) — `MixedUseGainBreakdown`을 `TransferTaxResult`로 감싸 `mixedUseDetail` 필드에 실어 전달.
- 실제 표 렌더: `components/calc/results/transfer/FilingFormTable.tsx:19-196`
  - 헤더/바디는 `columns.map(...)`로 **열 개수 비의존** 렌더 (`FilingFormTable.tsx:121-190`).
  - 표 폭 자동: `tableLayout: fixed`, 항목열 160px + 데이터열당 130px (`FilingFormTable.tsx:118-124`). → 5열도 그대로 수용(가로 스크롤은 부모 래퍼가 처리).

### 1.2 컬럼 결정 로직 — `deriveColumns()`

`components/calc/results/transfer/FilingFormTableHelpers.ts:130-259`

- 일반 겸용주택(용도변경 없음·Case B·period-split 포함): `mixed-2col` 분기 (`:237-246`)
  ```
  [ {total,"합계"}, {housing,"주택부분"}, {commercial,"상가부분"} ]
  ```
- **★ Case A(용도변경, 최초공시일 < 용도변경일 = 건물 전체가 취득시 주택)**: 이미 `fourpart` 5열 모드 존재 (`:225-236`)
  ```
  [ {total,"합계"}, {housingLand,"토지(주택분)"}, {housingBuilding,"주택"},
    {commercialLand,"토지(기타분)"}, {commercialBuilding,"기타건물"} ]
  ```
  활성 조건: `mu.partialUsageChange?.phdScopeBranch === "case_a_whole_building"`.

### 1.3 엔진 result — 4분할 값 **이미 존재**

`MixedUseHousingPart` / `MixedUseCommercialPart` (`lib/tax-engine/types/transfer-mixed-use.types.ts:153-225`) 두 타입 모두
아래 토지/건물 분리 필드를 **일반 케이스에서도** 보유한다 (Case A 전용 아님):

| 필드 | 의미 |
|---|---|
| `landTransferPrice` / `buildingTransferPrice` | 토지·건물 양도가액 |
| `landAcqPrice` / `buildingAcqPrice` | 토지·건물 (환산)취득가액 |
| `landAppraisalDed` / `buildingAppraisalDed` | 토지·건물 개산공제(필요경비) |
| `landTransferGain` / `buildingTransferGain` | 토지·건물 양도차익 |
| `longTermDeductionAmount` | 부분 장기보유공제(주택/상가 단위) |
| `incomeAmount` / `proratedTaxableGain` | 부분 양도소득금액 / 12억 안분 과세대상 |

산출 위치: `lib/tax-engine/transfer-tax-mixed-use-helpers.ts:394-432`(주택분 STEP4), `:436-` (상가분 STEP7),
period-split 경로 `transfer-tax-mixed-use-period-split.ts:249-315`(housingPart/commercialPart 조립 — `landTransferGain: housingGainSplit.landGain` 등 `:255-280`), Case A `transfer-tax-mixed-use-fourpart.ts`.

### 1.4 렌더 채움 함수 — 4분할 로직도 **이미 존재**

`components/calc/results/transfer/FilingFormTableFinancials.ts`

- `fourPartFinancials(hp, cp, setNum)` (`:9-55`) — `MixedUseHousingPart`/`CommercialPart`에서 토지/건물 4열을 직접 채움.
  - 12억 비과세 안분: `housingExemptRatio = hp.proratedTaxableGain / hp.transferGain`를 토지·건물에 각각 적용 (`:30-38`).
  - 장기보유공제·양도소득금액: `landTransferGain / transferGain` 비율로 토지·건물 안분 (`:39-54`).
- `mixedTwoColFinancials(hp, cp, setNum)` (`:57-80`) — **동일한 타입**을 받아 토지+건물을 합산해 2열로 표시 (`:62` `hp.landTransferPrice + hp.buildingTransferPrice`).

→ 즉 `fourPartFinancials`는 일반 겸용주택의 `housingPart`/`commercialPart`에 그대로 적용 가능하다(같은 타입·같은 필드).

### 1.5 데이터 채움 분기 — `buildRows()`

`FilingFormTableHelpers.ts` 내 4곳이 `mode === "fourpart"`를 분기 처리:

1. 날짜·보유기간·거주기간 문자열 per-열 (`:457-478`) + `fourPartFinancials` 호출 (`:478`)
2. 합계 취득가액·필요경비 (`:527-531`)
3. 장기보유공제 보유/거주 분리 per-열 (`:602-618`)
4. (합계 양도차익·과세대상·양도소득금액 등은 `result.*`로 채워짐 — 어댑터가 계산, mode 무관 공용 `:583-651`)

### 1.6 합계열 정합성 (2열 ↔ 4열 동일 보장)

- 취득가액 합계: `landAcqPrice + buildingAcqPrice == estimatedAcquisitionPrice` (helpers `:398-399`에서 `building = est − land`) → 2열·4열 합계 동일.
- 필요경비 합계: 4개 `*AppraisalDed` 합 — mixed-2col(`:534-536`)·fourpart(`:531`) 동일 산식.

---

## 2. 목표 컬럼 구조

| # | key | 라벨(권장) | 데이터 |
|---|---|---|---|
| 0 | `total` | 합계 | `result.*` (어댑터 계산) |
| 1 | `housingLand` | 주택분 토지 | `hp.land*` |
| 2 | `housingBuilding` | 주택분 건물 | `hp.building*` |
| 3 | `commercialLand` | 상가분 토지 | `cp.land*` |
| 4 | `commercialBuilding` | 상가분 건물 | `cp.building*` |

- **컬럼 키는 Case A `fourpart`와 동일 재사용**(`housingLand`/`housingBuilding`/`commercialLand`/`commercialBuilding`)
  → `fourPartFinancials`가 그대로 동작. **모드 이름만 신설**해 라벨을 분리한다.
- 부제(subtitle) "양도소득세 신고서 항목별 자산-분할 계산 내역"은 유지.

---

## 3. 설계 결정 (Decision Points)

### D1. 2분류 완전 대체 vs 토글 유지 — **권장: 완전 대체**

사용자 요청("2분류를 … 토지 건물을 분리")은 대체를 의미. 일반 겸용주택 결과뷰에서
`mixed-2col`을 폐지하고 `mixed-4col`로 전환. (토글 옵션은 요청 범위 밖 — Simplicity First.)

- 근거: Case A는 이미 5열이므로, 일반 케이스도 5열로 맞추면 겸용주택 신고서 표가 **일관**된다.

### D2. 컬럼 순서 — **✅ 확정: 토지 → 건물** (`주택분 토지, 주택분 건물, 상가분 토지, 상가분 건물`)

- 사용자 확정(2026-07-14). 기존 Case A `fourpart` 토지-우선·신고서 실무 관행(토지·건물 순 기재)과 일치.
- 채움 함수는 key 기반이라 순서와 무관 → `deriveColumns` 컬럼 배열 순서만으로 결정.

### D3. 새 모드 이름 — `mixed-4col`

`ColumnMode` 유니온에 `"mixed-4col"` 추가. Case A의 `"fourpart"`는 **손대지 않음**(라벨·의미 상이: "주택"/"기타건물" vs "주택분 건물"). 두 모드가 동일 컬럼 키·동일 채움 로직을 공유.

### D4. 장기보유공제 per-열 표기 유지

`fourpart` 경로(`:602-618`)가 보유기간분/거주기간분 장특을 토지·건물로 안분해 이미 채운다. mixed-4col도 이 경로 재사용 → 별도 작업 없음.

### D5. 열별 장특·양도소득금액은 **UI측 비율 안분값**(엔진 미노출 — 투명성 명시)

엔진은 주택분/상가분 **단위**의 `longTermDeductionAmount`·`incomeAmount`만 노출(토지/건물 분리 미노출).
따라서 토지·건물 열의 장특·양도소득금액은 `fourPartFinancials`(`Financials.ts:39-54`)가
`landTransferGain / transferGain` 비율로 `Math.floor` **표시 분해**한 값이다(엔진 세액 재계산 아님 → dual-truth 아님, `feedback_ui_engine_dual_truth_avoidance` 취지 부합).
- degenerate(`transferGain ≤ 0`) 시 비율 `0.5` fallback(`:39·:41`) — 기존 fourpart 동작 승계.
- 세액(과세표준·산출세액 이하)은 **합계열 단독**(부분 합산 계산) → 열별 안분 없음, 왜곡 없음.

---

## 4. 변경 지점 (파일별)

> 전부 `components/calc/results/transfer/` UI 레이어. **엔진·타입·API·store·validation 변경 없음.**

### C1. `FilingFormTableHelpers.ts` — `ColumnMode` 타입

- `"mixed-4col"` 유니온 멤버 추가. `ColumnMode` 정의: `FilingFormTableHelpers.ts:119` (`export type ColumnMode =`).

### C2. `FilingFormTableHelpers.ts:237-246` — `deriveColumns` 일반 `mu` 분기

- 기존 `mixed-2col` 반환을 `mixed-4col` 5열 반환으로 교체:
  ```ts
  if (mu) {
    return {
      mode: "mixed-4col",
      columns: [
        { key: "total", label: "합계" },
        { key: "housingLand", label: "주택분 토지" },
        { key: "housingBuilding", label: "주택분 건물" },
        { key: "commercialLand", label: "상가분 토지" },
        { key: "commercialBuilding", label: "상가분 건물" },
      ],
    };
  }
  ```
  (Case A 분기 `:225-236`는 그 위에 있으므로 우선순위상 그대로 유지됨.)

### C3. `FilingFormTableHelpers.ts` — `buildRows` 채움 분기 3곳 확장

`mode === "fourpart"` 조건을 `(mode === "fourpart" || mode === "mixed-4col")`로 확장 (컬럼 키 동일):

- `:457` 날짜·보유·거주 per-열 + `fourPartFinancials` 호출
- `:527` 합계 취득가액·필요경비
- `:602` 장기보유공제 보유/거주 per-열 안분
- ✅ **실측 확정**: `mixed-2col`은 `deriveColumns` 내 유일 생산 지점(`:237-246`)을 mixed-4col로 교체하면 **완전 unreachable**(다른 생산자 없음). 따라서 `:479`·`:532`·`:619`의 `mixed-2col` 채움 3개 분기 + `mixedTwoColFinancials`(`Financials.ts:57-80`) 모두 **dead code 확정**.
  - 처리 방침: **함께 제거**(unreachable dead 즉시 정리 — 사용자 요청 변경에 직접 수반되는 고아 정리라 `Surgical Changes` 원칙상 허용). `ColumnMode`에서 `"mixed-2col"` 멤버도 제거. 단 제거 전 `grep -rn '"mixed-2col"\|mixedTwoColFinancials'`로 잔여 참조 0 재확인.

### C4. `FilingFormTable.tsx` — 렌더 (✅ 변경 불필요 확정)

- 실측: `mode`는 `deriveColumns` 반환(`:34`) → `buildRows`로 전달(`:41`)될 뿐, `FilingFormTable.tsx` 렌더는 `columns.map`만 하고 `mode` 분기 없음. 열 개수 비의존 → **변경 없음**.
- `deriveColumns` 호출처는 `FilingFormTable.tsx:34` **단 1곳**(전 세목 공용 표에서 재사용되나 `mu`(mixedUseDetail) 존재는 겸용주택 어댑터만 생성) → mixed-4col 전환은 겸용주택 신고서 표에만 영향.

---

## 5. 14 동기화 지점 해당성

**엔진 input/result 미변경 → 대부분 무관.** 표시 계층만 변경.

- ①폼 ②initial ③normalize ④API ⑥사이드바 ⑧validation ⑨~⑭(Zod·route) — **무관**.
- ⑤UI 위젯 — 무관(입력 아님).
- **⑦결과 카드 산식·표시 — 유일 해당**: 신고서 양식 표 컬럼 확장.

→ `tax-field-add` 스킬의 14지점 전수 점검 **불요**. UI-only 회귀 위험만 관리.

---

## 6. 검증 (Goal-Driven)

### 6.1 Pre-Do anchor (권장 — 도달성·정합 우선 검증)

`__tests__` 또는 컴포넌트 단위로 `deriveColumns`·`fourPartFinancials`를 직접 호출해:

1. **anchor-A (컬럼)**: 일반 겸용주택 `MixedUseGainBreakdown`(partialUsageChange 없음)으로 `deriveColumns` → `mode === "mixed-4col"`, 컬럼 5개, 라벨 검증.
2. **anchor-B (합계 정합 — 정확-합 행)**: 아래 행은 4열 합 == 합계열 **정확 일치**(floor 안분 없음):
   - `transferPrice`: `housingLand+housingBuilding+commercialLand+commercialBuilding == totalTransferPrice`
   - `acquisitionPrice`: 4열 합 == 2열 시절 합계(`estimatedAcquisitionPrice` 합, `landAcqPrice+buildingAcqPrice==estimatedAcquisitionPrice` 정합 `helpers:398-399`) — **회귀 불변** 검증.
   - `expenses`(개산공제 4개 합)·`transferGain`(land+building=part.transferGain) 정확 일치.
3. **anchor-C (안분 자기일관 — 1원 tolerance 행)**: `taxableGain`·`ltDeduction`·`ltHoldingPart`·`incomeAmount`는 `fourPartFinancials`가 **열별 독립 `Math.floor` 안분**(`Financials.ts:31·43·47`)이라 4열 합이 합계와 **∓1~수원** 차 가능(잔액 미흡수).
   - 판정: `|4열 합 − 합계열| ≤ 열 수(4)` 원 이내(프로젝트 1원 tolerance 정책 `bigint-round-half-up`).
   - 합계열은 `result.*`(주 계산과 동일 소스)이 authoritative — 열 합이 아님(`feedback_engine_result_display_drift` 부합).
   - 부분 내부 자기일관: 주택 `taxableGain(토지)+taxableGain(건물) ≈ proratedTaxableGain`, 장특 `토지+건물 ≈ longTermDeductionAmount`(floor tolerance).

### 6.2 케이스 매트릭스 (전수 — 단순→복잡)

| 케이스 | partialUsageChange | 기대 모드 | 비고 |
|---|---|---|---|
| 일반 겸용(용도변경 없음) | 없음 | mixed-4col | 주 대상 |
| Case B(주택만) | `case_b_housing_only` | mixed-4col | 동일 4분할 데이터 |
| period-split(용도변경일 LTHD 안분) | 있음(non-Case-A) | mixed-4col | 장특 period-split 후 토지/건물 재안분 — **anchor로 값 확인** |
| 상가→주택(`commercial_to_house`) | 있음 | mixed-4col | 취득시 분리값 fallback(helpers `:377-380`) 존재 확인 |
| Case A(건물전체 주택) | `case_a_whole_building` | **fourpart(불변)** | 기존 유지 |

### 6.3 회귀·통합

- 기존 엔진 회귀 전량(`npx vitest run __tests__/tax-engine/transfer-tax/`) — 엔진 무변경이므로 그린 유지.
- `npx tsc --noEmit` 0건.
- **브라우저 수동 확인**: 겸용주택 계산 → 결과 → "신고서 양식" 5열 표시, 합계 = 4열 합, 과세표준 이하 합계열만(현행과 동일 "−" 패턴).
- E2E: 기존 `mixed-use-*.spec.ts`에 신고서 양식 컬럼 셀렉터가 "주택부분"/"상가부분"을 assert하는지 grep — 있으면 셀렉터 갱신(§8 미결 3).

---

## 7. 리스크

- **R1 (낮음)**: period-split 케이스에서 `longTermDeductionAmount`가 이미 기간 안분된 값 → 토지/건물 재안분이 이중 안분처럼 보일 수 있음. 실제로는 `landTransferGain` 비율 곱이라 **부분 내부 분배**일 뿐 총액 불변. anchor-C로 확정.
- **R2 (낮음)**: 5열 폭으로 모바일 가로 스크롤 증가. 기존 Case A가 이미 5열이므로 신규 문제 아님.
- **R3 (해소)**: `mixed-2col` dead code는 §4 C3대로 **함께 제거**(unreachable 확정).
- **R4 (낮음·한계 명시)**: 신고서의 **취득일자·보유기간 행**은 열 4개 모두 **단일 asset 취득일**(`fourpart :464-471`)로 표기. 일반 겸용주택은 토지·건물 취득일이 다를 수 있고(`helpers:317-323`에서 `landHoldingYears`≠`buildingHoldingYears`로 장특 표가 갈릴 수 있음) 엔진은 그 값으로 계산하나, `MixedUseHousingPart`에 **per-part 보유연수 미노출** → 표는 열별로 다른 취득일/보유기간을 못 보인다. 정확 per-part 표기는 엔진 result 필드 추가(대 규모·14지점)가 필요 → **본 계획 범위 밖**(현행 fourpart 한계 그대로 승계). 세액은 엔진이 정확 산정하므로 표시 한계일 뿐.

---

## 8. 미결 (사용자/실측 확인 필요)

1. ~~컬럼 순서·라벨~~ — ✅ 확정: "주택분 토지 / 주택분 건물 / 상가분 토지 / 상가분 건물"(토지-우선, 2026-07-14).
2. ~~`mixed-2col` 존치 여부~~ — ✅ 실측 해소: `deriveColumns` 호출처 1곳·`mu` 생산자 겸용주택 어댑터뿐 → mixed-4col 전환 시 완전 dead. **함께 제거**(§4 C3).
3. **E2E/anchor에서 "주택부분"/"상가부분" 문자열 assert 유무** — Do 진입 전 `grep -rn '주택부분\|상가부분' __tests__ e2e` 로 셀렉터 갱신 대상 목록화(신고서 표 컨텍스트 한정).
4. **상세명세서(DetailedCalculationStatementCard) 정합** — `MixedUseResultCard.tsx:448-` 의 상세명세서 카드는 별개 표시. 신고서 표만 4분할하고 명세서는 현행 유지할지, 함께 손댈지 범위 확인(본 계획은 **신고서 양식 표 한정**).

---

## 9. 결론

- **작업 성격**: UI-only, 엔진·타입·API 변경 0. 신규 코드 대부분이 기존 `fourPartFinancials`/`fourpart` 분기 **재사용**.
- **예상 변경량**(`FilingFormTableHelpers.ts` + `Financials.ts`): ① `deriveColumns` 일반 `mu` 분기 mixed-4col 교체 ② 채움 분기 3곳(`:457·:527·:602`) `mixed-4col` 조건 추가 ③ `ColumnMode` `"mixed-4col"` 추가·`"mixed-2col"` 제거 ④ dead 분기 3곳 + `mixedTwoColFinancials` 제거. **신규 계산 로직 없음.**
- **핵심 검증**: 정확-합 행(양도가액·취득가액·필요경비·양도차익) 4열 합=합계 **정확 일치**(회귀 불변) + floor-안분 행(과세대상·장특·양도소득금액) 1원 tolerance 자기일관(anchor-A/B/C).
- **표시 한계(R4)**: 취득일자·보유기간은 열별 단일 표기(per-part 보유연수 엔진 미노출) — 세액 정확성과 무관한 표시 한계.
