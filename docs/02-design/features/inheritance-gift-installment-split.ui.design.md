# 상속세·증여세 분납(分納) §70② — UI 설계

> 계획서: [`docs/00-pm/inheritance-gift-installment-split.plan.md`](../../00-pm/inheritance-gift-installment-split.plan.md)
> 엔진 설계: [`inheritance-gift-installment-split.engine.design.md`](./inheritance-gift-installment-split.engine.design.md)

## Context

분납(§70②) 입력 토글 → 결과뷰 분납 일정 카드 → 신고서 별지(상속 별지9호 ㊶ · 증여 별지10호 ㊼) 실값을 구현한다. 결과뷰 출력이 핵심 요구사항. 연부연납(§71)과 **법령상 배타**이므로 상속 UI는 토글 상호 disabled 처리.

---

## 14개 동기화 지점 — ⚠️ 상속·증여 비대칭 (계획서 §3.3·§13 반영)

핵심: **상속은 전부 클라이언트 빌드(투영) → API/Zod 불필요. 증여만** 별지10호(엔진 빌드 `gift-tax.ts:312`) 때문에 input 2필드 동기화 필요.

### 상속 (클라이언트 투영 — ④⑨⑫⑬⑭ 불필요)

| 지점 | 파일 | 내용 |
|---|---|---|
| ① 폼 상태 | `components/calc/inheritance/shared.ts` | `splitPaymentEnabled: boolean`, `splitPaymentAmount: string` |
| ② initial | 〃 INITIAL_FORM | `false`, `""` |
| ③ normalize | 〃 | 빈 문자열 허용 + 배타 가드: `installmentEnabled && splitPaymentEnabled` → `splitPaymentEnabled=false`(연부연납 우선) |
| ⑤ UI 위젯 | `InstallmentInputSection.tsx` | §70 ToggleCard(sky) + CurrencyInput, §71 ToggleCard와 상호 `disabled` |
| ⑥ 사이드바 | `InheritanceSidebar.tsx` | "분납 신청 중" 뱃지(선택). 납부세액 합계 불변 |
| ⑦ 결과 카드 | `SplitPaymentCard.tsx`(신규) + `InheritanceTaxResultView.tsx` 마운트 | 투영 `calcInstallmentSplit(result.finalTax, form)` |
| ⑦ 별지9호 ㊶ | `lib/calc/filing-form-9-data.ts` | `buildFilingForm9Data(...)`에 `splitPaymentAmount?` 인자 → ㊶ `amount` 실값 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | R-1 배타 |

### 증여 (별지10호 input echo — ④⑨⑫⑬⑭ 필요)

| 지점 | 파일 | 내용 |
|---|---|---|
| ① 폼 상태 | `components/calc/gift-tax-form-shared.tsx` | `splitPaymentEnabled`, `splitPaymentAmount` |
| ② initial | 〃 | `false`, `""` |
| ③ normalize | 〃 | 빈 문자열 허용 (증여는 연부연납 입력 없음 → 배타 가드 무의미하나 유지) |
| ④ API 변환 | `lib/calc/gift-api.ts` | `applyInstallmentSplit`, `requestedSplitAmount` 전달 (⚠️ `cashDeferred` 아님 — 순환 회피) |
| ⑤ UI 위젯 | `gift-tax-form-shared.tsx` Step3 끝 | §70 ToggleCard(sky) + CurrencyInput (배타 대상 없음) |
| ⑥ 사이드바 | 증여 사이드바 | 뱃지(선택) |
| ⑦ 결과 카드 | `SplitPaymentCard.tsx` + `GiftTaxResultView.tsx` 마운트 | 투영 (finalTax+form). `giftDate` prop **기존 재사용**(`:138`) |
| ⑦ 별지10호 ㊼ | 엔진 echo | `gift-tax.ts:309` `cashDeferred: calcInstallmentSplit(...).splitAmount` → `besshi10:110` 자동 |
| ⑧ validation | 증여 validate | 임계/한도는 결과뷰 경고 (finalTax 미계산) |
| ⑨ Zod | `app/api/calc/gift/route.ts` | 스키마에 `applyInstallmentSplit`+`requestedSplitAmount` |
| ⑫⑬⑭ | 〃 | Zod 객체·body spread·엔진 input 매핑 |

### 공유 (상속·증여 동일)

