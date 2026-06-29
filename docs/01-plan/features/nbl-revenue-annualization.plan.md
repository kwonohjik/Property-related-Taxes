# 비사업용 토지 §168의11② 수입금액 연환산(年換算) + 토지가액 자동조회 UI 검증

> 작성: 2026-06-29 · 브랜치 `feat/nbl-similar-land-14` · 대상: 양도세 NBL 기타토지

## 0. 두 요구사항 요약

| # | 요구 | 실측 결론 |
|---|---|---|
| **A** | 당해 과세기간 수입금액 **연환산** 기능 구현 | **미구현 — 본 계획 핵심** |
| **B** | 당해/직전 토지가액 vWorld 자동조회 UI 미표시 | **이미 master 구현됨 (검증 우선)** |

---

## 1. 요구 A — 수입금액 연환산 (핵심)

### 1-1. 법령 근거 (KoreanLaw MCP 본문 검증 2026-06-29, 소득세법 시행령 MST 286211)

**§168의11③3호** (연간수입금액 정의):

> "사업의 신규개시·폐업, **토지의 양도** 또는 법령에 따른 토지의 사용금지 그 밖의 부득이한 사유로 인하여 1과세기간 중 당해 토지에서 사업을 영위한 기간이 1년 미만인 경우에는 **당해 기간 중의 수입금액을 1년간으로 환산**하여 연간수입금액을 계산한다."

- §168의11②: 수입금액비율 = max(① 당해 연간수입금액 ÷ 당해 토지가액, ② (당해+직전 연간수입금액) ÷ (당해+직전 토지가액))
- §168의11④: "당해 과세기간의 토지가액" = 과세기간 종료일(**과세기간 중 양도 시 양도일**)의 기준시가

→ **토지를 과세기간 중 양도하면 당해 과세기간 영위기간은 항상 1년 미만** → ②③호에 따라 당해 수입금액의 연환산이 **법정 강제**. 직전 과세기간은 통상 1.1~12.31 전체(영위기간 1년) → 환산 불필요(직전연도 중 사업개시한 경우만 예외).

### 1-2. 현황 (실측)

| 위치 | 상태 |
|---|---|
| `lib/tax-engine/non-business-land/revenue-test.ts` `computeRevenueTest()` | `currentRevenue`를 **그대로** 비율 분자로 사용 — 환산 없음 |
| `types.ts:351` `RevenueTestInput.currentRevenue` 주석 | "당해 과세기간 **연간수입금액** — §168의11③ 산정값 입력" → **이미 환산된 값을 받는다고 가정**하나, 환산 주체가 어디에도 없음 |
| UI `OtherLandDetailSection.tsx:526` 라벨 | "당해 과세기간 수입금액" — **raw 기간 수입금액**을 입력받음 |

→ **타입 주석(연간환산값 기대) ↔ UI 입력(raw 기간값) ↔ 엔진(환산 미수행)** 3자 불일치. 사용자가 실무에서 raw 기간 수입금액을 입력하면 비율이 과소 산정되어 사업용 판정이 부당하게 탈락.

### 1-3. 설계 — 엔진 단일 진실 (memory `feedback_ui_engine_dual_truth_avoidance`)

연환산은 법정 계산. **책임 분리(실측 기반)**:
- **영위일수·과세연도 도출**: 날짜→일수 변환은 서버 매퍼 `buildRevenueTest`가 수행(실측: `mapAssetToNblInput` 컨텍스트에 `transferDate`·`acquisitionDate`·`parseDate` 보유). 단, **공유 순수 헬퍼 `deriveBusinessDays()`로 추출**하여 UI preview가 동일 함수를 import(단일 진실, memory `single-source-engine-helper`).
- **환산 산술**: 엔진 `revenue-test.ts`가 day-count + 과세연도를 받아 환산(순수 정수연산). UI는 결과 echo 또는 동일 헬퍼로 preview(재구현 금지, memory `feedback_ui_engine_dual_truth_avoidance`).

