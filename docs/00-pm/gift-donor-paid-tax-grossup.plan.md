# 증여세 대납(代納) Gross-up 순환계산 — 구현 계획서

> **Feature**: 증여자가 수증자의 증여세를 대신 납부할 때, 대납세액이 다시 증여가 되어
> 증여가액에 가산·재계산되는 순환(고정점) 계산
> **Branch / Worktree**: `feat/gift-enhance` (`.claude/worktrees/gift-enhance`)
> **작성일**: 2026-06-21
> **상태**: Plan (Do 미착수)

---

## 0. 요약 (한 줄)

증여자가 수증자 증여세를 대납하면 그 대납세액이 **§36 채무변제 증여 → 재차증여**가 되어,
순증여재산에 대납세액을 더해 다시 증여세를 계산하는 과정을 **수렴할 때까지 반복**하는
gross-up 계산을, 증여세 마법사 내 **토글**로 제공한다.
단, **증여자가 연대납세의무자(§4의2⑥)로서 대납**한 경우는 재차증여가 아니므로(국세청 해석 207328) gross-up을 **미적용**한다.

---

## 1. 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-21)

| 조문 / 해석 | 핵심 내용 | 구현 함의 |
|---|---|---|
| **상증법 §4의2①** | 수증자가 1차 납세의무자 | 원칙: 증여세는 수증자 부담 |
| **상증법 §4의2⑥** | 증여자 **연대납세의무**는 한정(① 수증자 주소·거소 불명+조세채권 확보곤란, ② 납부능력 없음+강제징수 곤란, ③ 비거주자). **단서**: §35~§39, §39의2·3, §40, §41의2~5, §42·42의2·3, §45, §45의3~5, §48 등은 연대의무 **제외** | ① 게이트 입력(연대의무 여부) ② 의제증여 유형은 연대의무 성립 불가 → 대납 시 **항상** 재차증여 |
| **상증법 §36①** | 제3자로부터 채무의 인수·변제를 받으면 그 이익이 **증여재산가액** | 대납 = 수증자 채무(증여세 납부의무) 대신변제 → 재차증여의 직접 근거 |
| **상증법 §47②** | 증여일 전 10년 내 동일인 증여 합산 | 대납분이 누적 합산되는 실질 메커니즘 (순환계산의 법적 토대) |
| **상증법 §56 (→ §26)** | 증여세 산출세액 = 과세표준 × §26 누진세율 | brackets: 10% / 20%(−1천만) / 30%(−6천만) / 40%(−1.6억) / 50%(−4.6억) |
| **상증법 §69②** | 신고 시 산출세액(+§57 할증 포함)에서 공제·감면 차감 후 **3% 신고세액공제** | **대납액 = 신고세액공제 후 납부세액** (사용자 결정) |
| **국세청 해석 [207328]** (2011.11.28) | **"증여자가 연대납부의무자로서 대납한 증여세는 재차증여에 해당하지 않음"** | **핵심 게이트**: 연대의무자 대납 → gross-up 미적용 / 비연대 대납 → gross-up 적용 |

> 검증 출처: 상증법 [현행] MST 276123. 국세청 해석 본문은 법제처 OPEN API 미제공 →
> 제목 기준 확정. 상세링크: https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000146686

**법령 정확성 원칙 준수** (memory `feedback_no_unfavorable_application_without_legal_basis`):
gross-up은 납세자에게 불리(세부담↑)하므로, **명문 근거(§36 재차증여)가 성립하는 경우에만** 적용하고
연대의무 대납(재차증여 아님)에는 적용하지 않는다. 기본값은 gross-up **OFF**(토글로 명시 ON).

---

## 2. 사용자 결정 사항 (확정)

| 결정 | 선택 | 근거 |
|---|---|---|
| 대납액 기준 | **납부세액**(신고세액공제 §69 후 = 결정세액 `finalTax`) | 증여자가 실제 지급하는 금액 = 수증자가 면한 채무(§36) |
| 기능 형태 | **증여세 마법사 내 토글** | 기존 공제·합산·할증 계산과 연동 |

---

