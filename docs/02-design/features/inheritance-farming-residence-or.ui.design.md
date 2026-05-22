# 영농상속공제 거주지 OR 조건 — UI·엔진 통합 디자인 (v1.1)

> **선행 PRD**: `docs/00-pm/inheritance-farming-administrative-district.prd.md` v4.1.1
> **대상**: 상증령 §16②1호나 시·군·구 동일·연접·30km(산림지 단서)·산림지 통상 경영 OR 자동 판정 + 사용자 boolean(옵션 A) + 결과 카드 산식(옵션 C)
> **상태**: Phase 0·0-Fix 코드 작성 완료(미커밋) + Phase 1~5 대기

---

## 1. 케이스 인벤토리 (KoreanLaw §16②1호나 검증)

| # | 자산 카테고리 | 거주지 코드 | 거주지 좌표 | 자산 코드 | 자산 좌표 | 산림지 단서 | 예상 matchKind | 비고 |
|---|---|---|---|---|---|---|---|---|
| 1 | farmland | 1168000000 | SEOUL | 1168000000 | SEOUL | — | same_district | FR-9 |
| 2 | farmland | 1165000000 | BUSAN | 1168000000 | SEOUL | — | adjacent_district (매트릭스 주입) | FR-10 |
| 3 | farmland | 1111000000 | (서울+5km) | 1168000000 | SEOUL | — | within_30km | FR-11 |
| 4 | farmland | 2611000000 | BUSAN | 1168000000 | SEOUL | — | fail | FR-12 |
| 5 | forest_land | 2611000000 | BUSAN | 4111000000 | SEOUL | true | forest_manageable_area | FR-15 |
| 6 | forest_land | 2611000000 | BUSAN | 4111000000 | SEOUL | false | fail | FR-16 |
| 7 | farmland | 2611000000 | BUSAN | 4111000000 | SEOUL | true | fail (단서 농지 무효) | FR-17 |
| 8 | farmland — heir 분리 | decedent fail / heir 1168 | decedent BUSAN / heir SEOUL | 1168 | SEOUL | — | decedent=fail / heir=same | FR-18 |
| 9 | farmland 다자산 (A 부산 + B 서울) | 1168 | SEOUL | 2611+1168 | BUSAN+SEOUL | — | best=same | FR-19 |
| 10 | farmland 코드만 (좌표 없음) | 1168 | — | 1168 | — | — | same | FR-20 |
| 11 | fishing_vessel | 2611 | BUSAN | 2611(anchor) | BUSAN(anchor) | — | same | FR-21 |
| 12 | agricultural_building | 1168 | SEOUL | 1168 | SEOUL | — | null (§16②1호나 대상 아님) | FR-13 |
| 13 | salt_field | 1168 | SEOUL | 1168 | SEOUL | — | null | FR-14 |
| 14 | corporate_stock | — | — | (좌표 무관) | — | — | 거주지 검증 불필요 (§16②2호 트랙) | UI 미표시 |
| 15 | 미입력 (legacy 호환) | — | — | — | — | — | null + met=사용자 boolean | FR-1~8 |

---

## 2. 시나리오 흐름

### 2-A. 정상 흐름 — 농지 1건 + decedent·heir 거주지 명시
1. 자산 추가 → farmingCategory=farmland 선택
2. AddressSearch → 좌표·코드·주소 영속화 (sessionStorage)
3. FarmingEligibilitySection — decedent·heir 거주지 AddressSearch
4. UI useMemo `checkFarmingResidenceCompliance` 호출 → matchKind 미리보기
5. **결과 카드** — "§16②1호나 same_district 자동 확인 — 자치구 일치" 산식

### 2-B. 산림지 + 통상 경영 명시
1. farmingCategory=forest_land
2. 거주지 30km 초과 + 코드 불일치
3. **신규 토글** `decedentForestManageableArea` ON
4. matchKind=forest_manageable_area, autoMet=true
5. 결과 카드 — "§16②1호나 산림지 단서 — 통상 직접 경영 가능 지역(사용자 명시)"

### 2-C. heir 분리 (decedent fail / heir pass)
1. decedent BUSAN / heir SEOUL
2. 자산 SEOUL → decedent matchKind=fail / heir matchKind=same
3. UI — decedent rose · heir emerald 동시 노출
4. 옵션 A: 사용자가 `decedentResidenceMet=false` 명시 시 영농 자격 미달 → 공제 0

### 2-D. agricultural_building 입력 (D2)
1. farmingCategory=agricultural_building
2. AddressSearch 노출되나 라벨 "(참고용 — §16②1호나 거주지 OR 대상 아님)"
3. sky 안내 카드 — "본 자산은 거주지 자동 검증에 반영되지 않습니다"
4. matchKind=null

