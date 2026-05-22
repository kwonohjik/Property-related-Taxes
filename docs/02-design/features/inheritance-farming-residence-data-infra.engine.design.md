# 영농상속공제 §16②1호나 외부 데이터 인프라 — 엔진·스크립트 설계 (v1.2)

> **선행 계획서**: [`docs/00-pm/inheritance-farming-residence-data-infra.plan.md`](../../00-pm/inheritance-farming-residence-data-infra.plan.md) v1.1
> **선행 PRD**: `docs/00-pm/inheritance-farming-administrative-district.prd.md` v4.1.1
> **선행 디자인**: `docs/02-design/features/inheritance-farming-residence-or.ui.design.md` v1.1

---

## 1. 케이스 인벤토리 — 데이터·스크립트·모듈

| # | 단위 | 입력 | 출력 | 검증 |
|---|---|---|---|---|
| 1 | KOEDB 파싱 | 법정동코드 TXT (TAB 구분) | `lib/geo/sigungu-code-list.ts` — 코드·명칭 매핑 250+ | 광역시 자치구·일반시·일반시 산하 일반구·세종·제주 행정시 5건+ anchor (M5 — SCL kind 5종 모두 검증) |
| 2 | SHP → GeoJSON | LSMD_ADM_SECT_RGN.shp ~50MB | `data/LSMD_ADM_SECT_RGN.geojson` | feature count = 250+ |
| 3 | turf 매트릭스 빌드 | GeoJSON 폴리곤 250 | `lib/geo/administrative-district-adjacency.json` ~50KB | adjacency 합계 1,000~1,500 엔트리 |
| 4 | adjacency resolver | sigunguCode 10자리 | string[] (인접 코드) | ADJ-1~10 anchor |
| 5 | PNU → sigunguCode | 19자리 PNU | 10자리 행안부 코드 | PNU-1~10 anchor (광역시·세종·제주 등) |
| 6 | Vworld 역지오코딩 (선택) | { lat, lng } | sigunguCode 10자리 | API 응답 샘플 5건+ |
| 7 | adjacency 통합 호출 | calcFarmingDeduction estateItems·farming | residence.matchKind 갱신 (adjacent_district 활성) | E-7 신규 anchor |
| 8 | CI cron 매트릭스 갱신 | GitHub Actions 월 1회 | PR 자동 생성 (매트릭스 변경 시) | 행정구역 개편 감지 |

---

## 2. 시나리오 흐름

### 2-A. 매트릭스 빌드 (Phase 1-C, PR-2)
```
data/LSMD_ADM_SECT_RGN.shp
  → (수동 변환) data/LSMD_ADM_SECT_RGN.geojson
  → scripts/build-sigungu-adjacency.ts (turf.booleanIntersects)
  → lib/geo/administrative-district-adjacency.json (~50KB commit)
  → __tests__/lib/geo/administrative-district-adjacency.test.ts (ADJ-1~10)
```

### 2-B. 런타임 호출 (Phase 2 통합 후, PR-3)
```
EstateItem.estateSigunguCode (Vworld pnu에서 자동 추출)
  → checkFarmingResidenceCompliance(estateItems, farming, {
      adjacentSigunguCodes: getAdjacentSigunguCodes,  // resolver 주입
    })
  → classifyMatch 우선순위 same > adjacent > within_30km > forest_manageable > fail
  → residence.matchKind echo → InheritanceTaxResultView 산식 인용
```

### 2-C. PNU 매핑 (Phase 3, PR-4)
```
사용자 AddressSearch → Vworld pnu 19자리
  → extractSigunguCodeFromPnu(pnu) — 앞 5자리 + "00000"
  → EstateItem.estateSigunguCode = "1168000000"
  → adjacency 자동 활성
```

