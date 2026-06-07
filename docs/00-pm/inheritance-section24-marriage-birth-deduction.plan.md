# 상속세 §24③·§19 분자 §53의2(혼인·출산 증여재산공제) 자동 차감 계획서

> 작성일: 2026-06-07
> 세목: 상속세(inheritance)
> 근거: 상증법 §24·§53의2·§19 (KoreanLaw MCP mst 276123 검증), §53(`gift-deductions.ts`)
> 작성: inheritance-gift-deduction-senior · inheritance-gift-tax-ui-senior 병렬 Plan 통합
> 후속 출처: §23 재해손실공제 작업 부수 발견 (`inheritance-casualty-loss-deduction.plan.md` §2.3)

---

## 1. 배경 — 검증된 법령 사실 (KoreanLaw MCP, 추정 금지)

**상증법 §24 (공제 적용 한도)** — 3호: 상속세 과세가액에 가산한 증여재산가액에서 "**§53·§53의2 또는 §54**에 따라 공제받은 금액"을 뺀 가액을 차감. 단서: 과세가액 5억 초과 시에만 적용.

**상증법 §53의2 (혼인·출산 증여재산 공제)**:
- ① 거주자가 **직계존속으로부터** 혼인일 전후 2년 이내 증여 → §53과 별개로 **1억원** 공제
- ② 직계존속으로부터 출생·입양일부터 2년 이내 증여 → §53·§53의2① 과 별개로 **1억원** 공제
- ③ **①+② 합산 1억원 한도** (수증자별 통합, 초과분 불공제)
- §53 관계별 공제(직계존속 5천만 등)와 **별개 한도**

**§19 배우자 상속공제** 법정상속분 한도 분자 — 배우자 사전증여 과세표준 차감 시에도 동일하게 §53의2 반영 필요.

---

## 2. 현황 — 핵심 갭 (실측, 같은 패턴 2곳)

§24③·§19 분자 자동 도출은 `giftTaxBase` 명시 분기는 정확하나, **`giftTaxBase` 미설정 + `doneeRelation`만 있는 분기에서 §53(관계공제)만 차감하고 §53의2를 누락**한다.

| # | 위치 | file:line | branch 2 현재 |
|---|---|---|---|
| 1 | §24 한도 분자 | `deductions/inheritance-deduction-limit.ts:132~143` (`computePriorGiftDeductionForLimit`) | `calcRelationDeduction`(§53만) |
| 2 | §19 배우자 분자 | `inheritance-tax.ts:301~310` (`spouseGiftTaxBase`) | `max(0, giftAmount − §53공제)` |

- **branch 1**(`giftTaxBase` 명시): `max(0, giftAmount − giftTaxBase)` — giftTaxBase=증여세 과세표준(§53·§53의2 차감 후)이라 §53의2 이미 반영 → **정확, 무변경**.
- **escape hatch**: `priorGiftDeductionTotal` 수동 입력(`inheritance-tax.ts:433`)·`spouseLegalShareOverride`(:427) 명시 시 자동도출 건너뜀.
- **영향 방향**: §53의2 누락 → 분자 차감 과소 → `netPriorGiftDeducted` 과대 → §24 ceiling 과소 → 상속공제 과소 → **세액 과대(납세자 불리)**.

### 영향 조건 (모두 충족 시 발생)
1. 10년 내 사전증여 중 §53의2(직계존속 혼인·출산) 적용 건 존재
2. 그 건에 `giftTaxBase` 미입력 + `doneeRelation`만 입력 (상속세 모드는 giftTaxBase UI 부재 → 흔함)
3. 과세가액 5억 초과(§24 단서) / 또는 배우자 분자(§19)는 단서 무관

---

## 3. 설계 결정