---

## 3. 14개 동기화 지점

| # | 지점 | 영향 필드 | 본 PR 범위 |
|---|---|---|---|
| ① | 폼 상태 타입 | `decedentForestManageableArea?`·`heirForestManageableArea?`·`estateSigunguCode?`·`fishingAnchorSigunguCode?` | Phase 0-Fix ✅ |
| ② | initial value | sessionStorage 마이그레이션 default = **undefined** (옵션 A 책임 분배 핵심 — false 폴백 금지) | Phase 5 |
| ③ | normalize fallback | undefined → 미전달 (옵션 A 미러링 위반 회피). 신규 6 필드 모두 적용 | Phase 5 |
| ④ | API 변환 (`lib/calc/inheritance-tax-api.ts`) | farming 필드 6종 추가 | Phase 5 |
| ⑤ | UI 입력 위젯 | FarmingEligibilitySection — 거주지 AddressSearch + forestManageableArea ToggleCard | Phase 5 |
| ⑥ | 사이드바 합계 | 영향 없음 (영농공제는 인적공제 카드) | — |
| ⑦ | **결과 카드 산식** (`InheritanceTaxResultView`) | **엔진 result 확장 (D8)** — `FarmingDeductionDetail.decedentMatchKind`·`heirMatchKind`·`*AutoMet` echo | Phase 5 |
| ⑧ | validation (`lib/validators/property-valuation-input.ts`) | **카테고리별 좌표 입력 룰 (D11)** — corp_stock·financial 차단, agri_building sky 안내 | Phase 5 |
| ⑨ | Zod enum 메인 | farmingCategory enum 유지 (변경 없음) | — |
| ⑩ | Zod 컴패니언 | property valuation Zod에 sigunguCode 추가 | Phase 5 |
| ⑪ | acquisitionDate fallback | 본 PR 무관 | — |
| ⑫ | **Zod 입력 객체 정의** | `farmingInheritanceInputSchema`에 6 필드 추가 — TypeScript 미감지 ⚠️ | Phase 5 |
| ⑬ | callInheritanceTaxAPI body spread | spread 패턴 유지 시 무영향. 명시 매핑이면 6필드 grep 점검 [[feedback-explicit-prop-mapping-strip]] | Phase 5 |
| ⑭ | Route handler 엔진 input 매핑 | spread 시 무영향. coerceDates 무관(boolean·string) | Phase 5 |

---

## 4. UI 컴포넌트 명세

### 4-1. FarmingEligibilitySection 확장

**G11 — type 트랙 분기**: `farming.type === "corporate"` 시 거주지 섹션 전체 숨김 (§16②2호 법인 영농 트랙은 거주지 요건 없음). `type === "personal"`일 때만 본 UI 노출.

- 거주지 입력: **AddressSearch × 2** (decedent·heir) — sigunguCode·좌표·주소 영속화
- 산림지 단서 토글: **ToggleCard `decedentForestManageableArea` + `heirForestManageableArea`** — emerald tone
  - **G4 노출 조건**: `farmingCategory === "forest_land"` 자산 1건 이상 존재 시만 표시 (useMemo derive)
  - **G4 cleanup 정책**: 자산이 0건이 되어도 store 값은 보존(사용자 의도 유지). UI 안내 시 "산림지 자산 미입력 — 토글 효과 없음" gray hint
- 자동 검증 미리보기: `ResidenceCheckPreviewCard` 5분기 (same/adjacent/within_30km/forest_manageable/fail)
- 옵션 A 모순 안내: 자동 fail · 사용자 met=true → rose ConflictRow

### 4-2. PropertyValuationForm 카테고리별 분기 (D2·D11)
| 카테고리 | AddressSearch | 토지기준시가 룩업 | sky 안내 |
|---|---|---|---|
| farmland·pasture·forest_land | ✅ 자산 소재지 | ✅ | — |
| fishing_vessel·fishing_right | ✅ "선적지·어장 연안" | ❌ | — |
| agricultural_building·salt_field | ✅ "참고용" | ❌ | **"§16②1호나 거주지 OR 대상 아님"** |
| corporate_stock | ❌ | ❌ | — |
| financial·cash·deposit·기타 | ❌ | ❌ | — |

### 4-3. ResidenceCheckPreviewCard (5분기)

**G6 — 어선·어업권 후단 분기 라벨**: 자산 목록에 `fishing_*` 카테고리 1건 이상 + `LAND_BASED` 0건 시 라벨을 다음으로 전환:
- "동일/연접 시·군·구"의 기준점 = **어선 선적지 또는 어장에 가장 가까운 연안 시·군·구**
- "30km 직선거리"의 기준점 = **선적지·연안**
- 혼재(농지 + 어선) 시 자산별 best matchKind를 카드 1장에 합산 표시 (자산별 분리 노출은 후속 PR)