### 2-D. CI cron 매트릭스 갱신 (위험 대응)
```
GitHub Actions quarterly cron (L11 정정 — 행정구역 개편 빈도 연 1~2건 대비 분기 1회 충분)
  → KOEDB·LSMD 데이터 최신 버전 다운로드
  → scripts/build-sigungu-adjacency.ts 재실행
  → diff lib/geo/administrative-district-adjacency.json
  → 변경 감지 시 PR 자동 생성 (라벨: matrix-update)
```

---

## 3. 데이터 스키마

### 3-1. `lib/geo/sigungu-code-list.ts`
```typescript
export interface SigunguEntry {
  /** 행안부 표준 10자리 (앞 5자리 = 시·군·구, 뒤 5자리 = 0 패딩) */
  code: string;
  /** 정식 명칭 (예: "서울특별시 강남구") */
  fullName: string;
  /** 시·도 명 (예: "서울특별시") */
  sidoName: string;
  /** 시·군·구 명 (예: "강남구") */
  sigunguName: string;
  /** 자치구 / 일반구 / 시 / 군 / 행정시 / 특별자치시 구분 */
  kind: "autonomous_district" | "general_district" | "city" | "county" | "administrative_city" | "special_self_governing_city";
}

export const SIGUNGU_LIST: SigunguEntry[]; // 250+
export function findSigungu(code: string): SigunguEntry | undefined;
```

### 3-2. `lib/geo/administrative-district-adjacency.json`
```json
{
  "1168000000": ["1165000000", "1171000000", "1153000000", "1150000000"],
  "1165000000": ["1168000000", "1171000000", ...],
  ...
}
```
- 키: 행안부 10자리
- 값: 인접 시·군·구 코드 배열 (자기 자신 제외)
- 정렬: 코드 오름차순 (diff 안정성)
- 총 ~250 키, 평균 4~6 인접, 총 엔트리 ~1,250

### 3-3. `lib/geo/administrative-district-adjacency.ts`
```typescript
import adjacencyData from "./administrative-district-adjacency.json";

const ADJACENCY: Record<string, string[]> = adjacencyData;

/** 인접 시·군·구 코드 목록. 미등록 코드 시 빈 배열. */
export function getAdjacentSigunguCodes(sigunguCode: string): string[] {
  return ADJACENCY[sigunguCode] ?? [];
}

export function getSigunguCount(): number {
  return Object.keys(ADJACENCY).length;
}

/** 매트릭스 버전 (생성일 ISO date) — CI cron 갱신 시점 추적 */
export const MATRIX_VERSION = "2026-06-XX";
```

### 3-4. `scripts/build-sigungu-adjacency.ts` (PR-2)

**선행 검증 (L8 정정)**: SHP의 실제 속성명을 PR-1 PoC에서 확인. 가정 `ADM_SECT_CD`·`SGG_NM`가 실제 LSMD_ADM_SECT_RGN과 다를 수 있음 — PoC 응답 샘플에서 속성명 검증 후 스크립트 확정.

```typescript
#!/usr/bin/env node
import * as turf from "@turf/turf";
import fs from "fs";
import path from "path";

const INPUT = "data/LSMD_ADM_SECT_RGN.geojson";
const OUTPUT = "lib/geo/administrative-district-adjacency.json";

async function main() {
  const geojson = JSON.parse(fs.readFileSync(INPUT, "utf-8"));
  const polygons = geojson.features
    .filter((f: any) => f.geometry && f.properties?.ADM_SECT_CD)
    .map((f: any) => ({
      code: String(f.properties.ADM_SECT_CD).padEnd(10, "0"),
      name: f.properties.SGG_NM,
      geometry: f.geometry,
    }));

  const adjacency: Record<string, string[]> = {};
  for (const a of polygons) {
    adjacency[a.code] = [];
    for (const b of polygons) {
      if (a.code === b.code) continue;
      if (turf.booleanIntersects(a.geometry, b.geometry)) {
        adjacency[a.code].push(b.code);
      }
    }
    adjacency[a.code].sort(); // diff 안정성
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(adjacency, null, 2));
  console.log(`✅ 매트릭스 생성 완료 — ${Object.keys(adjacency).length} 시·군·구`);
}

main().catch(console.error);
```

