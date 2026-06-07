# 상속세 사전증여 후속 3건 — 구현 계획서

> 작성일: 2026-06-07
> 선행 작업: §53의2 §24③·§19 분자 자동 차감 (PR #36, master `32262cd`)
> 대상: §53의2 본 작업에서 기록된 3개 후속 항목
> 엔진 설계: `docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md` (Design 단계 생성 예정)
> UI 설계: `docs/02-design/features/inheritance-prior-gift-followup-3items.ui.design.md` (Design 단계 생성 예정)

---

## 0. 개요 — 3개 항목 요약·의존·권장 순서

| # | 항목 | 성격 | 규모 | numeric 영향 | 리스크 | 권장 순서 |
|---|------|------|------|-------------|--------|----------|
| **A** | per-donee 집계 1억 캡 (§53의2③) | 정확도 | 소~중 | 한 수증자 다건 합산 시 과대공제 차단 (정상 실액 입력은 0) | 낮음 | 1순위 |
| **B** | 상속세 모드 `giftTaxBase` 직접 입력 UI | UX·정확도 | 소 | 자동 §53 도출 대신 실제 과세표준 override 가능 | 낮음 | 2순위 |
| **C** | `deriveDoneeRelationFromHeir` perspective 근본 정정 | 정확도·아키텍처 | 중~대 | **미성년 자녀 수증 §53 공제 2천만 vs 현행 5천만 (확인 필요)** + 도메인-aware 게이트 제거 | 중 | 3순위 |

### 의존 관계
- **A → 독립**: 3 위치(아래 §A.1)의 per-gift 캡을 per-donee 캡으로 교체. 단일진실 헬퍼 도입.
- **B → A·C와 약결합**: `giftTaxBase` 명시 시 branch 1로 빠져 §53·§53의2·per-donee 캡·perspective가 **모두 우회**됨. 즉 B 구현 후 A·C 테스트 매트릭스에 "giftTaxBase 명시 → 자동도출 미적용" 회귀 행 추가 필요.
- **C → A 위에 build 권장**: C는 §53 공제 perspective를 수증자 관점으로 정정하면서 §53의2 도메인-aware 게이트(`isInheritancePriorGiftMarriageBirthEligible`)를 제거 가능. A에서 도입한 per-donee 캡 헬퍼를 C가 그대로 재사용 → A 선행이 C를 단순화.

### 권장 PR 분리
- **PR 1 (A)**: per-donee 캡. 엔진 3위치 + 단일진실 헬퍼 + anchor. UI 무변경(검증만 보강).
- **PR 2 (B)**: 상속세 모드 giftTaxBase 입력 위젯. UI 14지점 ⑤⑦⑧ 중심 + 자동/수동 토글.
- **PR 3 (C)**: perspective 근본 정정. 엔진 + 신고서 표시 분리 + 미성년 §53 + 게이트 제거. **가장 신중** — Pre-Do anchor로 numeric 버그 우선 실증.

> 사용자가 일부만 선택할 수 있으므로 각 항목을 독립 PDCA로 진행 가능하게 작성. 단 C는 A·B 완료 후 진입을 권장(테스트 매트릭스 누적).

---

## A. per-donee 집계 1억 캡 (§53의2③)

### A.1 현황 (실측)

§53의2 per-gift 캡 `Math.min(g.marriageBirthDeduction, 100_000_000)`이 **3곳**에 분산:

| 위치 | file:line | 맥락 |
|------|-----------|------|
| §24 분자 | `lib/tax-engine/deductions/inheritance-deduction-limit.ts:144-145` | `explicitTotal += Math.min(g.marriageBirthDeduction, 100_000_000)` |
| §19 배우자 분자 | `lib/tax-engine/inheritance-tax.ts:312` | `const mbDed = Math.min(g.marriageBirthDeduction ?? 0, 100_000_000)` |
| 자동 도출 giftTaxBase | `lib/tax-engine/inheritance-prior-gift-taxbase.ts:121` | `const mbDed = Math.min(g.marriageBirthDeduction ?? 0, 100_000_000)` |

검증·UI도 per-gift:
- `lib/calc/prior-gift-marriage-birth-rule.ts:44` `checkMarriageBirthGiftRule` — per-gift 1억 초과만 차단.

### A.2 문제

§53의2③: "①·② **합산하여 1억원**을 한도" — 수증자별 통합 한도. 한 수증자(doneeId)가 혼인증여 7천 + 출산증여 7천 = 두 건을 받으면 각 건 ≤1억이라 per-gift 캡 통과 → **합산 1.4억 공제** → §24·§19 분자 과소 차감 → 상속공제 과대 → 세액 과소(납세자 유리·법령 위반).

> ⚠️ 정상 실액 입력(사용자가 이미 통합 1억 캡 적용한 값 입력) 시 영향 0. **다건 분할 입력 시에만** 발생.

### A.3 법령 근거 (KoreanLaw MCP 검증 — Plan 단계 재확인)

```
§53의2③ 제1항·제2항에 따른 공제는 합하여 1억원을 한도로 한다. (수증자 1명 기준 통합)
```
- mst 276123 §53의2 — Plan 단계 `mcp__claude_ai_KoreanLaw__get_law_text`로 자수 재확인 (추정 금지).

### A.4 구현 방안 — 단일진실 per-donee 캡 (stateful accumulator)

> ⚠️ **실측 정정 (STEP 1)**: 3 위치는 **서로 다른 배열·필터**를 순회한다. 인덱스 기반 헬퍼(`number[]`)는 정합 불가.
> | 위치 | 순회 배열 | 필터 | 순회 방식 |
> |------|----------|------|----------|
> | `computePriorGiftDeductionForLimit` | `preGifts`(입력) | inline `isWithin13Cutoff` | `for...of` (비인덱스) |
> | `inheritance-tax.ts §19` | `cutoffFilteredGifts` | **`g.doneeId === spouseHeir.id`만** | `reduce` |
> | `derivePriorGiftTaxBase` | input `gifts` | giftTaxBase 미명시·관계도출 가능 | `forEach` (인덱스) |
>
> → 인덱스 공유 불가. **doneeId 키 기반 stateful capper**로 통일한다.

신규: `lib/calc/prior-gift-marriage-birth-cap.ts` (single-source, `prior-gift-marriage-birth-rule.ts` 패턴 미러)

```ts
/**
 * §53의2③ 수증자별 합산 1억 캡 — stateful accumulator.
 * 각 호출처가 자기 배열을 순회하며 gift별로 take(g)를 호출하면,
 * 동일 doneeId 누적이 1억 도달 시 이후 take는 0(경계 건은 잔여만) 반환.
 * doneeId 없는 건은 단건 키(__mb_solo_${seq}__) — 합산 대상 아님(per-gift 1억).
 *
 * ⚠️ §19는 spouse doneeId 건만 take하지만, 캡은 doneeId별 독립이므로
 *    다른 호출처와 별개 capper 인스턴스를 써도 spouse 누적은 동일(정합 OK).
 */
export function makeMarriageBirthCapper(): {
  take(gift: { doneeId?: string; marriageBirthDeduction?: number }): number;
};
```

알고리즘 (take):
1. `raw = Math.min(gift.marriageBirthDeduction ?? 0, 100_000_000)` (per-gift 상한 먼저).
2. 키 = `gift.doneeId ?? __mb_solo_${seq++}__`.
3. `remaining = max(0, 100_000_000 − usedByKey)`; `effective = min(raw, remaining)`; `usedByKey += effective`.
4. `return effective`.

3 위치를 capper로 교체 (각 호출처가 자기 배열 순회 시작점에서 `makeMarriageBirthCapper()` 1회 생성):
- `inheritance-deduction-limit.ts`: `explicitTotal += capper.take(g)`
- `inheritance-tax.ts §19`: `const mbDed = capper.take(g)` (spouse 건만 take되지만 캡 독립 → 정합)
- `inheritance-prior-gift-taxbase.ts`: `const mbDed = capper.take(g)`

> 정합 근거: 캡은 doneeId별 독립 누적이므로 호출처마다 별도 인스턴스라도 동일 doneeId의 합산 결과는 같다. 단 **각 호출처 내부에서 동일 gift를 두 번 take하지 않도록** 순회당 1회 take 보장.

검증 헬퍼도 per-donee로 보강: `checkMarriageBirthGiftRule`은 per-gift 유지(즉시 1억 초과 입력 차단)하되, per-donee 합산 초과는 **검증 오류가 아니라 캡으로 자동 처리**(보수적·납세자 안전 방향). 또는 validatePriorGift 레벨에서 doneeId 합산 1억 초과 시 안내.

### A.5 케이스 인벤토리

| # | 시나리오 | 기대 | anchor |
|---|---------|------|--------|
| MBC-01 | 동일 doneeId 2건(혼인 7천+출산 7천) → 합산 캡 1억 | 유효 1억(현행 1.4억) | ☐ Pre-Do RED |
| MBC-02 | 단건 1.5억 오입력 → per-gift 1억 (기존 동작 유지) | 1억 | ☐ |
| MBC-03 | 서로 다른 doneeId 2건 각 1억 → 각각 1억(합산 캡 미적용, 수증자별) | 2억 | ☐ |
| MBC-04 | doneeId 없는 단건(수동 경로) → 인덱스 키 단건 1억 | 1억 | ☐ |
| MBC-05 | 회귀 — 1건 5천(캡 미도달) → 5천 불변 | 5천 | ☐ |
| MBC-06 | §24·§19·자동도출 3경로 동일 캡 적용 일관성 | 3경로 동일 | ☐ |
| MBC-07 | **수동 경로 다건**(doneeId 없음, doneeRelation만) 각 7천 → solo 키라 합산 불가 → 각 per-gift 1억 통과 (v1 한계) | 각 7천 | ☐ |
| MBC-08 | **giftTaxBase 명시(branch 1)** + marriageBirthDeduction 동시 → capper 미호출, giftTaxBase만 사용 (A·B 교차 회귀) | giftTaxBase 그대로 | ☐ |

> **v1 한계 (MBC-07)**: doneeId 없는 수동 경로 다건은 동일 수증자 식별 불가 → 합산 1억 캡 미보장(각 per-gift 1억). doneeId 선택(수증자 select) 경로는 정상 합산. validation/UI에서 "동일 수증자는 수증자 선택으로 입력" 안내 권장.

### A.6 14지점 영향
- 엔진: 3 위치 + 신규 헬퍼. result 타입 무변경(합계 echo 자동).
- UI: 위젯 무변경. 단 §53의2 입력 카드 hint에 "동일 수증자 합산 1억 한도" 문구 보강(⑤).
- validation(⑧): per-donee 합산 안내(선택).

### A.7 리스크
- 낮음. 정상 입력 영향 0, 다건 분할만 보정. 3 위치 인덱스 정합만 Pre-Do 확인.

---

## B. 상속세 모드 `giftTaxBase` 직접 입력 UI

### B.1 현황 (실측)

- `giftTaxBase` 입력 위젯은 **증여세 모드 전용**(`GiftRowEditor.tsx:583` `showGiftPhaseA` 블록 내 "합산과세표준 ⑤").
- 상속세 모드(`showIsHeir`)는 입력란 없음 → `derivePriorGiftTaxBase`(`inheritance-prior-gift-taxbase.ts`)가 §53 관계공제로 **자동 도출**.
- 엔진은 `giftTaxBase !== undefined` 시 branch 1로 그대로 사용(override 이미 지원). UI만 부재.

### B.2 문제

자동 도출은 §53 표준 공제만 반영. 실제로는:
- 동일인 10년 합산·기사용 공제로 과세표준이 표준식과 다른 경우
- 증여세 신고서상 확정 과세표준을 사용자가 알고 있는 경우

이때 상속세 모드 사용자는 정확한 `giftTaxBase`를 넣을 방법이 없음 → 자동 도출값으로 고정.

### B.3 구현 방안 — 자동/직접 입력 토글

`GiftRowEditor.tsx` 상속세 모드(`showIsHeir`)에 RadioCardGroup 또는 ToggleCard:

```
사전증여 과세표준 산정
( • ) 자동 도출 (§53 관계공제 적용)   ← 기본
(   ) 직접 입력 (증여세 신고서 과세표준)
   └ [CurrencyInput] 증여 과세표준 (giftTaxBase)
```

- **자동**: `giftTaxBase = undefined` (현행). §53·§53의2·per-donee 캡 모두 자동.
- **직접 입력**: `giftTaxBase = 입력값`. 엔진 branch 1 → §53/§53의2/캡 우회(이미 반영된 값으로 간주). 이때 §53의2 입력 카드는 **자동 숨김**(이미 `GiftRowEditor.tsx:361` `gift.giftTaxBase != null` 처리됨).

> 정책: "미입력 자동 안분 금지"(memory `feedback_no_silent_apportion_fallback`)와 충돌하지 않음 — 자동 도출은 §53 법정 공제의 결정적 산식이지 빈값 자동채움이 아님. 토글로 명시 선택.

### B.4 케이스 인벤토리

| # | 시나리오 | 기대 | anchor |
|---|---------|------|--------|
| GTB-01 | 직접 입력 모드 + giftTaxBase=3천 → branch 1, §53 미적용 | 3천 그대로 | ☐ |
| GTB-02 | 자동 모드(기본) → derivePriorGiftTaxBase §53 적용 (회귀 불변) | 기존값 | ☐ |
| GTB-03 | 직접 입력 모드에서 §53의2 위젯 숨김 + 자동 모드 복귀 시 marriageBirthDeduction 보존/초기화 정책 | 정의된 동작 | ☐ |
| GTB-04 | 직접 입력 0 → 과세표준 0 (전액 §53 공제 상당) 허용 | 0 | ☐ |

### B.5 14지점 영향
- ①②③ 폼 상태: 신규 모드 플래그 `priorGiftTaxBaseInputMode?: "auto" \| "manual"` (per-gift). normalize는 string/enum이라 Date 아님 → ③ 불요(JSON round-trip 안전, §53의2 작업과 동일).
- ④ API 변환: manual 시 giftTaxBase 전달, auto 시 undefined (기존 strip 유지).
- ⑤ 위젯: 토글 + 조건부 CurrencyInput.
- ⑦ 결과 카드: "직접 입력 과세표준" vs "자동 도출(§53)" 출처 라벨.
- ⑧ validation: manual 모드인데 giftTaxBase 미입력 → 검증 오류(빈값 차단).
- ⑫⑬⑭: `priorGiftTaxBaseInputMode` enum이 엔진 미사용(UI 메타)이면 Zod에 optional 추가만, 엔진 input 매핑 불요. **giftTaxBase 자체는 strip 없음 확정 (STEP 1 실측)**: `inheritance-api.ts:79` `preGiftsWithin10Years: input.preGiftsWithin10Years`(객체 spread) → giftTaxBase가 이미 엔진까지 흐름. ⑫⑬⑭ 무변경.

### B.6 리스크
- 낮음. 엔진 분기 추가 0(branch 1 이미 존재). UI·검증·API 변환만. 모드 플래그가 UI 메타라 침묵 strip 무해.

---

## C. `deriveDoneeRelationFromHeir` perspective 근본 정정

### C.1 현황 (실측)

`lib/calc/prior-gift-donee-derive.ts:65` `deriveDoneeRelationFromHeir(relation)`:
```
child            → "lineal_descendant"        (피상속인 관점: 수증자가 피상속인의 직계비속)
lineal_ascendant → "lineal_ascendant_adult"   (피상속인 관점)
spouse           → "spouse"
sibling/other    → "other_relative"
legatee/corporate→ undefined
```
- 호출처: `inheritance-prior-gift-taxbase.ts:55`(엔진 도출), `GiftRowEditor.tsx:128`(UI 선택).
- `doneeRelation` 소비처:
  - **신고서 표시**: `InheritanceFilingFormTable.tsx:192-193` `RELATION_LABEL[gift.doneeRelation]` ← **피상속인 관점 라벨 필요**.
  - **§53 공제**: `calcRelationDeduction({ donorRelation: g.doneeRelation }, ...)` — `inheritance-tax.ts:306`, `prior-gift-taxbase.ts:84` ← **수증자 관점 필요**.
  - **§53의2 게이트**: `prior-gift-marriage-birth-rule.ts` 도메인-aware 게이트(`lineal_descendant` 허용)로 우회 중.
  - **§13 분류·cutoff**: `isHeir`/`beneficiaryType`로 별도 도출 — doneeRelation 무관.

### C.2 문제 — perspective 혼선

`doneeRelation`이 **피상속인 관점**으로 저장되는데 §53/§53의2는 **수증자 관점**(증여자=피상속인이 수증자에게 무엇인가)이 필요.

| 케이스 | 현재 라벨(피상속인 관점) | §53 적용값(현행) | §53 법정 정답(수증자 관점) | 판정 |
|--------|------------------------|-----------------|---------------------------|------|
| 자녀(성년) 수증 | lineal_descendant | 5천만 | 직계존속 성년 = 5천만 | ✅ 우연 일치 |
| **자녀(미성년) 수증** | lineal_descendant | **5천만** | 직계존속 미성년 = **2천만** | ❌ **과대 3천만 (확인 필요)** |
| 부모(lineal_ascendant) 수증 | lineal_ascendant_adult | 5천만 | 직계비속 = 5천만 | ✅ 우연 일치 |
| 배우자 수증 | spouse | 6억 | 배우자 = 6억 | ✅ |

> ⚠️ **실측 정밀화 (STEP 1)**: `deriveDoneeRelationFromHeir(child)`는 항상 `lineal_descendant`(성년 5천)를 반환(`prior-gift-donee-derive.ts:72` 주석 "미성년 미도출"). 즉 자동 경로는 **미성년 사실을 수집조차 하지 않아 미성년 자녀 수증도 항상 5천 적용** → 증여 당시 미성년이었던 자녀 수증은 §53 과대공제(정답 2천) → giftTaxBase 과소 → 분자 과소 → §24 ceiling 과소 → 세액 과대(납세자 불리). **도달 가능한 실 버그**(미성년 fact만 미수집). Pre-Do DP-02는 "정정 후 2천 확보"를 RED로 검증 (memory `feedback_numeric_impact_verify_before_bug_claim`).
>
> **미성년 소스 (정정 — 신규 입력 불요 우선)**: `Heir.birthDate` + `gift.giftDate` 존재 → `differenceInYears(giftDate, birthDate) < 19`(민법 §4)로 **증여 당시 미성년 자동 도출**. `birthDate` 미입력 시에만 명시 토글 fallback. (§20 미성년자공제·§27 `isMinorOverride`와 동일 birthDate 소스 — 일관성)

### C.3 법령 근거
```
§53 1호 배우자 6억 / 2호 직계존속→수증자 5천만(수증자 미성년 2천만) / 3호 직계비속→수증자 5천만 / 4호 기타친족 1천만
§53의2 직계존속→수증자 혼인·출산 (수증자 관점 — "직계존속으로부터")
```
- 수증자 관점이 §53·§53의2 법문 기준. mst 276123 §53·§53의2 자수 재확인(Plan 단계).

### C.4 구현 방안 — 표시 perspective와 공제 perspective 분리

**핵심**: `doneeRelation`(피상속인 관점, 표시·§13 보존) ↔ §53/§53의2 공제 perspective(수증자 관점)를 **변환 헬퍼로 분리**.

신규: `lib/calc/prior-gift-deduction-perspective.ts`
```ts
/**
 * 피상속인 관점 doneeRelation → 수증자 관점 §53/§53의2 공제 관계.
 * 상속세 사전증여: 증여자=항상 피상속인.
 *   - doneeRelation=lineal_descendant (수증자=피상속인 직계비속, 예: 자녀)
 *     → 수증자 관점: 피상속인은 수증자의 직계존속 → lineal_ascendant_adult/minor (수증자 미성년 여부로 분기)
 *   - doneeRelation=lineal_ascendant_adult (수증자=피상속인 직계존속, 예: 부모)
 *     → 수증자 관점: 피상속인은 수증자의 직계비속 → lineal_descendant
 *   - spouse → spouse / other_relative → other_relative
 * @param isDoneeMinor 수증자(상속인)가 증여 당시 미성년이었는지
 */
export function toGiftDeductionDonorRelation(
  doneeRelation: DonorRelation,
  isDoneeMinor: boolean,
): DonorRelation
```

소비처 정정:
- §53: `calcRelationDeduction({ donorRelation: toGiftDeductionDonorRelation(g.doneeRelation, minor) }, ...)` (2위치).
- §53의2 게이트: `isMarriageBirthEligibleRelation(toGiftDeductionDonorRelation(...))` 로 **gift-deductions의 표준 함수 재사용** → `prior-gift-marriage-birth-rule.ts`의 도메인-aware 게이트 `isInheritancePriorGiftMarriageBirthEligible` **제거 가능**(또는 변환 헬퍼 경유 wrapper로 단순화).
- 표시(`InheritanceFilingFormTable.tsx`): doneeRelation 그대로 사용 — **무변경**(피상속인 관점 유지).

**미성년 여부 소스 (정정 — 도출 우선)**: `Heir.birthDate`(존재 확인) + `gift.giftDate`로 `differenceInYears(giftDate, birthDate) < 19`(민법 §4) 자동 도출. `birthDate` 미입력 시에만 명시 토글 `gift.doneeWasMinorAtGift?: boolean` fallback. §20·§27이 이미 `birthDate`/`isMinorOverride` 동일 소스 사용 → 일관성. (자동 안분 금지 정책 위반 아님 — 미성년 판정은 birthDate의 결정적 산식이지 빈값 자동채움이 아님)

> ⚠️ `derivePriorGiftTaxBase`·`inheritance-tax §19`는 현재 `Heir.relation`만 받음(birthDate 비전달 경로 존재). 미성년 도출하려면 `gift.giftDate`와 매칭 Heir의 `birthDate`를 capper/perspective 헬퍼에 전달해야 함 — Pre-Do에서 데이터 전달 경로 확인.

### C.5 케이스 인벤토리

| # | 시나리오 | 기대 | anchor |
|---|---------|------|--------|
| DP-01 | 자녀(성년) 수증 5천 → §53 5천 (회귀 불변, 우연 일치 유지) | 5천 | ☐ |
| DP-02 | **자녀(미성년) 수증 → §53 2천**(현행 5천). anchor: `Heir.birthDate`=증여 5년 전 출생(또는 토글) + `gift.giftDate`로 증여당시 19세 미만 구성 | 2천 | ☐ **Pre-Do RED** |
| DP-03 | 부모(lineal_ascendant) 수증 → §53 5천 (직계비속, 회귀 불변) | 5천 | ☐ |
| DP-04 | 자녀 혼인증여 → §53의2 적격(변환 후 lineal_ascendant) — 게이트 교체 후에도 동작 | 1억 | ☐ |
| DP-05 | 배우자 수증 혼인증여 → §53의2 비적격(변환 후 spouse) | 0 | ☐ |
| DP-06 | 표시 회귀 — 신고서 RELATION_LABEL[doneeRelation] 자녀=직계비속 라벨 불변 | "직계비속" | ☐ |
| DP-07 | 게이트 제거 후 §53의2 per-donee 캡(A) 정합 | A와 동일 | ☐ |

### C.6 14지점 영향
- 엔진: 변환 헬퍼 신규 + §53/§53의2 2~3위치 정정. `doneeWasMinorAtGift` 신규 시 ⑨~⑭ + ①②④⑤⑧.
- **시그니처 파급 (STEP 3)**: `computePriorGiftDeductionForLimit(preGifts, deathDate)`는 heirs 미수신 → 미성년 birthDate·perspective 변환 불가. **`heirs` 매개변수 추가** 필요(또는 호출 전 perspective+minor를 preGifts에 pre-resolve 주입). 호출처 `inheritance-tax.ts:439` 동반 정정. `derivePriorGiftTaxBase`는 이미 heirs 수신(relById) → birthDate 맵만 확장.
- UI: 자녀 수증 시 "증여 당시 미성년" 토글(⑤) + 결과 §53 라벨(⑦).
- 표시: 무변경(분리 설계의 핵심 — 신고서 깨지지 않음).
- 게이트 제거: `prior-gift-marriage-birth-rule.ts` `isInheritancePriorGiftMarriageBirthEligible` 호출처(GiftRowEditor·Zod·validate) → 변환 헬퍼 + `isMarriageBirthEligibleRelation`으로 교체. grep 전수.

### C.7 리스크
- 중. §53 공제 perspective 변경이 3 소비처 + 게이트 + 미성년 신규 필드까지 파급. **단 numeric은 성년 케이스 전부 불변(우연 일치 유지)** — 미성년 케이스만 변동. 회귀 anchor(DP-01·DP-03·DP-06)로 불변 lock 필수.
- **Pre-Do DP-02 우선 실증**: 미성년 자녀 §53 과대공제가 실제 도달 가능한지(자동/수동 경로) anchor로 RED 확보 후 진입. 미도달이면 "수동 경로 한정 + 자동 경로 미성년 미도출" 현황 재평가 → 신규 미성년 필드 도입 타당성 판단.

---

## 1. 공통 검증 기준 (CLAUDE.md 강제)

- 모든 file:line은 실측 확인 완료(본 계획서 §A.1·§C.1). Plan 단계 KoreanLaw MCP로 §53·§53의2 자수 재확인.
- numeric 영향(C.2 미성년)은 **Pre-Do anchor로 실증 후 단정** — 현재 "확인 필요"로 명시.
- 각 항목 독립 PR. C는 A 위에 build 권장.
- 14지점 전수 + ⑫⑬⑭ grep 자가 점검 + `npx tsc --noEmit` 0 + `npx vitest run __tests__/tax-engine/inheritance/` + E2E.

## 2. 다음 단계

1. **13단계 자가 검토** (`plan-design-self-review-loop`) — 본 계획서 정정×2 + 엔진/UI 설계 생성×검토.
2. **Pre-Do anchor** — A: MBC-01, C: DP-02 우선 RED 확보.
3. **Do** — 항목별 엔진 시니어 → UI 시니어 시퀀셜.
4. **Check** — `ui-engine-sync-checker` + `gap-detector` + E2E.

> 사용자 선택 대기: A·B·C 중 진행 항목 + 순서.
