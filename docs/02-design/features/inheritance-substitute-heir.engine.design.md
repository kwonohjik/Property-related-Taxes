# 대습상속인 법정상속분 반영 · 엔진 설계

- 계획서: `docs/01-plan/inheritance-substitute-heir.plan.md`
- 작성일: 2026-06-09
- 범위: 대습상속인(§1001·§1003②)을 실제 상속인으로 입력받아 법정상속분(§1010)을 부여. 결정 A=신규 단일화 / B=그룹키 / C=validation 차단.

## Context

후순위 며느리·사위(`relation="other"`)·손자(현행 `legatee` 우회)는 법정상속분 0 — 진짜 대습상속인이 실제 상속인으로 모델링되지 않음. `computeLegalShares`를 확장해 피대습 슬롯(§1001) + 대습 그룹 §1010② 재분배를 산정한다. 대습상속인이 `shares` 멤버가 되면 선행 PR `isInheritanceTaxPayer`(shares 멤버십)·⑪·⑫·자산/채무/장례비 배분이 **자동 정합**.

## ★ 케이스 인벤토리 (Do 진입 전 필수)

| ID | 입력 | 기대 (공통분모 정수 numerator) | 판정 |
|---|---|---|---|
| SH-1 | 배우자 + 생존자녀2 + 피대습자녀1(며느리1 spouse + 손자1 desc) | 분모45: 배우자15·생존자녀10·10·며느리6·손자4. Σ45 | 핵심 |
| SH-2 | 배우자 + 생존자녀1 + 피대습자녀1(손자2, 배우자 대습 없음) | 피대습슬롯 §1010② 균분(손자 각 슬롯/2) | §1010② 균분 |
| SH-3 | 배우자 + 생존자녀1 + 피대습자녀1(며느리 단독, 직계비속 0) | §1003② 단독 — 피대습 슬롯 전부 며느리 | 단서 |
| SH-4 | 배우자 + 자녀 전원 사망(2그룹: g1 손자2 / g2 며느리+손자1) | 손자녀 1순위 갈음, 배우자 공동 2슬롯. ★상이 S(g1=4·g2=5) commonExtra=20 검산 | 다중그룹·§19·E6 |
| SH-5 | 피대습 형제1(조카2, 배우자 부재) — 3순위 | 형제 슬롯 갈음 §1009① 균분. ★배우자 존재 시 §1003① 배우자 단독 → 형제·대습 0(조카 미산입) | 3순위 |
| SH-6 | substituteGroupId 존재하나 대습상속인 0명 | **validation 차단**(결정-C) | 경계 |
| SH-7 회귀 | 대습 無(배우자+자녀2) | 기존 §1009: 분모7 배우자3·자녀2·2 | 회귀 |
| SH-8 회귀 | 기존 §27 손자 대습(legatee+genSkip+substitute) | **기존 동작 보존**(legatee 우회 레거시) surcharge=0 | 회귀 |
| SH-9 | 대습 며느리 사전증여 보유(SH-1 구성) | shares 멤버 → `isInheritanceTaxPayer=true` → ⑪·⑫ 정상 포함 | 선행 PR 정합 |
| SH-10 | §19 배우자공제(SH-1) | coheirCount=3(피대습 슬롯 포함) → 배우자지분 1.5/4.5 | 별도경로 C |
| SH-11 회귀 | §23의2 대습배우자 며느리(2022~) | 5-0 derive로 isSubstituteInheritance 자동 → G5 적격 보존 | 회귀 |

## 법령 근거 (KoreanLaw MCP 검증 2026-06-09, 민법 mst=284415 시행 2026-03-17)

- §1001: 1순위(직계비속)·3순위(형제자매) 상속인 될 자 개시 전 사망/결격 → 그 직계비속이 순위 갈음. **2순위·배우자 본인 대습 없음.**
- §1003②: §1001 경우 **사망자의 배우자**는 §1001 직계비속과 동순위 공동, 없으면 단독. §1001이 자녀·형제 양쪽이므로 사망 자녀의 배우자(며느리·사위)뿐 아니라 **사망 형제의 배우자(형수·매부)도 substituteRole="spouse"**로 동일 처리.
- §1010①: 대습상속인 그룹 = 피대습자 상속분.
- §1010②: 피대습 직계비속 수인이면 피대습 상속분 한도 §1009 재분배. §1003②(배우자)도 동일 → 그룹 내 배우자 1.5 : 직계비속 1.

## 엔진 input/result 타입

### 1. `Heir` 신규 3필드 (`types/inheritance-gift.types.ts`)

