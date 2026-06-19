# 동시증여 시 증여재산공제 안분 — 구현 계획서

> **상태**: Plan (Do 미착수)
> **작성일**: 2026-06-20
> **세목**: 증여세 (gift)
> **법령 근거**: 상증법 §53·§53의2, 상증령 §46①2호, §47② — **KoreanLaw MCP 실측 검증 완료**

---

## 1. 기능 정의 (한 줄)

동일 수증자가 **같은 날 둘 이상의 증여자로부터 동시에** 증여받고, 그 증여자들이 **같은 증여재산공제 한도 그룹**에 속할 때, 공유하는 공제한도를 **각 증여세과세가액 비율로 안분**하여 적용한다.

- **직계존속 동시증여**: 부·모·조부모 등으로부터 동시 → 직계존속 5천만원(미성년 2천만) 한도 안분 (이미지 사례).
- **직계비속 동시증여**: 자녀·손자 등 둘 이상의 직계비속으로부터 동시 → 직계비속 5천만원(§53 3호) 한도 안분. **직계존속 사례와 산식·취급 동일**(사용자 지시 반영).
- 산식은 한도그룹과 무관한 일반형(5절)이므로 직계비속·기타친족 그룹에도 그대로 성립.

---

## 2. 트리거 사례 (이미지 = anchor 동결)

> 갑(성년)이 2023.2.1. 아버지 90,000천원, 어머니 40,000천원, 할아버지 70,000천원을 **동시** 증여받음.

| 구분 | 과세가액 | 증여재산공제(직계존속 5천만 안분) |
|---|---|---|
| 부·모 (§47② 동일인 → 합산) | 130,000천원 | 50,000천 × 130,000 ÷ (130,000+70,000) = **32,500천원** |
| 할아버지 | 70,000천원 | 50,000천 × 70,000 ÷ 200,000 = **17,500천원** (= 50,000 − 32,500) |

- 단위 환산: 90,000천원 = 90,000,000원. 한도 50,000천원 = 50,000,000원(5천만).
- **부·모가 합산되는 근거는 §47②(동일인)**, **5천만 한도를 부모그룹·조부모그룹이 나눠 쓰는 근거는 §46①2호(동시증여 안분)** — 두 메커니즘이 별개임에 주의.

---

## 3. 법령 근거 (실측 검증)

### 상증법 §53 (증여재산 공제) — 검증 완료
- 2호: **직계존속 5천만원**(미성년 수증자 **2천만원**). "직계존속"에 *수증자의 직계존속과 혼인 중인 배우자 포함*.
- 1호 배우자 6억 / 3호 직계비속 5천만 / 4호 기타친족(4촌 이내 혈족·3촌 이내 인척) 1천만.
- 한도 합산 기준: **그 증여 전 10년 이내 공제받은 금액 합산**(단, §53의2 혼인·출산 공제액은 제외).

### 상증령 §46① (증여재산공제의 방법) — 검증 완료 (핵심)
> ①법 제53조 **및 제53조의2**를 적용할 때 증여세과세가액에서 공제할 금액의 계산은 각각 다음 각 호의 어느 하나의 방법에 따른다.
> 1. 2이상의 증여가 그 **증여시기를 달리하는 경우**에는 … 최초의 증여세과세가액에서부터 **순차로 공제**.
> 2. 2이상의 증여가 **동시에 있는 경우**에는 각각의 증여세과세가액에 대하여 **안분하여 공제**.

- **본 기능 = §46①2호.** §53뿐 아니라 **§53의2(혼인·출산공제)에도 안분이 적용**됨(법문 "법 제53조 및 제53조의2를 적용할 때").
- §46①1호(순차)는 현행 엔진의 사전증여 합산(`priorUsedDeduction`)이 이미 담당하는 영역.

### 상증법 §47② (동일인 합산)
- 부·모를 동일인으로 합산하는 근거. 현행 `gift-prior-aggregation.ts:getDonorGroup()`이 그룹 A(부모)/B(조부모)로 매핑하여 처리.

---

## 4. 현재 구현 실측 (file:line)