| 결정 | 내용 | 근거 |
|---|---|---|
| **신규 필드** | `PriorGift.marriageBirthDeduction?: number` (단일) | §24③은 §53의2 **총액**만 필요. §53의2③ 1억 캡은 증여 시점에 이미 적용된 값 저장. UI·validation 단순 |
| **반영 분기** | **branch 2(`giftTaxBase` 미설정)에서만** 가산 | branch 1은 giftTaxBase에 이미 포함 → 이중차감 금지 |
| **2곳 일관** | §24 분자 + §19 배우자 분자 동일 패턴(`g.marriageBirthDeduction ?? 0`) | 헬퍼 추출은 구조 차이(그룹집계 vs 건별)로 부적합 → 패턴+주석 통일 |
| **result echo** | 별도 타입 변경 없음 | §53의2 포함 합계가 기존 `priorGiftDeductionTotal`→`ceilingDetail` 경로로 자동 흐름 |
| **방어 캡** | `Math.min(marriageBirthDeduction, 100_000_000)` **(per-gift)** | §53의2③ 1억 한도 방어 |
| **per-donee 집계 캡** | **v1 미적용 (한계 명시)** | §53의2③ 1억은 수증자(doneeId)별이나, 필드는 "증여 시점 실제 적용액" 모델이라 정상 입력 시 합산 ≤1억. doneeId optional·복수 §53의2 gift 드묾 → per-gift 캡+validation으로 갈음, per-donee 집계 캡은 후속 |

> `marriageExemption`/`birthExemption` 분리 필드는 채택 안 함 — §24 목적상 총액으로 충분, UI 복잡도 회피. (혼인/출산 구분은 증여세 계산기 `GiftDeductionInput`에 이미 존재)
> 상속세 모드 `giftTaxBase` 직접 입력 UI 추가는 **별도 후속** (본 작업은 §53의2 타깃 경로).

---

## 4. 엔진 레이어 설계

### 4.1 타입 — `types/inheritance-prior-gift.types.ts`

```ts
// PriorGift 에 추가
/**
 * 그 사전증여에 적용된 §53의2 혼인·출산 증여재산공제액 (직계존속, 통합 1억 한도).
 * §24③·§19 분자에서 giftTaxBase 미설정 분기일 때만 사용 (giftTaxBase 명시 시 이미 반영 → 무시).
 * 값은 증여 시점에 이미 1억 캡 적용된 실액.
 */
marriageBirthDeduction?: number;
```

### 4.2 §24 분자 — `inheritance-deduction-limit.ts` branch 2

```ts
} else if (g.doneeRelation) {
  relationSums.set(g.doneeRelation, (relationSums.get(g.doneeRelation) ?? 0) + g.giftAmount);
  // §53의2 (직계존속 혼인·출산) — giftTaxBase 미설정 분기에서만 가산 (branch 1은 이미 반영)
  if (g.marriageBirthDeduction && g.marriageBirthDeduction > 0) {
    explicitTotal += Math.min(g.marriageBirthDeduction, 100_000_000);
  }
}
```

### 4.3 §19 배우자 분자 — `inheritance-tax.ts:301~310` branch 2

```ts
const ded = calcRelationDeduction({ donorRelation: g.doneeRelation, priorUsedDeduction: 0 }, g.giftAmount).relationDeduction;
const mbDed = Math.min(g.marriageBirthDeduction ?? 0, 100_000_000); // §53의2 동일 규칙
return s + Math.max(0, g.giftAmount - ded - mbDed);
```

### 4.4 (Do 환류 2026-06-07) §53의2 반영 위치 = **3곳**

구현 중 엔진 시니어가 계획의 2곳 외 **3번째 위치**를 발견·동일 적용:
- ③ `lib/tax-engine/inheritance-prior-gift-taxbase.ts` `derivePriorGiftTaxBase`(`inheritance-tax.ts:109` 호출) — 사전증여 `giftTaxBase` 자동 도출 헬퍼. branch 2(giftTaxBase 미설정) 자동 도출 시 `giftTaxBase = max(0, giftAmount − allocatedDed − mbDed)`로 §53의2 추가 차감. (§57·§58 증여세액공제 한도 산식 등에 연쇄 사용 — 동일 갭이라 일관 적용)

3곳 모두 `Math.min(marriageBirthDeduction, 1억)` per-gift 캡 + branch 1(giftTaxBase 명시) 무참조 패턴 일관.

