# 설계 — 이월과세 증여자 사망 배제 (§97의2①)

> 계획서: [`docs/00-pm/transfer-carryover-donor-death.plan.md`](../../00-pm/transfer-carryover-donor-death.plan.md)
> 법령 근거·케이스 매트릭스·세액 실측은 계획서 §2~§4. 이 문서는 **어떻게 만들 것인가**만 다룬다.

---

## 1. 입력 모델

### 1.1 신설 필드 2개 — 둘 다 `CarryoverTaxationForm` 최상위

```ts
/** §97의2① — 증여자와의 관계. 배제 요건·라벨·시행시기 게이트가 전부 이 축으로 갈린다. */
donorRelation: "spouse" | "lineal" | "";

/**
 * §97의2① 괄호 — 관계별로 **묻는 사실이 다르다**.
 * · spouse : 「사망으로 혼인관계가 소멸되었는가」  (이혼 소멸은 false — 계획서 A2·A4)
 * · lineal : 「양도 당시 사망했는가」
 */
donorDeceased: boolean;
```

### 1.2 왜 `exclusionDeclared` 안이 아닌가

`exclusionDeclared`의 타입 주석은 「적용배제 — 사용자 선언 (**§97조의2 ② 1호·2호·④항**)」이다(`transfer-carryover.types.ts:57-58`). 사망은 **① 본문의 관계 요건**이라 조문 계층이 다르고, `exclusionReason`도 별도값(`relation_invalid`)을 쓴다.

`exclusionDeclared` 안에 넣으면 기존 배선 4곳을 재사용해 싸게 끝나지만, ①과 ②가 한 객체에 섞이고 주석이 거짓이 된다. 또 `donorRelation`은 **배제 선언이 아니라 사실 정보**라 어차피 밖에 있어야 하는데, 짝인 두 필드가 갈라지면 응집도가 무너진다.

⇒ **둘 다 최상위**. 배선 비용을 조금 더 내고 의미를 지킨다.

### 1.3 왜 관계를 2분류로 새로 만드는가

부담부증여에 이미 `donorRelation`이 있다(`transfer-tax-api-burdened-gift.ts:33-38`): `spouse` / `lineal_ascendant_adult` / `lineal_ascendant_minor` / `lineal_descendant` / `other_relative`. 그러나 그것은 **증여재산공제(상증법 §53) 계산용**이라 성년·미성년·존속·비속을 가른다.

§97의2①이 요구하는 구분은 **「배우자」 대 「직계존비속」 둘뿐**이고, 배제 문언·시행시기 게이트가 정확히 그 축에서 갈린다. 5분류를 끌어오면 매핑 로직(`lineal_* → lineal`)이 생기고, 두 필드가 공존하는 부담부증여×이월과세에서 **서로 모순된 값**을 가질 수 있다.

⇒ 2분류 신설. `other_relative`에 해당하는 값은 두지 않는다 — 그 차단은 계획서 §5.2 O-2(범위 밖).

---

## 2. 엔진 — `lib/tax-engine/transfer-tax-carryover.ts`

### 2.1 배제 판정의 위치

현재 순서는 `Step 2a 가업상속공제 → Step 2b 기간 판정 → Step 2c 사용자 선언 배제`다. 관계 배제를 **2b와 2c 사이**에 넣되, `applicablePeriodYears` **계산은 앞당기고 기간 초과 판정만 뒤로 민다**:

```
Step 2a  가업상속공제 방어           (기존)
Step 2b  applicablePeriodYears 계산   ← 판정 없이 값만
Step 2b′ 관계 요건 배제              ← 신설
Step 2b″ 기간 초과 배제              (기존 2b의 판정부)
Step 2c  사용자 선언 배제            (기존)
```

이 순서여야 하는 이유:

- **관계가 기간보다 근본**이다. §97의2①은 「10년 이내에 … 배우자(제외…) 또는 직계존비속(제외…)으로부터 증여받은」인데, 관계 요건을 못 채우면 애초에 대상 자산이 아니다.
- `applicablePeriodYears`를 먼저 계산해 두면 **dummy 값을 안 만든다**. 기존 `family_business` 분기는 `applicablePeriodYears: 5, // dummy`(`:119`)를 넣고 있는데, 관계 배제에서 같은 짓을 반복하면 결과 카드가 「5년 룰」을 잘못 표시한다.

### 2.2 판정 함수 — 무의존 leaf로 분리

```ts
// lib/tax-engine/carryover-donor-death.ts  (신규, 무의존)

/** 부칙 제20615호 §1 본문 + §8 — 직계존비속 사망 제외는 2025.1.1. 이후 증여받는 자산부터. */
const LINEAL_DEATH_CUTOFF = new Date("2025-01-01");

export function isRelationExcluded(
  relation: "spouse" | "lineal" | undefined,
  donorDeceased: boolean | undefined,
  giftRegistryDate: Date,
): boolean {
  if (!donorDeceased) return false;
  if (relation === "spouse") return true;              // 게이트 없음 — 2016년 이전부터 존재
  if (relation === "lineal") return giftRegistryDate >= LINEAL_DEATH_CUTOFF;
  return false;                                        // 관계 미선택 — ⑧에서 차단됨
}
```

⭐ **인자는 사실만 받는다**(관계·사망·증여일). 「배제해야 하는가」라는 판단을 호출부가 넘기지 않게 한다 — 메모리 `feedback_shared_predicate_argument_parity`. 일반 경로와 GB 경로가 **같은 leaf**를 부르므로 두 경로가 갈릴 수 없다.

### 2.3 배제 시 반환

기존 `expropriationWithin2Years` 분기(`:157-169`)와 **완전히 같은 형태**다:

```ts
if (isRelationExcluded(ct.donorRelation, ct.donorDeceased, ct.giftRegistryDate)) {
  return {
    detail: {
      isEligible: false,
      applicablePeriodYears,                    // 2b에서 계산한 실제값
      exclusionReason: "relation_invalid",
      scenarioA: makeEmptyScenarioA(),
      scenarioB: makeEmptyScenarioB(ct.giftDateValuation),
      adoptedScenario: "B",
      comparisonExclusion: false,
    },
    adoptedInput: buildInputB(rawInput, ct),
  };
}
```

⭐ 계획서 §3.3에서 **시나리오 B 세액이 일반 증여 취득 세액과 원 단위까지 일치**함을 실측했다. `buildInputB`가 이미 정답을 만들고 있으므로 새 계산 경로는 필요 없다.

---

## 3. UI — `CarryoverGiftExclusionSection.tsx`

현재 이 섹션은 §97의2②·④ 배제 토글 3개다. **그 위에** ① 관계 블록을 얹는다 — 조문 순서(① → ② → ④)와 화면 순서를 일치시킨다(`components/calc/CLAUDE.md` 「UI 순서 = 로직 순서」).

```
┌ 증여자 정보 (§97의2 ①)                         ← 신설, tone=violet(관계·자격)
│  ○ 배우자        ○ 직계존비속                   RadioCardGroup layout="inline"
│  [토글] 사망으로 혼인관계가 소멸되었습니다        ← spouse 선택 시
│  [토글] 양도 당시 증여자가 사망했습니다           ← lineal 선택 시
└
┌ 이월과세 적용배제 선언 (§97의2 ②)               ← 기존 3토글 (tone=rose)
```

- **native radio/checkbox 금지** — `RadioCardGroup` · `ToggleCard`(`components/calc/CLAUDE.md`).
- **사망 토글 라벨은 관계에 따라 갈린다.** 계획서 A4(이혼 후 사망)·B3(게이트 반대편)이 라벨 하나로 뭉뚱그리면 틀리는 지점이다. 문언을 그대로 물으면 사용자가 A4에서 자연히 체크하지 않는다.
- **관계 미선택 시 사망 토글은 `disabled` + `disabledReason`** — 라벨이 정해지지 않으므로.
- 직계존비속 + 증여일 < 2025.1.1.이면 토글 옆에 **「2025.1.1. 이후 증여분부터 적용되는 규정입니다」 hint**. 체크해도 배제되지 않으므로 침묵하면 사용자가 혼란스럽다.

