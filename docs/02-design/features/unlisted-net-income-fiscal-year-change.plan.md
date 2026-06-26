# 작업계획서 — 비상장주식 순손익가치: 사업연도 변경 등에 대한 적용방법

> 대상: 「한국세무사회 2009 주식변동실무해설」 p.217~220 / 「상속세 및 증여세법 시행령」 §56·시행규칙 §17의3② 기반
> 비상장법인 1주당 최근 3년간 순손익액 가중평균 계산 시 **사업연도 변경·1년 미만 사업연도·합병** 적용방법
> 브랜치: `feat/unlisted-net-income-fy-change` (worktree slot 1, dev 3001 / e2e 3101)

---

## 0. 법령·예규 근거 (검증 완료)

| 구분 | 근거 | 검증 |
|---|---|---|
| 가중평균 산식 `{(전1년×3)+(전2년×2)+(전3년×1)}÷6`, 음수 시 0 | 상증령 §56① | ✅ KoreanLaw MCP 본문 확인 (현행, 시행 20260227) |
| 사업연도 1년 미만 시 1년으로 환산 | 상증규 §17의3② | ✅ KoreanLaw MCP 본문 확인 (현행, 시행 20260320) |
| 각 사업연도 주식수 = 각 사업연도 종료일 현재 발행주식총수 | 상증령 §56③ | ✅ 본문 확인 — ③ 합병 "합병후 발행주식총수" 처리 근거 |
| 사업연도 변경 시 평가기준일 이전 1·2·3년 사업연도 식별 + 1년 미만 연환산 | 서서-152(2005.1.20.) | ⚠️ 예규 — **PDF가 1차 출처**(MCP 본칙 부재) |
| 합병 후 3년 미경과 합병법인 순손익액 합산 | 상증통 63-56…12, 서서-1071(2004.7.13.), 재재산-181(2020.2.18.) | ⚠️ 예규/통칙 — **PDF가 1차 출처** |

> 정책: 예규·통칙 값은 메모리 `feedback_historical_statute_value_via_tribunal`·`feedback_pdf_example_test_anchoring`에 따라 **PDF 사례를 동결 anchor**로 사용. 추정 인용 금지.

---

## 1. 현황 (실측, file:line)

### 1.1 이미 구현된 부분 — **재사용·검증 대상**

| 기능 | 위치 | 비고 |
|---|---|---|
| 1주당 가중평균 `(y1×3+y2×2+y3×1)/6` floor·음수0 | `lib/tax-engine/property-valuation/weighted-avg.ts:26-34` `calcWeightedAvg3y` | 산식 단일 진실 |
| 1주당 순손익가치 = 가중평균÷환원율 | `weighted-avg.ts:46-52` `calcPerShareNetIncomeValue` | |
| **§17의3② 1년 미만 연환산** `perShare×12/개월수` | `lib/tax-engine/property-valuation/fiscal-year-annualize.ts:51-59` `annualizePerShareNetIncome` | **이미지 ① 본체 — 구현 완료** |
| 개월수 계산 `monthsBetween`(절상옵션) | `fiscal-year-annualize.ts:28-36` | `differenceInCalendarMonths+1` |
| 연환산 적용 순서(1주당 산출 후·가중평균 직전) | `lib/tax-engine/property-valuation/unlisted-orchestrator.ts:129-142` | |
| 입력: 사업연도 시작일·종료일·순손익 | `lib/tax-engine/types/unlisted-stock-valuation.types.ts:48-86` `FiscalYearAdjustment` (`fiscalYearStartDate?`·`fiscalYearEndDate`) | |
| 연환산 echo 결과필드 | `unlisted-stock-valuation.types.ts:302-307` `annualizationApplied`·`annualizedPerShareNetIncome` | |
| 연환산 UI 명세 카드 | `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:139-151` | amber 카드 |
| 순자산 단독평가(3년 미만 등) §54④ 분기 | `lib/tax-engine/property-valuation-stock.ts:592-614` + orchestrator:255-277 | 이미지 ① 표 "2021.12.31 순자산가치 평가" 대응 |

