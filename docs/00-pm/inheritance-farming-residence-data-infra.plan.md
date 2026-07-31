# 영농상속공제 거주지 OR — Phase 1·2·3 외부 데이터 인프라 실행 계획서 (v1.2)

> **선행 PRD**: `docs/00-pm/inheritance-farming-administrative-district.prd.md` v4.1.1
> **선행 디자인 (UI/엔진)**: `docs/02-design/features/inheritance-farming-residence-or.ui.design.md` v1.1
> **본 계획서 디자인 (엔진/스크립트)**: [`docs/02-design/features/inheritance-farming-residence-data-infra.engine.design.md`](../02-design/features/inheritance-farming-residence-data-infra.engine.design.md) v1.2
> **선행 commit**: `ff93e09`(Phase 0+0-Fix 엔진) · `3098d95`(Phase 5 UI 일부) · `7cf2094`(Phase 5 잔여) · `5184d74`(본 계획서)
> **시한**: 2026-06-12 (Phase 1 진입 3주) / 2026-07-03 (Phase 5 완료 6주, 미달성 시 Phase 0~5 revert)
> **변경 이력**: v1(초안) · v1.1(J1·J2·J3·J5·J6·J7·J9·J10·J11·J13·J14 + K1·K3 정정) · **v1.2(N3·N4·N7·N8 디자인 통합 정정)**
> **상태**: Phase 1·2·3 미진행 (외부 데이터 의존)

---

## 0. 작업 범위

| Phase | 범위 | 작업량 (v4.1.1) | 본 계획서 |
|---|---|---|---|
| Phase 1 | 데이터 출처 PoC + 해석례 + 매트릭스 작성 | 12~20h | §2~§5 |
| Phase 2 | 인접 매트릭스 모듈 (`lib/geo/administrative-district-adjacency.ts`) | 1~2h | §6 |
| Phase 3 | 역지오코딩 + PNU↔표준코드 매핑 | 4~6h | §7 |
| **합계 (필수)** | | **17~28h** | |
| Phase 3-선택 (Vworld API 클라이언트 + 캐시) | 2~3h | §7-3.2 | 후속 |
| **합계 (전체)** | | **19~31h** | |

본 계획서는 Phase 1~3 모두 단일 PR 묶음 또는 phase별 분리 PR 선택 가능. 권장 — 분리 PR(이력 추적 명확).
§11 분할 PR 합계는 본 §0 합계와 일치해야 함 (J1·J14 정정).

---

## 1. 핵심 데이터 산출물

본 계획 완료 시 다음 4 산출물 확보:

1. **`lib/geo/administrative-district-adjacency.ts`** + 동명 `.json` — 250 시·군·구 인접 매트릭스 (행안부 10자리 키). **JSON 위치 = `lib/geo/` 직속** (J9 정정 — `data/`는 raw SHP·KOEDB만, 빌드 산출물은 lib/geo/ commit)
2. **`lib/geo/sigungu-code-list.ts`** — 행안부 시·군·구 표준 코드(10자리) + 명칭 매핑. **생성 phase = Phase 1-A**(J2 정정 — KOEDB 파싱 후 즉시 산출, Phase 2·3 의존)
3. **`lib/geo/pnu-sigungu.ts`** — `extractSigunguCodeFromPnu` 헬퍼 (PR-4 추출, 디자인 §3-5 M1). 현재 FarmingEligibilitySection 내부 함수를 lib/geo로 이전 + export
4. **`lib/calc/vworld-reverse-geocode.ts`** — 좌표 → sigunguCode 자동 변환 (PNU 파싱 또는 API 호출, Phase 3 또는 Phase 3-선택). **캐시 = IndexedDB (Dexie)** — 좌표→코드 매핑 영속 보존 (디자인 §7 M3)
5. **`docs/03-research/farming-residence-interpretations.md`** — KoreanLaw 해석례 조사 결과 5건+
6. **`.github/workflows/matrix-update.yml`** — 분기 1회 자동 매트릭스 갱신 cron (N3·N7 정정, 디자인 §4-3·§2-D)

---

## 2. Phase 1-A — 행정안전부 표준 행정구역 데이터 다운로드·파싱 (1~2h)

### 2-A.1 데이터 출처 후보 4종

