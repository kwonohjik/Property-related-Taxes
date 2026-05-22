# 영농상속공제 거주지 — 행정구역 OR 조건 PRD (v4.1.1)

> **대상**: 상증령 §16②1호나 "시·군·구 또는 연접 시·군·구 또는 30km(산림지 단서 포함)" OR 조건 자동 검증
> **이력**: 2026-05-21 v1 · 2026-05-22 v2(비판 검토) · 2026-05-22 v3(기존 인프라 재사용) · 2026-05-22 v4(C1~C14) · **2026-05-22 v4.1(D1~D13 추가 검토 반영)**
> **선행**: PR-E 인프라 (Haversine 30km, `dd7e2fc`) + 옵션 A 정책 (`1e915f1`)
> **상태**: Phase 0 + Phase 0-Fix **코드 작성 완료(미커밋)**. Phase 1 진입 대기.
> **디자인 문서**: [`docs/02-design/features/inheritance-farming-residence-or.ui.design.md`](../02-design/features/inheritance-farming-residence-or.ui.design.md) v1.1 — 14 동기화 지점·케이스 인벤토리·엔진 통합·anchor 계획
> **Phase 1·2·3 실행 계획서**: [`docs/00-pm/inheritance-farming-residence-data-infra.plan.md`](./inheritance-farming-residence-data-infra.plan.md) — 행안부 데이터 PoC·KoreanLaw 해석례·turf.js 매트릭스 스크립트·PNU 매핑 anchor 분할 PR 5단계

---

## 0. 변경 이력 — 비판 검토 누적

### 0-A. v4 (C1~C14) 반영

| 코드 | 결함 | 조치 |
|---|---|---|
| **C1** | §16②1호나 추정 인용 | §1-1 KoreanLaw MCP 원문 직접 인용 + 산림지 단서 추가 + 5종→3종 |
| **C8** | 옵션 A 효용 모호 | §5-4 A·B·C 비교 + Phase 5 결과 카드 산식 |
| **C7** | Dead Code | §6-3 commit 시한 정책 |
| **C2·C3·C9·C10·C14** | 작업량 자의 절감 | §6 표 정정 |
| **C4·C5·C6** | 데이터·매핑 검증 누락 | §3-3·§3-4·§4-2 추가 |
| **C13** | anchor 4건 불충분 | DoD 12건+ |

### 0-C. v4.1.1 (E5~E16) 추가 반영

| 코드 | 결함 | v4.1.1 조치 |
|---|---|---|
| **E5** | 출처 PoC 1~2h 과소 | §6-2 2~4h (출처별 1~2h × 2종) |
| **E6** | §3-4 ↔ §6-2 매트릭스 시간 불일치 | §3-4 5~8h 통일 (4~6h 스크립트 + 1~2h 실행·검증) |
| **E7** | 산림지 §16⑤1호 다목 "5년 조림" 조건 적용 여부 | Phase 1 해석례 항목 추가 + §6-2 시간 가산 |
| **E10** | "거주" 정의 — 주민등록 필수 여부 | Phase 1 해석례 항목 추가 |
| **E15** | 해석 A 재검토 trigger 변경 범위 | §1-4 명시 — MATCH_RANK 조정·UI 라벨·anchor 재검토 |
| **E16** | commit 메시지 시한 누락 | §6-4 템플릿에 시한 명시 |

### 0-B. v4.1 (D1~D13) 추가 반영

| 코드 | 결함 | v4.1 조치 |
|---|---|---|
| **D1·D9** | "commit 완료" 사실 오기 | 헤더·§6-1·§8 "코드 작성 완료(미커밋)" 통일 |
| **D10** | 산림지 단서 해석 A/B 임의 | §1-4 해석 A(30km 분기 내부 확장) 채택 명시. 헬퍼 별도 matchKind는 안내 차별화 implementation detail |
| **D8** | 옵션 C 엔진 result 14지점 ⑦ 누락 | §5-4·§8 Phase 5 DoD "엔진 result 타입 확장 + 14지점 ⑦" 추가, 1~2h 가산 |
| **D2** | agricultural_building UI 정책 미정 | §5-6 신규 — 영농 무관 카테고리 좌표 입력 안내 카드(옵션 b) |
| **D6** | 옵션 A 법적 책임 측면 누락 | §5-4 표에 "법적 책임 분배" 컬럼 추가 |
| **D11** | EstateLocationFields validate 누락 | §5-6 카테고리별 validate 정책 + Phase 5 DoD 추가 |
| **D12** | Phase 1 자의적 8~14h | §6 Phase 1 = v2 동등 **10~17h** 복원 + 세부 산정 표 |
| **D13** | Phase 0-Fix 완료 마커 미갱신 | §6-1·§8 ⚠️ → ✅ |
| **D3** | 어선 "가장 가까운 연안" 자동화 미명시 | §1-4 분기 — 선적지 직접 입력 / 어장 연안은 boolean 또는 Phase 3+ |
| **D4** | 마을어업·협동양식업 면허 제외 | §1-3 후속 메모 + `fishingLicenseExcluded?` 후속 PR |
| **D5** | Phase 0 vs Phase 0-Fix 분리 가치 | §6-1 단일 commit 권장 |
| **D7** | 6주 시한 임의성 | §6-3 작업 시한(3주) + 휴면 시한(6주) 분리 |

