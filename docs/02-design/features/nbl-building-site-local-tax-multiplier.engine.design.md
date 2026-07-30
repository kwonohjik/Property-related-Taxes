# 비사업용토지 — 건물 부수토지 배율을 「지방세법 시행령」 제101조 제2항으로 정정 (엔진 설계)

> 작성일: 2026-07-30 (rev.2 — 미검증 U-1~U-4 해소로 **대상이 교체됨**)
> 계획서: [`basic-info-area-single-source.plan.md`](../../01-plan/features/basic-info-area-single-source.plan.md) §4 (Phase C 결론)
> Phase: D — **세액이 바뀐다**. Pre-Do anchor 필수.

---

## 0. rev.2 정정 — 주 대상은 `building_site`가 아니라 **일반건물(GB) 부수토지**다

rev.1은 NBL `landType === "building_site"`를 주 결함으로 잡았다. 미검증 U-1~U-4를 해소한 결과 **우선순위가 뒤집혔다**.

| # | 항목 | 실측 결과 |
|---|---|---|
| U-1 | `building_site`가 UI에서 선택 가능한가 | 🔴 **불가** — `NblSectionContainer.tsx:33~38` `LAND_TYPE_OPTIONS`에 `building_site` **없음**(농지·임야·목장·주택부수·별장부수·기타 6종) |
| U-2 | `building_site` 사용 테스트 | **0건** |
| U-3 | `nblZoneType` 옵션에 `residential`(세분 전) | **없음** — 9종 전부 세분 용도지역(전용·일반·준주거·상업·공업·녹지·관리·농림·자연환경) |
| U-4 | `getLandFootprintMultiplier` 호출부 | 🔴 **NBL이 아니다** — `general-building-valuation.ts:636` · `general-building-extension.ts:216`, 둘 다 `kind: "general_building"` |

→ **`building_site`는 도달 불가 경로**다(UI 선택 불가·테스트 0건). 그 정정은 세액 영향이 없는 **구조 정리**로 격하된다.

→ 반면 `kind: "general_building"` 인자는 **일반건물 환산취득가 경로에서 실제로 쓰인다**. `general-building-valuation.ts:608~646`이 GB 부수토지 비사업용 판정에 이 배율을 쓰고, 그 결과(`nonBusinessArea`·`nonBusinessRatio`)로 **토지분을 분할 중과**한다. 사용자가 지목한 "기준시가 계산" 경로가 바로 여기다.

### 0.1 GB 부수토지 배율 전 용도지역 대조 (throwaway probe 실측)

`getLandFootprintMultiplier(zone, metro, "general_building")` 현행값 vs 「지방세법 시행령」 제101조 제2항 정본:

| 용도지역 | 수도권 현행 | 비수도권 현행 | 정확(§101②) | 수도권 | 비수도권 |
|---|---|---|---|---|---|
| 전용주거 | 3 | 5 | **5** | 과다과세 | = |
| 준주거 | 3 | 5 | **3** | = | 과소과세 |
| 상업 | 3 | 5 | **3** | = | 과소과세 |
| 일반주거 | 3 | 5 | **4** | 과다과세 | 과소과세 |
| 공업 | 3 | 5 | **4** | 과다과세 | 과소과세 |
| 녹지 | 5 | 5 | **7** | 과다과세 | 과다과세 |
| 미계획 | 5 | 5 | **4** | 과소과세 | 과소과세 |
| 관리·농림·자연환경·미지정 | 10 | 10 | **7** | 과소과세 | 과소과세 |

**22개 조합 중 19개가 불일치**(일치 3: 전용주거 비수도권 · 준주거 수도권 · 상업 수도권). 과다과세·과소과세 양방향으로 갈린다.

`general-building-valuation.ts:608` 주석은 근거를 "§104의3·**§168의12**"로 적었으나, GB(비주택) 부수토지는 「소득세법」 제104조의3 제1항 **4호 나목** → 「지방세법」 제106조 제1항 2호 → 「지방세법 시행령」 제101조 제1항 2호·**제2항**이 정확하다(§1.1). 같은 파일 `:617` 주석은 이미 "지방세법 시행령 §101①단서 … 소득세법 §104의3①4호나목"을 인용하고 있어 **한 함수 안에서 근거가 엇갈린다**.

### 0.2 rev.2 작업 범위 재정의

| 우선 | 대상 | 성격 |
|---|---|---|
| **1** | `general-building-valuation.ts:636` · `general-building-extension.ts:216` 배율을 「지방세법 시행령」 제101조 제2항으로 교체 | 🔴 **세액 오답**(19/22 조합) |
| 2 | `getLandFootprintMultiplier`의 `kind` 파라미터·"배율표 동일" 주석 제거 | 잘못된 안심 제거 |
| 3 | `ZONE_AREA_MULTIPLIER`를 `urban-area.ts` 단일 정본으로 이동 | 드리프트 방지 |
| 4 | `building_site` 라우팅 정리 + UI 옵션 노출 여부 결정 | 도달 불가 → **별건 격하** |

