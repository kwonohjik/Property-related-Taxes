# 상속인별 직접배부 과세표준상당액 — §53 증여재산공제 자동 도출

> 작성 2026-06-01 · 세목 상속세(inheritance) · 영역 상속인별 배부(STEP 13 직접/간접배부)
> 이미지 53(현행 출력) → 이미지 54·55(교재 정답) 수정
> ※ 모든 주장은 신뢰 가능한 Pre-Do anchor 실측으로 검증. 13단계 자가 검토 1라운드 반영 (R1: P1~P9 정정).
>
> **[구현 후 갱신 2026-06-01] 채택안: 대안 A → 대안 B(STEP 0.5 전체 정규화)로 변경.**
> 구현 중 `derivePriorGiftTaxBase`를 STEP 0.5에서 `preGifts`로 한 번 정규화 → §19 배우자공제·§24 종합한도·STEP 13 배부가 **단일 진실** 공유. 회귀 위험(R1-P5)은 anchor로 무력화 확인: **giftTaxBase 명시 입력(BASE) vs 도출(STRIP)의 모든 perHeir·총세액이 완전 동일**(`heir-allocation-gifttaxbase-derive.test.ts` "도출=명시 정합" anchor) → 기존 §19·§24·comprehensive 82 anchor 무변경(inheritance 398 PASS, 전체 5,823 PASS). 결과: 이미지 53(배부표) + 시나리오 C(§19·§24 total)까지 동시 해소.

---

## 1. 배경 — 이미지 53 vs 54·55

상속인별 과세표준상당액 = **직접배부**(㉠) + **간접배부**(㉡) (집행기준 19-17-1, PDF 책 1864).

| 항목 | 이미지 53 (현행 앱) | 이미지 54·55 (교재 정답) | 차이 |
|---|---|---|---|
| 배우자 직접배부 | **760,000,000** | **160,000,000** (= 760M − 배우자공제 600M) | −600M |
| 장남 직접배부 | **1,500,000,000** | **1,450,000,000** (= 1,500M − 직계비속공제 50M) | −50M |
| 직접배부 계 | 2,960,000,000 | 2,310,000,000 (영리법인 700M 포함) | −650M |
| 간접배부 분자 | **1,215,000,000** | **1,865,000,000** | +650M |
| 배우자 과세표준상당액 계 | **1,373,245,917** | **1,101,319,862** | |

핵심: 이미지 53은 직접배부에 **증여재산가액(공제 전, `giftAmount`)** 을 사용 → §53 증여재산공제 650M(배우자 600M + 장남 50M)이 누락. 그 650M이 직접배부에 잘못 남아 간접배부 분자에서 빠져 양쪽이 동시에 어긋남.

> 산식 정합 검증: `직접배부 = 증여재산 과세표준(공제 후)`, `간접배부 분자 = taxBase − Σ직접배부 − corporateGiftTaxBase`. 직접배부 650M 과대 → 분자 정확히 650M 과소 (4,175M − 2,960M = 1,215M vs 4,175M − 2,310M = 1,865M). ✅

---

## 2. 근본 원인 (코드 + Pre-Do anchor 실측 확정)

### 2-1. 직접배부 도출 — `giftTaxBase ?? giftAmount`, §53 공제 자동도출 없음

- **위치**: `lib/tax-engine/inheritance-allocation.ts` → `sumPriorGiftsByDonee()` (237~264행)
  ```ts
  taxBaseByDonee.set(
    gift.doneeId,
    (taxBaseByDonee.get(gift.doneeId) ?? 0) + (gift.giftTaxBase ?? gift.giftAmount),
  );
  ```
- `directTaxBaseShare = taxBaseByDonee.get(heir.id)` (454행 `const directTaxBaseShare = giftTaxBase;`).
- **`giftTaxBase`가 없으면 `giftAmount`(공제 전)를 그대로 사용** → 760M.
- 이 함수는 `doneeId`만 키로 쓰고 `doneeRelation`·`heirs`는 **참조하지 않음** → §53 공제 자동도출 로직이 **존재하지 않음** (allocation 내 `doneeRelation`/`calcRelationDeduction` 사용 0건, grep 확인).