## 3. 계산 모델 (고정점 반복)

### 3.1 정의

- `A` = 원래 순증여재산가액 (= 현 회차 net current gift value: 평가액 − 비과세 − 부담부 채무인수)
- `donorTax(V)` = `A` 대신 `V`를 순증여로 넣었을 때 `calcGiftTax`가 산출하는 **결정세액(`finalTax`)**
  (세대생략 할증 §57 포함, 신고세액공제 §69 반영 후)
- 대납분(재차증여액) = `donorTax`

### 3.2 반복식

```
addition_0 = 0
V_0 = A
tax_0 = donorTax(V_0)                 // = 비대납 결정세액 (baseline)

반복: addition_{n+1} = tax_n
      V_{n+1}        = A + addition_{n+1}
      tax_{n+1}      = donorTax(V_{n+1})
종료: |tax_{n+1} − tax_n| < 1원  (또는 |V 변화| < 1원), 최대 100회
```

### 3.3 수렴 보장

유효 한계세율 = `한계세율(≤0.5) × (1+할증율 ≤1.4) × (1−0.03 신고공제) ≤ 0.5×1.4×0.97 = 0.679 < 1`
→ 축약사상(contraction)으로 **반드시 수렴**. `MAX_ITER=100` + 1원 tolerance는 안전 상한.

### 3.4 구간 닫힌형(검증·가속용 — 구현은 반복 채택)

단일 세율구간 내(할증·합산 고정 가정):
`finalTax(V) = (0.r·(V_agg − 공제) − 누진공제) × (1+할증) × 0.97` → V에 대해 선형 →
`V* = (A − k1) / (1 − k2)` 형태로 직접 해 가능. **anchor 검증에만 사용**, 구현은 반복(법문 "무한 루프" 충실 + floor 정확).

### 3.5 대납분의 과세 취급 (중요)

- 대납분은 **비과세 대상 아님** → `A`(비과세 차감 후 net)에 가산.
- **증여재산공제 §53/§53의2는 기간당 1회** → 합산 과세가액에 1회만 적용(반복 중 재공제 금지).
  → 가산 지점은 **aggregatedGiftValue**(STEP 3 산출 직후, gift-tax.ts:167-168), 공제는 STEP 4에서 합산액 기준 1회.
  - ⚠️ **주입 지점을 netCurrentGiftValue로 하면 안 됨** (실측: gift-tax.ts:155-158).
    `netCurrentGiftValue`는 aggregatedGiftValue 산출(167)뿐 아니라 STEP4 `calcGiftDeductions`의
    **§46①2호 동시증여 안분 분자·분모 기준**(gift-tax.ts:183 `currentNetGiftValue`)으로도 전달됨.
    `calcRelationDeduction`(gift-deductions.ts:100-127)·`calcMarriageBirthDeduction`(197-208)은
    동시증여(`simultaneousGifts`) 존재 시 `floor(remaining × currentNetGiftValue ÷ (currentNetGiftValue+Σ타인))`로
    공제를 안분하므로, netCurrentGiftValue가 매 회차 대납분만큼 부풀면 **공제 안분 비율이 회차마다 이동 →
    공제액 자체가 변동** → 위 "공제 1회 동결" 주장과 직접 모순.
  - 따라서 `_donorPaidTaxAddition`은 **aggregatedGiftValue에만 가산**하고, 공제 안분 기준
    `currentNetGiftValue`(STEP4 3번째 인자)는 **원래 순증여로 고정**해야 §53/§53의2 공제가 A 기준 1회로 동결됨.
  - 🚩 **동시증여(simultaneousGifts) + 대납 공존 케이스**: 위 분리(aggregated에만 가산)로 공제는 고정되나,
    동시증여 안분은 §46①2호 시행령 메커니즘이므로 대납과의 상호작용은 본 PR에서 **명시 검증 필요**.
    검증 전까지 §10 Scope에 "동시증여 + 대납 공존은 본 PR 제외" 명시 + 입력 검증 차단 검토.
