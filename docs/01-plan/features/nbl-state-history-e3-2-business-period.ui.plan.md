# 기타토지 상태 이력 E3-② 「업종 개시·폐업(과세기간별 수입금액)」 — 화면·클라이언트(①~⑧) 계획서

> 상태: **Plan v1 → UI 구현 완료(2026-11-23 — 하단 «구현 기록 (UI)»가 본문과 다르면 그쪽이 정본)** · 계획 당시: Plan v1 (코드 변경 0 · 사용자 결정 대기 — UQ-1~UQ-11)
> 범위: 통합 계획서 E3 후속 목록 ② — 주차장운영업·광천지·양어장·블록제조업 등 **수입금액비율 업종**(영 §168의11①2호다목·10·11다·12호)을 **소유기간 중 개시했거나 폐업한 경우**(엔진 계획서 M9·M10·M11 — `nbl-other-land-state-history.engine.plan.md:403-405`)를 입력받아 판정에 쓰는 화면. 현행 UQ-3(`nbl-other-land-state-history.ui.plan.md:472`)이 «과세기간별 수입금액이 필요해 v1 제외»로 닫아 둔 항목이다.
> **범위 밖(재제안 금지)**: 건축물 사건·재산세 구분 변경(E3-①·E3-1b 완료) · 철거 후 재산세 한시 지위(E3-⑤) · 주택부수토지(Q-1) · 13호 × 이력 · 과세기준일 접기(V-1 일 단위 확정) · Q-15 (가′) · 「모름」 = 혜택 불성립 + 확인 필요 · 자동 안분 fallback.
> 엔진 쪽은 같은 시각 별도 문서(`nbl-state-history-e3-2-business-period.engine.plan.md`)가 쓴다 — **이 문서의 엔진 모델명·필드명·함수명은 «제안»**이며 어긋나면 메인 세션이 합친다(UV-3).
> 정본: `nbl-other-land-state-history.{plan,ui.plan,engine.plan}.md` · E3-①·E3-1b UI·엔진 계획서(결정·구현 기록).
> 모든 file:line = 워크트리 `Property-related-Taxes-nbl-e3-2`(origin/master 768683e33) grep·Read 실측. **tsc·vitest는 이 세션에서 실행하지 않았다 — 반전 규모는 파일 정독·grep 실측이며 vitest 실측이 아니다(UV-1).**

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 문제 | 수입금액비율 입력은 **양도일 기준 당해·직전 2개 과세기간뿐**이고(`OtherLandDetailSection.tsx:316-378`) 통과하면 소유기간 **전체**를 사업용으로 본다(`other-land.ts:289` `markOwn(trace, fullPeriod)`). 예외 DM-01만 «직전 비율② 미통과 + 개시일 있음»일 때 `[개시일, 양도일)`(`other-land-merge.ts:138-170`). 그래서 ① 직전 비율②까지 통과하면 개시 전 기간도 사업용이 되고(M9 과소) ② **폐업 후 양도는 입력 경로 자체가 없다** — 업종을 고르면 당해 수입금액 > 0이 필수라 ⑧이 막는다(`transfer-tax-validate-nbl.ts:268-271`) |
| **UI 추천 모델** | **(B2) «업종 영위 기간(개시일·폐업일) + 과세기간별 수입금액 표» — 기존 당해·직전 칸과 공존, 개시일은 기존 키 단일 소스, 명시 토글(기본 OFF = 현행 byte-identical).** 건축물 사건 목록(B1)에 새 종류를 더하지 않는다 |
| 추천 근거 3줄 | ① 법문이 «**과세기간별**로 계산»(영 §168의11② — 이 세션 KoreanLaw 조회)이라 연도별 수입금액·토지가액이 필수 입력 — (C)는 안 받은 연도의 통과를 가정한다 ② 신규 입력을 «토글 OFF = 키 부재»로 두면 기존 세션·`nblRevenue*` 16필드 가드·e2e 라벨 단언·compat 스냅샷이 **반전 0**(§8) — (A)는 기존 칸 대체라 수십 건 ③ 사용자가 알고 있는 것(개업·폐업일, 연도별 소득세 신고 수입, 연도별 공시지가)을 그대로 묻는다 — 일수·연환산·비율은 입력받지 않고 미리보기가 보인다 |
| 새 칸(제안) | `nblRevenuePeriodOn: boolean` · `nblRevenueBusinessEndDate: string` · `nblRevenueYearRows: {year,revenue,landValue}[]` — 3개. 개시일은 **기존 `nblRevenueCurrentBusinessStartDate` 재사용** |
| 가장 큰 위험 | ① **폐업 후 2년**(규칙 §83의5①10호)은 이미 «부득이한 사유 유예기간» 10호 칸이 폐업일을 따로 받는다(`GracePeriodSection.tsx:40` · `grace-reason-period.ts:49`) — 폐업일을 두 번 묻는 중복 입력 · ② 개시·폐업 연도 **영위일수 정의가 두 개**(연환산 초일산입 `revenue-test.ts:70-72` vs 기간기준 일 단위) · ③ 과거 연도 **간주임대료율 데이터가 2025-03-21 이후 1행뿐**(`nbl-deemed-rent-rate.ts:25-27`) · ④ 임계 비율에 **연혁 인자가 없다**(`transfer-nbl.ts:291`) |
| ⑥ | 변경 없음 가정 — 이 세션 재확인 미수행(UV-9) |
| ⑫ | **Zod 신규 키 3개 + 행 스키마 추가 필수** — 빠지면 `nbl*` prefix-pick(`non-business-land-request.ts:156-158`)으로 와도 **침묵 strip**(`transfer-tax-schema-nbl.ts` 머리주석 선례) |
| 반전 | **모델 (B2) 예상 0~3**(새 상수·새 칸 덧붙이기만) · (C) 8~10 · (A) ≥ 수십 · (B1) 최대 규모 미측정 — §8 |
| 사용자 결정 | UQ-1(모델) · UQ-2(게이트 방식) · UQ-3(개시일 단일 소스) · UQ-4(폐업 모드와 기존 칸) · UQ-5(표의 범위) · UQ-6(과거 연도 간주임대료·공통수입) · UQ-7(토지가액 입력) · UQ-8(결과 표현) · UQ-9(폐업 후 2년) · UQ-10(영위 기간 1건) · UQ-11(PR 분할) |

---

## 1. 현행 사실 (실측)

### 1.1 입력 칸 지도 (`OtherLandDetailSection.tsx` 446줄 — 수입금액비율 블록 `:281-425`)

| 위치 | 칸 | 스토어 키 | 비고 |
|---|---|---|---|
| `:287-309` | 업종(없음 + 8종) | `nblRevenueBusinessType` | 이 값이 있어야 아래 전부 노출(`:316`) |
| `:318-320` | 당해 과세기간 수입금액 | `nblRevenueCurrentRevenue` | 힌트 «연환산 전 실제 수입금액» |
| `:329-331` | **당해 사업개시일** | `nblRevenueCurrentBusinessStartDate` | 힌트 «당해연도 중 사업을 개시한 경우만 입력…» 이지만 DM-01 판정은 어느 해든 `[개시일, 양도일)`로 쓴다(`other-land-merge.ts:156-157`) — **문구와 동작이 어긋난 기존 사실**(UV-10) |
| `:333-337` | `changed`일 때 «이력과 함께 판정» 고지 | (엔진 상수 `NBL_STATE_HISTORY_REVENUE_START_NOTICE` `nbl-confirm-notices.ts:110`) | Q-15 (가′) |
| `:338-356` | 연환산 미리보기 | — | `deriveCurrentBusinessDays`·`computeRevenueTest` 엔진 헬퍼 직접 호출(`:24`) |
| `:358-366` | 토지가액 자동조회(당해·직전) | `nblRevenueCurrentLandValue`·`nblRevenuePriorLandValue` | `NblLandAutoFetch.tsx:44-` — 조회 연도는 `resolveNblLandValueYears`(`nbl-land-zone.ts:12-28`: 직전 = 전년 12.31. 기준시가의 공시연도) |
| `:367-378` | 당해 토지가액 · 직전 수입금액 · 직전 영위일수 · 직전 토지가액 | `nblRevenuePrior*` | 직전 영위일수는 **일수를 직접 입력**(`:373`) |
| `:381-400` | 간주임대료(당해·직전 보증금·일수) | `nblRevenue*Deposit/RentDays` | 율 해소 `resolveDeemedRentRate`(`form-mapper-helpers.ts:25`) |
| `:403-422` | 공통수입 안분(당해·직전) | `nblRevenueCommon*` | ToggleCard violet |

e2e가 라벨 5개를 `getByText`로 단언한다(`e2e/transfer-nbl-revenue-autofetch.spec.ts:62-72`: 「당해 토지가액 (양도일 기준시가)」·「직전 토지가액」·「당해 과세기간 연환산 (§168의11③3호)」·「당해 사업개시일」·「직전 과세기간 영위일수」) — **라벨을 바꾸면 반전**.

### 1.2 판정 연결 (이 세션 정독)

| 단계 | 사실 | 근거 |
|---|---|---|
| 비율 산식 | `computeRevenueTest` = ①당해 연환산 수입 ÷ 당해 토지가액, ②(당해+직전) ÷ (토지가액 합), `max(①,②) ≥ 기준`이면 통과. 직전은 `priorLandValue`가 있어야 산정 | `revenue-test.ts:147-224` |
| 통과 시 | 개시일이 없거나 직전 ②가 통과면 **`markOwn(trace, fullPeriod)` — 소유기간 전체 사업용**으로 `meetsPeriodCriteria` | `other-land.ts:283-294` |
| DM-01 | 개시일 있음 + ② 미통과일 때만 `periods = [{start: 개시일, end: pjDate}]` | `other-land-merge.ts:138-170` · 입력 타입 `revenue-test.types.ts:22-26` |
| 미통과 | 이 업종으로는 사업용 불인정 — 다음 목(나목·호별)으로 이어짐 | `other-land.ts:259-` 이하 흐름 |
| ⑧ 필수 | 업종 선택 ⇒ 당해 수입금액 > 0 · 당해 토지가액 > 0 필수. 공통수입 ON ⇒ 당해 공통수입·그 밖의 토지가액 필수. 개시일 > 양도일 차단. 직전 수입만 있고 직전 토지가액 없음 차단 | `transfer-tax-validate-nbl.ts:264-299` |
| ⑫ 거울 | 직전 토지가액(DM06) · 개시일 > 양도일만 거울. **당해 필수 규칙은 ⑫에 없다** | `transfer-tax-schema-nbl-refines.ts:146-170` |
| 매퍼 | `buildRevenueTest` — 당해 영위일수·과세연도는 `deriveCurrentBusinessDays(양도일, 취득일, 개시일)` = `max(1.1, 취득일(당해연도), 개시일)`부터 **양도일까지 초일산입** | `form-mapper-helpers.ts:482-535` · `revenue-test.ts:81-95` |
| 이력과의 합성 | 자체 사업기간이 있으면 `markOwn`으로 trace에 기록해 건축물 이력 판정에 넘긴다(Q-15 (가′)) | `other-land.ts:298` · `other-land-state-history-apply.ts` |

### 1.3 법령 본문 확인 (KoreanLaw MCP, 이 세션 2026-11-23 조회 — 소득세법 시행령 MST 290841 · 시행 2026-10-01 / 시행규칙 MST 286379)

