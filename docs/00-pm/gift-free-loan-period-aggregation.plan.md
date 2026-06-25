# 금전무상대출 §41의4② 기간 안분 + §43② 합산 — 작업계획서 (PLAN)

> 목표: 교재 "11. 금전무상대출 증여이익 계산사례"(이미지31) **사례1·2 완전 재현**.
> 브랜치: `feat/gift-free-loan-41-4` (worktree `gift-free-loan-41-4`)
> 작성일: 2026-06-25 · 선행 검토: `gift-deemed-transfer.plan.md` 13단계 재검토에서 갭 도출
> 법령 검증: KoreanLaw MCP 실측 (상증법§41의4·§43, 상증령§31의4·§32의4, 상증칙§10의5, 법인세법시행규칙§43②)

---

## 0. 배경 — 현황과 갭

§41의4 금전무상대출 **단건 1년분**은 이미 구현 완료(`free-loan.ts`·`FreeLoanInput`·anchor 3종·UI `FreeLoanFields`). 그러나 이미지31 계산사례 2개는 현재 구조로 **재현 불가**:

| 사례 | 요구 기능 | 현황 |
|---|---|---|
| **사례1** 10억·2022.1.2~2023.12.31·연3% | §41의4② **다년 분할 + 마지막 해 일수 안분(364/365)** | ❌ `FreeLoanInput`에 기간 필드 없음. "UI 안내"로만 격하(engine.design:281) |
| **사례2** ㉮3억3%·㉯1억무상·㉰5억2.6% | §43² **1년 이내 동일거래 합산** | ❌ 합산 레이어 부재(router.ts:68 주석만). 건별 1천만 임계가 합산 차단 |

---

## 1. 목표 · 범위

### 재현 목표 (anchor 동결)

**사례1** — 10억원, 2022.1.2.~2023.12.31., 연 3% (저리, §41의4①2호):
- 1년차(증여일 2022.1.2., 2022.1.2~2023.1.1 = 365일): `10억 × (4.6% − 3%) = 16,000,000`
- 2년차(증여일 2023.1.2., 2023.1.2~2023.12.31 = 364일): `16,000,000 × 364/365 = 15,956,164`
- 두 건은 **별개 증여**(§41의4② "매년 새로 대출받은 것으로 본다") — **합산 금지**.

**사례2** — 1년 이내 수차례 대출(기간 약정 없음 → 각 1년, §41의4②):
- ㉮ 2022.5.4. 3억 3% → `3억×(4.6%−3%) = 4,800,000`
- ㉯ 2022.9.20. 1억 무상 → `1억×4.6% = 4,600,000`
- ㉰ 2023.4.25. 5억 2.6% → `5억×(4.6%−2.6%) = 10,000,000`
- §43² 1년 이내 동일거래 합산 → 증여시기 = 합산액 1천만 도달일 **2023.4.25.**, 합계 **19,400,000**
- ※ ㉮·㉯ 개별로는 1천만 미만이나 **합산 후** 과세 (상증령§32의4).

### 범위 외 (Out of Scope)
- 법인으로부터의 대출 예외(상증령§31의4① 단서·법인세법시행령§89③ 가중평균차입이자율) — 사례 무관. **차단 아닌 미지원**(개인간 4.6% 기본). R-3.
- §43② 합산의 **타 조문**(§35·§37·§38 등) 일반화 — 본 작업은 **§41의4 동일거래 합산만**. 구조는 조문별 그룹 확장 가능하게.
- §43① 중복배제는 기구현(`dup-exclusion.ts`) — 변경 없음.

---

## 2. 법령 근거 (KoreanLaw 실측 확정)

| 항목 | 근거 (위임 체인) | 값/문언 |
|---|---|---|
| 산식(무상) | 상증법§41의4①1호 | `대출금액 × 적정이자율` |
| 산식(저리) | 상증법§41의4①2호 | `대출금액 × 적정이자율 − 실제지급이자` |
| 적정이자율 4.6% | §41의4④→상증령§31의4①→상증칙§10의5→**법인세법시행규칙§43②**("1,000분의 46") | 4.6% (2016.3.7~) |
| 기준금액 1천만 | §41의4① 단서→상증령§31의4② | 10,000,000 |
| 다년 재대출 의제 | **상증법§41의4②** | "1년 되는 날의 다음 날에 매년 새로 대출받은 것으로 본다" |
| 일수 안분(364/365) | ⚠️ **명문 없음** — §41의4② 의제 + 마지막 해 실제 364일에서 **법리 도출** | 분모 365(교재). 윤년 366은 명문 부재 |
| 합산 | 상증법§43② + **상증령§32의4** "이익별로 합산하여 금액기준을 계산" | 1년 소급, 조문별(§41의4끼리) |
| 합산 대상 12조문 | 상증법§43② 본문 | §31①2호·§35·§37~§39·§39의2·§39의3·§40·§41의2·**§41의4**·§42·§45의5 (실측 일치) |

