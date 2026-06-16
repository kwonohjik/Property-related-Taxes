# NBL 갭 3d — §168조의6 소유기간 버킷별 판정 — 가·나·다 AND 구조 재구현 (1호 경계 off-by-one + 2호/3호 단기버킷)

> 자동 생성(nbl-gaps-plan 워크플로 planner) — 실제 코드 정독 + KoreanLaw 본문 검증 기반. 마스터: [nbl-remaining-gaps.plan.md](../nbl-remaining-gaps.plan.md)

- **제안 PR**: 단독 PR-F. 사유: (1) period-criteria.ts는 5지목(농지·임야·목장·주택부수·기타) 전부가 호출하는 단일 공용 함수라 회귀 범위가 매우 넓고, (2) 본 변경은 기존 통과 테스트 2건 이상을 법령정합값으로 의도적으로 뒤집는(flip) 변경이라 다른 갭과 묶으면 회귀 원인 추적이 어려워진다. NBL 잔여 갭(§168의11② 수입금액·§83의5 사유별기간·§168의14② 양도일의제)과 분리. 입력 필드 변경이 없어 14 동기화 지점은 결과카드 표시(⑦) 1개만 선택적으로 건드림 → 본 PR은 사실상 "엔진 단일 함수 재구현 + 회귀 재정렬" PR.
- **복잡도**: L
- **선행(blocker)**:
  - 없음 — §168조의6 본문은 KoreanLaw get_law_text(MST 286211, 시행 20260522)로 본 세션에서 정본 확인 완료(1호 가나다·2호 가목·3호 가목·3호 단서 문구 확보). 다만 Do 진입 전 '3년/2년 차감'의 일수 환산 방식(달력 3년 vs 1095일 고정)을 집행기준·판례로 1건 추가 확인 권장(현행 divergence는 두 모델 모두 동일 결론이므로 본 갭 진행은 가능).

## Anchor 테스트

### PRE-DO 1호 경계 off-by-one — meetsPeriodCriteria가 비사업용을 사업용으로 오판 **[Pre-Do]**
- **시나리오**: 취득 2013-01-01·양도 2020-01-01(보유 2555일=7.0년→1호 ≥5년 버킷). 사업용 사용기간 1건: 직전 5년 창(2015-01-01~2020-01-01, 길이 1826일) 내부에 정확히 1095일(2015-01-01 ~ 2015-01-01+1095). other_land 양도. meetsPeriodCriteria(intervals, 2013-01-01, 2020-01-01, 'other_land', DEFAULT_RULES) 직접 호출.
- **기대값**: 현행 엔진: r.meets===true, r.criteriaUsed==='5y-3y'(rule5Years=bizInLast5>=1095=TRUE) → 사업용. 법령정합 기대값: r.meets===false(비사업용). 이유 §168조의6 1호 가목 nonbiz(직전5년)=1826-1095=731>730 ✓, 나목 nonbiz(직전3년)=731>365 ✓, 다목 nonbiz(전체)=1460>floor(2555×0.4)=1022 ✓ → 가·나·다 모두 충족 → 비사업용. Pre-Do anchor는 expect(r.meets).toBe(false)로 작성 → 현행 코드에서 FAIL(현행 true 반환) 확보. (실측: total=2555, biz5=1095, ratio=0.4286, 현행 meets=true)
- **법령근거**: 소득세법 시행령 §168조의6 1호 가·나·다 (KoreanLaw MST 286211 본문 확인). 1호 가목='양도일 직전 5년 중 2년을 초과하는 기간', 즉 비사업용 직전5년 > 730일 ⟺ 사업용 직전5년 < win5len-730 = 1096. 현행 고정상수 DAYS_3Y=1095는 윤년 가변 창길이(1826)를 반영 못 함.

