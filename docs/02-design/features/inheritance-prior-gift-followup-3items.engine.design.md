# 상속세 사전증여 후속 3건 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-prior-gift-followup-3items.plan.md`
> UI 설계: `docs/02-design/features/inheritance-prior-gift-followup-3items.ui.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 5

## Context

§53의2 본 작업(PR #36) 후속 3건. A=§53의2③ 수증자별 합산 1억 캡(현행 per-gift), B=상속세 모드 giftTaxBase 직접 입력(현행 자동 도출만), C=`deriveDoneeRelationFromHeir` 피상속인↔수증자 perspective 분리(현행 성년 우연 일치·미성년 자녀 §53 과대공제 5천 vs 정답 2천). A→B→C 독립 PR, C는 A capper 재사용.

---

## ★ 케이스 인벤토리 (필수 — 행≥1)

| # | 항목 | 시나리오 | 법령 | 기대 | anchor 파일 | 상태 |
|---|------|---------|------|------|------------|------|
| MBC-01 | A | 동일 doneeId 혼인7천+출산7천 → 합산 캡 | §53의2③ | 1억(현행 1.4억) | `section53-2-cap.test.ts` | ☐ Pre-Do RED |
| MBC-02 | A | 단건 1.5억 오입력 → per-gift 1억 | §53의2③ | 1억 | 〃 | ☐ |
| MBC-03 | A | 다른 doneeId 2건 각 1억 → 수증자별 독립 | §53의2③ | 2억 | 〃 | ☐ |
| MBC-04 | A | doneeId 없는 단건 → solo 키 1억 | §53의2③ | 1억 | 〃 | ☐ |
| MBC-05 | A | 회귀 1건 5천(캡 미도달) | (회귀) | 5천 | 〃 | ☐ |
| MBC-06 | A | §24·§19·자동도출 3경로 동일 캡 | §53의2③ | 3경로 일치 | 〃 | ☐ |
| MBC-07 | A | 수동 다건(doneeId 없음) 각 7천 → 합산 불가(v1 한계) | §53의2③ | 각 7천 | 〃 | ☐ |
| MBC-08 | A·B | giftTaxBase 명시 + mbDed 동시 → capper 미호출 | §24③ b1 | giftTaxBase | 〃 | ☐ |
| GTB-01 | B | manual 모드 giftTaxBase=3천 → branch 1 §53 미적용 | §24③ b1 | 3천 | `prior-gift-taxbase-manual.test.ts` | ☐ |
| GTB-02 | B | auto 모드(기본) → §53 적용 (회귀) | §53 | 기존값 | 〃 | ☐ |
| GTB-03 | B | manual 모드 → §53의2 위젯 숨김 + auto 복귀 시 mbDed 보존 | (UI) | 정의 동작 | (e2e) | ☐ |
| GTB-04 | B | manual giftTaxBase=0 → 과세표준 0 허용 | §24③ b1 | 0 | 〃 | ☐ |
| DP-01 | C | 자녀(성년) 수증 5천 → §53 5천 (회귀, 우연 일치 유지) | §53 2호 | 5천 | `donee-perspective.test.ts` | ☐ |
| DP-02 | C | **자녀(미성년) 수증 → §53 2천**(birthDate+giftDate 19세 미만) | §53 2호 단서 | 2천(현행 5천) | 〃 | ☐ **Pre-Do RED** |
| DP-03 | C | 부모(lineal_ascendant) 수증 → §53 5천 (직계비속, 회귀) | §53 3호 | 5천 | 〃 | ☐ |
| DP-04 | C | 자녀 혼인증여 → 변환 후 lineal_ascendant → §53의2 적격 | §53의2 | 1억 | 〃 | ☐ |
| DP-05 | C | 배우자 수증 혼인증여 → 변환 후 spouse → §53의2 비적격 | §53의2 | 0 | 〃 | ☐ |
| DP-06 | C | 표시 회귀 — 신고서 RELATION_LABEL[doneeRelation] 자녀=직계비속 | (표시) | "직계비속" | (e2e) | ☐ |
| DP-07 | C | 게이트 제거 후 per-donee 캡(A) 정합 | §53의2③ | A와 동일 | `donee-perspective.test.ts` | ☐ |
| DP-08 | C | birthDate 미입력 + doneeWasMinorAtGift 토글 ON → §53 2천 | §53 2호 단서 | 2천 | 〃 | ☐ |

**규칙**: 행≥1 충족(20행). Pre-Do: MBC-01·DP-02 RED 우선.

---

## 법령 근거 (KoreanLaw MCP mst 276123 — Plan 단계 자수 재확인)

```
§53 1호 배우자 6억
   2호 직계존속→수증자 5천만 (수증자 미성년 2천만)
   3호 직계비속→수증자 5천만
   4호 기타친족 1천만
