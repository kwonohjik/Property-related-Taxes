# multi-house-surcharge-gaps — 엔진 설계 (Layer 2)

> 계획서: `docs/00-pm/multi-house-surcharge-gaps.plan.md` / worktree `feat/multi-house-gaps`
> 근거 실측: `multi-house-surcharge.ts`(오케스트레이터 358줄) · `multi-house-surcharge-helpers.ts`(798줄) · `types/multi-house-surcharge.types.ts` · 법령 MST 286211
> 범위: 다주택 중과 미구현 4건의 **순수 엔진 레이어**(타입·상수·알고리즘·anchor). UI/14지점은 `.ui.design.md` 참조.

---

## 1. 케이스 인벤토리

| ID | 갭 | 입력 조건 | 기대 동작 | anchor |
|---|---|---|---|---|
| C1-가 | #1 | 취득 2024.1.10~2027.12.31·전용 60㎡↓·非아파트·취득가 수도권6억/지방3억↓ | 주택수+중과 동시 배제(`small_new_house`) | #1-가 |
| C1-가R | #1 | 위 + 취득가 한도 초과 | 산입 | #1-가R(신규) |
| C1-나 | #1 | isUnsoldNewHouse·취득 2024.1.10~**2026.12.31**·비수도권·전용 85㎡↓·취득가 **7억↓** | 배제 | #1-나 |
| C1-나R | #1 | 위 + 취득가 700,000,001 | 산입 | #1-나R |
| C1-가3 | #1 | 가목 요건 + **준공일 2023.12 (윈도우 밖)** | **산입**(준공일 윈도우 밖 → 가목 미발동) | #1-가3 |
| C3-라 | #3 | `populationAreaType=interest`·수도권밖 라목 세컨드홈·기준시가 5억(>4억) | 산입(배제 미적용) | #3-라 |
| C3-다 | #3 | `populationAreaType=decline`·수도권밖 다목·기준시가 8억(≤9억) | 배제 | #3-다 |
| C3R | #3 | `populationAreaType=interest`·기준시가 3.5억(≤4억) | 배제 | #3R |
| C2-소멸 | #2 | 본인1(양도)+배우자2·혼인 2년전·혼인후 취득 없음 | 배우자2 차감 → count 1 → **중과 없음** | #2 |
| C2-2주택 | #2 | 본인2+배우자1·혼인 2년전 | 배우자1 차감 → count 2 → `multi_house_2`(3plus 미진입) | #2-2h(신규) |
| C2-단서 | #2 | 위 + 혼인후 신규취득 1채 | 차감 미적용 → 원 count 유지 | #2단서 |
| C2-5년 | #2 | 혼인 6년전 양도 | 차감 미적용(5년 경과) | #2-5y(신규) |
| C4-VALUE | #4 | VALUE지역(지방) 분양권·rightValue 2.5억(2022취득) | 미산입 | #4 |
| C4R | #4 | VALUE지역 분양권 3.5억 | 산입 | #4R |
| C4-광역 | #4 | 광역시 분양권(REGION)·2.5억 | **산입**(REGION 가액무관) | #4-광역 |

> C2-2주택·C2-5년·C1-가R STEP 6 신규 식별 + **#3 `populationAreaType` 신규 입력(다목 9억) → #3 "엔진 단독"→"엔진+최소 입력 14지점" 변경**(STEP 8 파급) → 모두 계획서 §1·§3#3·§5에 역동기화(STEP 10).

---

## 2. 타입 변경 (`types/multi-house-surcharge.types.ts`)