### 2-2. 상속세 모드 UI는 `giftTaxBase`를 채우지 않음

- `GiftRowEditor` (`components/calc/prior-gift/GiftRowEditor.tsx`): 상속세 모드(`showIsHeir`)는 `giftAmount`·`doneeId`·`doneeRelation`·세액만 입력. **`giftTaxBase`(⑤ 합산과세표준) 입력란은 증여세 모드(`showGiftPhaseA`) 전용**(545~555행).
- 따라서 상속세 계산에서 `priorGift.giftTaxBase`는 **항상 `undefined`** → 2-1의 `?? giftAmount` fallback이 **항상** 작동 → 직접배부에 §53 공제가 **구조적으로 누락** → 이미지 53.

### 2-3. `doneeRelation` 기반 §53 도출은 §19·§24에만 존재 (allocation 누락 = dual-truth)

`doneeRelation`(없으면 `giftAmount`) 기반 §53 도출은 두 곳에만 존재하고, **allocation 직접배부와 무관**:
- **§19 배우자 법정상속분**: `inheritance-tax.ts:266~275` `spouseGiftTaxBase` — `giftTaxBase 명시 → 사용; 없고 doneeRelation 有 → calcRelationDeduction; 둘 다 無 → giftAmount`.
- **§24 종합한도**: `computePriorGiftDeductionForLimit` (`inheritance-deductions.ts:476~507`) — `giftTaxBase 명시 → explicitTotal(건별); 없고 doneeRelation 有 → relationSums(관계 단위 합산); 둘 다 無 → 0`.
- **allocation**(`sumPriorGiftsByDonee`): doneeRelation 미참조 → **doneeRelation이 있어도 §53 미적용** → 760M.

> 동일 §53 도출이 §19·§24에 (서로 다른 단위로) 중복되고 allocation에는 누락 — dual-truth + 누락. [[feedback_ui_engine_dual_truth_avoidance]]

### 2-4. (정정 기록) "enrichPriorGiftTaxBase 이미 구현" 은 사실무근

조사 중 도구 출력 오염으로 `enrichPriorGiftTaxBase` 함수가 존재하는 것처럼 보였으나, `ls`·`grep` 재확인 결과 해당 파일·함수 **부재**. Pre-Do anchor가 정정. [[feedback_numeric_impact_verify_before_bug_claim]]

---

## 3. Pre-Do anchor 실증 + 3-시나리오 (R1-P1·P2·P3 정정)

종합사례 fixture(`comprehensive-case-pdf.fixture.ts`)에서 필드를 제거해 상속세 UI 상태를 모사하고 `calcInheritanceTax` 직접 호출. 결과(`heirAllocationResult.perHeir` + `result.taxBase`·`result.finalTax`):

| 케이스 | giftTaxBase | doneeRelation | 배우자 직접배부 | 간접배부 분자 | taxBase | **총 finalTax** | 배우자 과표상당액 |
|---|---|---|---|---|---|---|---|
| BASELINE 원본 | 명시 | 無¹ | **160,000,000** | 1,865,000,000 | 4,175,000,000 | **1,179,260,233** | 1,101,319,862 |
| **시나리오 B** | 제거 | **명시²** | **760,000,000** | **1,215,000,000** | 4,175,000,000 | **1,179,260,233** | 1,373,245,917 |
| **시나리오 C** | 제거 | 無 | 760,000,000 | (taxBase 변동) | (변동) | **1,330,991,657** | 1,528,269,869 |

¹ fixture 원본은 `doneeRelation` **0건** — giftTaxBase 명시로 정답 도출.
² doneeId→관계(spouse/lineal_descendant)를 명시 부여한 throwaway.