- **영 §168의11②**: «…토지의 가액에 대한 1년간의 수입금액의 비율(수입금액비율)은 **과세기간별로 계산**하되, 다음 각 호의 비율 중 큰 것으로 한다. 이 경우 당해 토지에서 발생한 수입금액을 **토지의 필지별로 구분할 수 있는 경우에는 필지별**로 수입금액비율을 계산한다. 1. 당해 과세기간의 연간수입금액 ÷ 당해 과세기간의 토지가액 2. (당해 + 직전 과세기간 연간수입금액) ÷ (당해 + 직전 토지가액)».
- **영 §168의11③**: 연간수입금액 = 1호 사업 수입 + 전세금·보증금 간주임대료(부가가치세법 시행령 §65①) / 2호 공통수입 안분 / **3호 «사업의 신규개시·폐업, 토지의 양도 … 1과세기간 중 당해 토지에서 사업을 영위한 기간이 1년 미만인 경우에는 당해 기간 중의 수입금액을 1년간으로 환산»**.
- **영 §168의11④**: 「당해 과세기간의 토지가액」 = 당해 과세기간 **종료일**(과세기간 중에 양도한 경우에는 양도일)의 기준시가. ⇒ **폐업 연도·과거 연도의 토지가액도 그 해 12월 31일 기준시가**(폐업일 기준이 아니다).
- **규칙 §83의5①10호**: 「거주자가 **2년 이상 사업에 사용한 토지**로서 사업의 일부 또는 전부를 휴업·폐업 또는 이전함에 따라 사업에 직접 사용하지 아니하게 된 토지: 휴업·폐업 또는 이전일부터 2년」 — 기존 유예 사유 `business_closure_relocation`(`GracePeriodSection.tsx:40`)이 사용자 입력 기산일 + 고정 2년으로 구현(`grace-reason-period.ts:49`).
- 확인하지 못한 것: «수입금액»·«사업 신규개시일»의 정의(소득세법상 총수입금액과의 일치 여부) — **문구에서 단정하지 않는다**(UV-2).

### 1.4 데이터 한계 (이 계획의 제약)

| 한계 | 근거 | 영향 |
|---|---|---|
| 간주임대료율 표 = **2025-03-21 이후 1행뿐**(검증 2026-06-29). 그 전 과세기간은 `null` → 엔진이 미적용 경고 | `lib/tax-engine/data/nbl-deemed-rent-rate.ts:25-27,43-49` | 과거 연도(대부분 2025 이전)에 **연도별 보증금 칸을 두어도 엔진이 계산하지 못한다** → UQ-6 |
| 업종 기준비율 함수는 **날짜 인자가 없다** | `legal-codes/transfer-nbl.ts:291` `getNblRevenueThreshold(type)` | 과거 과세기간에 현행 기준비율을 적용한다 — 연혁(규칙 §83의4 개정) 미검증(UV-4) → 엔진 소관이나 화면 문구(기준 N% 표시)에 영향 |
| 토지가액 자동조회는 **2개 연도 고정** | `NblLandAutoFetch.tsx:57-65` | N개 연도 조회는 신규 — vWorld 호출 수·제한 미확인(UV-5) |
| compat 스냅샷이 `revenueTestDetail` **객체 전체**를 고정(20곳) — `undefined` 키도 출력된다 | `__snapshots__/nbl-state-history-compat.anchor.test.ts.snap:72` 등 | 신규 echo는 **키 부재**(`undefined` 키 금지) — 엔진 제약(R-3) |

---

## 2. 사용자 시나리오 — 무엇을 알고 무엇을 모르는가

### 2.1 시나리오

| # | 상황 | 사용자가 아는 것 | 입력(추천 모델) | 현행 결과 방향(엔진 계획서 시료) |
|---|---|---|---|---|
| R1 | 소유 중 **주차장 영업을 개시**해 양도일 현재도 영위(직전 비율② 통과) — M9 | 개업일(사업자등록·영업 시작), 연도별 총수입(종합소득세 신고), 연도별 공시지가 | 토글 ON · 개시일 · 개시 연도~직전 전 연도 표 | 현행 사업용 198,210,000 → 비사업용(개시 전 579일 비사업) — 엔진 계획서 시료 인용(**이 세션 재측정 아님**) |
| R2 | 개시했으나 **직전 비율 미통과**(DM-01 경로) — M10 | 같음 | 같음. DM-01과 같은 일 단위 `[개시일, 양도일)`로 수렴하는 경우 결과 동일 | 현행 비사업용 253,960,000 — 변동 방향 «표에 따라» |
| R3 | 소유 중 개시·**양도 전 폐업**, 지금은 나대지 — M11 | 폐업일(폐업신고), 영위 연도별 수입·토지가액 | 토글 ON · 개시일(또는 비움) · 폐업일 · 영위 연도 전부 표 | 현행 비사업용 253,960,000 → 사업 2,707 · 비사업 944(엔진 시료 — 규칙 §83의5①10호 «2년 이상 사용» 전제 V-7) |
| R4 | 개시·폐업이 **같은 해 1년 미만** | 개시일·폐업일 | 두 날짜. 영위일수는 날짜에서 파생(§168의11③3호 환산은 엔진) | — |
| R5 | 첫 해 비율 미달·2년째부터 통과 | 연도별 수입 | 연도별 통과·미통과가 표에 갈려 보임(**과세기간별**이어야 하는 이유) | — |
| R6 | 과거 연도에 **전세금·보증금 수입**·공통수입 안분이 있었다 | 계약서 | v1 표에 칸 없음(UQ-6) — 안내 | 미반영은 소득 과소 쪽(불리 방향 한계 → 고지) |
| R7 | 중간에 **업종을 바꿨다**(주차장→양어장) · 개시·폐업을 **반복** | 날짜들 | v1 밖(UQ-10) — 토글 ON 불가 안내 + 현행 | 고지 |
| R8 | 개시일·연도별 수입을 **모른다** | — | 토글 OFF 유지 = 현행(양도일 현재 업종을 소유기간 전체에 적용 + 기존 고지) | 현행 |
| R9 | 건축물 이력(`changed`)과 **동시** | 둘 다 | 두 블록 독립 입력 — 합성은 엔진(Q-15 (가′)) | 엔진 |

### 2.2 알고 모르는 것 → 칸 설계 원칙

- **아는 것**: 개업·폐업일(사업자 상태·세무서 서류), 연도별 사업 수입(종합소득세 신고의 해당 귀속연도 수입), 연도별 공시지가(공시연도 = 그 해 12.31. 기준시가 — `nbl-land-zone.ts:12-22`), 면적·지분(이미 자산 카드에 있음).
- **모르거나 틀리기 쉬운 것(입력 실수 위험)**: ① **귀속연도 vs 신고연도**(2023년 수입은 2024년 5월 신고) ② 수입금액에 부가가치세 포함 여부·사업장 전체 vs 이 토지분(필지별·공통수입 구분) ③ 개시 연도·폐업 연도의 수입은 **영위한 기간의 실제 수입**(1년 환산 전)을 넣어야 한다 — 기존 칸 힌트와 같은 규칙(`:318`)이나 연도 표에서는 «전체 연도 수입을 넣고 환산을 또 기대»하는 이중 환산 위험 ④ 토지가액에 면적·지분 누락 ⑤ 개시일을 사업자등록 개업일로 넣는 것과 실제 영업 시작일의 차이(UV-2) ⑥ 폐업일 = 폐업신고일 ≠ 실제 영업 종료일.
- **입력 부담**: 영위 연도 수 × 2칸(수입·토지가액). 8개 연도면 16칸 — **토지가액은 일괄 자동조회**(UQ-7)로 절반을 줄이고, 비율·영위일수·환산·통과 여부는 입력받지 않고 미리보기가 보인다. 영위 연도가 직전·당해뿐이면(= 개시가 직전·당해 연도) 표가 비고 기존 칸으로 충분하다(§4.3).
- 사용자가 모르는 것은 **막지 않고 OFF로 두게** 한다(R8) — 단 ON에서 일부 연도만 입력한 상태는 ⑧이 막는다(미입력 = 차단, 0원은 허용).

---

## 3. 엔진 모델 후보별 UI 영향 비교 (UQ-1)

| 후보 | 내용 |
|---|---|
| **(A)** | 과세기간별 수입금액 표 **만** — 사건 없음. 표 행 = 연도, 영위일수 칸으로 경계 연도 표현 |
| **(B1)** | 업종 개시·폐업을 **건축물 사건 목록의 새 종류**(`business_started`·`business_closed`)로 + 연도별 수입금액 |
| **(B2) 추천** | 업종 칸이 있는 수입금액비율 카드 안에 **영위 기간(개시일·폐업일) + 연도별 표** — 사건 목록 불변 |
| **(C)** | 현행 DM-01 확장 — 개시일 + **폐업일**만. 표 없음, 직전·당해 비율을 «마지막 영위 과세기간»으로 재앵커 |

| 비교 | (A) 표만 | (B1) 사건+표 | **(B2) 영위기간+표** | (C) DM-01 확장 |
|---|---|---|---|---|
| 일 단위 구간(V-1) 표현 | ❌ 경계 연도 일수만 알고 «연초부터냐 연말까지냐» 위치를 모른다 → 연 단위 접기를 강요(금지) | ✅ | ✅(개시·폐업 날짜) | ✅ |
| 과세기간별 통과(법문) | ✅ | ✅ | ✅ | ❌ 입력 안 한 연도의 통과를 **가정**(DM-01의 가정을 폐업까지 연장) |
| 신규 필드 | 행 N + 영위일수 | 사건 종류 값 2 + 행 N | **3개**(`PeriodOn`·`EndDate`·`YearRows`) + 개시일 재사용 | 1(`EndDate`) |
| 위젯 변경량(예상 — 미측정) | 새 컴포넌트 ≈ +230 | `OtherLandStateHistorySection.tsx` 355 → ≈ +150 **+** 표 ≈ +230 | 새 파일 2(≈ +180 · ≈ +80) + `OtherLandDetailSection` +25 | `OtherLandDetailSection` ≈ +60 |
| 기존 `revenueTest` 칸과의 관계 | **대체 시** 129줄(14파일) 반전 / 공존 시 중복 입력 | 공존이나 «사건 시각 vs 수입 연도» 이중 입력 | **공존 + 개시일 단일 소스**(§4.3) | 칸 라벨 재앵커 → 라벨 단언 반전 |
| ⑧ 규칙 | 신규 ≈ 6 + 기존 필수 규칙 대체 | 신규 ≈ 8 + 사건 순서 규칙에 종류 2개 추가 | 신규 ≈ 8(§7) · 기존 규칙은 **게이트 추가만** | 신규 ≈ 3 + 기존 필수(당해 수입 > 0) 규칙 조건화 |
| 미리보기 | 연도 표 | 구간표 + 연도 표 두 곳 | 연도 표(미리보기 겸 검증) | 구간 한 줄 |
| 결과 카드 | 새 표 | 구간표 열 + 새 표 | **새 표 1개**(`NblRevenuePeriodTable`) | 기존 `businessStartJudged` 문구 확장 |
| 마이그레이션 | 대체 마이그레이션 필요 | 사건 행 복원에 종류 2개 허용 | **키 부재 = 현행**(③ 3개 필드 채움만) | 키 1개 |
| E2E | 신규 + 기존 대체 | 사건 e2e(132줄 `nbl-other-state-event-` 7파일) 영향 | 신규 1 spec(≈ 5~6건) | 신규 2~3 + 라벨 단언 재작성 |
| «종류가 셋뿐» 침묵 분기 재점검 | 해당 없음 | **필수**(E3-① S1~S13 동형 — 종류가 5종이 되면 13곳 재점검, `building_built\|building_removed\|tax_type_changed` 테스트 33파일 312줄) | 해당 없음 | 해당 없음 |
| 사용자 인지 부담 | 연도·일수 직접 | 사건 + 연도 두 번 | 날짜 2개 + 연도 표 | 날짜 2개 — 가장 낮으나 **판정 근거 약함** |