### 2호(3~5년) 단기버킷 — 전체 48% 사업용인데 직전3년 2년 사업으로 사업용 오판
- **시나리오**: 취득 2014-12-10·양도 2014-12-10+1517일(=2019-02-04, 보유 1516일=4.15년→2호 3~5년 버킷). 사업용 2건: 2016-05-11~2018-05-11, 2017-09-15~2018-05-07(합산 직전3년 730일). other_land. meetsPeriodCriteria 직접 호출.
- **기대값**: 현행 엔진: r.meets===true, criteriaUsed==='3y-2y'(rule2of3Years=bizInLast3>=730=TRUE) → 사업용. 법령정합 기대값: r.meets===false(비사업용). 이유 2호 가목 nonbiz(전체)=786 > (1516-1095)=421 ✓, 나목 nonbiz(직전3년)=366>365 ✓, 다목 nonbiz(전체)=786>floor(1516×0.4)=606 ✓ → 가·나·다 모두 충족 → 비사업용. (실측: total=1516, biz3=730, ratio=0.482, 현행 meets=true. 두 일수환산모델 모두 동일 결론)
- **법령근거**: 소득세법 시행령 §168조의6 2호 가·나·다 (KoreanLaw MST 286211). 가목='소유기간에서 3년을 차감한 기간을 초과', 나목='직전 3년 중 1년 초과', 다목='소유기간의 100분의 40 초과'. 현행 엔진은 직전3년 730일(2년)만으로 OR 통과시켜 가목·다목(전체 40%)을 무시.

### 기존 통과 테스트 FLIP — '② 직전5년 1095일 PASS'는 법령상 비사업용
- **시나리오**: period-criteria.test.ts:29-41 '② 직전 5년 중 1095일 이상 사업용 → PASS' 케이스: 취득 2007-01-01·양도 2022-01-01(보유 5478일=15.0년→1호), 사업용 2017-01-01~2020-01-01(직전5년 내 1095일, 전체 비율 0.20). 본 갭이 이 기존 anchor를 법령정합값으로 재정렬.
- **기대값**: 현행 anchor: expect(r.meets).toBe(true)+criteriaUsed='5y-3y'. 법령정합 재정렬 후 기대값: r.meets===false(비사업용). 이유 1호 가목 nonbiz5=731>730 ✓, 나목 nonbiz3=731>365 ✓, 다목 nonbiz전체=4383>floor(5478×0.4)=2191 ✓ → 비사업용. 15년 보유에 20%만 사업용이므로 명백히 비사업용. 본 PR은 이 테스트의 단언을 toBe(false)로 수정하고 describe에 '법령정합 재정렬' 표기. (실측 ratio=0.200, 현행 meets=true)
- **법령근거**: 소득세법 시행령 §168조의6 1호 가·나·다 AND 구조. 현행 OR-of-business-tests는 저비율(20%) 장기보유 토지를 사업용 오판 — 법령은 가·나·다 모두 충족 시 비사업용.

---

## 갭 3d-ownership-bucket — §168조의6 소유기간 버킷별 판정 재구현

### 0. 핵심 진단 (실측 검증 완료)

현행 `period-criteria.ts`의 `meetsPeriodCriteria()`는 §168조의6을 **"3개의 사업용 테스트 OR"**(직전3년≥730 OR 직전5년≥1095 OR 전체비율≥0.6, period-criteria.ts:144-166)로 단순화했다. 그러나 법령 §168조의6은 **소유기간 버킷별로 "비사업용 기간 = 가·나·다(또는 가·나) 모두 충족"의 AND 구조**다. OR↔AND 불일치는 두 종류의 오판을 낸다(본 세션 probe로 실증):

- **1호 경계 off-by-one (실증)**: 보유 7년·직전5년창(1826일) 내 사업용 정확히 1095일 → 현행 `rule5Years=true`(사업용), 법령 가·나·다 모두 충족(비사업용). 고정상수 `DAYS_3Y=1095`(period-criteria.ts:64)가 윤년에 따라 가변인 창 길이(1826일, 1825 아님)를 반영 못 함. 법령 1호 가목 부정의 정확한 사업용 임계는 `win5len − 730 = 1096`.
- **2호/3호 단기버킷 미반영 (실증)**: 보유 4.15년·전체 48% 사업용인데 직전3년 730일(2년)만으로 현행 `rule2of3Years=true`(사업용). 법령 2호는 가목(소유기간−3년 초과 비사업)·다목(전체 40% 초과 비사업)도 AND로 요구 → 비사업용. 60k fuzz에서 2호 버킷 div=28/15985(genuine), 1호 div=0(경계 미샘플이나 hand-craft로 실증), 3a/3d div=0.
- **기존 anchor 오류 (실증)**: `period-criteria.test.ts:29-41` "② 직전5년 1095일 PASS"는 15년 보유·20% 사업용 케이스로, 법령상 명백히 비사업용인데 사업용으로 단언. 본 PR이 법령정합값으로 재정렬.

