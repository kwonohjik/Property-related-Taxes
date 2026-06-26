# 연도별 신고세액공제율(§69) 테이블 도입 — Plan

> 작업 워크트리: `.claude/worktrees/filing-credit-year` (branch `feat/filing-credit-year`, slot 2 / dev 3002 · e2e 3102)
> 작성일: 2026-06-26

## 1. 배경 · 문제

현재 신고세액공제(상증법 §69)율이 **연도 무관 3% 고정**이다.

- `lib/tax-engine/credits/filing-credit.ts:26` — `const FILING_CREDIT_RATE = 0.03;`
- 실제 신고세액공제율은 **상속개시일/증여일** 기준으로 단계 인하되어 왔다(10%→7%→5%→3%).
- 교재 "(3) 증여세 납부세액공제 사례2"(조부모 3차 세대생략) anchor 검증 시 **1차(2018.5.2) 증여만 ⑰⑱ 불일치** 확인:
  - 교재(2018년 5%): ⑰ 2,860,000 · ⑱ 54,340,000
  - 엔진(3% 고정): ⑰ 1,716,000 · ⑱ 55,484,000
  - ⑦~⑬(산출세액·§57 할증·§58 납부공제)는 1차도 전부 일치 — **신고세액공제 단계에서만** 어긋남.
- 기록: memory `feedback_filing_credit_rate_year_fixed`, anchor `__tests__/tax-engine/gift/payment-credit-textbook-cases.test.ts`.

## 2. 목표 (검증 가능한 성공 기준)

1. 신고세액공제율을 **상속개시일/증여일이 속하는 시점**의 연도별 율로 적용한다.
2. anchor 통과: 2016-12-31 = 10% · 2017 = 7% · 2018 = 5% · 2019-01-01 이후 = 3% (각 경계일 포함).
3. 교재 사례2 1차 재검증: ⑰ 2,860,000 · ⑱ 54,340,000 으로 갱신·통과.
4. 상속세 경로도 동일 적용(§69는 상속·증여 공통).
5. **기존 전체 테스트 회귀 0** (`npm test` 녹색). 2019년 이후 케이스(절대다수)는 3% 불변.

## 3. 법령 근거 (검증 상태)

연도별 신고세액공제율 — 기준일 = **상속개시일 / 증여일**:

| 적용 기간 (기준일) | 공제율 |
|---|---|
| ~ 2016-12-31 | 10% |
| 2017-01-01 ~ 2017-12-31 | 7% |
| 2018-01-01 ~ 2018-12-31 | 5% |
| 2019-01-01 ~ (현행) | 3% |

- **✅ 1차 법령 검증 완료 (2026-06-26)**: **법률 제14388호**(2016.12.20 공포, 2017.1.1 시행) §69 개정으로 본칙 10%→3%, **부칙 적용례**로 2017년 7%·2018년 5% 한시 적용. yeslaw 전문(공포 제208404)으로 "개정 전 10% / 2017=7% / 2018=5% / 2019=3%, 기준=상속개시일·증여일" 확인. 부칙 인용 "2018.1.1~2018.12.31 신고분은 100분의 3 대신 100분의 5" 직접 확인.
- 보강 출처: 국세청 항목별 설명, 경영지도사 블로그 "7%→5%→3%".

## 4. 설계

### 4.1 율 해석 함수 (filing-credit.ts 내부)

```ts
// 기준일이 속하는 시점의 §69 신고세액공제율. 연도 경계 = 해당 연도 1/1 ~ 12/31.
const FILING_CREDIT_RATE_TABLE = [
  { from: "2019-01-01", rate: 0.03 },
  { from: "2018-01-01", rate: 0.05 },
  { from: "2017-01-01", rate: 0.07 },
  { from: "0000-01-01", rate: 0.10 }, // 2016-12-31 이전
] as const; // 내림차순 — 첫 매칭 적용

function resolveFilingCreditRate(referenceDate?: string): number {
  if (!referenceDate) return 0.03; // 미전달 fallback = 현행율 (무회귀 안전판)
  const d = referenceDate.slice(0, 10);
  return FILING_CREDIT_RATE_TABLE.find((r) => d >= r.from)?.rate ?? 0.03;
}
```