> **인용 정책**(`feedback_korean_law_citation_verify`): 적정이자율 상수 주석에 **4단 체인 전부** 기재. 일수안분 주석에 "§41의4② 의제 도출 — 일수/365 명문 조항 없음" 명시.

---

## 3. 케이스 매트릭스 (전수 enumerate — `feedback_ui_input_path_enumeration`)

### A. 단건 (기존 — 회귀 보존)
| ID | 케이스 | 입력 | 기대 |
|---|---|---|---|
| LOAN-1 | 무상 3억 | 무이자 | 13,800,000 (적용) |
| LOAN-2 | 저리 5억·이자500만 | | 18,000,000 (적용) |
| LOAN-3 | 무상 2억 | | 미적용(920만<1천만) |
| LOAN-4 | 비특수+정당사유 | §41의4③ | 미적용 |

### B. 다년 분할 §41의4② (신규)
| ID | 케이스 | 기대 |
|---|---|---|
| **PERIOD-1** | 사례1 10억·2년·연3% | 1년차 16,000,000 + 2년차 15,956,164 (별개 증여, periodBreakdown) |
| PERIOD-2 | 정확히 2년(마지막 해도 365일) | 두 해 모두 16,000,000 (안분 없음) |
| PERIOD-3 | 기간 미정 | 1년으로 → 단건과 동일 |

### C. §43² 합산 (신규)
| ID | 케이스 | 기대 |
|---|---|---|
| **AGG-1** | 사례2 ㉮㉯㉰ 1년 이내 | 합계 19,400,000, 증여시기 2023.4.25. (개별 ㉮㉯ 미달도 합산) |
| AGG-2 | 1년 초과 분리 | 1년 밖 건 별도(미합산) |
| AGG-3 | 단건만 | 합산=단건 (회귀) |

---

## 4. 엔진 설계 방향 (시니어 상세화)

### 4.1 사례1 — §41의4② 다년 분할 (선례: `free-realestate-use.ts` §37)
- **선례 차용**: `periods[]` → `_calcMultiPeriod` → `periodBreakdown` 패턴. 각 연도 별개 증여, `deemedGiftValue=첫 window`(합산 금지, §37 line 131-134와 동일 법리).
- **§41의4 고유 추가**: 마지막 해 **일수 안분** = `floor(연이익 × 실제일수 / 365)`. §37엔 없음.
  - 연이익 = `applyRateFraction(loanAmount, rate.numer, rate.denom) − 실제이자` (1년 full 기준)
  - 마지막 window 일수 = `differenceInDays(loanEndDate, lastWindowStart) + 1` (포함 일수)
  - 안분 = `safeMultiplyThenDivide(연이익, 일수, 365)` (정수경로 floor, `feedback_safemul_decimal_apportion_precision`)
- **입력 확장**(`FreeLoanInput`): `loanStartDate?`·`loanEndDate?`(YYYY-MM-DD 문자열, 증여세 문자열 날짜 일관) 또는 미정 플래그. 둘 다 없으면 현행 단건(회귀 0).
- **분모 365 고정** (교재 기준, 윤년 366 명문 부재 — 주석).

### 4.2 사례2 — §43² 합산 (선례: `dup-exclusion.ts` §43①)
- **신규 `same-transaction-agg.ts`**: `aggregateSameTransaction(loans: FreeLoanRawBenefit[])` — 1년 이내 동일거래(§41의4) **raw benefit 합산 후** 1천만 판정.
- **raw benefit 분리 (핵심 정정)**: free-loan.ts의 건별 임계판정과 benefit 산출을 분리. raw benefit은 항상 노출(이미 `thresholdEcho.benefit` 존재) → 합산 레이어가 소비. **개별 applied=false여도 raw benefit 합산** (AGG-1의 ㉮㉯ 누락 차단).
- **조문별 그룹**(상증령§32의4): §41의4 이익은 §41의4끼리만 합산. MVP는 §41의4 단일 그룹.
- **증여시기**: 누적 raw benefit이 1천만 도달하는 거래일.
- **입력 구조**: 다건 free_loan 배열. 신규 DeemedGiftType(예: `free_loan_aggregated`) 또는 free_loan 입력에 추가거래 배열 — 시니어 결정(§37 periods 패턴 vs cap-table 별도 dispatch 선례 `capital_increase_allocation` 참고).

