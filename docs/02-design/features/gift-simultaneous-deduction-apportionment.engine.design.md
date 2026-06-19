# 동시증여 증여재산공제 안분 — 엔진 설계

> Plan: `docs/00-pm/gift-simultaneous-deduction-apportionment.plan.md`
> 법령: 상증법 §53·§53의2, 상증령 §46①2호, §47② (KoreanLaw 실측 검증)
> 범위: Phase 1 — §53 관계공제 안분(직계존속·직계비속). §53의2·기타친족·배우자는 Phase 2.

---

## 1. 케이스 인벤토리 (anchor 매핑)

| # | 케이스 | 현재 신고 V_cur(원) | simultaneousGifts | donorRelation | 잔여한도 | 기대 관계공제(원) |
|---|---|---|---|---|---|---|
| C1 | [이미지] 부모 신고 | 130,000,000 | `[{lineal_ascendant_adult, 70,000,000}]` | lineal_ascendant_adult | 50,000,000 | **32,500,000** |
| C2 | [이미지] 할아버지 신고 | 70,000,000 | `[{lineal_ascendant_adult, 130,000,000}]` | lineal_ascendant_adult | 50,000,000 | **17,500,000** |
| C3 | 직계비속 자녀A | 60,000,000 | `[{lineal_descendant, 40,000,000}]` | lineal_descendant | 50,000,000 | **30,000,000** |
| C4 | 직계비속 자녀B | 40,000,000 | `[{lineal_descendant, 60,000,000}]` | lineal_descendant | 50,000,000 | **20,000,000** |
| C5 | 미성년 부모 신고 | 130,000,000 | `[{lineal_ascendant_minor, 70,000,000}]` | lineal_ascendant_minor | 20,000,000 | **13,000,000** |
| C6 | 다른 한도그룹 비안분(부모+삼촌) | 부모 100,000,000 | `[{other_relative, 30,000,000}]` | lineal_ascendant_adult | 50,000,000 | **50,000,000** (삼촌은 donorRelation 불일치 → 분모 제외 → 안분 없음) |
| C7 | 한도 미구속(합<한도) | 20,000,000 | `[{lineal_ascendant_adult, 10,000,000}]` | lineal_ascendant_adult | 50,000,000 | **20,000,000** (안분액 50M×20/30=33.3M > V_cur → min 캡 → 전액) |
| C8 | 회귀(동시증여 없음) | 100,000,000 | `undefined` | lineal_ascendant_adult | 50,000,000 | **50,000,000** (기존 동작 불변) |
| C9 | 기사용공제 + 동시 — **확인필요** | 130,000,000 | `[{lineal_ascendant_adult, 70,000,000}]` | lineal_ascendant_adult | 50,000,000−priorUsed | (예규 검증 후 anchor 확정) |

> C1·C2 = Plan §2 트리거 동결. 원(KRW) 단위 `toBe()`.

---

## 2. 입력 타입 변경 (`types/inheritance-gift-deduction.types.ts:255`)

```ts
export interface GiftDeductionInput {
  donorRelation: DonorRelation;
  marriageExemption?: number;
  birthExemption?: number;
  priorUsedDeduction?: number;
  priorUsedMarriageBirthDeduction?: number;

  /**
   * §46①2호 동시증여 안분 — 같은 날 *다른 동일인 그룹*으로부터 받은 증여.
   * 각 항목 = 한 동일인 그룹의 합산 과세가액 + 그 그룹의 donorRelation.
   * 같은 동일인(부·모)은 현재 신고 grossGiftValue에 이미 합산 → 여기 넣지 않음.
   * 3-state: undefined=동시증여 없음 / []=ON 빈 / [...]=데이터.
   */
  simultaneousGifts?: Array<{ donorRelation: DonorRelation; taxableValue: number }>;
}
```

## 3. 결과 타입 변경 (`GiftDeductionResult` `:274`) — echo 필드