**UI 관점 추천 = (B2)**, 단 **PR을 개시(영위 중) → 폐업 두 단계로 단계화**(UQ-11). 이유: ① (B1)은 업종 개시가 «건축물 유무 모드»(`nblOtherStateHistoryMode`)와 무관한 사실인데 그 질문 아래로 넣어야 하고(질문이 `changed`일 때만 사건 행이 판정에 쓰인다 — `nbl-other-state-history-scope.ts:39-41`) 수입금액 표를 행에 담을 자리가 없다 ② (A)는 일 단위 판정을 못 만든다 ③ (C)는 «큰 것»·과세기간별 법문을 지키지 못해 입력하지 않은 연도에 혜택을 준다 — 「모름」·미입력 = 혜택 불성립 원칙과 어긋난다. ④ (B2)는 «영향받는 필드 직전» 원칙에 맞게 **업종 선택 바로 아래**에 토글을 둔다.

---

## 4. 화면 스펙 ⑤ (추천 (B2))

### 4.1 레이아웃 — 변경 부분 (ON · 개시 연도 < 직전 연도 예시)

```
┌ §168의11② 수입금액비율 (해당 업종만) ────────────── [§168의11②] ┐   ← 기존 violet 카드(불변)
│ 업종  [ 주차장운영업 (3%) ▾ ]                                     │   ← 불변
│ ┌ 소유기간 중 이 업종을 개시했거나 폐업했습니다 ───────── ( ○ OFF ) ┐│   ← ToggleCard violet · 신규(기본 OFF)
│ │ OFF = 양도일 현재 업종을 소유기간 전체에 적용(현행). 모르면 OFF — ││
│ │ 이 경우 확인 필요로 표시합니다.                                  ││
│ └─────────────────────────────────────────────────────────────────┘│
│  ── ON일 때 ────────────────────────────────────────────────────  │
│ ┌ ① 업종 영위 기간 ────────────────────────────────────────────┐ │   ← ToneCard amber sectionNum=1
│ │ 사업 개시일   [ ____-__-__ ]  hint: 이 토지에서 이 업종을 영위 │ │   ← 기존 `nblRevenueCurrentBusinessStartDate`
│ │   하기 시작한 날. 소유 시작부터 영위했으면 비워 두세요(소유    │ │      FieldCard를 이 자리로 이동(UQ-3)
│ │   시작일부터 영위한 것으로 봅니다).                            │ │
│ │ 폐업일        [ ____-__-__ ]  hint: 양도일 현재도 영위 중이면   │ │   ← 신규 `nblRevenueBusinessEndDate` [PR②]
│ │   비워 두세요. 폐업일이 있으면 아래 당해·직전 칸은 쓰지 않습니다.│ │
│ │ [amber] 폐업 후 2년(규칙 §83의5①10호)은 자동으로 만들지 않습니다 │ │   ← 폐업일 있을 때 · 엔진 상수(R-5)
│ │   — «부득이한 사유 유예기간»에서 10호로 직접 입력하세요.         │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌ ② 과세기간별 수입금액 (직전·당해 과세기간은 아래 칸) ──────────┐ │   ← ToneCard amber sectionNum=2
│ │ [🔍 연도별 토지가액 자동조회]  (명시 클릭 · 빈 행만/전체 덮어쓰기 구분) │ │
│ │ 과세기간  영위일수  연간수입금액(원)    토지가액(원, 12.31.)    │ │   ← 연도·영위일수는 **읽기 전용 파생**
│ │ 2022년    214일     [ ____________ ]    [ ____________ ]        │ │   ← CurrencyInput(공용)
│ │   → 비율① x.xx% · ② 해당 없음 · 기준 3.00% → 충족/미충족          │ │   ← 미리보기(엔진 leaf 호출)
│ │ 2023년(직전)  → 아래 «직전 과세기간 수입금액» 칸에 입력(읽기 전용 행) │ │
│ │ 2024년(당해)  → 위 «당해 과세기간 수입금액» 칸에 입력(읽기 전용 행) │ │
│ │ [amber] 이 표의 수입금액에는 전세금·보증금 간주임대료와 공통수입 안분을│ │   ← UQ-6 (가) 고지
│ │   반영하지 않습니다 — 해당하면 합산해 입력하고 확인 필요           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ── 아래 기존 칸 불변 (당해 수입금액 · 연환산 카드 · 토지가액 · 직전 · 간주임대료 · 공통수입) ──│
```

- **톤**: 토글 = `ToggleCard tone="violet"`(같은 §168의11② 카드 톤 · OFF에도 `bg-violet-50/70` 유지 — `components/calc/CLAUDE.md:134`). 하위 서브섹션 2개 = `<ToneCard tone="amber" sectionNum>`(취득·분리계산 모드 — tone 표 `:118-126`). 기존 카드가 인라인 톤(`border-violet-200 bg-violet-50/40` `OtherLandDetailSection.tsx:282`)이라 **신규는 `ToneCard`만** 쓰고 기존 인라인은 건드리지 않는다(Surgical). 톤 최종 확정은 Do에서 `tones.ts` 재확인(UV-6).
- **375px**: 표는 행마다 세로 스택(연도 · 영위일수 · 수입 · 토지가액 · 판정 한 줄) — `sm:` 이상에서 격자. 가로 스크롤 금지.
- **placeholder 숫자 예시 없음** — 형식 설명은 FieldCard `hint`.

### 4.2 위젯 상세 (신규 `RevenuePeriodSection.tsx` ≈ 180줄 + 행 훅/미리보기 ≈ 80줄 — 모두 예상·미측정)

1. **노출 술어**(단일 소스 `lib/calc/nbl-revenue-period-scope.ts` 신규): `nblRevenuePeriodApplies(asset)` = `nblOtherStateHistoryApplies(asset)`(`nbl-other-state-history-scope.ts:29-31` — 기타토지 · 정밀판정 ON · **연접 다필지 OFF**) ∧ `asset.nblRevenueBusinessType`가 업종. ⑤ 렌더·④ 전송·⑧ 검증이 **같은 술어**(건축물 이력 U1 §2.2 교훈 — 한쪽만 바뀌면 «화면에 없는 칸을 요구하며 영구 차단»). 건축물 이력 모드(`unchanged`·`changed`·`""`)와는 **독립**(업종 개시는 건축물 상태와 별개 사실).
2. **영위 연도 범위**(파생 · `useMemo`): `startYear = year(max(개시일, 소유 시작일))`(개시일 비면 소유 시작 연도), `endYear = year(폐업일 || 양도일)`. 편집 행 = `[startYear, min(endYear, 양도연도−2)]`(PR①) — 직전·당해는 **읽기 전용 참조 행**(기존 칸 값을 그대로 읽어 미리보기에만 쓴다 — 같은 사실을 두 번 받지 않는다). `useEffect → store` 없음.
3. **행 저장 = 연도 키 희소 맵**(`{year,revenue,landValue}[]`): 개시일을 바꿔도 값이 밀리지 않는다(인덱스 기준이 아님). 범위 밖 연도의 값은 store에 **남기고**(토글·날짜를 되돌리면 복원) ④가 **범위 안 연도만** 보낸다(3중 술어). 쓰기는 `patchYearRow(year, patch)` onChange 핸들러만.
4. **미리보기 판정 칸**(표시 전용): 연도별 비율①·②·기준·충족 — 엔진 공용 leaf를 그대로 호출(제안 `evaluateRevenueByPeriod` — UV-3). UI는 비율을 **새로 계산하지 않는다**(`OtherLandDetailSection.tsx:107-143`이 이미 `computeRevenueTest`를 직접 호출하는 선례). **영위일수 열은 연환산용 일수(초일산입)만** 보이고, 기간기준용 «사업용 일수»는 결과 구간표에만 둔다(UV-4 — 두 정의가 같은 연도 표에서 숫자 불일치를 만든다).
5. **자동조회 버튼**: `NblLandValueAutoFetchButton`(2연도 고정)과 별도 «연도별 토지가액 자동조회» — 행 연도마다 `lookupLandPrice(jibun, recommendLandPriceYear(`${Y}-12-31`))` 호출(`nbl-land-zone.ts:23-27` 선례) 후 `multiplyByAreaShare`(`NblLandAutoFetch.tsx:60-62`)로 채움. **자동 채움이 아니라 명시 클릭**이며, 이미 값이 있는 행은 덮어쓸지 묻는다(UQ-7). 조회 실패 연도는 빈 채로 두고 행 오류로 표시(대체값 금지).
6. **토글 전환**: OFF → ON은 값을 쓰지 않는다. ON → OFF는 3개 값을 **남기고** 와이어만 비운다(복원 보존). **업종을 «해당 없음»으로 바꾸면** 블록 전체 비노출(값 보존).
7. **ON인데 의미가 없는 경우**: 개시 연도 ≥ 양도연도−1 이고 폐업일 없음 → 표가 비어 «개시일이 직전·당해 과세기간이라 아래 직전·당해 칸으로 충분합니다(현행 사업개시일 판정과 같습니다)» 안내만 보인다(막지 않음).
8. **연접 다필지 ON**이면 토글 비노출(건축물 이력과 같은 배타 — UQ-9 정본 `nbl-other-land-state-history.ui.plan.md:478`). 필지별 수입금액비율은 법문(§168의11② 후단)이 가능하나 v1은 지원하지 않는다 — 고지.
9. **파일 크기**: `OtherLandDetailSection.tsx` 446 → 약 470(토글 + 개시일 FieldCard 이동 조건부 렌더 + 하위 블록 호출). 800줄 정책 안. `lib/api/transfer-tax-schema-nbl.ts` 298 · `transfer-tax-validate-nbl.ts` 363 · `non-business-land-request.ts` 264 모두 여유. **`calc-wizard-asset-migrate.ts`(737줄)는 건드리지 않는다** — 정규화는 `calc-wizard-asset-migrate-nbl.ts`(68줄)의 `migrateNblB1Fields`에 형제 함수로.

### 4.3 기존 칸과의 관계 — 대체가 아니라 **공존 + 단일 소스** (UQ-3~UQ-5)

| 사실 | 입력처(ON) | 입력처(OFF) | 중복 입력 방지 |
|---|---|---|---|
| 개시일 | **새 블록 ①**(기존 키 · 같은 `FieldCard field="nblRevenueCurrentBusinessStartDate"`가 이동 — 한 시점에 한 인스턴스라 `data-field` 유일) | 기존 위치(연환산 카드 `:329`) | 같은 키 1개 — 두 칸이 동시에 보이지 않는다. U0 «토글 숨김» 선례(`OtherLandDetailSection.tsx:98-101`) |
| 직전·당해 연도 수입·토지가액 | 기존 칸(불변) + 표에서는 **읽기 전용 참조 행** | 기존 칸 | 표가 직전·당해 행을 받지 않는다 |
| 개시·폐업 전 연도(≤ 직전−1) | **새 표** | — | — |
| 간주임대료·공통수입 | 기존 칸(당해·직전만) | 같음 | 과거 연도는 칸 없음(UQ-6) |
| 폐업 모드(PR②) | 폐업일이 있으면 **기존 당해·직전·간주임대료·공통수입 카드 전부 숨김**(값 보존·미전송), 표가 영위 연도 **전부**(직전·당해 포함)를 받는다 | — | UQ-4 (가) |
| DM-01 판정 | ON이면 엔진이 연도별 판정으로 대체(엔진 R-4) | 현행 DM-01 그대로 | OFF 경로는 byte-identical |