### 1. 법령 근거 (KoreanLaw get_law_text 본문 검증, MST 286211, 소득세법 시행령 시행 20260522, jo=제168조의6)

> 법 제104조의3제1항 각 호 외의 부분에서 "대통령령으로 정하는 기간"이란 다음 각 호의 어느 하나에 해당하는 기간을 말한다. 이 경우 **기간의 계산은 일수로 한다.**
> **1. 토지의 소유기간이 5년 이상인 경우**에는 다음 각 목의 **모두**에 해당하는 기간
>  가. 양도일 직전 5년 중 **2년을 초과하는 기간**
>  나. 양도일 직전 3년 중 **1년을 초과하는 기간**
>  다. 토지의 소유기간의 **100분의 40에 상당하는 기간을 초과하는 기간**
> **2. 토지의 소유기간이 3년 이상이고 5년 미만인 경우**에는 다음 각 목의 **모두**에 해당하는 기간
>  가. 토지의 소유기간에서 **3년을 차감한 기간을 초과하는 기간**
>  나. 양도일 직전 3년 중 1년을 초과하는 기간
>  다. 토지의 소유기간의 100분의 40에 상당하는 기간을 초과하는 기간
> **3. 토지의 소유기간이 3년 미만인 경우**에는 다음 각 목의 **모두**에 해당하는 기간. **다만, 소유기간이 2년 미만인 경우에는 가목을 적용하지 아니한다.**
>  가. 토지의 소유기간에서 **2년을 차감한 기간을 초과하는 기간**
>  나. 토지의 소유기간의 **100분의 40에 상당하는 기간을 초과하는 기간**

**해석 (정합 규칙)**: 위 각 호의 "기간"은 **비사업용 기간**이다. 토지가 그 기간(가·나·다 또는 가·나 모두)에 해당하면 **비사업용**, 하나라도 미충족이면 **사업용**. 즉 `isBusiness = NOT(가 AND 나 AND 다)`. 이는 현행 엔진의 "사업용 테스트 OR"과 De Morgan으로 등가가 되려면 각 사업용 임계가 창 길이에 정확히 연동돼야 하는데, 현행 고정상수가 그렇지 못해 경계에서 어긋난다.

- "100분의 40에 상당하는 기간을 초과" = `nonBusinessTotal > floor(totalOwnershipDays × 0.4)` (일수 계산 명문). 2015.2.2 이전 양도 농·임·목 레거시는 0.2(=비사업용 20% 초과/사업용 80%) — 단, 현행 엔진은 사업용 비율 임계(0.8/0.6)로 표현하므로 **비사업용 임계 = 1 − threshold**로 환산 필요.
- 2호 가목 "소유기간−3년", 3호 가목 "소유기간−2년"의 "3년/2년" 일수 환산: 본 갭에서 일관성을 위해 `1095(3×365)`·`730(2×365)`을 1차 채택하되, "달력 N년"(date-fns subYears) 대안과 결과가 갈리는 경계는 **확인 필요**로 명시. 현행 실증 divergence(2호)는 두 모델 모두 동일 결론이라 본 갭 진행에 영향 없음.

### 2. scope

**IN (본 PR)**:
- `meetsPeriodCriteria()`를 **소유기간 버킷별 가·나·다 AND 구조**로 재구현. 비사업용 기간 산정 → `isBusiness = !(비사업용)`.
- 1호 가목 임계를 고정 730/1095 대신 **창 길이 연동**(`win5len−730`, `win3len−365`)으로 보정 → off-by-one 해소.
- 2호 가목(소유기간−3년)·3호 가목(소유기간−2년)·3호 단서(소유 2년 미만 가목 미적용) 분기 추가.
- `PeriodCriteriaResult.criteria`(rule2of3Years/rule5Years/rule80Percent) 및 `criteriaUsed`의 **의미를 버킷·가나다 충족으로 재정의**하되, 결과 타입 시그니처(필드명·boolean)는 하위호환 유지(엔진/result/UI 14지점 침묵 strip 방지).
- 회귀 anchor: 5지목 전 judge 통과 보존 + 법령정합 flip 케이스 재정렬.