### 3-5. PNU 매핑 anchor (PR-4, vitest 형식 — L5 정정)

**M1 정정 — `extractSigunguCodeFromPnu` 추출**:
현재 `components/calc/inheritance/FarmingEligibilitySection.tsx`에 비-export 내부 함수. PR-4 작업으로 **`lib/geo/pnu-sigungu.ts`로 추출 + export**:
```typescript
// lib/geo/pnu-sigungu.ts (PR-4 신규)
/** PNU 19자리 앞 5자리 → 행안부 표준 10자리 (앞 5자리 + "00000") */
export function extractSigunguCodeFromPnu(pnu: string | undefined): string | undefined {
  if (!pnu || pnu.length < 5) return undefined;
  return pnu.slice(0, 5) + "00000";
}
```
FarmingEligibilitySection은 본 모듈을 import.

`__tests__/lib/geo/pnu-sigungu-mapping.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { SIGUNGU_LIST, findSigungu } from "@/lib/geo/sigungu-code-list";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";

const TEST_CASES = [
  { pnu5: "11680", expected: "1168000000", note: "서울 강남구" },
  { pnu5: "11650", expected: "1165000000", note: "서울 서초구" },
  { pnu5: "36110", expected: "3611000000", note: "세종특별자치시" },
  { pnu5: "50110", expected: "5011000000", note: "제주시" },
  { pnu5: "26260", expected: "2626000000", note: "부산 동래구" },
  { pnu5: "41117", expected: "4111700000", note: "수원 영통구" },
  { pnu5: "41463", expected: "4146300000", note: "용인 기흥구" },
  { pnu5: "11500", expected: "1150000000", note: "서울 강서구" },
  { pnu5: "41570", expected: "4157000000", note: "김포시" },
  { pnu5: "28710", expected: "2871000000", note: "인천 강화군" },
];

describe("[PNU] PNU 5자리 ↔ 행안부 10자리 매핑", () => {
  TEST_CASES.forEach((c, i) => {
    it(`PNU-${i + 1}: ${c.note}`, () => {
      // pnu 19자리 시뮬: 앞 5자리 + 14자리 dummy
      const pnu = c.pnu5 + "100100010001";
      expect(extractSigunguCodeFromPnu(pnu)).toBe(c.expected);
      // sigungu-code-list 등록 확인
      expect(findSigungu(c.expected)).toBeDefined();
    });
  });
});
```

---

## 4. 통합 지점

### 4-1. `calcFarmingDeduction` 호출처 (PR-3)
`lib/tax-engine/deductions/inheritance-deductions.ts` 내 `calcFarmingDeduction` 함수의 `residence` 생성 IIFE 블록 (line 번호 명시 회피 — 코드 변경 시 drift 위험, L7 정정. grep `checkFarmingResidenceCompliance` 호출 위치):
```typescript
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

const residence =
  farming?.type === "personal" && estateItems
    ? (() => {
        const r = checkFarmingResidenceCompliance(estateItems, farming, {
          adjacentSigunguCodes: getAdjacentSigunguCodes,  // ← 신규 주입
        });
        return { ... };
      })()
    : undefined;
```

### 4-2. PropertyValuationForm AddressSearch 통합 (PR-4)
FarmingEligibilitySection 패턴(`extractSigunguCodeFromPnu`) PropertyValuationForm에 적용:
- 자산 추가 시 AddressSearch onChange → `EstateItem.estateSigunguCode` 자동 채움
- 어선·어업권 분기 시 `fishingAnchorSigunguCode` 자동 채움