---

## 1. 배경 — §16②1호나 원문 직접 인용 (C1, KoreanLaw MCP 검증 2026-05-22)

### 1-1. 시행령 §16②1호나 본문 (mst=283637, 시행일 20260227)

> 농지ㆍ초지ㆍ산림지(이하 이 조에서 "**농지등**"이라 한다)가 소재하는 시(**특별자치시와 「제주특별자치도의 설치 및 국제자유도시 조성을 위한 특별법」 제10조제2항에 따른 행정시를 포함**한다. 이하 이 조에서 같다)ㆍ군ㆍ구(**자치구**를 말한다. 이하 이 조에서 같다), **그와 연접한 시ㆍ군ㆍ구** 또는 **해당 농지등으로부터 직선거리 30킬로미터 이내**(**산림지의 경우에는 통상적으로 직접 경영할 수 있는 지역을 포함**한다)에 거주하거나 **어선의 선적지 또는 어장에 가장 가까운 연안의 시ㆍ군ㆍ구**, 그와 연접한 시ㆍ군ㆍ구 또는 해당 선적지나 연안으로부터 직선거리 30킬로미터 이내에 거주할 것

### 1-2. v3 인용 오류 정정 (★★★ 정책 [[feedback-korean-law-82-vs-81-2-drift]])

| v3 표기 | 본문 사실 | 정정 |
|---|---|---|
| "농지·초지·산림지·**농업용 건축물**·**염전** 자산" 5종 | "**농지등 = 농지·초지·산림지**" 3종 | 거주지 OR 조건 대상은 **3종** + 어선·어업권 후단 |
| "선적지·어장 연안 시·군·구" | "어선의 선적지 또는 **어장에 가장 가까운 연안**의 시·군·구" | "가장 가까운 연안" 명시 |
| (누락) | **산림지 특칙 "통상적으로 직접 경영할 수 있는 지역 포함"** | 4번째 OR 조건 추가 (Phase 0 헬퍼 정정 필요) |
| "특별자치시·제주 행정시 사전 조사 필요" | 본문에 **명시 포함** | §2-1 조사 항목 제거 |
| 자치구 미명시 | "자치구를 말한다" 본문 명시 | 광역시 일반구(자치권 없음) 제외 확정 |

### 1-3. §16⑤1호 영농상속 재산가액 vs §16②1호나 거주지 요건 — 명확히 분리

| 조항 | 대상 자산 |
|---|---|
| §16⑤1호 가~사 (영농상속 재산가액) | 농지 / 초지 / 보전산지 5년 조림 / 어선 / 어업권·양식업권 / 농업·임업·축산·어업용 건축물 / 염전 — **7종** |
| §16②1호나 (거주지 OR 자동 검증 대상) | **농지·초지·산림지** (전단) + **어선·어업권** (후단) — **5종** |

**농업용 건축물(`agricultural_building`)·염전(`salt_field`)** 은 영농 자산이나 거주지 요건의 "농지등"에 포함되지 않음. v3 헬퍼 `LAND_BASED` 5종 → **3종(`farmland`·`pasture`·`forest_land`)** 정정 필요.

**(v4.1 D4)** §16⑤마목 어업권·양식업권에는 **마을어업 면허·협동양식업 면허 제외** — 본 PRD는 거주지 OR 조건 우선이므로 면허 종류 검증은 후속 PR(`fishingLicenseExcluded?` 보조 필드)로 분리.

### 1-4. OR 조건 — 해석 A 채택 (v4.1 D10)

본문 문법 구조:
> ... 또는 해당 농지등으로부터 **직선거리 30킬로미터 이내**(산림지의 경우에는 통상적으로 직접 경영할 수 있는 지역을 포함한다)에 거주 ...