**OUT (분리 후속)**:
- §168의11② 수입금액비율(별도 갭), §83의5 사유별 유예기간, §168의14② 양도일 의제(별도 갭, MEMORY 명시).
- 2호/3호 "달력 N년 vs N×365" 정밀 환산의 판례·집행기준 확정(본 PR은 1095/730 채택 + 주석에 확인필요 명시; 결과 동일 구간만 적용되므로 무영향).
- UI에 버킷명(1호/2호/3호) 신규 노출 — 선택적 후속(현행 결과카드는 criteria boolean 미표시).

### 3. 데이터 모델 변경

**입력 타입 변경 없음.** 신규 입력 필드 0개 → 14 동기화 지점 중 ①②③④⑤⑥⑧⑨⑩⑪⑫⑬⑭ **불필요**(아래 §4 참조).

결과 타입(`PeriodCriteriaResult`, period-criteria.ts:34-61) — **필드 추가 없이 의미 재정의**. 다만 디버깅·결과뷰 가독성을 위해 optional echo 필드 1개를 추가 검토(타입 미파괴):
- `period-criteria.ts:32` `PeriodCriteriaUsed` 유니온에 버킷 식별 추가 검토: 현행 `"3y-2y" | "5y-3y" | "ratio" | "none"` → 의미가 가·나·다로 바뀌므로 **신규 리터럴 `"bucket1" | "bucket2" | "bucket3" | "none"` 추가 여부**는 result 소비처(NonBusinessLandResultCard.tsx는 criteriaUsed 미사용 — grep 확인 완료) 영향 0이므로 **자유**. 보수적으로 기존 리터럴 유지하고 의미만 재매핑(가목 충족 경로='ratio'류)하는 쪽이 회귀 안전. **결정: 기존 리터럴 유지**(타입 변경 0, JSON 직렬화 영향 0).
- (선택) `PeriodCriteriaResult`에 `ownershipBucket?: 1 | 2 | 3` echo 필드 추가 — UI 미사용·테스트 가독성용. optional이므로 NextResponse.json 영향 없음. echo-field-pattern 스킬 준수.

### 4. 14 동기화 지점 — 실제 건드릴 것 (enumerate)

본 갭은 **신규 입력 필드 0개·엔진 내부 순수함수 재구현**이므로 입력 파이프라인 13지점은 **변경 없음**. NBL prefix-pick(buildNonBusinessLandRaw가 `k.startsWith('nbl')` 자동운반) 특성상 ④⑬ 자동 포함 대상도 신규 필드가 없어 무변경.

- **①폼상태(AssetForm)**: 변경 없음 (신규 입력 필드 0).
- **②initial(factory)**: 변경 없음.
- **③normalize(calc-wizard-asset-nbl)**: 변경 없음.
- **④API변환(non-business-land-request buildNonBusinessLandRaw)**: 변경 없음 (nbl* 신규 필드 없음 → prefix-pick 무영향).
- **⑤UI위젯**: 변경 없음.
- **⑥사이드바합계**: 변경 없음.
- **⑦결과카드(components/calc/NonBusinessLandResultCard.tsx)**: **선택적 1지점**. 현행 카드는 `effectiveBusinessDays`(:77)·`businessUseRatio`(:79)만 표시하고 criteria boolean·criteriaUsed는 **미표시**(grep 확인: 카드에 rule2of3/rule5/rule80/criteriaUsed 참조 0건). 판정 결과(isNonBusinessLand)·기간분석 숫자는 엔진이 동일 필드로 계속 채우므로 **변경 불필요**. 단, 버킷·가나다 충족 여부를 노출하려면 이 카드 "기간 분석" 섹션(:69-88)에 버킷·가/나/다 충족 행 추가(optional, scope OUT 권장). **결정: 본 PR은 ⑦ 무변경**(엔진이 기존 필드를 법령정합값으로 채우므로 표시값만 정확해짐).
- **⑧validation(transfer-tax-validate-asset)**: 변경 없음 (신규 필수 입력 없음).
- **⑨Zod enum 메인 / ⑩Zod enum 컴패니언+addPropertyRefines / ⑪자산-수준 acquisitionDate fallback / ⑫Zod 입력객체(transfer-tax-schema-sub nbl*) / ⑬callTransferTaxAPI body spread / ⑭Route handler buildNblEngineInput·Date변환**: **전부 변경 없음**. 신규 입력 필드가 없으므로 Zod·route 매핑 무영향.