**환산식**: `연간수입금액 = floor(기간수입금액 × 해당연도총일수 ÷ 영위일수)` (영위일수 < 해당연도총일수일 때만; 이상이면 raw 그대로)
- **해당연도총일수 = 366(윤년) / 365(평년)** — 해당 과세기간(당해=양도연도, 직전=직전연도)의 실제 연도로 윤년 판정해 자동 적용. (사용자 확정 2026-06-29: 365 고정 금지)
- 윤년 판정: date-fns `getDaysInYear(new Date(taxYear, 0, 1))` (또는 `(y%4===0 && y%100!==0) || y%400===0`).

**영위일수 도출 (`deriveBusinessDays`, 공유 헬퍼)**:
- 당해: `differenceInCalendarDays(양도일, businessStart) + 1` (초일산입 inclusive). `businessStart = max(양도연도 1.1, acquisitionDate(당해연도 취득 시), 사업개시일 override)`. `transferDate`·`acquisitionDate`는 매퍼 컨텍스트로 이미 존재.
- 직전: 영위일수 직접 입력(`nblRevenuePriorBusinessDays`) 시에만 도출. **미제공(통상 full-year)이면 환산계수 1**(환산 안 함).
- 과세연도: 당해=`transferDate.getFullYear()`, 직전=`그-1`.
- inclusive(+1, 초일산입)은 보유·영위기간 한국 세무 관행. (Do 전 anchor로 확정)

### 1-4. 미결 설계 결정 (Do 진입 전 확정 — 추정 금지)

1. **환산 분자 365 vs 366(윤년)**: **확정 — 윤년이면 366, 평년이면 365 자동 적용**(사용자 확정 2026-06-29). 해당 과세기간의 실제 연도로 윤년 판정. 365 고정 금지.
2. **영위일수 자동도출 vs 직접입력**: 당해는 양도일·취득일 기반 자동도출(기본) + 선택적 `당해연도 사업개시일` override. 직전은 영위일수 직접 입력. 사용금지 등 중단기간 제외는 MVP 보류(영위일수 override로 흡수).
3. **직전 과세기간 환산**: **포함(사용자 확정 2026-06-29)**. 직전연도 중 사업개시·폐업으로 직전 영위기간 1년 미만이면 직전 수입금액도 `floor(직전 수입 × 직전연도총일수 ÷ 직전영위일수)` 환산(직전연도총일수=365/366 윤년 자동). 직전 영위일수 미제공(통상 full-year) 시 환산계수 1.
4. **연환산 적용 토글 노출 여부**: 법정 강제이므로 기본 자동 적용. 단 결과 echo(영위일수·환산계수·환산 전/후 금액)를 산출근거에 투명 표시.

### 1-5. 변경 지점 (실측 경로 — `tax-field-add` 스킬)