**주의**: GB 경로는 `input.isMetropolitan`을 받는데 「지방세법 시행령」 제101조 제2항에는 **수도권 축이 없다**. 교체 시 그 인자는 GB 배율 산정에서 미사용이 된다 — 다른 용도(중과 판정 등)로 쓰이는지 Do 단계에서 확인 필요.

---

## 0-old. (이하 rev.1 서술 — `building_site` 중심. §0으로 대체됨)

---

## 1. 결함 요약

`land-category.ts:41`이 `housing_site`와 `building_site`를 **둘 다** 카테고리 `"housing"`으로 분류 → `engine.ts:107~108`이 `judgeHousingLand`로 라우팅 → **「소득세법 시행령」 제168조의12 배율**(주택부수토지)을 건물 부수토지에도 적용한다.

`housing-land.ts:9` 주석이 이 결정을 명시한다: *"건물 부수 토지도 동일 모듈로 처리 (landType === "building_site" 호환)"*.

### 1.1 법령상 올바른 경로

| 자산 | 근거 조문 | 배율 출처 |
|---|---|---|
| **주택** 부수토지 | 「소득세법」 제104조의3 제1항 **5호** ("주택부속토지 중 **주택이 정착된 면적**에 …배율") | 「소득세법 시행령」 제168조의12 |
| **건물**(비주택) 부수토지 | 「소득세법」 제104조의3 제1항 **4호 나목** ("「지방세법」 제106조 제1항 **2호**(별도합산)·3호가 되는 토지"는 **제외**=사업용) | 「지방세법 시행령」 제101조 제1항 2호 → **제101조 제2항** |

「소득세법 시행령」 제168조의11은 같은 항 **4호 다목** 위임(체육시설·주차장·하치장 등 14호)이며 **건물 부수토지 일반 규정을 담지 않는다**(KoreanLaw 실측 — 소득세법 시행령 MST 286211).

### 1.2 두 배율표는 다르다

| 용도지역 | 「소득세법 시행령」 §168의12 | 「지방세법 시행령」 §101② |
|---|---|---|
| 전용주거지역 | 수도권 3 / 비수도권 도시 5 | **5** |
| 준주거지역 | 수도권 3 / 비수도권 도시 5 | **3** |
| 상업지역 | 수도권 3 / 비수도권 도시 5 | **3** |
| 일반주거지역 | 수도권 3 / 비수도권 도시 5 | **4** |
| 공업지역 | 수도권 3 / 비수도권 도시 5 | **4** |
| 녹지지역 | 수도권 5 / 비수도권 도시 5 | **7** |
| 미계획지역 | 수도권 5 / 비수도권 도시 5 | **4** |
| 도시지역 외 | **10** | **7** |
| 수도권 축 | **있음** | **없음** |

「지방세법 시행령」 제101조 제2항 값의 출처는 프로젝트 정본 상수 `other-land.ts:63~76` `ZONE_AREA_MULTIPLIER`("지방세법 시행령 §101② 정본 … 추정 금지" 주석). 법제처 API는 조문 내 표를 반환하지 않는다.

### 1.3 세액 영향 방향

`허용면적 = 정착(바닥)면적 × 배율`, `초과분 = 토지면적 − 허용면적`이 비사업용.

| 사안 | 현행 배율 | 정확 배율 | 방향 |
|---|---|---|---|
| 도시지역 외 | 10 | 7 | 허용면적 과대 → 비사업용 누락 → **과소과세** |
| 녹지지역 | 5(수도권)/5 | 7 | 허용면적 과소 → **과다과세** |
| 일반주거(수도권) | 3 | 4 | 허용면적 과소 → **과다과세** |
| 준주거·상업(수도권) | 3 | 3 | 동일 — 무영향 |
| 전용주거(수도권) | 3 | 5 | **과다과세** |

비사업용 판정 시 기본세율 **+10%p 중과** + **장기보유특별공제 배제**이므로 영향이 크다.

---

## 2. 설계

### 2.1 배율 산정을 공용 헬퍼로 분리

두 판정의 **산식 형태는 동일**하다(`allowedArea = footprint × multiplier`, `landArea` 비교, 초과분 안분). 다른 것은 **배율 출처·조문·수도권 축 유무**뿐이다.

```
urban-area.ts
  getHousingMultiplier(zoneType, isMetropolitan)        기존 — 「소득세법 시행령」 §168의12
  getBuildingSiteMultiplier(zoneType)                   신규 — 「지방세법 시행령」 §101②
                                                        (수도권 인자 없음)
```

