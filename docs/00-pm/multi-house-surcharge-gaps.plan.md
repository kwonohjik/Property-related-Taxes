# 다주택 중과 미구현 4건 — 구현 계획서

> 작성일: 2026-06-16 · worktree `feat/multi-house-gaps` (base `origin/master` @ 4579f999, #232)
> 검증 방법: 법령 = KoreanLaw MCP **소득세법 시행령 MST 286211**(시행 20260522) 본문 직접 대조 / 코드 = 실측 file:line (엔진·Zod·route 핵심은 작성자 직접 재확인, UI 레이어는 UI 시니어 실측 기반 — **Do 착수 시 grep 재확인**, line drift 대비)
> 정책 준거: `feedback_numeric_impact_verify_before_bug_claim` · `feedback_api_zod_schema_sync`(14지점) · `feedback_pre_anchor_verification` · `feedback_no_silent_apportion_fallback` · `feedback_korean_law_citation_verify`

---

## 0. 핵심 진단 (한 줄 요약)

다주택 중과 엔진은 충실히 구현돼 있으나, **신축/준공후미분양 특례(§167의3①12)·인구감소 가액한도(다·라목)·분양권 가액배제(§167의4·11②)·혼인 주택수차감(§167의3⑨)** 4건이 **입력 경로 부재 또는 로직 미구현**으로 작동하지 않는다. "현재 광범위 과세오류"는 아니며(트리거 입력 UI 자체가 없음) **충실도(법령 정합) 갭**이다.

---

## 1. 범위 및 우선순위

| 순위 | 갭 | 성격 | 엔진 | UI/API(14지점) | 난이도 |
|---|---|---|---|---|---|
| #1 | 신축·준공후미분양 입력 경로 + 나목 상수 + 가목 준공일 | 입력경로 부재 + 상수 오류 | 상수 2 + 준공일 검증 | 신규 **4필드** ×14지점 | 중 |
| #2 | §167의3⑨(+§167의4⑤) 혼인 배우자 주택수 차감 | 로직 미구현 + 데이터 부족 | 신규 로직 + 입력 | 신규 1필드(`isSpouseOwned`) ×14지점 | 중상 |
| #3 | 인구감소 세컨드홈 다·라목 정합(가액한도) | 로직 미구현 | price limit + 조번호 | **populationAreaType 1필드**(다목 9억)+officialPrice 기존 | 중 |
| #4 | 분양권/입주권 VALUE 3억 이하 배제 | 타입·로직·UI 전부 부재 | PresaleRight 확장 + 로직 | 분양권 개별입력 모달 | 상 |

**비범위(이번 계획 외)**: §167의10①4호(수도권밖 §155⑧) — 1차 검토에서 "확인 필요"로 남겨둠. 별도 검증 후 결정.

**권고 시퀀스**(영향도·의존도 기준): **#0(helpers 분할) → #1 → #3 → #2a(주택 차감) → #4 → #2b(분양권 차감 §167의4⑤)**. (#3은 엔진 단독·즉효, #2·#4는 신규 입력 필드 동반 공수↑. #2의 분양권 차감 파트는 #4(PresaleRight 확장) 완료 후에야 가능 → #2를 2a/2b로 분할. Do는 항상 엔진 선행 → UI 후행.)

---

## 2. 법령 근거 (전수 검증 완료 — MST 286211)

### §167조의3①12 (3주택 중과 제외 주택)
- **가목(소형 신축)**: 2024.1.10~**2027.12.31** 취득, 전용 **60㎡**↓, 취득가 **6억**(수도권 밖 3억)↓, 2024.1.10~2027.12.31 준공, 아파트(도시형생활주택 아파트 제외) 아닐 것
- **나목(준공후미분양)**: 2024.1.10~**2026.12.31** 취득, 전용 **85㎡**↓, 취득가 **7억**↓, 수도권 밖 소재
- **다목(인구감소지역, 2026.1.1~)**: 인구감소지역 소재(수도권·광역시 제외, 접경지역 예외) + 취득 전 보유주택과 **동일 시·군·구 아닐 것** + 기준시가 **4억(수도권 밖 인구감소지역 9억)**↓
- **라목(인구감소관심지역, 2026.1.1~)**: 수도권 밖 인구감소관심지역 소재(광역시 제외) + 동일 시·군·구 아닐 것 + 기준시가 **4억**↓

### §167조의3⑨ (혼인 합가 주택수 차감)
1주택+ 보유자끼리 혼인 → 혼인일 현재 1세대 3주택+ → **혼인일부터 5년 이내** 양도 시 **양도일 현재 배우자 보유 주택 수를 차감**하여 1세대 주택 수 계산. **단서**: 혼인 5년 내 신규주택 취득 시, 그 취득일 이후 양도분은 미적용.

### §167조의4② (3주택+입주권/분양권 제외) · §167조의11② (2주택+입주권/분양권 제외)
- **각 ②1호**: 수도권·광역시·세종 외 지역 소재 주택·조합원입주권·**분양권**으로서 가액(분양권은 **공급계약서상 공급가격**, 입주권은 종전주택가격, 주택은 기준시가)이 양도 당시 **3억원 이하**면 주택 수 **미산입**
- **각 ②2호**: §167의3①12호 해당 주택도 미산입
- **§167의4⑤**: 혼인 5년 이내 3주택+권 → 배우자 보유 주택·입주권·분양권 수 차감(§167의3⑨의 권리 포함판)

---

## 3. Gap별 구현 설계

### 🔴 #1 — 신축·준공후미분양 특례 입력 경로 신설 + 나목 상수 정정

#### 근본 원인 (검증)
`isSmallNewHouseSpecial`(`lib/tax-engine/multi-house-surcharge-helpers.ts:321`)이 `house.acquisitionPrice` 없으면 **line 322에서 즉시 false**. `HouseInfo` 타입엔 `acquisitionPrice`(types:133)·`exclusiveArea`(types:93)·`isUnsoldNewHouse`(types:135)가 **이미 선언**돼 있으나, 폼→API→Zod→Route 전 경로에 전달 코드가 없어 항상 undefined → 가목·나목 특례 dead code.

#### 엔진 변경 (나목 상수 2 + 가목 준공일 검증)
| 파일:line | 현재 | 변경 |
|---|---|---|
| `helpers.ts:341` | `acqDate <= new Date("2025-12-31")` | `"2026-12-31"` (나목 취득기간) |
| `helpers.ts:344` | `house.acquisitionPrice <= 600_000_000` | `<= 700_000_000` (나목 취득가 7억) |

> 가목(327-336)은 취득가·면적·아파트 요건 법령 일치. **가목 3호(준공일 2024.1.10~2027.12.31)는 ✅`HouseInfo.completionDate` 신설 구현 결정**(사용자 확정 — `redevelopment.completionDate`는 LTHD용 별개). → #1 신규 필드 **4개**(acquisitionPrice·exclusiveArea·isUnsoldNewHouse·completionDate) 각 14지점. 상수는 `legal-codes/transfer.ts` `MULTI_HOUSE`에 명명 추출.
>
> ⚠️ **선행 필수**: `helpers.ts`가 현재 **798줄**(800 정책 임박) — #3·#2·#4 로직 추가 전 `countEffectiveHouses`→`multi-house-surcharge-count.ts`, `determineSurchargeExclusion`→`multi-house-surcharge-exclusion.ts` 추출 선행. #1 상수 2건은 분할 없이 가능.

#### 14 동기화 지점 (신규 필드 `acquisitionPrice`·`exclusiveArea`·`isUnsoldNewHouse`)
| # | 지점 | 파일:line | 변경 | 검증 |
|---|---|---|---|---|
| ① | 폼 상태 HouseEntry | `lib/stores/calc-wizard-asset-nbl.ts`(현 `isApartment`:48·`isUnsoldHousing`:50) | `acquisitionPrice?: string`·`exclusiveArea?: string`·`isUnsoldNewHouse?: boolean` | ✔작성자 |
| ② | initial factory | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx:272`(newHouse) | `acquisitionPrice: ""`·`exclusiveArea: ""`·`isUnsoldNewHouse: false` | UI시니어 |
| ③ | normalize | — | **N/A** — `calc-wizard-migration.ts`에 houses 처리 자체 없음(grep 0건). 신규 필드 optional → 구 sessionStorage 자동 호환 | ✔작성자 |
| ④⑬ | API 변환 | `lib/calc/transfer-tax-api-houses.ts:54-116`(otherHouses map) | `acquisitionPrice: parseAmount(h.acquisitionPrice)||undefined`·`exclusiveArea: parseDecimal(h.exclusiveArea)||undefined`·`isUnsoldNewHouse: h.isUnsoldNewHouse` | ✔작성자 |
| ⑤ | UI 위젯 | `components/calc/transfer/HouseEntryEditor.tsx`(BasicInfoSection 56-126) | 공시가격 아래 취득가 `CurrencyInput`·전용면적 `DecimalInput` + 특례 chip 행에 `준공후미분양` `ToggleCard variant=chip` | UI시니어 |
| ⑥ | 사이드바 | `lib/stores/calc-wizard-store.ts` computeTransferSummary | **해당 없음**(보유주택 보조입력, 합계 비노출) | UI시니어 |
| ⑦ | 결과 카드 | `components/calc/MultiHouseSurchargeDetailCard.tsx`(`small_new_house` 라벨:35·detail:110) | **#1만 변경 불요**(엔진 detail 자동 노출). ⚠️ #2·#4는 표기 enum/필드 신규 필요 — 각 갭 참조 | UI시니어 |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts`(houses 루프) | 미입력=특례 비발동(오류 아님, 자동fallback 금지 준수). `isUnsoldNewHouse=true`인데 취득가·면적 미입력 시 **non-blocking 경고**만 | UI시니어 |
| ⑨⑩⑪ | enum/companion/fallback | — | 해당 없음(boolean/number, enum 아님) | — |
| ⑫ | **Zod houseSchema** | `lib/api/transfer-tax-schema-sub.ts:200-254` | `acquisitionPrice: z.number().int().nonnegative().optional()`·`exclusiveArea: z.number().nonnegative().optional()`·`isUnsoldNewHouse: z.boolean().optional()` 추가. **현재 부재 확인**(228 `acquisitionOfficialPrice`는 다른 필드) → 미추가 시 Zod strip | ✔작성자 |
| ⑭ 단건 | Route 엔진 매핑 | `lib/api/transfer-route-multi-house.ts:23-79`(`mapHousesToEngine`) | 3필드 추가(Date 변환 불요 — number/boolean) | ✔작성자 |
| ⑭ 다건 | **다건 Route 인라인 map** | `app/api/calc/transfer/multi/route.ts:146-158` | **8필드만 매핑 — `mapHousesToEngine` 미재사용**. 3필드 추가 필요 | ✔작성자 |

#### 🚨 HIGH 리스크 (검증됨)
1. **⑫ 우선 수정**: `houseSchema`에 3필드 없으면 ④⑬에서 값을 넣어도 Zod가 strip → ⑫를 먼저.
2. **⑭ 다건 경로 dead**: `multi/route.ts:146-158`은 `mapHousesToEngine`를 안 쓰고 **8개 기본 필드만** 인라인 매핑 → **인구감소·부득이사유·장기임대 9유형 등 P2 특례 전부가 다건 계산에서 이미 dead**(#1 이전부터의 선재 갭). **권고: 다건 인라인 map을 `mapHousesToEngine` 재사용으로 교체**(단일 진실) → #1 + 선재 P2 갭 동시 해소.

#### 케이스 매트릭스 (소형신축/미분양)
| 입력 | 엔진 결과 |
|---|---|
| acquisitionPrice 미입력 | 특례 비발동(helpers.ts:322 early-return) |
| exclusiveArea 미입력(0) | 면적요건 실패 → 비발동 |
| 취득 2024.1.10~2027.12.31 + 60㎡↓ + 非아파트 + 취득가 수도권6억/지방3억↓ | **가목 발동**(주택수+중과 동시 배제) |
| isUnsoldNewHouse=true + 취득 2024.1.10~2026.12.31 + 非수도권 + 85㎡↓ + 7억↓ | **나목 발동** |
| 요건 미충족 | 일반 주택 산입 |

---

### 🟠 #2 — §167의3⑨(+§167의4⑤) 혼인 합가 배우자 주택수 차감

#### 근본 원인 (검증)
`MultiHouseSurchargeInput.marriageMerge`(types:248-250)에 `marriageDate`는 있으나 **"어느 주택이 배우자 소유인지" 식별 데이터가 없음**. 기존 `marriageMerge`는 §167의10①2호(2주택 혼인 *배제*) 용도로만 사용 — §167의3⑨(주택수 *차감*)와 **효과가 다름**(⑨는 count 자체를 줄여 3주택 진입 차단). `countEffectiveHouses`(helpers.ts:369-502)에 차감 로직 없음.

#### 설계 (2a 주택 차감 / 2b 분양권 차감 분할)
1. **데이터 모델**: `HouseInfo`에 `isSpouseOwned?: boolean` 신규(배우자 단독보유 주택 표시). → **신규 필드 ⇒ #1과 동일하게 14지점 동기화**(①②④⑤⑧⑫⑭ 단건·다건; ③은 optional이라 N/A). 분양권 차감(§167의4⑤)은 `PresaleRight.isSpouseOwned`까지 필요 → **#4(PresaleRight 확장) 완료 후 2b로 분리**.
2. **엔진 로직**(⚠️ **오케스트레이터 `determineMultiHouseSurcharge` Step1 직후 주입** — `countEffectiveHouses`는 marriageMerge 미수신 시그니처라 그 안에 넣을 수 없음. 시그니처 무변경):
   - `marriageMerge` 존재 + `transferDate ∈ [marriageDate, marriageDate+5년]` + **혼인일 이후 신규취득 주택 없음**(단서) → `isSpouseOwned===true` 주택을 effectiveHouseCount에서 차감 + excludedHouses push.
   - 효과: count 3→1이면 중과 없음, 3→2이면 `multi_house_2`(3plus 미진입). 의사코드 `.engine.design.md` §4#2.
3. **3주택 전용**: §167의3⑨은 3주택 판정용. 2주택 혼인은 기존 §167의10①2호 배제로 처리 — **효과 구분 주석 필수**(⑨=count 차감, 10①2호=중과 배제).
4. **결과 표기(⑦)**: 현 `ExcludedHouse.reason`·`ExclusionReason`에 혼인 차감 항목 없음 → `ExcludedHouse.reason`에 `spouse_marriage_subtraction` 추가 + `MultiHouseSurchargeDetailCard` 라벨. **누락 시 차감돼도 결과 무표기**.

#### 리스크
- 신규 `isSpouseOwned` 14지점 누락 시 또 다른 침묵 strip. #1과 동일 패턴이므로 #1 직후 진행 시 재사용 용이.
- §167의4⑤(입주권/분양권 포함 차감)은 #4(PresaleRight 확장)와 의존 → #4 이후 또는 동시.

---

### 🟡 #3 — 인구감소 세컨드홈 다·라목 정합 (가액 한도)

#### 근본 원인 (검증)
`countEffectiveHouses`(helpers.ts:478-489)가 `isPopDecline && isSecondHomeRegistered`만 보고 **가액 한도·동일시군구 조건 미검증**. 코드 주석(line 478)은 구 조번호 "2호의2" — 현행은 **§167의3①12 다·라목**(2026.1.1~)으로 조번호 정정 필요.

#### 설계 (엔진 + 최소 입력 1필드)
- **기존 입력 완비**: `isPopulationDeclineArea`·`isSecondHomeRegistered`·`officialPrice` 전 경로 매핑됨(단 **다건 route 선재 갭** — #1과 함께 해소).
- **신규 입력 `populationAreaType`(decline/interest)** ✅확정(사용자 결정): 다목 9억/라목 4억 구분 → #3도 14지점 최소 동기화(①②⑤⑧⑫⑭).
- **가액 한도 추가**: 기준시가 한도 = **4억 기본, 수도권 밖 인구감소지역 9억**. 초과 시 세컨드홈 배제 미적용(주택 수 산입).
- **다목 vs 라목 구분 이슈**: 현재 boolean 1개로는 인구감소지역(다목)/관심지역(라목) 구분 불가 → 9억(수도권밖 인구감소지역) 적용 대상 식별 곤란. **설계 결정 필요**:
  - (A) `regionCode` + `classifyPopulationDeclineArea`(decline/interest 반환 확장)로 자동 판정 — `regionCode` 매핑 추가 필요(현재 미전달)
  - (B) `isPopulationDeclineArea`를 `populationAreaType?: "decline"|"interest"` enum으로 세분 — 신규 입력 1필드
- **동일 시·군·구 조건**(다·라목 2호): "취득 전 보유주택과 동일 시군구 아닐 것" — 현재 미구현. 비교용 시군구 데이터 필요 → **2차 정밀화로 분리**(최소 구현은 가액 한도 우선).

> 최소 정확화(가액 한도)만으로도 "4억 초과 세컨드홈 오배제"를 차단. 동일시군구·다라목 구분은 후속.

---

### 🟡 #4 — 분양권/입주권 VALUE지역 3억 이하 배제 (가장 큰 범위)

#### 근본 원인 (검증)
- 엔진 `PresaleRight`(types:209-214)는 `id·type·acquisitionDate·region` **4필드뿐** — 가액 없음.
- `countEffectiveHouses`(495-499)는 `acquisitionDate >= 2021.1.1`이면 **무조건 +1**.
- 전 경로(폼 `PresaleRightsSection`·Zod `presaleRightSchema`:257-262·`mapPresaleRightsToEngine`:82-92)가 4필드만.
- 법령(§167의4②1호·§167의11②1호): **비수도권 3억 이하 분양권/입주권 미산입**.

#### 설계 (엔진 + UI 둘 다 신규)
1. **엔진**: `PresaleRight`에 `rightValue?: number`(분양권=공급계약서상 공급가격(선택품목 제외)/입주권=종전주택가격 도시정비법§74①5호) + **`regionCriteria?: "REGION"|"VALUE"`** 추가. ⚠️ 현 `region`은 `capital/non_capital` 2분뿐 → **광역시·세종 분양권이 잘못 3억 배제 대상**(법은 "수도권·광역시·세종 외"=VALUE만). HouseInfo와 동형 REGION/VALUE 필요. `countEffectiveHouses` presaleRights 루프: `regionCriteria==="VALUE" && rightValue<=300_000_000` → skip(+1 안 함).
2. **결과 표기**: 분양권 제외는 현재 `count++` 스킵일 뿐 추적 수단 없음(ExcludedHouse는 주택 전용) → `MultiHouseSurchargeResult.excludedPresaleRights[]` 추가 + 결과뷰 표기.
3. **UI**: `PresaleRightsSection`(현 3필드 인라인) → 가액 + 지역기준(광역시 구분) 입력 추가. 항목 적으면 인라인 유지, 많으면 `HouseEntryEditor` 패턴 모달화.
4. **Zod/route**: `presaleRightSchema` + `mapPresaleRightsToEngine`에 `rightValue`·`regionCriteria` 추가.

#### 공수/리스크
- 엔진 ~0.5d + UI ~0.5~1d. 4건 중 최대. **#2의 §167의4⑤(분양권 차감)와 의존** → #4 먼저 또는 동시.
- ✅ **이번 사이클 포함 확정**(사용자 결정): 엔진(PresaleRight 확장)+UI(분양권 가액·지역) + #2b(§167의4⑤ 분양권 차감)까지 포함.

---

## 4. 작업 순서 (PDCA Do — 엔진 선행 → UI 후행, 강제)

```
[#0] 선행: helpers.ts(798줄) 분할 — countEffectiveHouses→-count.ts, determineSurchargeExclusion→-exclusion.ts (#1 상수만이면 생략 가능, #3부터 필수)
[#1] 엔진(나목 상수 2개) → Pre-Do anchor 실행(실패 확인)
  → ⑫ Zod → ⑭ 단건/다건(mapHousesToEngine 통합) → ④⑬ API → ①②⑤ 폼/위젯 → ⑧ validate (③ N/A)
  → anchor 통과 + E2E
[#3] 엔진(price limit + 조번호, 분할 후 -count.ts) → anchor → (입력 기존) → 결과 확인
[#2a] 엔진(isSpouseOwned 주택 차감) → 신규 필드 14지점 + 결과 enum → anchor
[#4] 엔진(PresaleRight rightValue+regionCriteria + 결과 추적) → UI(분양권 가액·지역) → anchor
[#2b] §167의4⑤ 분양권 차감 (PresaleRight.isSpouseOwned, #4 의존) → anchor
```

각 갭은 **격리 worktree(`feat/multi-house-gaps`) 내 단일 응답 완주** + 커밋 분리.

---

## 5. Pre-Do Anchor 목록 (Do 전 우선 작성·실행 — 실패 확보)

`__tests__/tax-engine/transfer/multi-house-gaps-*.test.ts`

| # | anchor | 입력 | 기대(수정 후) | 현재(실패 이유) |
|---|---|---|---|---|
| #1-가 | 소형신축 주택수 제외 | 3주택, 1채: 2025 취득·전용 50㎡·취득가 **2.5억**·비아파트·**비수도권(한도 3억)** | effectiveHouseCount 2, excluded `small_new_house` | acquisitionPrice 미도달 → 산입(=3) |
| #1-가R | 소형신축 한도 초과 | 위 + 취득가 3.5억(비수도권 3억 초과) | 산입(가목 미발동) | — |
| #1-나 | 준공후미분양 7억 경계 | isUnsoldNewHouse, 취득가 **7억**·2026.6 취득·비수도권·80㎡ | 제외 | 코드 6억·2025.12.31 컷 → 미제외 |
| #1-나R | 준공후미분양 7.0001억 | 취득가 700,000,001 | **산입**(한도 초과) | — |
| #3-라 | 인구감소관심지역(라목) 가액한도 | 수도권밖 관심지역 세컨드홈, 기준시가 **5억**(한도 4억) | **산입**(초과→배제 미적용) | 현재 무조건 배제(=제외) |
| #3-다 | 인구감소지역(다목) 9억 | 수도권밖 인구감소지역, 기준시가 **8억** | 제외(9억↓) | 현재 무조건 배제(우연 일치, 한도 미검증) |
| #3R | 한도 이하 | 라목, 기준시가 3.5억 | 제외 | 통과(기존) |
| #2 | 혼인 5년내 배우자주택 차감(소멸) | 본인1(양도)+배우자2, 혼인 2년전, 신규취득 없음 | 배우자2 차감 → count 1 → **중과 없음** | 차감 없음 → 3주택 중과 |
| #2-2h | 차감 후 2주택 잔존 | 본인2+배우자1, 혼인 2년전(조정지역) | 배우자1 차감 → count 2 → `multi_house_2`(3plus 미진입) | 3주택 중과 |
| #2단서 | 혼인후 신규취득 | 위 + 혼인후 1채 취득 | 차감 미적용(원 count 유지) | — |
| #2-5y | 혼인 5년 경과 | 혼인 6년전 양도 | 차감 미적용(5년 초과) | — |
| #4 | VALUE지역 3억 분양권 | 2주택 상당 + VALUE지역(지방, 광역시 아님) 분양권 rightValue 2.5억(2022취득) | 미산입 | 무조건 +1 |
| #4R | VALUE지역 3.5억 분양권 | rightValue 3.5억 | 산입 | — |
| #4-광역 | 광역시 분양권(REGION) | 광역시 분양권 2.5억 | **산입**(REGION은 가액무관) | (regionCriteria 없으면 오배제 위험) |

> 메모리 `feedback_progressive_deduction_accuracy`·`feedback_anchor_correction_legal_priority`: 경계값은 법령 한도 정확값으로 ±1원/㎡ 인접 케이스 동봉.

---

## 6. 회귀 / 검증

- `npx vitest run __tests__/tax-engine/transfer/` 전체 + 신규 anchor
- 차단 validation 추가 없음(경고만) → 전세목 E2E 회귀 불요. 단 houses 입력 폼 E2E 1건(`e2e/transfer-multi-house-*.spec.ts`, **`E2E_PORT=3103`**)
- `npx tsc --noEmit` 0건(신규 14지점 ⑫⑬⑭ grep 자가점검)
- 브라우저 수동: 보유주택에 취득가·전용면적·미분양 입력 → Network 탭 request body 신규 필드 확인

---

## 7. 리스크 / 미해결

| 구분 | 내용 |
|---|---|
| HIGH | **helpers.ts 798줄 — #3부터 분할 선행 필수**. ⑫ houseSchema 선수정 필수(strip). ⑭ 다건 route는 `mapHousesToEngine` 미사용 → 통합 권장(houseSchema 공유 확인 ✓, 선재 P2 갭 동반 해소) |
| MEDIUM | #2·#4는 신규 입력 필드 동반 → 각자 14지점 풀 동기화. #2 분양권 차감(§167의4⑤)은 #4 의존 |
| MEDIUM | #3 다목/라목 구분 + 동일시군구 조건 — 설계 결정(regionCode 매핑 vs enum 세분) 필요. 최소구현=가액한도 |
| 확인필요 | 다건 route houses 인라인 map의 P2 필드 선재 누락 범위(인구감소·부득이사유 등) — #1 통합 수정 시 함께 점검 |
| 비범위 | §167의10①4호(수도권밖 §155⑧) / #4 분양권 deferral 여부 — 사용자 결정 |

---

## 8. 변경 파일 체크리스트 (Do)

**엔진(Layer 2)**
- [ ] **선행 분할**: `multi-house-surcharge-count.ts`(countEffectiveHouses) · `multi-house-surcharge-exclusion.ts`(determineSurchargeExclusion) 추출 (helpers 798줄)
- [ ] `lib/tax-engine/multi-house-surcharge-helpers.ts`(또는 분할본) — 나목 상수(341·344), #3 price limit(478-489)+조번호, #2 차감 로직, #4 presaleRights 루프(495-499)
- [ ] `lib/tax-engine/types/multi-house-surcharge.types.ts` — #1 `HouseInfo.completionDate`(가목3호 신설), #2 `HouseInfo.isSpouseOwned` + `ExcludedHouse.reason: spouse_marriage_subtraction`, #3 `HouseInfo.populationAreaType`, #4 `PresaleRight.rightValue`·`regionCriteria` + `MultiHouseSurchargeResult.excludedPresaleRights` (#1 acquisitionPrice·exclusiveArea·isUnsoldNewHouse 기존)
- [ ] `lib/tax-engine/legal-codes/transfer.ts` — 나목 상수 명명 추출, 인구감소 한도(4억/9억) 상수
- [ ] `lib/tax-engine/data/population-decline-areas.ts` — (#3-A 채택 시) classify 확장(decline/interest 반환)

**API/Route**
- [ ] `lib/api/transfer-tax-schema-sub.ts` — houseSchema 3필드(#1)+`isSpouseOwned`(#2) / presaleRightSchema `officialPrice`(#4)
- [ ] `lib/api/transfer-route-multi-house.ts` — mapHousesToEngine 3필드+isSpouseOwned / mapPresaleRightsToEngine rightValue·regionCriteria
- [ ] `app/api/calc/transfer/multi/route.ts:146-158` — **mapHousesToEngine 재사용 교체**(권장)

**클라이언트**
- [ ] `lib/stores/calc-wizard-asset-nbl.ts` — HouseEntry/PresaleRightEntry 필드
- [ ] `lib/calc/transfer-tax-api-houses.ts` — buildHousesPayload 매핑(houses 3필드 + #4 분양권 rightValue·regionCriteria)
- [ ] `lib/calc/transfer-tax-validate.ts` — non-blocking 경고
- [ ] ~~`calc-wizard-migration.ts`~~ — N/A(houses 미처리, optional 필드 자동 호환)
- [ ] `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx` — factory 초기값
- [ ] `components/calc/transfer/HouseEntryEditor.tsx` — 위젯(취득가·전용면적·미분양 chip·배우자보유)
- [ ] `components/calc/transfer/PresaleRightsSection.tsx` — #4 가액·지역기준(광역시 구분) 입력
- [ ] `components/calc/MultiHouseSurchargeDetailCard.tsx` — #2 `spouse_marriage_subtraction` 라벨 + #4 `excludedPresaleRights` 표기

**테스트**
- [ ] `__tests__/tax-engine/transfer/multi-house-gaps-*.test.ts` — §5 anchor
- [ ] `e2e/transfer-multi-house-*.spec.ts` — 입력 폼 E2E (E2E_PORT=3103)