**결론: 14 동기화 지점 중 실제 코드 변경 0지점**(⑦은 선택적·본 PR 제외). 본 갭은 순수 엔진 로직 정정 + 테스트 재정렬 PR이다.

### 5. 엔진 로직 (함수·산식·삽입 위치)

대상 파일: `lib/tax-engine/non-business-land/period-criteria.ts` (현행 223줄 → 변경 후 ~280줄 예상, 800줄 정책 여유).

**5.1 보유기간 버킷 산정 헬퍼 신규** (period-criteria.ts, `meetsPeriodCriteria` 위에 삽입):
```
function resolveOwnershipBucket(totalOwnershipDays): 1 | 2 | 3
  // 일수 기준. "5년 이상"=총소유일수 ≥ 5년환산. 일관성: 1825(5×365) vs 달력5년 → 1차 1825 채택.
  // 5년/3년 경계 일수 환산은 win 길이(addYears 기반)와 동일 규칙 사용 권장 → 아래 §6 risk.
```
- 경계 정의: `total >= FIVE_YEARS_DAYS` → 1호; `total >= THREE_YEARS_DAYS` → 2호; else 3호. (FIVE/THREE_YEARS_DAYS 상수 명시. "이상"/"미만" 부등호 정확.)

**5.2 비사업용 기간 판정으로 전환** (period-criteria.ts:144-166 교체):
- 현행 windowing 계산(`bizInLast3`/`bizInLast5`/`ratio`, :122-140)은 **유지**(사업용 일수 측정 인프라). 추가로 **비사업용 일수** 산출:
  - `nonBizInWindow5 = win5len − bizInLast5`, `nonBizInWindow3 = win3len − bizInLast3`, `nonBizTotal = totalOwnershipDays − effectiveBusinessDays`. (win5len/win3len = `differenceInDays(window5Years.end, window5Years.start)` — 이미 :137-138에서 clip 계산됨, 재사용.)
- **비사업용 임계 환산**: `thresholdRatio`(사업용 비율 임계 0.6/0.8, :142)에서 `nonBizRatioThreshold = 1 − thresholdRatio`(0.4/0.2). 다목/나목(40%) = `nonBizTotal > floor(totalOwnershipDays × nonBizRatioThreshold)`. (법문 "100분의 40에 상당하는 기간을 초과" — floor 후 strict `>`. 일수 계산.)
- **버킷별 가·나·다 AND**:
  - 1호: `가 = nonBizInWindow5 > 730`; `나 = nonBizInWindow3 > 365`; `다 = nonBizTotal > floor(total × 0.4)`. `비사업용 = 가 && 나 && 다`.
  - 2호: `가 = nonBizTotal > (total − THREE_YEARS_DAYS)`; `나 = nonBizInWindow3 > 365`; `다 = (1호 다목과 동일)`. `비사업용 = 가 && 나 && 다`.
  - 3호: `가 = nonBizTotal > (total − TWO_YEARS_DAYS)` (단, total < TWO_YEARS_DAYS이면 가목 SKIP=무조건 충족 처리 안 함 — **단서: 가목 미적용 = AND에서 제외**); `나 = nonBizTotal > floor(total × 0.4)`. `비사업용 = (소유 2년 미만 ? 나 : (가 && 나))`.