| 항목 | 위치 | 현 상태 |
|---|---|---|
| 공제 한도 상수 | `lib/tax-engine/deductions/gift-deductions.ts:34-40` | `GIFT_DEDUCTION_LIMIT` (배우자 6억·직계존속 5천/2천·기타 1천) |
| 관계공제 계산 | `gift-deductions.ts:58-91` `calcRelationDeduction()` | `min(한도−priorUsedDeduction, grossGiftValue)` — **안분 없음** |
| 혼인·출산공제 | `gift-deductions.ts:118-176` `calcMarriageBirthDeduction()` | 직계존속만·통산 1억 — **안분 없음**(Phase 2 안분은 이 함수 별도 분기) |
| 통합 공제 | `gift-deductions.ts:200-234` `calcGiftDeductions()` | 합계 캡 `min(합, grossGiftValue)` |
| 입력 타입 | `lib/tax-engine/types/inheritance-gift-deduction.types.ts:255` `GiftDeductionInput`(Result `:274`) | `donorRelation·marriageExemption·birthExemption·priorUsedDeduction·priorUsedMarriageBirthDeduction` ← **신규 `simultaneousGifts` 추가 위치** |
| 엔진 입력 | `lib/tax-engine/types/inheritance-gift.types.ts:575` `GiftTaxInput`(Result `:618`) | `donor`(단일)·`priorGiftsWithin10Years[]`·`deductionInput`(:605) — **동시 다증여자 입력 없음** |
| 동일인 그룹화 | `lib/tax-engine/gift-prior-aggregation.ts:31-49` `getDonorGroup()` | A 부모 / B 조부모 / D 직계비속 … (§47② **합산** 축 — 안분 축과 다름) |
| API 변환 | `lib/calc/gift-api.ts:40-104` `buildGiftTaxInput()` (deductionInput 조립 `:46`, spread `:94`) | form → GiftTaxInput |
| Zod 스키마 | `lib/validators/gift-aux-schemas.ts:13` `giftDeductionInputSchema` | **gift Route 직접 캐스트(route.ts:64) → 이 스키마가 유일 게이트** |
| Route handler | `app/api/calc/gift/route.ts:64` | `parsed.data as unknown as GiftTaxInput` **직접 캐스트** — 수동 필드 매핑·Date 변환 없음 |
| 결과 타입 | `inheritance-gift.types.ts:618` `GiftTaxResult` | `totalDeduction·deductionDetail` |
| 폼 검증(⑧) | `components/calc/gift-tax-form-shared.tsx` 인라인 + `lib/calc/prior-gift-*` | **전용 `lib/calc/gift-validate.ts` 부재** — 동시증여 검증은 폼 인라인에 추가 |

**결론**: 현행은 "동일인 그룹 1건 + 사전증여(시기 다른 것) 배열" 모델. **같은 날 다른 동일인의 동시증여를 표현할 입력·안분 산식이 모두 부재** → 신규 입력 1종(`simultaneousGifts`) + `calcRelationDeduction` 안분 분기가 핵심. **주의**: §47② 동일인 합산(getDonorGroup)과 §46② 안분(donorRelation 한도그룹)은 **별개 축** — 혼동 금지.

---

## 5. 산식 정의 (구현 기준)

현재 신고 대상의 **안분 그룹 = `donorRelation`(공제 한도 키 그 자체)** 에 대해:

```
잔여한도 L' = max(0, 한도 L − 기사용공제 priorUsedDeduction)
동시증여 집합 S = { 현재 신고 과세가액 V_cur } ∪ { simultaneousGifts 중 donorRelation 동일한 V_i }
안분공제 = floor( L' × V_cur / Σ(V in S) )
실제 관계공제 = min( 안분공제, V_cur )      // 과세가액 초과 방지(기존 캡 유지)
```

- **안분 그룹 키는 `donorRelation` 그 자체** — 별도 한도그룹 매핑 불필요. 직계존속 성년(`lineal_ascendant_adult`)/미성년(`lineal_ascendant_minor`)은 **수증자 연령이 고정**이라 한 수증자의 동시증여에서 공존 불가 → donorRelation으로 그룹이 자연 분리됨. 직계존속(5천만)·직계비속(5천만)은 한도 금액이 같아도 donorRelation이 달라 **안분 분모가 섞이지 않음**.
- **floor 후 캡**: 정수 절사. 신고가 서로 독립 계산이므로 floor 잔액 흡수(±1원)는 불필요 — 각 납세자별 floor가 정답.
- **§53의2 혼인·출산공제 안분(Phase 2)**: 같은 그룹 동시증여 시 1억 통산 한도도 동일 비율로 안분(§46① 법문 적용 대상). Phase 1에서는 §53 관계공제 안분만, §53의2는 미사용 가정.
- **순차(§46①1호) × 동시(2호) 상호작용 — ⚠️ 확인필요**: 기사용공제(과거 순차분) 차감 후 *잔여한도*를 동시증여끼리 안분하는 것이 합리적 해석이나, 이미지 사례는 기사용공제 0이라 미검증. **Do 진입 전 집행기준·예규로 검증 후 확정**(추정 단정 금지).