**확정 결론**:
- ★ **이미지 53 = 시나리오 B**: 간접배부 분자 1,215,000,000·배우자 과표상당액 1,373,245,917이 이미지 53과 **정확히 일치**. taxBase 4,175M·총 finalTax 1,179,260,233은 **정답과 동일**.
  - 즉 **이미지 53은 총 납부세액은 정확하나, 상속인별 배부표(직접/간접배부·과세표준상당액·상속인별 자진납부세액)의 분담 표시만 왜곡**된 상태.
- **버그 트리거 = `giftTaxBase` 부재** (doneeRelation 유무와 무관 — 시나리오 B·C 모두 직접배부 760M). allocation이 doneeRelation을 안 보기 때문.
- 시나리오 C(doneeRelation까지 無)는 §19·§24 공제도 0이 되어 **총세액까지 과대**(+151,731,424). UI 수증자 select 경로는 doneeRelation을 자동 채우므로(deriveDoneeRelationFromHeir) 통상 시나리오 B이나, 이력 자동입력·레거시 데이터는 C일 수 있음.
- 회귀 기준선: 종합사례 + heir-allocation-summary 기존 **82 anchor PASS** (giftTaxBase 명시 fixture라 1순위 보존 — 영향 없음).

### 3-1. 자기일관성 cross-check (R2 통합 비교)

| 수치 | §1 배경 | §3 시나리오 B(=이미지 53) | §6 AL-1 수정후(정답) | 일치 |
|---|---|---|---|---|
| 배우자 직접배부 | 760M → 160M | 760M | 160,000,000 | ✅ |
| 장남 직접배부 | 1,500M → 1,450M | (동일) | 1,450,000,000 | ✅ |
| 간접배부 분자 | 1,215M → 1,865M | 1,215,000,000 | 1,865,000,000 | ✅ |
| 배우자 과표상당액 | 1,373,245,917 → 1,101,319,862 | 1,373,245,917 | 1,101,319,862 | ✅ |
| 총 finalTax | (불변) | 1,179,260,233 | 1,179,260,233 | ✅ |

---

## 4. 수정 설계

### 4-1. 핵심 — `priorGift.giftTaxBase` 자동 도출 (doneeId 단위 §53 공제)

**신규 순수 헬퍼** (예: `lib/tax-engine/inheritance-prior-gift-taxbase.ts`):

```ts
export function derivePriorGiftTaxBase(gifts: PriorGift[], heirs: Heir[]): PriorGift[]
```

도출 우선순위 (인터뷰 Q1 "관계 자동 + 공제 수동 override", Q2 "doneeId 단위 합산 1회"):
1. `giftTaxBase` 명시 → 그대로 (수동 override·증여세 이력 보존)
2. 미설정 → §53 관계공제 자동 차감:
   - **doneeId 단위 grossByDonee 합산**
   - 관계 = `doneeRelation` 우선, 없으면 `heirs.find(id===doneeId).relation` → 관계 매핑
   - `calcRelationDeduction(관계, grossByDonee)` 1회 → 공제
   - 각 gift의 `giftTaxBase = max(0, giftAmount − 공제 비례배분)` (다건이면 비례, 마지막 건 잔액 흡수 [[feedback_floor_residual_absorption]])
   - 관계 도출 불가(legatee·corporate·orphan) → `giftAmount` 유지 (§53 대상 아님 — 정상)

**관계 매핑 소스 (R1-P4 정정)**: `deriveDoneeRelationFromHeir`는 `lib/calc/prior-gift-donee-derive.ts` 소속. 엔진→`lib/calc` import는 **선례 있음**(`inheritance-farming-deduction.ts:20`이 `@/lib/calc/farming-residence-check` import). 단 **orchestrator(`inheritance-tax.ts`)에는 "lib/calc import 금지" 관례 주석 3곳**(343·379·388). → 본 헬퍼는 deductions/ 류 순수 모듈이므로 **import 가능**하나, 단일 진실을 위해 둘 중 택1 (Do 결정):
  - (a) `deriveDoneeRelationFromHeir`를 `lib/tax-engine`으로 이동 + `lib/calc`는 re-export (import 방향 정상화, 권장)
  - (b) 헬퍼에서 직접 import (선례 동일)
  - (c) 관계 매핑 상수만 인라인 (최후)

