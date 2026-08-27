# 사례 36 — 조합원입주권 양도 (4분기 + 비과세 + 12억 안분) — 엔진 설계

> 본 문서는 `transfer-tax-redevelopment.engine.design.md` 및 사례 44~48 디자인의 후속 확장.
> 입력 자료: PDF `조합원입주권_청산금불입_취득실가확인.jpeg` (예제 사례집 사례 36).
> 시점: 2026-05-14
> 본 PR 스코프: subject="right" 4분기 UI 게이트 해제 + 환산 + 청산금 수령 + §89①4호 가목 비과세 + 12억 안분 통합
> 케이스 번호: **case_36**
> 연동 계획서: `.claude/plans/case-36-right-to-move-in-with-settlement-pay.md` (4차 정정 누적 19건 반영본)
> **제외**: 36-A3 (승계조합원 + 입주권) — §95④ 승계취득일 기산 충돌로 별도 후속 PR

---

## 0. 자가검토 정정 이력 (엔진 디자인 초안 → 1차 보완)

엔진 코드(`types/transfer-redevelopment.types.ts` 실측) 확인 후 정정·보강:

| # | 항목 | 초안 | 정정 |
|---|---|---|---|
| 1 | 신규 타입 필드 수 | "신규 4필드 (priorHouseSatisfiedAtApproval + priorHouseHoldingMonths + priorHouseResidenceMonths + oneRightExemptionApplied)" | **신규 2필드만** (`priorHouseHoldingMonths` + `oneRightExemptionApplied`) + **기존 재사용 2필드** (`exemptionEligibleAtApproval` line 253 사례 47 도입 / `priorHouseResidenceMonths` line 197 사례 45 도입) |
| 2 | 헬퍼 트리거 조건 | "`priorHouseSatisfiedAtApproval=true`" | **`exemptionEligibleAtApproval=true`** (기존 필드 재사용 — 의미 완전 동일: 서면2016-법령해석재산-2705 기반 인가일 기준 자기선언) |
| 3 | 회귀 영향 분석 누락 | "subject 가드로 격리 — 회귀 안전" 단순 표기 | **3사용처 영향 분석 표 추가** — `redevelopment-lthd.ts:119-122` LTHD 가드 / `transfer-tax-redevelopment.ts:99-103` applySettlementExemption / 사례 45 회귀. subject="right" 가드로 사례 44~48 (apt) 경로 완전 격리 |
| 4 | LOC 추정 | "~80줄 (헬퍼 50 + 타입 10 + 매핑 20)" | **~70줄** (헬퍼 50 + 타입 5 + 매핑 15) — 신규 필드 1개 축소 반영 |
| 5 | ④ API 변환 명세 | "redev* 3필드 매핑" | **기존 2건 재사용 + 신규 1건만 추가** (redevPriorHouseHoldingMonths) |
| 6 | ⑫ Zod 스키마 명세 | "3필드 optional 추가" | **신규 1건만 추가** — 기존 2필드는 이미 스키마 정의됨 |

### UI 디자인 문서 연동 정정 (필수)

본 정정으로 인해 `transfer-tax-redevelopment-case-36.ui.design.md`에서도 다음 필드명 통일 필요:
- `redevPriorHouseSatisfiedAtApproval` → **`redevExemptionEligibleAtApproval`** (자산-수준 필드 prefix 적용, 기존 사례 47에서 도입된 필드 재사용)
- §⑥ ToggleCard 바인딩 필드 변경
- validate A/B 가드 조건 필드명 변경

> 이는 신규 필드 도입 부담을 1개로 축소하고, 기존 사례 45/47에서 검증된 의미·산식·UI 패턴을 그대로 재활용한다 (memory `feedback_design_law_cases` — 사례 1개 → 본문·단서·각호 분기 전수 설계 후 구현 정책 일관).

---

## Context

사례 44~48이 모두 **subject="apt" (완공 APT 양도)** 가정이었던 데 반해, 본 사례는 **subject="right" (입주권 자체 양도)** 분기를 본격 도입한다.

