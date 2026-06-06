# 상속세·증여세 분납(分納) §70② 구현 계획서

> **PDCA Phase: Plan** | 작성일: 2026-06-05 | 대상: 상속세·증여세 공통
> 엔진 시니어(`inheritance-gift-tax-senior`) + UI 시니어(`inheritance-gift-tax-ui-senior`) 병렬 수립 → 통합

---

## 0. 한 줄 요약

납부할 세액(결정세액)이 1천만원을 초과할 때 신고기한 경과 후 **2개월 이내에 2회 분할납부**(상증법 §70② · 시행령 §66②)하는 기능을 상속·증여 양 세목에 추가하고, **입력 토글 → 결과뷰 분납 일정 카드 → 신고서 별지(상속 별지9호 ㊶ · 증여 별지10호 ㊼) 실값 연동**까지 구현한다.

연부연납(§71)과는 **법령상 배타 제도**이며, 기존 연부연납이 "결과뷰 직접 계산 + API 미경유 투영" 패턴으로 구현돼 있으므로 분납도 **동일 투영 패턴**을 채택한다(회귀 최소·일관성).

---

## 1. 현황 (조사 완료 — 실측)

분납(§70②)은 신고서의 "칸"과 "분납기한 날짜"만 존재하고, 실제 분납액 계산·입력·결과 표시는 전무하다.

| 구성요소 | 상태 | 위치 |
|---|---|---|
| 분납액 계산 함수 | ❌ 전무 (1천만 임계·2회 배분 0건) | — |
| 분납기한 날짜 도출 | ✅ 날짜만 (신고기한+2개월) | `lib/calc/filing-form-9-data.ts:56-57` |
| 상속 별지9호 ㊶ | ⚠️ `amount:0, display:"dash"` 날짜만 | `lib/calc/filing-form-9-data.ts:171-178` |
| 증여 별지10호 ㊼ "현금 분납" | ⚠️ `cashDef = r.cashDeferred ?? 0`, 항상 0 | `gift-tax-filing-form-besshi10.ts:110,148` |
| 증여 result `cashDeferred` | ⚠️ 선언만, 항상 0 echo | `types/inheritance-gift.types.ts:1319` · `gift-tax.ts:309` |
| 상속 result `cashDeferred` | ❌ 필드 자체 없음 | — |
| 입력 UI | ❌ 없음 (`InstallmentInputSection`은 §71 전용) | `components/calc/inheritance/InstallmentInputSection.tsx:26-115` |
| 결과뷰 표시 | ❌ 없음 (기존 "분할납부"는 전부 §71) | `InstallmentScheduleCard.tsx` · `GiftTaxResultView.tsx:74` |

**참고 — 연부연납(§71) 패턴 (분납이 따라야 할 일관성 기준)**

- 상속 연부연납: `lib/tax-engine/credits/installment-payment.ts` `calcInstallmentSchedule` 완전 구현. **결과뷰 Step4에서 직접 호출**, API 미경유 투영 (메모리 `project_inheritance_installment_schedule`).
- 증여 연부연납: `gift-tax.ts:308` `installmentPayment: 0` 하드코딩 미구현 (이번 범위 외, 후속 PR).

---

## 2. 법령 검증 결과 (KoreanLaw MCP 실측)

### 2.1 §70② 본문 (상증법, MST 276123, 시행일 2026-01-02)

> 제70조(자진납부) ② 제1항에 따라 납부할 금액이 **1천만원을 초과하는 경우**에는 대통령령으로 정하는 바에 따라 그 납부할 금액의 일부를 **납부기한이 지난 후 2개월 이내**에 분할납부할 수 있다. **다만, 제71조에 따라 연부연납을 허가받은 경우에는 그러하지 아니하다.**

### 2.2 시행령 §66② 분납액 산식 (상증령, MST 283637, 시행일 2026-02-27)

