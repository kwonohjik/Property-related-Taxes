# multi-house-surcharge-gaps — UI 설계 (Layer 1 + 14지점)

> 계획: `docs/00-pm/multi-house-surcharge-gaps.plan.md` · 엔진설계: `multi-house-surcharge-gaps.engine.design.md`
> 근거: UI 시니어 실측(HouseEntryEditor·PresaleRightsSection·route) — **file:line은 Do 착수 시 grep 재확인**(line drift). 엔진·Zod·route 핵심은 작성자 직접 재확인.
> 범위: 4건의 입력 위젯·14 동기화 지점·검증·결과 표기. 엔진 로직/타입은 engine.design 참조.

---

## 1. 신규 입력 필드 (갭별)

| 갭 | 필드 | 위젯 | 위치(HouseEntry/PresaleRight) |
|---|---|---|---|
| #1 | `acquisitionPrice`(취득가) | `CurrencyInput`+parseAmount | HouseEntryEditor BasicInfoSection |
| #1 | `exclusiveArea`(전용면적㎡) | `DecimalInput`+parseDecimal | 동상 |
| #1 | `completionDate`(준공일) | `DateInput` | 동상 (가목 3호 검증) |
| #1 | `isUnsoldNewHouse`(준공후미분양) | `ToggleCard variant=chip` | 동상 특례 chip 행 |
| #2 | `isSpouseOwned`(배우자 보유) | `ToggleCard variant=chip` | 관계속성 → 특수 섹션 권장(물리속성 chip과 분리) |
| #3 | `populationAreaType`(인구감소/관심) | `RadioCardGroup` | `isPopulationDeclineArea` ON 시 조건부 |
| #4 | `rightValue`(분양권 가액) | `CurrencyInput` | PresaleRightsSection |
| #4 | `regionCriteria`(REGION/VALUE) | region 파생 또는 `RadioCardGroup` | 동상 |

---

## 2. 위젯 배치 (ASCII)

### 2-A. HouseEntryEditor — BasicInfoSection (#1·#2·#3)
```
┌─ ① 기본정보 (sky) ─────────────────────────────┐
│ 지역        ◉ 수도권   ○ 비수도권   (RadioCardGroup)│
│ 취득일      [ 2025-03-01 ]            (DateInput)   │
│ 공시가격    [        300,000,000 ]   (CurrencyInput)│
│ 취득가액    [        250,000,000 ]   (CurrencyInput)│  ← #1 신규
│   ⓘ 소형신축·준공후미분양 특례 가액 기준 (hint)      │
│ 전용면적    [          50.00 ] ㎡    (DecimalInput) │  ← #1 신규
│ 준공일      [ 2025-02-01 ]            (DateInput)   │  ← #1 신규(가목3호)
│ 특례 chip:  [아파트] [오피스텔] [미분양] [준공후미분양]│  ← isUnsoldNewHouse #1
│             [배우자 보유]                            │  ← isSpouseOwned #2
└────────────────────────────────────────────────────┘
┌─ 특수 배제 (HouseEntrySpecialExclusionSection) ─────┐
│ [인구감소지역 세컨드홈]  ← isPopulationDeclineArea   │
│   └ ON 시 ▼                                          │
│   유형  ◉ 인구감소지역(다목)  ○ 인구감소관심지역(라목)│  ← populationAreaType #3
│   [세컨드홈 등록]  ← isSecondHomeRegistered          │
└────────────────────────────────────────────────────┘
```