괄호가 "30km 이내" 직후 위치 → 산림지 단서는 **30km 분기의 내부 확장**(해석 A). 별도 OR 조건이 아닌 30km 한도 자체가 산림지에 한해 "통상 경영 지역"까지 확장된다는 의미.

→ 법리상 OR 조건은 **3단계**:

**농지·초지·산림지** (해석 A):
1. 자산 소재 시·군·구(자치구·특별자치시·제주 행정시 포함) = 거주지 시·군·구
2. 연접 시·군·구
3. 직선거리 30km 이내 **(산림지 한정: 통상적으로 직접 경영할 수 있는 지역까지 포함)**

**어선·어업권** (v4.1 D3 분기 명시):
1. **어선의 선적지** 시·군·구 (사용자 직접 입력 가능)
2. **어장에 가장 가까운 연안의 시·군·구** (자동화 곤란 — 어장 polygon → 최근접 연안 GIS 연산 필요. Phase 1 후속 또는 사용자 boolean)
3. 연접 시·군·구
4. 직선거리 30km 이내 (선적지·연안 기준)

**헬퍼 구현 (implementation detail)**: 사용자 UX 차별화를 위해 산림지 단서를 별도 `SigunguMatchKind` 값(`forest_manageable_area`)으로 노출. 우선순위는 within_30km 자동 > forest_manageable_area 사용자 명시 > fail. 법리 의미상 within_30km와 동등 분기지만 결과 카드·UI 안내에서 "30km 자동 vs 산림지 사용자 명시" 구분이 유용. KoreanLaw `search_decisions` 해석례 0건 — 본문 문법 해석으로 결정.

**v4.1.1 E15 — 해석 A 재검토 trigger 시 변경 범위 명시**: Phase 1 해석례에서 해석 B(별도 OR)로 확정되면 (1) `MATCH_RANK`에서 `forest_manageable_area` 순위를 `within_30km`와 동등 또는 더 높게 조정, (2) UI 라벨에서 "30km 단서"가 아닌 "별도 OR"로 변경, (3) anchor FR-15·17 재검토. 헬퍼 시그니처·필드는 변경 없음.

### 1-5. 현재 상태 (Phase 0 정정 후 목표)

- ✅ Haversine 30km 자동 (PR-E)
- ✅ 시·군·구 동일/연접 헬퍼 스켈레톤 (v3 Phase 0)
- ⚠️ LAND_BASED 5종 → 3종 정정 필요 (§11 Phase 0-Fix)
- ⚠️ 산림지 특칙 boolean 필드 추가 (§11 Phase 0-Fix)
- ⏳ 매트릭스 데이터 (Phase 1)
- ⏳ 좌표 → 시·군·구 역지오코딩 (Phase 3)

---

## 2. 법령 해석 잔여 조사 항목 (Phase 1, C1 정정 후)

### 2-1. "시·군·구" 정의 — **확정** (본문 명시로 추가 조사 불필요)
- 자치구 (광역시·서울 25 + 5대 광역시) — 확정
- 일반 시·군 — 확정
- 특별자치시(세종) — 본문 명시
- 제주 행정시(제주시·서귀포시) — 본문 명시
- 광역시 일반구(부산 동래구 등) — "자치구를 말한다" 명시로 자치구만 인정 → 광역시 일반구 = 광역시 자치권에 흡수

### 2-2. "연접 시·군·구" 정의 — 해석례 조사 (Phase 1 유지)

| 후보 | 평가 |
|---|---|
| **직접 인접** (경계선이 직접 맞닿음) | 보수적 기본값 — 해석례 0건 시 채택 |
| **2단계 인접** | 가능성 낮음 |
| **광역시·도 경계 넘는 연접** | 정책 결정 — 서울 강서구 ↔ 김포시 등 |
| **해상 경계** (섬 ↔ 본토) | 어선·어업권 특수 검토 |

**조사 방법**: KoreanLaw MCP `search_decisions` + `chain_full_research` "영농상속 연접 시군구" → 국세청·기재부 해석례·심판원 결정례.

### 2-3. "산림지 통상적으로 직접 경영할 수 있는 지역" — 해석례 조사 (Phase 1 신규)
모호 개념. 자동 판정 불가 → 사용자 boolean 필드(`forestManageableArea`) + UI 안내. 해석례 첨부.

---

## 3. 데이터 인프라 (v3 보존 + C4·C5 보강)