```ts
export interface GiftDeductionResult {
  relationDeduction: number;
  marriageBirthDeduction: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];

  /** §46②2호 안분 산출근거 — 동시증여 없을 땐 undefined(회귀 보존, echo-field-pattern) */
  apportionment?: {
    denominator: number;   // V_cur + Σ(같은 donorRelation 동시 과세가액)
    currentTaxableValue: number; // V_cur
    remainingLimit: number;      // 잔여한도 L'
    apportionedAmount: number;   // floor(L' × V_cur / denominator)
    binding: boolean;            // 분모 합 ≥ 잔여한도 → 안분 실효(true). 합<한도면 false(각자 전액)
  };
}
```

> **코드리뷰 환류(H-1)**: 안분 분자·분모는 **현재 증여 순 과세가액(`currentNetGiftValue`)** — 사전증여(§46①1호 순차)는 제외. `calcRelationDeduction(input, grossGiftValue, currentNetGiftValue=grossGiftValue)` 3번째 인자로 주입(gift-tax.ts 두 호출부에서 `netCurrentGiftValue`/`ordinaryNetValue` 전달). 한도 캡(`min(apportioned, grossGiftValue)`)만 10년 합산값 유지. `binding = apportionedAmount < currentNetGiftValue`(H-3 — 경계 정확). C9-fix anchor로 동결.

## 4. 알고리즘 (`calcRelationDeduction` 분기 — `gift-deductions.ts:58`)

```
입력: input(GiftDeductionInput), grossGiftValue(=V_cur)
1. limit   = GIFT_DEDUCTION_LIMIT[input.donorRelation]
2. priorUsed = input.priorUsedDeduction ?? 0
3. remaining L' = max(0, limit − priorUsed)                 // 기존 동작
4. 안분 분기:
   sameGroup = (input.simultaneousGifts ?? []).filter(g => g.donorRelation === input.donorRelation)
   if sameGroup.length === 0:
       relationDeduction = min(L', V_cur)                    // ← C8 회귀 경로 (기존과 동일)
       apportionment = undefined
   else:
       denominator = V_cur + Σ sameGroup.taxableValue
       apportioned = bigintFloorDiv(L' * V_cur, denominator)  // 정수 분수 연산, Math.round 금지, BigInt 경유
       relationDeduction = min(apportioned, V_cur)           // 과세가액 캡(C7)
       binding = denominator >= L'                            // L' 초과 분모만 안분 실효(아니면 cap→전액)
       apportionment = { denominator, currentTaxableValue: V_cur, remainingLimit: L', apportionedAmount: apportioned, binding }
5. breakdown: 기존 4 step + (안분 시) "동시증여 안분(§46②2호)" step 추가 (lawRef: `legal-codes/inheritance-gift.ts`에 `GIFT.SIMULTANEOUS_APPORTIONMENT="상증령 §46①2호"` 신규 상수 — 문자열 리터럴 금지)
```

### 4-1. Phase 1 스코프 가드 (§53의2 미안분 — 침묵 과다공제 차단)
Phase 1은 §53 관계공제만 안분하고 **§53의2(혼인·출산공제 1억)는 미안분**이다. 직계존속 동시증여 + 혼인/출산공제가 동시에 걸리면 1억이 안분 없이 전액 공제되어 **법정(§46①) 위반 과다공제**가 침묵 발생한다. 2층 방어:
- **⑧ validation(차단 책임)**: `simultaneousGifts?.length` && (`marriageExemption||birthExemption`) 동시 충족 시 **입력 차단**. 순수 엔진은 throw하지 않음.
- **엔진(방어적)**: 위 조합 도달 시 `calcMarriageBirthDeduction`을 **미적용**(0)하고 `apportionment`에 `marriageBirthSkipped: true` 플래그 노출 → UI가 "혼인·출산공제는 동시증여 안분 미반영(Phase 2)" 표기.

Phase 2에서 `calcMarriageBirthDeduction` 동일 비율 안분으로 해소.

