# #2a 혼인 합가 주택수 차감 — 엔진 설계 (Layer 2)

> 계획서: `docs/00-pm/multi-house-surcharge-2a-marriage.plan.md` / worktree `feat/mh-2a` (base b886b42b)
> 근거 실측: `multi-house-surcharge.ts`(오케스트레이터 L128-270) · `multi-house-surcharge-exclusion.ts`(L156-166 배제2) · `multi-house-surcharge-count.ts`(L367-511 countEffectiveHouses) · `types/multi-house-surcharge.types.ts` · 법령 MST 286211 본문
> 범위: 혼인 합가 중과 처리의 **순수 엔진 레이어**(타입·상수·알고리즘·시그니처·anchor). UI/14지점은 `.ui.design.md`.

---

## 1. 케이스 인벤토리

| ID | 입력(주택만, 권리 無) | originalCount | Step 1.5 | 최종 effectiveCount | 기대 결과 | 근거 |
|---|---|---|---|---|---|---|
| C-소멸 | 본인1(양도)+배우자2·혼인2년전·신규취득無·조정 | 3 | 배우자2 차감 | 1 | 중과 없음(Step 3) | §167의3⑨ |
| C-2잔존 | 본인2+배우자1(양도=본인)·혼인2년전·조정 | 3 | 배우자1 차감 | 2 | `multi_house_2`(전면배제 ✗) | ⑨+§155비해당 |
| C-단서 | C-소멸 + 혼인후 1채 취득(취득일<양도일) | 3 | 미적용(단서) | 3 | `multi_house_3plus` | ⑨ 단서 |
| C-5y | 본인1+배우자2·혼인6년전·조정 | 3 | 미적용(5년 경과) | 3 | `multi_house_3plus` | ⑨ 5년 |
| C-5y경계 | 본인1+배우자2·혼인일+정확히5년 양도 | 3 | 적용(이내) | 1 | 중과 없음 | `<=addYears(,5)` |
| C-차감0 | 본인3(양도)+배우자0·혼인2년전·조정 | 3 | 차감0(배우자주택無) | 3 | `multi_house_3plus` | flag false 유지 |
| C-155-3y | 1+1=2(양도)·혼인3년전·조정 (=MH-07 첫째) | 2 | 미발동(≥3 아님) | 2 | 전면배제 marriage_merge | §155⑤ |
| C-155-7y | 1+1=2·혼인7년전·조정 | 2 | 미발동 | 2 | 전면배제(7<10) | §155⑤ 10년 |
| C-155-11y | 1+1=2·혼인11년전·조정 (=MH-07 둘째 정정) | 2 | 미발동 | 2 | `multi_house_2` | §155⑤ 10년 초과 |
| C-155-10y경계 | 1+1=2·혼인일+정확히10년 | 2 | 미발동 | 2 | 전면배제(이내) | `<=addYears(,10)` |
| C-4to3 | 본인3+배우자1(양도=본인)·혼인2년전·조정·잔여2채 일반 | 4 | 배우자1 차감 | 3 | Step 5 통과(⑩ 미해당) → `multi_house_3plus` | ⑨→3 잔존 |

> C-차감0·C-4to3은 STEP 6 재검토 신규 식별(flag false 유지·Step 5 상호작용). 계획서 §5에 역동기화(STEP 10).

---

## 2. 타입 변경 (`types/multi-house-surcharge.types.ts`)

```ts
// HouseInfo (L30~) — 신규 1필드
export interface HouseInfo {
  // ...기존...
  /**
   * #2a §167의3⑨ 혼인 차감용 — "양도자의 배우자 단독 보유" 주택 여부.
   * 규약: 양도 주택(sellingHouseId)=양도자 소유(false 전제). 그 외 주택만 배우자 소유 시 true.
   * 3주택↑ + marriageMerge 발동 시에만 의미. 미제공(기본 false) = 본인 소유로 간주(차감 대상 아님).
   */
  isSpouseOwned?: boolean;
}

// ExcludedHouse.reason (L280~) — 신규 1종 (count 차감 추적)
| "spouse_marriage_subtraction"   // §167의3⑨ 혼인 5년내 배우자 주택수 차감
```

