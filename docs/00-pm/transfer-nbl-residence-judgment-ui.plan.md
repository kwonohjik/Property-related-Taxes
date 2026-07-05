# NBL 재촌 판정 UI 개선 — 토지 소재지 자동연동 · 거주지 주소검색 · 30km 직선거리 판정

**대상**: 양도소득세 Step4 비사업용 토지(NBL) 정밀판정 → 재촌 판정 영역
**핵심 컴포넌트**: `NblSectionContainer.tsx`(토지 소재지) · `ResidenceHistorySection.tsx`(거주지) · `non-business-land/residence.ts`(엔진)
**작성일**: 2026-07-05

---

## 0. 법령 근거 (KoreanLaw 검증 완료)

재촌 요건 = **농지소재지에 거주** — 3가지 중 하나 충족 시 재촌 인정(택일):
- **소득세법 시행령 §153③**(NBL §168의8②가 준용): ①농지 소재 시·군·구 ②①과 **연접**한 시·군·구 ③농지로부터 **직선거리 30km 이내**
- 조특령 §66①(자경 §69 감면)도 **동일 3기준**.

→ 현재 UI 힌트("동일/연접 시·군·구 매칭")는 **③ 30km를 누락**. 법령상 30km도 재촌 인정 사유이므로 미판정은 납세자 불리 오류.

---

## 1. 현황 (실코드 검증)

### 재촌 판정 실효 로직 (엔진)
- 진입: `residence.ts:~88` `computeResidencePeriods` → `isHistoryWithinResidence`(`:31~69`). 우선순위: (1)시군구 코드 일치 → (2)연접 → (3)30km(`:~69` 스텁).
- **① 동일 시군구: 구현** ✓ · **② 연접 시군구: 구현** ✓ (`sigungu-codes.ts` `adjacentCodes[]` **5자리** + form-mapper `:74-80` 배선).
- **③ 30km: 미구현** — `residence.ts:~69`가 무조건 `return false`(`_distanceLimitKm` eslint-disable 미사용). 유일한 거리 판정은 **거주 이력 0건일 때만** `nblFarmerResidenceDistance`(수동 km) 스냅샷을 전 기간 일괄 적용하는 legacy fallback(`residence.ts:~116` `fallbackResidenceFromDistance`). 이력 1건↑이면 30km 아예 미동작.
- **★ 재사용 자산(H2)**: `lib/geo/haversine.ts:27` `haversineKm(a,b)` 기존 존재. `lib/calc/farming-residence-check.ts`가 **same_district > adjacent_district > within_30km 3단 판정을 haversineKm로 이미 구현**(`:129-132·171`, 영농상속 §16②1호나 — 법령만 다르고 알고리즘 동일). 30km 신규 구현 금지 → **`haversineKm` import 재사용**(3단 판정 `classifyResidence`는 farming-residence-check 내부 함수로 미export → 알고리즘만 미러). single-source.

### ⚠️ 시군구 코드 자릿수 이원화 (Critical 전제)
- **NBL 재촌 판정계 = 5자리**: `sigungu-codes.ts:9`("5자리 행정표준코드", code "11110"), `adjacentCodes`(5자리), `SigunguSelect`(`/^\d{5}$/`), `nblLandSigunguCode`·거주이력 `sigunguCode`.
- **주소/역지오코딩 소스 = 10자리**: `acquisitionSigunguCode`(`resolveSigunguCode` 파생 = "XXXXX00000", reverse-geocode/route.ts:134 `level4LC.slice(0,5)+"00000"`), `resolveSigunguCode` 반환.
- → 두 계열 혼용 시 `lookupSigungu(10자리)=undefined` → **재촌 판정 침묵 파손**. **모든 geocode 시군구를 `.slice(0,5)`로 정규화**해 5자리계에 넣는다(작업 1·2 공통).
- 예외 직source: 주소검색 `AddressValue.pnu.slice(0,5)` = 5자리 시군구 직접 획득(10자리 우회, M2).

