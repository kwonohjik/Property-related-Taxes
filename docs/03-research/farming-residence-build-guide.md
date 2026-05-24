# 영농상속공제 거주지 매트릭스 빌드 가이드

> 관련 계획서: `docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md` v2
> 관련 PRD: `docs/00-pm/inheritance-farming-administrative-district.prd.md` v4.1.1
> 관련 인프라: `docs/00-pm/inheritance-farming-residence-data-infra.plan.md` v1.2

## 1. 데이터 도착 시 1 명령 실행

```bash
# 0. 빌드 스크립트 + devDependencies 사전 설치 (1회)
npm install   # shapefile·@turf/turf·iconv-lite·adm-zip·@types/adm-zip 포함

# 1. 데이터 다운로드 (수동, 약 15분 — CI cron은 자동)
mkdir -p data/raw
# KOEDB: https://www.code.go.kr → "법정동코드 전체자료" TXT
#   → data/raw/koedb.txt
# LSMD: https://www.data.go.kr → "LSMD_ADM_SECT_RGN" 검색 → zip 다운로드 + 압축 해제
#   → data/raw/lsmd.{shp,shx,dbf,prj}

# 2. 빌드 + 검증 (1 명령, ~30초~5분)
npm run build:admin-all
# = build:sigungu (KOEDB → sigungu-code-list.ts)
#   && build:adjacency (SHP → adjacency.json + MATRIX_VERSION sed)
#   && verify:matrix (V-1 ~ V-8 자기검증)

# 3. 산출물 commit
git add lib/geo/sigungu-code-list.ts lib/geo/administrative-district-adjacency.json lib/geo/administrative-district-adjacency.ts
git commit -m "🔄 chore: 행정구역 매트릭스 초기 빌드 (KOEDB + LSMD)"
```

## 2. 개별 명령 실행

```bash
npm run build:sigungu     # KOEDB TXT → lib/geo/sigungu-code-list.ts (자동 생성)
npm run build:adjacency   # SHP → lib/geo/administrative-district-adjacency.json + MATRIX_VERSION sed
npm run verify:matrix     # V-1 ~ V-8 자기검증 (exit 0=정상 / 1=결함)
npm run build:admin-data  # CI 전용 — KOEDB·LSMD 자동 다운로드
```

dry-run:
```bash
npx tsx scripts/parse-koedb-txt.ts --dry-run
```

## 3. 검증 항목 (V-1 ~ V-8, scripts/verify-matrix.ts)

| V-# | 검증 |
|---|---|
| V-1 | adjacency entry 수 == SIGUNGU_LIST 수 |
| V-2 | 대칭성 — A 인접 B ⇔ B 인접 A |
| V-3 | 자기-인접 false |
| V-4 | 240 ≤ entry ≤ 280 (행정구역 개편 ±5 허용) |
| V-5 | known 인접 6쌍 정합 (강남↔서초·수원↔성남 등) |
| V-6 | known 비인접 5쌍 정합 (서울↔부산 등) |
| V-7 | 고립 entry는 화이트리스트(제주·울릉·강화·옹진·신안)만 허용 |
| V-8 | MATRIX_VERSION 갱신 확인 (placeholder "0000-00-00" 차단) |

## 4. CI cron 자동 갱신 (`.github/workflows/matrix-update.yml`)

분기 1회 (1·4·7·10월 1일 09:00 KST) 자동 실행:
1. KOEDB·LSMD 자동 다운로드 (download-admin-data.ts)
2. sigungu-code-list.ts 재빌드
3. adjacency 매트릭스 재빌드 + MATRIX_VERSION sed 갱신
4. verify-matrix.ts V-1~V-8 검증
5. anchor 테스트 통과
6. 변경 감지 시 PR 자동 생성 (peter-evans/create-pull-request@v7)

수동 트리거: GitHub Actions UI에서 `workflow_dispatch` 실행.

## 5. 환경변수 override

| 변수 | 기본 | 용도 |
|---|---|---|
| `KOEDB_URL` | `https://www.code.go.kr/etc/codeIntegrationFileDown.do?type=law` | KOEDB URL 변경 시 |
| `LSMD_URL` | `https://www.data.go.kr/data/15054995/fileData.do` | LSMD URL 변경 시 |

URL 변경 빈번하지 않으므로 hardcoded 기본값 사용 + 결함 시 Secrets로 override.

## 6. 라이선스

- 행안부 KOEDB: 공공누리 1유형 (출처 표시)
- 국토지리정보원 LSMD: 공공누리 1유형

산출물(`lib/geo/*.ts`·`*.json`)은 본 repo 라이선스 적용, 데이터 출처는 자동 생성 파일 상단 주석에 명시.

## 7. data/raw/ 정책

- `.gitignore`에 `/data/raw/*` 추가 (commit 금지, 50MB+ 부담)
- `.gitkeep`만 commit (디렉터리 존재 보장)
- CI cron이 매번 자동 다운로드 → fresh 데이터로 빌드

## 8. 후속 작업

본 가이드 (v1) 이후:
- PR-RD-5b: Vworld API 클라이언트 + reverse-geocoding (좌표 → 시·군·구) — `lib/calc/vworld-reverse-geocode.ts` + IndexedDB Dexie 캐시
- PR-RE-2: 어선 어장 연안 자동화 (해양수산부 API)
- PR-RE-4: "거주" 정의 — 주민등록 필수 여부 KoreanLaw 해석례 반영