> 신규 폼 필드 2종: `nblRevenueCurrentBusinessStartDate`(당해 사업개시일, string), `nblRevenuePriorBusinessDays`(직전 영위일수, string). **이름은 반드시 `nbl` 접두사** — 클라 body 운반이 prefix-pick(`k.startsWith("nbl")`)이므로 접두사 누락 시 body 미포함.

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| 엔진 | input/result 타입 | `non-business-land/types.ts:348` | `RevenueTestInput`에 `currentBusinessDays?`·`currentTaxYear?`·`priorBusinessDays?`·`priorTaxYear?` 추가. `RevenueTestResult`에 `annualizedCurrentRevenue`·`annualizedPriorRevenue`·`currentBusinessDays`·`priorBusinessDays`·`annualizationApplied` echo |
| 엔진 | 환산 로직 | `revenue-test.ts` | 비율①·② 분자(당해·직전)를 각각 환산값(`floor(rev×getDaysInYear(year)÷days)`, days<총일수)으로. 정수연산 |
| 공유 | 영위일수 헬퍼 | `non-business-land/revenue-test.ts`(또는 utils) | `deriveBusinessDays(transferOrEnd, start)` 순수 함수 신설 — 매퍼·UI preview 공용(단일 진실) |
| ① | 폼 타입 | `lib/stores/calc-wizard-asset-nbl-other.ts:85` | 신규 2필드 `string` 선언 |
| ② | initial | **2곳** `calc-wizard-asset-nbl.ts:279` + `calc-wizard-asset-factory.ts:249` | 둘 다 `""` 추가 (한 곳 누락 시 undefined 유입) |
| ③ | normalize | `calc-wizard-migration.ts` | sessionStorage 구버전 폼 fallback `""` |
| ④ | 클라 body 운반 | `lib/calc/non-business-land-request.ts:64` | **변경 불요 — prefix-pick 자동 포함**(접두사 `nbl` 확인만) |
| ⑫ | **Zod** | `lib/api/transfer-tax-schema-sub.ts:178` `nonBusinessLandRawSchema` | 신규 2필드 `z.string().optional()` **필수 추가 — 누락 시 Zod 침묵 strip(엔진 미도달)** |
| ⑭ | 서버 매퍼 | `form-mapper-helpers.ts:266` `buildRevenueTest` + `form-mapper.ts:143` 호출부 | `buildRevenueTest` 시그니처에 `transferDate`·`acquisitionDate`·`parseDate` 추가, `deriveBusinessDays`로 `currentBusinessDays`/`currentTaxYear`/`priorBusinessDays`/`priorTaxYear` 산정 → `RevenueTestInput` |
| ⑤ | UI 위젯 | `OtherLandDetailSection.tsx` 494~549 | (선택)사업개시일 `DateInput`·직전 영위일수 `DecimalInput` + 영위일수·환산 전/후 preview(공유 헬퍼) |
| ⑥ | 사이드바 | — | 해당 없음(판정 분기) |
| ⑦ | 결과 카드 | `components/calc/NonBusinessLandResultCard.tsx` | 환산계수·영위일수·과세연도총일수·환산 전/후 산출근거 echo |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts:470` | raw 수입금액 입력 시 통과 유지(영위일수는 양도일·취득일에서 도출 → 추가 필수 입력 없음). 신규 필드는 optional |

### 1-6. Pre-Do anchor (memory `feedback_pre_anchor_verification`)

`__tests__/tax-engine/non-business-land/revenue-test.test.ts`에 추가(현재 FAIL 확보):
- **A1** 당해 영위 183일(2026-07-02 양도, 2026=평년 365), raw 25,000,000 / 토지가액 1,000,000,000 → 환산 = floor(25,000,000×365÷183) = 49,863,387 → 비율 ≈ 4.99% ≥ 3%(주차장) 사업용. (환산 없으면 2.5% 탈락)
- **A1b** 윤년 케이스 — 당해 영위 183일(**2024-07-02 양도, 2024=윤년 366**), raw 25,000,000 → 환산 = floor(25,000,000×366÷183) = 50,000,000(분자 366 검증). 평년식(365)이면 49,863,387과 달라야 함.
- **A2** 영위 = 해당연도 총일수(2026 연중 보유, 12/31 양도, 영위 365 = 총일수) → 환산 미적용, `annualizedCurrentRevenue = raw`, `annualizationApplied=false`.
- **A3** 당해 환산값이 ①·② 양쪽에 반영 — businessType `mineral_spring`(4%), 당해 183일·raw 25,000,000·토지가액 1,000,000,000 → 환산 49,863,387 → ①≈4.99%; 직전 full-year raw 120,000,000·토지가액 1,000,000,000 → ②=(49,863,387+120,000,000)/2,000,000,000≈8.49%. `actualRatio≈8.49%`(=②), 사업용. (②가 환산 당해를 분자로 씀을 단언)
- **A4** 직전 환산 — businessType `vehicle_repair_academy`(10%), 당해 full-year raw 40,000,000·토지가액 1,000,000,000(①=4%, 미달); 직전 200일·raw 100,000,000·토지가액 1,000,000,000 → 직전 환산 floor(100,000,000×365÷200)=182,500,000 → ②=(40,000,000+182,500,000)/2,000,000,000=11.125% ≥10% **사업용**. (직전 환산 없으면 ②=7%·①=4% 모두 미달 → 비사업용; 직전 환산이 판정을 뒤집음)
- 기존 R0~R3 회귀 유지(환산계수 1 = 영위일수 미제공 시 종전 동작).

### 1-7. SCOPE_OUT (본 작업 범위 외 — 명시)

§168의11③의 "연간수입금액"은 3개 호로 정의되나 본 작업은 **3호(영위기간 1년 미만 연환산)만** 구현. 나머지는 사용자가 입력하는 "당해/직전 수입금액"에 이미 반영된 것으로 간주:
- **§168의11③1호** — 전세·임대보증금의 부가가치세법 시행령 §65① 간주임대료 합산. (사용자가 수입금액에 포함 입력)
- **§168의11③2호** — 당해토지등·기타토지등 공통 수입금액의 토지가액 비율 안분. (실지귀속 구분 입력 전제)
- **§168의11② 후단** — 필지별 수입금액 구분 가능 시 필지별 비율 계산. (현행 엔진 자산-단위 일괄, 필지별 미구현)

→ 위 3건은 별도 triage. 연환산과 독립이므로 본 계획에 미포함(추후 필요 시 확장).

---

## 2. 요구 B — 토지가액 자동조회 UI (검증 우선)

### 2-1. 실측 결론: **이미 구현됨**

- 커밋 `f645a615`("비사업용 토지 토지가액·도시지역 여부 vWorld 자동조회") — **origin/master 포함 확인**(현 HEAD에서 3커밋 전).
- 버튼 `NblLandValueAutoFetchButton` — `OtherLandDetailSection.tsx:529`에서 업종 선택 시 **무조건 렌더**. "🔍 토지가액 자동조회 (당해·직전)" 클릭 → 공시지가×면적×지분 → `nblRevenueCurrentLandValue`/`nblRevenuePriorLandValue` 자동 채움.
- 컴포넌트 테스트 `__tests__/components/nbl-land-autofetch.test.tsx` 존재.
- image2에는 버튼이 없음 → **image2가 `f645a615` 병합 전 stale 화면**일 가능성 매우 높음.

### 2-2. E2E 검증 완료 (2026-06-29)

- 신규 스펙 `e2e/transfer-nbl-revenue-autofetch.spec.ts` 작성·실행 → **PASS**(3002 포트). 토지·농지 → 보유 상황 → 비사업용 토지 ON → 판정 도움 필요 → 기타 토지 → 업종 선택 → **"토지가액 자동조회" 버튼 + 당해/직전 토지가액 입력란 노출** 단언 통과.
- 결론: **image2는 `f645a615` 병합 전 stale 화면**. 사용자 dev 서버를 최신 master(또는 이 worktree, 3002)로 재시작하면 노출됨.

→ **요구 B는 신규 구현 불필요**(이미 존재·실증). E2E 스펙은 회귀 가드로 유지.

---

## 3. 작업 순서

```
0. (B) ✅ 완료 — E2E 버튼 노출 검증 PASS (stale 확정, 구현 불요)
1. (A) Pre-Do anchor A1·A1b·A2·A3·A4 작성·실행 (FAIL 확보)  → verify: A1 환산 미적용으로 실패
2. (A) 공유 deriveBusinessDays + 엔진 types + revenue-test 환산  → verify: A1·A1b·A2·A3·A4 통과, R0~R3 회귀 0
3. (A) Zod ⑫ 2필드 + 폼타입①·initial 2곳②·normalize③         → verify: tsc 0건
4. (A) 서버 매퍼⑭ buildRevenueTest 시그니처+영위일수 산정       → verify: 매퍼 단위 테스트
5. (A) UI⑤ 사업개시일·직전영위일수 입력 + preview, 결과카드⑦    → verify: 컴포넌트 render 테스트
6. Check: ui-engine-sync-checker + E2E(Network body nbl 신규필드) → verify: Zod 통과·엔진 도달 확인
```

## 4. 성공 기준

- [ ] A1·A1b·A2·A3·A4 anchor 통과 + 기존 R0~R3 회귀 0건
- [ ] 동기화 지점 전부(엔진·공유헬퍼·①②(2곳)③·⑫Zod·⑭매퍼·⑤⑦⑧)
- [ ] **⑫ Zod 2필드 grep 자가점검**(침묵 strip 방지) + E2E Network body에 신규 `nbl*` 필드 확인
- [ ] `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/non-business-land/` 통과
- [x] B: E2E 검증 완료(stale 확정)
- [x] 미결 설계 결정 §1-4 4건 사용자 확정(윤년 366·직전 환산 포함)