- **세대생략 할증(§57)** ⚠️ **자연 반영되지 않음** (실측: gift-tax.ts:237-245):
  STEP7은 `calcGiftGenerationSkipSurchargeWithLimit(..., grossGiftValue, ...)`로 **`grossGiftValue`**(STEP1
  평가합계, gross-up 가산과 무관·불변)를 넘기고, 할증 내부(inheritance-gift-common.ts:294-302)는 이 값으로
  (a) 미성년 20억 초과 40% 임계 판정과 (b) 할증 비율(ratio) 분자를 계산. 따라서 대납 gross-up 가산분이
  netCurrentGiftValue·aggregatedGiftValue에만 들어가면 **§57 할증의 임계·비율에 반영되지 않음** →
  "할증세액도 대납액에 포함되어 자연 반영" 주장은 세대생략 케이스에서 성립하지 않음(수렴값 불일치 가능).
  → 세대생략(donorGroup B) 케이스는 Pre-Do anchor로 §57 base/ratio/40%임계 반영 여부를 실증한 뒤
  주입 지점을 §57 전달값(grossGiftValue)까지 일관 조정하거나, '세대생략+미성년 20억 임계 인근'을 명시 제약/안내로 다룰 것.

---

## 4. 게이트 분기 (적용 조건)

```
gross-up 적용 = donorPaysGiftTax == true
             && donorHasJointLiability != true        // §4의2⑥ + 해석 207328
```

| 케이스 | donorPaysGiftTax | donorHasJointLiability | gross-up | 비고 |
|---|---|---|---|---|
| 일반(수증자 납부) | false | — | 미적용 | 기본값 |
| 비연대 대납 (전형) | true | false | **적용** | §36 재차증여 |
| 연대의무자 대납 | true | true | 미적용 + 안내 | 해석 207328 |
| 의제증여(§35~37·41의4 등) 대납 | true | (연대의무 성립 불가) | **적용** | §4의2⑥ 단서 → 항상 재차증여. MVP는 연대토글 false로 처리, 안내문 표기 |

> **안내 표기**: 연대의무 ON 시 "연대납세의무자로서 대납한 증여세는 재차증여에 해당하지 않습니다(국세청 해석 2011.11.28)" 문구를 결과/입력부에 노출. (memory `feedback_tax_calculation_principle` — 중립적 사실 서술)

---

## 5. Pre-Do Anchor (Do 진입 전 우선 작성·실행 — memory `feedback_pre_anchor_verification`)

### A-1. 전형 케이스: 부모 → 성년 자녀, 현금 5억, 비연대 대납

입력: 증여재산 500,000,000 / §53 성년 직계비속 공제 50,000,000 / 사전증여 없음 / 세대생략 없음 /
신고기한 내(§69 3%) / `donorPaysGiftTax=true`, `donorHasJointLiability=false`

- **비대납 baseline**: 과세표준 450,000,000 → 산출 80,000,000 → 신고공제 2,400,000 → **납부 77,600,000**
- **Gross-up 수렴(닫힌형 검산)**: 30% 구간 → `0.709·V = 427,250,000` → `V* ≈ 602,609,309`
  - 과세표준 552,609,309 → 산출 `floor(0.3×552,609,309 − 60,000,000) = 105,782,792`
  - 신고공제 `floor(105,782,792 × 0.03) = 3,173,483` → **납부 = 102,609,309**
  - 검증: `A + 납부 = 500,000,000 + 102,609,309 = 602,609,309 = V*` ✓ 고정점 일치

> **anchor 목표값**: `donorPaidTaxGrossUp.donorPaidTax === 102,609,309` (±1원 tolerance — floor 누적).
> 손계산 닫힌형과 엔진 반복값이 1원 이내 일치해야 함. **불일치 시 디자인 환류**
> (memory `feedback_anchor_correction_legal_priority` — 법령 정합값으로 anchor 재산정).

### A-2. 게이트 OFF 케이스: 위와 동일 + `donorHasJointLiability=true`
- 기대: gross-up 미적용 → `finalTax === 77,600,000`, `donorPaidTaxGrossUp.applied === false`

### A-3. 수렴 한계 케이스: 최고구간(50%) 30억 증여 대납 — MAX_ITER 내 수렴, tolerance 1원 확인