| 구분 | 완공 APT (사례 44~48) | 입주권 (본 PR — 사례 36) |
|---|---|---|
| 양도 자산 | 신축APT (부동산) | 조합원 입주권 (권리) |
| §94 분류 | §94①1호 (부동산) | **§94①2호 (권리)** |
| LTHD 적용 | 3분기 모두 표1·표2 | **인가전 분만** (§95② 단서 + §94①2호 권리 범위 외) |
| 청산금 분 LTHD | 보유기간별 적용 | **0** (§94①2호 + 시행령 §166①1호 산식 구조 외) |
| 인가후 기존주택분 | gain·LTHD 적용 | **gain=0** (§166⑤1호) |
| 12억 안분 (§89①3호 가목 단서) | 사례 45 본 분기 | 사례 36 본 PR (§89①4호 가목 단서) |
| 1세대1주택 비과세 | §89①3호 가목 | **§89①4호 가목** (1세대1입주권) |

근거 (★ law.go.kr KoreanLaw MCP 2026-05-14 사전 검증 의무):
- 소득세법 **§94①2호** — 조합원입주권은 "부동산을 취득할 수 있는 권리" → §95② 대상자산 범위 외
- 소득세법 **§89①4호 가목** — 1세대1입주권 비과세 (인가일 기준 §89①3호 가목 요건 + 양도일 1입주권 + 다른 주택 없음)
- 소득세법 **§89①4호 가목 단서** — 12억 초과 안분
- 소득세법 **§95② 단서** — 권리 분 LTHD 부존재
- 소득세법 **§95③ + 시행령 §160** — 고가 안분 산식
- 소득세법 시행령 **§166①1호** (입주권+pay 단순 합산)·**§166①2호 가목·나목** (입주권+receive 분리·축소)·**§166③** (환산)·**§166⑤1호** (인가전 보유기간)
- 소득세법 시행령 **§163⑥** (환산 모드 개산공제 3%)·**§164⑦ 본문** (PHD 2단계 P_A)

핵심 Pre-Do 발견 (2026-05-14, 엔진 코드 실측):
- `redevelopment-lthd.ts:208` 청산금 분 zeroBranch 이미 구현 — 근거 주석만 §94①2호 + §166①1호 구조로 정정
- `transfer-tax-redevelopment.ts:80` 12억 안분 게이트 **subject 무관 작동** — 변경 0 가능성
- `computeRightPay`(line 356)·`computeRightReceive`(line 390) 모두 존재 — 본 PR은 UI 게이트 해제 + 신규 비과세 헬퍼 + anchor 회귀
- §89①4호 가목 비과세 게이트는 **신규 헬퍼 `applyOneRightExemption`** 필수 (사례 47 `applySettlementExemption`은 청산금만 마스킹 — 입주권 전체 비과세는 별도)

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | subject | direction | 취득 모드 | 1세대1입주권 | 양도가 | LTHD | 비과세 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **CORE-36** | right | pay | 실가 | X | 5.2억 | 인가전 표1 30% | 일반과세 | §166①1호 + §95② + §166⑤1호 | PDF 예제 7 anchor | `redevelopment-right-case-36.test.ts` | ☐ **본 PR** |
| **36-A1** | right | pay | 환산 | X | 5.2억 | 인가전 표1 30% | 일반과세 | §166③ + §164⑦ + §163⑥ | 가정값 3 anchor | `redevelopment-right-case-36-estimated.test.ts` | ☐ **본 PR** |
| **36-A2-i** | right | receive | 실가 | X | 5.2억 | 인가전(축소) 표1 30% / 청산금 0 | 일반과세 | §166①2호 가목·나목 | 가정값 3 anchor | `redevelopment-right-case-36-receive.test.ts` | ☐ **본 PR** |
| **36-A2-ii** | right | receive | 환산 | X | 5.2억 | 인가전(축소) 표1 30% / 청산금 0 | 일반과세 | §166①2호 + §166③ | 가정값 3 anchor | `redevelopment-right-case-36-receive.test.ts` | ☐ **본 PR** |
| **36-A4-i** | right | pay | 실가 | O | ≤12억 | (의미 없음) | **전액 비과세** | §89①4호 가목 본문 | 가정값 2 anchor | `redevelopment-right-case-36-exemption.test.ts` | ☐ **본 PR** |
| **36-A4-ii** | right | receive | 실가 | O | ≤12억 | (의미 없음) | 전액 비과세 | §89①4호 가목 본문 | 가정값 2 anchor | `redevelopment-right-case-36-exemption.test.ts` | ☐ **본 PR** |
| **36-A5-i** | right | pay | 실가 | O | 15억 | 안분 후 표1 | §89①4호 단서 안분 | §89①4호 단서 + §95③ + §160 | 가정값 3 anchor | `redevelopment-right-case-36-exemption.test.ts` | ☐ **본 PR** |
| **36-A5-ii** | right | receive | 실가 | O | 15억 | 안분 후 표1 / 청산금 0 | §89①4호 단서 안분 | §89①4호 단서 + §166①2호 | 가정값 3 anchor | `redevelopment-right-case-36-exemption.test.ts` | ☐ **본 PR** |
| **36-A5-iii** | right | pay | 환산 | O | 15억 | 안분 후 표1 | §89①4호 단서 + 환산 | §89①4호 단서 + §166③ | 가정값 3 anchor | `redevelopment-right-case-36-exemption.test.ts` | ☐ **본 PR** |
| 36-G | apt | * | * | * | * | * | * | 사례 44~48 회귀 보존 | 기존 anchor 전수 | `case-44~48-*.test.ts` | ✅ 기존 |
| 36-A3 | right | pay/receive | * | * | * | §95④ 승계취득일 기산 | * | (충돌) | (미발견) | (TODO) | **후속 PR** |
| 36-B1 | right | * | * | * | * | * | 빈집소규모정비법 §29 사업시행계획 | (UI 옵션 기존) | (TODO) | **후속 PR** |
| 36-B2 | right | * | * | 다른 주택 1채 (일시적) | * | * | §89①4호 나목 | (미발견) | (TODO) | **후속 PR** |
| 36-B3 | right | * | * | * | * | 5년 이내 단기세율 | * | (검토 별도) | (TODO) | **후속 PR** |