**관계 매핑 한계 (R1-P6)**: `deriveDoneeRelationFromHeir`는 `child → lineal_descendant`(성인 5천)로만 매핑 — **미성년 자녀(2천만) 미구분**. 이는 §19·§24가 공유하는 **기존 한계**이며, allocation만 따로 정밀해질 수 없음(단일 진실). 미성년 정밀화는 별도 과제.

> §53 관계공제 한도(배우자 6억·직계비속 5천 등)는 `gift-deductions.ts:calcRelationDeduction` 재사용 (단일 진실). `DonorRelation` = spouse·lineal_ascendant_adult·lineal_ascendant_minor·lineal_descendant·other_relative.

### 4-2. 적용 위치 — 2안 (R1-P5: 회귀 위험 재평가 후 대안 격상)

**대안 A (권장) — allocation 한정**: STEP 13 직전 `cutoffFilteredGifts`에만 `derivePriorGiftTaxBase` 적용 후 `calcHeirAllocation`에 전달. §19·§24는 무변경.
- 이미지 53(시나리오 B) 완결: 배부표 직접/간접배부·과세표준상당액·per-heir 자진납부세액 교정. §19·§24가 이미 정확하므로 충분.
- **회귀 폭 최소** — 기존 §19·§24 anchor 무영향.
- 단, 시나리오 C(doneeRelation 無)에서 §19·§24의 total 오류는 미해소 → 별도 트랙.

**대안 B — orchestrator STEP 정규화**: STEP 4 직전 `input = { ...input, preGiftsWithin10Years: derivePriorGiftTaxBase(...) }`.
- 효과: §19·§24·allocation 동시 정합 (시나리오 C total도 교정).
- **회귀 위험 (R1-P5 + R2 실증)**: 정규화로 giftTaxBase가 채워지면 §24가 `explicitTotal`(건별, `Σ(giftAmount − giftTaxBase)`) 경로로 전환 — derive는 **doneeId(수증자) 단위** 합산인데 기존 §24 `relationSums`는 **관계(DonorRelation) 단위** 합산. ★ R2 실증: `section24-...test.ts:S24-4`가 "**doneeRelation=spouse 2건(서로 다른 회차)을 관계 단위로 합산 → 한도 6억 1회 = 600M**"를 anchor. 만약 그 2건이 **다른 doneeId(예: 배우자 1명이지만 데이터상 별도 id)** 라면 derive는 doneeId 단위로 각각 한도 적용 가능 → 결과 달라짐. (배우자는 통상 1명이라 동일 id로 합산되지만, 동일관계 복수 수증자(자녀 2명 등)는 관계 합산과 수증자 합산이 **법적으로 다름** — 수증자 단위가 정답. 즉 기존 §24가 오히려 부정확할 수 있으나 본 PR 범위 밖.) → 기존 S24-4 등 anchor 재검토 필수.
- **단 대안 A는 §24·§19 코드를 건드리지 않으므로 위 위험과 무관** (비대칭 — A 안전).

→ **Do 1차는 대안 A로 이미지 53 완결** (§24·§19 무변경, 회귀 0). 시나리오 C(§19·§24 total) 교정 및 §24 도출 단위 정합은 회귀 전수 확인 후 대안 B 별도 PR.

### 4-3. (선택) UI override 입력란 — 인터뷰 Q1 보강 (Phase 2)

상속세 모드 `GiftRowEditor`에 "증여재산공제(수동, 선택)" 입력란 → `giftTaxBase = max(0, giftAmount − 입력공제)`. 비정형 공제(§53의2 혼인·출산, §54 재해손실, 10년 내 소진분)용. PriorGift에 `giftTaxBase` 필드 이미 존재(① 폼·⑨ Zod 충족) → 신규는 ⑤ 위젯·⑦ 결과·⑧ validate. **Phase 1 머지 후 별도 PR**.

---

## 5. 케이스 인벤토리 (전수 enumerate · R1-P2 현행 원인 통일)

