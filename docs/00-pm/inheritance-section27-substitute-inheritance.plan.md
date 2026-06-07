# 상속세 §27 단서 대습상속 할증 배제 — 작업 계획서

> 작성일: 2026-06-07
> 선행: 세대생략 §27 자동 도출 (`project_inheritance_generation_skip_auto_derive`, `004ddb0`)
> 엔진 설계: `docs/02-design/features/inheritance-section27-substitute-inheritance.engine.design.md` (Design 단계 생성 예정)
> UI 설계: `docs/02-design/features/inheritance-section27-substitute-inheritance.ui.design.md` (Design 단계 생성 예정)

---

## 0. 개요

상증법 §27(세대생략 할증) **단서**: "다만, 「민법」 제1001조에 따른 대습상속(代襲相續)의 경우에는 그러하지 아니하다." → **대습상속인은 직계비속이어도 §27 할증 전액 배제**(미성년 40% 포함). 현행 엔진은 단서 미구현 — `isGenerationSkipBeneficiary` 손자녀에 무조건 30%/40% 할증. 대습상속(손자가 사망한 부모를 갈음하여 상속)인 경우 과세 과대.

---

## 1. 법령 근거 (KoreanLaw MCP mst 276123 · 284415 검증 완료)

```
상증법 §27 (시행 2026-01-02):
  상속인이나 수유자가 피상속인의 자녀를 제외한 직계비속인 경우 … 30%(미성년+20억 초과 40%) 가산.
  ★ 다만, 「민법」 제1001조에 따른 대습상속(代襲相續)의 경우에는 그러하지 아니하다.

민법 §1001 (대습상속):
  상속인이 될 직계비속 또는 형제자매가 상속개시 전에 사망하거나 §1004·§1004의2로 상속인이
  되지 못한 때 → 그 직계비속이 갈음하여 상속인이 된다.
  (배우자 대습은 §1003② — 본 단서 범위는 §1001 인용이나 실무상 §1003② 배우자 대습 포함 통설)
```

**핵심**: 대습상속 = 손자녀가 본래 상속인(부모)의 사망·결격으로 그 순위를 갈음 → 세대생략이 아니라 정상 승계 → 할증 배제.

---

## 2. 현황 (실측)

- 엔진: `lib/tax-engine/inheritance-generation-skip.ts` `computeGenerationSkipSurcharge`.
  - per-heir 경로(:106~127): `isGenerationSkipBeneficiary` heir마다 `rate = 미성년&&20억초과 ? 0.4 : 0.3`, `surcharge = floor(computedTax × numerator × rate / adjustedDenominator)`. **대습 배제 분기 없음.**
  - 레거시 경로(:152~): 전역 `input.isGenerationSkip`. 대습 배제 없음.
- Heir 타입: `lib/tax-engine/types/inheritance-gift.types.ts` — `isGenerationSkipBeneficiary?`(:648)·`isMinorOverride?`(:655). **대습 필드 부재.**
- UI: `components/calc/HeirComposition.tsx:262~` — `isLegatee` 전용 §27 토글(rose) + 미성년 3-state. **대습 토글 부재.**
- Zod: `lib/validators/property-valuation-input.ts:400` `heirSchema` — `isGenerationSkipBeneficiary`(:424)·`isMinorOverride`(:426). **대습 부재.**

---

## 3. ★ 케이스 인벤토리 (필수 — 행≥1)

| # | 시나리오 | 법령 | 기대 | anchor | 상태 |
|---|---------|------|------|--------|------|
| SI-01 | 손자 유증 + gen-skip ON + **대습 아님** | §27 본문 | 30% 할증 (회귀 불변) | `section27-substitute.test.ts` | ☐ |
| SI-02 | 손자 유증 + gen-skip ON + **대습 ON** | §27 단서 | 할증 **0** (현행 30%) | 〃 | ☐ **Pre-Do RED** |
| SI-03 | 미성년 손자 21억 + 대습 ON | §27 단서 | 할증 **0** (단서가 40%도 배제) | 〃 | ☐ |
| SI-04 | 복수 수유자 — 1명만 대습 | §27 per-heir | 대습자 0, 나머지 30% (독립) | 〃 | ☐ |
| SI-05 | gen-skip OFF + 대습 ON | (무의미) | 할증 없음(no-op) — **UI 미도달**(토글 gen-skip ON일 때만), 엔진 방어 anchor | 〃 | ☐ |
| SI-07 | **전원 대습** (gen-skip ON 수유자 전부 대습) | §27 단서 | total 0이어도 결과 카드에 "대습 배제" 표시(소실 금지) | 〃 | ☐ |
| SI-06 | 회귀 — 대습 미설정 전체 | (회귀) | 기존 결과 완전 동일 | 〃 | ☐ |