| 출처 | 데이터셋명 | URL | 형식 | 행정구역 코드 |
|---|---|---|---|---|
| 행정안전부 도로명주소 KOEDB | 법정동코드 전체자료 | https://www.code.go.kr | TXT (TAB 구분) | 10자리 법정동 |
| 통계청 SGIS Open API | 행정구역 코드/계층 | https://sgis.kostat.go.kr | JSON API | 행정동 7자리 |
| 공공데이터포털 — 행정구역 경계 | LSMD_ADM_SECT_RGN | https://www.data.go.kr | SHP (Shapefile) | 행안부 10자리 |
| V-World | 행정경계 레이어 | https://api.vworld.kr | WMS/WFS | 행안부 10자리 |

### 2-A.2 PoC 의무 작업 (출처별 1~2h × 2종 = 2~4h, PRD v4.1.1 E5)

각 출처에서 응답 샘플 5건+ 첨부 + 다음 항목 검증:
- 시·군·구 코드 자리수 일치 (10자리)
- 인접 정보 직접 포함 여부
- 라이선스 (공공누리 1유형 권장)
- 갱신 주기 (행정구역 개편 빈도 대응)

**결과물**: `docs/03-research/farming-residence-data-sources.md` — 4 출처 응답 샘플 + 채택 결정 근거.

### 2-A.3 1차 후보 선정

PoC 결과에 따라 다음 우선순위 권장 (PRD v4.1.1 §3-3):
1. **공공데이터포털 SHP** — 행안부 표준 10자리 + 폴리곤(인접 자동 계산용)
2. **KOEDB 법정동코드** — 코드·명칭 매핑 fallback

---

## 3. Phase 1-B — KoreanLaw 해석례 조사 4 주제 (3~4h, PRD v4.1.1 E7·E10)

### 3-B.1 조사 주제·도구

| 주제 | KoreanLaw MCP 도구 | 키워드 | 목표 건수 |
|---|---|---|---|
| 1. "연접 시·군·구" 정의 | `search_decisions(nts·tax_tribunal·interpretation)` | "영농상속 연접" / "직접 인접" / "행정경계" | 5건+ |
| 2. 산림지 "통상적으로 직접 경영할 수 있는 지역" | `search_decisions(nts·interpretation)` | "산림지 통상 경영" / "보전산지 거주" | 3건+ |
| 3. §16②1호나 산림지가 §16⑤1호 다목 "5년 조림" 조건 적용 여부 (E7) | `search_decisions(nts)` | "영농상속 산림지 5년 조림" / "보전산지 영농상속" | 2건+ |
| 4. "거주" 정의 — 주민등록 필수 여부 (E10) | `search_decisions(tax_tribunal·nts)` | "영농상속 거주 주민등록" / "사실상 거주" | 3건+ |

### 3-B.2 정책 결정 사항

조사 결과 토대로 PRD §1-4·§2 보강:

- **"연접" 정의** — 직접 인접만 vs 2단계 확장 (해석례 0건 시 보수적 직접 인접)
- **광역시·도 경계 넘는 연접** — 서울 강서구 ↔ 김포시 인정 여부 (현행 행안부 매트릭스에서 폴리곤 인접하면 인정)
- **산림지 단서** — 본문 괄호 위치상 30km 분기 내부 확장(해석 A) 유지 또는 별도 OR(해석 B) 변경
- **5년 조림 조건** — 적용 시 EstateItem에 보조 필드 추가 후속 PR
- **주민등록 필수 여부** — 적용 시 farming 입력에 추가 boolean 후속 PR

### 3-B.3 결과물
`docs/03-research/farming-residence-interpretations.md`:
- 조사 결과 5건+ 인용 (caseNumber·의결일·재결요지)
- 4 주제별 정책 결정 표
- PRD v4.1.1 어느 항목을 정정해야 하는지 매핑

---

## 4. Phase 1-C — 매트릭스 작성 (GIS 자동, 5~8h, PRD v4.1.1 E6)