**합계**: 본 PR 신규 anchor **29건** + 사례 44~48 회귀(전수). 31일 전 §0 계획서 4차 정정으로 산술 정합성 확보.

---

## CORE-36 핵심 anchor (PDF 예제 원단위 toBe)

입력 (PDF):
- 종전부동산 취득가 100,000,000 (2002-04-09)
- 관리처분 인가 2018-10-23 / 권리가액 300,000,000 / 비례율 1.05
- 청산금 불입액 90,000,000 (pay)
- 입주권 양도 520,000,000 (2023-03-02)
- preApprovalExpenses = 0, postApprovalExpenses = 0

| 항목 | 값 | 산식 / 근거 |
|---|---|---|
| `split.preApproval.gain` | 200,000,000 | 300,000,000 − 100,000,000 − 0 − 0 (`redevelopment-split.ts:175`) |
| `split.settlement.gain` (인가후 단순합산) | 130,000,000 | 520,000,000 − (300,000,000 + 90,000,000) − 0 (`computeRightPay`) |
| `split.postApprovalExistingHouse.gain` | **0** | §166⑤1호 (입주권 양도 시 인가후 기존주택분 양도차익 부존재) |
| `lthd.preApproval.rate` | 0.30 | 보유 2002-04-09 ~ 2018-10-23 = 16년 6개월 → 표1 30% 캡 |
| `lthd.preApproval` deduction | 60,000,000 | 200,000,000 × 30% |
| `lthd.settlement` | 0 | §94①2호 + 시행령 §166①1호 산식 구조 외 |
| `total.taxableIncome` | 270,000,000 | (200M − 60M) + (130M − 0) |
| `taxBase` | 267,500,000 | 270M − 기본공제 2,500,000 |
| `calculatedTax` | (양도연도 2023 §55 누진표 직접 계산값 anchor — Pre-Do 확정) | 외부 PDF 추종 금지 |
| `localIncomeTax` | (calculatedTax × 10%) | 동상 |

> CORE-36 anchor 5건 + 산출세액 1건 + 지방세 1건 = **7 anchor** (Pre-Do 우선 검증 — 엔진 변경 없이 PDF 값 일치 확인).

---

## 36-A1 환산모드 anchor (가정값)

입력 (CORE-36 기반 + 환산):
- D (managementDisposalHousingPrice) = 400,000,000
- P_A (acquisitionHousingPrice, §164⑦ 미발동 가정) = 120,000,000
- useEstimatedAcquisition = true / preApprovalExpenses = 0

| 항목 | 값 | 산식 |
|---|---|---|
| 환산취득가 | 90,000,000 | floor(300,000,000 × 120,000,000 / 400,000,000) (`§166③`) |
| 개산공제 (§163⑥) | 3,600,000 | floor(120,000,000 × 0.03) (`redevelopment-split.ts:160-169`) |
| `split.preApproval.gain` | 206,400,000 | 300,000,000 − 90,000,000 − 3,600,000 − 0 |

---

## 36-A2 receive anchor (가정값)