> **enum 주의**(검토 1-2): 순자산 단독사유는 **두 별개 타입**이 매핑된다 — UI/EstateItem측 `UnlistedAssetValueOnlyReason`(`inheritance-gift-estate.types.ts:493`, 값 `stock_80`) ↔ 엔진측 `UnlistedNetAssetOnlyReason`(`unlisted-stock-valuation.types.ts:16-21`, 값 `stock_holding_80`), 변환 `property-valuation-stock.ts:458` `Record<...>`. 합병 영역은 이 enum과 무관하나, 신규 enum 추가 시 동일하게 **두 타입 동기화** 필요(메모리 `enum-verification-before-mapping`).

### 1.2 미구현 — **신규 개발 대상**

| 기능 | 현황 |
|---|---|
| ③ 합병법인/피합병법인 순손익액 합산 (합병후 발행주식총수 기준 1주당 재계산) | **없음**. `merger_split_business_change`·`merger_gift_section38`는 §56② 추정이익 갈음 *사유 라벨*만 존재(`estimated-profit-section-56-2.ts:23-30`) |
| ③ 다른 사업연도 법인간 합병 시 피합병 순손익 월수 안분(×해당월/12) | 없음 |
| ③ 합병일이 속한 피합병 사업연도 1년 미만 시 "합산되면 연환산 안 함" 예외 | 없음 |
| ② 평가기준일 → 전1/2/3년 사업연도 자동식별 | 없음(사용자가 3개 사업연도를 직접 입력하는 구조) |

---

## 2. 구현 범위 결정

세 영역을 **난이도·신규성**으로 분리. ①은 검증, ②는 검증+가이드, ③은 신규 엔진.

### 영역 ① 1년 미만 사업연도 연환산 — **검증만** (구현 완료 상태)
- 작업: 이미지38 사례를 anchor로 **회귀 검증**. 신규 코드 없음(또는 미세 보정).
- 핵심 케이스(이미지38, 사업개시 2019.3.1 → 2019연도 10개월):
  - **C1** 평가기준일 2022.12.31 → 전3년이 2020(12개월) → `{(㉱×3)+(㉰×2)+(㉯×1)}÷6`, 환산 **불필요**
  - **C2** 평가기준일 2022.12.30 → 전3년이 2019(10개월) → `{(㉰×3)+(㉯×2)+(㉮×12/10×1)}÷6`, 2019연도만 **환산**
  - **C3** 평가기준일 2021.12.31 → 사업연도 3년 미만 → **순자산가치 단독**(§54④ 2호, 기구현 `lt3y`)
- **Pre-Do anchor 우선**(메모리 `feedback_pre_anchor_verification`): C1·C2를 먼저 작성·실행 → 현행 엔진이 통과하는지 실측. "이미 됨 예상" 단정 금지. 실패 시 보정.

### 영역 ② 사업연도 변경 — **검증 + 입력 가이드** (신규 엔진 없음)
- 범위 명확화(검토 1-6): 평가기준일→전1/2/3년 사업연도 **자동식별은 구현하지 않는다**. 현행은 사용자가 전1/2/3년 사업연도 3개를 직접 골라 시작/종료일·순손익 입력하는 구조이며, 1년 미만이면 연환산이 자동 적용된다. 따라서 이미지39의 환산 패턴은 **현행 입력구조 + 기존 연환산으로 커버**된다. 작업은 anchor 검증 + 사용자 입력 가이드(hint)뿐.
- 검증 케이스(이미지39, 사업연도 변경일 2019.4.1):
  사업연도 분할 — ㉱ 19.1.1~19.3.31(3개월), ㉲ 19.4.1~20.3.31(12개월), ㉳ 20.4.1~21.3.31(12개월)
  - **C4** 평가기준일 **2021.3.31** → 전1/2/3년 모두 12개월 사업연도 귀속 → 환산 불필요
  - **C5** 평가기준일 **2021.3.30** → 전2년 사업연도가 3개월짜리 → 해당 연도 `×12월/3월` 환산
  - **C6** 평가기준일 **2021.4.30** → 환산 불필요
  > ⚠️ 위 C4~C6의 "어느 동그라미가 전 몇 년"인지는 PDF 표기(㉮~㉳)가 OCR상 불확실. **Design 단계에서 PDF 원본 표와 1:1 재대조하여 산식·anchor 동결**(메모리 `feedback_pdf_table_row_one_to_one_mapping`).
