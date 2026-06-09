# 대습상속인(민법 §1001·§1003②·§1010) 입력·법정상속분 반영 계획서

> 대습상속인(피대습자를 갈음하는 직계비속·배우자, 즉 손자녀·며느리·사위)을 **실제 상속인**으로
> 입력받아 법정상속분(§1010)을 부여하고, 납세의무자(§3의2①)·배부(⑪)·증여세액공제(⑫)·
> 배우자공제(§19)·부표2에 정합되도록 한다.
>
> 선행: 비상속인 사전증여 수증자 오분류 수정(PR 머지 완료) — `isInheritanceTaxPayer(heir, legalShares)`
> 가 `computeLegalShares.shares` 멤버십을 납세의무자 단일진실로 사용. **본 계획은 그 단일진실의
> 입력 쪽(누가 shares 멤버인가)을 확장**한다.

- 작성일: 2026-06-09
- 범위: 대습상속인의 **법정상속분 반영**(입력 모델 + `computeLegalShares` 확장). §27 할증배제·§23의2 동거주택은 기존 구현 보존·정합만.
- 상태: **미확정 3건 확정 완료**(§9, 2026-06-09 인터뷰) → 다음: 13단계 자가검토 → Do.
- **확정 결정**: A=신규 단일화 / B=그룹키 방식 / C=validation 차단.

---

## 1. 현황 (실측)

### 1-1. 현재 `isSubstituteInheritance`는 "표시·배제 플래그"일 뿐 법정상속분 미반영

