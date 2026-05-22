# 영농상속공제 §16②1호나 행정구역 데이터 출처 PoC

> **선행 계획서**: `docs/00-pm/inheritance-farming-residence-data-infra.plan.md` v1.2 §2-A·§3-3
> **본 문서 상태**: PR-1b 1차 PoC (WebFetch 4종) — 부분 확보 + 후속 수동 조사 필요
> **조사 일자**: 2026-05-22
> **목표**: 4 출처 중 2종 이상 응답 샘플 5건+ 첨부 + 채택 결정 근거 (계획서 §2-A.2)

---

## 1. PoC 진행 상황

| # | 출처 | URL | WebFetch 결과 | 후속 수동 조사 |
|---|---|---|---|---|
| 1 | KOEDB (행정안전부 법정동코드) | https://www.code.go.kr/stdcode/regCodeL.do | ⚠️ 부분 확인 — 20,560건 4단계 계층 | 다운로드 페이지 + 파일 구조 |
| 2 | 통계청 SGIS Open API | sgis.kostat.go.kr → sgis.mods.go.kr | ❌ 302 redirect 후 404 | 공식 개발자 가이드 직접 접근 |
| 3 | 공공데이터포털 LSMD_ADM_SECT | data.go.kr/data/15048850·15054818 | ❌ 데이터셋 ID 부정확 (404) | 검색 페이지에서 정확 ID 확인 |
| 4 | V-World 행정경계 | api.vworld.kr/req/data | ⚠️ 엔드포인트 확인 — 시·군·구 레이어 미명시 | 공식 데이터 가이드 + LT_C_ADSIGG_INFO 검증 |

---

## 2. 출처별 1차 확인 사항

### 2-1. KOEDB (행정안전부 법정동코드)

- **소관 부서**: 국토교통부 국토도시실 국토정보정책관 공간정보제도과 (044-201-4653)
- **총 데이터**: 20,560건
- **계층 구조**: 시/도 + 시/군/구 + 읍/면/동 + 리 (4단계)
- **시·군·구 추출 가능**: ✅ (시·군·구 수준 필터링 후 약 250+ entry 예상)

**미확인** (후속 조사):
- 다운로드 형식 (TXT/CSV/XLS?)
- 파일 구조 (TAB 구분?)
- 갱신 주기
- 라이선스 (공공누리 1유형?)

### 2-2. 통계청 SGIS Open API

- **호스트 변경**: sgis.kostat.go.kr → sgis.mods.go.kr (2026 이전 마이그레이션 추정)
- **개발자 가이드 페이지 404**

**미확인** (후속 조사):
- 엔드포인트
- 응답 형식 (JSON/XML)
- rate limit
- API 키 발급
- 시·군·구 단위 데이터

### 2-3. 공공데이터포털 LSMD_ADM_SECT

- **테스트 URL 2종 모두 404** (정확한 데이터셋 ID 미확인)
- LSMD_ADM_SECT_RGN·LSMD_ADM_SECT_SGG 시리즈 검색 필요

**미확인** (후속 조사):
- 정확한 데이터셋 ID
- SHP 파일 크기 (~50MB 예상)
- 라이선스 (공공누리 유형)
- 좌표계 (EPSG:5179 or 5186 예상)
- 시·군·구 수준 폴리곤 (vs 읍·면·동 수준)

### 2-4. V-World 행정경계

- **엔드포인트**: `https://api.vworld.kr/req/data`
- **응답 형식**: JSON (기본) / XML
- **연락처**: 1661-0115 · vworld@spacen.or.kr (평일 09~18 KST)
- **확인된 레이어**: `LP_PA_CBND_BUBUN` (연속지적도) — 본 PoC 목표(LT_C_ADSIGG_INFO 시·군·구)와 다름
- **rate limit**: "일일 제한량" 존재 — 구체 수치 미확인

**미확인** (후속 조사):
- 시·군·구 행정경계 레이어 정확 코드 (LT_C_ADSIGG_INFO 가설)
- sigunguCode 자리수 (10자리?)
- API 키 발급 절차
- 일일 호출 한도

---

## 3. 1차 채택 권장 (PoC 부분 결과 기반)

| 우선순위 | 출처 | 사유 |
|---|---|---|
| **1** | KOEDB | 가장 안정 — 정부 표준 데이터, 4단계 계층 명확. sigungu-code-list 생성 1순위 |
| **2** | 공공데이터포털 LSMD_ADM_SECT | turf.js 매트릭스 빌드용 SHP 폴리곤 1순위. 데이터셋 ID 후속 확인 |
| 3 | V-World | 역지오코딩(Phase 3 PR-5)에 활용 — 사용자 좌표 입력 시 sigunguCode 자동 추출 |
| 4 | SGIS | 보조 — API 형태로 동적 조회 필요 시 |

**최소 PoC 합격 조건** (계획서 §2-A.2): 출처 2종 이상 응답 샘플 5건+
**현재 진척**: 4종 부분 확인 — **모두 후속 수동 조사 필요**

---

## 4. 후속 작업 (Phase 1 본격 진입 시)

### 4-1. KOEDB 수동 다운로드 (1~2h)
1. `www.code.go.kr` 방문 → 법정동코드 다운로드 페이지 (조회 화면 외 별도)
2. 전체자료 TXT 또는 XLS 파일 다운로드 (가정 ~3MB)
3. 인코딩 확인 (EUC-KR vs UTF-8)
4. `data/beopjeongdong_code.txt`에 저장
5. `scripts/parse-koedb.ts` 작성 — 시·군·구 수준 250+ entry 추출 → `lib/geo/sigungu-code-list.ts` 갱신

### 4-2. 공공데이터포털 검색·다운로드 (1~2h)
1. `data.go.kr` 검색: "LSMD_ADM_SECT" 또는 "행정구역 경계"
2. 정확한 데이터셋 ID 확정
3. SHP 다운로드 + 라이선스 확인
4. `data/LSMD_ADM_SECT_*.shp` 저장 (`.gitignore`)
5. `ogr2ogr` 또는 `mapshaper`로 GeoJSON 변환
6. `data/LSMD_ADM_SECT_*.geojson` → PR-2 turf.js 매트릭스 빌드 input

### 4-3. V-World 키 발급·API 검증 (1~2h)
1. `www.vworld.kr` 회원가입 + 키 발급
2. `KIWOOM_*` 환경변수 패턴 차용 → `VWORLD_API_KEY` 추가
3. 시·군·구 레이어 정확 코드 검증 (LT_C_ADSIGG_INFO 가설)
4. 응답 샘플 5건+ 첨부 — 강남구·세종·제주 등

### 4-4. SGIS API 가이드 재접근 (0.5~1h)
1. sgis.mods.go.kr 신규 호스트에서 개발자 가이드 검색
2. 행정구역 API 가능 시 보조 출처로 활용 / 불가 시 미채택

---

## 5. 결론

본 1차 PoC는 WebFetch 자동화 한계로 부분 확보 — **4 출처 모두 후속 수동 조사 필요**.

**Phase 1 본격 진입 시 (2026-06-12 시한)** 위 §4 작업 4종 완료 후 채택 결정 확정.

**잠정 채택 권장 (수동 검증 전 가설)**:
- sigungu-code-list 생성 → **KOEDB**
- 매트릭스 빌드 SHP → **공공데이터포털 LSMD_ADM_SECT**
- 역지오코딩 (Phase 3 PR-5) → **V-World LT_C_ADSIGG_INFO**

---

## 6. 변경 이력
- v1 (2026-05-22) — WebFetch 1차 PoC 결과 + 후속 수동 조사 항목 (PR-1b 1차 완료)