**라벨·문구 정책**: 기존 라벨 5개(§1.1)와 힌트는 OFF에서 **그대로**(e2e 반전 0). ON에서만 개시일 FieldCard 힌트·라벨을 ON 전용 문구(「사업 개시일」)로 렌더한다 — 같은 컴포넌트에 `label`·`hint` prop 분기(OFF 경로 텍스트 불변). 기존 힌트의 «당해연도 중 사업을 개시한 경우만»이 DM-01 실제 동작과 어긋난 점(UV-10)은 **이 PR에서 고치지 않는다**(Surgical — 별도 결정).

### 4.4 UI 순서 = 계산 순서

엔진: ① 영위 기간 확정(개시일·폐업일·소유 클립) → ② 과세기간별 연간수입금액(연환산) · 토지가액 → ③ 연도별 비율①②·통과 → ④ 통과 연도의 일 단위 사업용 구간 → ⑤ 기간기준(§168의6). 화면: **업종 → 토글 → ①영위 기간 → ②연도 표(오래된 연도부터) → 직전·당해(기존)**. 모드 토글은 영향받는 칸 직전.

---

## 5. 클라이언트 14지점 (①~⑧ + ⑨~⑭ 확인점)

| 지점 | 변경 | 근거(실측) |
|---|---|---|
| ① 타입 | `NblOtherFormSlice`에 `nblRevenuePeriodOn: boolean` · `nblRevenueBusinessEndDate: string` · `nblRevenueYearRows: NblRevenueYearRowInput[]` 추가. 행 타입 `{ year: string; revenue: string; landValue: string }`(전부 string — 폼 규칙). 신규 필드는 **필수 키** — 기존 필드와 같은 군이고 초기값을 factory가 채운다(리터럴을 쓰는 테스트는 `makeDefaultAsset` 경유가 대부분이라 영향 확인 필요 UV-1) | `calc-wizard-asset-nbl-other.ts:150-192` |
| ② initial | `calc-wizard-asset-factory.ts`의 수입금액 군(`:410-427`)에 `nblRevenuePeriodOn: false` · `nblRevenueBusinessEndDate: ""` · `nblRevenueYearRows: []`(호출마다 새 배열 — `nbl-defaults-and-migrate-guards.anchor.test.ts:40-48` 패턴에 1건 추가). 이력(`nblOtherStateEvents`)은 `factory.ts:380`·`nbl.ts:180` 두 곳에 있다 — 수입금액 군은 factory에만 있는지 Do 첫 grep으로 재확인(UV-12) | `calc-wizard-asset-factory.ts:410-427` |
| ③ normalize | `migrateNblB1Fields`(`calc-wizard-asset-migrate-nbl.ts:20-`)에 형제 `migrateNblRevenuePeriod(a)`: `PeriodOn`이 boolean 아니면 `false` · `EndDate` string 아니면 `""` · `YearRows` 배열 아니면 `[]`, 각 행은 `year`가 `/^\d{4}$/`일 때만·`revenue`·`landValue`가 string 아니면 `""`·**같은 연도 중복은 마지막 값만**. **키가 없던 기존 세션에는 `undefined → 기본값` 채움만**(기존 16필드 가드 `nbl-defaults-and-migrate-guards.anchor.test.ts:52-72` 패턴 확장) | `calc-wizard-asset-migrate-nbl.ts` |
| ④ API 변환 | `buildNonBusinessLandRaw`의 `nbl*` prefix-pick(`non-business-land-request.ts:156-158`)이 **저장값을 그대로 싣는다** — stale이 닿는다. 따라서 `revenuePeriodWireFields(asset)`(신규 · `nbl-revenue-period-scope.ts`)를 `stateHistoryWireFields` 뒤(`:175`)에 스프레드해 **술어가 거짓이면 `false`·`""`·`[]`로 덮어쓴다**(건축물 이력과 같은 수법). 참이면 ON·폐업일·**범위 안 연도 행만**(오름차순) 전송. 폐업 모드(PR②)에서는 기존 `nblRevenueCurrent*`·`Prior*`·`Deposit`·`Common*`을 **비워** 보낸다(엔진이 안 읽게 — R-7) | `non-business-land-request.ts:156-176` |
| ⑤ UI | §4 | — |
| ⑥ 사이드바 | 영향 없음 가정 — E3-1b가 `git grep -n "nbl\|NonBusiness" lib/stores/calc-wizard-store.ts lib/stores/transfer-per-asset-summary-helpers.ts components/calc/shared/WizardSidebar.tsx` 0건으로 확인(구현 기록). **이 세션 재확인 미수행** | UV-9 |
| ⑦ 결과 | §6 | — |
| ⑧ validation | §7 | `transfer-tax-validate-nbl.ts:264-299`(기존 블록에 게이트) + 신규 `transfer-tax-validate-nbl-revenue-period.ts` |
| ⑨⑩ | 해당 없음(새 enum 없음) | — |
| ⑪ | 해당 없음 | — |
| **⑫ Zod** | `nonBusinessLandRawBaseSchema`(`transfer-tax-schema-nbl.ts:254-275` 수입금액 군)에 `nblRevenuePeriodOn: z.boolean().optional()` · `nblRevenueBusinessEndDate: z.string().optional()` · `nblRevenueYearRows: z.array(행스키마).optional()` **필수 추가** — 빠지면 `.strip()`으로 **침묵 소실**(TS 미감지). refine 입력 타입(`transfer-tax-schema-nbl-refines.ts:58-65`)에 신규 키 추가 + **구조 거울만**(§7 ⑫ 열) | — |
| ⑬ | `nbl*` prefix-pick 자동 운반 — **body 도달 E2E**로 확인(§9) | — |
| ⑭ | `buildRevenueTest`(`form-mapper-helpers.ts:482-535` — 535줄이라 +25면 560 안쪽) 또는 형제 `buildRevenuePeriods`가 신규 키를 엔진 입력으로 변환(Date 변환은 `lib/api/date-coerce.ts` 규칙) | 엔진 소관(R-1) |

**3중 패턴(정책 3) — 신규 3필드**

| 필드 | ⑤ 표시 | ④ 전송 | ⑧ | ⑫ | 엔진 |
|---|---|---|---|---|---|
| `nblRevenuePeriodOn` | OFF 기본(토글 OFF도 tone 유지) | 술어 거짓·OFF → `false`(또는 키 생략 — 스냅샷·byte-identical 결정 R-3) | ON일 때만 §7 규칙 | boolean optional | 부재·`false` = 현행 |
| `nblRevenueBusinessEndDate` | 빈 칸 + hint «비우면 양도일 현재도 영위 중» | 빈 칸 `""` 그대로 | 값 있을 때만 날짜 순서 규칙 | string(날짜 역순 거울) | `""` = 영위 중 |
| `nblRevenueYearRows` | 값 없는 행 = 빈 입력 | **범위 안 연도만**·값이 비어도 행은 보냄 | 범위 안 행의 수입 미입력·토지가액 ≤ 0 차단 | 행 구조(연도 4자리·중복 없음) 거울 | 행 누락 = R-9 |

**표시 fallback이 없는 이유**: 연도 행 값은 기본값을 채우지 않는다(자동 안분·가정값 금지). 비어 있으면 입력 가능한 빈 칸이고 ⑧이 막는다. 개시일 `""`는 «소유 시작부터 영위»라는 **문서화된 뜻**이라(hint 명시) fallback이 아니라 의미이며 ④·⑭ 모두 같은 뜻(`max(개시일, 소유 시작)`)을 읽는다(`deriveCurrentBusinessDays`와 같은 규칙 — `revenue-test.ts:81-95`).

`useEffect → store` 미러링 0 · 자동 안분 fallback 0(연도·영위일수는 날짜에서 **표시용으로만** 파생, store에 쓰지 않음).

---

## 6. 미리보기·결과 카드 ⑦

| 화면 | 현행 | E3-② (추천) |
|---|---|---|
| 입력 미리보기 | 영위일수 연환산 한 줄(`OtherLandDetailSection.tsx:338-356`) | ON일 때 §4.1 ② 표의 판정 칸(연도별 비율·기준·충족) — 엔진 leaf 호출 |
| 결과 카드 수입금액비율 블록 | `judgment.revenueTestDetail.detail` · 연환산 시 영위일수·환산액(`NonBusinessLandResultCard.tsx:118-150`) | **불변** + ON이면 그 아래 **새 표** `NblRevenuePeriodTable`(신규 ≈ 120줄) |
| 새 표 열 | — | 과세기간 · 영위일수(초일산입) · 연간수입금액(연환산 후) · 토지가액 · 비율① · 비율② · 기준 · 결과. 푸터: 통과 연도의 사업용 구간(엔진 echo). 모든 숫자 옆 한국어 변수명 라벨, 변수 약어·`floor()` 금지(formula-display 규칙) |
| DM-01 echo | `businessStartJudged` 문구(`NonBusinessLandResultCard.tsx:270-276`) | ON이면 엔진이 이 echo를 쓰지 않을 수 있음 — 현행 문구는 **OFF에서만** 나온다(엔진 R-3 협의) |
| 구간표 `NblStateHistoryPeriodTable` | 건축물·재산세 구분 구간 | **불변**(UQ-8 (가)). 엔진이 업종 구간을 같은 `intervals`에 합성하면 «업종 영위» 열이 필요 — 그때만 열 추가(반전 위험 ↑: `nbl-state-history-interval-` testid 34줄 · 6파일) |
| 고지 | 결과 `warnings` | **새 상수만 추가**(기존 문구 byte-identical): ① 개시 전 기간은 건축물 이력으로만 판정(현행 `NBL_STATE_HISTORY_REVENUE_START_NOTICE`와 병존 — ON일 때만 교체/추가는 엔진 결정) ② 과거 연도 간주임대료·공통수입 미반영 ③ 폐업 후 2년 자동 미생성 ④ 연혁 기준비율 미검증(UV-4). 위젯과 결과 카드가 **같은 상수**를 읽는다 |

표시 주의: 연도별 «충족»은 **수입금액비율만** 본 것이다 — 호별 면적한도·건축물·유예는 계산 결과에서 확정(구간표와 같은 한정 문구).

---

## 7. ⑧ 검증 규칙

게이트: `nblRevenuePeriodApplies(asset)` ∧ `nblRevenuePeriodOn` — ⑤·④와 같은 술어. 호출 위치 = `transfer-tax-validate-nbl.ts:264-299` 블록 안(업종 선택 분기) 맨 앞에서 신규 leaf 호출 + 기존 규칙에 게이트.

