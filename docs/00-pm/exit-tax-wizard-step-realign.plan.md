# 국외전출세 마법사 단계 재배치 — 해외주식(V-3)의 자매 결함

- 기준 커밋: `4651e149` (PR #1665 브랜치 · master 머지 후 재기준)
- 선행: `docs/00-pm/foreign-stock-wizard-step-realign.plan.md` **V-3**
- 검증 깊이: **L2**(세액 불변 · 입력 위치) + **L3 한 건**(기본공제 안내 조문 오류 — §12 D-3)
- 상태: **계획 · 착수 전**

## 0. 한 줄

국외전출세도 해외주식과 **같은 구조의 결함**이다 — 입력이 전부 1단계에 있고 2·3단계가 국내 전용
칸을 다시 내민다. 그 칸들은 **계산에 1원도 가지 않는다**(실측). 여기에 더해 **기본공제 안내의 조문이
틀렸다**(§103①2호 → 실제는 §118의10④).

## 1. 실측 — 현재 상태

### 1.1 입력은 1단계에 전부 모여 있다

`ExitTaxBlock`(449줄)이 7개 섹션을 갖고 `Step1.tsx:208` 이 국외전출세를 고르면 이 블록만 붙이고 early return 한다.

| 섹션 | 위치 | 내용 |
|---|---|---|
| ① 거주자 요건 (§118의9①1호) | `ExitTaxBlock.tsx:117` | 출국일 전 10년 중 국내 거주 연수 |
| ② 출국일 | `:147` | 출국일 |
| ③ 대주주 요건 (§178의8 → §167의8) | `:166` | 직전 연도말 대주주 여부 |
| ④ 보유 종목 — 간주양도 (§178의9) | `:188` | 종목별 주식수·취득일·취득단가·출국일 시가 등 |
| ⑤ 실양도 정보 — 경정청구용 (§118의12, 선택) | `:201` | 실제 양도가액·국내원천 원천징수 |
| ⑥ 납부유예 (§118의16) · ⑥.5 재전입 환급 (§118의17①1호) | `:232` · `:286` | 유예 신청·이자·환급 |
| ⑦ 외국납부세액 (§118의13) | `:300` | 외국납부세액 |

### 1.2 2·3단계는 국내 전용 화면을 그대로 렌더한다

- `Step2.tsx` — **국외전출세 분기 0건**(grep `exit_tax` 결과 없음) ⇒ 국내 ①양도가액 ②취득가액이 뜬다
- `Step3.tsx` — `isExitTax` 분기는 **3곳뿐**(`:342` §118의15 안내 · `:368` 신고유형 숨김 · `:531` 가산세 숨김).
  **① 필요경비 · ② 기본공제는 걸러지지 않아 그대로 렌더된다.**

### 1.3 그 칸들은 죽어 있다 (throwaway probe · 2026-09-17)

| 관측 | 결과 |
|---|---|
| exit body 에 실린 국내 금액·경비 키 | **0개** |
| `transferTotalPrice`·`acquisitionTotalPrice`·`actualExpenses` 를 바꾼 뒤 body 비교 | **완전 동일** |
| 국내 칸을 비운 채 `validateStep2` | **오류 0건** |

### 1.4 검증은 이미 단계로 나뉘어 있다

| validate | 검증 필드 | 현재 화면 |
|---|---|---|
| `validateStep1ExitTax` | `etYearsResidentLast10` · `etDepartureDate` · `etIsMajorShareholder` · `etHoldings`(**최소 1건**) | 1단계 ①②③④ |
| `validateStep2ExitTax` | `etHoldings[i].stockName` · `.shareCount` · `.acquisitionDate` · `.perShareAcquisitionPrice` · `.departureDayMarketPrice` · `.priorYearEndMonthAvg` · `.unlistedSamplePrice` · `.unlistedStdPricePerShare` | **1단계 ④** ❌ |
| `validateStep3ExitTax` | `etActualTransferPricePerShare` · `etForeignTaxPaid` · `etDomesticSourceTaxWithheld` · `etTotalFaceValue` | **1단계 ⑤⑦ + §118의15** ❌ |

## 2. 🔴 해외주식과 다른 점 — 「보유 종목」이 두 단계에 걸친다

`etHoldings` 는 **Step1 이 「최소 1건 있는가」**, **Step2 가 「행별 상세」**를 본다. 그런데 화면은
행 매트릭스 **하나**라 쪼갤 수 없다.

⇒ 매트릭스를 Step2 로 옮기면 **Step1 의 「보유 종목을 최소 1건 입력하세요」가 입력 수단 없이 막는다** —
[[feedback_required_field_needs_an_input_path]] 위반이자 사용자가 풀 수 없는 상태다.

**해결**: 「최소 1건」 검사를 `validateStep1ExitTax` → `validateStep2ExitTax` 로 **옮긴다**(Q-1).
행 상세 검증과 같은 단계에 두는 것이 자연스럽고, Step1 은 인적·시점 요건만 본다.

## 3. 목표 배치

| 단계 | 화면 | 검증 |
|---|---|---|
| **Step1** 자산·시장 | ① 거주자 요건 · ② 출국일 · ③ 대주주 요건 | `validateStep1ExitTax`(거주연수·출국일·대주주) |
| **Step2** 양도·취득가액 | ① 보유 종목 — 간주양도(§178의9) | `validateStep2ExitTax`(행 상세 + **최소 1건**) |
| **Step3** 필요경비·신고 | ① 실양도 정보(§118의12) · ② 납부유예(§118의16)·재전입 환급(§118의17) · ③ 외국납부세액(§118의13) · ④ 보유현황 신고(§118의15 안내 — 현행 유지) | `validateStep3ExitTax` |

## 4. 추가 결함 — Step3 국내 공용 섹션

| ID | 결함 | 근거 | 조치 |
|---|---|---|---|
| **D-1** | Step2 국내 ①② 렌더 | §1.2 · §1.3 | 국외전출세 분기로 **대체** |
| **D-2** | Step3 ① 필요경비(국내) 렌더 — body 에 안 실림 | §1.3 | exit 에서 **숨김** |
| **D-3** | 🔴 Step3 ② 기본공제 안내가 **「주식 등 그룹 기본공제 250만원 (§103①2호)」** — 국외전출세는 **§118의10④**다 | 법 §118의10④ 「양도소득과세표준은 제3항에 따른 양도소득금액에서 **연 250만원을 공제**한 금액으로 한다」 · **§118의10⑤** 「…제92조제2항에 따른 양도소득과세표준과 **구분하여 계산**한다」 (KoreanLaw MCP verbatim, 시행일 20260101) · 엔진 `exit-tax.ts:11` STEP 4 | exit 전용 문구로 **분기** |

> D-3 은 **표시 축이지만 조문이 틀린 안내**다 — 세액은 바뀌지 않는다(엔진은 이미 §118의10④로 계산).
> 「§103①2호 그룹」이라고 적으면 국내주식 양도와 250만원을 나눠 쓴다는 **반대 사실**을 말하게 된다
> (§118의10⑤이 «구분하여 계산»한다고 명시).

## 5. 분할 설계

`ExitTaxBlock.tsx`(449줄) → 세 블록 + 공용. 해외주식과 **같은 규약**으로 간다(파일명·props·SectionBox 재사용).

| 신규 파일 | 담는 것 |
|---|---|
| `ExitTaxIdentityBlock.tsx` | ① 거주자 요건 · ② 출국일 · ③ 대주주 요건 → Step1 |
| `ExitTaxHoldingsBlock.tsx` | ④ 보유 종목(간주양도) → Step2 |
| `ExitTaxSettlementBlock.tsx` | ⑤ 실양도 · ⑥ 납부유예 · ⑥.5 재전입 환급 · ⑦ 외국납부세액 → Step3 |

- `SectionBox` 는 **`foreign-stock-shared.tsx` 의 것을 재사용**한다(ExitTaxBlock 안에 같은 래퍼가 복제돼 있다 — `:78-98`).
  ⚠️ 공용 파일 이름이 `foreign-stock-*` 이라 국외전출세가 쓰기엔 오해 소지가 있다 ⇒ **`stock-section-box.tsx` 로 rename**(Q-2).
- 섹션 번호는 각 단계에서 1부터(해외주식과 동일 규약).

## 6. 케이스 매트릭스

| # | 상태 | 기대 |
|---|---|---|
| C-1 | exit · Step1 | 거주자·출국일·대주주만. **보유 종목 매트릭스 없음** |
| C-2 | exit · Step2 | 보유 종목 매트릭스. **국내 「양도가액 합계」 없음** |
| C-3 | exit · Step3 | 실양도·납부유예·외국납부세액·§118의15. **국내 필요경비 없음** |
| C-4 | exit · Step3 기본공제 | 안내가 **§118의10④** (§103①2호 아님) |
| C-5 | exit · Step1 에서 종목 0건 | 「다음」이 **막지 않는다**(검사가 Step2 로 갔다) |
| C-6 | exit · Step2 에서 종목 0건 | 「다음」이 **막는다** + 그 화면에 추가 버튼이 있다 |
| C-7 | 국내·해외주식 | 현행 그대로(회귀 0) |

## 7. anchor 계획

| ID | 고정 | 파일 |
|---|---|---|
| EX-1 | 🔴 Step2 에 보유 종목 매트릭스 · 국내 금액칸 없음 | `__tests__/components/calc/stock-transfer/exit-tax-wizard-step-layout.anchor.test.tsx` |
| EX-2 | 🔴 Step3 에 실양도·외국납부세액 · 국내 필요경비 없음 | 〃 |
| EX-3 | 🔴 Step1 에 매트릭스 없음(거주연수·출국일은 있다 — 양성 짝) | 〃 |
| EX-4 | 🔴 기본공제 안내가 §118의10④ (§103①2호 문자열 부재) | 〃 |
| EX-5 | 🔴 「최소 1건」 검사가 Step2 로 이동 — Step1 통과 / Step2 차단 | `__tests__/calc/exit-tax-holdings-gate-step.anchor.test.ts` |
| EX-6 | 국내·해외주식 무변경(양성 짝) | 〃 |

> **안전망이 지금 0이다** — 국외전출세 E2E **0건**, `ExitTaxBlock` 렌더 테스트 **0건**(grep 실측).
> 그래서 이 작업은 anchor 를 먼저 심지 않으면 **무엇이 깨지는지 알 방법이 없다**.

## 8. mutation probe

| ID | 무력화 | 실패해야 할 anchor |
|---|---|---|
| M-1 | Step2 exit 분기 제거 | EX-1 |
| M-2 | Step3 exit 분기 제거 | EX-2 |
| M-3 | Step1 에 Holdings 블록 재부착 | EX-3 |
| M-4 | 기본공제 안내를 §103①2호로 되돌림 | EX-4 |
| M-5 | 「최소 1건」 검사를 Step1 로 되돌림 | EX-5 |

## 9. V-n

| ID | 항목 | 방법 | 상태 |
|---|---|---|---|
| V-1 | exit body 에 국내 금액·경비가 실리는가 | probe | ✅ **0개 · 값 바꿔도 동일** |
| V-2 | 국외전출세 기본공제의 근거 조문 | KoreanLaw MCP §118의10④⑤ verbatim | ✅ §118의10④ (§103① 아님) |
| V-3 | 기존 안전망 | E2E·컴포넌트 테스트 grep | ✅ **0건** |
| V-4 | 「최소 1건」 검사를 옮기면 «다종목 확정» 흐름이 깨지는가 | 확정 버튼은 `StockTransferTaxCalculator.tsx:348` · 게이트는 `validateStep3` | ⏳ **착수 전 확인** |
| V-5 | `ExitTaxBlock` 안의 `SectionBox` 가 `foreign-stock-shared` 와 동일 구현인가 | 두 정의 대조 필요 | ⏳ **착수 전 확인**(다르면 rename 대신 각자 유지) |

## 10. Q-n

- **Q-1** 「보유 종목 최소 1건」 검사 위치 — **Step2 로 이동**(권고). 그대로 두면 입력 수단 없이 막는다.
- **Q-2** 공용 `SectionBox` 파일명 — **`stock-section-box.tsx` 로 rename**(권고). 두 트랙이 함께 쓰므로 `foreign-stock-*` 은 오해를 남긴다.
- **Q-3** 국외전출세 **E2E 신규 1건**을 이 PR 에 포함할 것인가 — **포함 권고**. 지금 E2E 0건이라 단계 이동이 실제 브라우저에서 도는지 확인할 방법이 없다.

## 11. 범위 밖

- 국외전출세 **세액 로직**(§118의9~§118의17) 일체.
- 국외전출세 가산세 미배선(G-24) — 기존 갭, 별건.
- 해외주식 재배치(PR #1665) — 선행 완료분.

## 12. 착수 전 체크리스트

- [ ] Q-1~Q-3 결정
- [ ] V-4·V-5 확인
- [ ] Pre-Do: EX-1~EX-6 심고 🔴 실패 확인
- [ ] 분할 → 호출부 교체 → validate 이동 → M-1~M-5 과녁 확인
- [ ] vitest 전건 회귀 0 · tsc · lint · 주식 E2E 전건 + 신규 exit E2E

---

## 13. 구현 기록 (2026-09-17 · 착수 후)

### 13.1 결정·해소

- **Q-1 = 예**(게이트 Step2 이동) · **Q-2 = 예**(공용 추출) · **Q-3 = 예**(E2E 신설) — 사용자 「권고안대로」
- **V-4 ✅** 국외전출세는 **다종목 경로에서 제외**돼 있다(`StockTransferTaxCalculator.tsx:264,292` —
  목록·확정 버튼 자체가 `marketType !== "exit_tax"` 로 렌더된다) ⇒ 게이트 이동이 확정 흐름과 무관하다.
- **V-5 ✅** `ExitTaxBlock` 의 `SectionBox` 는 `foreign-stock-shared` 와 **주석까지 동일**한 복제였다.

### 13.2 Q-2 정밀화

계획서는 「`foreign-stock-shared.tsx` 를 rename」이라 했다. **불완전했다** — 그 파일에는 해외주식 전용
선택지 상수(국가·수령방식 등)도 있어 이름만 바꾸면 국외전출세가 그것까지 끌어안는다.
⇒ **`SectionBox` + 공통 props 타입만** `stock-section-box.tsx` 로 **추출**하고,
`foreign-stock-shared.tsx` 는 자기 상수를 유지한 채 그것을 **재수출**한다.

### 13.3 🔴 구현 중 드러난 회귀 — 섹션 번호 공백

전용 블록을 Step3 에 «번호 없이» 끼우자 화면이 **②③**(국외전출세)·**②③④**(해외주식)가 됐다.
기존 anchor `stock-step3-section-numbering.test.tsx` **SS-2 가 국외전출세 쪽을 잡았다**.

⚠️ **해외주식 쪽은 PR #1665 에서 이미 같은 결함으로 머지됐었다** — 그 파일에 해외주식 케이스가
없었기 때문이다. 이번에 **SS-6 을 신설**해 두 트랙 모두 고정했다.

**해법**: 전용 블록을 `<SectionTitle n={1}>` 를 가진 섹션 **안에** 넣고, 블록 내부 `SectionBox` 의
번호는 **뗀다**(`n` 을 optional 로). 번호 체계가 한 화면에 둘이 되지 않는다.

### 13.4 구현

| 파일 | 내용 |
|---|---|
| `stock-section-box.tsx` (신규) | `SectionBox`(n optional) · `StockStepBlockProps` — 두 트랙 공용 |
| `foreign-stock-shared.tsx` | 상수 유지 + 공용 재수출 |
| `ExitTaxIdentityBlock.tsx` (신규) | 거주자 요건 · 출국일 · 대주주 → **Step1** |
| `ExitTaxHoldingsBlock.tsx` (신규) | 보유 종목(§178의9) → **Step2** |
| `ExitTaxSettlementBlock.tsx` (신규) | 실양도 · 납부유예 · 재전입 · 외국납부세액 · 보유현황 · 원천징수 → **Step3** |
| `ExitTaxBlock.tsx` | **삭제**(449줄) |
| `Step1/2/3.tsx` | 호출부 교체 · Step3 ① 자리를 트랙별 전용 블록으로 |
| `stock-transfer-tax-validate-exit.ts` | 「보유 종목 최소 1건」 게이트 **Step1 → Step2** |
| `Step3.tsx` 기본공제 | 국외전출세 문구를 **§118의10④·⑤** 로 분기(D-3) |

### 13.5 검증

- **Pre-Do**: EX-1·EX-1b·EX-2·EX-2b·EX-3·EX-4 + EX-5·EX-5b **🔴 8건 실제 실패** 확인 후 구현
- **mutation 5건, 과녁만 실패**: M-1 Step2 분기 제거→EX-1·EX-1b / M-2 Step3 분기 제거→EX-2·EX-2b /
  M-3 Step1 재부착→EX-3 / M-4 기본공제 분기 무력화→EX-4 / M-5 게이트 롤백→EX-5b
- **신규 E2E** `exit-tax-wizard-steps.spec.ts` 2건 — 이 트랙의 **첫 E2E**. 구별력도 실측했다
  (Step2 분기를 제거하니 **2건 모두 실패**, 복원하니 통과)
- vitest 전건 **21,717 passed** · 회귀 0 · `tsc` 0