### 3-1. 선택지 A — 정적 인접 매트릭스 (v2·v3·v4 모두 권장)

```typescript
// lib/geo/administrative-district-adjacency.ts (Phase 1·2)
export const SI_GUN_GU_ADJACENCY: Record<string, string[]> = {
  "1168000000": ["1165000000", "1171000000", ...],  // 강남구 → 서초·송파
};
export function getAdjacentSigunguCodes(code: string): string[] {
  return SI_GUN_GU_ADJACENCY[code] ?? [];
}
```

### 3-2. 선택지 B·C — 미채택 (사유 v3 보존)

### 3-3. 데이터 출처 후보 — Phase 1 진입 전 응답 샘플 첨부 필수 (C4 신규)

| 출처 | 후보 데이터셋 | 인접 정보 포함? | 검증 항목 |
|---|---|---|---|
| **행정안전부 도로명주소 KOEDB** | `법정동코드 전체자료` | ❌ (코드만) | 행안부 10자리 ↔ 명칭 매핑 |
| **통계청 SGIS Open API** | `행정구역 통계지리정보 폴리곤` | ⚠️ (GIS 폴리곤에서 인접 계산 필요) | 폴리곤 데이터 크기·rate limit |
| **공공데이터포털 — 행정구역 경계** | `LSMD_ADM_SECT_*` SHP | ⚠️ (SHP 인접 자동 계산) | 라이브러리 의존 (turf·shapely) |
| **국토부 V-World** | `행정경계` 레이어 | ⚠️ (역지오코딩만, 인접 별도) | UI-E1과 키 공유 |

**Phase 1 진입 조건**: 위 4종 중 2개 이상에서 응답 샘플 5건+ 첨부 + 인접 정보 추출 가능성 PoC.

### 3-4. 매트릭스 작성 방식 결정 (C5 신규)

| 방식 | 장점 | 단점 | 예상 시간 |
|---|---|---|---|
| **(a) GIS 폴리곤 자동 인접 계산** | 정확·일관성 | 라이브러리 의존, SHP 파일 ~50MB | **4~6h** (스크립트) + **1~2h** (실행·검증) = **5~8h** (v4.1.1 E6) |
| **(b) 수작업 입력** | 도구 의존 0 | 휴먼에러, 250×5=1,250 엔트리 | 6~10h + 검증 anchor 30건+ |
| **(c) 공공 데이터셋 직접 포함** | 즉시 | 데이터셋 존재 여부 미확정 | Phase 1 사전 조사 결과에 의존 |

**v4 권장**: (a) GIS 폴리곤 — turf.js + SHP 파일 1회 가공. Phase 1에서 PoC.

---

## 4. 좌표 → 시·군·구 역지오코딩 (Phase 3, C6 보강)

### 4-1. Vworld API 사전 검증 (v3 보존)
응답 정확도 + rate limit + 응답 형식 5건 첨부.

### 4-2. PNU 5자리 ↔ 행안부 표준 10자리 매핑 사전 검증 (C6 신규)

`EstateAddress.pnu` 19자리 구조: `시군구5 + 읍면동3 + 리2 + 산여부1 + 본번4 + 부번4`.

| 코드 체계 | 시·군·구 부분 |
|---|---|
| **PNU 앞 5자리** | "11680" (강남구) |
| **행안부 표준 10자리** | "1168000000" (강남구 — 끝 5자리는 읍면동 자리 0 패딩) |

**가설**: PNU 5자리 = 행안부 10자리 앞 5자리. **Phase 3 진입 전 매핑 anchor 10건+ 검증 필수** — 행정구역 개편 이력에서 PNU와 표준코드가 갈라진 경우 검토.

---

## 5. 자동 검증 확장 설계

### 5-1. Phase 0 정정 후 신규 필드

```typescript
// EstateItem (inheritance-gift.types.ts)
estateSigunguCode?: string;           // "1168000000" — 농지·초지·산림지
fishingAnchorSigunguCode?: string;    // 어선 선적지·어장 연안

// FarmingInheritanceInput (inheritance-farming.types.ts)
decedentResidenceSigunguCode?: string;
heirResidenceSigunguCode?: string;
/** 산림지 §16②1호나 단서 — 통상적으로 직접 경영할 수 있는 지역 (C1-F 신규) */
decedentForestManageableArea?: boolean;
heirForestManageableArea?: boolean;

// FarmingResidenceCheckResult
decedentMatchKind: SigunguMatchKind | null;
heirMatchKind: SigunguMatchKind | null;
```