- 작업: anchor 검증 + (필요 시) "사업연도 변경 시 전1/2/3년 사업연도 선택" UI 안내 문구·hint 보강. 자동 안분 fallback 신설 **금지**(메모리 `feedback_no_silent_apportion_fallback`) — 미입력은 검증오류.

### 영역 ③ 합병 후 3년 미경과 합병법인 순손익액 — **신규 엔진** (핵심)
합병전 각 사업연도 1주당 순손익액 = **(합병법인 + 피합병법인 순손익액 합계) ÷ 합병후 발행주식총수** (상증령 §56③).
1년 미만 사업연도는 연환산하되, **합병일이 속한 피합병 사업연도가 1년 미만으로 합병후부터 합산되는 경우 연환산 제외**.

신규 사전계산 모듈 `merger-net-income.ts` 도입 → 3개 사업연도별 "합산 1주당 순손익액"을 산출 → 기존 `calcWeightedAvg3y`에 투입(엔진 산식 변경 0).

**3개 합병 시나리오(동결 anchor):**

- **사례㉮ 동일 사업연도 법인간 합병** (PDF p.218):

  | 연도 | 합병법인(주식수/순손익/1주당) | 피합병(주식수/순손익/1주당) | 합계(주식수/순손익/1주당) |
  |---|---|---|---|
  | 2005 | 1,000 / 100,000 / 100 | 500 / △50,000 / △100 | 1,500 / 50,000 / **33** |
  | 2006 | 1,000 / 200,000 / 200 | 500 / △75,000 / △150 | 1,500 / 125,000 / **83** |
  | 2007 | 1,500 / 300,000 / 200 | 소멸 | 1,500 / 300,000 / **200** |

  → 가중평균 `(200×3 + 83×2 + 33×1) ÷ 6 = 133원` ✅ **A-1 anchor**
  (각 연도 1주당 = 합계순손익 ÷ 합계주식수, floor)

- **사례㉯ 다른 사업연도 법인간 합병** (PDF p.219, A 12월말·B 6월말, 합병 2020.6.30, 증여 2022.10.31):

  | 평가기준일 전 | 순손익액 | 계산근거 |
  |---|---|---|
  | 1년(2021) | **600** | 합병법인 순손익액 |
  | 2년(2020) | **350** | A 300 + B(100×6/12) |
  | 3년(2019) | **450** | A 200 + B(100×6/12) + B(400×6/12) |

  → 피합병 사업연도(7.1~6.30)를 **6개월씩 안분**하여 양쪽 사업연도에 배분 ✅ **A-2 anchor**(순손익액 350·450 동결)