> 현행 직접배부 760M/1,500M의 원인은 모두 **"allocation이 doneeRelation·heirs 미참조 → giftTaxBase 없으면 giftAmount"** (단일 원인). doneeRelation 유무 무관.

> derive 우선순위(§4-1) = ① giftTaxBase 명시 → ② doneeRelation → ③ doneeId→relation → ④ 도출불가 시 giftAmount.

| # | giftTaxBase | doneeRelation | doneeId | Heir.relation | 현행 직접배부 | 수정 후(대안 A) | derive 경로 |
|---|---|---|---|---|---|---|---|
| 1 | 명시 | — | — | — | giftTaxBase | giftTaxBase (무변경) | ① |
| 2 | 없음 | spouse | 有 | — | **760M ❌** | 160M ✅ | ② doneeRelation |
| 3 | 없음 | 없음 | spouse | spouse | **760M ❌** | 160M ✅ | ③ doneeId→relation |
| 4 | 없음 | 없음 | son | child | **1,500M ❌** | 1,450M ✅ | ③ doneeId→relation |
| 5 | 없음 | 없음 | corp | corporate | giftAmount | giftAmount (정상, §53 대상 아님) | ④ (관계 undefined) |
| 6 | 없음 | 없음 | 없음 | — | giftAmount(배부 제외) | giftAmount(배부 제외) | ④ (doneeId 無) |
| 7 | 없음 | 없음 | orphan | (삭제됨) | giftAmount | giftAmount | ④ (Heir 매칭 실패) |
| 8 | 없음 | 없음 | son(2건) | child | giftAmount×2 ❌ | doneeId 합산 §53 1회 ✅ | ③ + 합산 |

> ★ 케이스 2·3은 동일 결과(현행 760M → 160M)이나 derive 경로만 다름(②/③). 둘 다 대안 A의 derive가 처리.
> ※ 본 fixture(케이스 2)는 doneeRelation 0건이므로 실제로는 케이스 3 경로(③)로 처리됨 — 케이스 2는 이력 자동입력 등 doneeRelation이 채워진 입력용.

---

## 6. anchor 계획 (Do 단계 — 영구 · R1-P7·P8 + R2 보강)

**R2 사실 (실측)**:
- 기존 `comprehensive-case-pdf.test.ts`가 **정답 배부값을 이미 anchor**: 배우자 directTaxBaseShare 160,000,000 / indirect 941,319,862 / taxBaseShare 1,101,319,862 (244~246행), 장남 direct 1,450,000,000 / indirect 208,469,476 (265~267행), 차남(son2) indirect **554,849,527** (288~290행), 손녀(granddaughter) indirect **160,361,135** (309~310행). 단, **giftTaxBase 명시 fixture로** 통과 중.
- fixture priorGift `doneeId`는 **corporate·spouse·son 3건뿐** → **차남·손녀는 사전증여 없음 = 간접배부 only**. 이들의 정답값은 직접 derive가 아니라 **indNum 1,215M→1,865M 변화**로 따라 교정됨.
- 즉 신규 anchor의 핵심은 "**giftTaxBase를 제거(실제 UI 상태)해도 derive가 위 정답값을 동일 재현**"하는 것.

`__tests__/tax-engine/inheritance/` 에 추가. **fixture는 doneeRelation 0건이므로, anchor는 giftTaxBase 제거 + doneeId→관계 매핑(derive)으로 구성**:

1. **AL-1 (메인 — 실제 UI 상태에서 정답 교정)**: 시나리오 B 입력(fixture에서 giftTaxBase만 제거; doneeId는 유지). 수정 전(버그) 배우자 direct 760M·indNum 1,215,000,000·배우자 과표상당액 1,373,245,917 → **수정 후 = 기존 comprehensive 정답값과 동일**: 배우자 direct 160,000,000·indirect 941,319,862·과표상당액 1,101,319,862, 장남 direct 1,450,000,000, indNum 1,865,000,000, 차남 indirect 554,849,527, 손녀 indirect 160,361,135. **matcher는 기존 I-06~I-19와 동일** — 대부분 `toBe`이나 **장남 indirect(208,469,476)·자진납부세액들은 ±1원 tolerance**(PDF round-half-up 오기·T10 잔액흡수 +1원) (D1 실측).
2. **AL-2 회귀**: 케이스 #1 — giftTaxBase 명시(기존 fixture) → 무변경 (기존 82 anchor가 곧 회귀 가드).
3. **AL-3 corporate (R2-C + D1)**: 케이스 #5 — corporate는 derive에서 관계 undefined → giftAmount(=giftTaxBase 700M) 유지. 대안 A는 `corporateGiftTaxBase`(line 542)를 별도 산정하므로 영향 없음. **검증값은 `corporate.finalTax === 0`**(direct 700M echo는 기존 테스트에 별도 anchor 없음 — finalTax 0 + corporateExemption으로 검증).
4. **AL-4 다건**: 케이스 #8 — 동일 doneeId(예: son) 2건, giftTaxBase 제거 → §53 1회 합산 + 비례 배분(잔액 흡수).
5. **AL-5 orphan**: 케이스 #7 — doneeId가 heirs에 없음 → 크래시 없이 giftAmount 유지.
6. **AL-6 시나리오 C (대안 B 채택 시만)**: doneeRelation·giftTaxBase 모두 無 → 대안 A는 total 1,330,991,657(미해소·문서화), 대안 B는 total 1,179,260,233(교정).
7. **통합**: 대안 A는 총 finalTax 무변경(시나리오 B = 1,179,260,233), per-heir 자진납부세액만 정답 일치 확인. 대안 B는 시나리오 C의 총 finalTax도 정답 일치.

---

## 7. 검증·회귀 (R1-P8)

- `npx vitest run __tests__/tax-engine/inheritance/`
- `npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts __tests__/tax-engine/inheritance/heir-allocation-summary-table.test.ts __tests__/tax-engine/inheritance/section24-gift-deduction-autoderive.test.ts __tests__/tax-engine/inheritance/spouse-deduction-fix.test.ts`
- `npm test` (전체 — 공유 모듈)
- `npx tsc --noEmit`
- **대안 B 채택 시 추가**: §24 도출 단위(관계→수증자) 변경에 따른 anchor 변동 전수 확인 (R1-P5).
- **브라우저 E2E** (`e2e/*.spec.ts`): 상속세 마법사 → 수증자 select + 증여가액만 입력(giftTaxBase 미입력) → 결과 배부표 직접배부가 §53 공제 반영(160M)·배우자 과표상당액 1,101,319,862 확인. [[feedback_browser_verify_with_playwright]]

---

## 8. 위험·메모 (R1-P9 정정)

- **§53 공제 자동도출 로직은 현재 없음 → 신규 작성** (기존 함수 수정 아님).
- **심각도 (R1-P3)**: 이미지 53(시나리오 B)은 **총 납부세액 정확, 상속인별 배부표 표시만 왜곡**. 시나리오 C(doneeRelation 無)는 총세액까지 과대(+151,731,424). 충실도(표시) vs numeric(총세액) 분리 [[feedback_numeric_impact_verify_before_bug_claim]].
- **적용 범위 (R1-P5)**: 대안 A(allocation 한정)는 이미지 53 완결 + 회귀 최소. 대안 B(정규화)는 §24 도출 단위 변경으로 회귀 폭 큼 → 시나리오 C 교정이 필요할 때만 전수 확인 후.
- **import 방향 (R1-P4)**: 엔진→`lib/calc` 선례 있음(farming). orchestrator만 금지 관례 → 헬퍼는 deductions/류로 두거나 deriveDoneeRelationFromHeir 엔진 이동.
- **미성년 자녀 공제 (R1-P6)**: deriveDoneeRelationFromHeir는 성인 기준(5천)만 — §19·§24와 동일 한계. 별도 과제.
- **§19 배우자공제도 doneeRelation 無 시 giftAmount fallback** — 시나리오 C의 일부. 대안 B로 동시 해소되거나 후속 분리.