입력 (CORE-36 입력에서 direction만 receive, settlementAmount=90,000,000, 실가 모드):

| 항목 | 값 | 산식 (`redevelopment-settlement.ts:136` `splitReceive`) |
|---|---|---|
| salePriceTotal | 210,000,000 | rightsValue − settlementAmount = 300M − 90M |
| 안분취득가 | 30,000,000 | floor(100,000,000 × 90,000,000 / 300,000,000) |
| `split.settlement.gain` | 60,000,000 | max(0, 90,000,000 − 30,000,000) |
| `split.preApproval.gain` (축소) | 140,000,000 | floor(200,000,000 × 210,000,000 / 300,000,000) |
| `lthd.preApproval` deduction | 42,000,000 | 140,000,000 × 30% |
| `lthd.settlement` | 0 | §94①2호 + §166①2호 가목 구조 외 |

36-A2-ii (환산 + receive)는 위 + 환산취득가 90,000,000으로 oldAcq 치환.

---

## 36-A4 비과세 anchor (가정값)

- CORE-36 + householdHousingCount=0 + householdRightCount=1 + **`exemptionEligibleAtApproval=true` (기존 필드 재사용)** + transferPrice ≤ 12억
- 결과: `oneRightExemptionApplied = true` / `total.gain = 0` / `total.lthd = 0` / `calculatedTax = 0` / `localIncomeTax = 0`
- 36-A4-ii: receive 분기에서도 동일 (`applyOneRightExemption`이 settlement·preApproval·postApprovalExistingHouse 3분기 모두 마스킹)
- **회귀 가드**: subject="apt" + `exemptionEligibleAtApproval=true` 시 사례 45/47 기존 경로 그대로 작동 — `applyOneRightExemption`는 subject="right" 가드로 미진입

---

## 36-A5 12억 안분 anchor (가정값)

입력 (CORE-36 + transferPrice=**1,500,000,000원 (15억)** + 36-A4 비과세 토글 ON):

**pay 분기** (36-A5-i):
- preApprovalGain = 200,000,000
- settlement.gain (단순합산) = 1,500,000,000 − 390,000,000 = 1,110,000,000
- ratio = (1,500,000,000 − 1,200,000,000) / 1,500,000,000 = 0.2
- 인가전 과세분 = 40,000,000
- 청산금 과세분 = 222,000,000
- 인가후 기존주택분 = 0
- 인가전 LTHD (안분 후) = 40,000,000 × 30% = 12,000,000

> §6.5 계획서 산식 4차 정정 반영 — `transfer-tax-redevelopment.ts:80` 게이트 subject 무관 자동 작동 (Pre-Do anchor로 자동 검증).

---

## 엔진 변경 영역

| 파일 | 변경 |
|---|---|
| `redevelopment-split.ts` | 검증만 (변경 0) |
| `redevelopment-valuation.ts` | 검증만 (subject 무관 작동) |
| `redevelopment-lthd.ts:208` | **주석만 정정** — "§94① 범위 외" → "§94①2호 + 시행령 §166①1호 산식 구조 외" |
| `redevelopment-settlement.ts` | 검증만 |
| `transfer-tax-redevelopment.ts:80` 12억 안분 게이트 | 검증만 (subject 무관) |
| `transfer-tax-redevelopment.ts` 비과세 | **신규** `applyOneRightExemption()` 헬퍼 ~50줄. Step A.5 후·Step B 전 삽입. 트리거: subject="right" + **exemptionEligibleAtApproval=true (기존 필드 재사용)** + householdHousingCount=0 + householdRightCount=1 + transferPrice ≤ 12억. 모든 조건 충족 시 total.gain·total.lthd 모두 0 마스킹. > 12억 시 미적용(36-A5 안분 경로 진입) |
| `types/transfer-redevelopment.types.ts` | **신규 1필드만**: `RedevelopmentInfo.priorHouseHoldingMonths?: number` (C-1 안전장치 a 자동 검증용 — 보유월수). **기존 재사용 2필드**: `exemptionEligibleAtApproval`(사례 47 도입, 사용자 자기선언 토글) + `priorHouseResidenceMonths`(사례 45 도입, 거주월수). **신규 결과 플래그**: `RedevelopmentResult.oneRightExemptionApplied?: boolean` |

총 변경 LOC 예상: 엔진 **~70줄** (헬퍼 50 + 타입 5 + 매핑 15) — 신규 필드 1개로 축소.