| # | 조건 | 가리키는 칸 | ⑫ 거울 | 비고 |
|---|---|---|---|---|
| P1 | ON ∧ 개시일·폐업일 둘 다 빔 | `nblRevenuePeriodOn` | ✗(구조 400 아님) | 의미 없는 ON — «개시일 또는 폐업일을 입력하세요» |
| P2 | 개시일 < 소유 시작일 | `nblRevenueCurrentBusinessStartDate` | **✗**(⑫는 `floorDate`를 안 받는다 — 지분별 취득일이 달라 늦은 지분이 400이 되는 것을 막는 선례 `transfer-tax-validate-nbl-state-history.ts:7`) | 하한 = `stateHistoryFloorDate`(`:36-43`) 재사용 — 축 B 번들은 전 지분 최이른 취득일 |
| P3 | 개시일 > 양도일 | 같은 칸 | ✅ 기존(`transfer-tax-schema-nbl-refines.ts:163-170`) | 기존 문구 재사용(`REVENUE_START_DATE_AFTER_TRANSFER_MESSAGE` — 문구가 «당해 사업개시일» — ON에서도 그대로 쓸지 UV-10) |
| P4 | 폐업일 < 개시일 · 폐업일 > 양도일 · 폐업일 < 소유 시작일(개시일 빔) | `nblRevenueBusinessEndDate` | ✅(순서 2종) / ✗(소유 시작) | 같은 날은 허용(영위일수 1일 선례 `revenue-test.ts:134-136`) |
| P5 | **범위 안 연도 행**의 수입금액 미입력(0은 허용) · 토지가액 비었거나 ≤ 0 | `nblRevenueYearRows.${year}.revenue`·`.landValue` | ✅(행 구조 — 연도 4자리 · 중복 금지) / ✗(값 필수) | 미입력 = 차단(정책 2). 점프 앵커 필수 |
| P6 | 폐업일 있음 → 기존 규칙(당해 수입·당해 토지가액·공통수입 쌍·DM06 직전 토지가액) **건너뜀** | — | 기존 거울(DM06·개시일)도 같은 술어로 건너뜀 | 숨은 칸을 요구하며 영구 차단하는 막다른 길 방지(U1 §2.2 교훈) |
| P7 | 업종 `none`·미선택 · 술어 거짓 | — | — | 전체 건너뜀(⑤ 비노출과 같은 술어) |
| P8 | 폐업 후 §83의5①10호 | — | — | **막지 않는다** — 유예 사유는 별도 칸(UQ-9) |
| P9 | 같은 연도 행 중복 | `nblRevenueYearRows` | ✅ | 정상 UI로는 불가(연도 키 맵) — 직접 API 방어 |

**⑧ ↔ ⑫ parity 격자**: 불변식 «⑫ 400이면 ⑧도 막는다»(`nbl-state-history-u1-validate-parity.anchor.test.ts:100`)를 신규 격자 `nbl-revenue-period-validate-parity.anchor.test.ts`에 같은 형식으로(⑧ 단독 차단 P2·P5 값·P1은 ⑫가 통과해야 함 — 의도된 비대칭을 표에 명시). **필드 점프**: 신규 앵커 키를 리터럴 접두로(`nblRevenueYearRows.${year}.revenue` — 정적 게이트 `transfer-validation-field-anchor-coverage`가 `${…}`를 `*`로 정규화해 읽는다 — `transfer-tax-validate-nbl-state-history.ts:20-22`) + `e2e/_helpers/validation-field-jump-cases-nbl.ts`에 케이스 ≈ 4행(P1·P2·P4·P5) 추가(기존 jump 행 `:90-103` 불변).

---

## 8. 기존 테스트 반전 규모 — grep 실측 (vitest 미실행 · UV-1)

> 방법: `git grep -c`/`-n` + 파일 정독. «반전» = 모델 변경으로 기대값이 반대가 되거나 바뀌는 단언. 신규 추가·허용 목록 확장은 반전이 아니다.

### 8.1 모델별 규모

| 모델 | 반전 규모 | 근거(실측) |
|---|---|---|
| **(B2) 추천** | **0~3** — 새 키가 **빈 상태 = 종전과 byte-identical**일 때 0. 3은 ON 전용 힌트·고지를 기존 상수 교체로 하는 경우의 상한 | §8.2 보호 목록 |
| (C) | ≈ 8~10 | 당해·직전 칸을 «마지막 영위 과세기간»으로 재라벨 시 e2e 라벨 5곳(`transfer-nbl-revenue-autofetch.spec.ts:62-72`) + 필수 규칙 조건화 jump 2행(`validation-field-jump-cases-nbl.ts:90-91`) + `nbl2611-b1-validation.anchor.test.ts`(10줄) 일부 |
| (A) 대체 | ≥ 수십(**미측정 추정**) | `nblRevenue` 14파일·129줄 · `revenueTest` 12파일·97줄 · compat 스냅샷 20곳 · e2e 2 spec — 입력 구조 자체가 바뀜 |
| (B1) | 최대(**미측정**) | `building_built\|building_removed\|tax_type_changed` 테스트 33파일 312줄 · `nbl-other-state-event-` 7파일 132줄 + E3-① S1~S13 동형 «종류가 셋뿐» 재점검 |

### 8.2 (B2) 반전 0으로 확인한 보호 대상 — 지켜야 할 것

| 대상 | 근거(실측) | 지키는 방법 |
|---|---|---|
| 기존 라벨 5개 `getByText` | `e2e/transfer-nbl-revenue-autofetch.spec.ts:62-72` | OFF 렌더 텍스트 불변 — ON만 prop 분기(§4.3) |
| `nblRevenue*` 16필드 복원 가드(undefined 아님) | `__tests__/lib/stores/nbl-defaults-and-migrate-guards.anchor.test.ts:52-72` | 신규 3필드는 **추가**(기존 16 목록 불변) |
| `migrate-factory-parity.anchor.test.ts:56-75` 값 보존 | 같음 | 기존 값 덮어쓰기 금지 |
| 수입금액 ⑧ 필수 규칙 jump 행 | `e2e/_helpers/validation-field-jump-cases-nbl.ts:43,90-103` | OFF·폐업일 없음에서 규칙·문구 byte-identical |
| compat 스냅샷 `revenueTestDetail` 전체 | `__snapshots__/nbl-state-history-compat.anchor.test.ts.snap`(20곳 · `:72` 등 `undefined` 포함) | **echo 신규 키는 OFF에서 키 부재**(엔진 R-3) |
| DM-01 시료 전부 | `nbl2611-d1-pipeline.anchor.test.ts`(it 8) · `nbl2611-d1-period-followup.anchor.test.ts`(it 15) · `nbl2611-d1-result-card.anchor.test.tsx`(it 5) · e2 표 `Da-DM01*`·`Dn-DM01*`·`V21-DM01`·`Q15a`(`nbl-state-history-e2-table.ts:133-187`) · grid `G11`(`nbl-state-history-grid.ts:46`) | ON 아닌 경로 불변 — 토글 OFF 기본 |
| `NBL_STATE_HISTORY_REVENUE_START_NOTICE` 문구·위젯 노출 | `nbl-state-history-notices.test.ts:60-61` · `nbl-state-history-section-render.test.tsx:103-106` | **신규 상수만 추가**(UQ-6 선례 — E3-1b UQ-6) |
| `raw`의 `"nblRevenueCurrentBusinessStartDate" in raw` | `nbl-raw-to-engine-input.test.ts:102-110` | 키는 OFF에서도 계속 전송 |
| e2e 간주임대료·공통안분 body 도달 | `e2e/transfer-nbl-revenue-deemed-common.spec.ts:243-247` | 불변 |

### 8.3 반전은 아니지만 **같이 고쳐야 하는 가드(허용 목록 확장)**

- `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts:100` WIRE-4(«판정이 쓰는 고지 상수 = apply + 입력 화면») — 신규 고지 상수가 위젯·결과 카드에서 읽히면 목록에 추가.
- `transfer-validation-field-anchor-coverage` 정적 게이트 — 신규 ⑧ 앵커 키 등록.
- `nbl-defaults-and-migrate-guards.anchor.test.ts:40-48` 새 배열 인스턴스 가드 — `nblRevenueYearRows` 추가.
- 신규 e2e 파일 1(≈ 5~6건).

### 8.4 정직한 한계

- 8.1의 (A)·(B1) 수치는 grep 파일·줄 수이지 케이스 수가 아니다. (B2)의 «0~3»도 새 상수 정책을 지킬 때의 **설계 목표**이며 vitest로 확인하지 않았다(UV-1).
- 엔진이 `RevenueTestResult`에 필드를 상시 추가하거나 DM-01 echo 문구를 ON 밖에서도 바꾸면 compat 스냅샷 20곳이 일제히 반전한다 — **엔진 계획서와의 합의 항목(R-3)**.

---

## 9. 테스트·E2E·mutation 계획 (Do 단계 — 이 세션 미실행)

| 층 | 파일(신규) | 케이스 |
|---|---|---|
| 술어·범위 | `nbl-revenue-period-scope.test.ts` | `nblRevenuePeriodApplies` 격자(지목·정밀판정·다필지·업종 none) · 영위 연도 범위(개시일 비움·소유 시작 중간·직전/당해 연도 개시·폐업일 경계·윤년) · 행 연도 키 안정성(개시일 변경 시 값 이동 없음) |
| ③④ | `nbl-revenue-period-wire.anchor.test.ts` · `…-migrate.anchor.test.ts` | OFF/술어 거짓 → 키 부재·`[]` · 범위 밖 연도 미전송 · 폐업 모드 legacy 필드 비움 · 구 세션 복원 byte-identical · 중복 연도 정리 |
| ⑤ 위젯 | `nbl-revenue-period-section-render.test.tsx` | 토글 OFF 시 기존 라벨·칸 불변(5라벨) · ON 시 개시일 FieldCard가 새 블록으로 이동(`data-field` 1개) · 표 행 수·읽기 전용 직전/당해 행 · 직전·당해 개시 시 «표 없음» 안내 · 폐업일 입력 시 legacy 카드 숨김 · 업종 해제 시 비노출 · 값 입력 → 미리보기 판정 · 자동조회 실패 연도 빈칸 |
| ⑧↔⑫ | `nbl-revenue-period-validate-parity.anchor.test.ts` | §7 격자 전수 |
| ⑦ | `nbl-revenue-period-result-card.anchor.test.tsx` | 표 열·변수명 라벨·OFF에서 표 없음 · 기존 revenue 블록 불변 |
| route 관통 | `__tests__/api/nbl-revenue-period-route.anchor.test.ts` | 신규 키 3개가 ⑫를 지나 엔진 input에 도달(strip 방지) |
| E2E | `e2e/transfer-nbl-revenue-period.spec.ts` ≈ 5~6건 | ① R1: 개시 → 표 입력 → **body `nblRevenuePeriodOn`·`nblRevenueYearRows` 도달** → 결과 구간·판정 변화(수치는 엔진 계획서 M9·M10 시료 — 구현 시 실측으로 단언) ② OFF 기본 body에 신규 키 없음/비어 있음 ③ 입력 누락 차단 + 점프(P5) ④ 연도별 자동조회(vWorld mock — `e2e/CLAUDE.md` 외부 API mock 규칙) ⑤ [PR②] 폐업 + legacy 카드 숨김 ⑥ 375px 가로 스크롤 없음·라이트/다크 |

**mutation 계획**(제품 코드 1줄 → 실패 → 원복): ① ④ 범위 밖 연도 전송 허용 ② ④ 술어 거짓에서 stale 값 그대로 전송 ③ ⑫ 행 스키마 키 삭제(route anchor가 잡아야) ④ 개시일 이동 렌더 제거(두 칸 동시 노출) ⑤ ⑧ P5 수입금액 미입력 통과 ⑥ ⑧ P6 legacy 규칙 게이트 제거(폐업 모드 영구 차단) ⑦ ⑤ 행 저장을 인덱스 기준으로 ⑧ 미리보기에서 초일산입 +1 제거 ⑨ OFF에서 신규 echo 키 상시 출력(compat 스냅샷이 잡아야). **침묵 소실 grep 게이트**: 신규 키 3개가 `nblRevenuePeriodApplies` 단일 술어로만 게이트됨(④·⑤·⑧ 3곳).

---

## 10. 사용자 결정 UQ-n

