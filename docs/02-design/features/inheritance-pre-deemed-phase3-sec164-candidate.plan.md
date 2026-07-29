# Phase 3 — pre-deemed 상속·증여 취득가액: ② §164 후보 추가 + 양도차익 기준 유리선택(Phase 1 소급 교정) + decedent 청소

작성일: 2026-07-08 · 대상: 양도세 상속·증여 `calcPreDeemed` (PR#539·#540 후속) · 성격: 법령 정확성(세액 영향)

## 0. 핵심 교정 (사용자 확정)

Phase 1·2는 `max(① 상증법평가액, ③ 환산)`을 **취득가액 크기**로 골랐다. 그러나 이는 틀렸다:
- **①·② = 실지거래가액 의제 → 자본적지출 + 실제 필요경비(양도비) 추가공제**(§163③⑤).
- **③ = 추계 → 개산공제(취득당시 기준시가 × 3%)만**(§163⑥).

→ **②의 취득가액이 ③보다 작아도, 자본적지출·양도비가 크면 ②가 전체적으로 유리(양도차익이 더 작음)**할 수 있다. 따라서 선택은 `max(취득가액)`이 아니라 **양도차익이 가장 작은(유리한) 방법의 자동선택**이어야 한다. 이 교정은 ② 추가뿐 아니라 **이미 배포된 Phase 1의 ①-vs-③ 선택에도 소급 적용**한다.

## 1. 취득가액 후보 (사용자 확정 산식)

의제취득일(1985.1.1) 전 상속·증여 취득가액 = **가장 유리한** 하나:

| 후보 | 산식 | 필요경비 |
|---|---|---|
| **①** 상증법 §60~66 평가액 (상속세 신고가액) | 신고가액 | **실제공제**(자본+양도비) |
| **②** §164④~⑦ 환산 | **최초고시가액 × (취득[상속개시]일 기준시가 ÷ 최초고시 기준시가)** | **실제공제** |
| **③** 환산취득가액 (§176조의2) | **양도가액 × (의제취득일 기준시가 ÷ 양도시 기준시가)** | **개산공제**(취득당시 기준시가 × 3%) |

- ②와 ③은 둘 다 "환산"이나 **다르다**: ②는 최초고시가액을 취득일로 환산(양도가 무관), ③은 양도가를 의제취득일로 환산.
- ②의 값 = 코드의 `houseValuationResult.housePriceAtInheritanceUsed`(주택)·`pre1990LandResult.standardPriceAtAcquisition`(토지). post-deemed §164⑦ `houseValuationStdPrice`와 **동일 소스**.
- 근거: §163⑨ 단서(max ①②)·§176조의2④(③)·§163⑥(개산공제), 이미지26 집행기준, 국심2003부602·2003서3266·조심2023서0676.

## 2. 유리선택 로직 (양도차익 최소)

①②는 실제공제, ③은 개산공제. **①②는 취득가액만 다르므로 그룹 내 max(①,②)가 대표.** 두 그룹 비교:

```
실제공제 그룹:  totalDed_real = max(①, ②) + (자본적지출 + 양도비)
개산공제 그룹:  totalDed_est  = ③ + 개산공제(③기준시가 × 3%)

if totalDed_real >= totalDed_est → 실제공제 채택 (취득가액 = max(①,②))
else                            → 개산공제 채택 (취득가액 = ③)
```
(양도가는 공통이므로 `양도차익 최소 ⟺ 총공제 최대`. 총공제 큰 그룹 선택.)

selectedMethod: 실제 그룹 승 시 `reported`/`sec164`(①·② 중 큰 쪽), 개산 그룹 승 시 `converted`.

## 3. 🟢 기존 §97②2호 swap과의 정합 (이중적용 없음 — 조사 확정)

- swap(`calcNecessaryExpense`, `transfer-tax-helpers.ts:251-261`)은 **환산(estimated) 모드에서만** `가목(③환산+개산) vs 나목(자본+양도비)` 택일. **①②(실제 그룹)는 swap 대상 아님.**
- 우리 로직이 **③(개산)을 고르는 조건 = `③+개산 ≥ max(①,②)+자본+양도비`**. 이때 하류 swap 발동조건(`자본+양도비 > ③+개산`)은 **항상 거짓**(∵ ③+개산 ≥ max(①,②)+자본+양도비 > 자본+양도비) → **swap 잠잠, 이중적용 없음.**
- 우리 로직이 **①②(실제)를 고르면** `useEstimatedAcquisition` 미세팅 → 하류 실가 모드(`:349-350`)에서 자본+양도비 그대로 차감, swap 미발동. ✅
- 정책 정합: `feedback_97_2_swap_necessary_expense_max_not_sum`(택일·이중차감 금지)·`project_transfer_post_deemed_house_164_7_max`(post-deemed ①②=개산공제 없음)와 일관.

## 4. 설계 (구현)

### 4.1 엔진 입력 확장 (`InheritanceAcquisitionInput`)
- `sec164ValueAtInheritance?: number` — ② 후보(취득일 §164 환산값). helper 주입.
- `actualNecessaryExpense?: number` — 자본적지출 + 양도비 합계(실제공제용, 유리비교). helper가 `currentInput`에서.
- `estimatedDeductionRate?: number` — 개산공제율(기본 0.03, 미등기 0.003). helper가 `currentInput.isUnregistered`에서.

### 4.2 엔진 `calcPreDeemed` — 유리선택
- 후보 산출: `reported①`, `sec164②`(신규), `converted③`(현행).
- 개산공제 = `applyRate(standardPriceAtDeemedDate, estimatedDeductionRate ?? 0.03)`.
- §2 로직으로 method 선택 → acquisitionPrice = 승자 취득가액.
- `PreDeemedBreakdown` = `{ reportedAmount, sec164Amount, convertedAmount, estimatedDeduction, actualExpense, selectedMethod: "reported"|"sec164"|"converted" }` (유리비교 근거 echo).

### 4.3 helper 주입 (`inheritance-acquisition-helpers.ts`)
- `resolveInheritedAcquisitionInput`: `sec164ValueAtInheritance` = houseValuationResult.housePriceAtInheritanceUsed(주택)·pre1990LandResult.standardPriceAtAcquisition(토지) — **pre-deemed 게이트**(post-deemed는 기존 houseValuationStdPrice 유지).
- `actualNecessaryExpense` = `(currentInput.capitalExpenditure ?? 0) + (currentInput.transferExpense ?? 0)`, 둘 다 미입력 시 `currentInput.expenses`.
- `estimatedDeductionRate` = `currentInput.isUnregistered ? 0.003 : 0.03`.
- **③ 분자(standardPriceAtDeemedDate) 자동주입은 현행 유지**(R3 별도).

### 4.4 라우팅 (`applyResultToInput`) — 무변경
- `selectedMethod==="converted"`→개산(useEstimatedAcquisition), else→실제. 현행 그대로(선택 기준만 gain-level로 바뀜).

### 4.5 결과카드 (`InheritedAcquisitionDetailCard`)
- ①②③ 3행 + 각 필요경비 방식(실제/개산) 표시 + 선택 배지 + "필요경비 포함 유리한 방법 자동적용" 안내.

### 4.6 decedent 청소
- 엔진 `InheritanceAcquisitionInput` `decedentActualPrice`/`decedentAcquisitionDate` 제거. Zod pre-deemed `hasDecedentActualPrice`/`decedentActualPrice`/`decedentAcquisitionDate`+refine 제거. API·route 이미 미송신(PR#540) → 확인.
- **🔴 스토어 `calc-wizard-asset.ts:282 decedentAcquisitionDate`(단기보유 통산 공유)·`decedentAcquisitionPrice`(가업상속 §97의2 동명 nested) 제거 금지.**

## 5. 14 동기화 지점
- ②(`sec164ValueAtInheritance`)·`actualNecessaryExpense`·`estimatedDeductionRate` = **엔진 내부 주입**(UI/API/Zod 신규 필드 없음). ①(reportedValue)은 PR#540 배관 완료.
- decedent 제거: Zod pre-deemed + 엔진 타입만. 스토어·타 세목 불변.
- ⑦ 결과카드 수정. ⑧ validate 무영향.

## 6. 결정사항
- **Q1(확정: 양도차익 기준 자동선택)** — §2 로직.
- **Q2(확정: Phase 1 소급 교정 포함)** — ①-vs-③도 gain-level.
- **Q3(증빙, 추천): 사용자 입력 자본적지출·양도비를 그대로 실제공제 인정**(증빙 여부는 사용자 책임 — 계산기 표준).
- **③ 분자 시점(R3, 미해결)**: ③은 현행 `standardPriceAtDeemedDate`(사용자 직접입력 시 의제취득일, 자동주입 시 상속개시일값) 유지. 정확한 의제취득일 §164 재산출은 **별도 과제**(Excel anchor·기존 환산 회귀 위험).

## 7. 검증 계획 (pre-Do anchor)
- **Excel 보존 최우선**: E-6b(houseValuation 없음·자본/양도비 0) → 실제그룹 = max(①,②)+0, ② 부재면 ①=0 → 개산그룹 ③+개산 승 → **환산 109,611,427 유지**.
- **유리 역전 anchor**: ② 취득가액 < ③ 취득가액이지만 자본적지출 큼 → 실제그룹(② 채택) 승, 양도차익 < ③. 원단위 `toBe`.
- **swap 잠잠 anchor**: ③ 채택 케이스에서 자본+양도비 입력해도 swap 미발동(양도차익 = 양도가 − ③ − 개산).
- ① 단독·③ 단독·pre1990 토지 ② anchor.
- decedent 제거 후 tsc·Zod 파싱·전체 회귀 0.

## 8. 리스크
- **R-A(R3)**: ②·③ 분자가 동일 상속개시일 값에서 파생(현행). 법령상 ②=취득일·③=의제취득일이나, gain-level 선택은 취득가액 크기와 무관하게 필요경비로 갈리므로 실무 영향은 필요경비 유무가 지배. 정밀 시점 분리는 별도 과제.
- **R-B**: `isUnregistered`(미등기 0.3%) 개산율 plumbing 누락 시 오차 — helper에서 주입.
- **R-C**: `actualNecessaryExpense` 산정 시 legacy `expenses` vs 신규 2필드 우선순위 — calcNecessaryExpense와 동일 규칙 재사용 필수(불일치 시 선택-계산 자기모순).
- **R-D**: decedent 스토어 오삭제 → 단기보유 통산·가업상속 회귀. grep 가드.

## 8.5 독립 검토 반영 (2026-07-08, 법령·코드 2트랙) — 🔴 배포 차단

### ✅ 확증된 것
- **gain-level 유리선택 = 법적 정당**(위법 아님): 대법원 2006두1326·**국심2003서3266**(상속토지에 가목단서 실지거래가액[의제취득일 §164④ 환산] + 실제 필요경비[철거비·이주보상비] 인정 = 납세자 유리 채택). "…있으나"=허용 표현. → 설계 개념 유효.
- **§97②2호 swap 잠잠 논증 정확**(양 검토 CONFIRMED, 주택·일반 경로).
- **R-C 필요경비 우선순위 규칙 = calcNecessaryExpense와 정확히 일치**(코드 검토 CONFIRMED).
- **개산공제 기준값·율(3%/미등기 0.3%) 정확**(양 검토 CONFIRMED).

### 🔴 BLOCKER (배포 차단 — 반드시 선결)
1. **[법령 항목4] ②·③ 분자 시점 = 의제취득일(1985)이어야 함**: §176조의2④1호("의제취득일 현재 가액")·②2호 후단(주택 ③ 분자=§164⑦ 계산가액)·국심2003서3266("실지거래가액=의제취득일 현재 기준시가"). 부칙§8 취득시기=1985.1.1이므로 §164 "취득당시"=1985.1.1. **∴ ①만 상속개시일(§163⑨ 본문), ②·③ 분자는 의제취득일.** 계획의 "②=상속개시일, ③분자=현행(상속개시일 자동주입) 유지, R3 별도 과제"는 **성문 위반이자 개산공제까지 오산 전파**. R3 미룬 채 auto-select 배포 = 세액 오류 → **차단**.
2. **[코드 BLOCKER2] E-6a Excel 교재 이탈**: 자동흐름에서 ②=`housePriceAtInheritanceUsed`=153,336,855가 ③=109,611,427을 필요경비 0에서도 이겨(gain 766,663,145) Excel 13번(③ 채택, gain 805,788,468) 뒤집음. **원인=②와 ③분자가 동일 `housePriceAtInheritanceUsed` 값으로 얽힘(R3)**. R3 미해결 시 ②가 ③를 기계적으로 이김.
3. **[코드 BLOCKER1] pre-1990 토지 useEstimatedAcquisition 강제 잔존**: `transfer-tax.ts:100-104`가 STEP 0.45 전 `useEstimatedAcquisition=true` 강제 → ①② 선택 시 `applyResultToInput`가 **명시적으로 false 해제** 안 하면 하류가 ③ 재계산(자기모순). §4.4 "무변경"은 오류.

### 🟠 누락 (선결 or 명시 scope-out)
- **건물 §164⑤(일반건물)·§164⑥(오피스텔·상가·공동주택)** ② 후보 누락 — §163⑨ 단서2호는 §164⑤~⑦ 전부. 최소 scope-out 명시.
- **§163⑨ 제외 증여유형**(상증법 §33~§42의3 증여의제·증여이익 → §163⑩ 별도): pre-deemed ① 적용 시 오류. 처리·제외 로직 명시.
- **부담부증여 pre-deemed**(§163⑨ 괄호 채무액) 경로 미언급.
- 컴파일 파손: A-7(`inheritance-acquisition-price.test.ts:317`)·plumbing 테스트가 decedent 필드 참조 → 제거 시 TS 오류. Zod 제거 위치 `transfer-tax-schema-sub.ts:609-624`. 스토어 pre-deemed decedent 필드 고아화(UI 토글은 PR#540서 제거됨).

### ❓ 선결 도메인 질문 (사용자 확정 필요)
**Excel 13번 교재가 ②(153,336,855)보다 작은 ③(109,611,427)을 채택한 이유**가 불명확:
- (해석 A) 이 사례엔 ②가 후보로 적용되지 않는다(①·③만) — 왜?
- (해석 B) ②(§164 환산 결과)는 153M이 아니라 별도 값이고 ③보다 작다 — ②와 "의제취득일 기준시가(③분자)"가 다른 값인가?

이 답에 따라 ② 구현·시점(R3)이 결정됨. **미해결 시 auto-select 배포 불가.**

## 9. 범위 외
- 매매(유상) pre-deemed `max(취득실가×생산자물가상승률, 환산)` — 미구현 신규 기능(별도, 메모리 기록).
- ③ 분자 정확 시점(R3) 정밀 재산출.
- post-deemed 경로(PR#535) 무변경.

---

**진행**: 결정 Q1·Q2·Q3 확정 완료. R-C(필요경비 우선순위 규칙 재사용)가 자기모순 방지 핵심. Do는 pre-Do anchor(Excel 보존·유리 역전) 우선.