- **사례㉰ 1:0.5 합병비율** (PDF p.219~220, 합병등기 2021.6.30, 평가기준일 2022.2.1):

  | 연도 | 합병후 주식수 | 합산 순손익액 | 1주당 | 산출근거 |
  |---|---|---|---|---|
  | 2021 | 15,000 | 42,000,000 | **2,800** | 갑40,000,000 + 을2,000,000(을 7.1~12.31분, **연환산 안 함**) |
  | 2020 | 15,000 | 25,000,000 | **1,666** | 갑30,000,000 + 을(△5,000,000) **통산**(결손 0 처리 안 함), 합병후 15,000주 기준 |
  | 2019 | 10,000 | 20,000,000 | **2,000** | 갑만 존재 → 갑 2019 주식수 10,000 기준 |

  → 가중평균 `(2,800×3 + 1,666×2 + 2,000×1) ÷ 6 = @2,288` ✅ **A-3 anchor**

  핵심 규칙(PDF 주석 1~4):
  1. 피합병 합병일~기말 손익은 합병법인 손익에 이미 포함 → 연환산 안 함
  2. 합병 후 연도 주식수 = 합병후 발행주식총수(15,000)
  3. 피합병 결손금은 0으로 보지 않고 합병법인 이익과 통산
  4. 합병 전(2019) 연도는 합병법인만 존재 → 합병법인 그 해 주식수 기준

---

## 3. 설계 (영역 ③ 중심)

### 3.1 신규 입력 타입 (제안 — Design에서 확정)
**위치 확정**(검토 1-3): 별도 `MergerNetIncomeContext`를 신설하고 **`UnlistedStockValuationInput` 최상위 optional `mergerContext?`** 로 매단다. EstateItem이 `UnlistedStockValuationInput`을 품으므로 자동 포함. `FiscalYearAdjustment`(별지 양식 ①~㉒ 항목 구조)에는 합병 필드를 넣지 않는다 — 양식 행 오염 방지.

```ts
// merger-net-income.types.ts (신규) — 상세·확정형은 엔진설계 §2.1 참조
export interface MergerAcquirerYear { shares: number; netIncome: number; startDate: Date; endDate: Date; }
export interface MergerTargetYear   { netIncome: number; startDate: Date; endDate: Date; }
export interface MergerNetIncomeContext {
  mergerRegistrationDate: Date;
  acquirer: [MergerAcquirerYear, MergerAcquirerYear, MergerAcquirerYear]; // 합병법인 전1/2/3년
  targetFiscalYears: MergerTargetYear[];   // 피합병 전체 사업연도(가변 개수 — 한 역년에 복수 걸침 가능)
  postMergerShares: number;                // 합병후 발행주식총수(§56③)
}
// UnlistedStockValuationInput 에 추가:  mergerContext?: MergerNetIncomeContext;
```
> 설계 동기화(검토 6-1·6-2): `sameFiscalYear` 플래그·역년별 `target` 배열 폐기. 피합병 사업연도를 **목록**으로 받아 역년별 overlap 안분하는 단일 알고리즘으로 통합(㉮㉯㉰ 모두 처리).

### 3.2 신규 순수 함수 모듈 `lib/tax-engine/property-valuation/merger-net-income.ts`
**단일 통합 알고리즘**(분기 없음 — 상세·anchor 역산은 엔진설계 §3):
```
computeMergerPerShareNetIncome(ctx) → { perShare:[n,n,n], combined:[n,n,n], breakdown }
각 역년(acquirer 사업연도)마다:
  targetSum  = Σ 피합병 사업연도: netIncome × overlapMonths(피합병fy, 역년) / 12   // 월수 안분
  combined   = acquirer.netIncome + targetSum                                      // 음수 통산(절단 X)
  shares     = overlap 있으면 postMergerShares, 없으면 acquirer.shares(합병전 단독연도)
  perShare   = floor(combined / shares)
```
- 동일 사업연도(㉮㉰)는 overlap=12 → 피합병 순손익 전액 합산(자연 흡수). 합병 후 이미 합산된 기간은 목록에 없어 overlap=0(연환산 자동 skip).
- 산출된 `[전1년, 전2년, 전3년]` 1주당 순손익액을 **기존** `calcWeightedAvg3y`에 그대로 투입(단일 진실, 메모리 `feedback_ui_engine_dual_truth_avoidance`).
- 정수연산: `safeMultiplyThenDivide` 사용, 월수 안분은 BigInt round 검토(메모리 `bigint-round-half-up`). 1원 toleranc 정책 적용.
- **음수0 적용순서**(검토 1-5, 정책): 연도별 합산(`acquirer.netIncome + Σ target 안분`)은 **음수를 그대로 유지**(사례㉰ 주석3 — 피합병 결손금을 0으로 보지 않고 통산). 음수→0 절단은 **최종 `calcWeightedAvg3y` 단계에서만** 적용(§56①). 합병 모듈 내부에서 음수0 절단 금지.
- ✅ 사례㉯ 안분 알고리즘(검토 1-4 → 설계 §3 확정): "겹치는 월수"=*피합병 사업연도가 합병법인 역년과 겹치는 개월수*. 예 B 2018.7.1~2019.6.30 ∩ 2019역년 = 6개월 → `400×6/12=200`. **anchor 350·450 역산 검증 완료**(엔진설계 §3 A-2).