### 변경 영역 회귀 영향 분석 (자가검토 정정 #3)

`exemptionEligibleAtApproval` 재사용에 따른 기존 사용처 영향:

| 사용처 | 기존 동작 | 본 PR 영향 |
|---|---|---|
| `redevelopment-lthd.ts:119-122` LTHD 표1/2 가드 | subject 무관 — false 시 표1 강등 | subject="right" 시 인가전 분만 LTHD → 표1/2 가드 그대로 작동 (영향 0) |
| `transfer-tax-redevelopment.ts:99-103` `applySettlementExemption` (사례 47) | subject="apt" + receive + receiveOnlyMode!=true 조건으로 분리 — settlement 분만 마스킹 | `applyOneRightExemption`는 **subject="right" 가드로 분리** — 사례 47 경로(subject="apt") 영향 0 |
| 사례 45 회귀 (subject="apt" + pay + 12억 안분) | LTHD 표2 진입 + 12억 안분 정상 작동 | 본 PR 게이트 미진입 (subject="apt") — 영향 0 |

**결론**: subject 가드로 사례 44~48 (subject="apt") 경로와 완전 격리. 회귀 안전.

---

## Pre-Do 의무 (작업 착수 전 필수)

1. **KoreanLaw MCP 사전 검증** (`get_law_text`):
   - 소득세법 §89①4호 가목 본문·단서
   - 소득세법 §94①2호
   - 소득세법 §95② 단서·§95③
   - 시행령 §166 전문
2. **외부 검토 B-1 — 12억 안분 분모 해석 예규 검색** (`search_decisions` 다중 키워드 4종):
   - "조합원입주권 12억 초과 안분 청산금"
   - "입주권 양도 고가주택 분모"
   - "조합원입주권 §89 4호 가목 단서"
   - "관리처분 입주권 안분 실지거래가액"
   - 미발견 시 보수적 대안 인용(집행기준 §89-154-x / 양도소득세 실무해설 / 사례 45 D-0-2)
3. **CORE-36 anchor 5건 우선 실행** — 엔진 변경 없이 PDF 값 일치 확인. 불일치 시 디자인 환류.
4. **양도연도 2023 §55 누진표 직접 적용** — 외부 PDF 산출세액 추종 금지 (`feedback_transfer_year_tax_rate`).

---

## 회귀 보호

- 사례 44 (apt + pay + 실가) 11 anchor
- 사례 45 (apt + pay + 12억 안분 + 거주월수 분리) 12 anchor
- 사례 46 (apt + receive 단독) 17 anchor
- 사례 47 (apt + receive 동시 + settlement 비과세) 22 anchor
- 사례 48 (apt + 승계 + pay) 19 anchor
- 전체 testsuite 회귀 0

`applyOneRightExemption` 트리거 조건이 subject="right"·우선 게이트로 제한되어 사례 44~48 (subject="apt") 경로에 영향 0 — 회귀 안전.

---

## 14 동기화 지점 (엔진 측 4건)

| # | 지점 | 변경 |
|---|---|---|
| ④ | `transfer-tax-api.ts:136` API 변환 | redev* 자산-수준 필드 → 엔진 redevelopment 매핑. **`redevExemptionEligibleAtApproval`(기존 사례 47 매핑) + `redevPriorHouseResidenceMonths`(기존 사례 45 매핑)는 재사용**, `redevPriorHouseHoldingMonths` **신규 매핑 1건만 추가** |
| ⑨ | route.ts Zod enum | propertyType right_to_move_in (기존 통과) |
| ⑫ | redevelopment Zod 스키마 | `priorHouseHoldingMonths` **신규 optional 1건만 추가**. `exemptionEligibleAtApproval`·`priorHouseResidenceMonths`는 기존 스키마에 이미 정의됨 — TS 비감지 — 누락 시 침묵 stripping |
| ⑭ | route handler 매핑 | `coerceDates` 신규 필드 영향 없음 (모두 number/boolean) |

⑬은 redevelopment 객체 통째 spread로 자동 전달 — 코드 변경 0.

---

## 종료조건

- [ ] anchor 29건 100% 통과
- [ ] 사례 44~48 회귀 0건
- [ ] `npx tsc --noEmit` 0
- [ ] `npx vitest run __tests__/tax-engine/transfer/redevelopment*` 통과
- [ ] Pre-Do B-1 예규 anchor 주석 첨부 ≥ 1건 (또는 보수적 대안 인용 명시)