| 소비처 | file:line | 용도 |
|---|---|---|
| §27 세대생략 할증 배제 | `inheritance-generation-skip.ts:118` | `isSubstituteInheritance`면 rate=0·surcharge=0 (PR #38) |
| §23의2 동거주택 대습배우자 | `inheritance-cohabit-helpers.ts:103-108` | `relation="other" + isSubstituteInheritance=true`(2022~) 적격 판정 |
| Zod | `property-valuation-input.ts:435` | optional boolean |
| UI 토글 | `HeirComposition.tsx:323-330` | **`isLegatee && isGenerationSkipBeneficiary` 게이트 하**에서만 노출 |

→ 현재 손자 대습은 **`relation="legatee"`(수유자)로 모델링**되어 있다. `computeLegalShares`는 `relation==="legatee"` 를 **제외**(`inheritance-legal-share.ts:35`)하므로, 대습 손자는 법정상속분 0 — **유증분(legatee)으로만** 취급. 이는 "유증액 + §27 할증배제"를 위한 우회 모델이지 법적으로 정확한 대습상속(실제 상속인) 표현이 아니다.

→ 대습 며느리·사위는 `relation="other"`. 선행 PR 이후 `isInheritanceTaxPayer=false` → ⑪·⑫ 제외. **진짜 대습상속인이라면 상속인이어야 하는데 비상속인으로 처리**되는 것이 본 계획이 메우는 갭.

### 1-2. `computeLegalShares`는 relation flat — 대습 미지원

`inheritance-legal-share.ts:33-90`: `child / lineal_ascendant / sibling / other` 그룹으로 평면 분류 후 §1009 비율 산정. **피대습자(상속개시 전 사망한 자녀·형제) 슬롯**·**대습 그룹 내 §1010② 재분배** 개념 없음.

### 1-3. 법정상속분을 쓰는 별도 경로 2곳 (★ 대습 인지 필요)

| 경로 | file:line | 현재 | 대습 영향 |
|---|---|---|---|
| §19 배우자공제 법정지분 | `inheritance-tax.ts:353-360` | `childCount = heirs.filter(relation==="child")` 직접 카운트 (computeLegalShares 미사용) | 피대습자(사망 자녀)의 **슬롯도 coheirCount에 산입**되어야 배우자 지분이 정확. **computeLegalShares 재사용으로 dual-truth 해소**(C) |
| 부표2 작성 대상 | `besshi-buppyo-2-data.ts:143,149` | `isStatutoryHeir` 필터(`heir-allocation-summary.ts:74-79`: legatee·corporate·isHeir===false만 제외) + `computeLegalShares` | ★ **실측 정정**: `isStatutoryHeir(other)`는 이미 true → 대습 며느리는 **필터에 이미 포함**. 갭은 `computeLegalShares` numerator=0뿐 → shares 채워지면 **자동 표시**(필터 변경 불요) |

### 1-4. 그 외 `computeLegalShares` 소비처 (자동 정합)

- `inheritance-allocation.ts:279`·`-deductions.ts:48,104`: 미입력 자산·채무·장례비 법정상속분 배분 → 대습상속인이 shares 멤버가 되면 **자동으로** 배분 대상.
- `inheritance-generation-skip.ts:78`: 세대생략 분모 — 대습 손자가 heir가 되면 영향(§27 단서로 할증 자체는 배제되나 분모 산입은 확인 필요).

---

## 2. 법령 근거 (KoreanLaw MCP 검증 2026-06-09, 민법 mst=284415 시행 2026-03-17)

- **§1001 대습상속**(축자): "전조제1항제1호와 제3호에 의하여 상속인이 될 **직계비속 또는 형제자매**가 상속개시전에 사망하거나 …상속인이 되지 못한 때에는 **그 직계비속**이 …순위에 갈음하여 상속인이 된다." → 1순위(직계비속)·3순위(형제자매)만 대습. **2순위(직계존속)·배우자 본인은 대습 없음.**
- **§1003② 배우자 대습**(축자): "제1001조의 경우에 상속개시전에 사망한 사람의 **배우자**는 동조의 …상속인과 동순위로 공동상속인이 되고 그 상속인이 없는 때에는 단독상속인이 된다." → 며느리·사위 대습.
- **§1010① 대습상속분**(축자): "…갈음하여 상속인이 된 사람의 상속분은 사망하거나 상속인이 되지 못한 사람의 **상속분에 의한다**." → 대습상속인 그룹 = 피대습자 1인분.
- **§1010② **(축자): "…직계비속이 **수인인 때에는** 그 상속분은 …**상속분의 한도에서 제1009조에 의하여** 이를 정한다. **제1003조제2항의 경우에도 또한 같다.**" → 대습 그룹 내부(손자녀 여럿 + 며느리/사위)는 피대습자 몫 한도에서 §1009 재분배(배우자 1.5 : 직계비속 1).
- **§1009 상속분**: 동순위 균분(①), 배우자 5할 가산(②).

**핵심 산식 (예: 자녀2 생존 + 자녀1 사망(피대습) → 며느리+손자1)**:
- 그룹 슬롯: 배우자 3 : 자녀슬롯 2씩(생존2 + 피대습1 = 3슬롯) → 분모 `2×3+3 = 9`. 피대습 슬롯 = 2/9.
- 대습 내부(§1010②): 며느리 1.5 : 손자 1 → 며느리 = 2/9 × 3/5, 손자 = 2/9 × 2/5.
- 공통분모 정수화: 전체 ×5 → 분모 45. 생존자녀 10/45씩, 배우자 15/45, 며느리 6/45, 손자 4/45. Σ=45. ✓

---

## 3. 케이스 인벤토리 (Do 진입 전 필수 — §1000/§1010 분기 전수)

| ID | 입력 | 기대 법정상속분 | 판정 |
|---|---|---|---|
| SH-1 | 배우자 + 자녀2생존 + 피대습자녀1(며느리1+손자1) | 배우자15/45·생존자녀10/45씩·며느리6/45·손자4/45 | 핵심 |
| SH-2 | 피대습 직계비속만(배우자 대습 없음) — 손자2 | 피대습슬롯 §1009① 균분(손자 각 1/2 of 슬롯) | §1010② 균분 |
| SH-3 | 며느리 단독 대습(피대습자녀의 직계비속 없음) | §1003② 단독 — 피대습 슬롯 전부 며느리 | 단서 |
| SH-4 | 자녀 전원 사망 → 손자녀만(전원 대습) | 손자녀가 1순위 갈음, 배우자와 공동 | 다중 그룹 |
| SH-5 | 형제자매 대습(3순위) — 피대습 형제의 자녀(조카) | 형제 슬롯 갈음(배우자는 3순위와 비공동 §1003①) | 3순위 대습 |
| SH-6 | 피대습자 입력됐으나 대습상속인 0명 | 슬롯 소멸? or 그룹 재분배? → **§9 미확정-C** | 경계 |
| SH-7 회귀 | 대습 無 일반(자녀2+배우자) | 기존 §1009 불변 | 회귀 |
| SH-8 회귀 | 기존 §27 손자 대습(legatee+genSkip+substitute) | **기존 동작 보존**(legatee 우회 레거시) | 회귀 |
| SH-9 | 대습 며느리 사전증여 보유 | `isInheritanceTaxPayer=true`(shares 멤버) → ⑪·⑫ **정상 포함**(선행 PR과 정합) | 정합 |
| SH-10 | §19 배우자공제 — SH-1 구성 | coheirCount=3(피대습 슬롯 포함) → 배우자지분 1.5/4.5 | 별도경로 |
| SH-11 회귀 | §23의2 대습배우자 며느리(2022~) | 5-0 derive로 isSubstituteInheritance 자동 → G5 적격 보존 | 회귀 |

---

## 4. 입력 모델 (권장안 — §9 미확정-B 확정 후 동결)

### 권장: 그룹키 방식(피대습자 가상 엔트리 없이) — "A2"

`Heir`에 신규 필드 3종(전부 optional, 하위호환):

```ts
/** 대습상속(민법 §1001) 그룹 식별자. 같은 피대습자를 갈음하는 대습상속인들이 공유.
 *  존재 시 이 Heir는 대습상속인 — computeLegalShares가 피대습 슬롯을 §1010②로 재분배. */
substituteGroupId?: string;
/** 피대습자의 원래 상속순위 (§1001: 직계비속=1순위 또는 형제자매=3순위만 대습 가능).
 *  computeLegalShares가 어느 그룹 슬롯을 차지하는지 결정. */
substituteForRelation?: "child" | "sibling";
/** 대습 그룹 내 역할 — §1010②/§1009 재분배 비율.
 *  "spouse"(며느리·사위, §1003② 1.5가산) / "descendant"(손자녀·조카, 균분). */
substituteRole?: "spouse" | "descendant";
```

- 피대습자(사망자)는 **Heir 엔트리로 만들지 않음** → 다운스트림 루프(perHeir 배부·납세의무자·부표2)에서 "사망자 제외" 특례 불필요. **선행 PR의 `isInheritanceTaxPayer`와 자동 정합**(대습상속인은 shares 멤버 → true).
- 피대습 슬롯 수 = `substituteGroupId` distinct 개수(per `substituteForRelation`). 생존 자녀 수 + 대습 그룹 수 = 총 자녀슬롯.
- 대습상속인 `relation`: 며느리·사위 = `other`, 손자녀·조카 = `child`? → **§9 미확정-B**(relation 처리). 권장: relation은 표시용 자연 그대로(며느리=other, 손자=other 또는 신규), **그룹 판정은 substituteGroupId 단독**(relation 무의존, enum substring 매칭 금지 메모리 `feedback_enum_substring_match_forbidden`).

### 기각: 피대습자 명시 엔트리("A1")

피대습자를 `isPredeceased=true` Heir로 추가 → 신고서엔 자연스러우나, **모든 다운스트림 루프에 "사망자 0지분·납세의무 제외" 가드 추가** 필요(perHeir·⑪·⑫·부표2·인적공제). 회귀 위험 큼. 미확정-B에서 재론 여지.

---

## 5. 알고리즘 — `computeLegalShares` 확장

### 5-0. 역할 분리 (★ STEP 3 정정 — 혼재 해소)

대습은 **두 독립 메커니즘**으로 처리:

1. **분배 확장 = `computeLegalShares` 내재** (5-1·5-2). `substituteGroupId` 등 필드를 함수가 직접 소비 → besshi(`lib/calc`)·gen-skip·allocation 등 **모든 호출처가 인자 변경 없이 자동 정합**. 플래그 의존 없음.
2. **플래그 파생 = `deriveSubstituteFlag(heirs)` orchestrator 1회** (결정-A). `substituteGroupId` 보유 heir에 `isSubstituteInheritance=true` 자동 set — **§27/§23의2 등 `isSubstituteInheritance`를 직접 읽는 소비자 전용**. `inheritance-tax.ts` 진입 직후 입력 **복제본**에 set(원본 mutation 금지), 이후 모든 소비(gen-skip·cohabit·allocation)에 파생본 전파.

→ 기존 §23의2(`inheritance-cohabit-helpers.ts:103` `relation="other"+isSubstituteInheritance`)·§27 단서가 신규 그룹 입력에도 자동 정합.

### 5-1. 슬롯 산정 (대습 그룹 = 1슬롯)

```
# ★ substituteGroupId 보유 heir는 normal eligible에서 제외 (4촌 방계 others 그룹 falling 차단)
eligibleNormal = eligible.filter(h => h.substituteGroupId == null)
substituteGroups = group (substituteGroupId != null) heirs by substituteGroupId
childSlots   = eligibleNormal child 수 + (substituteForRelation==="child" 인 그룹 수)
siblingSlots = eligibleNormal sibling 수 + (substituteForRelation==="sibling" 인 그룹 수)
```
- 최선순위 그룹 결정(기존 `:50-63` 로직)에서 `children.length` → `childSlots`, `siblings.length` → `siblingSlots`로 교체.
- 배우자 공동 여부(§1009② 5할 가산)는 **1·2순위 슬롯 존재**로 판정(기존 동일). 2순위(직계존속)는 대습 없음 — ascendant 슬롯은 생존자만.

### 5-2. 슬롯 → 대습 그룹 내부 §1010② 재분배 + 공통분모 정수화

- 기존은 단일 분모. 대습 그룹마다 내부 sub-denominator(예 §1003② spouse 포함 시 5, descendant n명 균분 시 n) 발생 → **전체 공통분모 = base × Π(sub-denominators)** 또는 LCM. 정수 연산 정책(`Math.round` 금지·BigInt 안전)·잔액 흡수(메모리 `feedback_floor_residual_absorption`) 준수.
- 산식 (SH-1): base 분모 9, 피대습 슬롯 numerator 2, sub-denom 5(며느리3+손자2) → 전체 ×5 = 45. 생존슬롯·배우자도 ×5.
- 공통분모(★설계 B.4 정밀화): 그룹 내부 **통일 가중치** spouse=3·desc=2 → `S_g=3·hasSpouse+2·numDesc`, 전체 `commonExtra=Π(S_g)`, 멤버 numerator=`slotNum_g×weight×(commonExtra/S_g)`, 비대습·base ×commonExtra, 최종 GCD 약분. (slotNum_g=배우자공동 1·2순위 슬롯 2 / 그외 1)
- **신규 헬퍼 분리 검토**: 슬롯 산정·재분배를 `inheritance-legal-share.ts` 내 별도 함수(`expandSubstituteShares`)로. 800줄 정책·기존 단순 경로 회귀 안전(대습 그룹 0이면 기존 분기 그대로).

### 5-3. `LegalShareResult.shares` 출력

대습상속인 각자의 `{heirId, numerator}`(공통분모 기준)를 shares에 push. → 이후 `isInheritanceTaxPayer`(shares 멤버)·`distributeByLegalShares`(자산·채무·장례비 배분)·부표2가 **자동 정합**.

---

## 6. 변경 범위 — 14 동기화 지점 관점

| Phase | 파일 | 작업 | 동기화점 |
|---|---|---|---|
| A 타입 | `types/inheritance-gift.types.ts` | `substituteGroupId`·`substituteForRelation`·`substituteRole` 3필드 | 엔진 input |
| A' 선처리 | `inheritance-tax.ts` 진입 | `deriveSubstituteFlag(heirs)` — substituteGroupId→isSubstituteInheritance(복제본), 파생본 전파 | — |
| B 엔진 핵심 | `inheritance-legal-share.ts` | 슬롯 산정 + §1010② 재분배 + 공통분모 정수화(`expandSubstituteShares` 헬퍼). **함수 내재 → 전 호출처 자동 정합** | — |
| C §19 별도경로 | `inheritance-tax.ts:353-360` | `childCount` 직접카운트 → **computeLegalShares 재사용**으로 대습 슬롯 자동 포함(dual-truth 해소) | — |
| D Zod | `validators/property-valuation-input.ts` (heirSchema, `:417` 부근 — `isSubstituteInheritance:435` 인접) | 신규 3필드 optional + superRefine(substituteGroupId 있으면 substituteForRelation·Role 필수) | ⑨⑩⑫ |
| E API 변환 | `lib/calc/inheritance-api.ts:81` | heirs **통째 spread** 확인됨(`:80` 주석 "heirs 통째 spread") → 신규 3필드 strip 0, 변경 불요 | ④⑬⑭ |
| F UI 입력 | `HeirComposition.tsx` | 대습 그룹 입력 UI(그룹 묶기·원래순위·역할 선택). 기존 §27 legatee 토글과 안내 분리 | ①②③⑤ |
| G 결과/부표2 | `besshi-buppyo-2-data.ts` | ★ 변경 불요 — `isStatutoryHeir(other)` 이미 true·computeLegalShares 내재 확장으로 numerator 자동. **회귀 확인만** | ⑦ |
| H 정합 | `inheritance-cohabit-helpers.ts`·`inheritance-generation-skip.ts` | **변경 불요** — 5-0 derive로 플래그 자동 정합. 결정-A 단일화 + SI/G5 회귀 0 확인 | — |
| I anchor | `__tests__/tax-engine/inheritance/` | SH-1~10 | — |

> ⚠️ 800줄: `inheritance-legal-share.ts` 현재 125줄 — 여유. `inheritance-tax.ts`는 이미 분할 이력 多 → A'·C 작업은 +행 최소화(헬퍼 import·computeLegalShares 재사용).

---

## 7. 기존 §27·§23의2 대습 모델과의 정합 (★ 위험 집중)

- 현행 손자 대습 = `legatee + isGenerationSkipBeneficiary + isSubstituteInheritance`. **신규 모델은 손자 대습을 실제 상속인(shares 멤버)으로** 표현 → 두 모델 공존 시 **이중 계산 위험**(legatee 유증분 + 대습 법정상속분).
- ★ **§27 메커니즘 정정(실측 `:104-120`)**: gen-skip 루프는 `isGenerationSkipBeneficiary` 게이트 하에서만 진입(`:108` 부근 continue). 신규 모델 대습 손자는 **genSkip 미설정 → 할증 경로 자체 미진입 → surcharge=0**(단서 배제 분기 불요, 다른 메커니즘·같은 결과). 기존 `legatee+genSkip+substitute` 경로는 **레거시 호환 보존**(SI-01~07 회귀 0).
- 동거주택(`inheritance-cohabit-helpers.ts:103`)은 `relation="other"+isSubstituteInheritance`(며느리)를 적격 판정 → 5-0 `deriveSubstituteFlag`가 substituteGroupId→플래그 자동 set하므로 **계약 자동 유지**.
- §27 할증배제(`:118`)는 `isSubstituteInheritance` 단독 판정 → 5-0 derive로 자동 set(레거시 수동 입력도 보존).

→ **결정-A 확정**(§9): 신규 단일화. 기존 anchor(SI-01~07·G5-SUBST-2022) 회귀 0이 강제 조건.

---

## 8. anchor 테스트 계획 (Pre-Do 우선 — 메모리 `feedback_pre_anchor_verification`)

- **SH-1·SH-2 우선 작성·실행**: 현행 `computeLegalShares`가 대습 미반영(며느리·손자 shares 부재)임을 RED로 실증 → 확장 후 GREEN.
- SH-3·4·5 분기 / SH-6 경계(미확정-C 결정 종속) / SH-7·8 회귀 / SH-9 선행 PR 정합 / SH-10 §19 배우자공제.
- 회귀: 기존 `section27-substitute.test.ts`·`cohabit-eligible-relation.test.ts`·`heir-allocation-summary-table.test.ts` 전건 통과.
- 법정상속분 anchor는 **공통분모 정수 numerator 직접 toBe()**(분수 비교 금지, 정수 연산 정책).

---

## 9. 결정 항목 (2026-06-09 인터뷰 확정)

### 결정-A — 통합 방식 = **신규 단일화** ✅
대습상속인을 모두 **실제 상속인(shares 멤버)으로 단일 표현**. `isSubstituteInheritance`는 §27 할증배제·§23의2 동거주택용 **파생 플래그**로 유지하되 **그룹 필드(`substituteGroupId`)에서 자동 도출**(수동 입력 의존 제거). 기존 손자 대습의 `legatee` 우회는 **deprecated** — 단, 기존 anchor(SI-01~07·G5-SUBST-2022) **회귀 0이 강제 조건**. 마이그레이션: legatee+genSkip+substitute 입력은 신규 그룹 모델로 안내·전환(Do에서 호환 경로 설계).

### 결정-B — 입력 모델 = **그룹키 방식(A2)** ✅
피대습자 가상 엔트리 없음. `substituteGroupId`·`substituteForRelation`·`substituteRole` 3필드로 표현. relation은 표시용(며느리=other 유지, 손자녀·조카=other 또는 표시 전용), **그룹 판정은 substituteGroupId 단독**(relation substring 매칭 금지). UI는 대습 그룹으로 묶어 입력.

### 결정-C — 빈 그룹 = **validation 차단** ✅
대습 그룹(`substituteGroupId` 존재)엔 대습상속인 **≥1명 강제**. 0명이면 검증 오류로 차단 — 자동 안분 fallback 금지 정책 부합. (SH-6는 차단 케이스로 anchor 작성.)

---

## 10. 리스크

- **공통분모 정수화 정밀도**: 다중 대습 그룹 LCM·floor 잔액 흡수. BigInt 안전(메모리 `feedback_safemul_decimal_apportion_precision`·`feedback_floor_residual_absorption`).
- **이중계산(§7)**: legatee 우회 ↔ 신규 법정상속분 공존. 미확정-A로 차단.
- **§19 별도경로(C)**: dual-truth — computeLegalShares 재사용으로 해소 권장.
- **2순위·배우자 비대습**: §1001은 1·3순위만 — 직계존속·배우자 본인 대습 입력 차단(validation).
- **회귀 최우선**: 선행 PR(`isInheritanceTaxPayer`)·§27·§23의2 anchor 전건 보존.

---

## 11. 진행 순서 (제안)

1. 미확정-A·B·C 결정(인터뷰) → 본 계획 동결.
2. `plan-design-self-review-loop` 13단계 → `.engine.design.md`·`.ui.design.md` 생성.
3. `pre-do-anchor-verification`(SH-1·SH-2 RED 확보).
4. `single-response-do-execution` 단일 응답 완주(Phase A~I) → ship.