### 3.3 orchestrator 연결
`unlisted-orchestrator.ts`에서 `input.mergerContext` 존재 시 `perShareNetIncomes`를 `computeMergerPerShareNetIncome` 결과로 대체 → 이후 연환산 분기(line 130-133)는 **합병 케이스에서 조건부 skip**(PDF 주석1 규칙 — 합병일~기말 피합병분이 합병법인에 이미 포함되면 연환산 제외).
- **영업권용 companyWeighted 점검**(검토 1-7): `orchestrator.ts:177-179`의 회사 전체 순손익 가중평균(영업권 §59② 입력)도 합병 시 합산값을 반영해야 하는지 Design에서 확인. 1주당이 아닌 *총액* 기준이라 별도 합산 경로 필요할 수 있음 — 미확정.

---

## 4. 동기화 지점 (**8지점 확정** — 검토 1-1)

**API/Route(⑨~⑭) N/A 확정**: 비상장주식 평가는 **calc API 라우트를 거치지 않고 클라이언트에서 직접 엔진 호출**(별지 양식 클라이언트 사이드 계산). 실측 근거: `app/api/calc/inheritance·gift` Zod에 `fiscalYears`·`unlistedStock` 흔적 0건. `UnlistedStockValuationInput`은 `UnlistedStockV2Card.tsx`·`lib/calc/unlisted-stock-valuation-lookup.ts`에서 직접 소비. → **Date 직렬화 함정(JSON 경유) 없음** (클라이언트 메모리 내 Date 유지). 단 IndexedDB 복원 시 `normalize-restored-form-dates.ts` 경로는 Date 재수화 확인 필요.

영역 ③ 신규 입력필드 기준. (영역 ①②는 신규 필드 없음 → anchor 검증만)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx` 폼 상태 | 합병 컨텍스트(합병등기일·당사법인 연도별 주식수·순손익·합병후 주식수) |
| ② | initial | 동 store initial | 합병 OFF 기본(`mergerContext: undefined`) |
| ③ | normalize | `normalize-restored-form-dates.ts` 포함 | 3-state optional(메모리 `feedback_three_state_optional_mode_toggle`) + **IndexedDB 복원 시 Date 재수화** |
| ④ | 변환 | 클라이언트→엔진 input 매핑(`lib/calc/`) | `mergerContext` 패스스루(API 미경유 → JSON 직렬화 없음) |
| ⑤ | UI 위젯 | 신규 `MergerNetIncomeBlock.tsx`(`FiscalYearAdjustmentTable.tsx` 인근) | ㉮/㉯㉰ 토글, 당사법인 연도 카드 |
| ⑥ | 사이드바 합계 | 해당 summary | 합산 1주당 순손익 echo(0원 제외) |
| ⑦ | 결과 카드 | `PerShareValuationResultCard.tsx` | 합병 합산 명세 카드(연도별 합산근거 echo) |
| ⑧ | validation | `lib/calc/inheritance-validate-unlisted.ts` | 합병 ON 시 주식수·순손익·합병등기일·합병후주식수 필수. UI통과↔validate 모순 금지(메모리 `feedback_validation_sync_8th_point`) |

---

## 5. 실행 계획 (PDCA, pdf-case-replica-workflow 준용)

```
0. Design: PDF 원본 표(이미지38~41) 칸·산식 1:1 동결 → 케이스 매트릭스 표 확정
            (특히 C4~C6 동그라미 귀속, A-2 안분 월수)         → verify: PDF와 글자단위 일치