> **catch-all 비대칭 주의(STEP1 #4)**: 테이블 최하단 `from:"0000-01-01"`은 "2016-12-31 이전 = 10%" catch-all이고, `!referenceDate`(날짜 누락) fallback은 **3%**(현행, 무회귀 안전판)다. 두 기본값이 다른 것은 의도적 — 날짜가 *있는데* 과거면 10%, 날짜 자체가 *없으면* 안전하게 현행 3%. 호출처 2곳 모두 날짜를 보장하므로 `!referenceDate` 경로는 실질 도달 안 함(테스트로 명시).

- **상수 위치**: 역사 확정 데이터이므로 DB 아닌 정적 상수(기존 `FILING_CREDIT_RATE` 대체). CLAUDE.md "역사적 과세 데이터는 정적 상수" 원칙 준수.
- **경계 비교**: `Date < string` 함정 회피 위해 `YYYY-MM-DD` 문자열 사전식 비교(엔진 일관). `lib/api/date-coerce` 불필요(순수 문자열).

### 4.2 입력 확장 — `FilingCreditInput`

```ts
export interface FilingCreditInput {
  isFiledOnTime: boolean;
  taxBeforeFilingCredit: number;
  referenceDate?: string; // ← 신규 optional. 상속개시일/증여일. 미전달 시 3%.
}
```

- optional + fallback 3% → 호출 누락 시에도 컴파일·런타임 안전(무회귀).

### 4.3 호출처 2곳 — 날짜 전달

| 경로 | 파일·라인 | 전달 값 |
|---|---|---|
| 증여 | `inheritance-gift-tax-credit.ts:528` `calcFilingCredit({...})` | `referenceDate: giftDate` |
| 상속 | `inheritance-gift-tax-credit.ts:327` `calcFilingCredit({...})` | `referenceDate: deathDate` |

- **상속**: `calcInheritanceTaxCredits`가 이미 `deathDate?: string` 수신(line 169·193, `input.deathDate` 도처 사용) → 그대로 전달. 상속개시일은 필수 입력이라 fallback 도달 거의 없음.
- **증여**: `calcGiftTaxCredits`의 `GiftTaxCreditParams`에 날짜 없음 → `giftDate?: string` 필드 추가하고, `gift-tax.ts:303` 호출부에서 `giftDate: input.giftDate` 전달. (`GiftTaxInput.giftDate`는 이미 존재.)

### 4.4 율 echo (result) + 표시 지점 동적화 — ★ STEP1 정정

**문제(실측)**: "× 3%"가 코드 6곳에 하드코딩 → 2018 증여 시 계산=5%인데 표시·신고서 양식=3% **dual-truth**. 현재 result는 `filingCreditBase`만 echo하고 **적용율은 echo하지 않음**.

**4.4.1 result echo 필드 추가** (`echo-field-pattern` 스킬):
- `FilingCreditResult`에 `appliedRate: number` 추가 → `calcGiftTaxCredits`/`calcInheritanceTaxCredits`가 credit echo로 상향 전파.
- **★ STEP3 파급 — 공용 카드 양쪽 echo 필수**: `TaxCreditBreakdownCard`는 **상속·증여 공용**(`GiftTaxResultView:511` + `InheritanceTaxResultView:262`, `credit` prop으로 율 수신). 따라서:
  - 증여: `creditResult` echo(`gift-tax.ts:385` 인근 `filingCreditBase` 옆)에 `filingCreditRate` 추가.
  - 상속: `result.creditDetail`(`InheritanceTaxResultView:263` `credit={result.creditDetail}`)에 `filingCreditRate` 추가.
  - **한쪽만 추가하면 다른 세목 카드는 `credit.filingCreditRate === undefined`** → 율 미표시/NaN. 양쪽 동시 필수.
- **출력 echo이므로 14지점 중 ⑦(결과)·신고서 양식만 — Zod(⑫)·API(⑬⑭)·validation(⑧) 무관**.
- **★ STEP10 파급 — 이력 호환 가드**: `filingCreditRate`는 신규 echo라 **기존 IndexedDB 저장 이력엔 없음**(과거 계산 재표시 시 `undefined`). 표시 6곳 모두 **`credit.filingCreditRate ?? 0.03`** fallback 적용 — 미적용 시 과거 이력 카드에서 NaN/공란. 필드는 result 타입에 **optional(`filingCreditRate?: number`)** 로 정의(`echo-field-pattern` 호환성 보장). number 단일값이라 Map→JSON 소실(`feedback_engine_result_map_json_loss`) 무관.

**4.4.2 표시 지점 동적화 (6곳)**:

| 위치 | 현재 | 정정 |
|---|---|---|
| `filing-credit.ts:82` | `` `신고세액공제 (3%)` `` | `` `신고세액공제 (${율}%)` `` |
| `TaxCreditBreakdownCard.tsx:261` | `… × 3%` | `… × ${filingCreditRate}%` |
| `TaxCreditBreakdownCard.tsx:264` | `× 3% =` | echo 율 바인딩 |
| `TaxCreditBreakdownCard.tsx:464` | `label="신고세액공제 (3%)"` | echo 율 |
| `gift-filing-form-rows.ts:79` | `(… − §59) × 3%` | echo 율 (formula 빌더에 `filingCreditRate` 인자 추가) |
| `gift-filing-form-rows.ts:82` | `${baseRow} × 3%` | echo 율 |

**4.4.3 동적화 제외 (판단)**:
- **besshi10 별지10호 ㊵행**(`gift-tax-filing-form-besshi10.ts:148`): 신고세액공제를 **금액만**(`display:"amount"`, formula 없음) 표시 → 율 문자열 없음 → 동적화 **N/A**.
- **입력 안내 텍스트** `GiftCreditChecklist.tsx:166-167`·`BurdenedGiftBlock.tsx:386`의 "3%": 계산 결과가 아닌 일반 입력 안내(현행 기준 설명). 과거 연도 계산값과 무관 → 현행 3% 표기 유지(동적화 불필요). Do에서 재확인.

## 5. 14개 동기화 지점 영향 분석

순수 **엔진 내부 율 변경 + 출력 echo 1필드**(`filingCreditRate`). 신규 **사용자 입력** 필드는 없음(날짜는 이미 input에 존재).

| 지점 | 영향 |
|---|---|
| ①폼상태 ②initial ③normalize ④API변환 ⑤UI위젯 ⑥사이드바 ⑧validation | **변경 0** — 신규 입력 없음 |
| ⑦결과카드 | `TaxCreditBreakdownCard` 3곳 율 동적화(echo `filingCreditRate` 바인딩) |
| **신고서 양식** | `gift-filing-form-rows.ts` formula 2곳 율 동적화 (별지 서식 PDF 재현 정합) |
| ⑨~⑭ Zod·Route | **변경 0** — `referenceDate`는 엔진 내부에서 `giftDate`/`deathDate`로 채움. `filingCreditRate`는 출력 echo(입력 아님) → API 신규 필드 없음 |

→ 실질 변경: ⑦ 결과카드 3곳 + 신고서 양식 2곳 + 엔진 율 로직. result echo 1필드(출력). 브라우저 확인: 2018 증여 → 결과카드·신고서 모두 "5%" 표시.

## 6. 테스트 anchor (Pre-Do 우선)

신규 파일 `__tests__/tax-engine/gift/filing-credit-year-rate.test.ts`:

1. **연도 경계 (증여)** — 동일 과표로 referenceDate만 변주:
   - 2016-12-31 → 10% · 2017-01-01 → 7% · 2017-12-31 → 7% · 2018-01-01 → 5% · 2018-12-31 → 5% · 2019-01-01 → 3%
2. **상속세 동일 적용** — deathDate 2018 → 5% anchor 1건.
3. **교재 사례2 1차 갱신** — 기존 `payment-credit-textbook-cases.test.ts`의 1차 anchor:
   - `totalTaxCredit` 1,716,000 → **2,860,000**, `finalTax` 55,484,000 → **54,340,000** 로 수정.
   - "⚠️ 신고세액공제 불일치" 주석 → "교재 5% 완전 일치"로 환류.
4. **echo 율 검증** — 2018 케이스 결과에 `filingCreditRate === 0.05`, 2023 케이스 `=== 0.03` anchor (표시 동적화 소스 정합).
5. **표시 동적화** — 신고서 양식(`gift-filing-form-rows`) formula 문자열이 2018 케이스에서 "× 5%"를 포함하는지 row 단위 anchor.
6. **무회귀** — 2차(2020·3%)·3차(2023·3%) 자진납부세액 160,147천 / 465,309천 불변 확인. `npm test` 전체 녹색.

> Pre-Do: 위 (1) 경계 anchor를 먼저 작성·실행하여 **실패 확보**(현행 3% 고정이라 10/7/5% 케이스 실패) 후 구현 진입 (policy `feedback_pre_anchor_verification`).

## 7. 작업 순서 (Do)

1. Pre-Do anchor 작성 → 실행 → 실패 확인 + §69 부칙 KoreanLaw 최종 검증.
2. `resolveFilingCreditRate` + `FILING_CREDIT_RATE_TABLE` 구현, `calcFilingCredit` 율 동적화 + 라벨 + `FilingCreditResult.appliedRate` echo.
3. `FilingCreditInput.referenceDate` 추가.
4. 호출처 2곳 날짜 전달(증여: `GiftTaxCreditParams.giftDate` 추가 + gift-tax.ts 전달 / 상속: deathDate 전달) + `filingCreditRate` result echo 상향 전파(`gift-tax.ts:385` 인근 + 상속 동형).
5. 표시 동적화 6곳: `TaxCreditBreakdownCard` 3곳 + `gift-filing-form-rows` formula 2곳 + `filing-credit.ts` 라벨 — echo `filingCreditRate` 바인딩.
6. anchor 통과 확인 → 교재 1차 anchor 갱신 → `npx vitest run __tests__/tax-engine/gift/` `.../inheritance*` → `npm test` 전체.
7. 하드코딩 "× 3%" 잔존 grep 0 확인 + 브라우저 1건(2018 증여 → 결과카드·신고서 "5%" 표시).
8. memory `feedback_filing_credit_rate_year_fixed` 갱신(한계 → 해소) + ship.

## 8. 리스크 · 미검증 (확인 필요)

- ~~부칙 정확 시행일~~ **✅ 해소** — 제14388호 부칙 1차 검증 완료(§3 참조). 10% 본칙 적용 하한은 1990년대 이전 추가 인하 가능성 있으나 실무 부재로 scope-out(테이블 최하단 10% 단일).
- **상속·증여 율 동일성**: §69 단일 조문이라 동일 추정 — 부칙에서 상속/증여 적용시점 표현 차이 점검.
- **10% 이전(1990년대 이전) 추가 인하·면제 구간**: 실무 거의 없음 → **scope-out**(테이블 최하단 10% 단일). 필요 시 후속.
- **단기재상속·외국납부공제 차감 후 기준세액(`taxBeforeFilingCredit`)**: 율만 변경, 기준액 산식 불변 — 회귀 없음 확인.

## 9. 후속 제안

- 본 plan 확정 후 `plan-self-review`(13단계 독립 검토) 또는 `pre-do-anchor-verification` 스킬로 진입 권장.