### 2-B. PresaleRightsSection (#4)
```
┌─ 분양권/입주권 ────────────────────────────────────┐
│ 종류   ◉ 분양권  ○ 입주권        (RadioCardGroup)   │
│ 취득일 [ 2022-05-01 ]            (DateInput)        │
│ 지역기준 ◉ 수도권·광역시·세종(REGION) ○ 지방(VALUE) │  ← regionCriteria #4
│ 가액   [        250,000,000 ]   (CurrencyInput)     │  ← rightValue #4 (REGION 시 회색/비활성: 가액무관 산입)
│   ⓘ 분양권=공급계약서 공급가격 / 입주권=종전주택가격  │
└────────────────────────────────────────────────────┘
```
> regionCriteria는 기존 `region`(capital/non_capital)이 광역시를 비수도권에 뭉뚱그려 **광역시 3억 오배제** 발생 → REGION/VALUE 명시 라디오로 분리. (engine.design §4#4)

---

## 3. 14 동기화 지점 (UI/클라이언트 8 + API 6)

| # | 지점 | 파일 | #1(3필드) | #2(isSpouseOwned) | #3(populationAreaType) | #4(rightValue·regionCriteria) |
|---|---|---|---|---|---|---|
| ① | HouseEntry/PresaleRightEntry 타입 | `calc-wizard-asset-nbl.ts` | 3필드 | 1 | 1 | PresaleRightEntry 2필드 |
| ② | factory initial | `HousesListSection.tsx`·PresaleRights factory | `""`/`false` | `false` | `undefined` | `""`/region파생 |
| ③ | normalize | — | **N/A**(optional) | N/A | N/A | N/A |
| ④⑬ | API 변환 | `transfer-tax-api-houses.ts` buildHousesPayload + presale | 매핑 | 매핑 | 매핑 | 매핑 |
| ⑤ | UI 위젯 | `HouseEntryEditor.tsx`·`HouseEntrySpecialExclusionSection.tsx`·`PresaleRightsSection.tsx` | §2-A | §2-A chip | §2-A 라디오 | §2-B |
| ⑥ | 사이드바 | `calc-wizard-store.ts` | N/A(보조입력) | N/A | N/A | N/A |
| ⑦ | 결과 카드 | `MultiHouseSurchargeDetailCard.tsx` | 기존 detail 자동 | **신규 `spouse_marriage_subtraction` 라벨** | 기존 사유 라벨 | **신규 `excludedPresaleRights` 표기** |
| ⑧ | validation | `transfer-tax-validate.ts` | non-blocking 경고 | — | — | rightValue Zod nonnegative(일원화) |
| ⑨⑩⑪ | enum/companion/fallback | — | N/A | N/A | N/A | N/A |
| ⑫ | Zod | `transfer-tax-schema-sub.ts` houseSchema·presaleRightSchema | 3필드 | 1 | `z.enum(["decline","interest"]).optional()` | 2필드 |
| ⑭단건 | mapHousesToEngine | `transfer-route-multi-house.ts` | 3필드 | 1 | 1 | mapPresaleRights 2필드 |
| ⑭다건 | multi route 인라인 | `multi/route.ts:146-158` | **mapHousesToEngine 재사용 교체**(선재 P2 갭 동반 해소) | ↑ | ↑ | ↑ |

> ⚠️ **⑫⑬⑭ TS 미감지 침묵 strip** — 각 갭 신규 필드마다 grep 자가점검. **다건 route는 단건과 별도 경로** → mapHousesToEngine 통합으로 일괄.
>
> ⚠️ **#2 의존**: 차감은 per-house `isSpouseOwned` + **세대 `marriageMerge.marriageDate`** 둘 다 필요. marriageDate 입력 위젯 위치 **확인 필요**(§167의10①2호 2주택 혼인배제용으로 기존 존재 추정 — Do 착수 시 grep, 없으면 신규 추가).

---

## 4. UI 케이스 매트릭스 (분기 enumerate)

| 토글/필드 | 상태 | UI 동작 |
|---|---|---|
| isUnsoldNewHouse | OFF(기본) | 취득가·전용면적은 가목 판정에만(미분양 무관) |
| isUnsoldNewHouse | ON + 취득가·면적 미입력 | **non-blocking 경고**(차단 아님, 자동 fallback 금지) |
| isPopulationDeclineArea | OFF | populationAreaType·세컨드홈 숨김 |
| isPopulationDeclineArea | ON | populationAreaType 라디오 노출(기본 미선택→라목 4억 보수 적용) |
| populationAreaType | decline + 비수도권 | 9억 한도(엔진) |
| populationAreaType | interest | 4억 한도 |
| PresaleRight regionCriteria | REGION | 가액 무관 산입(가액 입력 비활성/회색) |
| PresaleRight regionCriteria | VALUE | 가액 ≤3억 시 미산입 |
| isSpouseOwned | ON + marriageMerge 미입력 | 차감 미발동(혼인일 필수) — 경고 |

---

## 5. 결과 카드 (⑦) 보강

`MultiHouseSurchargeDetailCard.tsx`:
- **#2**: `ExcludedHouse.reason === "spouse_marriage_subtraction"` → 라벨 "혼인 5년내 배우자 주택 차감 (§167의3⑨)" + detail.
- **#4**: `result.excludedPresaleRights` 배열 → "분양권 산입 제외 (비수도권 3억 이하, §167의4②1호)" 섹션.
- #1·#3은 기존 `small_new_house`·`population_decline_second_home` 라벨 재사용(입력경로 뚫리면 자동).

---

## 6. 규칙 준수 체크

- 금액 `CurrencyInput`+parseAmount / 면적 `DecimalInput`+parseDecimal(CurrencyInput 금지) / 날짜 `DateInput`
- 토글·라디오 `ToggleCard`/`RadioCardGroup`(native 금지), OFF tone 유지
- placeholder 숫자 금지 → hint
- 3중 패턴: display fallback ↔ API 변환 ↔ validate 동일(useEffect→store 미러링 금지)
- 포커스 전체선택 / "원" 접미사 금지 / 내부 id 노출 금지