- **정수 연산**: `Math.floor(L' * V_cur / denominator)` — `L'·V_cur` 최대 5e7 × ~1e12 = 5e19 > `Number.MAX_SAFE_INTEGER`(9.007e15) 가능. **현실 한도(L' ≤ 6억) × 과세가액**이 안전범위 초과하면 BigInt(`safeMultiply`/`bigint-round-half-up`) 경유. Phase 1 직계 5천만 × 수십억은 5e7×1e10=5e17 > MAX_SAFE → **BigInt floor 필수**. (memory `feedback_safemul_decimal_apportion_precision`·`feedback_applyrate_fractional_rate_one_won_error`)
- **floor 잔액**: 신고별 독립 계산 → 흡수 불필요.
- **caller 무변경**: `calcGiftDeductions`(`:200`)는 `calcRelationDeduction`/`calcMarriageBirthDeduction` 반환을 조립만 — 시그니처 유지, `apportionment`는 result에 pass-through.

## 5. 산식 자기일관 anchor

- C1: floor(50,000,000 × 130,000,000 / 200,000,000) = floor(32,500,000) = 32,500,000.
- C2: floor(50,000,000 × 70,000,000 / 200,000,000) = floor(17,500,000) = 17,500,000.
- **C1 + C2 합 = 50,000,000 = 한도** (안분 합 = 한도, 정수 우연 일치). 일반 케이스는 floor로 합 ≤ 한도(각 납세자 독립).

## 6. 동기화 지점 (엔진측 + 14지점 연결)

| 지점 | 파일:위치 | 작업 |
|---|---|---|
| 엔진 input | `types/inheritance-gift-deduction.types.ts:255` | `simultaneousGifts?` 추가 |
| 엔진 result | `types/inheritance-gift-deduction.types.ts:274` | `apportionment?` echo 추가 |
| 산식 | `gift-deductions.ts:58` `calcRelationDeduction` | 안분 분기 + breakdown step |
| ④ API 변환 | `lib/calc/gift-api.ts:46` | `deductionInput.simultaneousGifts` 조립 |
| ⑫ Zod | `lib/validators/gift-aux-schemas.ts:13` | `simultaneousGifts` array schema (**유일 게이트** — Route 직접 캐스트) |
| ⑭ Route | `app/api/calc/gift/route.ts:64` | 직접 캐스트 — 변경 없음(Zod 통과분 자동) |
| ⑦ 결과 | 증여 결과 공제 카드 | `apportionment` 표시 |

## 7. 테스트 파일

- `__tests__/tax-engine/gift/simultaneous-apportionment.test.ts` (신규) — C1~C8 `toBe()`. C9는 예규 검증 후.
- 회귀: 기존 `__tests__/tax-engine/gift/*` 전체 — `simultaneousGifts` undefined 경로 불변(C8) 보장.

## 8. 미해결 / Do 결정 환류

1. **C9 순차(priorUsed)×동시 안분** — 잔여한도 안분 해석 예규 검증. 분자·분모는 H-1로 currentNet 확정(C9-fix anchor 동결)이나, **사전증여 동반 시 캡(`min(apportioned, gross)`)·"각자 전액" 의미의 예규 정합은 Phase 2**(코드리뷰 M-3 stale 관계 갱신 포함).
2. **R1 해소(Do 실측)**: 폼 `donor`는 단일 값(father/mother 택1) — 부+모 native 합산 입력 경로 없음. 그러나 `deriveDonorRelation("father")=deriveDonorRelation("mother")=lineal_ascendant_adult`이므로 **사용자가 한 부모 donor로 합산 과세가액(130,000,000)을 입력**하면 C1 성립. §47② 동일인 합산은 사용자가 값 합산으로 수행 — 현 폼 단일 donor 모델과 정합. **블로커 아님 → Phase 1 native 멀티입력 불요.**
3. **BigInt 경계** — `calcRelationDeduction`에서 `BigInt(L') * BigInt(V_cur) / BigInt(denominator)` 채택(양수 truncate=floor). `safeMultiply` 미사용(직접 BigInt). 확정.
4. **§53의2 가드 구현**: 2층 방어 — 엔진 `calcGiftDeductions`가 동시증여+혼인/출산 동시 시 MB 미적용(0)+`marriageBirthSkipped` 플래그 / ⑧ validation(`gift-tax-form-shared.tsx` step 3)이 입력 차단.