- **레거시 0.8 처리**: 2015.2.2 이전 농·임·목은 `nonBizRatioThreshold=0.2`만 바뀜(다목/나목 환산). 가목·나목(720/365 일수 초과)은 법령상 비율과 무관하므로 불변. getThresholdRatio(:70-88)는 그대로 사용하고 `1−ratio`로 환산.
- **isBusiness = !비사업용** → `meets = isBusiness`.

**5.3 criteriaUsed·criteria 매핑** (하위호환):
- `criteria.rule80Percent` ← (다목/나목 40% 비사업용 미충족 = 사업용 비율 충족) 의미로 재정의. `rule2of3Years`/`rule5Years` ← 각 버킷 나목/가목 미충족(사업용) 의미. **boolean 필드명·갯수 불변** → result/UI/JSON 침묵 strip 없음.
- `criteriaUsed`: 사업용일 때 어느 목이 미충족(=사업용 결정요인)인지로 매핑하거나 기존 우선순위 유지. 결과카드 미사용이므로 회귀 안전 우선(기존 리터럴 재사용).
- `detail` 문자열: 버킷·가나다 충족 현황으로 갱신(한국어 풀어쓰기, 변수약어·floor 표기 금지 — 결과뷰 정책).

**5.4 상수**: `DAYS_2Y=730`·`DAYS_3Y=1095`(:63-64)는 **가목/나목 일수 초과 임계**로 의미 재정의(2년=730·1년=365·3년=1095 등). `TWO_YEARS_DAYS=730`·`THREE_YEARS_DAYS=1095`·`FIVE_YEARS_DAYS=1825` 명시 추가. 1년=365 상수 신설.

### 6. UI 변경

**없음** (본 PR scope). 결과카드(NonBusinessLandResultCard.tsx)는 엔진이 기존 필드(isNonBusinessLand·effectiveBusinessDays·businessUseRatio·criteria boolean)를 법령정합값으로 채우므로 표시 코드 무변경으로 정확해진다. 버킷·가나다 충족 행 노출은 선택적 후속(amount-column-align·formula-display-builder 스킬 적용). 결과뷰 "원" 미표기·내부 id 미노출 정책은 이미 준수(숫자에 "일" 단위, id 없음).

### 7. edge case · risk

- **5지목 공용 회귀 (최대 risk)**: period-criteria.ts는 farmland.ts:133·156, forest.ts:102·127, pasture.ts:92·107, other-land.ts:106·114·146·179, housing-land이 호출. 각 judge가 partial period(농지=재촌×자경 교집합, 임야=재촌, 목장=축산기간, 기타토지=fullPeriod[ownershipStart,transfer])를 넘김. **other_land·forest 공익·pasture 관련·farmland deemed은 fullPeriod(전체 사업용)를 넘기므로 nonBiz=0 → 비사업용 임계 절대 미충족 → 항상 사업용**(현행과 동일, 회귀 0). partial period(농지 real·임야 재촌 미달 후 fail)만 영향. → **각 judge별 PASS/FAIL anchor 5지목 전수 회귀 필수**(qa-land-type-flow.test.ts·integration.test.ts·각 {지목}.test.ts 전체 재실행).
- **경계 부등호**: 법문 "초과"=strict `>`. "이상/미만"(버킷)=`>=`/`<`. off-by-one 재발 방지 위해 가목 730/나목 365/다목 floor×0.4 모두 strict `>`로 통일. anchor에 정확히 730/365 경계값 케이스 포함.
- **소유기간 5년/3년 경계의 일수 환산**: 버킷 산정 `total >= 1825`(5×365)와 가목 `total − 1095`의 "3년"이 윤년에서 1일 어긋날 수 있음. 1호 가목은 win5len(addYears 기반)−730을 쓰므로 창 길이와 정합. 버킷 경계(정확히 5.0년)는 윤년 포함 여부로 ±1일 가능 → **확인 필요**(집행기준 1건). 단 현행 실증 divergence는 버킷 내부라 무영향.
- **기존 테스트 의도적 flip**: period-criteria.test.ts:29-41(②1095 PASS)·qa-period-criteria 일부가 OR semantics 기준 → 법령정합값으로 단언 수정 필수. **무지성 수정 금지** — 각 케이스를 §168조의6 가나다로 재계산해 toBe(false/true) 확정 후 describe에 "법령정합 재정렬" 표기(feedback_anchor_correction_legal_priority 정책).
- **clip 상호작용**: window_clip(:110·115)이 short bucket에서 windowN을 ownership으로 축소 → win3len/win5len이 total로 수렴. nonBizInWindow 계산 시 clip된 win 길이를 분모로 써야 정확(현행 :137-138 이미 clip 반영, 재사용).
- **gracePeriod 가산**: 유예기간 가산(:127-133)은 사업용 일수에 더해짐 → nonBiz 자동 감소. 가산 후에도 버킷 AND 적용. grace-wiring.test.ts 회귀 확인.
- **co-ownership·REDIRECT**: engine.ts의 지분 안분(:179)·별장 REDIRECT(:223)는 판정 결과(isNonBusinessLand)만 소비 → 본 변경 투명. integration.test.ts 회귀.