> ✅ **2026-07-31 완료.** 단, **데이터 소스가 아래 §4-C.2 가정과 다르다** —
> 공공데이터포털 `LSMD_ADM_SECT_RGN` Shapefile(~50MB) 수동 다운로드 대신
> **Vworld `LT_C_ADSIGG_INFO` API가 전국 256건을 한 번에** 반환한다(프로젝트가 이미 쓰는
> `VWORLD_API_KEY` 재사용). 실제 스크립트는 `scripts/build-sigungu-adjacency.ts`.
> 결과: 시·군·구 256건 · 인접 654건 · `MATRIX_VERSION = "2026-07-31"`.
> §4-C.3의 **ADJ-4 코드는 오류**였다(26290 = 남구, 금정구 = 26410) — 실측 정정.
> 상세·코드 체계 주의사항: `docs/02-design/features/transfer-155-deeming-gaps.plan.md` §9.2~9.3.

### 4-C.1 라이브러리 선정

| 선택지 | 채택 사유 |
|---|---|
| **turf.js** (`@turf/turf`) | 폴리곤 인접 (`turf.booleanTouches`) 직접 지원. Node·브라우저 동작. JS·TS 친화 |
| GDAL CLI | Python 의존. CI 통합 부담 |
| QGIS | GUI 도구 — 1회용 검증에 유용하나 자동화 어려움 |

**권장**: turf.js — `scripts/build-sigungu-adjacency.ts` 스크립트로 1회 가공 → 정적 JSON 산출.

### 4-C.2 스크립트 (4~6h)

`scripts/build-sigungu-adjacency.ts`:
```typescript
import * as turf from "@turf/turf";
import fs from "fs";

// 1. SHP 또는 GeoJSON 로드
const sigungus = JSON.parse(fs.readFileSync("data/LSMD_ADM_SECT_RGN.geojson"));

// 2. 시·군·구별 폴리곤 추출
const polygons = sigungus.features.map((f) => ({
  code: f.properties.ADM_SECT_CD, // 10자리
  name: f.properties.SGG_NM,
  geometry: f.geometry,
}));

// 3. 모든 쌍에 대해 turf.booleanTouches 또는 turf.booleanIntersects 검사
const adjacency: Record<string, string[]> = {};
for (const a of polygons) {
  adjacency[a.code] = [];
  for (const b of polygons) {
    if (a.code === b.code) continue;
    if (turf.booleanIntersects(a.geometry, b.geometry)) {
      adjacency[a.code].push(b.code);
    }
  }
}

// 4. 출력
fs.writeFileSync(
  "lib/geo/administrative-district-adjacency.json",
  JSON.stringify(adjacency, null, 2),
);
```

### 4-C.3 실행·검증 (1~2h)

- `npx tsx scripts/build-sigungu-adjacency.ts` 실행 (예상 5~15분, 250×250 = 62,500 쌍)
- 결과 검증 anchor 10건 — 행안부 표준 10자리 (J7 정정):
  - ADJ-1: 서울 강남(1168000000) ↔ 서초(1165000000)
  - ADJ-2: 서울 강남(1168000000) ↔ 송파(1171000000)
  - ADJ-3: 수원 영통(4111700000) ↔ 용인 기흥(4146300000) — 광역시·도 경계 넘는 인접
  - ADJ-4: 부산 동래(2626000000) ↔ 금정(2629000000)
  - ADJ-5: 제주시(5011000000) ↔ 서귀포시(5013000000) — 제주 행정시 경계
  - ADJ-6: 세종특별자치시(3611000000) ↔ 인근 시·군 (정책 결정 후 확정)
  - ADJ-7: 서울 강서(1150000000) ↔ 김포(4157000000) — 시·도 경계
  - ADJ-8: 인천 강화(2871000000) ↔ 본토 인접 (해상 경계 정책)
  - ADJ-9: 통영(4839000000) ↔ 거제(4831000000) — 해상 인접 정책 확인 (K3 정정 — 동일 코드 중복 오류 수정. 실제 코드는 KOEDB 검증 후 anchor 확정)
  - ADJ-10: 매트릭스 전체 시·군·구 수 240~260 범위 검증

### 4-C.4 결과물

- `lib/geo/administrative-district-adjacency.json` (~50KB, gzip ~15KB)
- `lib/geo/administrative-district-adjacency.ts` — JSON 로드·resolver 함수

---

## 5. Phase 1-D — 광역시·도 경계 OR 정책 결정 (1~2h)

### 5-D.1 의사결정 항목

조사 결과 + Phase 1-C 매트릭스 분석 후 다음 결정:

| 항목 | 정책 후보 |
|---|---|
| **광역시·도 경계 넘는 인접** | A) 모두 인정 (기본 — turf.booleanIntersects 결과) / B) 시·도 내부만 (수동 필터) |
| **해상 경계 (섬 ↔ 본토)** | A) 폴리곤 비접촉 시 인접 아님 / B) 어선·어업권 특수 처리 (PRD §1-4 후단 30km 직선거리 fallback 활용) |
| **세종특별자치시 ↔ 인근 시·군** | A) 폴리곤 기반 자동 / B) 행정시(제주) 별도 처리 |

### 5-D.2 결과물

- 정책 결정 sheet `docs/03-research/farming-residence-policy-decisions.md`
- 매트릭스 생성 스크립트 옵션 추가 (필터링 함수)

---

## 6. Phase 2 — 인접 매트릭스 모듈 작성 (1~2h)

### 6-1. `lib/geo/administrative-district-adjacency.ts`

**선행 조건 (J5)**: `tsconfig.json`에 `"resolveJsonModule": true` 설정. 기존 프로젝트 설정 확인 후 미설정 시 PR-2 또는 PR-3에 추가.

```typescript
// J5 — resolveJsonModule 필요. 미설정 시 fs.readFileSync + JSON.parse fallback
import adjacencyData from "./administrative-district-adjacency.json";

const ADJACENCY: Record<string, string[]> = adjacencyData;

/**
 * 행안부 표준 시·군·구 코드 10자리의 인접 시·군·구 코드 목록.
 * Phase 1-C에서 turf.js로 자동 생성 (LSMD_ADM_SECT_RGN.geojson).
 */
export function getAdjacentSigunguCodes(sigunguCode: string): string[] {
  return ADJACENCY[sigunguCode] ?? [];
}

/** 매트릭스에 등록된 시·군·구 수 (검증·디버깅용) */
export function getSigunguCount(): number {
  return Object.keys(ADJACENCY).length;
}
```

### 6-2. anchor 10건 — `__tests__/lib/geo/administrative-district-adjacency.test.ts`

```typescript
describe("[ADJ] 인접 매트릭스 검증", () => {
  it("ADJ-1: 강남구(1168) ↔ 서초구(1165) 인접", () => {
    expect(getAdjacentSigunguCodes("1168000000")).toContain("1165000000");
  });
  // ADJ-2~9 동일 패턴 (송파·용인·동래·제주·세종 등)
  it("ADJ-10: 전체 시·군·구 수 검증 (약 250)", () => {
    expect(getSigunguCount()).toBeGreaterThan(240);
    expect(getSigunguCount()).toBeLessThan(260);
  });
});
```

### 6-3. Phase 4 통합 (0.5~1h, 별도 PR 또는 본 PR 통합)

`lib/calc/farming-residence-check.ts` 호출처에서 resolver 자동 주입:
```typescript
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

const result = checkFarmingResidenceCompliance(estateItems, farming, {
  adjacentSigunguCodes: getAdjacentSigunguCodes,
});
```

호출처는 `lib/tax-engine/deductions/inheritance-deductions.ts:calcFarmingDeduction()`. 본 PR 또는 별도 Phase 4 PR.

---

## 7. Phase 3 — 역지오코딩 + PNU↔표준코드 매핑 (4~6h)

### 7-3.1 PNU 5자리 ↔ 행안부 10자리 매핑 사전 검증 (C6·1~2h)

`scripts/verify-pnu-sigungu-mapping.ts`:
- KOEDB 법정동코드 전체자료 로드
- Vworld AddressSearch 샘플 좌표 10건 → pnu 추출 → 앞 5자리 = 행안부 10자리 앞 5자리 검증
- 행정구역 개편 이력에서 갈라진 사례 검토 (지난 5년)

**anchor 10건** — `__tests__/scripts/pnu-mapping.test.ts`:
- 서울 강남(11680) ↔ 행안부 1168000000
- 수원 영통 등 일반 시·군·구
- 세종특별자치시 (개편 이력 — 2012)
- 제주 행정시 (특별법)
- 광역시 자치구 vs 일반구

### 7-3.2 Vworld 역지오코딩 보강 (2~3h)