1. Pre-Do anchor: C1·C2(영역①) + A-1·A-3(영역③) 먼저 작성·실행 → verify: ①은 통과/③은 실패 확보
2. 영역① 검증: C1·C2·C3 anchor 통과 확인, 미세 보정만        → verify: 3건 green
3. 영역③ 엔진: merger-net-income.ts + types 신규 + 영업권 companyWeighted 합산 반영 점검(1-7) → verify: A-1=133, A-3=2288, A-2=350·450 green
4. orchestrator 연결 + 연환산 skip 분기                         → verify: 통합 anchor green
5. 영역② 검증 + UI hint 보강                                   → verify: C4~C6 green
6. UI(8지점): MergerNetIncomeBlock + 결과카드 + validation + IndexedDB 복원 Date 재수화(③) → verify: tsc 0, E2E 1건
7. 회귀: 비상장주식 평가 전체 anchor + npm test                 → verify: 회귀 0건(메모리 `feedback_blocking_validation_full_e2e_regression`)
```

### Anchor 동결 요약 (상수화 — 메모리 `feedback_pdf_example_test_anchoring`)
| ID | 입력 | 기대값 |
|---|---|---|
| C1 | 2019.3.1 개시, 평가 2022.12.31 | 전3년 환산 미적용 |
| C2 | 동, 평가 2022.12.30 | 2019연도 ×12/10 환산 적용 |
| C3 | 동, 평가 2021.12.31 | 순자산 단독(§54④ 2호) |
| A-1 | 사례㉮ 합계 1주당 33/83/200 | 가중평균 **133** |
| A-2 | 사례㉯ A·B 순손익+6월 안분 | 전2년 **350**, 전3년 **450** |
| A-3 | 사례㉰ 1주당 2,800/1,666/2,000 | 가중평균 **@2,288** |

---

## 6. 리스크·미결 (확인 필요 — 추정 금지)

1. **C4~C6 동그라미 귀속**: 이미지39 표의 ㉮~㉳ 매핑이 OCR 불확실 → Design에서 PDF 원본 재확인 필수. **미확인 상태로 anchor 단정 금지.**
2. **사례㉯ 가중평균 최종값**: PDF는 순손익액(350·450)까지만 제시, 1주당 환산·최종 가중평균 미기재 → anchor는 350·450 순손익액 단계까지만 동결.
3. ~~비상장 평가 API 경로~~ → **해결**(검토 1-1): calc 라우트 미경유 클라이언트 직접 호출 → **8지점 확정**.
4. **소멸법인 연도 처리**(㉮ 2007 "소멸"): target null 입력 경로 명확화.
5. **결손 통산 vs 음수0**: §56① 음수0은 *최종 가중평균* 단계. 사례㉰ 주석3은 *연도별 합산 전* 통산 → 적용 순서 혼동 주의(연도별 합산은 통산, 최종 가중평균만 음수0).

---

## 7. 결론

- 이미지 ①은 **이미 구현**되어 있어 anchor 회귀 검증이 주 작업.
- 이미지 ②는 현행 입력구조로 대부분 커버, **검증 + UI 가이드** 보강.
- 이미지 ③(합병)이 **유일한 신규 엔진** — `merger-net-income.ts` 사전계산 모듈 + 8지점 UI 동기화. 3개 사례(133·2288·350/450)를 동결 anchor로 PDF 100% 재현.