---

## 6. 구현 설계 — 엔진

### 6.1 신규 입력 필드 (`GiftTaxInput` @ `lib/tax-engine/types/inheritance-gift.types.ts:575-616`)

```ts
/** 증여자가 수증자의 증여세를 대신 납부하는지 (대납) */
donorPaysGiftTax?: boolean
/** 증여자가 연대납세의무자(§4의2⑥)로서 대납하는지 — true면 재차증여 아님(해석 207328) → gross-up 미적용 */
donorHasJointLiability?: boolean
```

### 6.2 신규 result echo 필드 (`GiftTaxResult` @ `inheritance-gift.types.ts:618-733`)

```ts
/** 대납 gross-up 상세 (echo — 산식·UI 표시용, 미적용 시 applied=false) */
donorPaidTaxGrossUp?: {
  applied: boolean                 // 게이트 통과 여부
  reasonNotApplied?: "joint_liability" | "toggle_off"
  iterations: number               // 수렴 반복 횟수
  originalNetGift: number          // A (gross-up 전 순증여)
  grossedUpNetGift: number         // V* (대납분 가산 후 순증여)
  donorPaidTax: number             // 대납세액 = 최종 finalTax (재차증여액)
  baselineTax: number              // 비대납 결정세액 (비교용)
}
```
> echo 패턴(memory `echo-field-pattern`): 기존 산식 무변경, optional 추가만 → 회귀 위험 0.

### 6.3 오케스트레이션 함수 (신규, `lib/tax-engine/gift-tax.ts`)

```ts
export function calcGiftTaxWithDonorPaidTax(input, options): GiftTaxResult
```
- 게이트 OFF → `calcGiftTax(input)` 그대로 + `donorPaidTaxGrossUp.applied=false`.
- 게이트 ON → §3.2 반복. 각 회차는 **내부 주입 필드**로 대납분을 aggregatedGiftValue에 가산. `donorTax = result.finalTax`.
- **2-스트림 케이스(§11-2 확정 — 차단)**: 특례(창업·가업) 자산이 포함된 증여 + 대납은 **입력 검증으로 차단**.
  주입 지점이 단일 스트림 `aggregatedGiftValue`(line 167-168)뿐이고 2-스트림 경로는 early-return으로 도달
  불가(`aggregatedOrdinaryValue` line 573 미주입) → 양립 불가. 후속 PR로 분리. (사용자 확정 2026-06-21)

**주입 지점**: `gift-tax.ts` STEP 3 `aggregatedGiftValue` 산출 직후(라인 167-168)에 `_donorPaidTaxAddition` 가산.
- ⚠️ **netCurrentGiftValue에 가산 금지** (§3.5 참조): netCurrentGiftValue는 STEP4 §46①2호 동시증여 안분
  분자·분모(gift-tax.ts:183)로도 쓰여 가산 시 공제 안분이 회차마다 이동 → 공제 1회 동결 모순.
  공제 안분 기준 `currentNetGiftValue`(STEP4 3번째 인자)는 **원래 순증여로 고정**.
- 내부 전용 필드 `_donorPaidTaxAddition?: number`를 `GiftTaxInput`에 추가(언더스코어=내부, Zod·UI 미노출).
- 공제(STEP 4)는 **원래 currentNetGiftValue 기준으로 고정**(가산분 미반영), 신고공제(STEP 8)는 가산된
  합산액 기준 작동. **할증(STEP 7)은 §57에 grossGiftValue가 전달되어 가산분 미반영**(§3.5 참조) —
  세대생략 케이스는 Pre-Do anchor 실증 후 §57 전달값 일관 조정 또는 제약/안내로 처리.

> **단일 진실 원칙**(memory `feedback_ui_engine_dual_truth_avoidance`): 반복은 `calcGiftTax`를 그대로
> 재호출 → 세율·공제·할증 매트릭스 재구현 금지. UI도 엔진 결과만 표시.

### 6.4 API route 호출 교체 (`app/api/calc/gift/route.ts:70`)