### 4-3. CI cron 워크플로 (PR-3 또는 후속)
`.github/workflows/matrix-update.yml`:
```yaml
name: Sigungu Adjacency Matrix Update
on:
  schedule:
    - cron: "0 0 1 1,4,7,10 *"  # 분기 1일 (L11 정정)
  workflow_dispatch:
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: |
          # KOEDB·LSMD 최신 다운로드 (출처별 스크립트)
          npx tsx scripts/download-admin-data.ts
          npx tsx scripts/build-sigungu-adjacency.ts
      - uses: peter-evans/create-pull-request@v5
        with:
          title: "matrix-update: 행정구역 매트릭스 자동 갱신"
          labels: matrix-update
```

---

## 5. anchor 계획

### 5-1. Phase 1-A KOEDB 파싱 (PR-1, sigungu-code-list 5건+)
- SCL-1: 광역시 자치구 (서울 강남 1168000000) — kind="autonomous_district"
- SCL-2: 일반 시·군 (수원시 4111000000) — kind="city"
- SCL-3: 일반시 산하 일반구 (수원 영통 4111700000) — kind="general_district". **광역시에는 일반구가 없음** (L12 정정) — 광역시는 모두 자치구
- SCL-4: 세종특별자치시 (3611000000) — kind="special_self_governing_city"
- SCL-5: 제주 행정시 (제주 5011000000, 서귀포 5013000000) — kind="administrative_city"

### 5-2. Phase 1-C 매트릭스 (PR-2, ADJ 10건 — §11 계획서 §4-C.3)
ADJ-1~10 (서울·수원·부산·제주·세종·해상·전체 시·군·구 수)

### 5-3. Phase 3 PNU 매핑 (PR-4, PNU 10건)
PNU-1~10 — §3-5 TEST_CASES 그대로

### 5-4. Phase 2 통합 (PR-3, E-7 신규 1건)
- E-7: adjacency resolver 주입 시 adjacent_district 매칭 동작
  - decedent SEOUL/1168 + asset SEOUL/1165 → matchKind=adjacent_district (resolver getAdjacentSigunguCodes(1165000000)에 1168000000 포함)

### 5-5. CI cron 통합 (선택)
- CRON-1: workflow 파일 존재 + cron 표현식 검증
- CRON-2: diff 감지 시 PR 자동 생성 (Mock 테스트)

---

## 6. 통합 14지점 영향

본 데이터 인프라 작업은 클라이언트 UI 14지점 중 다음만 영향:

| 지점 | 영향 |
|---|---|
| ① 폼 타입 | 변경 없음 (Phase 0+0-Fix에서 추가됨) |
| ② initial value | 변경 없음 |
| ③ normalize fallback | 변경 없음 |
| ④ API 변환 | 변경 없음 (spread 자동) |
| ⑤ UI 입력 위젯 | **PropertyValuationForm AddressSearch에 PNU 추출 통합 (PR-4)** |
| ⑥ 사이드바 합계 | 영향 없음 |
| ⑦ 결과 카드 산식 | **adjacent_district matchKind 추가 노출 (이미 labelMatchKind에 정의)** |
| ⑧ validate | 변경 없음 (Phase 5에서 완료) |
| ⑨~⑭ | 변경 없음 |

→ 주로 클라이언트 위젯 ⑤ + 결과 ⑦에서 adjacent_district 라벨이 활성화됨.

---

## 7. Definition of Done

### PR-1 (해석례 + PoC + sigungu-code-list)
- [ ] KoreanLaw 해석례 5건+ 인용 (`docs/03-research/farming-residence-interpretations.md`)
- [ ] 4 주제(연접·산림지 단서·5년 조림·거주 정의) 정책 결정 표
- [ ] 데이터 출처 4종 PoC 응답 샘플 5건+ (`docs/03-research/farming-residence-data-sources.md`)
- [ ] `lib/geo/sigungu-code-list.ts` SCL 5건+ anchor
- [ ] 회귀 0건