| # | 질문 | 선택지 | **추천** | 근거 |
|---|---|---|---|---|
| UQ-1 | 입력 모델 | (A) 표만 / (B1) 건축물 사건 목록에 새 종류 + 표 / **(B2) 영위 기간 + 표(공존)** / (C) DM-01 확장 | **(B2)** | §3 — 법문 «과세기간별»을 지키고(§1.3) 일 단위를 표현하며(A 불가) 업종·건축물 사건을 섞지 않고(B1 침묵 분기 13곳) 반전 0~3. 대가: 새 컴포넌트 2개 |
| UQ-2 | 진입 방식 | **(가) ToggleCard 기본 OFF — `""`/키 부재 = 현행(필수 질문 아님)** / (나) U1처럼 3지선다 필수 질문(미선택 ⑧ 차단) / (다) 개시일이 직전 이전 연도면 표 자동 노출 | **(가)** | (나)는 U1에서 «모드 `""` 차단 → 12파일 83건 픽스처 반전»(`nbl-state-history-e3-1…ui.plan.md` §0 인용)이 재발. (다)는 이미 DM-01 개시일을 직전 이전 연도로 저장한 세션이 새 필수 표로 막힌다(막다른 길). OFF의 «모름»은 U1 `unknown`(현행 + 고지)과 같은 취급 — **단 OFF에서 «현행이 소유기간 전체를 사업용으로 본다»는 기존 한정 고지 외에 새 문구는 더하지 않는다** |
| UQ-3 | 개시일 칸 | **(가) 기존 `nblRevenueCurrentBusinessStartDate` 단일 소스 — ON이면 새 블록 ①로 같은 FieldCard 이동** / (나) 신규 키(`nblRevenueBusinessStartDate`)를 두고 ON이면 신규 우선 / (다) 기존 칸은 제자리, 새 블록은 그 아래 | **(가)** | 같은 사실을 두 곳에서 받지 않는다(U0 선례 `OtherLandDetailSection.tsx:98-101`). (나)는 두 값이 모순될 수 있고 ④·⑭ 선택 규칙이 늘어 3중 패턴 부담. (다)는 «영향받는 칸 직전» 원칙 위반 — 개시일이 표보다 아래 |
| UQ-4 | 폐업 모드(PR②)의 기존 당해·직전 칸 | **(가) 폐업일이 있으면 기존 당해·직전·간주임대료·공통수입 카드 전부 숨김(값 보존·미전송), 표가 모든 영위 연도(직전·당해 포함)를 받는다** / (나) 연도별로 기존 칸·표를 혼합 / (다) 폐업은 v1 제외 | **(가)** | (나)는 «직전 연도 = 폐업 연도» 같은 경계마다 입력처가 갈려 혼란. 폐업 시 기존 `당해 수입금액 > 0` 필수(`transfer-tax-validate-nbl.ts:268-271`)가 막다른 길이 되므로 게이트가 필수 — 단일 술어 `폐업일 있음` 하나로 정리. (다)면 M11은 계속 입력 불가 |
| UQ-5 | 표가 받는 연도 | **(가) 영위 기간이 걸치는 연도 중 «직전·당해 이전»만 편집 + 직전·당해는 읽기 전용 참조 행** / (나) 직전·당해까지 표가 받고 기존 칸 숨김 | **(가)** (PR①) | (나)는 간주임대료·공통수입·영위일수 입력 칸이 기존 칸에 묶여 있어 잃는다. 폐업 모드만 (나)로 수렴(UQ-4) |
| UQ-6 | 과거 연도의 간주임대료·공통수입 안분 | **(가) 칸을 두지 않고 «수입금액에 합산해 입력 + 확인 필요» 고지(기존 당해·직전 칸만 자동 산정)** / (나) 행마다 보증금·일수 칸 / (다) 반영 안 한다고 고지만 | **(가)** | (나)는 **엔진이 못 계산한다** — 율 표가 2025-03-21 이후 1행뿐(`nbl-deemed-rent-rate.ts:25-27`)이라 과거 연도는 `null`. 율 표 확장(검증 필요)이 선행. (가)는 사용자 산출값을 받아 §168의11③ «1·2호 합산 후 연환산» 순서(`revenue-test.ts:170` 주석)와 맞는다. 한계: 미반영·오입력 시 비율 과소(불리 방향) → 고지로 밝힘(법 근거 없는 불리 적용 아님 — 입력 경로를 안 연 한계) |
| UQ-7 | 연도별 토지가액 | **(가) 직접 입력 + 명시 클릭 «연도별 자동조회»(조회 실패 연도는 빈칸)** / (나) 직접 입력만 / (다) 양도연도 토지가액 1개를 전 연도에 적용 | **(가)** | (다) ⛔ — 법 ④가 **과세기간별 12.31. 기준시가**를 요구(§1.3)하고 가정값 적용은 자동 안분류 fallback. (가)는 `resolveNblLandValueYears` 연도 규칙을 N개로 확장(UV-5: 호출 수·제한 확인) |
| UQ-8 | 결과 표현 | **(가) 별도 표 `NblRevenuePeriodTable` + 기존 구간표 불변** / (나) 구간표에 «업종 영위» 열 추가 | **(가)** | (나)는 `nbl-state-history-interval-*` testid 34줄(6파일)·열 단언 반전 위험. 엔진이 업종 구간을 `intervals`에 합성하면 그때 (나) 재검토 |
| UQ-9 | 폐업 후 2년(§83의5①10호) | **(가) 자동 생성 안 함 — 유예 사유 10호를 직접 입력 + 안내 상수** / (나) 폐업일이 10호 유예 기산일을 자동 공급 | **(가)** | 유예를 사건이 자동 만들지 않는다는 선례(통합 Q-10 (가) · `NBL_STATE_HISTORY_GRACE_ROW_NOTICE` `nbl-confirm-notices.ts:114-117`). (나)는 «2년 이상 사업에 사용» 요건을 영위 기간이 알고 있어 가능하나 두 입력처의 동기·삭제 규칙이 새로 생긴다. 대가: 폐업일을 두 번 묻는다 → 안내 상수로 완화 |
| UQ-10 | 영위 기간 개수·업종 | **(가) 1건·1업종(업종 변경·재개시는 토글 ON 불가 + 고지)** / (나) N건 | **(가)** | 현행 업종 칸이 1개(`nblRevenueBusinessType`) — N건은 업종도 구간별로 갈려 모델 폭증(통합 UQ-3 (다)와 같은 이유) |
| UQ-11 | PR 분할 | **(가) ① 개시(영위 중) + 표(M9·M10) → ② 폐업(M11 · 기존 칸 숨김 · 10호 안내)** / (나) 한 번에 | **(가)** | 폐업은 UQ-4 게이트·UQ-9 중복·연도 범위 규칙이 추가 — 개시만으로 DM-01 대체 효과(M9·M10)를 먼저 연다. 엔진이 한 PR로 판정까지 연다면 UI도 한 PR(E3-1b 선례 — 엔진 합의 따름) |

---

## 11. 미검증 UV-n

| ID | 항목 | 상태 | 영향 |
|---|---|---|---|
| UV-1 | §8 반전 케이스 수 — **vitest·tsc 미실행**. 신규 필수 키 3개가 `AssetForm` 리터럴을 쓰는 테스트에서 tsc 오류를 내는지 | **확인 필요**(Do 직전 복사본에서 필드 추가 후 `npx tsc --noEmit` + `npx vitest run __tests__/lib/ __tests__/calc/ __tests__/tax-engine/non-business-land/`) | §8 · ① 필수/optional 결정 |
| UV-2 | «수입금액»(부가가치세 포함 여부 · 소득세 총수입금액과의 일치) · «사업 신규개시일»(사업자등록 개업일 vs 실제 영업 시작) 정의 — 영 §168의11③ 본문(이 세션 조회)은 «사업의 1과세기간의 수입금액»뿐 | **확인 필요**(법령·해석례 — KoreanLaw 재조회) | §2.2 · hint **단정 금지** |
| UV-3 | 엔진 계획서와 모델명·필드명(`evaluateRevenueByPeriod` · `RevenueTestResult.periods` · 키 3개 · R-1~R-9) 일치 | **확인 필요**(메인 세션 합침) | §4·§5 |
| UV-4 | ① 통과 연도의 «사업용 일수»를 엔진이 어떻게 세는가 — 연환산 영위일수는 **초일산입**(`differenceInCalendarDays + 1` `revenue-test.ts:70-72`), 기간기준 소유일수는 일 단위(엔진 계획서 M16: 취득 2023-12-31 · 양도 2024-01-01 → 0일)라 **같은 연도의 두 일수가 1일 어긋난다** ② 과거 과세기간에 **현행 기준비율**을 쓰는 문제(`getNblRevenueThreshold`에 날짜 인자 없음 `transfer-nbl.ts:291`) | **확인 필요**(엔진 소관 · 규칙 §83의4 연혁 조회) | §4.2-4 표시 · 결과 카드 열 이름 |
| UV-5 | 연도별 개별공시지가 N회 조회 가능 여부(vWorld 호출 한도·1990년대 이전 연도·미공시 연도) | **확인 필요**(`NblLandAutoFetch.tsx:57-65`는 2회뿐 — Do 시 실측) | UQ-7 |
| UV-6 | tone 최종(토글 violet · 서브섹션 amber) · 표 375px 스택 레이아웃 | **확인 필요**(Do 시 `tones.ts`·Playwright) | §4.1 |
| UV-7 | **축 B(지분 카드)**: 수입금액 칸은 카드별인데(`validate-nbl.ts:264` — `skip` 없음) 이력은 첫 카드만(`transfer-tax-validate-acquisition.ts:371`) — 지분별 취득일이 다른 번들에서 표·개시일을 카드별로 받을지 | **확인 필요**(축 B 수입금액 실제 경로 정독 후 결정 — 미확인 상태로 UI 추측 금지) | §4.2-1 술어 · P2 하한 |
| UV-8 | compat 스냅샷 키 부재 제약(엔진 R-3) — `RevenueTestResult`·`NonBusinessLandInput`에 신규 키가 OFF에서 `undefined`로라도 나오면 20곳 반전 | **확인 필요**(엔진 계획서와 합의) | §8.4 |
| UV-9 | ⑥ 사이드바 영향 없음 — 이 세션 재확인 미수행 | **확인 필요**(grep 1회) | §5 ⑥ |
| UV-10 | 기존 «당해 사업개시일» 힌트(`:329`)가 DM-01 실제 동작(어느 해든 `[개시일, 양도일)`)과 어긋난 점·P3 문구(«당해 사업개시일…»)를 ON에서 그대로 쓸지 | 기존 사실 — **이 PR에서 고치지 않음**(별도 결정) | §4.3 |
| UV-11 | 사용자가 연도별 수입·개시일을 구분해 알 수 있는가(귀속연도 vs 신고연도 · 공통수입) · hint가 충분한가 | **확인 필요**(수동·사용자 판단) | §2.2 |
| UV-12 | 신규 3필드 초기값 위치 — 수입금액 군은 `factory.ts:410-427`에만 있는지(상태 이력은 `factory.ts:380`·`nbl.ts:180` 두 곳) | **확인 필요**(Do 첫 grep) | ② |
| UV-13 | ON인데 직접 API가 행을 빠뜨린 경우(R-9) 400 vs 미적용 + 고지 | 엔진 결정 | ⑫ |

---

## 12. PR 분할·파일 크기 (Do — 엔진 선행 → UI 시퀀셜: 화면에 있는데 판정에 안 쓰이는 칸 금지)