### 토지 소재지(시·군·구) 필드
- `NblSectionContainer.tsx:160-172`, 공용 `SigunguSelect`(자동완성 텍스트, 로컬 정적 `sigungu-codes.ts` **약 90개만 부분수록**). **조회 버튼 없음**.
- **양도 물건 소재지 자동연동 없음**: `nblLandSigunguCode` 항상 `""` 초기화(`calc-wizard-asset-nbl.ts:204`), 수동 입력 의존.
- 재사용 후보: asset은 이미 `acquisitionSigunguCode`(양도 물건 주소검색→`resolveSigunguCode` 파생, **10자리**, `calc-wizard-asset.ts:301`; `acquisitionSigunguName` 필드는 **부재** — 名은 `lookupSigungu(5자리).name` 파생) + `latitude/longitude`(`:137-139`) 보유. 현재 nbl 필드와 미연결.

### 거주지 시군구 필드
- `ResidenceHistorySection.tsx`, 항목 `{sigunguCode,sigunguName,startDate,endDate,hasResidentRegistration}`(`:32`). 시군구 = 동일 `SigunguSelect`(`:87`). **주소 조회 버튼 없음**. 좌표 필드 없음.

### 좌표 인프라 (30km 구현 가능성)
- **농지 기준점**: `asset.latitude/longitude` 이미 존재(양도 물건 주소검색 시 세팅).
- **역/정 지오코딩**: `resolveSigunguCode(lat,lng)`·`reverseGeocode`(`vworld-reverse-geocode.ts`) + `address-search.tsx`(Vworld 주소검색, 좌표 반환) 공용 존재.
- 엔진 타입: `OwnerResidenceHistory`(`types.ts:120`)·`LocationInfo`(`:110`)에 **좌표 필드 없음**(sigunguCode/distanceKm만) → 추가 필요.

---

## 2. 설계 (3 작업)