### PR-2 (turf.js 매트릭스 빌드)
- [ ] `package.json` @turf/turf + @types/geojson 추가
- [ ] `scripts/build-sigungu-adjacency.ts` 작성·실행
- [ ] `lib/geo/administrative-district-adjacency.json` commit (~50KB)
- [ ] `data/`는 `.gitignore`
- [ ] `lib/geo/README.md` 라이선스 표기

### PR-3 (adjacency.ts + 통합)
- [ ] `tsconfig.json` resolveJsonModule 확인·설정
- [ ] `lib/geo/administrative-district-adjacency.ts` resolver + MATRIX_VERSION
- [ ] anchor ADJ-1~10 + E-7 통합 anchor
- [ ] `calcFarmingDeduction` resolver 주입 (residence echo에 adjacent_district 활성)
- [ ] 회귀 0건

### PR-4 (PNU 매핑 + PropertyValuationForm)
- [ ] `scripts/verify-pnu-sigungu-mapping.ts` PNU 10건 검증
- [ ] PropertyValuationForm AddressSearch onChange에 `extractSigunguCodeFromPnu` 통합
- [ ] anchor PNU-1~10
- [ ] 회귀 0건

### PR-5 선택 (Vworld 역지오코딩)
- [ ] `lib/calc/vworld-reverse-geocode.ts` 클라이언트
- [ ] **영구 캐시 = IndexedDB (Dexie)** (M3·L10 정정) — 좌표 → sigunguCode 매핑은 영속 보존 (브라우저 세션 초과 재사용). sessionStorage는 키 사이즈 5MB 제한·세션별 휘발. `lib/storage/CLAUDE.md` Dexie 패턴 차용
- [ ] cache key = `${lat.toFixed(6)}|${lng.toFixed(6)}` (좌표 정밀도 6자리 ≈ 0.1m)
- [ ] rate limit (Vworld 키 공유 — kiwoom 패턴 token bucket 차용)

### PR-6 선택 (CI cron 매트릭스 갱신, 계획서 §11 동기화)
- [ ] `.github/workflows/matrix-update.yml`
- [ ] **분기 1회** 자동 PR 생성 (`matrix-update` 라벨) — L11 정정
- [ ] cron 표현식 `0 0 1 1,4,7,10 *`
- [ ] `peter-evans/create-pull-request@v5` 보안 검토 (L4 후속)
- [ ] PR-3 (adjacency.ts·MATRIX_VERSION) 의존

---

## 8. 위험 요소·롤백

| 위험 | 대응 |
|---|---|
| turf.booleanIntersects 정확성 (해상·섬) | ADJ-8(강화)·ADJ-9(통영·거제) 검증 + 실패 시 수동 보정 |
| KOEDB 인코딩 (EUC-KR vs UTF-8) | 파싱 스크립트 인코딩 명시 + 한글 anchor |
| SHP 라이선스 (공공누리) | `lib/geo/README.md` 라이선스 표기 + raw 제외 정책 |
| Vworld API 키 만료·rate limit | 캐시 영구화 + 사용자 1회 호출 가정 |
| MATRIX_VERSION 갱신 누락 | CI cron 시 자동 갱신 + 수동 PR 시 hook 검증 |
| 시한 2026-07-03 미달성 | Phase 0~5 revert (`git revert ff93e09 3098d95 7cf2094 5184d74` + 본 PR들) |

---

## 9. 변경 이력
- v1 — 초안 (계획서 v1.1 기반)
- v1.1 — L5(PNU anchor vitest 형식)·L7(line 번호 제거)·L8(SHP 속성명 PoC 검증)·L11(cron 분기 1회)·L12(광역시 일반구 오류) + M1(extractSigunguCodeFromPnu lib/geo/ 추출)·M3(IndexedDB 캐시 확정)·M5(SCL kind 5종 동기화) 정정
- **v1.2** — N7·N8 PR-6 cron 별도 PR 분리 + 계획서 §11 동기화