- `SplitPaymentCard.tsx` — 단일 컴포넌트 양 세목 재사용 (props로 세목별 분납기한 주입).
- `isInstallmentSplitEligible(finalTax)` — `availablePrintIds` + 카드 렌더 분기 공용(dual-truth 방지).

---

## 입력 위젯 설계 (⑤)

### 상속 — `InstallmentInputSection.tsx` (§71과 같은 섹션)

```
┌─ 분납 신청 (상증법 §70②)              [ToggleCard tone=sky]
│   checked={form.splitPaymentEnabled}
│   disabled={form.installmentEnabled}
│   disabledReason="연부연납(§71) 신청 중에는 분납을 신청할 수 없습니다"
│   ON 펼침:
│     FieldCard "분납 희망액" (hint: §70② 한도 — 미입력 시 최대 분납액 적용)
│       <CurrencyInput value={form.splitPaymentAmount} ... />
│
└─ 연부연납 신청 (상증법 §71)            [ToggleCard tone=amber, 기존]
    disabled={form.splitPaymentEnabled}
    disabledReason="분납(§70②) 신청 중에는 연부연납을 신청할 수 없습니다"
```

> ToggleCard `disabled`/`disabledReason` prop 실존 확인됨(`ToggleCard.tsx:144·153`). 상호 disabled로 배타 강제. tone: sky(분납) — §71 amber와 시각 구분.

### 증여 — `gift-tax-form-shared.tsx` Step3 끝

연부연납 입력 없음 → 배타 disabled 없이 §70 ToggleCard(sky) + 희망액 CurrencyInput만.

> 공통: ToggleCard 필수(native 금지), OFF도 tone 유지, `onFocus={(e)=>e.target.select()}`, "원" 미표기, hint로 형식 설명(placeholder 숫자 예시 금지).

---

## 결과 카드 설계 (⑦) — `SplitPaymentCard.tsx` (신규, 핵심)

```ts
interface SplitPaymentCardProps {
  finalTax: number;                    // = result.finalTax (payableTax)
  filingDeadline?: string;             // 신고기한 YYYY-MM-DD
  installmentDueDate?: string;         // 분납기한 (신고기한+2개월)
  splitPaymentEnabled: boolean;
  splitPaymentAmount?: number;         // form 희망액 (미입력 undefined)
  applyLongTermInstallment?: boolean;  // 상속 연부연납 ON → 비표시
}
```

내부: `const split = calcInstallmentSplit({ payableTax: finalTax, applyInstallmentSplit: splitPaymentEnabled, requestedSplitAmount: splitPaymentAmount, applyLongTermInstallment })`. 렌더 분기:
- `!isInstallmentSplitEligible(finalTax)`(≤1천만) 또는 `applyLongTermInstallment` → `return null`
- `split.eligible && !split.applied` → **분납 안내 카드** (최대 분납 가능액 + 분납기한 + "입력 단계에서 분납을 켜세요")
- `split.applied` → **분납 일정 카드**

### Mockup — 분납 일정 카드 (applied)

```
┌────────────────────────────────────────────────────┐
│ 분납 일정 (상증법 §70②)                    [sky]    │
│ 신고기한 내 납부 + 2개월 이내 분납                    │
├────────────────────────────────────────────────────┤
│ 납부할 세액 (결정세액)            130,000,000        │
│ 1차 납부 (신고기한 이내)           65,000,000        │
│   = 납부할 세액 − 분납액      기한 2025-09-30        │
│ 2차 분납 (분납기한 이내)           65,000,000        │
│   = 분납 신청액               기한 2025-11-30        │
├────────────────────────────────────────────────────┤
│ ※ 분납 시 납세담보 제공 불필요. 금액은 §70② 한도     │
│   이내에서 납세자가 선택합니다.                       │
└────────────────────────────────────────────────────┘
```

### Mockup — 분납 안내 카드 (eligible & !applied)

```
┌────────────────────────────────────────────────────┐
│ 분납 안내 (상증법 §70②)                    [sky]    │
│ 결정세액 1천만원 초과 — 분납 신청 가능                │
├────────────────────────────────────────────────────┤
│ 최대 분납 가능액               65,000,000 (50%)      │
│ 분납기한                       2025-11-30            │
│ 입력 단계에서 분납을 켜면 납부 일정이 표시됩니다.     │
└────────────────────────────────────────────────────┘
```