`ZONE_AREA_MULTIPLIER`(현재 `other-land.ts` private)를 `urban-area.ts`로 이동해 **단일 정본**으로 만들고, `other-land.ts`는 이를 import한다. 같은 표를 두 곳에 두면 드리프트한다.

### 2.2 `getLandFootprintMultiplier`의 `kind` 파라미터 폐기

현행(`urban-area.ts:99~107`)은 `kind: "housing" | "general_building"`를 받고 **양쪽 모두 `getHousingMultiplier`를 반환**한다. 주석은 "두 조문의 배율표는 현재 동일"이라 하는데 **사실이 아니다**(§1.2). 이 함수는 조문이 분기됐다는 **잘못된 안심**을 준다.

→ 호출부를 실제 조문별 함수로 교체하고 이 함수를 제거한다. 호출부 전수는 Do 단계에서 grep 확인.

### 2.3 판정 모듈 분리

`land-category.ts:41`에서 `building_site`를 `"housing"`에서 떼어내 신규 카테고리 `"building_site"`로 분류하고, `engine.ts`에 `case "building_site"` 추가.

공통 조립 로직(~100줄: `AreaProportioning`·`steps`·`CategoryJudgeResult`)은 중복하지 않고 내부 헬퍼로 추출한다:

```
footprint-multiplier-land.ts (신규)
  judgeFootprintMultiplierLand(input, {
    footprint, multiplier, multiplierDetail,
    legalBasis, stepIdPrefix, reasonLabel,
  }): CategoryJudgeResult

housing-land.ts        → 정착면적 = housingFootprint,  배율 = getHousingMultiplier(zone, metro)
building-site-land.ts  → 정착면적 = buildingFootprint, 배율 = getBuildingSiteMultiplier(zone)
```

`housing-land.ts:36~37`의 `landType === "building_site" ? buildingFootprint : housingFootprint` **삼항은 제거**된다 — 각 모듈이 자기 필드만 읽는다.

### 2.4 배율 미확보 처리 — 자동 fallback 금지

`ZONE_AREA_MULTIPLIER`는 `residential`(세분 전 주거지역)과 미정의 용도지역에 값이 없다(`other-land.ts:63` 주석 "자동 제외(직접입력 fallback) — 추정 금지").

`building_site`에서 배율을 못 구하면:
- **추정 배율을 쓰지 않는다**(자동 안분 fallback 금지 정책).
- 판정 step `status: "FAIL"` + `detail: "용도지역 세분 미확정 — 배율 산정 불가"` + warning.
- 현행 `housing-land.ts:62~69`의 "미지정 시 수도권(불리) 보수 처리"와 **다른 방식**이다 — 수도권 여부는 이분법이라 보수측이 정의되지만, 용도지역 배율은 3~7배 범위라 보수측을 정할 근거가 없다.

이 지점은 **UI에서 용도지역 세분 선택을 요구**해야 하며, `nblZoneType` 옵션에 `residential`(세분 전)이 남아 있는지 Do 단계에서 확인한다.

### 2.5 범위 밖 (별건)

「지방세법 시행령」 제101조 제1항 2호 **나목**:
> "건축물의 시가표준액이 해당 부속토지의 시가표준액의 100분의 2에 미달하는 건축물의 부속토지 중 그 **건축물의 바닥면적을 제외한** 부속토지"

= 건물이 토지 대비 2% 미달이면 배율 적용 없이 **바닥면적만** 별도합산(사업용), 잔여 전부 종합합산(비사업용). 이미 기타토지 경로에 `nblOtherBuildingFloorArea`로 구현돼 있다(`types.ts:269`).

`building_site`에도 법문상 적용되지만 **시가표준액 2건(건물·부속토지) 입력 필드가 없다** → 본 Phase 범위 밖. 판정 결과에 warning으로 안내하고 별건으로 분리한다.

---

## 3. 14 동기화 지점

| 지점 | 변경 |
|---|---|
| ① 폼 상태 | **신규** `nblBuildingFootprint` (건물 정착면적) — `nblHousingFootprint`와 별개 축 |
| ② initial | `makeDefaultAsset` `""` |
| ③ normalize | `calc-wizard-asset-nbl.ts` 마이그레이션 기본값 |
| ④ API 변환 | `form-mapper.ts` — `buildingFootprint: parseNumber(asset.nblBuildingFootprint)` (현행 미배선) |
| ⑤ UI 위젯 | `NblSectionContainer.tsx:200` 게이트를 `housing_site` → `housing_site \| building_site`로 확대 + 정착면적 필드를 landType별 분기 |
| ⑥ 사이드바 | 무변경 (면적은 합계 항목 아님) |
| ⑦ 결과 카드 | `NonBusinessLandResultCard` — step `legalBasis`가 조문별로 갈리므로 표시 확인 |
| ⑧ validation | `transfer-tax-validate-nbl.ts` — `building_site`에서 정착면적 필수 |
| ⑨~⑭ | 무변경 (엔진 내부 라우팅·기존 필드) |