---

## 6. 설계 결정 / 입력 모델 (검토 필요 항목 명시)

### 6-A. 동시증여 입력을 어떻게 받을 것인가 (핵심 결정)
현재 신고(현재 동일인 그룹)를 계산할 때, **같은 날 다른 증여자로부터 받은 증여**를 알려줄 신규 입력이 필요하다.

- **권장(Option 1)**: `GiftDeductionInput`에 동시증여 배열 추가 (`inheritance-gift-deduction.types.ts:255`)
  ```ts
  /** §46①2호 동시증여 안분 — 같은 날 다른 동일인으로부터의 증여. 3-state: undefined=동시증여 없음 / []=ON 빈 / [...]=데이터 */
  simultaneousGifts?: Array<{ donorRelation: DonorRelation; taxableValue: number }>;
  ```
  엔진이 현재 신고와 **같은 `donorRelation`**인 항목만 골라 분모에 합산. UI는 사전증여 테이블/모달과 동형(`[[project_prior_gift_table_modal]]`), 3-state optional.
  - ⚠️ **`feedback_no_silent_apportion_fallback` 충돌 아님**: 안분은 §46①2호 **법정 강제 계산**. 단 `simultaneousGifts[*].taxableValue`는 **사용자 명시 입력** — 동시증여 ON인데 과세가액 미입력이면 **검증 차단**(자동 분할·추정 금지).
- **대안(Option 2)**: 스칼라 `otherSimultaneousTaxableValueSameGroup?: number` 하나만. 단순하지만 그룹 자동판정을 UI가 떠안아 dual-truth 위험 → 비권장.

→ **Option 1 권장.** 그룹 판정을 엔진 단일 진실로 유지.

### 6-B. 부·모 동시합산(§47②)을 현행 모델에서 어떻게 표현?
- 부·모는 **같은 동일인 그룹(A)** → 현재 신고의 **하나의 과세가액(130,000)** 으로 합쳐져야 안분 분자가 맞다.
- 현행 `donor`는 단일 값(father|mother). **부+모 같은 날 합산을 현재 신고 한 건으로 입력하는 경로가 명확한지 Do 전 실측 확인 필요**(giftItems에 부·모 자산을 함께 담는지, 아니면 모를 사전증여로 넣는지). 이 경로가 불명확하면 §47② 동시합산 입력 보강이 Phase 1 선결과제.
- 즉 본 기능의 **분자(부모 130,000)는 §47② 합산 결과**, **분모 추가분(할아버지 70,000)은 §46①2호 안분 입력**. 두 입력 경로를 혼동하지 말 것.
- **직계비속 증여자는 §47② 배우자 합산 미적용**: §47②은 "증여자가 직계존속인 경우 그 배우자 포함"이라 **직계존속 증여자에만** 동일인 합산이 일어난다. 직계비속 증여자(자녀1·자녀2)는 **각자 별도 동일인 그룹**이라 합산 없이 곧바로 각 과세가액이 안분 분모에 들어간다(그룹 D). 안분 산식 자체는 직계존속과 동일.

### 6-D. 두 그룹핑의 상호작용 (⚠️ 분모 오류 방지 — 핵심)
입력에 **두 축의 그룹핑**이 겹친다. 혼동 시 분모가 틀어진다.

| 축 | 근거 | 역할 | 예 |
|---|---|---|---|
| **동일인 그룹** | §47②, `getDonorGroup()` | 같은 동일인 증여를 **하나의 과세가액으로 합산** | 부 90,000 + 모 40,000 = **130,000** (그룹 A) |
| **한도그룹** | §46②, `donorRelation` | 같은 한도를 **동시 동일인 그룹끼리 안분** | 부모(A)·조부모(B) 모두 직계존속 5천만 공유 |