---

## 4. GB(일반건물) 경로

관계·사망은 **증여 사건 정보**다. 하나의 증여에 토지·건물 파트가 딸리므로 **토지 블록 하나가 정본**이고 건물은 그것을 따른다 — PR #1168이 `giftRegistryDate`·`giftTaxCalculated`를 그렇게 처리한 것과 같은 원칙.

`lib/calc/transfer-tax-api-gb-carryover.ts`는 **진입점이 둘**(환산 `:70` / 실가 `:145`)이다. ⚠️ **한쪽만 배선하면 모드에 따라 켜졌다 꺼졌다 한다** — PR #1168에서 실제로 밟은 함정이다.

배제가 성립하면 **토지·건물 두 파트 모두** 시나리오 B로 간다(DD-07).

---

## 5. 결과 표시

`CarryoverComparisonCard.tsx:162`의 기존 문구:

> `relation_invalid: "§97조의2 ① 단서 — 관계 요건 불충족 (사망 등으로 혼인 소멸)"`

**직계존비속에는 부정확하다**(혼인관계가 없다). 관계별로 갈라야 한다:

| 관계 | 문구 |
|---|---|
| 배우자 | 「§97의2 ① — 사망으로 혼인관계가 소멸되어 이월과세 대상이 아닙니다」 |
| 직계존비속 | 「§97의2 ① — 양도 당시 증여자가 사망하여 이월과세 대상이 아닙니다」 |

⚠️ 문구가 「단서」라고 부르는 것도 부정확하다 — **괄호**이지 단서가 아니다. 함께 정정한다.

---

## 6. 회귀 위험

| 위험 | 방어 |
|---|---|
| 기본값이 `donorDeceased: true`로 새면 **기존 이월과세가 전부 배제**된다 | ② initial `false` · ③ normalize에서 구형 데이터는 `false` · DD-03 양성 대조군 |
| 관계 필수화(⑧)가 **기존 입력을 차단**한다 | 구형 sessionStorage에 관계가 없다 → ③에서 `""`로 두고, ⑧은 **이월과세를 새로 여는 경우만** 차단. 기존 계산 이력 재현 경로는 막지 않는다 |
| ⑫ Zod 누락으로 침묵 strip | DD-08이 엔진 input 도달까지 단언 |
| GB 진입점 한쪽 누락 | DD-07을 **환산·실가 두 모드 모두** |

---

## 7. 파일 영향 요약

| 파일 | 성격 | 현재 줄수 |
|---|---|---|
| `lib/tax-engine/carryover-donor-death.ts` | **신규** leaf | — |
| `lib/tax-engine/transfer-tax-carryover.ts` | 분기 삽입 + 2b 분해 | 637 |
| `lib/tax-engine/types/transfer-carryover.types.ts` | 필드 2개 | 228 |
| `lib/stores/calc-wizard-asset-carryover.ts` | ①②③ | — |
| `lib/calc/transfer-tax-api-carryover.ts` | ④ | — |
| `lib/calc/transfer-tax-api-gb-carryover.ts` | ④ (진입점 2) | — |
| `lib/calc/transfer-tax-validate-asset.ts` · `-gb.ts` | ⑧ | — |
| `lib/api/transfer-tax-building-schemas.ts` | ⑫ (2곳) | — |
| `components/calc/transfer/CarryoverGiftExclusionSection.tsx` | ⑤ | 50 |
| `components/calc/results/transfer/CarryoverComparisonCard.tsx` | ⑦ | — |
| `__tests__/.../carryover-relation-invalid.test.ts` | **재작성** | 80 |

800줄 정책 저촉 파일 없음 — `transfer-tax-carryover.ts`가 637줄로 가장 크고, 이번 증분은 ~20줄이다.