`calcGiftTax(input)` → `calcGiftTaxWithDonorPaidTax(input)` (동일 시그니처, 게이트 OFF 시 동일 동작).

---

## 7. 구현 설계 — UI / API (14개 동기화 지점)

> CLAUDE.md Definition of Done — `donorPaysGiftTax`·`donorHasJointLiability` 신규 필드 14지점 전수.

> **편집 대상 파일 (실측)**: ①②③⑤⑧은 `components/calc/gift-tax-form-shared.tsx`에 집중
> (`FormState` 인터페이스 :44, `INITIAL_FORM` :104, `STEPS` :130, `validateStep` :246).
> `GiftTaxForm.tsx`(`components/calc/GiftTaxForm.tsx`)가 이들을 import(:35,:40). 토글 UI는 세액공제
> 단계 컴포넌트 `components/calc/gift/GiftCreditChecklist.tsx`에 배치. (plan 초안의 `lib/calc/gift-validate.ts`·
> 막연한 "gift FormData" 표기는 실측 경로로 정정.)

**클라이언트 8**:
1. 폼 상태: `FormState`(`components/calc/gift-tax-form-shared.tsx:44`)에 `donorPaysGiftTax`/`donorHasJointLiability` 추가
2. initial: `INITIAL_FORM`(`gift-tax-form-shared.tsx:104`) 기본값 `false`/`false`
3. normalize: boolean 정규화
4. API 변환(`lib/calc/gift-api.ts`): body 매핑
5. UI 위젯: **세액공제 단계(STEP 6)** 하단에 `ToggleCard` "증여자 대납(代納)" → ON 시 하위에 `ToggleCard`/`RadioCardGroup` "연대납세의무 해당 여부"(+법령 안내). native 토글 금지(memory `feedback_toggle_card_visibility`)
6. 사이드바 합계: **N/A — 증여 마법사 입력 사이드바 부재**(실측: `components/calc/GiftTaxForm.tsx` 단일
   컬럼 StepWizard, sidebar/aside/sticky·`computeGiftSummary` 0건. 양도·취득과 달리 증여 폼엔 입력
   사이드바 미구현). "예상 대납세액"은 결과 도착 후에만 산출(엔진 반복 필요)되므로 입력 중 미리보기 불가 →
   사이드바 자체 부적합. 필요 시 사이드바 신설은 별도 작업으로 분리.
7. 결과 카드: "대납 gross-up" 섹션 —
   - **상단 강조 블록(§11-3 확정)**: "대납 포함 총 증여규모" = `grossedUpNetGift`(V*)를 크게 표시 +
     `원래 순증여(A) → +대납세액(donorPaidTax) → V*` 흐름, `baselineTax`(비대납) 대비 증가분
   - 하위 상세: iterations(수렴 횟수) / 산식 한국어 풀어쓰기(memory `feedback_result_view_korean_formula`)
   - 2-스트림 시 "특례 증여분 세금은 대납 gross-up에서 제외" 안내(amber)
   - ⚠️ **신규 결과 섹션은 선택 출력(PrintSelectionPanel) leaf id 등록 필수**
     (memory `project_selective_print_6tax_series`, 실측):
     1. `GiftPrintSectionId` union(`lib/print/gift-print-sections.ts:30`)에 `"donor-paid-grossup"` 추가
     2. `GIFT_PRINT_SECTIONS` 트리(`gift-print-sections.ts:55`) 적정 그룹(예 summary 또는 tax-credit 인근)에
        leaf 노드 추가(channel 결정)
     3. `availablePrintIds` Set(`components/calc/results/GiftTaxResultView.tsx`)에
        `if (result.donorPaidTaxGrossUp?.applied) s.add("donor-paid-grossup")` 가드 — 렌더 가드와 1:1
     4. 섹션 JSX를 해당 id로 감싸기
     5. PDF 채널 포함 시 `ResultPdfDocument` 분리 렌더 단위 추가
     (누락 시 화면엔 보여도 선택 출력/PDF에서 누락 또는 미등록 id 렌더 가드 불일치)
   - ⚠️ **별지 제10호서식(besshi10) 신고서 영향** (실측: `gift-tax-filing-form-besshi10.ts:67-78,125`):
     별지10호 builder는 `priorGiftSum`을 `aggregatedGiftValue − netCurrent`(netCurrent =
     `grossGiftValue − exemptAmount − debtAssumed`, 대납분 미포함)로 **역산**하고 ㉔ 증여세과세가액 =
     `aggregatedGiftValue`(line 125). gross-up 가산으로 aggregatedGiftValue가 부풀면
     `priorGiftSum = (부푼 aggregated) − (원래 netCurrent) = 대납분 + 실제 사전증여` → **대납 gross-up
     가산분이 신고서상 '증여재산가산액 ㉓(§47②)'으로 오귀속되어 공식 서식에 허위 표시**됨.
     → 다음 중 택일하여 설계 추가:
     (a) 엔진이 대납분을 **별도 echo 필드**(`donorPaidTaxGrossUp.donorPaidTax`)로 분리하고
         besshi10 역산식에서 차감하도록 `derivePriorGiftAddition` 보정, 또는
     (b) **신고서 표시는 원래 A 기준(대납 전)으로 고정**하고 gross-up은 결과 카드 별도 블록에만 표시.
     → `besshi10Rows`(㉓·㉔) 영향 검증 anchor 추가 필요(§8 테스트에 besshi10 행 anchor 1건).
