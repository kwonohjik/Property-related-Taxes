# §27 단서 대습상속 할증 배제 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-section27-substitute-inheritance.plan.md`
> UI 설계: `docs/02-design/features/inheritance-section27-substitute-inheritance.ui.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 5

## Context

상증법 §27 단서: "다만, 「민법」 제1001조에 따른 대습상속의 경우에는 그러하지 아니하다." → 대습상속인(직계비속이나 부모 사망·결격으로 갈음 상속)은 세대생략 할증 **전액 배제**(30%·40% 모두). 현행 `computeGenerationSkipSurcharge`는 단서 미구현. `Heir.isSubstituteInheritance` 1플래그로 per-heir 배제.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 | 기대 | anchor 파일 | 상태 |
|---|---------|------|------|------------|------|
| SI-01 | 손자 gen-skip ON + 대습 아님 | §27 본문 | 30% 할증(회귀) | `section27-substitute.test.ts` | ☐ |
| SI-02 | 손자 gen-skip ON + 대습 ON | §27 단서 | 할증 0(현행 30%) | 〃 | ☐ **Pre-Do RED** |
| SI-03 | 미성년 손자 21억 + 대습 ON | §27 단서 | 할증 0(40%도 배제) | 〃 | ☐ |
| SI-04 | 복수 수유자 1명만 대습 | §27 per-heir | 대습자 0·나머지 30%(독립) | 〃 | ☐ |
| SI-05 | gen-skip OFF + 대습 ON | (방어) | 할증 없음(no-op, UI 미도달) | 〃 | ☐ |
| SI-06 | 회귀 — 대습 미설정 전체 | (회귀) | 기존 결과 동일 | 〃 | ☐ |
| SI-07 | 전원 대습(total 0) | §27 단서 | detail/breakdown에 "대습 배제" 표시(소실 금지) | 〃 | ☐ |

**규칙**: 행≥1(7행). SI-02 Pre-Do RED.

---

## 법령 근거 (KoreanLaw MCP 검증 완료)

```
상증법 §27 (mst 276123, 시행 2026-01-02) — 본문 30%/40% … 다만, 민법 §1001 대습상속은 그러하지 아니하다.
민법 §1001 (mst 284415) — 상속인 될 직계비속·형제자매가 상속개시 전 사망/결격 → 그 직계비속이 갈음 상속.
```

---

## 엔진 input 타입

```ts
// types/inheritance-gift.types.ts — Heir 에 추가
/**
 * 민법 §1001 대습상속 여부 — §27 단서(세대생략 할증 배제).
 * isGenerationSkipBeneficiary이면서 대습상속(부모 사망·결격으로 갈음)인 경우 true → §27 할증 전액 배제.
 * 자동 판정 불가(부모 사망·결격 사실) → 사용자 명시. v1: §1001·§1003②(배우자 대습) 미구분.
 */
isSubstituteInheritance?: boolean;
```

## 엔진 result 타입

```ts
// InheritanceGenerationSkipHeirRow (types:536) 에 추가
/** §27 단서 대습상속 배제 행 — rate=0·surcharge=0, 결과 카드 전용 표시 분기 */
excludedBySubstitution?: boolean;
```

---

## 계산 알고리즘 (`inheritance-generation-skip.ts` per-heir 경로 :106~)

```
for (const heir of input.heirs) {
  if (!heir.isGenerationSkipBeneficiary) continue;
  if (heir.relation === "corporate") continue;
  const numerator = (estateByHeirForGenSkip?.get(heir.id) ?? 0)
                  + (amountByDoneeForGenSkip?.get(heir.id) ?? 0);
  const isMinor = resolveMinorBeneficiary(heir, input.deathDate);
  // §27 단서 — numerator·isMinor 산출 직후 배치(undefined 참조 방지)
  if (heir.isSubstituteInheritance) {
    rows.push({ heirId: heir.id, heirName: heir.name, numerator, rate: 0, isMinor,
                surcharge: 0, excludedBySubstitution: true });
    perHeirMap[heir.id] = 0;
    continue;
  }
  const rate = isMinor && numerator > MINOR_SURCHARGE_THRESHOLD ? 0.4 : 0.3;
  const surcharge = adjustedDenominator > 0
    ? Math.floor((computedTax * numerator * rate) / adjustedDenominator) : 0;
  rows.push({ heirId, heirName, numerator, rate, isMinor, surcharge });
  perHeirMap[heir.id] = surcharge;
}
```

### 게이트·표시 (전원 대습 소실 방지 — STEP 6 실측 정정)
- **결과 카드 표시 핵심**: `ComputedTaxDetailCard:60` 게이트는 `result.generationSkipDetail` truthy(≠surcharge>0), ⑧ 행(:59)은 항상 렌더. ⇒ **detail 非null(rows.length>0, 배제행 포함)만 보장하면 SI-07도 "⑧ 세대생략 가산액 0" + 배제 행 표시됨.**
- `totalSurcharge = rows.reduce(...)` (배제행 0 포함 → total은 일반행 합).
- `hasExcluded = rows.some(r => r.excludedBySubstitution)`.
- detail 생성: `rows.length > 0` (배제행 포함, 기존 그대로 — 별도 변경 불요).
- breakdown[](CalculationStep) push: `totalSurcharge > 0 || hasExcluded` (부차 — 메인 step 목록 안내. 미변경 시에도 카드는 표시됨).
- breakdown note: 배제행 `${name}: 대습상속(민법§1001) §27 단서 배제`, 일반행 기존 산식.
- `lawApplied`: `totalSurcharge > 0 || hasExcluded`(STEP 6 — appliedLaws §27 단서 노출).

### 레거시 경로
- v1 미지원(per-heir만). 레거시는 손자 1인 가정 — 대습 배제 필요 시 per-heir 입력 권장.

### 불변식
- SI-01·SI-06: 대습 미설정 → 기존 산식·결과 완전 동일(회귀 0).
- 단서 = 본문 전체 배제 — 30%·40% 무관 0(SI-03). numerator·분모 산식 불변(echo).
- 정수 연산 불변(surcharge 0은 floor 무관).

---

## Silent fallback / 자동 안분 후보

- `isSubstituteInheritance` 미설정 → false(할증 적용) = 기존. 자동 안분 아님(대습은 사용자 명시 사실).
- 대습 단독(gen-skip OFF) no-op(SI-05) — UI 미도달, 엔진 방어.

---

## 테스트 약속

- 케이스 7행 anchor. SI-02 Pre-Do RED(현행 30%).
- 회귀: SI-01·SI-06. 게이트: SI-07(전원 대습 표시).
- 전체 `npm test` 회귀 0(세대생략 기존 anchor 불변).

---

## UI 통합 위임

- UI 명세: `inheritance-section27-substitute-inheritance.ui.design.md`.
- 엔진 시니어: `Heir.isSubstituteInheritance` + `excludedBySubstitution` + 배제 분기 + 게이트 + anchor.
- UI 시니어: HeirComposition 토글(⑤) + `GenerationSkipFormulaRows` 배제 행 분기(⑦) + Zod(⑫).
- 엔진 선행 → UI 후행.