```
✓ 동일 시·군·구 (자동 §16②1호나 1단계)         — emerald
✓ 연접 시·군·구 (자동 §16②1호나 2단계)          — emerald
✓ 30km 직선거리 — N.Nkm (자동 §16②1호나 3단계)  — emerald
✓ 산림지 통상 경영 지역 (사용자 명시 단서)         — emerald
❌ 4가지 조건 모두 미충족 — N.Nkm                 — rose
미입력 — 사용자 명시 boolean 적용                  — gray
```

### 4-4. InheritanceTaxResultView 산식 인용 (옵션 C, D8 + G8)

**G8 — residence undefined 분기 처리**: `result.farmingDeduction.residence === undefined` 시 (legacy 또는 corporate 트랙) 산식 인용 행 자체 미노출. `residence !== undefined && matchKind !== null`일 때만 라인 표시. matchKind=null 시 "사용자 명시 boolean 단독" 안내 라인 표시.

```
[영농상속공제 30억 한도] X,XXX,XXX,XXX원
  └ 자격 요건: §16②1호나 same_district (피상속인·상속인 자치구 일치 자동 확인)
  └ 자격 충족 상속인: N명 / 전체 M명 (부록 A)
```

**residence 미제공 분기 예시**:
```
[영농상속공제 30억 한도] X,XXX,XXX,XXX원
  └ 자격 요건: 사용자 명시 (자동 거주지 검증 미수행 — 좌표·코드 미입력)
```

---

## 5. validate 정책 (14지점 ⑧, D11)

```typescript
// lib/validators/property-valuation-input.ts
const COORDINATE_ALLOWED_CATEGORIES = [
  "real_estate_land", "real_estate_building", "real_estate_house",
] as const;

const FARMING_RESIDENCE_OR_TARGETS = [
  "farmland", "pasture", "forest_land",
  "fishing_vessel", "fishing_right",
] as const;

// 1. 무관 카테고리(financial·cash·deposit·corporate_stock) + 좌표 입력 → 차단
// 2. agricultural_building·salt_field + 좌표 입력 → 허용 + sky 안내 (validate 통과)
// 3. forest_manageable_area = true + farmingCategory ≠ forest_land → 차단 (불일치)
// 4. fishing_*  + estateLatLng 입력 (대신 fishingAnchorLatLng 사용해야 함) → 차단
```

---

## 6. 엔진 result 타입 확장 (14지점 ⑦, D8)

```typescript
// lib/tax-engine/types/inheritance-farming.types.ts
export interface FarmingDeductionDetail {
  // 기존 필드 유지
  eligible: boolean;
  evaluated: boolean;
  ineligibleReasons: string[];
  appliedAssetValue: number;
  cappedDeduction: number;
  qualifiedHeirCount?: number;
  totalHeirCount?: number;
  // v4.1.1 D8 신규 — 결과 카드 산식 근거
  residence?: {
    decedentMatchKind: SigunguMatchKind | null;
    heirMatchKind: SigunguMatchKind | null;
    decedentAutoMet: boolean | null;
    heirAutoMet: boolean | null;
    decedentMinDistanceKm: number | null;
    heirMinDistanceKm: number | null;
  };
}
```

엔진 통합 위치: `lib/tax-engine/inheritance-tax.ts` → `calcFarmingDeduction()` 호출 직후 `checkFarmingResidenceCompliance()` 결과 echo.

**H1·H2·H5 — type 트랙 분기 정책**:
```typescript
if (farming?.type === "personal") {
  const residence = checkFarmingResidenceCompliance(estateItems, farming, options);
  detail.residence = {
    decedentMatchKind: residence.decedentMatchKind,
    heirMatchKind: residence.heirMatchKind,
    decedentAutoMet: residence.decedentAutoMet,
    heirAutoMet: residence.heirAutoMet,
    decedentMinDistanceKm: residence.decedentMinDistanceKm,
    heirMinDistanceKm: residence.heirMinDistanceKm,
  };
}
// corporate 트랙 — residence echo 생성하지 않음 (§16②2호 거주지 요건 없음)
```

**단일 분기 패턴 (H1)**:
- `residence === undefined` → corporate 트랙 또는 farming undefined (legacy). 산식 인용 라인 미노출
- `residence !== undefined && matchKind === null` → personal 트랙 + 좌표·코드 미입력. "사용자 명시 boolean 단독" 라인
- `residence !== undefined && matchKind !== null` → 자동 검증 결과 인용

---

## 7. anchor 계획

### 7-1. Phase 0-Fix 완료 (✅ FR-1~21, 21건)

