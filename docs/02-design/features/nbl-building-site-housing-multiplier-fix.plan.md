# A-BS-1 — 건물(비주택) 부수토지에 주택 배율이 적용되던 결함 정정

> 상태: **완료 (2026-08-05)**
> 브랜치: `feat/factory-site-standard-area-nbl` (공장용지 PR #1078에 이어 작업)
> 선행: [공장용지 기준면적](factory-site-standard-area-nbl.plan.md) · [NBL 건물 부수토지 배율 조문 정정](nbl-building-site-local-tax-multiplier.engine.design.md)

---

## 1. 결함

`getLandCategoryGroup("building_site")`가 `"housing"`을 반환해 `judgeHousingLand`로 라우팅되었고,
그 안에서 **「소득세법 시행령」 §168의12(주택 부수토지) 배율**이 적용됐다.

| 자산 | 근거 체인 | 수도권 축 | 배율 |
|---|---|---|---|
| **주택** 부수토지 | 「소득세법」 §104의3①**5호** → 시행령 §168의12 | **있음** | 3 / 5 / 10 |
| **건물**(비주택) 부수토지 | 「소득세법」 §104의3①**4호나목** → 「지방세법」 §106①2호 → 시행령 §101①2호·§101② | **없음** | 5 / 3 / 4 / 7 |

**22개 조합 중 19개가 어긋난다** — 이 수치는 주장이 아니라 테스트로 실증한다
(`building-site-multiplier.anchor.test.ts` "두 조문의 배율표는 실제로 다르다").

### 같은 실수를 두 번째로 정정하는 것이다

2026-07-30에 `getLandFootprintMultiplier(zone, metro, kind)`가 `kind`와 무관하게 주택 배율을
반환하던 것을 폐지했다(GB 경로 3곳). 그때 **분류 단계에 남아 있던 같은 오류**가 A-BS-1로
별건 격하되어 남았다.

⇒ 교훈: **두 조문을 한 함수·한 그룹 뒤에 두지 않는다.**

---

## 2. 도달 가능성 — 이중으로 죽어 있었다 (실측)

| 관문 | 실측 |
|---|---|
| UI 지목 선택지 (`LAND_TYPE_OPTIONS`) | 6종 — `building_site` **없음** |
| Zod enum (`NBL_UI_LAND_TYPE_VALUES`) | 6종 — `building_site` **없음** |
| `components/` `lib/calc/` `lib/stores/` `lib/api/` 참조 | **0건** |
| `form-mapper.ts`의 footprint 매핑 | `housingFootprint`만 — **`buildingFootprint`는 아예 안 채운다** |

⇒ 설령 `building_site`가 도달했더라도 `footprint = 0`이 되어 배율 계산 **전에** "정착면적 미입력"으로
빠졌다. 즉 잘못된 배율은 **실행조차 되지 않았다**. 세액 영향 0.

**그럼에도 고치는 이유**: 지목 옵션을 하나 늘리는 순간 조용히 틀린 세액이 나온다. 잠복 결함이다.

---

## 3. 정정 내용

| 파일 | 변경 |
|---|---|
| `non-business-land/building-site-land.ts` (신설 136줄) | `judgeBuildingSiteLand` — 배율은 정본 `judgeAppurtenantLandExcess`에 위임 |
| `non-business-land/types.ts` | `LandCategoryGroup`에 `"building_site"` 추가 |
| `non-business-land/land-category.ts` | `building_site` → 전용 그룹 (종전 `"housing"`) |
| `non-business-land/engine.ts` | `case "building_site"` 라우팅 |
| `non-business-land/housing-land.ts` | `building_site` 분기·헤더 주석 제거, 라벨을 "주택"으로 좁힘 |
| `legal-codes/transfer.ts` | `NBL.BUILDING_SITE_MULTIPLIER` |
| `__tests__/.../building-site-multiplier.anchor.test.ts` | A-BS-1 블록을 **정정된 계약**으로 교체 (7건) |

### 설계 — 배율을 새로 만들지 않았다

`judgeAppurtenantLandExcess`(→ `local-tax-zone-multiplier.ts`)가 §101② 정본이고, 이미
일반건물(GB)·상업용건물(CB)·공장(§101①1호 경로)이 쓴다. 여기서도 **같은 정본에 위임**해
호출자 4개가 한 표를 공유하게 했다 — 드리프트가 구조적으로 불가능해진다.

### 미입력을 「비사업용」으로 삼키지 않는다

종전 `judgeHousingLand`는 정착면적 미입력 시 조용히 `isBusiness: false`를 반환했다. 새 모듈은
**던진다** — 근거 없이 불리한 판정을 만들지 않는다(`feedback_no_unfavorable_application_without_legal_basis`).
§101② 표에 없는 용도지역(세분 전 `residential`)도 정본 헬퍼가 차단한다.

> ⚠️ `judgeHousingLand`의 「미입력 → 비사업용」 동작은 **그대로 두었다**. 주택 경로는 도달
> 가능하고 기존 anchor가 그 동작을 고정하고 있어, 이번 범위(A-BS-1) 밖이다. 별건.

---

## 4. 남은 것 — 노출하려면 함께 해야 할 것

이 정정은 **조문만 바로잡아 둔 상태**다. `building_site`를 실제로 쓰려면:

1. `NBL_UI_LAND_TYPE_VALUES`에 추가 (⑫)
2. `LAND_TYPE_OPTIONS`에 지목 선택지 추가 (⑤)
3. `nblBuildingFootprint` 폼 필드 + `form-mapper.ts` 매핑 (①②③⑭)
4. validate — 바닥면적·용도지역 필수 (⑧)

> ❓ **정말 노출해야 하는지는 미판정이다.** 현재 비주택 건물 부수토지는 사용자가 "기타 토지"를
> 골라 `other_land` 경로(§101①2호나목 2% 룰 + 재산세 유형)로 처리한다. `building_site`를 열면
> **같은 자산에 두 입구**가 생겨 어느 쪽을 골라야 하는지 모호해진다. 노출 전에 두 경로의 관계를
> 먼저 정리할 것.

---

## 5. 검증

- `tsc --noEmit` 0건
- A-BS-1 anchor **7건**(정정 계약) · `building-site-multiplier.anchor.test.ts` 전체 24건 GREEN
- NBL 전체 **352건** GREEN
- 전체 vitest **13,628건** GREEN · 실패 0

핵심 anchor:

| 테스트 | 고정하는 것 |
|---|---|
| 두 조문의 배율표는 실제로 다르다 | **22조합 중 19개 상이** — 결함의 전제 자체를 실증 |
| 수도권 여부와 무관 | §101②에 수도권 축이 없음 (종전엔 토글이 배율을 바꿨다) |
| 주택 배율을 썼다면 결과가 달랐다 | 일반주거 수도권 3배 vs §101② 4배 — 회귀 방향 고정 |
| 바닥면적 미입력 → throw | 근거 없는 불리 적용 금지 |
| 미등재 용도지역 → throw | 추정 배율 금지 |
| Zod enum 6종에 없음 | 도달 불가 상태가 유지됨을 명시 |
