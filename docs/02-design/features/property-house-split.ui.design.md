# property-house-split.ui.design — 재산세 §107①2호 (UI 설계)

- 계획서: `docs/00-pm/property-house-split-107-1-2.plan.md` · 엔진: `property-house-split.engine.design.md`
- 패턴: 기존 §107 소유 형태 섹션(PR #216·#218) 확장. ToggleCard/RadioCardGroup.

## 1. FormState (shared.ts) — 신규 4필드

```ts
isHouseSplit: boolean;     // OwnershipType==="house_split" 파생 — 또는 ownershipType만으로
buildingOwner: string;     // 건물 소유자
landOwner: string;         // 부속토지 소유자
landStdValue: string;      // 부속토지 시가표준액 (신규)
// 건축물 시가표준액 = 기존 housingBuildingValue 폼 필드 재사용
```
- `OwnershipType`에 `house_split` 추가. INITIAL_FORM: buildingOwner/landOwner/landStdValue "".

## 2. UI 위젯 (Step0 OwnershipSection)

OWNERSHIP_OPTIONS에 추가 (주택일 때만 노출 — objectType==="housing" 게이트):
- `house_split` "주택 건물·부속토지 분리(§107①2호)" / "건물 소유자와 토지 소유자가 다른 주택 — 산출세액을 시가표준액 비율로 안분"

```
[소유 형태 라디오] ○ 공유  ○ 신탁  ○ 상속미등기  …  ● 주택 건물·토지 분리(§107①2호)
  ┌─ 건물 소유자        [____]              (buildingOwner)
  ├─ 부속토지 소유자    [____]              (landOwner)
  ├─ 건축물 시가표준액  [____] (§4②)        (housingBuildingValue 재사용)
  └─ 부속토지 시가표준액 [____] (§4① 개별공시지가) (landStdValue)
```

- **housingBuildingValue 양방향 read/write [STEP 13 발견]**: house_split 섹션의 "건축물 시가표준액"과 기존 §146④ 주택 소방분 영역의 "주택 건축물 부분 시가표준액"은 **동일 폼 필드(housingBuildingValue)**. 둘은 같은 값을 read/write — 별도 필드 신설 금지(`mirror-pattern`: useEffect 미러링 X, 단일 필드 직접). house_split ON 시 소유 형태 섹션에서 입력 노출(§146④ 영역과 동일 필드라 자동 동기).
- 공유 지분(coOwners)·신탁(settlor) 등과 상호배타(라디오 1택). registeredOwner는 house_split에선 불필요(건물주·토지주가 대체).

## 3. 결과 카드 (PropertyTaxResultView)

TAXPAYER_TYPE_LABEL: `building_owner`="건물 소유자 (§107①2호)", `land_owner`="부속토지 소유자 (§107①2호)".

houseSplitDistribution 표 (amount-column-align — font-mono tabular-nums 우측정렬):
```
주택 건물·부속토지 분리 안분 (지방세법 §107①2호)
┌────────────────┬──────────────┬────────────┬────────────┐
│ 구분            │ 시가표준액    │ 본세 안분   │ 고지액 안분 │
├────────────────┼──────────────┼────────────┼────────────┤
│ 건물 (건물주명) │  600,000,000 │    ...     │    ...     │
│ 부속토지 (토지주명)│ 400,000,000│    ...     │    ...     │
└────────────────┴──────────────┴────────────┴────────────┘
건물분 비율 60.0% · 안분 잔액은 토지분에 흡수
```
- 내부 id 노출 금지 → buildingOwner/landOwner name.trim() (`feedback_no_internal_id_in_result`).
- **print 섹션 [STEP 13 정정 #11]**: houseSplit 안분 표는 기존 group:taxpayer의 **taxpayer leaf 섹션 하위에 렌더**(신규 leaf 추가 X) → property-print-sections 테스트(9 leaf/3 group) **무영향**. PR #216 print leaf 추가 회귀 전례 회피.

## 4. buildPropertyTaxRequestBody (④)

```
ownershipType==="house_split" →
  taxpayerInfo = {
    registeredOwner: buildingOwner || landOwner,  // 형식 충족 (대표는 엔진이 시가표준액으로 판정)
    isHouseSplit: true, buildingOwner, landOwner,
    landStdValue: parseAmount(landStdValue),
  }
  body.housingBuildingValue = parseAmount(housingBuildingValue)  // 건축물 시가표준액 (기존 매핑 재사용)
```

## 5. validateStep (⑧) — house_split만 차단

```
ownershipType==="house_split":
  - buildingOwner·landOwner 필수
  - housingBuildingValue > 0 필수 (건축물 시가표준액 — 안분 분자)
  - landStdValue > 0 필수 (부속토지 시가표준액)
  미입력 시 차단 (안분 비율 계산 불가 → 기타 6종 fallback과 달리 필수)
```

## 6. Zod (⑨)
taxpayerInfo에 `isHouseSplit`·`buildingOwner`·`landOwner`·`landStdValue` optional. housingBuildingValue는 기존 Zod 존재.

## 7. 동기화 지점 (UI측 ①②④⑤⑦⑧⑨)
① FormState 4 / ② INITIAL_FORM / ④ buildBody house_split 매핑 / ⑤ OwnershipSection house_split + 입력 4 / ⑦ 결과 표 + 라벨 2 / ⑧ validate 차단 / ⑨ Zod 4필드.

## 8. E2E
- house_split 선택 → 건물주·토지주·건축물 시가표준액·부속토지 시가표준액 입력 → 계산 → 결과 "건물 소유자" 라벨 + 안분 표 본세/고지액 합 검증.
- house_split + 시가표준액 미입력 → validate 차단(다음 진행 불가).