- 산식 한국어 풀어쓰기(약어·`floor()` 금지), "원" 미표기, 금액 칸 `font-mono tabular-nums text-right` (skill `amount-column-align`).
- `PrintSection id="split-payment"` — `PrintSectionId`(상속)·`GiftPrintSectionId`(증여) 타입 + 레지스트리 등록.
- `availablePrintIds`: `isInstallmentSplitEligible(result.finalTax)`일 때 `"split-payment"` 추가 (상속 `:229` `installment-guide` 패턴 / 증여 `:233`).
- 분납기한: 상속 = `buildFilingForm9Data().installmentDueDate`(`:210`, `deriveDueDates`는 module-private). 증여 = `deriveGiftDueDate(giftDate)` 신규(증여일+3개월+2개월).

### testid (검토 #11 — E2E 셀렉터 약속)

| 요소 | testid |
|---|---|
| 카드 루트 | `split-payment-card` |
| 1차 납부액 | `split-payment-first` |
| 2차 분납액 | `split-payment-second` |
| 분납기한 | `split-payment-due-date` |
| 최대 분납액(안내 카드) | `split-payment-max` |
| 증여 별지10호 ㊼ | `besshi10-row-44`(기존 ㊼ 행 testid 컨벤션 따름) |

### 마운트 — 연부연납과 배타 (검토 #12)

- **상속** `InheritanceTaxResultView`: 분납·연부연납은 §70② 단서로 배타이므로 동시 표시 불가 →
  `form.splitPaymentEnabled` → `<SplitPaymentCard applyLongTermInstallment={form.installmentEnabled} … />`(연부연납 ON이면 카드 내부 `return null`),
  `form.installmentEnabled` → 기존 `<InstallmentScheduleCard … />`. (둘 다 OFF면 분납 안내 카드만 적격 시 표시.)
- **증여** `GiftTaxResultView`: 연부연납 입력 자체가 없으므로 `applyLongTermInstallment` prop **생략**(undefined) — 항상 분납 분기만 평가 (검토 #14).

### 신고서 연동

- 상속 별지9호 ㊶: `amount = splitPaymentAmount`(`display:"dash"`→실값). ㊷ 신고기한 이미 표시.
- 증여 별지10호 ㊼: 엔진 `cashDeferred` echo → `besshi10:110` `cashDef` + `reportPay = finalTax − 0 − cashDef`(=1차) 자동.

---

## Validation (⑧)

- **R-1 배타** (상속): `splitPaymentEnabled && installmentEnabled` → "연부연납(§71)과 분납(§70②)은 동시 신청 불가". (UI에서 상호 disabled로 1차 차단, validate는 레거시 복원 방어.)
- **R-2/R-3** (임계 미달·한도 초과): `finalTax`가 validate 시점 미계산 → **결과뷰 경고**(`split.warnings`). UI 통과↔validate 차단 모순 회피 (메모리 `feedback_validation_sync_8th_point`).
- 빈 희망액 자동 채움 금지 — `splitPaymentAmount` 빈 문자열 그대로 보존.

---

## 사이드바 (⑥)

분납은 세액 불변 → 합계 변경 없음. "분납 신청 중" informational 뱃지만 선택(Do에서 결정).

---

## E2E 시나리오 (`e2e/inheritance-gift-installment-split.spec.ts`, `E2E_PORT=3100`)

1. **상속 분납 일정**: 결정세액>2천만 시나리오 → 분납 토글 ON + 희망액 입력 → 결과 1차/2차·분납기한 표시.
2. **상속 배타**: 연부연납 ON → 분납 토글 disabled 확인 (역방향도).
3. **상속 미신청**: 분납 OFF + 결정세액>1천만 → "분납 안내 카드" 표시.
4. **증여 별지10호**: 분납 ON → 별지10호 ㊼ 분납액·신고납부 실값 확인.
5. **불가**: 결정세액≤1천만 → 카드 비표시.

---

## 7대 사용자 동기화 지점 점검

- ① 폼 → ② initial → ③ normalize → ⑤ 위젯 → ⑥ 사이드바 → ⑦ 결과/별지 → ⑧ validation: 상속 전부 / 증여 +④⑨⑫⑬⑭.
- factory=normalize=UI default 3중 일치(`false`/`""`).
- 카드(투영)·별지(증여 엔진)·`availablePrintIds`가 모두 `calcInstallmentSplit`/`isInstallmentSplitEligible` 단일 함수 사용 — dual-truth 0.