### 4.3 정수 연산 (강제 — `feedback_applyrate_fractional_rate_one_won_error`)
- 일수 안분: `safeMultiplyThenDivide(연이익, 일수, 365)` — `floor(연이익 × 364 / 365)`. 16,000,000×364/365 = 15,956,164.38 → **15,956,164**.
- 합산은 raw benefit(정수) 단순 합 → floor 잔액 문제 없음.

---

## 5. 14 동기화 지점 (신규 필드)

신규: `loanStartDate`·`loanEndDate`(다년) + 다건 대출 배열(§43²) + 결과 `periodBreakdown`·합산 echo.

①폼상태 → ②initial → ③normalize → ④API변환(`gift-deemed-api.ts`) → ⑤UI위젯(대출기간 DateInput·다건 테이블) → ⑥결과 산식(연도별·합산 breakdown) → ⑦결과 카드 → ⑧validation → ⑨⑩Zod enum → ⑪N/A → **⑫Zod 입력객체**(기간·배열 필드) → **⑬fetch body** → **⑭Route 엔진 매핑**(날짜 문자열 그대로, date-coerce N/A).
> ⑫⑬⑭ TS 미감지 → grep 자가점검. (`feedback_api_zod_schema_sync`)

---

## 6. 테스트 — anchor 동결 (이미지31 원단위)

`__tests__/tax-engine/gift-deemed/free-loan-period-agg.test.ts` (또는 기존 anchor 파일 확장):
- **PERIOD-1**: 1년차 `toBe(16_000_000)` + 2년차 `toBe(15_956_164)` (일수안분).
- **AGG-1**: 합계 `toBe(19_400_000)`, 증여시기 2023-04-25, 개별 ㉮ 4,800,000·㉯ 4,600,000·㉰ 10,000,000 echo.
- 경계: PERIOD-2(안분 없음), AGG-2(1년 초과 분리), 기존 LOAN-1~4 회귀.
- (`feedback_pdf_example_test_anchoring` — 교재 사례 원단위 고정)

---

## 7. 리스크

| # | 항목 | 처리 |
|---|---|---|
| R1 | 일수 안분 분모 365/366 명문 부재 | 365 고정(교재). 주석 명시. 윤년은 후속 필요 시 |
| R2 | §43² 입력 구조(배열 vs periods) | 시니어 설계 — §37 periods·cap-table allocation 선례 비교 |
| R3 | 법인 대출 예외 | 범위 외(개인간 4.6% 기본). 미지원 명시 |
| R4 | 회귀 — 기존 단건 free_loan | 기간·배열 미입력 시 현행 경로 100% 보존. LOAN-1~4 anchor 회귀 |
| R5 | 다년+합산 동시? | 사례는 분리(사례1=다년 단일대출, 사례2=다건 1년). MVP 각각 독립 처리 |

---

## 8. Definition of Done
- [ ] 케이스 매트릭스 A·B·C 전 분기 anchor
- [ ] Pre-Do anchor: PERIOD-1(15,956,164) + AGG-1(19,400,000) 우선 실행 → 실패 확보 → 환류
- [ ] `free-loan.ts` raw benefit 분리 (회귀 보존)
- [ ] `same-transaction-agg.ts` 신규 + router 통합
- [ ] 14 동기화 지점 (⑫⑬⑭ grep)
- [ ] 적정이자율·일수안분 인용 체인 주석 (KoreanLaw 4단)
- [ ] `npx tsc --noEmit` 0 / `npm run lint` 0
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 통과 + 전체 회귀
- [ ] E2E: 다년·다건 입력 → 결과
- [ ] 기존 `gift-deemed-transfer.plan.md` stale 표기 보강(별건)

---

## 9. 산출물
- `docs/02-design/features/gift-free-loan-period-aggregation.engine.design.md` (STEP 5)
- `docs/02-design/features/gift-free-loan-period-aggregation.ui.design.md` (STEP 12)