현재 AddressSearch는 pnu 제공. Vworld 역지오코딩 API 직접 호출 옵션:
- `lib/calc/vworld-reverse-geocode.ts`
- 좌표(lat·lng) → 시·군·구 코드 (pnu 미보유 시 fallback)
- 캐시: 영구 또는 24h
- rate limit (Vworld 키 공유 — 환경변수 `VWORLD_API_KEY`)

### 7-3.3 PropertyValuationForm 통합 (1h)

기존 AddressSearch 사용처에 `extractSigunguCodeFromPnu(v.pnu)` 적용 (FarmingEligibilitySection 패턴 차용):
- `EstateItem.estateSigunguCode`·`fishingAnchorSigunguCode` 자동 채움
- `EstateItem.estateAddress.pnu` 영속화

### 7-3.4 결과물

- `lib/calc/vworld-reverse-geocode.ts` (또는 PNU 파싱만 사용 시 미생성)
- `scripts/verify-pnu-sigungu-mapping.ts`
- `__tests__/scripts/pnu-mapping.test.ts` (anchor 10건)
- PropertyValuationForm 통합 패치

---

## 8. 도구·환경

### 8-1. 신규 의존성 (J11 — PR-2에서 package.json 변경)

```bash
# PR-2 commit: package.json + package-lock.json + scripts/build-sigungu-adjacency.ts 동반
npm install --save-dev @turf/turf
npm install --save-dev @types/geojson
```

### 8-2. 데이터 파일 (소스 컨트롤 제외 + 빌드 산출물 commit)

```
data/                                            # .gitignore (raw 원본만)
├── LSMD_ADM_SECT_RGN.shp                        # 행정안전부 SHP 원본 (~50MB)
├── LSMD_ADM_SECT_RGN.geojson                    # 변환된 GeoJSON
└── beopjeongdong_code.txt                       # KOEDB 법정동코드

lib/geo/                                         # commit
├── administrative-district-adjacency.json       # 빌드 산출물 (~50KB)
├── administrative-district-adjacency.ts         # resolver 모듈
└── sigungu-code-list.ts                         # 행안부 표준 코드·명칭 매핑
```

`data/`는 `.gitignore` 추가. **빌드 산출물 JSON은 lib/geo/ 직속에 commit** (J9 정정).

### 8-3. 환경변수

```bash
VWORLD_API_KEY=...    # Phase 3-2 역지오코딩 (선택)
```

---

## 9. 체크리스트

### Phase 1
- [ ] 데이터 출처 4종 PoC 응답 샘플 5건+ 첨부 (`docs/03-research/farming-residence-data-sources.md`)
- [ ] KoreanLaw 해석례 5건+ 인용 (`docs/03-research/farming-residence-interpretations.md`)
- [ ] §16⑤1호 다목 "5년 조림" 적용 여부 결론
- [ ] "거주" 주민등록 필수 여부 결론
- [ ] 광역시·도 경계 OR 정책 확정
- [ ] turf.js 스크립트 작성·실행
- [ ] 매트릭스 anchor 10건 (서울·경기·부산·제주·광역시 경계)

### Phase 2
- [ ] `lib/geo/administrative-district-adjacency.json` (~50KB)
- [ ] `lib/geo/administrative-district-adjacency.ts` resolver 모듈
- [ ] anchor 10건 통과
- [ ] `calcFarmingDeduction` 호출처에 resolver 주입

### Phase 3
- [ ] PNU 매핑 anchor 10건 (광역시·세종·제주 등 특수 케이스 포함)
- [ ] `extractSigunguCodeFromPnu` PropertyValuationForm 통합
- [ ] (선택) Vworld 역지오코딩 API 클라이언트 + 캐시

### 통합 검증
- [ ] 본 세션 anchor 21건(FR-1~21) + Phase 2/3 신규 anchor 모두 통과
- [ ] adjacent_district 시나리오 브라우저 수동 확인 (예: 강남↔서초)
- [ ] PRD v4.1.1 §6-5 시한 준수 또는 revert 결정

---

## 10. 위험 요소·롤백