### 7-2. Phase 4·5 신규 anchor (Phase 4 0.5h + Phase 5 1~2h)
- E-1: 엔진 result echo — `result.farmingDeduction.residence.decedentMatchKind === "same_district"`
- E-2: matchKind === fail + met === true → eligible=true (옵션 A 책임 분배)
- **E-3 (G9)**: heir 분리 — decedent matchKind=fail / heir matchKind=same → residence echo 양쪽 모두 노출
- **E-4 (G9)**: 다자산 best — 자산 A(fail) + B(same) → echo best=same_district
- **E-5 (G8)**: corporate 트랙 — `farming.type="corporate"` → `result.farmingDeduction.residence === undefined`
- **E-6 (G11)**: corporate 트랙 UI — 거주지 섹션 미렌더
- UI-RTL-1: ResidenceCheckPreviewCard 5분기 라벨 노출
- UI-RTL-2: 모순 안내 (자동 fail · 사용자 met=true)
- UI-RTL-3: agricultural_building sky 안내 카드 노출
- UI-RTL-4: forest_land + forestManageableArea ToggleCard 노출
- **UI-RTL-5 (G6)**: 어선만 자산 시 라벨 "선적지·어장 연안" 노출
- **UI-RTL-6 (G4)**: forest_land 자산 0건 → 토글 자체 미노출

---

## 8. Definition of Done (Phase 5)

- [ ] FarmingEligibilitySection 거주지 AddressSearch 통합
- [ ] forestManageableArea ToggleCard (farmingCategory=forest_land 조건부 노출)
- [ ] ResidenceCheckPreviewCard 5분기 라벨
- [ ] PropertyValuationForm 카테고리별 분기 (D2·D11)
- [ ] `FarmingDeductionDetail.residence` 신규 + 엔진 echo
- [ ] InheritanceTaxResultView 산식 인용 (옵션 C)
- [ ] validate 룰 4종
- [ ] Zod ⑫ farmingInheritanceInputSchema 6필드 추가
- [ ] anchor E-1~E-6 + UI-RTL-1~6
- [ ] 브라우저 수동 확인 (사용자 시나리오 2-A·B·C·D)
- [ ] 14지점 self-grep 0건 누락 — **(H6 keywords)** `decedentResidenceSigunguCode`·`heirResidenceSigunguCode`·`decedentForestManageableArea`·`heirForestManageableArea`·`estateSigunguCode`·`fishingAnchorSigunguCode`·`SigunguMatchKind`·`forest_manageable_area`·`residence?.decedentMatchKind` 9 키워드 전수 검색
- [ ] tsc·vitest·lint 0건

---

## 9. 위험 요소

- (Phase 1 의존) 매트릭스 데이터 미주입 시 adjacent_district 영구 false → adjacent 시나리오 UI 검증 불가
- (Phase 3 의존) 좌표 → sigunguCode 자동 역지오코딩 없으면 사용자 수동 입력 — UX 부담
- **(D10·I5 재검토)** 해석 B 확정 시 (1) 산림지 라벨 변경 (2) **MATCH_RANK 조정** (within_30km 동등/상위) (3) **anchor FR-15·17 재검토 + E-3·E-4 보강 가능**
- (D5) Phase 0 + Phase 0-Fix 미커밋 — 본 디자인 적용 commit 선행 필요

## 10. 시한 (PRD §6-5 동기화, v1.1 I2)
- **2026-06-12 (3주, 작업 시한)**: Phase 1 진입 — 데이터 출처 PoC + 해석례 조사 시작
- **2026-07-03 (6주, 휴면 시한)**: Phase 5 미완 시 Phase 0+0-Fix revert
- **모니터링**: `bkit:gap-detector` + PRD §11 데드라인 표기

## 11. 후속 PR (PRD §11-3 동기화, v1.1 I4)
- §16⑤마목 마을어업·협동양식업 면허 제외 (`fishingLicenseExcluded?`) — PRD §1-3 D4
- 양도세 §104조의3 비사업용 토지 매트릭스 재사용 통합 비용 산정
- 취득세 자경 감면 sigunguCode 분기
- 자산별 매칭 카드 분리 노출 (디자인 §4-3 혼재 케이스 후속)
- §16②1호나 산림지가 §16⑤1호 다목 "5년 이상 조림" 조건 적용 여부 결과 반영 (Phase 1 해석례 의존, PRD E7)
- §16②1호나 "거주" 주민등록 필수 여부 (Phase 1 해석례 의존, PRD E10)

## 12. 디자인 변경 이력
- v1 — 초안
- **v1.1** — G1~G6 (디자인 1차 검토) + H1·H2·H5·H6 (재검토) + I2·I4·I5 (PRD 통합 비교) 반영