8. validation: ⚠️ **`lib/calc/gift-validate.ts`는 존재하지 않음**(실측: lib/calc에 gift validate 파일
   부재 — acquisition-tax-validate·inheritance-validate·transfer-tax-validate 등 타 세목만 존재).
   증여세 폼 검증은 `components/calc/gift-tax-form-shared.tsx`의 `validateStep(step, form)` 함수(:246)에
   있으며 `GiftTaxForm.tsx:35`에서 import한다. 게이트 조합 모순 없음 → 차단 규칙 불필요(토글 자유 조합).
   ⑧은 **해당 없음(차단 규칙 불필요)**으로 처리하되, 신규 차단 규칙이 필요해지면 `validateStep`
   (또는 Zod superRefine)에 배치. UI 통과↔validate 동기화.

**API/Route 6**: ⑨⑩ Zod enum 해당 없음(boolean) / ⑪ 자산-수준 fallback 무관 / ⑫ **Zod 입력 객체에 두
boolean 추가** — 실측: `giftTaxInputSchema` 정의는 `lib/validators/property-valuation-input.ts:493-571`
(route.ts:13은 import만). 두 boolean(`donorPaysGiftTax`·`donorHasJointLiability`)을
`isSubstituteGift`(property-valuation-input.ts:514) 인근 optional boolean 위치에 추가. (route.ts에 추가하면
침묵 strip → 엔진 미도달) / ⑬ callGiftAPI body spread / ⑭ Route 엔진 input 매핑(boolean은 Date 변환 불요)

> 신규 필드 누락 침묵 strip 주의(memory `feedback_api_zod_schema_sync`): ⑫⑬⑭ grep 자가점검.
> `_donorPaidTaxAddition`은 **내부 전용** → Zod·API·UI에 **노출 금지**(엔진 내부에서만 세팅).

---

## 8. 테스트 계획

**엔진 anchor** (`__tests__/tax-engine/inheritance-gift/gift-donor-paid-grossup-anchor.test.ts` 신규):
- A-1 전형(102,609,309 ±1) / A-2 연대 OFF(77,600,000) / A-3 50% 구간 수렴 / 사전증여 합산 동반 케이스 / 비대납(토글 OFF) 무영향(기존 anchor 회귀)
- **세대생략 할증 포함 케이스 — 임계 경계값 anchor**: §57 할증이 grossGiftValue로 임계·비율을 계산하는
  실측(gift-tax.ts:241·inheritance-gift-common.ts:294-302)을 반영해, **가산 전 grossGiftValue ≤ 20억 →
  가산 후 합산 > 20억** 경계로 40% 임계가 gross-up에 반영되는지/되지 않는지를 구체값 anchor로 동결.
  Pre-Do anchor로 §57 base/ratio/40%임계 반영 여부를 먼저 실증한 결과를 기대값으로 고정.