```ts
/** 대습상속(민법 §1001) 그룹 식별자. 같은 피대습자(개시 전 사망·결격된 자녀·형제)를
 *  갈음하는 대습상속인들이 공유. 존재 시 이 Heir는 대습상속인 — computeLegalShares가
 *  피대습 슬롯을 §1010②로 재분배. relation은 표시용, 그룹 판정은 본 필드 단독. */
substituteGroupId?: string;
/** 피대습자의 원래 상속순위 (§1001: 1순위 직계비속="child" / 3순위 형제자매="sibling"만).
 *  computeLegalShares가 어느 그룹 슬롯을 차지하는지 결정. */
substituteForRelation?: "child" | "sibling";
/** 대습 그룹 내 역할 — §1010②/§1009 재분배 비율.
 *  "spouse"(며느리·사위 §1003② 1.5가산) / "descendant"(손자녀·조카 균분). */
substituteRole?: "spouse" | "descendant";
```

### 2. `LegalShare`·`LegalShareResult` — 타입 불변

기존 `{heirId, numerator}` + 공통 `denominator` 구조 그대로. 대습상속인도 동일 형태로 push(공통분모는 확장으로 커짐).

### 3. result echo — 추가 없음

대습상속인이 shares 멤버가 되면 기존 `HeirTaxBreakdown`(perHeir)·부표2가 자동 채움. 신규 echo 불요(선행 PR `isTaxPayer` echo로 충분).

## 계산 알고리즘

### A'. 플래그 정합 — ★ Do 환류: orchestrator derive 대신 소비처 인라인

**설계 의도**: substituteGroupId 보유 heir를 §27/§23의2 플래그 소비자가 대습으로 인식.

**구현 결정(환류)**: orchestrator 전역 `deriveSubstituteFlag`(input.heirs 복제·전파)는 다수 호출처 치환으로 회귀면이 넓어, **실측 결과 소비처가 §23의2 cohabit 1곳뿐**임을 확인하고 narrow 인라인으로 대체:
- **§23의2 cohabit** (`inheritance-cohabit-helpers.ts:105-110`): `isSubstituteInheritance===true || (substituteGroupId != null && substituteRole==="spouse")` OR 동치 1줄.
- **§27 gen-skip** (`inheritance-generation-skip.ts:108,118`): 변경 **불요** — 루프가 `isGenerationSkipBeneficiary` 게이트 하에만 진입. 신규 모델 대습 손자는 genSkip 미설정 → 할증 경로 미진입 → surcharge=0(메커니즘 다름·결과 동일). 레거시 legatee+genSkip+substitute 경로 보존.
- `computeLegalShares` 확장은 substituteGroupId를 직접 소비(플래그 무관) → 전 호출처 자동 정합.

→ 회귀면 최소화·동일 효과. (원안 `deriveSubstituteFlag`는 미채택)

### B. `computeLegalShares` 확장 (`inheritance-legal-share.ts`)

```ts
// 1. normal eligible에서 대습상속인 제외 (4촌 others 그룹 falling 차단)
const eligibleNormal = eligible.filter(h => h.substituteGroupId == null);
const groups = groupBy(heirs.filter(h => h.substituteGroupId != null), h => h.substituteGroupId);

// 2. 슬롯 수 (생존 + 대습 그룹 1슬롯씩)
const childSlots = eligibleNormal.filter(child).length
  + distinctGroups(substituteForRelation==="child").length;
const siblingSlots = ... ;  // 3순위

// 3. 기존 :50-63 분기에서 children.length→childSlots, siblings.length→siblingSlots
//    배우자 5할가산 = 1·2순위 슬롯 존재. base 분모·생존 슬롯 numerator 산정(기존).
//    ★ E5: 피대습자는 엔트리 없음 → base shares엔 생존자·배우자만 push.
//    각 대습 그룹의 피대습 슬롯 numerator:
//      slotNum_g = (배우자공동 1·2순위 그룹)? 2 : 1   // 생존 1슬롯과 동일 numerator
//    이 slotNum_g 몫을 4단계에서 그룹 멤버 numerator로 직접 생성(phantom 슬롯 미존재).

// 4. expandSubstituteShares: 피대습 슬롯 numerator를 그룹 §1010②로 재분배 (★ E1 정정 — 통일 가중치)
//    그룹 g (피대습 슬롯 numerator = slotNum_g, base 분모 baseDenom):
//      통일 가중치  weight: spouse=3, descendant=2     // §1009②(1.5:1) ×2 정수화. desc만이면 균분, spouse만이면 전액
//      S_g = 3·hasSpouse + 2·numDesc                   // 그룹 내부 분모
//      commonExtra = Π(S_g)  (전 대습 그룹)
//      공통분모 = baseDenom × commonExtra
//      대습 멤버 numerator = slotNum_g × weight × (commonExtra / S_g)
//      비대습(생존·배우자·base) numerator ×= commonExtra
//      최종 GCD(모든 numerator ∪ denominator) 약분
```

