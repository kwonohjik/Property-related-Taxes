# 상속세 §21① 단서 무신고 일괄공제 5억 고정 — 엔진 설계

> 계획: `docs/00-pm/inheritance-numeric-gaps.plan.md` §1
> 작성: 2026-06-07 · 현황 인용은 동일자 실측 (`lib/tax-engine/deductions/inheritance-deductions.ts`)

## Context

상증법 §21①은 일괄공제를 `max(기초§18 + 인적§20①, 5억)`로 자동 적용한다(현행 구현). 그러나 **단서**("§67 또는 국기법 §45의3에 따른 신고가 없는 경우에는 5억원을 공제")가 미구현이다. 완전 무신고 시 기초+인적 합계가 5억을 초과해도 5억으로 **고정**되어야 하는데, 현행은 본문 max만 적용해 무신고 시에도 큰 금액을 인정한다.

핵심 난점: 기존 `isFiledOnTime`(§69 신고세액공제용, "기한 내 신고")은 **기한후신고(§45의3)와 무신고를 구분하지 못한다**. 단서는 둘을 갈라야 한다(기한후신고=본문 max, 무신고=5억 고정). → 신고 상태 신규 입력 필요.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 무신고 + 기초2억+인적3.5억(=5.5억) | §21① 단서 | 법문 직접(KoreanLaw mst276123) | `section21-unfiled-proviso.test.ts` SEC21P-1 | ⚠️ Pre-Do **실패확보**(미구현 실증) → Do 대기 |
| 2 | 기한후신고(§45의3) + 동일 5.5억 | §21① 본문 (단서 미해당) | 법문 구조 | SEC21P-2 | ✅ Pre-Do 통과(현행 정합) |
| 3 | 정기신고(§67) + 동일 5.5억 | §21① 본문 + §69 | 법문 | SEC21P-3 (통합) | ☐ TODO (Do) |
| 4 | 무신고 + 합계 2.5억(≤5억) | §21① 단서 (금액 무영향) | 자기상쇄 회귀 | SEC21P-4 | ⚠️ Pre-Do **실패확보**(플래그 미구현) → Do 대기 |
| 5 | 무신고 ∩ §21② 배우자단독 | §21② 우선 (단서·일괄 모두 배제) | 법문 구조 (심판례 0건) | SEC21P-5 | ✅ Pre-Do 통과(★§21② 선평가 현행 정합 실증) |

> 행 5는 KoreanLaw 심판례·해석례 미발견(2026-06-07) → 법문 구조 해석. nts 예규 추가 탐색 후 확정.
>
> **★ Pre-Do 실행 결과 (2026-06-07)**: SEC21P-1·4 실패(무신고 단서 미구현 실증), SEC21P-2·5 통과. SEC21P-5 통과는 **§21② > §21①단서 우선순위가 현행 `isSpouseSoleHeir` 선평가 구조로 이미 정합**함을 실증 → 본 설계 알고리즘(삼항: isSpouseSoleHeir ? itemized : isUnfiled ? lump_sum : 본문)이 검증됨. Do는 559~563 삼항에 `isUnfiled` 분기 1개 삽입 + `forcedByUnfiled` echo로 SEC21P-1·4 GREEN화. (타입 stub `isUnfiled?`·`lumpSumForcedByUnfiled?`는 Pre-Do에서 선추가, tsc 0·기존 18 회귀 0)

---

## 법령 근거

```
상증법 §21(일괄공제) — mst 276123, 시행 20260102
① …제18조와 제20조제1항에 따른 공제액을 합친 금액과 5억원 중 큰 금액으로 공제받을 수 있다.
   다만, 제67조 또는 「국세기본법」 제45조의3에 따른 신고가 없는 경우에는 5억원을 공제한다.
② 제1항을 적용할 때 피상속인의 배우자가 단독으로 상속받는 경우에는
   제18조와 제20조제1항에 따른 공제액을 합친 금액으로만 공제한다.
```

- §67 = 상속세 정기신고 / 국기법 §45의3 = 기한후신고.
- 단서 = **둘 다 없는 완전 무신고** → 5억 고정.
- legal-codes: `INH.LUMP_SUM` 기존 존재(`inheritance-deductions.ts:697` 사용). 단서 라벨 상수는 필요 시만 추가.

---

## 엔진 input 타입

`InheritanceDeductionInput` (`lib/tax-engine/types/inheritance-gift.types.ts:859~`)에 신규 필드(옵션 Design 확정):