### 5-2. SigunguMatchKind enum (C1-F 정정)

```typescript
type SigunguMatchKind =
  | "same_district"
  | "adjacent_district"
  | "within_30km"
  | "forest_manageable_area"   // §16②1호나 산림지 단서
  | "fail";
```

우선순위 (높→낮): `same_district` > `adjacent_district` > `within_30km` > `forest_manageable_area` > `fail`.

### 5-3. classifyMatch 로직

```typescript
function classifyMatch(args: {
  residenceCode?: string;
  assetCode?: string;
  distanceKm: number | null;
  adjacent: string[];
  limitKm: number;
  forestManageable: boolean;      // 사용자 boolean (산림지일 때만)
  isForestLand: boolean;          // farmingCategory === "forest_land"
}): SigunguMatchKind {
  const { residenceCode, assetCode, distanceKm, adjacent, limitKm, forestManageable, isForestLand } = args;
  if (residenceCode && assetCode) {
    if (residenceCode === assetCode) return "same_district";
    if (adjacent.includes(residenceCode)) return "adjacent_district";
  }
  if (distanceKm !== null && distanceKm <= limitKm) return "within_30km";
  if (isForestLand && forestManageable) return "forest_manageable_area";
  return "fail";
}
```

### 5-4. 옵션 A·B·C 비교 (v4.1 — D6 법적 책임 컬럼 추가)

| 옵션 | 정책 | 효용 | **법적 책임 분배 (v4.1 D6)** | 위험 |
|---|---|---|---|---|
| **A (v3 유지)** | `met`는 사용자 boolean. `matchKind`는 안내 전용 | UI 모순 안내 + 산식 근거 | **사용자 명시 책임** — 자동 fail이어도 met=true 가능 (의도적 인수). 자동 true여도 met=false 가능 (보수적 안전판) | UX 친절에 그침 |
| **B** | 사용자 미명시(undefined) 시만 자동 채움 | 사용자 누락 보완 | 자동 결과가 met에 영향 — 사용자 의도 모호 시 책임 소재 불명 | 미명시 ↔ false 구분 폼 설계 |
| **C** | `matchKind`를 결과 카드 산식에 강제 노출 (옵션 A + 산식 인용) | 법령 인용 정확성 + boundary 유지 | 옵션 A 동일 + 산식 인용으로 자동 결과 가시화 → 사용자 인지 강화 | 결과 페이지 UI 복잡화 |

**v4.1 권장**: **옵션 A + C 융합** — A 정책 유지(미러링 위반 방지 [[feedback-useeffect-store-mirror-forbidden]] + **법적 책임이 사용자 명시에 귀속되는 안전판**) + C로 결과 카드 산식 근거에 `matchKind` 인용. 자동 검증의 결정적 효용 = **법령 인용 자동화 + 책임 분배 명확화**.

### 5-5. UI 안내 분기 (Phase 5)

| matchKind | 카드 |
|---|---|
| same_district | emerald "✓ 동일 시·군·구 (자동 §16②1호나 1단계)" |
| adjacent_district | emerald "✓ 연접 시·군·구 (자동 §16②1호나 2단계)" |
| within_30km | emerald "✓ 30km 직선거리 — N.Nkm (자동 §16②1호나 3단계)" |
| forest_manageable_area | emerald "✓ 산림지 통상 경영 지역 (사용자 명시 §16②1호나 3단계 단서)" |
| fail | rose "❌ 4가지 조건 모두 미충족 — N.Nkm" |
| null | gray "미입력 — 사용자 명시 boolean 적용" |

### 5-6. 무관 카테고리 좌표 입력 정책 (v4.1 D2·D11 신규)

`EstateLocationFields` mixin으로 모든 `EstateItem`이 좌표·코드 필드 보유. UI·validate 정책:

| 카테고리 | 좌표·코드 입력 | UI 라벨 | validate |
|---|---|---|---|
| farmland·pasture·forest_land | ✅ 거주지 OR 검증에 반영 | "자산 소재지" | 좌표 OR 코드 권장(미입력 시 자동 검증 null) |
| fishing_vessel·fishing_right | ✅ fishingAnchor 필드 사용 | "선적지·어장 연안" | 동일 |
| **agricultural_building·salt_field** | ⚠️ 입력 허용·자동 검증에서 무시 | "자산 소재지 (참고용 — §16②1호나 거주지 OR 대상 아님)" | sky 안내 카드 — 거주지 자동 검증 미반영 명시 |
| corporate_stock | ❌ 좌표 무관 | (위치 필드 미표시) | validate 차단 |
| financial·cash·deposit·기타 | ❌ 좌표 무관 | (위치 필드 미표시) | validate 차단 |