### 작업 1 — 토지 소재지 = 양도 물건 소재지 자동연동
토지 소재지는 항상 양도 물건(=NBL 대상 토지)의 소재지이므로 별도 검색 불필요. **자동 prefill + fallback**(mirror-pattern 3중, useEffect 미러링 금지):
- **정규화(Critical)**: asset 시군구 소스는 10자리 → **`acqSigungu5 = (asset.acquisitionSigunguCode||"").slice(0,5)`**로 5자리 정규화 후 사용. 名 = `lookupSigungu(acqSigungu5)?.name`.
- **UI(⑤, M5 정정)**: `NblSectionContainer` 토지 소재지는 **편집가능 필드**(읽기전용 아님). `nblLandSigunguCode` 미입력 시 `acqSigungu5`/名을 **prefill 표시 + "양도 물건 소재지 자동 적용(직접 입력 시 변경)" 안내**. 사용자가 SigunguSelect로 입력하면 override.
- **API/엔진(④⑭)**: `buildNonBusinessLandRaw`/`form-mapper`에서 실효 토지 시군구 = `nblLandSigunguCode || acqSigungu5`(둘 다 5자리). 연접(`adjacentCodes`) 조회도 실효 5자리 기준. → 편입일 동기화(PR#501)와 동일 fallback 패턴. **표시·엔진 모두 정규화 5자리 단일소스**(H3 drift 방지).
- **30km 기준점**: 농지 좌표 = `asset.latitude/longitude`(string, 별도 조회 불필요).
- ⚠ 검증: `acquisitionSigunguCode`가 양도 물건 소재지 시군구와 일치하는지(취득·양도 동일 필지) Do에서 확인. 상이 케이스(취득 후 행정구역 개편)는 §153③ "행정구역 개편 포함" 단서로 재촌 유리 판정.

### 작업 2 — 거주지 주소 조회 버튼 (전국 커버 + 좌표 확보)
- `ResidenceHistorySection`의 **각 거주 이력 항목마다**(histories.map — 항목별 독립, L3) 시군구에 **경량 주소 조회 버튼** 추가. `address-search.tsx`는 선택 시 `fetchUnits`(공동주택 공시가격·동/호) 자동실행으로 과함(M1) → **`NblUrbanZoneCheckButton`(NblSectionContainer:204) 경량 조회 버튼 패턴 차용**.
- 선택 주소에서: **시군구 5자리 = `AddressValue.pnu.slice(0,5)` 우선**(M2, 10자리 우회), 없으면 `resolveSigunguCode(lat,lng)` 결과 `.slice(0,5)`. 名 = `lookupSigungu(5자리).name`. 좌표 lat/lng 저장.
- 기존 `SigunguSelect`는 **2차 보조**로 유지(주소검색 실패·검색불가 시군구 대비 코드 직입력, L4). 주소검색이 1차.
- 획득 좌표(**string**)를 거주 이력 항목에 저장(작업 3의 30km 입력). testid `nbl-residence-address-search`(L2).

### 작업 3 — 30km 직선거리 판정 구현
- **타입 확장**: 거주 이력 항목 + `OwnerResidenceHistory`에 `lat?/lng?`(number); `LocationInfo`(landLocation)에 `lat?/lng?`(number).
- **좌표 파싱(M3)**: UI/폼은 string(`asset.latitude/longitude`·`AddressValue.lat/lng` 모두 string) → form-mapper/스키마에서 **string→number 파싱(coerce)** 후 엔진 주입.
- **엔진(residence.ts) — 재사용(H2)**: 신규 haversine 구현 금지. `import { haversineKm } from "@/lib/geo/haversine"`. `isHistoryWithinResidence` 30km 분기 = 농지·거주지 좌표 모두 있으면 `haversineKm(농지, 거주지) ≤ distanceLimitKm`(30) → 재촌. 3단 판정 순서·로직은 `farming-residence-check.ts:129-132` 미러. 좌표 결측 시 기존 동일/연접만(graceful, 판정 축소 아님).
- **form-mapper**: `landLocation.lat/lng` ← `asset.latitude/longitude`(parse); 거주 이력 lat/lng ← 항목 좌표(parse).
- **우선순위 유지**: 동일 → 연접 → 30km(택일).
- legacy `nblFarmerResidenceDistance` fallback(이력 0건)은 하위호환 유지.

### 작업 3-b — 결과 카드 재촌 근거 표시 (M4, defer 금지)
- NBL 결과 카드(`NonBusinessLandResultCard` 등)에 재촌 인정 근거(동일 시군구 / 연접 / 30km + 거리값)를 표시. 30km는 신규 사유이므로 사용자가 판정 방법을 확인 가능해야 함. 엔진이 판정 방법을 result에 노출하는지 확인 후, 미노출이면 echo 필드로 추가.

---

## 3. 케이스 매트릭스 (재촌 판정)

| # | 거주지 위치 | 좌표 | 판정 |
|---|---|---|---|
| R1 | 농지와 동일 시군구 | — | 재촌 ✓ (기존) |
| R2 | 연접 시군구 | — | 재촌 ✓ (기존) |
| R3 | 비연접 시군구, 농지로부터 ≤30km | 양측 有 | **재촌 ✓ (신규)** |
| R4 | 비연접, >30km | 양측 有 | 재촌 ✗ |
| R5 | 비연접, ≤30km, 좌표 결측 | 일부 無 | 30km 미판정 → 동일/연접만(재촌 ✗) + 안내 |
| R6 | 이력 0건 + 수동 거리 ≤30km | — | 재촌 ✓ (legacy fallback 유지) |

---

## 4. 변경 파일 · 14 동기화 지점

| 지점 | 파일 | 작업 |
|---|---|---|
| ⑤ UI | `NblSectionContainer.tsx` | 1(토지 소재지 자동 표시) |
| ⑤ UI | `ResidenceHistorySection.tsx` | 2(주소검색 버튼) · 3(좌표 저장) |
| ① 폼타입 | `calc-wizard-asset-nbl.ts`(거주 이력 항목 타입) | 3(lat/lng) |
| ②③ | 동상 initial/normalize | 3 |
| ④ API변환 | `non-business-land-request.ts` | 1(시군구 fallback) · 3(좌표 운반) |
| ⑫ Zod | `transfer-tax-schema-sub.ts`(nblResidenceHistories 항목) | 3(lat/lng optional) |
| ⑭ Route매퍼 | `non-business-land/form-mapper.ts` | 1(실효 시군구) · 3(landLocation·이력 좌표) |
| 엔진 | `non-business-land/types.ts` | 3(OwnerResidenceHistory·LocationInfo lat/lng number) |
| 엔진 | `non-business-land/residence.ts` | 3(**haversineKm 재사용** 30km 판정) |
| ⑦ 결과카드 | `NonBusinessLandResultCard`(재촌 표시 지점) | 3-b(재촌 근거 동일/연접/30km·거리) |

- ⑥사이드바: 재촌은 NBL 판정 중간값 — 무영향.
- ⑦결과카드: 재촌 근거 표시 **추가(M4, defer 금지)**.
- ⑧validate: 거주지 좌표는 optional(결측 시 축소판정) → validate 차단 없음.
- **자릿수 정규화(Critical)**: geocode 시군구(10자리)→5자리 `.slice(0,5)`가 작업1·2·④form-mapper 전부 적용됐는지 grep 자가점검(혼용 시 침묵 파손).

---

## 5. 검증 계획

**Pre-Do anchor**:
1. haversineKm 재사용 확인 — `lib/geo/haversine.ts` import, 알려진 두 좌표(서울시청↔인천시청 ≈ 27km) ≤30km true, 40km false.
2. 30km 판정 flip — 비연접 시군구 + 농지·거주지 좌표 ≤30km → 재촌 true(신규), 좌표 결측 → false(동일/연접만).
3. **자릿수 정규화(Critical)** — `acquisitionSigunguCode`(10자리 "XXXXX00000") → `.slice(0,5)` → `lookupSigungu` 정상 조회·연접 매칭 확인. 정규화 누락 시 undefined→판정 파손 재현.
4. 토지 소재지 fallback — `nblLandSigunguCode=""` + `acqSigungu5` 有 → 실효 시군구·연접 조회가 정규화 asset 값 사용.

**E2E(Playwright)**:
- Step4 NBL 상세판정 → 토지 소재지에 "양도 물건 소재지 자동 적용" 표시 · 거주지 주소검색 버튼 존재·동작(좌표 채움) · 비연접+30km 이내 → 재촌 인정으로 사업용 판정.

**게이트**: tsc 0 · vitest 전체 회귀 0 · 변경 파일 lint 0.

---

## 6. 리스크

- **R1 (좌표 가용성)**: 농지 좌표(`asset.latitude/longitude`)가 양도 물건 주소검색을 안 하면 빈 값 → 30km 미판정. 이 경우 동일/연접으로 축소 + "좌표 없어 30km 미판정, 주소검색 권장" 안내. 판정 축소일 뿐 회귀 아님.
- **R2 (연접 테이블 품질)**: `adjacentCodes`는 사전계산 테이블 — 30km 구현 후에도 연접은 테이블 의존. 30km(좌표)가 더 정확하므로 상호 보완(택일).
- **R3 (SigunguSelect 부분수록)**: 주소검색(작업 2)이 전국 커버로 해소. 단 주소검색 실패 시 수동 코드 입력 보조 유지.
- **R4 (30km 구현 = 엔진 판정 확대)**: 기존 비사업용 판정이 재촌 인정으로 사업용 전환될 수 있음(납세자 유리·법령 정합). 회귀 테스트로 기존 동일/연접 케이스 불변 확인.
- **R5 (14지점 좌표 침묵 strip)**: ⑫Zod·⑭form-mapper에 lat/lng 누락 시 침묵 소실 → grep 자가점검.
- **R6 (시군구 자릿수 혼용, Critical)**: geocode계 10자리 ↔ NBL계 5자리. `.slice(0,5)` 정규화 누락 시 `lookupSigungu`=undefined로 재촌 판정 침묵 파손(에러 없음). 작업1·2 전 소스에 정규화 + anchor-3로 잠금.
- **R7 (haversine 중복구현 방지)**: `lib/geo/haversine.ts` `haversineKm` + `farming-residence-check.ts` 3단 로직 기존 존재 → 재사용(single-source). 신규 구현 금지.

---

## 7. Do 순서 (single-response-do-execution)

1. **작업 1**(저위험·독립): 토지 소재지 fallback(UI 표시 + form-mapper 실효 시군구). anchor-3.
2. **작업 3 엔진**: types lat/lng + residence.ts `haversineKm` 재사용 + form-mapper 좌표 배선. anchor-1·2·3.
3. **작업 3 폼/스키마**: 거주 이력 항목 lat/lng(①②③⑫) + non-business-land-request 운반.
4. **작업 2 UI**: ResidenceHistorySection 주소검색 버튼 → 시군구+좌표 채움.
5. anchor + tsc + vitest 전체 + E2E.
6. 커밋(작업 단위) → ship.

**분리 가능**: 작업 1(토지 자동연동)은 30km와 독립 → 먼저 단독 ship 가능. 작업 2·3은 좌표로 결합 → 함께.