| 위험 | 대응 |
|---|---|
| 행정구역 개편 (연 1~2건) | **갱신 자동화 (J13 정정)**: GitHub Actions cron(월 1회) — `scripts/build-sigungu-adjacency.ts` 재실행 + adjacency anchor 10건 재검증 + 변경 시 PR 자동 생성. 수동 fallback: 행안부 공지 모니터링 + 분기별 수동 재빌드 |
| SHP 파일 라이선스 (공공누리 1유형 vs 2~4유형) | 공공누리 1유형 확정 시 raw 데이터도 `data/`에 commit 검토. 그 외 빌드 산출물(`lib/geo/*.json`)만 commit. 라이선스 표기는 `lib/geo/README.md` 신규 |
| turf.booleanIntersects 정확성 (해안선·섬) | anchor 10건으로 검증, 실패 시 수동 보정 매트릭스 추가. ADJ-8(인천 강화)·ADJ-9(통영·거제) 해상 케이스 필수 검증 |
| Vworld API rate limit | 캐시 영구화 + 사용자 1회 호출 가정 (편집 모드 외 호출 0) |
| Phase 1 미완 + 2026-07-03 시한 | Phase 0~5 revert — `git revert ff93e09 3098d95 7cf2094 5184d74` (계획서까지 포함) |

---

## 11. 분할 PR 권장 순서

| # | PR 제목 | 작업량 | 의존 |
|---|---|---|---|
| 1 | 해석례(3~4h) + 데이터 출처 PoC(2~4h) 조사 보고서 + KOEDB 파싱 → sigungu-code-list.ts | **6~10h** | — |
| 2 | turf.js 매트릭스 스크립트 + 산출 JSON + package.json @turf/turf 추가 (J11) | 5~8h | PR-1 정책 결정 |
| 3 | adjacency.ts 모듈 + anchor 10건 + calcFarmingDeduction 통합 + tsconfig resolveJsonModule (J5) | 1~2h | PR-2 |
| 4 | PNU 매핑 anchor 10건 + PropertyValuationForm 통합 | 1~2h | **PR-1·PR-3** (J10 정정 — KOEDB 의존 + adjacency 통합 검증) |
| 5 (선택) | Vworld 역지오코딩 API 클라이언트 + **IndexedDB(Dexie) 캐시** (N4·M3) | 2~3h | PR-4 |
| 6 (선택) | **CI cron 매트릭스 갱신 워크플로** (N7·N8) — 분기 1회 자동 PR | 1~2h | PR-3 |
| **합계 (PR-1~4 필수)** | | **13~22h** | |
| **합계 (PR-5·6 포함)** | | **16~27h** | |

§0 합계와의 정합 산수 (K1 정정):

| 매핑 | Phase | 시간 |
|---|---|---|
| PR-1 (해석례 3~4h + PoC 2~4h + KOEDB→sigungu-code-list 1~2h) | Phase 1-A·1-B·1-D 일부 | 6~10h |
| PR-2 (turf.js 매트릭스 5~8h) | Phase 1-C | 5~8h |
| PR-1 + PR-2 합 | **Phase 1** | **11~18h** vs §0 12~20h (≈ 1~2h 보수 여유) |
| PR-3 (adjacency.ts + 통합) | **Phase 2** | **1~2h** ↔ §0 1~2h |
| PR-4 (PNU 매핑 + UI 통합) | Phase 3 (필수) | 1~2h |
| PR-5 선택 (Vworld 역지오코딩) | Phase 3-선택 | 2~3h |
| PR-4 + PR-5 합 | **Phase 3 전체** | **3~5h** vs §0 4~6h+2~3h (보수 여유 ~1~4h) |

**정합 합계**: PR-1~4 필수 = 13~22h, PR-5 포함 = 15~25h. §0 합계 17~28h(필수) / 19~31h(전체)와 ~2~6h 보수 여유 — Phase 1 PoC가 실제 데이터 응답성에 따라 변동. 시한(2026-06-12) 진입 시 보수 여유 활용.

분할 commit 메시지 한국어 — `📊 chore: 영농상속공제 §16②1호나 행정구역 데이터 PoC (PR-1)` 등.

---

## 12. 본 계획서 이후

Phase 1·3 완료 시 PRD v4.1.1 § 11-2 시한 갱신 + `docs/00-pm/recent-completions.md`에 commit 이력 기록.

후속 후보 (PRD §11-3):
- 양도세 §104조의3 비사업용 토지 매트릭스 재사용 (10~15h)
- 취득세 자경 감면 sigunguCode 분기 (3~5h)
- §16⑤마목 마을어업·협동양식업 면허 제외 보조 필드 (2~3h)