**Phase 5 DoD**: `lib/validators/property-valuation-input.ts`에 카테고리별 좌표 입력 룰 추가. 14지점 ⑧.

---

## 6. 단계별 PR 분할 (v4.1 — D5·D7·D12·D13 정정)

### 6-1. v4.1 정정 표

| Phase | 범위 | 작업량 (v4.1) | 의존 | 상태 |
|---|---|---|---|---|
| **Phase 0** | 헬퍼 스켈레톤 + 타입 + matchKind enum | 2h | — | ✅ 코드 작성 완료(미커밋) |
| **Phase 0-Fix** | LAND_BASED 5→3종, 산림지 단서, anchor 12건+ | 1.5h | KoreanLaw §16 검증 | ✅ 코드 작성 완료(미커밋) |
| **Phase 1** | 데이터 출처 PoC + KoreanLaw 해석례(연접·산림지·5년조림·거주정의) + 매트릭스 작성 | **12~20h** | — | 대기 |
| **Phase 2** | 인접 매트릭스 모듈 + anchor | **1~2h** | Phase 1 | 대기 |
| **Phase 3** | 역지오코딩 + PNU↔표준코드 매핑 검증 | **4~6h** | UI-E1 + C6 | 대기 |
| **Phase 4** | farming-residence-check.ts 매트릭스 통합 | **0.5~1h** | Phase 2·3 | 대기 |
| **Phase 5** | UI 5분기 + **엔진 result 확장(14지점 ⑦) + validate(14지점 ⑧)** + 산식 근거 + RTL | **3~5h** | Phase 4 | 대기 |

**v4.1 총 22~34.5시간** (v3 "15~22h" 자의적 절감 철회. v4 19~29.5h에 D8·D11 추가 3~5h 가산).

### 6-2. Phase 1 세부 산정 (v4.1 D12 + v4.1.1 E5·E6·E7·E10)

| 항목 | 시간 |
|---|---|
| 행정안전부 표준 행정구역 데이터 다운로드·파싱 | 1~2h |
| KoreanLaw MCP — "연접" 해석례 + 산림지 단서 + **§16②1호나 산림지가 §16⑤1호 다목 "5년 조림" 조건 적용 여부 (E7)** + **"거주" 정의 — 주민등록 필수 여부 (E10)** 해석례 5건+ | **3~4h** (E10·E7 항목 추가) |
| 데이터 출처 후보 4종 응답 샘플 5건+ PoC (출처별 1~2h × 2종 PoC) | **2~4h** (E5 정정) |
| 250 시·군·구 × 평균 5 인접 = 1,250 엔트리 매트릭스 작성 (GIS 자동 권장, turf.js + SHP 4~6h + 실행·검증 1~2h) | **5~8h** (E6 — §3-4 4~6h+1~2h 합산 명확화) |
| 광역시·도 경계 OR 정책 결정 + 검토 | 1~2h |
| **합계** | **12~20h** (E5·E10·E7 가산) |

### 6-3. v2·v3·v4·v4.1·v4.1.1 비교

| 항목 | v2 | v3 | v4 | v4.1 | v4.1.1 (E5·E7·E10) |
|---|---|---|---|---|---|
| Phase 1 | 10~17h | 8~13h | 8~14h | 10~17h | **12~20h** |
| Phase 2 | 2h | 0.5h | 1~2h | 1~2h | **1~2h** |
| Phase 4 | 2h | 1.5h | 0.5~1h | 0.5~1h | **0.5~1h** |
| Phase 5 | 1~2h | 1~2h | 2~3h | 3~5h | **3~5h** |
| 합계 | 19~28h | 17~24h | 19~29.5h | 22~34.5h | **24~37.5h** |

### 6-4. Phase 0 + Phase 0-Fix 단일 commit 권장 (v4.1 D5)