**규칙**: 행≥1 충족(6행). SI-02 Pre-Do RED (현행 단서 미구현 → 30% 산출).

---

## 4. 엔진 input 타입

```ts
// types/inheritance-gift.types.ts — Heir 에 추가
/**
 * 민법 §1001 대습상속 여부 — §27 단서(세대생략 할증 배제).
 * isGenerationSkipBeneficiary(직계비속 세대생략)이면서 대습상속(부모 사망·결격으로 갈음 상속)인 경우 true.
 * true 시 §27 할증 전액 배제(30%·40% 모두). 대습 사실은 시스템 자동 판정 불가 → 사용자 명시.
 * v1: 직계비속 대습(§1001)·배우자 대습(§1003②) 미구분 — generic 1플래그가 양자 포괄.
 */
isSubstituteInheritance?: boolean;
```

## 엔진 result 타입

`InheritanceGenerationSkipHeirRow`(types:536)에 **`excludedBySubstitution?: boolean`** 추가(명시적). 배제 행은 `rate=0`·`surcharge=0`·`excludedBySubstitution=true`.

> ⚠️ **결과 카드 분기 필수 (STEP 1)**: `GenerationSkipFormulaRows.tsx`는 현재 `${(row.rate*100)}%` 태그를 무조건 표시 → 배제 행이 "0%"로 오표시. **`excludedBySubstitution` 분기**: 태그를 "§27 단서 배제(대습상속·민법§1001)"로, 산식 줄(numerator÷denominator) 미표시.
>
> ⚠️ **전원 대습 표시 게이트 (STEP 1→6 실측 정정)**: 결과 카드 게이트는 `ComputedTaxDetailCard:60` `generationSkipDetail` truthy(≠surcharge>0)이고 ⑧ 행(:59)은 항상 렌더 → **detail 非null(rows.length>0, 배제행 포함)만 보장하면 전원 대습도 표시됨**(detail 생성 :133 기존 그대로). breakdown[](CalculationStep, :138)·`lawApplied`(:150) push만 `totalSurcharge>0 || hasExcluded`로 확장(부차 — step 목록·appliedLaws용).

---

## 5. 계산 알고리즘

### per-heir 경로 (`inheritance-generation-skip.ts:106~127`)
```
for (const heir of input.heirs) {
  if (!heir.isGenerationSkipBeneficiary) continue;
  if (heir.relation === "corporate") continue;

  const numerator = (estateByHeirForGenSkip?.get(heir.id) ?? 0)
                  + (amountByDoneeForGenSkip?.get(heir.id) ?? 0);
  const isMinor = resolveMinorBeneficiary(heir, input.deathDate);

  // ★ §27 단서: 대습상속 → 할증 배제. numerator·isMinor 산출 직후(STEP 3) — 표시용 echo 유지.
  if (heir.isSubstituteInheritance) {
    rows.push({ heirId: heir.id, heirName: heir.name, numerator, rate: 0, isMinor,
                surcharge: 0, excludedBySubstitution: true });
    perHeirMap[heir.id] = 0;
    continue; // 본문 전체 배제(30%·40% 모두)
  }

  const rate = isMinor && numerator > MINOR_SURCHARGE_THRESHOLD ? 0.4 : 0.3;
  const surcharge = adjustedDenominator > 0
    ? Math.floor((computedTax * numerator * rate) / adjustedDenominator) : 0;
  rows.push({ heirId, heirName, numerator, rate, isMinor, surcharge });
  perHeirMap[heir.id] = surcharge;
}
```