> ② 법 제70조제2항의 규정에 의하여 분납할 수 있는 세액은 다음 각호에 의한다.
> 1. 납부할 세액이 **2천만원 이하**인 때에는 **1천만원을 초과하는 금액**
> 2. 납부할 세액이 **2천만원을 초과**하는 때에는 **그 세액의 100분의 50 이하의 금액**

### 2.3 확정 산식

```
payableTax = finalTax (결정세액, 가산세 별도 — §70① "산출세액" 기준)

if payableTax <= 10_000_000           → 분납 불가 ("초과"이므로 정확히 1천만은 불가)
if 10_000_000 < payableTax <= 20_000_000 → maxSplit = payableTax - 10_000_000
if payableTax > 20_000_000            → maxSplit = floor(payableTax × 0.5)

splitAmount  = min(requestedSplitAmount ?? maxSplit, maxSplit)   // "이하" → 납세자 선택
firstPayment = payableTax - splitAmount                          // 1차 (신고기한 내)
secondPayment = splitAmount                                      // 2차 (분납기한 내)
```

### 2.4 확정 사항

| 항목 | 확정 |
|---|---|
| 임계 | 납부세액 **1천만원 초과** (정확히 1천만 = 불가) |
| 기준액 | `payableTax = finalTax`. 가산세(`underreportPenalty`·`latePaymentPenalty`)는 §70① 산출세액 외 별도 항목이므로 **미포함**. **징수유예(§74 문화유산, `culturalHeritageDeferredTax`)는 차감하지 않음** (검토 #9 재정정): §70① "납부할 금액" 차감항목은 신고세액공제·연부연납·납부유예(§72의2)·물납(§73) 4종뿐이며 **징수유예(§74)는 명문에 없다**. 징수유예는 세액 감면이 아니라 "징수 시기 유예"이므로 납부할 금액 자체는 불변. (`InheritanceTaxResultView.tsx:357`의 `finalTax − culturalHeritageDeferredTax`는 *징수유예 후 즉시 납부액* 표시일 뿐 §70② 기준액과 무관) — **Do 진입 전 KoreanLaw로 §70① 본문 최종 확인** |
| 연부연납 배타 | §71 허가 시 분납 불가 (§70② 단서) |
| 신청 성격 | 납세자 선택("할 수 있다") — 자동 강제 아님 |
| 분납기한 | 신고기한 + 2개월. 상속 신고기한 = 상속개시일 말일+6개월 / 증여 = 증여일+3개월(§68①) |

---

## 3. 채택 아키텍처 결정 (두 계획 충돌 해소 + 별지 빌드 위치 실측 반영)

### 3.1 기본 방침 — 결과뷰 카드는 "투영", 신고서 별지는 빌드 위치별 비대칭

| 쟁점 | 엔진 시니어 안 | UI 시니어 안 | **채택** |
|---|---|---|---|
| 결과뷰 카드 계산 경로 | 엔진 STEP 통합 | 결과뷰에서 퓨어 함수 직접 호출 (투영) | **투영 패턴** (연부연납 일관성·회귀 최소) |
| 퓨어 함수 위치 | `credits/installment-split.ts` 신규 | `credits/installment-payment.ts` 추가 | **신규 파일 `credits/installment-split.ts`** |
| 신고서 별지 연동 | result 필드 | 클라이언트 어댑터 | **빌드 위치별 비대칭** (3.2 참조) |

### 3.2 ⚠️ 신고서 별지 빌드 위치 비대칭 (실측 — 1차 검토 #1 정정)

**실측 결과**, 상속 별지9호와 증여 별지10호는 **빌드 위치가 다르다**:

| 별지 | 빌드 함수 | 위치 | 투영 가능? |
|---|---|---|---|
| 상속 별지9호 ㊶ | `buildFilingForm9Data()` | **`lib/calc/filing-form-9-data.ts:88`** (클라이언트 어댑터) | ✅ 가능 — `splitPaymentAmount` 인자 추가로 투영 |
| 증여 별지10호 ㊼ | `buildBesshi10Rows()` | **`lib/tax-engine/gift-tax.ts:312`** (엔진 내부, result에 포함) | ❌ 불가 — `result.besshi10Rows`가 엔진에서 이미 빌드됨 |

→ 증여 별지10호 ㊼는 **엔진이 분납액을 알아야** 채울 수 있다. `besshi10` 빌더는 이미 `cashDef = r.cashDeferred ?? 0`(`gift-tax-filing-form-besshi10.ts:110`)을 읽고 `reportPay = max(0, finalTax − installment − cashDef)`(:111)로 신고납부(=1차 납부)를 자동 도출하므로, **엔진이 `cashDeferred`를 echo**하면 별지10호가 자동 완성된다.

> ⚠️ **순환 의존 주의 (2차 검토 #8)**: 분납액 = `calcInstallmentSplit(finalTax, …)`인데 `finalTax`는 **엔진 계산 결과**다. 따라서 분납액(=`cashDeferred`)을 **클라이언트가 input으로 전달할 수 없다**(finalTax가 분납 input보다 먼저 필요 → 2-pass). 해결: 증여 input은 **의사·희망액**(`applyInstallmentSplit`, `requestedSplitAmount`)만 받고, **엔진이** finalTax 산출 직후 내부에서 `calcInstallmentSplit({payableTax: finalTax, applyInstallmentSplit, requestedSplitAmount})`를 호출해 `cashDeferred: split.splitAmount`로 echo한다. `cashDeferred`는 input 필드가 아니다.

### 3.3 최종 채택 (세목별)

| 계층 | 상속세 | 증여세 |
|---|---|---|
| 결과뷰 분납 카드 | 투영 (`calcInstallmentSplit(finalTax, form)` 직접) | **투영 (동일 — finalTax+form)** |
| 신고서 별지 | 별지9호 ㊶ = 투영(`buildFilingForm9Data` 인자) | 별지10호 ㊼ = **엔진 내부 `calcInstallmentSplit` → `cashDeferred` echo** |
| 엔진 input | 불필요 | **`applyInstallmentSplit`+`requestedSplitAmount`** (의사·희망액. `cashDeferred`는 input 아님) |
| API/Zod 동기화 | **불필요** (전부 클라이언트 빌드) | **④⑨⑫⑬⑭ 필요** (input 2필드) |
| result 필드 | 불필요 (별지9호 클라 빌드) | 기존 `cashDeferred` echo 활성화 (타입 이미 존재 `types/inheritance-gift.types.ts:1319`) |

**증여 데이터 흐름** (검토 #8·#10):
- **결과뷰 카드**: `result.finalTax` + form(`splitPaymentEnabled/Amount`) → 클라에서 `calcInstallmentSplit()` 투영 (상속과 공통 `SplitPaymentCard`).
- **별지10호**: form → `gift-api.ts`(④)가 `applyInstallmentSplit`/`requestedSplitAmount` 전달 → Zod(⑨⑫) → route(⑭) → 엔진이 finalTax 산출 후 `calcInstallmentSplit({payableTax: finalTax, applyInstallmentSplit, requestedSplitAmount})` → `cashDeferred: split.splitAmount` echo(`gift-tax.ts:309` 수정) → 별지10호 자동.
- 카드(투영)와 별지(엔진)는 **동일 `calcInstallmentSplit` + 동일 입력(finalTax, requestedSplitAmount)** → 값 일치 보장, dual-truth 아님.

> **단일 진실 원칙**: 분납 임계·산식은 `calcInstallmentSplit()` + `isInstallmentSplitEligible()` 한 곳에만 둔다. 결과뷰·신고서 어댑터·`availablePrintIds` 어디서도 1천만/50% 재구현 금지 (메모리 `feedback_ui_engine_dual_truth_avoidance`).

---

## 4. 퓨어 함수 설계

**신규 파일**: `lib/tax-engine/credits/installment-split.ts` (상속·증여 공용 순수 함수, DB 호출 없음)

```typescript
export interface InstallmentSplitInput {
  payableTax: number;               // = finalTax (결정세액, 원 정수)
  applyInstallmentSplit: boolean;   // 분납 신청 여부
  requestedSplitAmount?: number;    // 분납 희망액 (미입력 시 maxSplit)
  applyLongTermInstallment?: boolean; // §71 연부연납 허가 → true면 분납 불가
}

export interface InstallmentSplitResult {
  eligible: boolean;       // payableTax > 1천만 (& 연부연납 아님)
  applied: boolean;        // eligible && applyInstallmentSplit
  maxSplitAmount: number;  // 구간별 최대 분납액
  splitAmount: number;     // 실제 분납액 (2차)
  firstPayment: number;    // 1차 (= payableTax - splitAmount)
  secondPayment: number;   // 2차 (= splitAmount)
  warnings: string[];
}

export function calcInstallmentSplit(input: InstallmentSplitInput): InstallmentSplitResult;

/** 분납 적격 여부 단일 판정 (§70② 임계). 결과뷰·availablePrintIds 공용 — dual-truth 방지. */
export function isInstallmentSplitEligible(finalTax: number): boolean; // finalTax > 10_000_000
```

> **별지 신고납부 정합** (1차 검토 #4): 증여 별지10호 `reportPay = max(0, finalTax − installment − cashDef)`(`besshi10:111`)이므로 `firstPayment`(1차 납부) ≡ 별지 "신고납부"칸과 등가다. `cashDeferred = secondPayment(=splitAmount)`를 공급하면 별지 신고납부가 자동으로 1차 납부액이 된다 (연부연납·분납 배타이므로 동시 차감 없음).

**로직 핵심**
- 연부연납 배타 우선: `applyLongTermInstallment === true` → `eligible:false`, 경고 "§70② 단서: §71 연부연납 허가 시 분납 불가".
- `payableTax <= 10_000_000` → `eligible:false`.
- 구간별 maxSplit: 구간1 `payableTax - 10_000_000` / 구간2 `applyRate(payableTax, 0.5)`(=`Math.floor(payableTax * 0.5)`).
- 미신청(`applyInstallmentSplit:false`) → `eligible:true, applied:false`, 전액 1차.
- 희망액 clamp: `> maxSplit` → maxSplit + 경고. `<= 0` → maxSplit.
- **정수 연산**: `applyRate`/`safeMultiply` 사용, `Math.round` 금지. `firstPayment = payableTax - splitAmount`로 항등식 `1차+2차 = payableTax` 보장 (홀수 원은 1차가 흡수).

---

## 5. 케이스 인벤토리 (행≥1 필수)

| ID | payableTax | 신청 | 연부연납 | 희망액 | maxSplit | splitAmount | 1차 | 2차 | 비고 |
|----|-----------|-----|---------|-------|---------|------------|-----|-----|------|
| CS-01 | 8,000,000 | - | - | - | 0 | 0 | 8,000,000 | 0 | 임계 미충족 |
| CS-02 | 10,000,000 | true | false | - | 0 | 0 | 10,000,000 | 0 | 정확히 1천만 = 불가 |
| CS-03 | 10,000,001 | true | false | - | 1 | 1 | 10,000,000 | 1 | 구간1 최소 경계 |
| CS-04 | 15,000,000 | true | false | - | 5,000,000 | 5,000,000 | 10,000,000 | 5,000,000 | 구간1 기본 |
| CS-05 | 20,000,000 | true | false | - | 10,000,000 | 10,000,000 | 10,000,000 | 10,000,000 | 구간1 상단 경계 |
| CS-06 | 20,000,001 | true | false | - | 10,000,000 | 10,000,000 | 10,000,001 | 10,000,000 | 구간2 진입, floor |
| CS-07 | 50,000,000 | true | false | - | 25,000,000 | 25,000,000 | 25,000,000 | 25,000,000 | 구간2 기본 |
| CS-08 | 50,000,000 | true | false | 10,000,000 | 25,000,000 | 10,000,000 | 40,000,000 | 10,000,000 | 희망액 < 최대 → 적용 |
| CS-09 | 50,000,000 | true | false | 30,000,000 | 25,000,000 | 25,000,000 | 25,000,000 | 25,000,000 | 희망액 > 최대 → clamp+경고 |
| CS-10 | 50,000,000 | false | false | - | 25,000,000 | 0 | 50,000,000 | 0 | 미신청 (eligible, !applied) |
| CS-11 | 50,000,000 | true | **true** | - | - | 0 | 50,000,000 | 0 | §71 배타 → 불가+경고 |
| CS-13 | 100,000,001 | true | false | - | 50,000,000 | 50,000,000 | 50,000,001 | 50,000,000 | 홀수 floor, 1차 흡수 |

항등식: 모든 행 `1차 + 2차 = payableTax` 성립.

---

## 6. Pre-Do anchor (Do 진입 전 우선 작성·실행)

**파일**: `__tests__/tax-engine/inheritance/installment-split.test.ts` (신규)

- `IS-01` 구간1: 1,500만 → split 500만, 1차 1,000만, 항등식 (CS-04)
- `IS-02` 구간2: 5,000만 → split 2,500만, 항등식 (CS-07)
- `IS-03` 연부연납 배타: §71 허가 → eligible:false, 경고 (CS-11)
- `IS-04` 임계 정확히 1천만 → eligible:false (CS-02)
- `IS-05` 희망액 clamp: 3,000만 입력 → 2,500만 + 경고 (CS-09)
- `IS-06` 홀수 floor: floor(100,000,001×0.5)=50,000,000, 1차 50,000,001, 항등식 (CS-13)

> Pre-Do anchor 1~2건을 **먼저 실행해 실패 확보** 후 설계 환류 (메모리 `feedback_pre_anchor_verification`).

---

## 7. UI 입력 위젯 설계 (⑤)

### 7.1 상속세 — `components/calc/inheritance/InstallmentInputSection.tsx`

§71 연부연납 ToggleCard(amber)와 같은 섹션에 §70 분납 ToggleCard(**sky**) 추가. **상호 배타**:
- 한쪽 ON 시 다른쪽 `disabled` + `disabledReason="분납(§70②)과 연부연납(§71)은 동시 신청 불가"` (ToggleCard 기존 prop).
- 분납 ON 펼침: `FieldCard "분납 희망액"` + `CurrencyInput` (hint: §70② 한도). 미입력 허용 → 결과뷰에서 최대 분납액 안내 (자동 채움 금지 — 메모리 `feedback_no_silent_apportion_fallback`).

### 7.2 증여세 — `components/calc/gift-tax-form-shared.tsx` Step3 끝

연부연납 입력이 없으므로 배타 대상 없음. §70 분납 ToggleCard(sky) + 희망액 `CurrencyInput`만 추가.

> 공통 UI 규칙: ToggleCard 필수(native 금지), OFF도 tone 유지, select-on-focus, `CurrencyInput`, "원" 미표기.

---

## 8. FormState 확장 (① ② ③)

상속 `components/calc/inheritance/shared.ts` · 증여 `components/calc/gift-tax-form-shared.tsx` 양쪽:

```typescript
splitPaymentEnabled: boolean;  // INITIAL: false
splitPaymentAmount: string;    // INITIAL: "" (빈 문자열 허용)
```

- ③ normalize: `splitPaymentAmount` 빈 문자열 그대로. **레거시 가드** — `installmentEnabled && splitPaymentEnabled` 동시 true 복원 시 `splitPaymentEnabled=false` 강제(연부연납 우선).
- factory=normalize=UI default 3중 일치 (메모리 `feedback_store_default_vs_ui_display_fallback`).

---

## 9. 결과뷰 출력 설계 (⑦) — 핵심 요구사항

**신규 컴포넌트**: `components/calc/results/installment/SplitPaymentCard.tsx` (tone **sky** — §71 amber와 시각 분리)

```typescript
interface SplitPaymentCardProps {
  finalTax: number;
  filingDeadline?: string;     // 신고기한 YYYY-MM-DD
  installmentDueDate?: string; // 분납기한 (신고기한+2개월)
  splitPaymentEnabled: boolean;
  splitPaymentAmount?: number; // 희망액 (미입력 시 maxSplit 안내)
  applyLongTermInstallment?: boolean; // 연부연납 ON 시 비표시/안내
}
```

내부에서 `calcInstallmentSplit()` 직접 호출(투영). 적격 판정은 `isInstallmentSplitEligible(finalTax)` 사용(dual-truth 방지). 렌더 분기:
- `!isInstallmentSplitEligible(finalTax)`(≤1천만) 또는 연부연납 ON → `return null`.
- `eligible && !applied` → **분납 안내 카드** (최대 분납 가능액 + 분납기한 + "입력 단계에서 분납을 켜세요").
- `applied` → **분납 일정 카드** (1차/2차 금액 + 신고기한/분납기한).

**Mockup (분납 일정 카드)**
```
┌──────────────────────────────────────────────────┐
│ 분납 일정 (상증법 §70②)                  [sky]    │
│ 신고기한 내 납부 + 2개월 이내 분납                  │
├──────────────────────────────────────────────────┤
│ 납부할 세액 (결정세액)            130,000,000      │
│ 1차 납부 (신고기한 이내)           65,000,000      │
│   = 납부할 세액 − 분납액    기한 2025-09-30        │
│ 2차 분납 (분납기한 이내)           65,000,000      │
│   = 분납 신청액(최대 50%)   기한 2025-11-30        │
├──────────────────────────────────────────────────┤
│ ※ 분납 시 납세담보 제공 불필요. 금액은 §70② 한도   │
│   이내에서 납세자가 선택합니다.                     │
└──────────────────────────────────────────────────┘
```

- 산식 한국어 풀어쓰기(약어·`floor()` 금지), "원" 미표기, 금액 칸 `font-mono tabular-nums text-right` (skill `amount-column-align`).
- `InheritanceTaxResultView.tsx`(연부연납 `InstallmentScheduleCard` 인접, line 35)·`GiftTaxResultView.tsx`에 마운트, 별도 `PrintSection id="split-payment"`.
- `availablePrintIds`에 `isInstallmentSplitEligible(result.finalTax)`일 때 `"split-payment"` 추가 (상속: `InheritanceTaxResultView.tsx:229` `installment-guide` 패턴 참조 / 증여: `GiftTaxResultView.tsx:233` `availablePrintIds` useMemo).
- **분납기한 도출 (검토 #6 정정)**:
  - 상속 = 기존 `installmentDueDate` 재사용 (`filing-form-9-data.ts`가 이미 `deriveDueDates`로 계산, 단 `deriveDueDates`는 module-private이므로 결과뷰에는 `buildFilingForm9Data().installmentDueDate`(line 210) 경유 전달).
  - 증여 = `deriveGiftDueDate(giftDate)` **신규 헬퍼** (증여일+3개월 신고기한+2개월). 상속 `deriveDueDates`와 산식이 달라 재사용 불가.
- **`giftDate` (검토 #2 정정)**: `GiftTaxResultView`에 `giftDate?: string` prop이 **이미 존재**(`GiftTaxResultView.tsx:138`) → 신규 추가 없이 재사용. 추가 prop은 `splitPaymentEnabled/Amount` 2개만.

---

## 10. 사이드바 (⑥)

분납은 세액 불변 → "납부세액" 합계 변경 없음. 분납 ON 시 "분납 신청 중" informational 뱃지만 선택적 표시(우선순위 낮음, Do에서 결정).

---

## 11. 신고서 별지 실값 연동 (⑦ 신고서) — 빌드 위치 비대칭 (§3.2 참조)

- **상속 별지9호 ㊶** (클라이언트 빌드, `filing-form-9-data.ts:171-178`): `buildFilingForm9Data(...)`에 `splitPaymentAmount?: number` 인자 추가 → ㊶ `amount`를 `splitPaymentAmount`로 연동(`display:"dash"`→실값). 호출처에서 `calcInstallmentSplit().splitAmount` 전달. ㊶ 분납액·㊷ 신고기한 이미 날짜 표시 중.
- **증여 별지10호 ㊼** (엔진 빌드, `gift-tax.ts:312` → `buildBesshi10Rows`): 투영 불가. **`GiftTaxInput.cashDeferred?` input 추가** → `gift-tax.ts:309` `cashDeferred: input.cashDeferred ?? 0` echo → 빌더(`besshi10:110`)가 `r.cashDeferred` 읽어 ㊼ + 신고납부(`reportPay`, :111) 자동 완성. 값 공급은 클라이언트가 `calcInstallmentSplit().splitAmount`를 `gift-api.ts`에서 `input.cashDeferred`로 전달(④⑨⑫⑬⑭).

---

## 12. Validation (⑧)

`lib/calc/inheritance-validate.ts` · 증여 validate:
- **R-1 배타**: `splitPaymentEnabled && installmentEnabled` → 오류 "연부연납(§71)과 분납(§70②)은 동시 신청 불가".
- **R-2 / R-3** (임계 미달·한도 초과): `finalTax`가 validate 시점 미계산 → **결과뷰 경고로 처리**(`warnings`). UI 통과↔validate 차단 모순 회피 (메모리 `feedback_validation_sync_8th_point`). 빈 희망액 자동 채움 금지.

---

## 13. 14 동기화 지점 담당 분배

> **세목 비대칭** (검토 #1 정정): 상속은 전부 클라이언트 빌드라 API/Zod 불필요. **증여만** 별지10호 때문에 `cashDeferred` 1필드의 ④⑨⑫⑬⑭ 동기화 필요.

| 지점 | 내용 | 상속 | 증여 | 담당 |
|---|---|---|---|---|
| ① 타입 | FormState `splitPaymentEnabled/Amount` | ✅ | ✅ | UI |
| ② initial | `false, ""` | ✅ | ✅ | UI |
| ③ normalize | 빈 문자열 허용 + 배타 레거시 가드 | ✅ | ✅(배타 가드 무관*) | UI |
| ④ API 변환 | `gift-api.ts`에 `applyInstallmentSplit`+`requestedSplitAmount` 전달 (cashDeferred 아님 — 순환 회피 #8) | — 불필요 | ✅ **필요** | UI |
| ⑤ UI 위젯 | §70 ToggleCard + CurrencyInput | ✅(배타) | ✅(배타 대상 없음) | UI |
| ⑥ 사이드바 | 선택적 뱃지 | ✅ | ✅ | UI |
| ⑦ 결과 카드 | `SplitPaymentCard` 신규 + 2 ResultView 마운트 | ✅ | ✅ | UI |
| ⑦ 신고서 | 별지9호 ㊶ 투영 / 별지10호 ㊼ input echo | ✅(인자) | ✅(input) | UI |
| ⑧ validation | R-1 배타 | ✅ | —(연부연납 입력 없음) | UI |
| ⑨ Zod enum/객체 | `route.ts` 스키마에 `applyInstallmentSplit`+`requestedSplitAmount` | — | ✅ **필요** | 엔진 |
| ⑫⑬⑭ Route/매핑 | Zod 객체·body spread·엔진 input 매핑 | — | ✅ **필요** | 엔진 |
| result echo | `gift-tax.ts:309` `cashDeferred: calcInstallmentSplit({payableTax: finalTax, …}).splitAmount` | — | ✅ | 엔진 |
| 퓨어 함수 | `calcInstallmentSplit` + `isInstallmentSplitEligible` + anchor IS-01~06 | ✅ | ✅ | 엔진 |

*증여는 연부연납 입력 자체가 없어 `applyLongTermInstallment`는 항상 false → 배타 가드 무의미하나 필드는 유지(향후 §71 구현 대비).

엔진 시니어 = 퓨어 함수 + 헬퍼 + anchor + 증여 ⑨⑫⑬⑭·result echo. UI 시니어 = ①②③④⑤⑥⑦⑧.

---

## 14. 리스크

- **R-1 연부연납 배타**: 엔진은 `applyLongTermInstallment` 플래그로 "분납 불가" 판정만. §71 실 세액 차감은 범위 외. UI는 토글 상호 disabled + normalize 가드 + validate R-1 삼중 방어.
- **R-2 가산세 기준**: 분납 기준 = `finalTax`(가산세 미포함). 향후 `finalTax`에 가산세 포함되도록 엔진 변경 시 재검토 (주석 명시).
- **R-3 증여 신고기한**: `deriveDueDates`는 상속 전용(말일+6개월)이며 **module-private(non-export, `filing-form-9-data.ts:229`)**. 증여용 `deriveGiftDueDate`(증여일+3개월+2개월) 신규 헬퍼 필요.
- **R-4 PrintSection id**: 기존 `installment-guide`(상속, `InheritanceTaxResultView.tsx:229`)·`installment`(증여, `GiftTaxResultView.tsx:258`)와 구분 위해 `split-payment` 사용. `PrintSectionId`(상속)·`GiftPrintSectionId`(증여) 타입 + 레지스트리 양쪽 등록 필요(`shared/PrintSection` 계열).
- **R-5 홀수 floor 항등식**: 2회 분할이므로 BigInt 불필요. CS-13 anchor로 1차 흡수 검증.
- **R-6 (범위 외)** 증여 연부연납 `gift-tax.ts:308` 0 하드코딩 — 본 PR 미변경, 후속 별도 PR.

---

## 15. Do 단계 작업 순서

1. **법령 상수** — `lib/tax-engine/legal-codes/inheritance-gift.ts`(§71 `INSTALLMENT`:267 인접)에 `SPLIT_PAYMENT="상증법 §70②"`, `SPLIT_PAYMENT_ENF="상증령 §66②"` 추가 (기존 `INSTALLMENT` 키와 prefix 구분 — 검토 #3)
2. **퓨어 함수** — `credits/installment-split.ts`: `calcInstallmentSplit` + `isInstallmentSplitEligible` + anchor IS-01~06 **선작성·실행(Pre-Do)**
3. **FormState** — 상속·증여 ①②③ + 배타 normalize 가드
4. **입력 위젯** — 상속 `InstallmentInputSection`(배타)·증여 Step3 끝 ⑤
5. **결과 카드** — `SplitPaymentCard` 신규 + 2 ResultView 마운트 + `deriveGiftDueDate`(증여)
6. **신고서** — 상속 별지9호 ㊶ 투영(인자) / 증여 별지10호 ㊼ = `GiftTaxInput`에 `applyInstallmentSplit`+`requestedSplitAmount` 추가 + ④⑨⑫⑬⑭ + `gift-tax.ts:309` 엔진 내부 `calcInstallmentSplit` → `cashDeferred` echo (순환 회피)
7. **validation** — R-1 배타(상속)
8. **검증** — `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/inheritance/` + `gift/` → `npm test` 전체 → E2E (`e2e/*.spec.ts`, `E2E_PORT=3100`) → `ui-engine-sync-checker`

---

## 16. 범위 (Scope)

**포함**: 상속·증여 분납(§70②) 엔진 퓨어 함수·입력 토글·결과뷰 카드·별지 실값·배타 처리·anchor·E2E.
**제외**: 증여 연부연납(§71) 0 하드코딩 해소(후속 PR), 분납 가산금/이자 계산(§70②은 무이자 분납), 물납(§73)·납부유예(§72의2) 연동.