1. **엔진 ①**(엔진 계획서): 과세기간별 판정 leaf · 입력 키 3개 ⑫·⑭ · echo(키 부재 규칙) · 고지 상수 · route 관통 anchor.
2. **UI ①**: ③④ · `RevenuePeriodSection`(토글·개시일 이동·표·미리보기) · ⑧ P1~P3·P5·P7 · ⑦ 새 표 · E2E ①②③④⑥ · mutation ①~⑨.
3. **엔진 ②·UI ②**(폐업): P4·P6 · legacy 카드 숨김 · 10호 안내 상수 · E2E ⑤.
4. 파일 크기(예상·미측정): `OtherLandDetailSection.tsx` 446 → ≈470 · 신규 `RevenuePeriodSection.tsx` ≈180 · `nbl-revenue-period-scope.ts` ≈80 · `NblRevenuePeriodTable.tsx` ≈120 · `transfer-tax-validate-nbl-revenue-period.ts` ≈90 · `form-mapper-helpers.ts` 535 → ≈560. **위험 구간(≥750) 파일은 건드리지 않는다**(`calc-wizard-asset-migrate.ts` 737은 대상 아님).

완료 보고 전 필수: `ui-engine-sync-checker`(14지점) · ⑫ body 도달 E2E · 침묵 소실 grep 게이트 · 브라우저 수동 확인(또는 «미수행» 명시) · `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/calc/ __tests__/lib/`.

---

## 13. 재제안 금지·기결정 준수

V-1 일 단위(과세기준일 접기 ⛔ — 이 계획의 연도 표는 **판정 입력 단위**이지 구간 접기가 아니다; 통과 연도의 일 단위 구간 도출은 엔진 R-4) · Q-15 (가′) · 「모름」 = 혜택 불성립 + 확인 필요(OFF의 모름은 U1 `unknown` 선례와 같은 «현행 + 한정 고지» — 새 혜택을 만들지 않음) · 자동 안분 fallback 금지(토지가액·수입금액 가정값 없음, 연도 행 자동 생성 없음) · `useEffect → store` 미러링 금지(행·연도는 `useMemo` 파생, 쓰기는 onChange) · 계산·판정을 UI가 새로 짓지 않음(비율·연환산은 엔진 leaf) · 건축물·재산세 구분·유예 입력은 건드리지 않음 · 기존 인라인 톤 카드·라벨·힌트는 고치지 않음(Surgical).

---

## 14. 자가 검토 (plan-design-self-review-loop · 1회)

| # | 검토 항목 | 발견 | 정정 |
|---|---|---|---|
| 1 | «(A) 표만으로 충분하다»는 초안 | 경계 연도에서 영위일수만 받으면 «연초부터냐 연말까지냐»를 모른다 → V-1 일 단위를 못 만들어 연 단위 접기를 강요 | (A) 기각 · 개시·폐업 **날짜**를 받는 (B2) |
| 2 | 건축물 사건 목록에 종류를 더하면 자연스럽다는 초안(B1) | 사건 위젯은 `nblOtherStateHistoryMode`·연접 다필지 술어 아래이고(`nbl-other-state-history-scope.ts:29-41`) 업종 개시는 건축물 상태와 독립. 종류 2→5개 시 E3-① S1~S13 동형 분기 재점검(테스트 33파일 312줄) | (B1) 기각 · 업종 카드 안 (B2) |
| 3 | 기존 직전·당해 칸을 표로 흡수하자는 초안 | 간주임대료·공통수입·영위일수 칸이 그 칸에 묶여 있고 라벨 5개가 e2e 단언 | 공존 + 읽기 전용 참조 행 · 폐업 모드만 흡수(UQ-4·5) |
| 4 | 과거 연도에도 간주임대료 칸을 두자는 초안 | 율 표가 2025-03-21 이후 1행뿐(`nbl-deemed-rent-rate.ts:25-27`) — 과거 연도는 엔진이 계산 불가 | UQ-6 (가) — 합산 입력 + 고지 · 율 표 확장은 별도 선행 |
| 5 | 폐업 후 «2년 이상 사용» 요건(규칙 §83의5①10호)을 영위 기간으로 자동 처리하자는 초안 | 기존 유예 10호 칸이 폐업일을 따로 받아 폐업일 이중 입력 · 자동 생성은 유예 선례(통합 Q-10 (가)) 위반 | UQ-9 (가) — 안내 상수 + 직접 입력 |
| 6 | 폐업 모드에서 기존 당해 수입 필수 규칙(`validate-nbl.ts:268-271`)을 그대로 두면 | 영위하지 않는 당해 연도 수입을 요구해 **영구 차단** | P6 게이트 · UQ-4 |
| 7 | 행을 인덱스 배열로 저장하자는 초안 | 개시일을 바꾸면 값이 다른 연도로 밀린다 | 연도 키 희소 맵 · 범위 안 연도만 전송(3중 술어) |
| 8 | 표 «영위일수»와 결과 구간표 «사업용 일수»를 같이 보이자는 초안 | 연환산은 초일산입(`revenue-test.ts:70-72`), 기간기준은 일 단위 — **같은 연도 두 숫자가 1일 어긋남** | 표는 연환산 일수만 · UV-4 |
| 9 | 현행 문구 고치기 | 기존 «당해 사업개시일» 힌트가 동작과 어긋남(UV-10)을 발견했으나 이 범위에서 고치면 e2e 라벨 반전 | 고치지 않고 UV로만 기록(Surgical) |
| 10 | 엔진 echo 필드를 상시 추가 | compat 스냅샷(20곳)이 `undefined` 키까지 고정(`…snap:72`) | R-3 키 부재 제약 · UV-8 |
| 11 | 법령 인용 | 영 §168의11②③④·규칙 §83의5①10호는 이 세션 KoreanLaw 본문으로 확인. «수입금액» 정의는 본문에 없음 | 정의는 단정하지 않고 UV-2 |

**verdict: `ready-with-decisions`** — 구조·영향·반전 규모(grep)·미검증을 산출했다. 착수 전 남은 것 = ① 사용자 UQ-1~UQ-11(특히 UQ-1·2·4·6·11) ② 엔진 계획서와 모델명·R-n·echo 키 부재 합의(UV-3·UV-8) ③ UV-4(영위일수 두 정의·임계 연혁 — 엔진 소관)·UV-7(축 B 수입금액 경로) 실측 ④ UV-1 복사본 probe. 이 넷 전에는 코드 착수 금지(엔진 선행 PR → UI ① → 엔진·UI ②).

---

## 부록. 엔진 계획서와 합칠 때 요청 사항 (R-n — 제안)

| # | 요구 | 이유 |
|---|---|---|
| R-1 | 입력 키 3개 수용: `nblRevenuePeriodOn`·`nblRevenueBusinessEndDate`·`nblRevenueYearRows[{year,revenue,landValue}]` + 개시일 = 기존 키 재사용. ⑫ Zod · ⑭ 매퍼 | §5 |
| R-2 | **과세기간별 판정 leaf 단일 함수**(UI 미리보기·엔진 공유) — 입력: 영위 기간·연도 행·직전·당해 값. 출력: 연도별 연환산 수입 · 비율①② · 기준 · 통과 | §4.2-4 · 비율 재계산 금지 |
| R-3 | echo `RevenueTestResult.periods?` — **OFF에서 키 부재**(`undefined` 키 금지) · DM-01 echo(`businessStartJudged`) OFF 경로 byte-identical | compat 스냅샷 20곳 |
| R-4 | 통과 연도 → 일 단위 사업용 구간 규칙(개시·폐업 클립·소유 클립) + Q-15 (가′) 합성 + DM-01 대체 시점 | V-1 · UV-4 |
| R-5 | 신규 고지 상수(기존 문구 byte-identical): 개시 전 기간 · 과거 연도 간주임대료·공통수입 미반영 · 폐업 후 2년 자동 미생성 · 연혁 기준비율 | UQ-6·9 · UV-4 |
| R-6 | ⑫ refine 공용 leaf: 폐업일 ≥ 개시일 · 폐업일 ≤ 양도일 · 행 구조(연도 4자리·중복 금지) | §7 |
| R-7 | 폐업 모드(`EndDate` 있음)에서 기존 `nblRevenueCurrent*`·`Prior*`·`Deposit`·`Common*`을 읽지 않음(⑭ 게이트) | UQ-4 |
| R-8 | 폐업 모드에서 `deemedRateUnavailable`·직전 토지가액 DM06 규칙이 표 행에는 적용되지 않음 | UQ-6 |
| R-9 | `PeriodOn` ∧ 범위 안 행 누락(직접 API) → 400 vs 미적용 + 고지 | UV-13 |
| R-10 | 과거 연도 기준비율 연혁(규칙 §83의4) 조회·미검증 시 «확인 필요» 고지 | UV-4 |

## 결정 기록 (2026-11-23 사용자)

- **공통 — 모두 추천안 승인**: ① 입력 = 수입금액비율 카드 안 «영위 기간» 토글(UI UQ-2 — 기본 꺼짐, 꺼지면 현행과 바이트 동일) — 켜면 개시일·폐업일 1쌍 + 양도연도 T−2 이전 과세기간별 수입금액·토지가액 표(T·T−1은 기존 `nblRevenue*` 칸이 말함) · 업종 1개·영위 기간 1건(엔진 Q-7·UI UQ-10). **모델 정합(메인 세션)**: 엔진 (B)와 UI (B2)는 같은 정보(개시·폐업 1쌍 + 연도 표)를 담으므로 하나로 합친다 — 화면 진입은 UI안(토글, 개시일은 기존 `nblRevenueCurrentBusinessStartDate` 단일 소스 재사용 UQ-3), 엔진 입력 형태·필드명은 엔진 계획 §6 계약을 기준으로 구현 PR에서 확정(⑫ 신규 키 누락 = 침묵 strip → route 관통 anchor 필수 · OFF에서 echo 키 부재 R-3). ② 과거 연도 간주임대료·공통수입은 칸 없이 수입금액에 합산 + 고지(엔진 Q-3·UI UQ-6) ③ 연도별 토지가액은 직접 입력 + 명시 클릭 공시지가 조회(UQ-7) ④ 연도 행 누락 = 모름 → 그 연도 불통과 + 확인 필요, 차단 없음 ⑤ 영위 기간 ON이면 DM-01(당해 사업개시일) 판정 대체, OFF면 현행 유지 ⑥ 폐업 후 유예(규칙 §83의5①10호)는 기존 유예 칸에 사용자가 입력(자동 생성 안 함 · UQ-9), 영위 통산 일수가 유예 기산일 이전 2년 미만이면 그 유예만 제외 + 고지(엔진 Q-5 — V-7 해소).
- **엔진 Q-2(통과 과세기간 → 사업용 기간 환산) = (가) 통과 과세기간 ∩ 실제 영위일** — 개시 전·폐업 후는 사업용 아님. 근거: 법 «사업에 사용하는 토지» · 영 §168의11③ 연환산(영위 기간 기준) · 서면4팀-1048(임대한 기간은 사업에 사용한 토지로 보지 않음). 직접 규정·해석례 0건(V-1)이라 고지에 «확인 필요». (나) 역년 전체·(다) 직전 ② 통과 시 개시 전까지 보정(현행 DM-3 휴리스틱)은 기각. 토글 OFF 경로의 DM-3 현행 동작은 그대로(이 결정은 ON일 때만 적용).
- PR 순서(엔진 계획 §PR): E3c-0(테스트만 — 10호 유예 안전망 0건·3% 정확 경계 anchor 선신설) → E3c-1(leaf·판정·⑫·⑭·고지) → E3c-2(V-7 검사) → UI → E2E. 엔진이 한 PR로 판정까지 열면 UI도 한 PR(UQ-11).