- `marriageMerge`(L260 `{ marriageDate: Date }`) **무변경**(폼-레벨, 실재 확인 §plan4).
- `ExclusionReason`(L293)의 `marriage_merge`(L296) **재사용**(2주택 §155⑤ 전면배제). detail만 "10년·§167의10①15호" 갱신.

---

## 3. 상수 (`legal-codes/transfer.ts` MULTI_HOUSE)

```ts
MULTI_HOUSE = {
  // ...기존(SECOND_HOME_DEPOPULATION·PRESALE_LOW_VALUE_CAP 등)...
  MARRIAGE_MERGE_YEARS_2HOUSE: 10,      // §155⑤(→§167의10①15호) 2주택 1세대1주택 의제 — 현행 10년
  MARRIAGE_SUBTRACT_YEARS_3HOUSE: 5,    // §167의3⑨ 3주택 배우자 주택수 차감 — 5년
  MARRIAGE_MERGE_2HOUSE_BASIS: "소득세법 시행령 §167의10①15호·§155⑤",
  MARRIAGE_SUBTRACT_3HOUSE_BASIS: "소득세법 시행령 §167의3⑨",
}
```

법령 근거(본문 검증): §155⑤ "혼인한 날부터 **10년 이내** … 1세대1주택으로 보아 §154① 적용" / §167의3⑨ "혼인한 날부터 **5년 이내** … 배우자가 보유한 주택 수를 차감". **기간 비대칭(10 vs 5)은 현행 법문 그대로** — 통일 금지.

---

## 4. 알고리즘 (의사코드)

### 4.1 오케스트레이터 Step 1.5 (`multi-house-surcharge.ts`, Step1 L135 직후·Step3 L159 이전)

```ts
// ★ L135 변경: const → let (effectiveHouseCount 재할당 위해)
//   let { count: effectiveHouseCount, excluded: excludedHouses } = countEffectiveHouses(...)
//   (excludedHouses는 push만 — let 무방. effectiveHouseCount만 재할당 대상)
let marriageSubtractionApplied = false;    // §155⑤ 배제2 오염 방지 플래그

// ── #2a §167의3⑨ 혼인 5년내 배우자 주택수 차감 (3주택 전용) ──
if (input.marriageMerge && effectiveHouseCount >= 3) {
  const m = input.marriageMerge.marriageDate;
  const within5y = input.transferDate >= m
    && input.transferDate <= addYears(m, MULTI_HOUSE.MARRIAGE_SUBTRACT_YEARS_3HOUSE);
  // 단서: 혼인 5년내 신규주택 취득 → 그 취득일 이후 양도분 미적용
  const acquiredAfterMarriage = input.houses.some(
    (h) => h.acquisitionDate > m && h.acquisitionDate <= input.transferDate);
  if (within5y && !acquiredAfterMarriage) {
    const excludedIds = new Set(excludedHouses.map((e) => e.houseId));
    const spouseCounted = input.houses.filter(
      (h) => h.isSpouseOwned && h.id !== input.sellingHouseId && !excludedIds.has(h.id));
    for (const sh of spouseCounted) {
      effectiveHouseCount -= 1;
      excludedHouses.push({
        houseId: sh.id, reason: "spouse_marriage_subtraction",
        detail: `혼인일(${m.toISOString().slice(0,10)}) 5년내 배우자 보유 주택 차감 (${MULTI_HOUSE.MARRIAGE_SUBTRACT_3HOUSE_BASIS})`,
      });
      marriageSubtractionApplied = true;
    }
  }
}
// 이후 Step 3~7은 보정된 effectiveHouseCount 사용. rawHouseCount(L142)는 불변.
```

### 4.2 배제 2 정정 (`multi-house-surcharge-exclusion.ts:156-166`)

```ts
// 배제 2: 혼인합가 1세대1주택 의제 (§167의10①15호 → §155⑤, 2주택 10년)
if (input.marriageMerge && effectiveHouseCount === 2 && !marriageSubtractionApplied) {
  const m2 = input.marriageMerge.marriageDate;
  if (input.transferDate >= m2 && input.transferDate <= addYears(m2, MULTI_HOUSE.MARRIAGE_MERGE_YEARS_2HOUSE)) {
    exclusionReasons.push({
      type: "marriage_merge",
      detail: `혼인일(${m2.toISOString().slice(0,10)}) 10년내 먼저 양도 — 1세대1주택 의제 중과 배제 (${MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS})`,
    });
    return { isExcluded: true, exclusionReasons, isSuspended: false };
  }
}
```