- **현재 신고 `V_cur` = 현재 동일인 그룹의 합산 과세가액** (부모 신고면 130,000).
- **`simultaneousGifts` 각 항목 = *다른* 동일인 그룹의 합산 과세가액** + 그 그룹의 `donorRelation`. 부모 신고 계산 시 항목 = `[{lineal_ascendant_adult, 70,000,000}]`(할아버지=그룹 B). **부·모를 별도 2항목으로 넣지 말 것** — 이미 V_cur에 합산됨.
- 엔진 분모 = `V_cur + Σ(simultaneousGifts 중 donorRelation === 현재)`. 직계비속은 §47② 합산이 없어 각 자녀가 곧 별도 동일인 그룹 = 별도 항목.

### 6-C. 스코프 (Phase 분리 권장)
- **Phase 1**: §53 **직계존속 안분 + 직계비속 안분**(사용자 지시 반영 — 두 그룹 동일 산식 동시 구현). 입력 = `simultaneousGifts[]`. anchor = 이미지 2건 + 직계비속 2건 + 미성년 한도 + 다른그룹 비안분.
- **Phase 2**: §53의2 혼인·출산 안분 + 순차×동시 상호작용(잔여한도 안분) 검증 반영 + 기타친족(1천만)·배우자(6억) 그룹 일반화.
- 산식이 그룹 무관 일반형이라 직계존속·직계비속을 동시에 커버해도 분기 추가 비용은 사실상 0(같은 `calcRelationDeduction` 경로). 차이는 anchor와 §47② 입력 취급(6-B)뿐.

---

## 7. 변경 지점 — 14 동기화 지점 매핑

**엔진(선행)**
- `GiftDeductionInput`에 `simultaneousGifts?` 추가 (`types/inheritance-gift-deduction.types.ts:255`).
- `calcRelationDeduction()` 안분 분기 — 같은 `donorRelation` 동시 과세가액 합산 → 잔여한도 안분 (`gift-deductions.ts:58`).
- breakdown step에 안분 산식 노출(한국어 풀어쓰기). echo 필드 `apportionment?: { denominator, currentTaxableValue, remainingLimit, apportionedAmount, binding }`(엔진 설계 §3 단일 진실)로 결과뷰 산출근거 표시(`echo-field-pattern`). UI는 이 객체만 참조(자체 재계산 금지).

**클라이언트 8지점** — `GiftTaxFormState`(=gift-api.ts:22 re-export)·`gift-tax-form-shared.tsx` 기준
- ① form state: `simultaneousGifts` 배열 / ② initial / ③ normalize / ④ `buildGiftTaxInput` deductionInput 조립 (`gift-api.ts:46`) / ⑤ UI 위젯(동시증여 입력 카드 — 사전증여 테이블+모달 동형, `[[project_prior_gift_table_modal]]`) / ⑥ 사이드바 합계(안분 후 공제 반영) / ⑦ 결과 카드 공제 산식에 안분 표시 / ⑧ **검증 — 전용 `gift-validate.ts` 부재** → `gift-tax-form-shared.tsx` 인라인에 "동시증여 ON + 과세가액 ≤0 차단" 추가(UI 통과↔검증 모순 금지).

**API/Route 6지점**
- ⑨⑩ Zod enum(관계 — 이미 존재) / ⑪ N/A(자산-수준 아님) / ⑫ **`giftDeductionInputSchema` 확장**(`gift-aux-schemas.ts:13`) — `simultaneousGifts: z.array(z.object({ donorRelation: 관계enum, taxableValue: z.number().positive() })).optional()` / ⑬ fetch body = `buildGiftTaxInput(form)` 전체(별도 spread 함수 없음 — ④에 포함되면 자동 전달) / ⑭ Route(`route.ts:64`) **직접 캐스트** — 수동 매핑 없음, Date 변환 불요(숫자+enum만).

> ⚠️ **gift는 Route 직접 캐스트 → ⑫ Zod가 유일 게이트**. `simultaneousGifts`를 ⑫에 안 넣으면 ④에서 담아도 Zod parse 시 **침묵 strip → 엔진 미도달**. ⑫·④ grep 자가점검 필수(TypeScript 미감지).

---

## 8. Anchor 테스트 (Pre-Do 우선 작성 — `feedback_pre_anchor_verification`)

원(KRW) 단위 `toBe()` 동결:

1. **[이미지] 부모 신고**: 과세가액 130,000,000 + 동시 할아버지 70,000,000 → 관계공제 **32,500,000**.
2. **[이미지] 할아버지 신고**: 과세가액 70,000,000 + 동시 부모 130,000,000 → 관계공제 **17,500,000**.
3. **[직계비속] 자녀A 신고**: 수증자가 같은 날 자녀A 60,000,000 + 자녀B 40,000,000(둘 다 직계비속, §47② 합산 없음) → 자녀A 관계공제 = 50,000,000 × 60,000,000 ÷ 100,000,000 = **30,000,000**.
4. **[직계비속] 자녀B 신고**: 위 동시증여에서 자녀B → 50,000,000 × 40,000,000 ÷ 100,000,000 = **20,000,000** (= 50,000,000 − 30,000,000).
5. **미성년 안분**: 한도 20,000,000, 이미지 비율 → 부모 13,000,000 / 할아버지 7,000,000.
6. **다른 한도그룹 비안분**: 부모(직계존속 5천만) + 삼촌(기타친족 1천만) 동시 → 안분 없이 각 단독 한도(부모 50,000,000 한도 내, 삼촌 10,000,000 한도 내).
7. **한도 미구속(합 < 한도)**: 동시 과세가액 합이 한도보다 작으면 각자 과세가액 전액 공제(안분 무영향).
8. **회귀**: 동시증여 미입력(`simultaneousGifts` undefined) → 기존 단건 공제값 불변(8천여 기존 anchor 회귀 0건).

> anchor #1~#8 = 엔진 설계 §1 C1~C8. **C9(기사용공제 priorUsed × 동시 안분)** 은 §11 q2(예규 검증) 후 확정 — Phase 1 미포함.

---

## 9. 구현 순서 (Phase 1)

```
1. Pre-Do anchor #1·#2 작성 → 실패 확보 → 디자인 환류        verify: vitest 2건 RED
2. 엔진: GiftDeductionInput.simultaneousGifts + calcRelationDeduction 안분 분기  verify: anchor #1~#6 GREEN
3. Zod ⑫ + API 변환 ④⑬⑭ + body spread                       verify: tsc 0, grep ⑫⑬⑭
4. UI ①②③⑤⑥⑦⑧ (동시증여 입력 카드 = 사전증여 모달 동형)      verify: 폼→계산→결과 E2E 1종
5. 회귀 전체                                                 verify: npm test 0 실패, 기존 증여 anchor 불변
6. 브라우저 수동 확인(Network 탭 simultaneousGifts body 확인)
```

---

## 10. 리스크 / 주의

- **R1 §47② 입력 경로(6-B)**: 부+모 동시합산을 현재 신고 1건으로 넣는 경로가 불명확하면 안분 분자(130,000)가 틀어짐 → Phase 1 선결 실측.
- **R2 순차×동시(5절)**: 잔여한도 안분 해석은 예규 검증 후 확정. 미검증 단정 금지.
- **R3 §53의2 안분 — ✅ Phase 2 완료**: Phase 1은 §53만 안분 + 가드(혼인/출산공제 동시 시 차단)로 침묵 과다공제 방지. **Phase 2(§46① 법문 직접 근거)에서 `calcMarriageBirthDeduction`이 잔여 1억을 §53과 동일 과세가액 비율 안분 → 가드 전부 제거**. window 자격은 동시증여=같은 날로 동일 → 분모 §53과 동일(신규 입력 0). anchor P2-1~P2-5.
- **R4 dual-truth**: 그룹 판정·안분 산식은 **엔진 단일 진실**. UI가 자체 재구현 금지(`feedback_ui_engine_dual_truth_avoidance`).
- **R5 floor 일관성**: 신고별 독립 floor. 이미지 1원 오차 발생 시 PDF round 일관성 점검(`bigint-round-half-up` 정책).

---

## 11. 미해결 질문 (Do 전 사용자/예규 확인)

1. (6-C) Phase 1 스코프를 **직계존속 + 직계비속 §53 안분**으로 잡는 데 동의하는가? (기타친족·배우자·§53의2는 Phase 2)
2. (5절) 기사용공제(순차)가 있을 때 **잔여한도를 안분**하는 해석이 맞는지 — 권위 있는 예규/집행기준 근거 필요.
3. (6-B) 부·모 같은 날 합산을 현재 UI가 한 건으로 입력 가능한가 — 실측 후 보강 범위 확정.