**단일 소스 계획과의 관계**: 계획서 §5.3 축 C(바닥면적)의 8개 필드 중 `buildingFootprint`가 여기서 신설된다. Phase F에서 기본사항 바닥면적으로 통합할 때 이 필드가 참조 대상이 된다.

---

## 4. Pre-Do anchor 설계

memory `feedback_pre_anchor_verification` — Do 전 작성·실행하여 **현행(오답) 동작을 고정**한 뒤 뒤집는다.

| ID | 검증 | 현행 예상 | Do 후 |
|---|---|---|---|
| A-BS-1 | `land-category.ts` 분류: `building_site` → `"housing"` | 통과(고정) | **뒤집힘** → `"building_site"` |
| A-BS-2 | 도시지역 외 `building_site`: 배율 10배 적용 | 통과(오답 고정) | **뒤집힘** → 7배 |
| A-BS-3 | 녹지 `building_site`: 5배 | 통과(오답 고정) | **뒤집힘** → 7배 |
| A-BS-4 | 일반주거 수도권 `building_site`: 3배 | 통과(오답 고정) | **뒤집힘** → 4배 |
| A-BS-5 | 준주거·상업 수도권: 3배 | 통과 | **유지**(양 조문 동일) |
| A-BS-6 | `housing_site`는 「소득세법 시행령」 §168의12 유지 | 통과 | **유지**(회귀 가드) |
| A-BS-7 | `buildingFootprint` 폼→엔진 미배선 → 정착면적 0 → 전량 비사업용 | 통과(결함 고정) | **뒤집힘** |
| A-BS-8 | `ZONE_AREA_MULTIPLIER` 정본 8개 값 | 통과 | **유지**(표 드리프트 가드) |
| A-BS-9 | `residential`(세분 전) 배율 미정의 | 통과 | **유지** → Do 후 "판정 불가" 경로 |

A-BS-2·3·4·7은 **의도적으로 오답을 고정**한다. Do에서 실패로 전환되는 것이 성공 신호다(memory `feedback_anchor_correction_legal_priority`).

---

## 5. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R1 | `building_site` 세액이 바뀌므로 기존 anchor·통합 테스트가 깨질 수 있다 | Do 전 `building_site` 사용 테스트 전수 grep → 기대값 재산정 근거 명시 |
| R2 | `getLandFootprintMultiplier` 제거가 호출부를 깨뜨림 | 호출부 grep 후 조문별 함수로 개별 교체 |
| R3 | `ZONE_AREA_MULTIPLIER` 이동이 `other-land.ts` 회귀 | import 교체만, 값 변경 0 — 기타토지 테스트로 확인 |
| R4 | 배율 미확보(`residential`) 시 판정 불가가 기존 통과 케이스를 차단 | 해당 zoneType 사용 테스트 확인 후 UI 세분 선택 강제 여부 결정 |
| R5 | 「지방세법 시행령」 제101조 제2항 표가 개정되면 두 곳(엔진 상수·본 문서)이 드리프트 | A-BS-8이 상수를 고정 + `npm run verify:legal` 대상 편입 검토 |

---

## 6. 미검증 항목

| # | 항목 | 상태 |
|---|---|---|
| U-1 | `building_site` UI 선택 가능성 | ✅ **불가** → `building_site` 정정은 별건 격하 (§0) |
| U-2 | `building_site` 사용 테스트 | ✅ **0건** |
| U-3 | `nblZoneType`에 `residential`(세분 전) | ✅ **없음** → §2.4 "배율 미확보" 경로는 현행 UI에서 도달 불가 |
| U-4 | `getLandFootprintMultiplier` 호출부 | ✅ **GB 경로 2곳** — `general-building-valuation.ts:636`·`general-building-extension.ts:216` |

**전건 해소.** U-1·U-4가 대상을 `building_site` → **GB 부수토지**로 교체했다(§0).

---

## 7. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | 최초 작성 — 배율표 상이 확정 기반. anchor 9건·리스크 5건·미검증 4건 |
| 2026-07-30 | v1.1 (rev.2) | **U-1~U-4 해소로 주 대상 교체** — `building_site`는 UI 선택 불가(도달 불가)로 별건 격하, 실제 세액 오답은 **일반건물(GB) 부수토지**(`getLandFootprintMultiplier` 호출부 2곳). probe 실측: 22개 용도지역×수도권 조합 중 **19개 불일치**(과다·과소 양방향). §0 신설 |