### breakdown·detail 게이트 (STEP 3→6 — :138·:133·:150)
- `hasExcluded = rows.some(r => r.excludedBySubstitution)`.
- detail 생성: `rows.length > 0`(기존, 배제행 포함) — **유지(변경 불요)**. 결과 카드는 `generationSkipDetail` truthy로 표시(STEP 6 실측).
- breakdown[] push·`lawApplied`: `totalSurcharge > 0 || hasExcluded` (전원 대습도 안내行·appliedLaws — 부차).
- breakdown note: 배제행은 `${name}: 대습상속(민법§1001) §27 단서 배제`, 일반행은 기존 산식. 배제행은 total 합산 제외.

### 레거시 경로
- 전역 단일 경로는 per-heir 분리 불가 → v1: 레거시 경로 대습 배제 **미지원**(레거시는 손자 1인 가정). 입력 `input.isSubstituteInheritance`(전역) 추가해 전액 배제만 지원하거나 미지원 명시. **권장: per-heir만 지원**(레거시는 deprecated 경로).

### 불변식
- SI-01·SI-06: 대습 미설정 → 기존 산식 그대로(회귀 0).
- 단서는 **본문 전체 배제** — 30%·40% 구분 없이 0. numerator·분모 산식 불변(표시용 echo).
- 정수 연산 불변(floor 미적용 — surcharge 0).

---

## 6. Silent fallback / 자동 안분 후보

- `isSubstituteInheritance` 미설정(undefined) → false(할증 적용) = 기존 동작. 자동 안분 아님 — 대습은 사용자 명시 사실(시스템이 부모 사망·결격 자동 판정 불가).
- 대습 단독(gen-skip OFF)은 no-op — 할증 자체가 없으므로 배제 의미 없음(SI-05). UI에서 gen-skip ON일 때만 토글 노출.

---

## 7. 14지점 동기화

| 지점 | 작업 |
|---|---|
| ① 폼 상태 | HeirComposition heir 상태 — `isSubstituteInheritance` |
| ② initial | 신규 heir 생성 시 undefined |
| ③ normalize | boolean → 불요(Date 아님) |
| ④ API 변환 | `inheritance-api.ts` heirs spread — 자동 흐름(strip 확인) |
| ⑤ UI 위젯 | HeirComposition §27 토글(:262, `isLegatee` 게이트) 하위에 "대습상속(민법§1001) — 할증 배제" ToggleCard(rose). **`isLegatee && isGenerationSkipBeneficiary` 게이트**(v1) |
| ⑥ 사이드바 | 해당 없음 |
| ⑦ 결과 카드 | `InheritanceGenerationSkipDetailCard` — 대습 배제 행 "§27 단서 배제" 표시 |
| ⑧ validation | 최소 — 대습 ON인데 gen-skip OFF면 무해(경고 선택). boolean 검증 불요 |
| ⑨⑩⑫ Zod | `heirSchema`(property-valuation-input.ts:400)에 `isSubstituteInheritance: z.boolean().optional()` — 단일 스키마(메인+컴패니언 공용) |
| ⑪ acqDate | 해당 없음 |
| ⑬⑭ | heirs 매핑 — Date 변환 무관, spread 자동 (grep 확인) |

---

## 8. 리스크

- **낮음**. 대습 미설정 시 기존 동작 완전 보존(회귀 0). 단일 배제 분기 + 1 플래그 + UI 토글.
- 주의: 단서가 미성년 40%도 배제(SI-03) — 본문 전체 배제임을 anchor로 lock.
- **모델 범위 한계 (명시)**: 대습상속인이 정식 상속인(heir, legatee 아님)으로 입력되는 케이스의 §27 본문 적용 자체가 현 UI(gen-skip 토글 = legatee 전용)에서 제한적. 본 작업은 "gen-skip ON heir의 대습 배제"에 집중. 정식 상속인 대습의 §27 본문 확대는 별도 트랙(현 한계).

---

## 9. 다음 단계

1. **13단계 자가 검토** (`plan-design-self-review-loop`) — 계획 정정×2 + 엔진/UI 설계 생성×검토.
2. **Pre-Do anchor** — SI-02 우선 RED 확보 (현행 30% 산출).
3. **Do** — 엔진 시니어(타입·배제 분기·anchor) → UI 시니어(⑤⑦ 토글·결과 행).
4. **Check** — `ui-engine-sync-checker` + `gap-detector` + E2E.

> 후속(별도): 정식 상속인 대습의 §27 본문 적용 확대 · 배우자 대습(민법§1003②) 명시 · 레거시 경로 대습.