§53의2① 직계존속→혼인 2년 1억  ② 직계존속→출생·입양 2년 1억  ③ ①+② 합산 1억(수증자별 통합)
§24 3호 가산 증여재산가액 − (§53·§53의2·§54 공제액)  [과세가액 5억 초과 시]
§19 배우자공제 법정상속분 한도 분자도 동일 차감
```
기존 상수: `GIFT_DEDUCTION_LIMIT`(`gift-deductions.ts:34`) — lineal_ascendant_adult 5천 / **lineal_ascendant_minor 2천** / lineal_descendant 5천.

---

## 엔진 input 타입

```ts
// types/inheritance-prior-gift.types.ts — PriorGift (기존 marriageBirthDeduction 보유)
/** [C] 증여 당시 수증자(상속인) 미성년 여부 — birthDate 미입력 시 fallback 토글. */
doneeWasMinorAtGift?: boolean;
```
- B의 `giftTaxBase`는 기존 필드(엔진 branch 1 이미 지원, `inheritance-api.ts:79` spread 흐름).
- **[B] `priorGiftTaxBaseInputMode?: "auto" | "manual"`는 엔진 input 아님 → UI 폼 상태로 분류 (STEP 6)**. 엔진은 giftTaxBase 유무로만 branch. manual인데 giftTaxBase 미입력 = validation(⑧) 차단. (UI 설계 ① 폼 상태 참조)

## 엔진 result 타입

변경 없음(합계 echo 자동). C 미성년 §53은 `DeductionLimitCeilingDetail.priorGiftDeductionTotal`·§19 note에 자동 반영. 결과 카드 출처 라벨(자동/직접·미성년)은 UI ⑦에서 표시.

> **UI ⑦ 위임 (STEP 6)**: C 미성년 정정 시 결과 deduction-breakdown 카드의 §53 관계 라벨("직계존속(미성년 수증자)")·공제 금액(2천)이 변동 → UI 시니어가 표시 갱신. B는 "직접 입력 과세표준" vs "자동 도출(§53)" 출처 라벨.

---

## 계산 알고리즘

### A. per-donee 캡 — `lib/calc/prior-gift-marriage-birth-cap.ts` (신규)
```ts
export function makeMarriageBirthCapper() {
  const used = new Map<string, number>();
  let solo = 0;
  return {
    take(g: { doneeId?: string; marriageBirthDeduction?: number }): number {
      const raw = Math.min(g.marriageBirthDeduction ?? 0, 100_000_000);
      if (raw === 0) return 0;
      const key = g.doneeId ?? `__mb_solo_${solo++}__`;
      const remaining = Math.max(0, 100_000_000 - (used.get(key) ?? 0));
      const eff = Math.min(raw, remaining);
      used.set(key, (used.get(key) ?? 0) + eff);
      return eff;
    },
  };
}
```
3 위치 교체 (각 순회 시작 시 capper 1회 생성, gift당 1회 take, **branch 2 = else-if doneeRelation 내에서만** take — branch 1 giftTaxBase는 미호출, MBC-08 정합):
- `inheritance-deduction-limit.ts:144-145` → `explicitTotal += capper.take(g)`
- `inheritance-tax.ts:312` → `const mbDed = capper.take(g)` (spouse 건만 take, 캡 독립 정합)
- `inheritance-prior-gift-taxbase.ts:121` → `const mbDed = capper.take(g)`

### B. giftTaxBase manual — 엔진 분기 추가 0
- `giftTaxBase !== undefined` → branch 1 (기존). §53·§53의2·capper 전부 우회.
- manual 모드 = giftTaxBase 입력. auto 모드 = giftTaxBase undefined. 엔진은 분기 그대로.

### C. perspective 변환 — `lib/calc/prior-gift-deduction-perspective.ts` (신규)
```ts
/** 피상속인 관점 doneeRelation → 수증자 관점 §53/§53의2 공제 관계. */
export function toGiftDeductionDonorRelation(
  doneeRelation: DonorRelation,
  isDoneeMinorAtGift: boolean,
): DonorRelation {
  switch (doneeRelation) {
    case "lineal_descendant":            // 수증자=피상속인 직계비속(자녀) → 피상속인은 직계존속
      return isDoneeMinorAtGift ? "lineal_ascendant_minor" : "lineal_ascendant_adult";
    case "lineal_ascendant_adult":       // 수증자=피상속인 직계존속(부모) → 피상속인은 직계비속
    case "lineal_ascendant_minor":
      return "lineal_descendant";
    case "spouse":         return "spouse";
    case "other_relative": return "other_relative";
  }
}
```
- §53 소비처(`calcRelationDeduction`) 2위치: `inheritance-tax.ts:306`·`prior-gift-taxbase.ts:84` → `donorRelation: toGiftDeductionDonorRelation(g.doneeRelation, minor)`.
- **권장: pre-resolve 단일 upstream (STEP 6)** — `resolvePriorGiftDeductionContext(gifts, heirs)`가 각 gift에 effective §53 관계(perspective 변환 후)·미성년·capped mbDed를 1회 주입한 파생 배열 반환. 3 위치는 주입값을 read만 → `computePriorGiftDeductionForLimit` 등 개별 시그니처 산발 변경 회피. (대안: 각 시그니처에 heirs 추가 — 비권장. 결정은 Do에서 anchor로 확정)
  - **⚠️ 표시 보존 (STEP 8)**: 주입은 반드시 **별도 파생 필드 `_effectiveDeductionRelation`**(또는 동등)에 write. `doneeRelation`은 **절대 덮지 않음** — 덮으면 `InheritanceFilingFormTable.tsx:193` 표시가 수증자 관점으로 바뀌어 신고서가 깨짐(본 작업이 막으려던 버그).
  - **A↔C 진화 (STEP 8)**: A(PR1)는 `makeMarriageBirthCapper` standalone 출시. C(PR3)에서 `resolvePriorGiftDeductionContext`가 capper를 흡수(perspective+미성년+캡 단일화) → A capper는 내부 재사용으로 전환(중복 제거).
  - **exhaustive (STEP 8)**: `toGiftDeductionDonorRelation` switch는 `DonorRelation` 5값(spouse·lineal_ascendant_adult·lineal_ascendant_minor·lineal_descendant·other_relative, 실측 `types/inheritance-gift.types.ts:1072`) 전부 case → TS exhaustive(default 불요).
- 그래도 `computePriorGiftDeductionForLimit`는 heirs(또는 pre-resolved 배열) 접근 필요. 호출처 `inheritance-tax.ts:439` 동반 정정.
- §53의2 게이트: `isMarriageBirthEligibleRelation(toGiftDeductionDonorRelation(...))` 로 표준 함수 재사용 → `prior-gift-marriage-birth-rule.ts` 도메인-aware 게이트 제거(또는 변환 wrapper로 단순화).
- 미성년 도출: gift.giftDate + 매칭 Heir.birthDate → `differenceInYears < 19`. birthDate 없으면 `doneeWasMinorAtGift`.
- **표시 무변경**: `InheritanceFilingFormTable.tsx:193` doneeRelation 그대로(피상속인 관점 유지).

### ★ Do 단계 발견 — 환류 (2026-06-07 구현)
**`preGifts`는 `inheritance-tax.ts:110`에서 이미 `derivePriorGiftTaxBase(input.preGiftsWithin10Years, input.heirs)`로 사전 도출된다.** 따라서:
- `computePriorGiftDeductionForLimit(preGifts, ...)`(:442)·§19 `spouseGiftTaxBase`(cutoffFilteredGifts = preGifts.filter)는 모두 **giftTaxBase가 채워진 gifts(branch 1)를 소비** → §53/§53의2를 재계산하지 않는다.
- ⇒ **`derivePriorGiftTaxBase`가 §53·§53의2의 단일 진실**. A의 per-donee 캡·C의 perspective·미성년은 derive 한 곳만 정정하면 §24·§19 분자가 giftTaxBase 경유로 자동 정합.
- ⇒ **STEP 3의 "`computePriorGiftDeductionForLimit` heirs 추가"는 실제 flow에서 불요**(branch 1 소비). 해당 함수·§19의 branch 2 capper/perspective는 **raw-path 안전망**(unit anchor·미도출 edge)으로만 잔류. STEP 6의 pre-resolve도 derive가 이미 그 역할 → 별도 도입 불요.
- 구현: derive에 `birthDateById` + `resolveDeductionRel`(perspective+미성년 변환) + `mbCapper` 추가. computePriorGiftDeductionForLimit·§19는 capper만 추가(안전망), perspective는 derive에서 이미 적용되어 미적용(adult 우연 일치 유지).
- **Check 환류 (gap-detector)**: 당초 "C perspective 3 소비처 정정" 문구와 실제(derive 1곳)에 drift 존재. 정정: §24(`computePriorGiftDeductionForLimit`)·§19 branch 2는 raw-path 안전망 — 실 flow에선 derive가 giftTaxBase를 채워 branch 1로 소비되므로 **perspective 미적용이 무해**(adult 우연 일치 + 도달 불가). raw-path에 perspective 미적용은 의도된 v1 결정(미성년 정보 부재 — heirs 미전달).

### 불변식
- A: 정상 실액(≤1억 단건) 영향 0. 다건 합산만 보정.
- B: branch 1 기존 동작 동일(엔진 0 변경).
- C: 성년 전부 numeric 불변(우연 일치 유지 — DP-01·DP-03). 미성년만 변동(DP-02).
- 정수 연산(min/max), floor 불요.

---

## Silent fallback / 자동 안분 후보

- A `marriageBirthDeduction` 미입력 → 0(기존 §53만). 자동 안분 아님.
- B auto 모드 §53 도출 = 결정적 산식(빈값 채움 아님). manual 미입력은 validation 차단.
- C 미성년 도출 = birthDate 결정적 산식. birthDate·토글 모두 없으면 성년(보수적, 과대공제 방지 방향과 반대 — 단 현행과 동일하므로 회귀 0).
- **v1 한계**: A 수동 경로 doneeId 부재 다건 합산 불가(MBC-07). C `computePriorGiftDeductionForLimit` heirs 미전달 시 perspective/미성년 미적용(시그니처 정정 전).

---

## 테스트 약속

- 케이스 20행 anchor. MBC-01·DP-02 Pre-Do RED 우선.
- 회귀: MBC-05·MBC-08·GTB-02·DP-01·DP-03·DP-06.
- 전체 `npm test` 회귀 0(사전증여·배우자공제·신고서 표시 기존 anchor 불변).

---

## UI 통합 위임

- UI 명세: `inheritance-prior-gift-followup-3items.ui.design.md`.
- 엔진 시니어: capper·perspective 헬퍼 + 3위치 교체 + 시그니처 정정 + anchor.
- UI 시니어: B giftTaxBase 토글·위젯, C 미성년 토글·결과 라벨, A hint 보강·validation.
- 엔진 선행 → UI 후행.