```ts
// 옵션 B (권장 후보 — 최소 변경)
isUnfiled?: boolean;   // §21① 단서: 정기·기한후신고 모두 없는 완전 무신고

// 또는 옵션 A (3-state — 단일 진실)
filingStatus?: "on_time" | "late" | "none";
// → isUnfiled = filingStatus === "none" (deductionInput 내 자체 분기)
// → isFiledOnTime = filingStatus === "on_time"
```

> ★ 옵션 A 동기화 주의: `filingStatus`는 `deductionInput`에 속하나 `isFiledOnTime`은 **별개 객체 `creditInput`**(`InheritanceTaxInput.creditInput`, `inheritance-tax.ts:721`). 옵션 A 채택 시 **API 변환 단계(`InheritanceTaxForm` buildInput)에서 `creditInput.isFiledOnTime = filingStatus === "on_time"`로 derive**해 단일 진실 유지해야 함(두 객체 cross 동기화 = 복잡도↑). → **옵션 B(`isUnfiled`만 deductionInput 추가, `isFiledOnTime` creditInput 유지) 권장**: §69 회귀 0 + cross-객체 동기화 불요. 폼 UX만 라디오로 표현(ui.design).

## 엔진 result 타입

`InheritanceDeductionResult` (`:994~1001`):

```ts
lumpSumExcludedBySpouseSoleHeir?: boolean;  // 기존 :996
lumpSumForcedByUnfiled?: boolean;           // 신규 — §21① 단서로 5억 강제 여부
```

`LumpSumComparisonDetail` (정의 `lib/tax-engine/types/inheritance-deduction-detail.types.ts:20`, 조립 `inheritance-deductions.ts:568~576`):

```ts
forcedByUnfiled: boolean;  // 신규 — 결과뷰 단서 Row 표시 트리거
```

---

## 계산 알고리즘 (단계별)

`calcInheritanceDeductions` 559~576 확장. **우선순위: §21②(배우자단독) > §21①단서(무신고) > 본문 max**:

```ts
const isUnfiled = input.isUnfiled === true;   // 또는 filingStatus === "none"

const chosenMethod: "lump_sum" | "itemized" = isSpouseSoleHeir
  ? "itemized"                                  // ① §21② 최우선 — 일괄공제 자체 배제
  : isUnfiled
    ? "lump_sum"                                // ② §21① 단서 — 무신고 5억 고정
    : LUMP_SUM_DEDUCTION >= itemizedTotal
      ? "lump_sum"                              // ③ 본문 max
      : "itemized";

const lumpSumForcedByUnfiled = !isSpouseSoleHeir && isUnfiled;
const chosenBasicPersonal =
  chosenMethod === "lump_sum" ? LUMP_SUM_DEDUCTION : itemizedTotal;  // 기존 564~565
```

- 단서 발동 시 breakdown 라벨(697줄) "(§21① 단서 무신고)" 표기 분기.
- `lumpSumComparisonDetail.forcedByUnfiled = lumpSumForcedByUnfiled` 조립(568~576).
- result echo `lumpSumForcedByUnfiled`(737줄 lumpSumDeduction 인근에서 반환).

### 우선순위 근거
§21② "제1항을 적용할 때 …합친 금액으로만 공제한다"는 §21①(본문+단서) **전체의 특칙** → 배우자단독이면 일괄공제(단서 5억 포함) 배제, 기초+인적만. 현행 코드(isSpouseSoleHeir→itemized 선평가)와 정합. **단 심판례·해석례 미발견 → 법문 구조 잠정, Design에서 nts 예규 재탐색.**

---

## Silent fallback / 자동 안분 후보 식별

- `isUnfiled`/`filingStatus` 미입력 시 기본값 = **"정기신고 간주"**(isUnfiled=false). 무신고는 사용자가 명시 선택해야 하는 불리 조건이므로 자동 무신고 금지 — 미선택=신고로 처리(본문 max). [[feedback_no_silent_apportion_fallback]] 위반 아님(보수적 기본값).
- 옵션 B: `isFiledOnTime===true && isUnfiled===true` 모순 입력 → validation 차단.

---

## 테스트 약속

- SEC21P-1~5 (케이스 인벤토리). Pre-Do로 SEC21P-1·2 우선 작성 → **실패 확보** 후 구현.
- 회귀: 기존 일괄공제 anchor(CI-LS·CI-SS) 전수 — isUnfiled 미입력 시 불변.
- 전체 `npm test` 회귀 0.