### 4.5 이중차감/정합 검증
- branch 1(`giftTaxBase`) 진입 시 즉시 return → `marriageBirthDeduction` 미참조. 이중차감 0.
- 영리법인(giftTaxBase=giftAmount → 공제 0): `marriageBirthDeduction` 미해당(0). 정합.
- §24 단서(과세가액 ≤ 5억): `applyDeductionLimit`이 `netPriorGiftDeducted=0`으로 차단 → 무해.

---

## 5. UI 레이어 — 동기화 지점

> 사전증여 입력 = **Step 3** (`steps.tsx:358` `Step3` → `PriorGiftInput` → `prior-gift/GiftRowEditor.tsx`). `PriorGift`는 엔진 타입 import → FormState 자동 반영.

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① 폼 타입 | `types/inheritance-prior-gift.types.ts` | `marriageBirthDeduction?` (엔진 §4.1, UI 자동 반영) |
| ② initial | `components/calc/prior-gift/meta.ts` `makeEmptyGift()` | `marriageBirthDeduction: undefined` |
| ③ normalize | `InheritanceTaxForm.tsx` `applyCorporateGiftTaxFallback` | 신규 필드 strip 방지 확인 (spread 보존) |
| ④ API 변환 | `InheritanceTaxForm.tsx:409~452` (`normalizedPriorGifts` spread) | spread 자동 — 타입 확장 시 grep 점검 |
| ⑤ UI 위젯 | `prior-gift/GiftRowEditor.tsx` | 직계존속(`isMarriageBirthEligibleRelation`) AND `!giftTaxBase` 조건부 sky 섹션: CurrencyInput "§53의2 혼인·출산 증여재산공제(직계존속, 최대 1억)" |
| ⑥ 사이드바 | — | 영향 없음 (사전증여 공제액 미표시) |
| ⑦ 결과 카드 | `InheritanceTaxResultView` §24 detail | `priorGiftDeductionTotal` echo에 자동 반영. "§53의2 포함" 표기 추가(선택) |
| ⑧ validation | `lib/calc/inheritance-validate.ts` + `priorGiftSchema`(`property-valuation-input.ts:383`) | `marriageBirthDeduction > 1억` 차단, 비직계존속 입력 차단, `giftTaxBase` 동시 입력 시 무시 안내 |
| ⑨⑫ Zod | `priorGiftSchema` | `marriageBirthDeduction: z.number().nonnegative().optional()` |
| ⑭ Route | `app/api/calc/inheritance/route.ts` estateItems/preGifts 매핑 | spread 자동 (preGiftsWithin10Years) — grep 확인 |

### 5.1 위젯 게이트 (중복 방지 UX)
- `doneeRelation ∈ {lineal_ascendant_adult, lineal_ascendant_minor}` AND `!gift.giftTaxBase` → §53의2 입력 노출
- `giftTaxBase` 입력된 건 → 위젯 숨김 또는 disabled + "과세표준 직접 입력 시 §53의2 포함 이미 반영" 안내

---

## 6. anchor 테스트 시나리오 (`__tests__/tax-engine/inheritance/`)

| anchor | 입력 | 기대 |
|---|---|---|
| MB-01 §24 분자 §53의2 반영 | 혼인증여 1.5억·doneeRelation=직계존속·giftTaxBase 미설정·marriageBirthDeduction=1억 | `computePriorGiftDeductionForLimit` 반환 = §53 5천만 + §53의2 1억 = **1.5억** (현행 5천만) |
| MB-02 branch1 이중차감 0 (회귀) | giftAmount 1.5억·giftTaxBase=0·marriageBirthDeduction=1억 | 공제 = max(0,1.5억−0)=1.5억 (marriageBirthDeduction 미참조) |
| MB-03 통합 1억 캡 | marriageBirthDeduction=1.5억(오입력) | 1억으로 캡 |
| MB-04 §24 단서(≤5억) | 과세가액 4억·사전증여 1억·marriageBirthDeduction=1억 | netPriorGiftDeducted=0 (3호 미적용, 무해) |
| MB-05 §19 배우자 분자 §53의2 | 배우자가 직계존속(친정)으로부터 혼인증여 1.5억·doneeId=배우자·doneeRelation=lineal_ascendant·marriageBirthDeduction=1억 | spouseGiftTaxBase = max(0, 1.5억−5천만−1억) = **0** (현행 1억) → 배우자 법정상속분 분자 정확 |
| MB-06 회귀 (미입력) | marriageBirthDeduction=undefined | 기존 결과 완전 동일 (§53만) |