양쪽 모두 본 세션 미커밋 — 분리 가치 모호. 단일 commit으로 통합:
```
🛠️ feat: 영농상속공제 §16②1호나 거주지 sigunguCode OR 자동 판정 스켈레톤

- EstateLocationFields mixin 추가 (좌표·주소·sigunguCode)
- SigunguMatchKind 5종 + classifyMatch 우선순위 3단(+산림지 단서)
- LAND_BASED 3종(농지·초지·산림지)로 정정 (§16⑤1호 vs §16②1호나 분리)
- 옵션 A 정책 유지 + matchKind 안내 노출
- anchor 21건 (FR-1~21) — 시·군·구·산림지·heir 분리·다자산
- KoreanLaw MCP §16 검증 (mst=283637)
- Phase 1 진입 시한 2026-06-12, 휴면 시한 2026-07-03 (v4.1 §6-5)
```

### 6-5. Dead Code 시한 (v4.1 D7 — 작업·휴면 분리)

- **Phase 1 진입 시한 (작업)**: **2026-06-12 (3주)** — 데이터 출처 PoC + 해석례 조사 시작
- **Phase 5 완료 시한 (휴면)**: **2026-07-03 (6주)** — 미달성 시 Phase 0 revert
- **잠정 정책**: `adjacentSigunguCodes` resolver default `() => []` 유지로 ESLint 미사용 경고 회피
- **모니터링**: `bkit:gap-detector` + PRD §11 데드라인 표기

---

## 7. 위험 요소 (v3 보존 + 추가)

- 행정구역 개편 빈도 (연 1~2건) — 매트릭스 갱신 책임 명확화
- 상속개시일 기준 vs 최신 행정구역 — 최신만 사용 + 사용자 boolean override
- "연접" 해석 불확실성 — 해석례 0건 시 직접 인접만 보수 정책
- 광역시·도 경계 넘는 연접 — Phase 1 정책 결정
- **(C7 추가)** Phase 0 dead code 6주 시한
- **(C6 추가)** PNU ↔ 표준코드 매핑 불일치 시 Phase 3 재설계

---

## 8. Definition of Done

### Phase 0 (v3, ✅ 완료 — 미커밋)
- [x] `EstateItem.estateSigunguCode` · `fishingAnchorSigunguCode`
- [x] `FarmingInheritanceInput.decedentResidenceSigunguCode` · `heirResidenceSigunguCode`
- [x] `FarmingResidenceCheckResult.decedentMatchKind` · `heirMatchKind`
- [x] `checkFarmingResidenceCompliance(estateItems, farming, options?)` 시그니처 확장
- [x] 옵션 A 유지
- [x] 비사업용 토지 `residence.ts` 패턴 일관성
- [x] anchor 4건 (same/adjacent/within_30km/fail) — Phase 0-Fix에서 21건으로 확장
- [x] 회귀 0건

### Phase 0-Fix (v4.1, ✅ 완료 — 미커밋)
- [x] `LAND_BASED` 5종 → 3종 (`farmland`·`pasture`·`forest_land`)
- [x] `SigunguMatchKind`에 `forest_manageable_area` 추가
- [x] `FarmingInheritanceInput.decedentForestManageableArea?` · `heirForestManageableArea?`
- [x] `classifyMatch` 산림지 단서 분기 (해석 A 채택 — implementation detail 별도 matchKind)
- [x] anchor FR-13~21 신규 9건 (전체 21건)
- [x] §1-2 인용 오류 5건 정정 (v4 반영)
- [x] 회귀 0건 (234 통과, TS 0건)

### Phase 1 (사전 조사 — C4·C5 + v4.1.1 E7·E10)
- [ ] KoreanLaw §16②1호나 "연접" 해석례 5건+
- [ ] "산림지 통상 경영 가능 지역" 해석례 3건+
- [ ] **(E7)** §16②1호나 산림지가 §16⑤1호 다목 "5년 이상 조림" 조건 적용 여부 해석례
- [ ] **(E10)** §16②1호나 "거주" 정의 — 주민등록 필수 여부 (§168-9② 임야 대비)
- [ ] 데이터 출처 후보 4종 응답 샘플 5건+ 첨부 (KOEDB·SGIS·공공데이터포털·V-World)
- [ ] 매트릭스 작성 방식(GIS 자동 vs 수작업 vs 데이터셋) 결정
- [ ] 광역시·도 경계 OR 정책 확정

### Phase 2 (인접 매트릭스)
- [ ] `lib/geo/administrative-district-adjacency.ts` — 250 시·군·구
- [ ] anchor 10건 (서울 자치구·경기 시·광역시 경계)

### Phase 3 (역지오코딩 — C6 보강)
- [ ] **PNU 5자리 ↔ 행안부 10자리 매핑 anchor 10건+** (선행 조건)
- [ ] Vworld 역지오코딩 클라이언트
- [ ] EstateItem·FarmingInput에 코드 저장