### 8. 작업 순서 (Pre-Do anchor 우선)

1. **Pre-Do**: bucket-criteria.test.ts 신설 → anchorTests의 isPreDo 케이스(1호 off-by-one) + 2호·3호 단기버킷 + 5지목 회귀 골격 작성·실행 → 현행 코드에서 1호/2호 FAIL 확보(현행 true 반환), 디자인 환류 기회. (pre-do-anchor-verification 스킬)
2. period-criteria.ts 재구현(§5).
3. 기존 period-criteria.test.ts·qa-period-criteria.test.ts의 OR-semantics 단언을 §168조의6 가나다로 재계산해 재정렬.
4. `npx vitest run __tests__/tax-engine/non-business-land/` 전체 → 5지목·integration·grace-wiring·qa 전부 green.
5. `npx tsc --noEmit` 0건 → `npm test` 전체 회귀(세법 회귀 허용치 0).

---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증)

> 7-에이전트 검토(인용 grep/Read 실측) 결과. 정정은 본 절을 우선(본문 인용과 충돌 시 본 절 기준).

| 우선 | 카테고리 | 정정 |
|---|---|---|
| High | 오류 | **5지목 회귀 정정(실측)**: `housing-land.ts`는 meetsPeriodCriteria **호출 0건**(:34=totalOwnershipDays). 5번째 호출자=**villa-land.ts:64(nonVilla 부분기간)·:101**. period-criteria 호출자=farmland·forest·pasture·other-land·**villa** 5종(housing 제외). 회귀목록·partial-period 영향군 정정, villa-land.test.ts 추가. |
| High | 누락 | flip 테스트: qa-period-criteria.test.ts **QA-001(:71)·QA-004(:159)·QA-006(:217)** criteriaUsed·criteria boolean 단언도 의미재정의로 깨질 수 있음 → §8 step3 추가. period-criteria.test.ts:17·43-54·71-81·115-126도 버킷 AND 하 케이스별 재확인. |
| Medium | 오류 | anchor 2호: total=1516은 **초일불산입**(getOwnershipStart=acq+1, period-math.ts:101-105). "취득+1517일" vs 보유 1516일 1일차=초일불산입 주석 추가. |
| Medium | 개선 | §6 UI: effectiveBusinessDays·businessUseRatio **숫자는 불변**, 변경=판정(isNonBusinessLand)+detail 문구뿐. "표시값만 정확해짐"→"판정·detail만 변경, 숫자 불변, 중과 +10%p는 판정 경유" 정정. |
| Medium | 누락 | criteria boolean 재정의 **매핑표** §5.3 추가: 1호 가나다·2호 가나다·3호 가나 → 3 레거시 boolean(rule2of3/rule5/rule80) 사상. 또는 echo `ownershipBucket?` 도입(의미 보존). 5년창 전제 필드명 2호/3호 재사용 혼선 명시. |
| Low | 모순 | 일수환산 일관성: 1호 가목=win5len-730(창연동)인데 2호/3호 가목=total-1095/730(고정). 법문 "소유기간에서 N년 차감"=소유기간 기준이라 고정 정당 — 근거 못박고 1호와 모델 차이 정당화. 확인필요 1곳(§1)으로 통합. |