## 구현 기록 (UI, 2026-11-23)

> 브랜치 `feat/nbl-e3-2-business-period` — 엔진 6커밋 위에 UI 커밋. 엔진 «구현 기록»의 계약을 그대로 받았다(와이어 칸 3개 · leaf · echo · 고지 상수). 본문 §4~§9 중 아래와 다른 곳은 이 기록이 정본이다.

### 계획 대비 확정·변경

| 항목 | 계획서 본문 | 구현(확정) | 이유 |
|---|---|---|---|
| 폐업 모드의 기존 당해·직전 카드 | 폐업일이 있으면 숨김 + 표가 직전·당해까지 받음(UQ-4 (가)) | **숨기지 않는다.** 엔진은 그 해에 영위일이 있으면 기존 칸을 읽는다(폐업이 T−1·T 안). 영위일이 없는 해(폐업이 그 해 이전)만 위젯 ③ 블록이 «영위일이 없는 해라 판정에 쓰지 않습니다»로 알리고 ⑧이 그 해의 «필수» 입력을 요구하지 않는다 | 필요한 칸을 숨기면 «모름 → 불통과». 읽는 해의 판정은 `revenuePeriodReadsYear`(엔진 `operatingDaysInYear`) 단일 술어 |
| 폐업일 = 개시일 | 같은 날 허용(P4) | **허용하지 않는다** — 폐업일 > 개시일 · 폐업일 < 양도일(엔진 leaf 문구 그대로) | 폐업일 = 영업을 하지 않게 된 첫날 |
| ⑧ 하한 | P2 개시일 < 소유 시작 | 개시일 < 취득일 · 폐업일 ≤ 취득일은 ⑧만 차단(`stateHistoryFloorDate`). ⑫ 거울 없음(축 B 늦은 지분 400 방지) | 엔진 계약 |
| 연접 다필지 배타 | 토글 비노출(§4.2-8) | **배제하지 않는다** | 엔진 ⑭는 필지와 무관하게 토지 단위 수입금액비율을 읽는다 |
| 직전 영위일수 칸 | ON에서도 직접 입력 | ON이면 칸을 숨기고 개시·폐업일에서 파생(③ 블록에 표시) | 엔진이 ON에서 직접 입력값을 읽지 않는다 |
| 개시일 FieldCard | ON이면 새 블록으로 이동(UQ-3) | 그대로 — 같은 키 한 인스턴스(`!periodOn`으로 기존 자리에서 제외) · ON 전용 라벨 «사업 개시일» | — |
| DM-01 «이력과 함께 판정» 고지 | (미정) | ON이면 숨김(엔진은 ON에서 DM-01 echo·고지를 쓰지 않는다) | — |
| 연도 행 점프 키 | `…YearRows.{index}…` | `nblRevenueYearRows.{year}.revenue|landValue` — 연도 키 | 행 위치가 아니라 연도로 저장하므로 |
| 공시지가 조회 | `LandPriceLookupField` 필수 확인 | **쓰지 않는다** — ㎡당 가격 + 단일 기준연도 선택 위젯이라 연도별 N행 표에 맞지 않는다. 같은 NBL 카드의 당해·직전 조회(`NblLandValueAutoFetchButton`)와 같은 헬퍼(`lookupLandPrice`·`multiplyByAreaShare`)로 명시 클릭 · **빈 토지가액 칸만** 채움 · 실패 연도는 빈 칸 + 연도 표시 | UQ-7 |

### UV-10 처리

기존 «당해 사업개시일» 힌트(«당해연도 중 사업을 개시한 경우만 입력»)가 DM-01 실제 동작(`judgeRevenueBusinessStart` — 어느 해든 `[개시일, 양도일)`)과 어긋나는 것을 **이 PR에서 정정**했다: «사업을 개시한 날(어느 해든 입력 가능 — 연환산은 당해 과세기간 안의 영위일만 셉니다)…» (hint-length-policy 150자 이내). 라벨 «당해 사업개시일»은 불변이고 힌트에 같은 어구를 넣지 않아 e2e `getByText("당해 사업개시일")`(strict)을 깨지 않는다 — anchor가 라벨 단일 요소를 고정한다. 판정·세액 변화 없음(표시 문구만).

### 14지점

| 지점 | 변경 |
|---|---|
| ① | `calc-wizard-asset-nbl-other.ts` — `nblRevenuePeriodOn: boolean` · `nblRevenueBusinessEndDate: string` · `nblRevenueYearRows: NblRevenueYearRowInput[]`(`{year,revenue,landValue}` 문자열) |
| ② | `NBL_DEFAULTS` + `makeDefaultAsset`(`false`·`""`·`[]` — 호출마다 새 배열) |
| ③ | `migrateNblRevenuePeriod`(`calc-wizard-asset-migrate-nbl.ts`) — 키 없음 = 꺼짐·빈 값 · 형 방어 · 4자리 아닌 행 제거 · 같은 연도 마지막 값 · 범위 밖 연도 행은 보존 |
| ④ | `revenuePeriodWireFields`(`nbl-revenue-period-scope.ts`)를 `buildNonBusinessLandRaw`의 prefix-pick 뒤에 얹는다 — 술어 거짓이면 `false`·`""`·`[]` · 참이면 폐업일 + **표가 받는 연도의 행만**(오름차순) |
| ⑤ | `RevenuePeriodSection.tsx`(ToggleCard violet · ToneCard amber ①②③ · 연도 행 · 명시 클릭 조회) · `OtherLandDetailSection.tsx` 마운트(개시일 이동 · 직전 영위일수 숨김 · 미리보기 영위일수 파생) · 미리보기 `nbl-revenue-period-preview.ts`(④ 와이어 레코드 → ⑭ 빌더 → 엔진 `evaluateRevenueHistory`) |
| ⑥ | 영향 없음 — `git grep -i "nbl\|NonBusiness"` (`calc-wizard-store.ts` · `transfer-per-asset-summary-helpers.ts` · `WizardSidebar.tsx`)이 타입 import 2줄뿐 |
| ⑦ | `NblRevenuePeriodTable.tsx` — 연도 · 영위일수 / 총일수 · 연간수입금액(연환산 후) · 당해 비율 · 합산 비율 · 기준 비율 · 수입금액비율(충족·미충족·모름 — 불통과) · 사업용 일수 + 합계 · 사업용 구간 · 모름 연도 · 10호 유예 제외 문장 · 영위일수/사업용 일수 차이 설명. echo 있을 때만(OFF = 표 없음) · 기존 구간표 불변 |
| ⑧ | `transfer-tax-validate-nbl-revenue-period.ts` — leaf `revenueHistoryInputIssue`(⑫와 같은 함수·문구, 접두 «자산: 기타토지 영위 기간 — ») + ⑧ 전용 하한 · `transfer-tax-validate-nbl.ts` 수입금액 블록: 영위일이 없는 양도연도의 «당해 수입금액·토지가액·당해 공통수입» 필수 규칙만 건너뜀(직전 공통쌍·DM06은 ⑫가 ON·OFF 무관 거울이라 유지) |
| ⑨⑩⑪ | 해당 없음 |
| ⑫ | 엔진 커밋이 완료(새 칸 3개 + refine). UI는 `__tests__/lib/nbl-revenue-period-wire-guard.test.ts`로 침묵 strip을 고정 |
| ⑬ | `nbl*` prefix-pick + ④ 덮어쓰기 — e2e가 body 도달 확인(본체·companion) |
| ⑭ | 엔진 `buildRevenueHistory` — UI 미리보기도 같은 빌더 호출 |

3중 패턴: 연도 행 값에 표시 fallback·자동 채움 없음(빈 금액 = 모름). ④ 전송·⑤ 렌더·⑧ 검증이 `nblRevenuePeriodOn()`·`revenuePeriodRowYears()`·`revenuePeriodWireRows()`·`revenuePeriodReadsYear()` 한 곳을 읽는다. `useEffect → store` 미러링 0.

### 테스트

| 층 | 파일 |
|---|---|
| 술어·전송·복원·미리보기 | `__tests__/lib/calc/nbl-revenue-period-scope.test.ts`(27) |
| 엔진 표 21행 폼 상태 → ⑧ → ④ → ⑫ → 엔진 → 세액 · OFF·stale 차단 · 세액 변화 | `__tests__/api/nbl-revenue-period-client.anchor.test.ts`(29) |
| ⑧ ↔ ⑫ parity 격자 30행(⑧만 막는 행 명시) | `__tests__/api/nbl-revenue-period-validate-parity.anchor.test.ts` |
| ⑤ 위젯 | `__tests__/components/nbl-revenue-period-section-render.test.tsx`(20) |
| ⑦ 결과 카드(엔진 표 → 실제 엔진 판정 렌더 · JSON 왕복) | `__tests__/components/nbl-revenue-period-result-card.anchor.test.tsx` |
| 침묵 소실 grep 게이트 | `__tests__/lib/nbl-revenue-period-wire-guard.test.ts` |
| 필드 점프 | `e2e/_helpers/validation-field-jump-cases-nbl.ts` 6행 |
| E2E | `e2e/transfer-nbl-revenue-period.spec.ts` 9건(M11′ · M9′ OFF/ON · 모름 · V-7 · OFF byte-identical · 축 B · 자동조회 · ⑧ 차단 · 시각) |

### mutation (제품 코드 1줄 무력화 → 대응 anchor 실패 → 원복)

M1 ④ 범위 밖 행 전송 → 8 · M2 ④ OFF stale 전송 → 5 · M3 ⑫ 행 스키마 키 누락 → 16 · M4 ⑧ «읽는 해» 게이트 제거 → 10 · M5 ⑧ 영위 기간 검증 호출 제거 → 13 · M6 개시일 FieldCard 이중 노출 → 1 · M7 표 연도 상한 T−2 → T−1 → 9 · M8 ⑦ 표 렌더 제거 → 6 · M9 ③ 복원 정규화 제거 → 1 · M10 ⑧ 개시일 하한 제거 → 1 · M11 빈 행 삭제 제거 → 1 · M12 점프 키를 인덱스로 → 2 · M13 직전 영위일수 칸 노출 → 1 · M14 ⑧ 당해 필수 항상 건너뜀 → 2 · M15 미리보기 영위일수 파생 무시 → 1(**처음 0건 — anchor 신설 후 실패**) · M16 모름 문구 제거 → 1 · M17 유예 안내 상시 표시 → 1 · M18 폐업일 하한 `<=` → `<` → 1 · M19 자동조회가 값 있는 칸 덮어씀 → E2E 1.

### 남은 확인 필요 (비차단)

- UV-4 후반·V-6: 과거 과세기간에 현행 기준비율 적용(규칙 §83의4 연혁) — 엔진 소관, 화면은 «기준 비율»을 엔진 값 그대로 표시.
- UV-11: 사용자가 귀속연도·신고연도·부가세 포함 여부를 구분해 입력하는가 — 도움말(`ROW_HINT`)은 «실제 수입금액(연환산 전)»만 단정하고 정의는 단정하지 않는다(UV-2).
- UV-5: 연도별 공시지가 조회는 순차 호출(연도 수 × 1회). 한도·미공시 연도는 실패 연도 표시로만 대응.
- 입력 표는 연도당 카드 1장이라 연도가 많으면 세로로 길다(375px에서도 가로 스크롤 없음). 압축 표 레이아웃은 후속 판단.