```ts
// HouseInfo (기존 acquisitionPrice:133·exclusiveArea:93·isUnsoldNewHouse:135 존재 — #1 추가 불요)
export interface HouseInfo {
  // ...기존...
  isSpouseOwned?: boolean;        // #2 §167의3⑨ 배우자 단독보유 주택
  populationAreaType?: "decline" | "interest";  // #3 다목(decline→9억)/라목(interest→4억) 구분 — 신규 입력(14지점)
  completionDate?: Date;          // #1 가목 3호 준공일 (✅구현 결정) — 2024.1.10~2027.12.31 준공 검증, 미제공 시 가목 미발동(보수적)
}

// PresaleRight (#4)
export interface PresaleRight {
  id: string;
  type: "presale_right" | "redevelopment_right";
  acquisitionDate: Date;
  region: "capital" | "non_capital";
  regionCriteria?: "REGION" | "VALUE";  // #4 광역시·세종=REGION(가액무관 산입), 지방=VALUE. 미제공 시 region 폴백(capital→REGION, non_capital→VALUE)
  rightValue?: number;                   // #4 분양권=공급가격(선택품목 제외)/입주권=종전주택가격(도시정비법§74①5)
  isSpouseOwned?: boolean;               // #2b §167의4⑤ 배우자 보유 분양권 차감
}

// ExcludedHouse.reason (#2 결과 표기)
| "spouse_marriage_subtraction"   // §167의3⑨ 혼인 5년내 배우자 주택 차감

// MultiHouseSurchargeResult (#4 결과 표기)
export interface MultiHouseSurchargeResult {
  // ...기존...
  excludedPresaleRights?: Array<{ id: string; reason: "low_value_value_region" }>;  // #4
}
```

> `regionCriteria` 폴백은 HouseInfo의 기존 패턴(types:53)과 동형 — `classifyRegionCriteriaByCode` 재사용 검토.

---

## 3. 상수 (`legal-codes/transfer.ts` MULTI_HOUSE)

```ts
MULTI_HOUSE = {
  // #1 나목 (현 매직넘버 helpers:341·344 추출)
  UNSOLD_NEW_HOUSE_ACQ_DEADLINE: "2026-12-31",   // (현행법) 코드 "2025-12-31" 오류
  UNSOLD_NEW_HOUSE_PRICE_CAP: 700_000_000,       // (현행법 7억) 코드 600_000_000 오류
  SMALL_NEW_HOUSE_ACQ_WINDOW: ["2024-01-10", "2027-12-31"],  // 가목 (일치)
  // #3 인구감소 (다목/라목)
  POP_DECLINE_PRICE_CAP_DEFAULT: 400_000_000,    // 다목 기본·라목 4억
  POP_DECLINE_PRICE_CAP_NONCAPITAL: 900_000_000, // 다목 수도권밖 인구감소지역 9억
  // #4
  PRESALE_LOW_VALUE_CAP: 300_000_000,            // §167의4②1호·§167의11②1호 3억
}
```

법령 근거 주석(검증 완료):
- 나목: §167의3①12나목 — "2024.1.10~2026.12.31 취득 / 취득가 7억 이하 / 전용 85㎡ / 수도권 밖"
- 다목 3): "4억(수도권 밖 인구감소지역 9억)" / 라목 3): "4억"
- §167의4②1호·§167의11②1호: "수도권·광역시·세종 외 / 분양권 가액 3억 이하 미산입"

---

## 4. 알고리즘 (의사코드)

### #1 — 나목 상수 정정 + 가목 준공일 검증 (`isSmallNewHouseSpecial`, helpers:327-348)
나목은 상수만, **가목은 준공일(completionDate) 검증 추가**(✅구현 결정):
```ts
// 가목 분기 — completionDate 준공일 윈도우 검증 추가 (가목 3호)
if (acqDate >= D("2024-01-10") && acqDate <= D("2027-12-31")
    && completionDate && completionDate >= D("2024-01-10") && completionDate <= D("2027-12-31") // ✅ 가목 3호
    && (exclusiveArea ?? 0) <= 60 && !isApartment
    && acquisitionPrice <= (isCapital ? 600_000_000 : 300_000_000)) return true;
// 나목 분기 (준공일 요건 없음)
if (acqDate >= D("2024-01-10") && acqDate <= D(UNSOLD_NEW_HOUSE_ACQ_DEADLINE) // 2026-12-31
    && !isCapital && (exclusiveArea ?? 0) <= 85
    && acquisitionPrice <= UNSOLD_NEW_HOUSE_PRICE_CAP // 700_000_000
    && isUnsoldNewHouse) return true;
```
> 입력 도달은 14지점(.ui.design.md). **가목 ✅completionDate 검증 추가**(준공일 미제공 시 가목 미발동 — 보수적). 나목은 상수 2건.