- `differenceInYears(transferDate, marriageDate) < 5` → `transferDate <= addYears(marriageDate, 10)`. "이내"=경계 포함(`differenceInYears`의 절사 부정확 동시 해소).
- 게이트 3조건: `=== 2`(genuine 1+1, 차감 후 2와 구분) · `!marriageSubtractionApplied`(차감 3→2 오염 차단) · `<=10년`.

### 4.3 시그니처 영향 (호출처 전수)

| 함수 | 변경 | 호출처 |
|---|---|---|
| `determineSurchargeExclusion(...)` | 7번째 매개변수 `marriageSubtractionApplied: boolean` 추가 | `multi-house-surcharge.ts:233` (1곳) |
| `countEffectiveHouses(...)` | **무변경** | — |

> 호출처 **확인됨**(grep lib/+__tests__/): 실호출 1곳(`multi-house-surcharge.ts:233`)뿐. 테스트는 오케스트레이터 `determineMultiHouseSurcharge` 경유(직접호출 0 — `special-exclusion-p2.test.ts:5`는 주석). ∴ 시그니처 변경 = 정의(`exclusion.ts:121`)+호출(L233) **2곳**. 단, 배럴 re-export(`multi-house-surcharge.ts:73`·`helpers.ts`)로 외부 노출되므로 새 매개변수는 **기본값/optional 불가**(필수 boolean) — 호출부 누락 시 tsc가 잡음(의도).

### 4.4 상호작용 검증 (Step 5 / 일시적 2주택)

- **Step 5(⑩ 유일1주택, L189)**: 차감 주택이 `excludedHouses`에 push됨 → Step 5의 `excludedHouseIds`(L190)에 포함 → otherEffectiveHouses에서 제외(이중 영향 없음, 일관). C-4to3 검증.
- **배제 1(일시적 2주택, L137)**: 차감 후 effectiveHouseCount 사용 → 차감 3→2된 본인 2주택이 일시적 2주택이면 배제 1 발동 가능(법적 타당). 배제 2(혼인)만 flag로 차단.

---

## 5. 단방향 의존·정수 연산 준수

- 신규 로직 모두 `multi-house-surcharge*`(서브엔진) 내부 — 상위(`transfer-tax.ts`) import 금지 유지. `transfer-tax.ts:190`이 marriageMerge를 input에 전달(기존).
- ⑨ 차감은 **count(정수) 감산**·세율 변경 없음(중과율 ±20/30%p 기존). 가액 비교 없음.
- `addYears`: date-fns(`calculateHoldingPeriod` 동형, 윤년 안전). exclusion.ts L12 기존 import. **오케스트레이터(`multi-house-surcharge.ts`)는 date-fns 미import 확인(grep 0건) → `import { addYears } from "date-fns"` 신규 추가 필수.**

---

## 6. 파일 분할 (800줄 정책)

| 파일 | 현재 | 변경 후 추정 | 비고 |
|---|---|---|---|
| `multi-house-surcharge.ts` | L270+ (~358) | +20(Step 1.5) | 800 이하 — 분할 불요 |
| `multi-house-surcharge-exclusion.ts` | 324 | ±0(배제2 치환) | 이하 |
| `types/multi-house-surcharge.types.ts` | 427 | +6 | 이하 |

> #0(helpers 분할)은 #236에서 완료. #2a는 추가 분할 불요.

---

## 7. anchor (계획서 §6 + 본 인벤토리 §1)

`__tests__/tax-engine/multi-house-surcharge/gaps-2a-marriage.test.ts`(신규) — C-소멸·C-2잔존·C-단서·C-5y·C-5y경계·C-차감0·C-155-7y·C-155-10y경계·C-4to3.
`basic-exclusion.test.ts` — MH-07 첫째(C-155-3y) green 유지 / 둘째 C-155-11y로 정정.
C-차감0·C-4to3은 STEP 10에서 계획 §5 역동기화.
