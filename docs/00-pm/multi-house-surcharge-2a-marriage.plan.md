# #2a 혼인 합가 주택수 차감 — 재설계 계획서 (§167의3⑨ / §155⑤)

> 작성일: 2026-06-16 · worktree `feat/mh-2a` (base `origin/master` @ b886b42b, #237 포함)
> 선행: `multi-house-surcharge-gaps.plan.md` §3#2 (구 단순 차감 설계 — **본 문서로 대체**) + 설계 §4#2:138 환류(법령충돌)
> 검증: 법령 = KoreanLaw MCP **소득세법 시행령 MST 286211**(시행 20260522) **본문 직접 대조 완료** / 코드 = 실측 file:line (worktree HEAD b886b42b)
> 정책 준거: `feedback_korean_law_82_vs_81_2_drift`(위임체인 최종본칙 검증) · `feedback_transfer_year_tax_rate` · `feedback_anchor_correction_legal_priority` · `feedback_pre_anchor_verification` · `feedback_api_zod_schema_sync`(14지점) · `feedback_no_silent_apportion_fallback`

---

## 0. 핵심 진단 (한 줄 요약)

혼인 합가의 중과 처리는 주택 수에 따라 **법적 메커니즘이 다르다**. 현재 엔진은 이를 구분하지 않고 단일 "혼인 5년→전면배제"로 처리하여 **이중 결함**을 가진다: ① **기간** — §155⑤ 현행 10년인데 5년 하드코딩(2주택 과소배제) ② **주택수 무분기** — 3주택도 전면배제(§167의3⑨는 "차감"이지 "전면배제"가 아님 → 과대배제). #2a는 이 둘을 **법적 메커니즘대로 분기**한다.

---

## 1. 법령 근거 (본문 직접 대조 완료 — MST 286211)

### 1.1 혼인 합가 4분기 매트릭스 (검증)

| 보유 형태 | 중과 대상 조문 | 혼인 구제 경로 | 효과 | 기간 |
|---|---|---|---|---|
| 2주택(주택만) | 법§104⑦1호 → §167의10 | **§167의10①15호 → §155⑤** | 1세대1주택 의제 → 중과 배제(전면) | **10년** |
| 3주택↑(주택만) | 법§104⑦3호 → §167의3 | **§167의3⑨** | 배우자 보유 **주택 수 차감** | **5년** |
| 2주택+권 | 법§104⑦2호 → §167의11 | §167의11①13호 → §156의2/§156의3 | 1세대1주택 의제 → 중과 배제 | (준용) |
| 3주택+권 | 법§104⑦4호 → §167의4 | **§167의4⑤** | 배우자 보유 주택·입주권·분양권 수 차감 | **5년** (=#2b) |

### 1.2 §167의3⑨ 본문 (3주택 차감 — 축자 인용)

> ⑨ 제1항에도 불구하고 1주택 이상을 보유하는 자가 1주택 이상을 보유하는 자와 혼인함으로써 혼인한 날 현재 제1항에 따른 **1세대3주택 이상**에 해당하는 주택을 보유하게 된 경우로서 그 혼인한 날부터 **5년 이내**에 해당 주택을 양도하는 경우에는 양도일 현재 **양도자의 배우자가 보유한 주택 수**(제1항에 따른 주택 수를 말한다)를 **차감**하여 해당 1세대가 보유한 주택 수를 계산한다. **다만, 혼인한 날부터 5년 이내에 새로운 주택을 취득한 경우 해당 주택의 취득일 이후 양도하는 주택에 대해서는 이를 적용하지 아니한다.**

- 발동조건: 혼인일 현재 1세대 3주택↑ + 혼인일부터 5년 이내 양도.
- 효과: **양도자의 배우자 보유 주택 수**를 차감하여 1세대 주택 수 재계산(전면배제 아님).
- 단서: 혼인 5년 내 신규주택 취득 → 그 취득일 이후 양도분 미적용.

### 1.3 §155⑤ 본문 (2주택 의제 — 축자 인용, ★기간 정정 근거)

> ⑤ 1주택을 보유하는 자가 1주택을 보유하는 자와 혼인함으로써 1세대가 **2주택**을 보유하게 되는 경우 … 각각 혼인한 날부터 **10년 이내**에 먼저 양도하는 주택은 이를 **1세대1주택으로 보아 제154조제1항을 적용**한다.

- 적용대상: **1+1=2주택**(각자 1주택 보유자끼리 혼인). 혼인일부터 **10년 이내** "먼저 양도하는 주택".
- 효과: 1세대1주택 의제 → §154① 적용(비과세) → 중과 영역에선 §167의10①15호로 **중과 배제**.
- **★ 현행 10년**(과거 5년에서 확대) — 현재 엔진의 5년 하드코딩은 현행 미반영.

### 1.4 준용 범위 (⑨ 미준용 — 충돌 해소 근거, 축자)

- **§167의10②**(2주택): "제1항을 적용할 때 제167조의3제2항부터 **제8항까지 및 제10항**을 준용한다." → **⑨ 미포함**.
- §167의4④(3주택+권)·§167의11③(2주택+권): 동일하게 "②~⑧ 및 ⑩ 준용" → ⑨ 미포함(§167의4는 자체 ⑤ 보유).
- ∴ §167의3⑨(혼인 차감)은 **3주택 전용**. 2주택 혼인 구제는 §155⑤(→§167의10①15호) 경로뿐. **이전 세션 발견 정확.**
- (보완) §167의3①13호도 "§155 또는 조특법 1세대1주택 의제 → 배제"를 두나, **§155⑤는 1+1=2주택 한정**(본문 "1세대가 2주택")이라 **3주택 혼인엔 §155⑤ 경로 부적용** → ①13호로 우회 불가 → ⑨ 차감이 유일. (3주택의 ①13호는 조특법·기타 §155 의제용; 본 #2a 비대상.)

### 1.5 §167의4⑤ 본문 (#2b 의존 — 참고)

> ⑤ 1주택, 1조합원입주권 또는 1분양권 이상을 보유하는 자가 … 혼인함으로써 혼인한 날 현재 법 제104조제7항제4호에 따른 주택과 조합원입주권 또는 분양권의 수의 합이 **3 이상**이 된 경우 그 혼인한 날부터 **5년 이내** … 배우자가 보유한 제2항에 따른 주택, 조합원입주권 또는 분양권의 수를 차감 …

→ #2a(주택 차감)의 권리 포함 확장판. **#2b로 분리**(`PresaleRight.isSpouseOwned` 필요, #4 PresaleRight 확장 완료분 위에 구현).

---

## 2. 현재 코드 진단 (실측 file:line — worktree b886b42b)

| 위치 | 현재 코드 | 결함 |
|---|---|---|
| `multi-house-surcharge-exclusion.ts:156-166` (배제 2) | `if (input.marriageMerge) { if (differenceInYears(transferDate, marriageDate) < 5) { return isExcluded:true }}` | **① 5년**(현행 §155⑤ 10년) **② count 분기 이전**(L137 배제1·L198 3주택·L254 2주택 모두 이후) → 3주택도 전면배제 |
| `multi-house-surcharge.ts:134-140` (Step 1) | `countEffectiveHouses(...)` → `{count, excluded}` | ⑨ 차감 주입 지점(직후) |
| `types/multi-house-surcharge.types.ts:260-262` | `marriageMerge?: { marriageDate: Date }` | ⑨ 차감용 "배우자 소유" 식별 데이터 부재 |
| `types/...:30-` `HouseInfo` | `isSpouseOwned` 부재 | 신규 필드 |
| `types/...:278-290` `ExcludedHouse.reason` | 8종 union — 혼인 차감 없음 | `spouse_marriage_subtraction` 추가 |
| `__tests__/.../basic-exclusion.test.ts:309-330` (MH-07 2번째) | 혼인 2019→양도 2024(5.4년) → `multi_house_2`(배제 안 됨) 기대 | **10년 적용 시 결과 반전**(5.4년<10년→배제) → anchor 정정 대상 |

> 진단 보강: 배제 2는 `effectiveHouseCount` 무관하게 발동하므로 현재도 **3주택 혼인 = 전면배제**(과대). **marriageMerge 경로 실재 확인됨**(§4 ★) → numeric 영향 실재(`feedback_numeric_impact_verify_before_bug_claim`: dead code 아님, anchor A-2잔존이 산출세액 차이 실증). MH-07 count=2 근거: `makeHouse` 기본 `officialPrice 3억·region capital`(→REGION 가액무관 산입) → h1(11680 서울)+h2 모두 산입 → originalCount 2 → 첫째 테스트 배제 2(===2) 발동 유지.

---

## 3. 재설계 (엔진 알고리즘)

### 3.1 분기 구조 (originalCount 기준 — 상호배타)

§167의3⑨(차감)과 §155⑤(전면배제)는 **혼인 차감 전 주택수**(originalCount)로 상호배타 분기한다.

```
Step 1: countEffectiveHouses → effectiveHouseCount (= originalCount)
Step 1.5 (#2a 신규): 혼인 ⑨ 차감
  if (marriageMerge && effectiveHouseCount >= 3):
     within5y = transferDate >= marriageDate && transferDate <= addYears(marriageDate, 5)
     단서   = houses.some(h => h.acquisitionDate > marriageDate && h.acquisitionDate <= transferDate)
     if (within5y && !단서):
        spouseCounted = houses.filter(h => h.isSpouseOwned
                          && h.id !== sellingHouseId
                          && !excludedHouseIds.has(h.id))   // count에 산입된 배우자 주택만
        for sh of spouseCounted:
           effectiveHouseCount -= 1
           excludedHouses.push({houseId: sh.id, reason:"spouse_marriage_subtraction", detail:"…§167의3⑨…"})
           marriageSubtractionApplied = true
Step 3: count<=1 → 중과 없음   (⑨ 차감으로 ≤1 도달 시 여기서 종료)
Step 5: count>=3 → ⑩ 유일1주택 (차감 후 잔존 count 기준)
Step 6: determineSurchargeExclusion(… , marriageSubtractionApplied)
        배제 2(§155⑤): effectiveHouseCount===2 && !marriageSubtractionApplied && transferDate<=addYears(marriageDate,10)
Step 7: 중과 유형
```

> **위치**: Step 1.5는 **Step 1 직후·Step 3 이전**(Step 2 조정지역 판단은 count 미사용 → 전후 무관). **`rawHouseCount`(L142, 배제전 단순합계)는 ⑨ 차감 무영향**(차감은 effectiveHouseCount·excludedHouses만).
> **presaleRights interim**: ⑨ 차감은 **배우자 주택만**. presaleRights 존재(§167의4 영역) 시 배우자 권리는 미차감(잔존) → count 보수적 과대 가능 → **#2b(§167의4⑤)에서 권리 차감 완결**. #2a anchor는 권리 無 시나리오로 한정.

**상호배타 검증**:
- 1+1=2 (originalCount 2): Step 1.5 미발동(≥3 아님) → Step 6 배제 2 발동(===2, flag false, 10년). ✓
- 본인2+배우자1=3 (originalCount 3): Step 1.5 배우자1 차감 → count 2, flag true → Step 6 배제 2 **미발동**(flag true) → 본인2 = 2주택 중과. ✓ (§155 비해당 정합)
- 본인1+배우자2=3: Step 1.5 배우자2 차감 → count 1 → Step 3 중과 없음. ✓
- originalCount 3 + 5년 경과: Step 1.5 미발동 → count 3 유지 → Step 6 배제 2 미발동(===2 아님) → 3주택 중과. ✓

### 3.2 배제 2 정정 (`exclusion.ts:156-166`)

```ts
// 배제 2: 혼인합가 1세대1주택 의제 (소령 §167의10①15호 → §155⑤, 2주택 10년)
if (input.marriageMerge && effectiveHouseCount === 2 && !marriageSubtractionApplied) {
  if (input.transferDate <= addYears(input.marriageMerge.marriageDate,
        MULTI_HOUSE.MARRIAGE_MERGE_YEARS_2HOUSE /* 10 */)) {
    exclusionReasons.push({ type: "marriage_merge",
      detail: `혼인일(${…}) + 10년 이내 — 1세대1주택 의제 중과 배제 (§167의10①15호·§155⑤)` });
    return { isExcluded: true, exclusionReasons, isSuspended: false };
  }
}
```
- `differenceInYears < 5` → `transferDate <= addYears(marriageDate, 10)` (date-fns `addYears` 기존 import L12). "이내"=경계 포함.
- 기간 상수: `legal-codes/transfer.ts` `MULTI_HOUSE.MARRIAGE_MERGE_YEARS_2HOUSE: 10` / `MARRIAGE_SUBTRACT_YEARS_3HOUSE: 5` 명명 추출.
- `marriageSubtractionApplied`는 신규 매개변수(determineSurchargeExclusion 시그니처 +1). 기본 false.

### 3.3 시그니처 영향

- `determineSurchargeExclusion(input, effectiveHouseCount, isRegulated, suspensionRules, regulatedAreaHistory, excludedHouseIds, **marriageSubtractionApplied: boolean**)` — 마지막 매개변수 추가. 호출처 `multi-house-surcharge.ts:233` 1곳.
- `countEffectiveHouses` 시그니처 **무변경**(⑨ 차감은 오케스트레이터에서, marriageMerge는 오케스트레이터에만 존재).

---

## 4. 데이터 모델 + 14 동기화 지점 (`HouseInfo.isSpouseOwned`)

`isSpouseOwned?: boolean` — "양도자의 배우자 단독 보유 주택". **규약: 양도 주택(sellingHouseId)=양도자(본인) 소유(false 전제)**, 그 외 주택만 실제 소유자 표시. (양도자 = 양도 주택 소유자; "배우자"=상대 배우자.)

| # | 지점 | 파일 | 변경 | 검증주체 |
|---|---|---|---|---|
| ① | 폼 HouseEntry | `lib/stores/calc-wizard-asset-nbl.ts` | `isSpouseOwned?: boolean` | 작성자(grep) |
| ② | initial factory | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx` (newHouse) | `isSpouseOwned: false` | UI |
| ③ | normalize | `calc-wizard-migration.ts` | **N/A**(houses 미처리·optional 자동호환) | 작성자 |
| ④⑬ | API 변환 | `lib/calc/transfer-tax-api-houses.ts` (otherHouses map) | `isSpouseOwned: h.isSpouseOwned` | 작성자 |
| ⑤ | UI 위젯 | `components/calc/transfer/HouseEntryEditor.tsx` | 혼인합가 ON일 때만 노출 "배우자 단독 보유" chip(ToggleCard) | UI |
| ⑥ | 사이드바 | — | **N/A**(보유주택 보조입력) | UI |
| ⑦ | 결과 카드 | `components/calc/MultiHouseSurchargeDetailCard.tsx` | `spouse_marriage_subtraction` 라벨 + `marriage_merge` detail(10년) | UI |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | (a) 혼인 ON + 3주택인데 isSpouseOwned 전무 → **비차단 경고** (b) sellingHouse.isSpouseOwned===true = 양도자≠본인 **모순 경고**. 둘 다 차단 금지(자동 안분 fallback 금지 준수) | UI |
| ⑨⑩⑪ | enum/companion/fallback | — | N/A(boolean) | — |
| ⑫ | **Zod houseSchema** | `lib/api/transfer-tax-schema-sub.ts` | `isSpouseOwned: z.boolean().optional()` — **미추가 시 silent strip** | 작성자(grep) |
| ⑭ 단건 | Route 매핑 | `lib/api/transfer-route-multi-house.ts` `mapHousesToEngine` | `isSpouseOwned: h.isSpouseOwned` | 작성자 |
| ⑭ 다건 | 다건 Route | `app/api/calc/transfer/multi/route.ts` | #1에서 `mapHousesToEngine` 통합 완료 → **자동 반영**(grep 확인) | 작성자 |

> ★ `marriageMerge`(marriageDate) 입력 경로 **실재 확인**(grep, b886b42b): `lib/calc/transfer-tax-api.ts:472`·`multi-transfer-tax-api.ts:141`(form.marriageDate→marriageMerge) · Zod `transfer-tax-schema.ts:140` · route 단건 `route.ts:219`·다건 `multi/route.ts:150`. → **폼-레벨 marriageDate 경로 재사용**, #2a 신규는 `isSpouseOwned`(per-house) 1필드뿐. (단, marriageDate UI 위젯 노출부는 Do에서 1건 grep — `isSpouseOwned` chip을 같은 영역에 배치.)

---

## 5. 케이스 매트릭스 (전수 enumerate)

| ID | 입력 | originalCount | ⑨차감 | 기대 | 근거 |
|---|---|---|---|---|---|
| M-2A-소멸 | 본인1(양도)+배우자2, 혼인2년전, 신규취득無 | 3 | 배우자2 차감 | count 1 → **중과 없음** | §167의3⑨ |
| M-2A-2잔존 | 본인2+배우자1(양도=본인), 혼인2년전, 조정 | 3 | 배우자1 차감 | count 2 → `multi_house_2`(전면배제 ✗) | ⑨+§155비해당 |
| M-2A-단서 | M-2A-소멸 + 혼인후 1채 취득(취득일<양도일) | 3 | 미적용 | count 3 유지 → 3주택 중과 | ⑨ 단서 |
| M-2A-5y | 본인1+배우자2, 혼인6년전 양도 | 3 | 미적용(5년 경과) | count 3 → 3주택 중과 | ⑨ 5년 |
| M-2A-5y경계 | 혼인일+정확히5년 양도 | 3 | 적용(이내) | 차감 | `<=addYears(,5)` |
| M-2A-차감0 | 본인3(양도)+배우자0·혼인2년전·조정 | 3 | 차감0(배우자주택無) | `multi_house_3plus`(flag false) | ⑨ |
| M-2A-4to3 | 본인3+배우자1(양도=본인)·혼인2년전·조정·잔여2일반 | 4 | 배우자1 차감→3 | `multi_house_3plus`(Step5 ⑩ 미해당) | ⑨ |
| M-155-2주택 | 1+1=2(양도), 혼인3년전, 조정 | 2 | (미발동) | **전면배제**(marriage_merge) | §155⑤ |
| M-155-10y내 | 1+1=2, 혼인7년전(MH-07 2번째 정정) | 2 | (미발동) | **전면배제**(7<10) | §155⑤ 10년 |
| M-155-10y초과 | 1+1=2, 혼인11년전 | 2 | (미발동) | 배제 안 됨 → `multi_house_2` | §155⑤ 10년 경계 |
| M-155-10y경계 | 1+1=2, 혼인일+정확히10년 | 2 | (미발동) | 전면배제(이내) | `<=addYears(,10)` |

> M-2A-2잔존이 #2a의 **핵심 회귀 방어**(기존 전면배제 버그가 산출하던 "중과 0"을 "2주택 중과"로 정정). `feedback_anchor_correction_legal_priority`: 산출세액 numeric 차이를 anchor로 고정.

---

## 6. Pre-Do Anchor 목록 (Do 전 우선 작성·실행 — 실패 확보)

`__tests__/tax-engine/multi-house-surcharge/gaps-2a-marriage.test.ts` (신규)

| anchor | 입력 | 기대(수정 후) | 현재(실패 이유) |
|---|---|---|---|
| A-소멸 | M-2A-소멸 | effectiveHouseCount 1, surchargeApplicable false, excluded `spouse_marriage_subtraction`×2 | 전면배제(reason marriage_merge)·차감 無 |
| A-2잔존 | M-2A-2잔존 | count 2, surchargeApplicable **true**, surchargeType `multi_house_2`, exclusionReasons 無 | 전면배제(중과 0) — **버그 노출** |
| A-단서 | M-2A-단서 | count 3, multi_house_3plus | 전면배제 |
| A-5y | M-2A-5y | count 3, multi_house_3plus | 전면배제(5년 무관 발동) |
| A-155-10y내 | M-155-10y내(7년) | surchargeApplicable false, marriage_merge | (5년 기준이면) 7년>5 → 중과 적용 ❌ |
| A-155-10y초과 | M-155-10y초과(11년) | multi_house_2 | (기존 통과·10년 정정 후 유지) |
| (정정) MH-07 2번째 | 현 혼인 2019→2024(5.4년) | 혼인일을 **2013-01-01(11.4년전)로 변경** → "10년 **초과** 배제 안 됨"(multi_house_2)으로 재작성. 의도(기간 초과→배제 해제) 보존·임계만 5→10 정합 | 5.4년은 10년 내라 현 기대(배제 안 됨)가 반전 |

> 메모리 `feedback_pre_anchor_verification`: A-2잔존·A-소멸 우선 실행→red 확보→설계 환류. `feedback_anchor_correction_legal_priority`: MH-07 2번째는 10년 정합값으로 재작성(잘못된 5년 anchor 유지 금지).

---

## 7. 회귀 / 검증

- `npx vitest run __tests__/tax-engine/multi-house-surcharge/` 전체 + 신규 anchor (MH-07 정정 포함)
- `npx vitest run __tests__/tax-engine/transfer-tax/` (오케스트레이터 통한 산출세액 회귀)
- 차단 validation 추가 없음(⑧ 경고만) → 전세목 E2E 회귀 불요. houses 폼 E2E 1건(`E2E_PORT=3103`)
- `npx tsc --noEmit` 0건 — ⑫⑬⑭ + 신규 시그니처 매개변수 grep 자가점검
- 브라우저 수동: 혼인합가 ON + 배우자 보유 주택 체크 → Network request body `isSpouseOwned` 확인

---

## 8. 리스크 / 스코프 경계

| 구분 | 내용 |
|---|---|
| HIGH | ⑫ houseSchema `isSpouseOwned` 선수정(strip). 배제 2 게이트 3조건(===2·!flag·10년) 동시 — 1개 누락 시 분기 오염 |
| HIGH | MH-07 2번째 테스트 **반전**(5년→10년) — 정정 안 하면 전체 vitest red |
| LOW(해소) | ~~`marriageMerge` 입력 경로 미검증~~ → **실재 확인**(api.ts:472·schema:140·route 219/150). 남은 건 marriageDate **UI 위젯 위치** 1건 grep(isSpouseOwned chip 동일 영역 배치) |
| 스코프밖(후속) | **§154① 요건 미검증** — §167의10①15호는 "§154① 요건 모두 충족" 요구(보유 2년 등). 현 엔진 미검증(혼인만으로 배제) = 기존 과대배제 유지. 본 #2a는 기간·주택수 분기까지, §154① 요건 연동은 1세대1주택 엔진 영역(별도) |
| 스코프밖(후속) | **부칙 양도일 분기** — §155⑤ 10년은 현행. 양도일<개정시행일이면 5년(`feedback_transfer_year_tax_rate`). 현 엔진은 날짜 무관 5년 → 본 #2a는 현행 10년 적용, 양도일 date-guard는 후속(부칙 시행일 확인 필요) |
| 스코프밖 | "먼저 양도하는 주택"(§155⑤)·2주택+권 §156의2/3 경로 — 단건 계산 근사(현 동작 유지) |
| 의존 | **#2b**(§167의4⑤ 배우자 분양권 차감) = `PresaleRight.isSpouseOwned` + presaleRights 차감. #2a(주택만) anchor는 권리 無 시나리오. presaleRights 존재 시 #2b로 완결 |

---

## 9. 변경 파일 체크리스트 (Do — 엔진 선행 → UI 후행)

**엔진(Layer 2)**
- [ ] `types/multi-house-surcharge.types.ts` — `HouseInfo.isSpouseOwned?: boolean` + `ExcludedHouse.reason` 에 `spouse_marriage_subtraction` 추가
- [ ] `legal-codes/transfer.ts` — `MULTI_HOUSE.MARRIAGE_MERGE_YEARS_2HOUSE: 10` · `MARRIAGE_SUBTRACT_YEARS_3HOUSE: 5` 상수 + 조문 라벨(§167의3⑨·§167의10①15호)
- [ ] `multi-house-surcharge.ts` — **L135 `const`→`let`**(effectiveHouseCount 재할당) + **`import { addYears } from "date-fns"` 신규**(현재 미import) + Step 1.5 ⑨ 차감(originalCount≥3) + `marriageSubtractionApplied` 산출 → Step 6 전달
- [ ] `multi-house-surcharge-exclusion.ts:156-166` — 배제 2 게이트(`===2 && !flag && <=addYears(,10)`) + 시그니처 매개변수 추가
- [ ] (확인) `addYears` import — exclusion.ts L12 기존, 오케스트레이터 import 추가 여부 grep

**API/Route**
- [ ] `lib/api/transfer-tax-schema-sub.ts` — houseSchema `isSpouseOwned`
- [ ] `lib/api/transfer-route-multi-house.ts` — `mapHousesToEngine` `isSpouseOwned`
- [ ] (확인) `app/api/calc/transfer/multi/route.ts` — #1에서 mapHousesToEngine 통합됨 grep 재확인

**클라이언트**
- [ ] `lib/stores/calc-wizard-asset-nbl.ts` — HouseEntry `isSpouseOwned`
- [ ] `lib/calc/transfer-tax-api-houses.ts` — buildHousesPayload `isSpouseOwned`
- [ ] `lib/calc/transfer-tax-validate.ts` — 비차단 경고
- [ ] `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx` — factory 초기값
- [ ] `components/calc/transfer/HouseEntryEditor.tsx` — 배우자 보유 chip(혼인 ON 시)
- [ ] `components/calc/MultiHouseSurchargeDetailCard.tsx` — (a) EXCLUDED_REASON_LABEL `spouse_marriage_subtraction` 추가 (b) EXCLUSION_REASON_LABEL `marriage_merge` 라벨 **"5년 이내"→"2주택·10년"** 정정(L42 드리프트)
- [ ] `app/calc/transfer-tax/steps/step4-sections/MergeDateSection.tsx:41` — 힌트 "혼인합가 후 5년 이내" → "2주택 10년·3주택↑ 5년(배우자 주택수 차감)" 정정(드리프트)

**테스트**
- [ ] `__tests__/tax-engine/multi-house-surcharge/gaps-2a-marriage.test.ts` — §6 anchor
- [ ] `__tests__/tax-engine/multi-house-surcharge/basic-exclusion.test.ts` — **MH-07 2번째 정정**: 혼인일 2019→2013(11.4년전), "10년 초과 배제 안 됨"으로(첫째 3년 테스트는 그대로 green)
- [ ] `e2e/transfer-multi-house-marriage.spec.ts` — 입력 폼 E2E (E2E_PORT=3103)