### #2 — §167의3⑨ 배우자 주택수 차감 (오케스트레이터 주입)
**위치: `determineMultiHouseSurcharge` Step 1 직후** (countEffectiveHouses 순수성 유지 — 시그니처 무변경. `input.marriageMerge`가 오케스트레이터에만 존재).
```ts
let { count: effectiveHouseCount, excluded: excludedHouses } = countEffectiveHouses(...);
// ── #2 §167의3⑨ 혼인 5년내 배우자 주택 차감 ──
if (input.marriageMerge) {
  const m = input.marriageMerge.marriageDate;
  const within5y = input.transferDate <= addYears(m, 5) && input.transferDate >= m;
  // 단서: 혼인후 신규취득 주택 존재 시 차감 미적용
  const acquiredAfterMarriage = input.houses.some(  // 단서: m < 취득일 ≤ m+5y (within5y가 transferDate≤m+5y 보장→함의)
    h => h.acquisitionDate > m && h.acquisitionDate <= input.transferDate);
  if (within5y && !acquiredAfterMarriage) {
    const spouseHouses = input.houses.filter(
      h => h.isSpouseOwned && h.id !== input.sellingHouseId
        && !excludedHouses.some(e => e.houseId === h.id));
    for (const sh of spouseHouses) {
      effectiveHouseCount -= 1;
      excludedHouses.push({ houseId: sh.id, reason: "spouse_marriage_subtraction",
        detail: `혼인 5년내 배우자 보유 주택 차감 (§167의3⑨)` });
    }
  }
}
// 이후 Step 2~7은 보정된 effectiveHouseCount 사용
```
**효과**: count 3→2 시 `surchargeType`은 `multi_house_2`(3plus 미진입), 3→1 시 Step 3에서 `surchargeApplicable=false`. **"중과 0"은 차감 후 ≤1일 때만** (C2-소멸); 2주택 잔존 시 2주택 중과 가능(C2-2주택).
> §167의10①2호(2주택 혼인 *배제*)와 효과 구분: ⑨=count 차감(이 단계), 10①2호=determineSurchargeExclusion Step 6(중과 배제). 중복 적용 아님(서로 다른 단계·효과).
> **Step 5 상호작용**: 차감 주택을 `excludedHouses`에 push → 오케스트레이터 Step 5(유일1주택, `multi-house-surcharge.ts:190` `excludedHouseIds`)에서도 제외 집합 포함 → 산정 제외로 일관(이중 영향 없음).