검산 SH-1: baseDenom 9, 피대습슬롯 2, S=3+2=5, commonExtra=5 → 분모45. 며느리 2×3×1=6, 손자 2×2×1=4, 생존자녀 2×5=10·10, 배우자 3×5=15. Σ45.✓
검산 SH-2: baseDenom 7, 슬롯 2, S=2·2=4(spouse無), 분모28. 손자 2×2×1=4·4, 생존자녀 2×4=8, 배우자 3×4=12. Σ28.✓ (손자 4/28=1/7 균분)

**정수 정책**: numerator·denominator 모두 정수. 비율(0.6 등) 금지. 약분은 `gcd`(`tax-utils.ts`에 있으면 재사용, 없으면 legal-share 로컬). `distributeByLegalShares`(`:96`)는 numerator/denominator·잔액 흡수로 금액 배분 — 확장 무관하게 동작(메모리 `feedback_floor_residual_absorption`).

### C. §19 배우자공제 (`inheritance-tax.ts:353-360`) — dual-truth 해소 (★ E2 단일화)

`childCount`/`ascendantCount`/`coheirCount` 직접 카운트 **제거** → `computeLegalShares(derived)`의 배우자 share 직접 사용:
```ts
const legal = computeLegalShares(derived);
const spouseShare = legal.shares.find(s => s.heirId === spouse.id);
const spouseRatio = spouseShare ? spouseShare.numerator / legal.denominator : 0;
// numeratorCorrected base·spouseGiftTaxBase 차감은 기존 유지
```
피대습 슬롯이 분모에 자동 산입(SH-4·SH-10). 배우자 부재 시 Phase D 미발동(기존). SH-10·SH-4 anchor 검증.

## Silent fallback / 자동 안분

- 없음. 대습 그룹 0이면 `expandSubstituteShares` no-op → 기존 분기 그대로(SH-7).
- 빈 그룹(SH-6)은 자동 채움 금지 → validation 차단(결정-C, validate 레이어).

## 테스트 약속 (Pre-Do anchor)

- **SH-1·SH-2 우선 RED**(메모리 `feedback_pre_anchor_verification`): 현행 computeLegalShares가 며느리·손자 shares 부재임을 실증 → 확장 후 GREEN.
- SH-3·4·5 분기 / SH-6 validation / SH-7·8·11 회귀 / SH-9 선행 PR / SH-10 §19.
- numerator **정수 toBe()** 직접 비교(분수 금지).
- 회귀 전건: `section27-substitute`·`cohabit-eligible-relation`·`heir-allocation-summary-table`.

## 800줄 정책

- `inheritance-legal-share.ts` 125줄 → +`expandSubstituteShares`·`gcd`(~60줄) → ~185줄. 여유.
- `inheritance-tax.ts`: A' derive(~6줄)·C 재사용(순증 최소). 800 경계 사전 확인(현재 분할 이력 多).

## 의존성

- `computeLegalShares` ← 신규 필드 직접 소비(내재). 전 호출처(besshi·gen-skip·allocation·inheritance-tax) 인자 무변경 자동 정합.
- `deriveSubstituteFlag` → orchestrator 전용. 순수 함수(복제본).
- 신규 import 순환 없음.

## 자가 검토 이력 (STEP 6·8)

### STEP 6 (1차) — 정정 4건
1. (오류 High) 재분배 산식 모호 → **통일 가중치 spouse=3·desc=2, S=3·hasSpouse+2·numDesc, commonExtra=Π(S_g), GCD 약분**. 검산 SH-1/SH-2 추가.
2. (모순 Medium) §19 두 안 혼재 → `spouseRatio = spouseShare.numerator/denominator`(computeLegalShares 재사용) 단일화.
3. (누락 Medium) SH-5 형제대습+배우자 기대 → §1003① 배우자 단독·조카 0 명시. §1003② 형수·매부도 spouse 역할.
4. (개선 Low) gcd는 tax-utils 재사용 우선.

### STEP 8 (2차 — 파급) — 정정 2건
5. (누락 High) 피대습자 엔트리 없음(결정-B) → base shares에 phantom 슬롯 부재. `slotNum_g`(배우자공동 1·2순위=2/그외=1)를 그룹 멤버로 직접 생성 명시.
6. (개선 Low) 다중그룹 상이 S → SH-4를 g1(S=4)·g2(S=5) commonExtra=20 검산 케이스로 강화.
