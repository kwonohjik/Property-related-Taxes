# [엔진 설계] NBL 재촌 판정 — 30km 직선거리 + 시군구 자동연동

**대상 엔진**: `lib/tax-engine/non-business-land/residence.ts` · `form-mapper.ts` · `types.ts`
**계획서**: `docs/00-pm/transfer-nbl-residence-judgment-ui.plan.md`
**법령**: 소득세법 시행령 §153③(§168의8② 준용) — 재촌 = ①동일 시·군·구 ②연접 ③직선 30km (택일)

---

## 1. Input/Result 타입 델타

### 엔진 input (`non-business-land/types.ts`)
```ts
// LocationInfo (landLocation) — 좌표 추가
interface LocationInfo {
  sigunguCode?: string;   // 5자리 (기존)
  distanceKm?: number;    // legacy (기존)
  lat?: number;           // ★신규 — 농지 좌표(asset.latitude parse)
  lng?: number;           // ★신규
}
// OwnerResidenceHistory — 좌표 추가
interface OwnerResidenceHistory {
  sigunguCode?: string;   // 5자리 (기존)
  startDate; endDate; hasResidentRegistration;  // 기존
  lat?: number;           // ★신규 — 거주지 좌표(주소검색 파생)
  lng?: number;           // ★신규
}
```
- **좌표 없으면 undefined** → 30km 미판정(graceful). 기존 동일/연접 판정 불변.
- Result: 별도 신규 필드 없이 기존 재촌 판정 결과에 근거(matchType) echo 추가(3-b, 결과카드용).

### 폼/스키마 (5자리 시군구 · string 좌표)
- 거주 이력 항목: `{ sigunguCode(5), sigunguName, startDate, endDate, hasResidentRegistration, lat?(string), lng?(string) }`.
- Zod `nblResidenceHistoryRawSchema`(schema-sub.ts): `lat: z.string().optional()`, `lng: z.string().optional()`.
- form-mapper: string→number 파싱 후 엔진 input 주입.

---

## 2. 케이스 인벤토리 (재촌 판정 알고리즘)

`isHistoryWithinResidence(history, landLocation, adjacentCodes, distanceLimitKm=30)`:

| 순서 | 조건 | 결과 | 비고 |
|---|---|---|---|
| 1 | `history.sigunguCode === landLocation.sigunguCode` (둘 다 5자리) | 재촌 ✓ (same) | 기존 |
| 2 | `adjacentCodes.includes(history.sigunguCode)` | 재촌 ✓ (adjacent) | 기존 |
| 3 | 농지·거주지 lat/lng 모두 有 AND `haversineKm(land, res) ≤ 30` | 재촌 ✓ (within_30km) | **신규** |
| 4 | 그 외 | 재촌 ✗ | |

- **알고리즘 소스 미러**: `farming-residence-check.ts:129-132` `classifyResidence`(same>adjacent>within_30km). `haversineKm`(`lib/geo/haversine.ts:27`) import 재사용. classify 자체는 미export → 로직만 미러.
- 우선순위: 1→2→3 (택일, 하나라도 충족 시 재촌).
- 좌표 결측 시 3 스킵 → 판정 축소 아님(1·2 유지).

## 3. 시군구 자동연동 (작업 1) — 자릿수 정규화

- geocode 소스 `acquisitionSigunguCode` = **10자리**("XXXXX00000") → `slice(0,5)` = 5자리.
- form-mapper 실효 토지 시군구: `nblLandSigunguCode || acqSigungu5`. adjacentCodes 조회도 이 5자리.
- 農地 좌표: `asset.latitude/longitude`(string) → number.

---

## 4. 14 동기화 지점 커버리지

| 지점 | 반영 |
|---|---|
| ① 폼타입 | 거주이력 항목 lat/lng(string) — calc-wizard-asset-nbl.ts |
| ②③ | initial []/normalize |
| ④ API | non-business-land-request(좌표 운반·시군구 fallback slice5) |
| ⑤ UI | ResidenceHistorySection(주소검색+좌표)·NblSectionContainer(토지 prefill) |
| ⑦ 결과 | 재촌 근거(matchType) 표시 |
| ⑧ validate | 좌표 optional(차단 없음) |
| ⑫ Zod | nblResidenceHistoryRawSchema lat/lng optional |
| ⑭ form-mapper | landLocation.lat/lng·이력 좌표 parse·실효 시군구 |
| 엔진 | types.ts(lat/lng number)·residence.ts(haversineKm) |

## 5. Anchor
- A1: haversineKm 재사용 — 서울시청↔인천시청 ≈27km ≤30 true, 40km false.
- A2: 30km flip — 비연접+좌표≤30km→재촌 true; 좌표 결측→false(동일/연접만).
- A3: 자릿수 정규화 — acquisitionSigunguCode 10자리 slice(0,5)→lookupSigungu 정상.
- A4: 토지 fallback — nblLandSigunguCode="" + acqSigungu5→실효 시군구 사용.