> **Pre-Do anchor 우선**: MB-01을 Do 진입 전 작성·실행 → 현행 엔진에서 **실패 확보**(§53만 반영) → 설계 전제 실증.

---

## 7. Do 단계 작업 순서 (시퀀셜)

1. **엔진 시니어**: `PriorGift.marriageBirthDeduction?` 타입 → `inheritance-deduction-limit.ts` branch 2 가산 → `inheritance-tax.ts` 배우자 분자 → **`isMarriageBirthEligibleRelation` export 추가**(UI 게이트 재사용) → anchor MB-01~06 (MB-01 Pre-Do RED→GREEN)
2. **UI 시니어**: ② makeEmptyGift → ⑤ GiftRowEditor 위젯 → ⑧ validation + ⑨ Zod → ③④ spread 점검 → ⑦ 결과 표기
3. **Check**: `ui-engine-sync-checker` + `bkit:gap-detector` + E2E

---

## 8. 완료 정의 (DoD)

- [ ] §24 분자·§19 배우자 분자 **모두** §53의2 반영 (branch 2)
- [ ] branch 1(giftTaxBase) 이중차감 0 (MB-02 회귀)
- [ ] 미입력 시 기존 동작 불변 (MB-06 회귀)
- [ ] 통합 1억 캡 (MB-03)
- [ ] `npx tsc --noEmit` 0 / `npx vitest run __tests__/tax-engine/inheritance/` / 전체 `npm test`
- [ ] Zod·validation·위젯 동기화 (⑨ grep 확인)
- [ ] E2E (사전증여 직계존속 혼인공제 입력 → 결과 한도 반영)

---

## 8.5 Check 환류 (2026-06-07) — 도메인-aware §53의2 게이트

Check(E2E 설계) 중 **reachability 결함 발견·정정**:
- 초안은 §53의2 게이트로 gift-deductions `isMarriageBirthEligibleRelation`(수증자 관점 `lineal_ascendant`)을 재사용했으나, 상속 사전증여의 `doneeRelation`은 **피상속인 관점**(deriveDoneeRelationFromHeir: 자녀→`lineal_descendant`)이라 **주 케이스(자녀 혼인증여) UI 차단**됨 (probe 실증).
- `deriveDoneeRelationFromHeir` swap(옵션 A)은 신고서 양식 표시(`InheritanceFilingFormTable.tsx:193`)·§13을 깨뜨려 기각.
- **채택: 도메인-aware 게이트** — 상속세 §53의2 적격 = 수증자(상속인)가 피상속인의 직계비속 = `doneeRelation === "lineal_descendant"`. 신규 헬퍼 `isInheritancePriorGiftMarriageBirthEligible`(`prior-gift-marriage-birth-rule.ts`). 위젯 게이트 `showIsHeir && lineal_descendant`, validation·Zod 동일.
- 부수: 단일진실 헬퍼 `checkMarriageBirthGiftRule`(validate ⑧ + Zod ⑨ 공용) + `priorGiftSchema` sibling 분리(`prior-gift-schema.ts`, 800줄). E2E `inheritance-section24-marriage-birth.spec.ts` GREEN.
- §19 배우자 분자 mbDed는 **방어적 유지**(배우자는 피상속인의 직계존속이 될 수 없어 실무상 미발생).

## 9. 범위 밖 (후속)

- 상속세 모드 `giftTaxBase`(증여세 과세표준) 직접 입력 UI — 전체 공제 정밀화(별도)
- 혼인/출산 공제 분리 입력(`marriageExemption`/`birthExemption`) — 본 작업은 총액 단일 필드
- **§53의2 per-donee 집계 1억 캡** — v1은 per-gift 캡만. 동일 수증자 복수 §53의2 gift의 합산 초과는 validation(per-gift)·정상 입력 모델로 갈음
- `inheritance-tax.ts` 800줄 초과(842줄, 사전 존재) 분리 — 본 작업과 무관, 후속