### Phase 4 (자동 검증 확장)
- [ ] `farming-residence-check.ts` resolver 주입 (Phase 2 모듈 import)
- [ ] anchor 8건 (5분기 × decedent/heir 일부)

### Phase 5 (UI — 옵션 C + v4.1 D8·D11 추가)
- [ ] `ResidenceCheckPreviewCard` 5분기 라벨
- [ ] **(D8)** 엔진 result 타입 확장 — `FarmingDeductionDetail`에 `decedentMatchKind`·`heirMatchKind`·`decedentAutoMet`·`heirAutoMet` echo. 14지점 ⑦ 결과 카드 산식.
- [ ] **결과 카드(`InheritanceTaxResultView`)에 산식 근거 인용** — "§16②1호나 same_district 자동 확인 — 자치구 일치"
- [ ] **(D11)** `lib/validators/property-valuation-input.ts` 카테고리별 좌표 입력 룰 — agricultural_building·salt_field sky 안내, 무관 카테고리 차단. 14지점 ⑧
- [ ] 옵션 A 정책 유지
- [ ] 브라우저 수동 확인

---

## 9. 후속 (본 PRD 범위 외)

- **양도세 §104조의3 사업용 토지** — 매트릭스 재사용 시 통합 비용 별도 산정 (현재 `LocationInfo.distanceKm` 직접 입력 → 좌표·코드 입력 어댑터 추가). **재사용 = 즉시 절감이 아님** — C11 정정.
- **취득세 자경 감면** — `acquisition-self-cultivation-reduction.ts`에 sigunguCode 분기 추가 가능
- **상속개시일 시점 행정구역 데이터** — 과거 행정구역 변경 이력 추적 (별도 대형 작업)

---

## 10. v3 → v4 → v4.1 변경 이력

| 항목 | v3 | v4 | v4.1 |
|---|---|---|---|
| 법령 인용 | 추정 | KoreanLaw 직접 | + 해석 A 명시 (D10) |
| 대상 자산 | 5종 (오류) | 3종 + 어선·어업권 | 동일 + 마을어업 제외 메모 (D4) |
| matchKind | 4종 | 5종 | 동일 (해석 A — 별도 enum은 implementation detail) |
| 옵션 A 효용 | 모호 | A+C 융합 | + 법적 책임 분배 컬럼 (D6) |
| Phase 5 비용 | 1~2h | 2~3h | **3~5h** (D8 엔진 result + D11 validate) |
| 시간 합계 | 15~22h | 19~29.5h | **22~34.5h** |
| Dead Code 시한 | 없음 | 6주 단일 | 작업 3주 + 휴면 6주 (D7) |
| anchor | 4건 | 12건+ | **21건** (FR-1~21) |
| 좌표 무관 카테고리 정책 | 없음 | 없음 | §5-6 신규 (D2·D11) |
| commit 상태 | "완료" 오기 | "완료" 오기 | **"미커밋" 정정 (D1·D9)** |

---

## 11. 본 세션 작업 완료 + 다음 단계

### 11-1. Phase 0 + Phase 0-Fix 완료 (미커밋)
- `lib/tax-engine/types/inheritance-asset-location.types.ts` — `SigunguMatchKind` 5종 + `EstateLocationFields` mixin
- `lib/tax-engine/types/inheritance-gift.types.ts` — `EstateItem extends EstateLocationFields` (800줄 정책 회피)
- `lib/tax-engine/types/inheritance-farming.types.ts` — sigunguCode 2 + forestManageableArea 2 신규
- `lib/calc/farming-residence-check.ts` — 우선순위 4단 + 산림지 단서 + 해석 A
- `__tests__/lib/calc/farming-residence-check.test.ts` — anchor 21건 (FR-1~21)
- `docs/00-pm/inheritance-farming-administrative-district.prd.md` v4.1

### 11-2. 작업 시한 (v4.1 D7)
- **2026-06-12 (3주, 작업 시한)**: Phase 1 진입 — 데이터 출처 PoC + 해석례 조사 시작
- **2026-07-03 (6주, 휴면 시한)**: Phase 5 미완 시 Phase 0+0-Fix revert

### 11-3. 후속 PR 후보
- 본 PRD 범위 외 §16⑤마목 마을어업·협동양식업 면허 제외 (`fishingLicenseExcluded?`)
- 양도세 §104조의3 비사업용 토지 매트릭스 재사용 통합 비용 산정
- 취득세 자경 감면 sigunguCode 분기