### #3 — 인구감소 가액 한도 (`countEffectiveHouses`, helpers:478-489 → 분할 후 -count.ts)
```ts
// ⑭ 인구감소지역 세컨드홈 (소령 §167의3①12 다·라목 — 주석 "2호의2" 정정)
const isPopDecline = house.isPopulationDeclineArea ?? (regionCode ? classify(regionCode).isDeclineArea : false);
if (isPopDecline && house.isSecondHomeRegistered) {
  // #3 가액 한도: 다목(수도권밖 인구감소지역) 9억, 라목(관심지역)·기타 4억
  const cap = (house.region === "non_capital" && house.populationAreaType === "decline")
    ? POP_DECLINE_PRICE_CAP_NONCAPITAL : POP_DECLINE_PRICE_CAP_DEFAULT;
  if (house.officialPrice <= cap) { excluded.push({...reason:"population_decline_second_home"}); continue; }
  // 한도 초과 → 배제 미적용, 일반 산입 (fall through)
}
```
> **다목/라목 구분 = 신규 입력 `populationAreaType`(decline/interest) 채택.** ⚠️ **계획 §3#3·§1표 "입력 추가 불요"는 정정 대상**(STEP 10 역동기화) — 라목 4억 일률이면 입력 불요지만, **다목 9억 정확 반영하려면 1필드 추가**(→ #3도 14지점 최소 동기화). 대안 regionCode 매핑(`classifyPopulationDeclineArea` 코드셋 line77-78 기존)도 regionCode 미전달이라 부담 동일 → `populationAreaType`이 의미 명확·최소. **`region==='non_capital'`는 광역시 군 edge 근사**(다목 9억 대상 거의 비수도권). 동일시군구 조건(다·라목 2호)은 2차.

### #4 — 분양권 VALUE 3억 배제 (`countEffectiveHouses` presaleRights 루프, helpers:495-499)
```ts
const excludedPresaleRights = [];
for (const right of presaleRights) {
  if (right.acquisitionDate < presaleStartDate) continue;        // 2021.1.1 전 미산입(기존)
  const rc = right.regionCriteria ?? (right.region === "capital" ? "REGION" : "VALUE");
  if (rc === "VALUE" && (right.rightValue ?? Infinity) <= PRESALE_LOW_VALUE_CAP) {
    excludedPresaleRights.push({ id: right.id, reason: "low_value_value_region" });
    continue;                                                     // #4 미산입
  }
  count++;
}
return { count, excluded, excludedPresaleRights };  // 반환 타입 확장
```
> **countEffectiveHouses 반환 타입 변경**: `{count, excluded}` → `{count, excluded, excludedPresaleRights}`. ⚠️ **전 호출자 영향** — `countEffectiveHouses` 호출처 grep 전수(오케스트레이터 `multi-house-surcharge.ts:135` + 테스트) 후 구조분해 갱신. 오케스트레이터는 **5개 return 객체 전부**에 `excludedPresaleRights` 전달 필요(`multi-house-surcharge.ts` line 160·175·211·243·260). rightValue 미제공 시 `Infinity`로 산입(보수적).

---

## 5. 파일 분할 (800줄 정책 — helpers 798줄)

| 신규 파일 | 추출 대상 | 비고 |
|---|---|---|
| `multi-house-surcharge-count.ts` | `countEffectiveHouses`·`isSmallNewHouseSpecial`·`classifyRegionCriteriaByCode` 등 산정군 | #1·#3·#4 로직 추가처 |
| `multi-house-surcharge-exclusion.ts` | `determineSurchargeExclusion`·`isGroupExcludable` 등 배제군 | 기존 유지 |
| `multi-house-surcharge-helpers.ts` | 잔여 + 분할본 re-export(하위호환) | export 100% 보존 |

> 800줄 분할 시 외부 export 보존(`feedback_800line_split_export_preservation`) — `multi-house-surcharge.ts`의 re-export 블록(64-74)이 소비자 import 무변경 보장.

---

## 6. 단방향 의존·정수 연산 준수

- 신규 로직 모두 `multi-house-surcharge*`(서브엔진) 내부 — 상위(transfer-tax.ts) import 금지 유지.
- 가액 비교는 정수(원). 세율 계산 변경 없음(중과율 ±20/30%p 기존). #2 차감은 count(정수) 연산.
- `addYears`는 date-fns 기반(`calculateHoldingPeriod` 동형) — 윤년 안전.

---

## 7. anchor (계획서 §5 + 본 인벤토리 §1)

`__tests__/tax-engine/transfer/multi-house-gaps-*.test.ts`. C2-2주택·C2-5년·C1-가R 신규 → STEP 10에서 계획 §5 역동기화.