- **공제 동결 anchor**: §53/§53의2 공제가 대납 회차에 무관하게 A 기준 1회로 고정됨을 검증
  (aggregatedGiftValue에만 가산·currentNetGiftValue 분자·분모 불변 확인, §3.5).
- **besshi10 신고서 행 anchor**: 대납 ON 케이스에서 ㉓ 증여재산가산액(§47②)·㉔ 증여세과세가액이
  대납 gross-up 가산분을 사전증여로 오귀속하지 않는지(택일 설계 (a)/(b) 반영 결과) 1건 동결.

**E2E** (`e2e/gift-donor-paid-grossup.spec.ts` 신규, memory `feedback_browser_verify_with_playwright`):
- 마법사 → 토글 ON → 결과에 gross-up 섹션·대납세액 표시 / 연대의무 ON → 안내문+미적용
- worktree 포트: `E2E_PORT=3103` (memory `feedback_e2e_worktree_port_isolation`)

**회귀**: `npm test` 전체 + `npx tsc --noEmit` 0건. 기존 gift anchor(E10~E21) 무변경 확인.

---

## 9. Do 단계 Phase (시퀀셜)

| Phase | 내용 | verify |
|---|---|---|
| Pre-Do | A-1 anchor 작성·실행(실패 확보) | 닫힌형 102,609,309과 대조 |
| A (엔진) | 타입 2필드+echo, `calcGiftTaxWithDonorPaidTax`, STEP3 주입, route 교체 | A-1~A-3 anchor 통과 |
| B (API) | Zod ⑫ + body ⑬ + route ⑭ | tsc 0 |
| C (UI) | ToggleCard 위젯⑤(`gift/GiftCreditChecklist.tsx`) + 사이드바⑥ **N/A(부재)** + 결과카드⑦(+선택출력 leaf id 등록·besshi10 표시 정책) + 변환④ + 폼①②③(`gift-tax-form-shared.tsx`) | E2E green |
| D (검증) | ⑧ **`lib/calc/gift-validate.ts` 부재 → 해당 없음**. 필요 시 `gift-tax-form-shared.tsx:246 validateStep` 또는 Zod superRefine | UI↔validate 무모순 |
| E (회귀) | 전체 test + tsc + lint | 0건 |

---

## 10. Scope (이번 PR 포함 / 제외)

**포함**: 현재 증여 1건에 대한 대납 gross-up(반복 수렴), 연대의무 게이트, 마법사 토글·결과(+선택출력 leaf
id), anchor·E2E. (사이드바는 증여 폼에 부재 → 미포함, §7-6 참조.)

**제외(후속)**:
- 대납분을 **별도 증여건(대납일=증여일)으로 신고서에 분리 등록** — 본 PR은 단일 증여 fold-back 모델(§47② 누적 수렴과 경제적 동치). 분리신고·신고기한·가산세 모델링은 별도 과제.
- 사전증여 이력에 대납분 자동 등록(다회차 연쇄 대납).
- 영리법인 수증·명의신탁 의제(§45의2) 등 특수 납세의무 구조.
- **동시증여(simultaneousGifts, §46①2호 안분) + 대납 공존 케이스** — gross-up을 aggregatedGiftValue에만
  가산하면 §53/§53의2 공제는 고정되나, 동시증여 안분과 대납의 상호작용은 본 PR에서 검증·구현하지 않음.
  본 PR 검증 전까지 동시증여 입력이 있으면서 대납 토글 ON인 조합은 **명시 제외**(필요 시 입력 검증으로
  차단하거나 결과에 미지원 안내). (§3.5 모순 회피 — 공제 1회 동결 보장 범위 내로 한정.)

---

## 11. 설계 확인 항목 (사용자 확정 — 2026-06-21)

1. ✅ **사전증여 합산(§47②) 동반 시**: 현 회차 합산 과세가액 기준으로 gross-up. 대납분을 또 다른
   사전증여로 누적하지 않음(MVP). — **확정(동의)**
2. ✅ **2-스트림 특례(창업·가업) + 대납**: **본 PR 차단(입력 검증)** — 진짜 MVP. (사용자 재확정 2026-06-22)
   → 자가검증이 plan(지원)↔engine설계(차단) 모순을 high로 적발. 사용자가 "차단(입력검증)" 선택.
   주입 지점이 단일 스트림 `aggregatedGiftValue`(167-168)뿐이고 2-스트림 early-return으로 도달 불가
   (`aggregatedOrdinaryValue` line 573 미주입). 대납은 순수 일반증여에만. 특례+대납은 후속 PR.
   → `donorPaysGiftTax=true` + `creditInput.specialTreatment` 조합은 ⑧ validateStep + ⑫ Zod superRefine
   동일 메시지로 차단(엔진 설계서 C-7).
3. ✅ **결과 화면**: "대납 포함 총 증여규모(V*)"를 **별도 강조 표시**. — **확정**
   → `donorPaidTaxGrossUp.grossedUpNetGift`(V*)를 결과 카드 상단 강조 블록으로 노출
   (원래 순증여 A → +대납세액 → V* 흐름 + baselineTax 대비).

> **추가 차단 조합 (엔진 설계서 C-7·C-8·C-11 — 본 PR scope 제외, 입력 검증 차단)**:
> 대납(代納) + ⓐ 동시증여(simultaneousGifts, §46①2호) · ⓑ 2-스트림 특례(specialTreatment) ·
> ⓒ 세대생략(donorGroup=B, §57 grossGiftValue 조정 미구현) 3조합은 ⑧ validateStep + ⑫ Zod superRefine
> 양쪽에서 **동일 메시지로 차단**(직접 API 호출 우회 방어). 지원: 순수 일반증여 + 대납, 사전증여 합산 + 대납.

---

### 부록. 핵심 anchor 파일:line (Explore 실측)

| 대상 | 위치 |
|---|---|
| 메인 엔진 `calcGiftTax` | `lib/tax-engine/gift-tax.ts:70-388` |
| STEP 3 합산 주입 지점 | `lib/tax-engine/gift-tax.ts:145-175` |
| STEP 8 세액공제(§69) | `lib/tax-engine/gift-tax.ts:260-272` |
| STEP 9 finalTax | `lib/tax-engine/gift-tax.ts:280-288` |
| 누진세율 §56 | `lib/tax-engine/inheritance-gift-common.ts:82-88`(상수)·`100-106`(함수) |
| Input/Result 타입 | `lib/tax-engine/types/inheritance-gift.types.ts:575-733` |
| API route | `app/api/calc/gift/route.ts:70` |
| Zod 스키마 | `giftTaxInputSchema` 정의 — `lib/validators/property-valuation-input.ts:493-571` (z.object 본문 494-522, `isSubstituteGift` 514). route.ts:13은 import만 |
| UI 폼 (FormState·INITIAL_FORM·STEPS·validateStep) | `components/calc/gift-tax-form-shared.tsx`(:44·:104·:130·:246) — `GiftTaxForm.tsx`가 import |
| UI 토글 위젯 (세액공제 단계) | `components/calc/gift/GiftCreditChecklist.tsx` |
| 결과 뷰 + 선택출력 가드 | `components/calc/results/GiftTaxResultView.tsx` (`availablePrintIds`) |
| 선택출력 leaf id | `lib/print/gift-print-sections.ts`(`GiftPrintSectionId` :30, `GIFT_PRINT_SECTIONS` :55) |
| 별지10호 신고서 역산 | `lib/tax-engine/gift-tax-filing-form-besshi10.ts:67-78`(`derivePriorGiftAddition`)·125(㉔) |
| §57 할증(전달값 grossGiftValue) | `lib/tax-engine/gift-tax.ts:237-245` → `inheritance-gift-common.ts:294-302` |
| §53/§53의2 동시증여 안분 | `lib/tax-engine/deductions/gift-deductions.ts:100-127`·197-208 (currentNetGiftValue 분자·분모) |
| 테스트 | `__tests__/tax-engine/inheritance-gift/gift.test.ts` 외 9 |
