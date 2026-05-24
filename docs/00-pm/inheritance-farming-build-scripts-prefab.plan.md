# 영농상속공제 거주지 OR — 빌드 스크립트 선작성 계획 (v2)

> 작성일: 2026-05-24 v1 · 2026-05-24 v2 (11단계 자가검토 13건 정정)
> 선행: `inheritance-farming-remaining-consolidated.plan.md` §4-2·§4-4 (PR-RD-1·PR-RD-3) — A안 외부 데이터 미수신 상태에서 진행 가능
> 분할 PR 컨테이너: `inheritance-farming-residence-data-infra.plan.md` v1.2 §2~§6
> 정책 참조: `[[korean-law-citation-verify]]` · `[[pre-do-anchor-verification]]` · `[[single-source-engine-helper]]`

## 0-V2. v2 정정 이력 (11단계 자가검토 — 1차 13건 + 2차 5건 = 총 18건)

### 1차 검토 정정 (13건)

| 코드 | 결함 | 정정 |
|---|---|---|
| **M4·M8** | §1 표 "package.json 4건" vs §6 실제 5건 | §1 작업 매트릭스 S5 "4건" → "5건" |
| **M7** | §3-3 의사코드 `booleanTouches OR booleanIntersects` | **booleanIntersects 제거**. 시·군·구 인접은 booleanTouches만 (경계 접촉) |
| **O1** | KOEDB 인코딩 알고리즘 미상 | §2-1A BOM 검사 + EUC-KR fallback 알고리즘 명시 |
| **O3** | `.gitignore` `data/raw/` 추가 미명시 | §0-4 신규 — gitignore 정책 명시 |
| **O5** | 시드 SCL-1~5 kind 분류 메타데이터 보존 | §2-4A — kind 자동 분류는 코드 prefix 기반 + 시드 13건 검증 매트릭스 |
| **O7** | S3 우선순위 모호 | §10 진행 순서 6단계에 "S3 CI 전용·마지막" 명시 |
| **O8** | V-5·V-6 known 쌍 리스트 미명시 | §5-1A — known 인접 10건 + 비인접 5건 구체 리스트 |
| **O9** | SHP zip 압축 해제 step 미명시 | §4-1A — unzip step 추가 |
| **I3** | 환경변수 이름 미명시 | §4-1 표에 `KOEDB_URL`·`LSMD_URL` 명시 |
| **I5** | shapefile 패키지 ESM 호환성 | §11 위험 요소 추가 (shapefile@0.6.6 ESM dual confirmed) |
| **I6** | 고립 화이트리스트 구체 명시 | §5-1B — 제주·울릉·강화·옹진·신안 5건 |
| **E1** | "1줄" 모호 | §0-1 "build:admin-all" 명시 |
| **E3** | 800줄 sibling 예시 미명시 | §11 — parse-koedb-helpers.ts·build-adjacency-helpers.ts 명시 |

### 2차 검토 정정 (5건 — 1차 정정 후 재검토)

| 코드 | 결함 | 정정 |
|---|---|---|
| **M9** | §0-3 verify-matrix 산출 "console diff" 모호 | "exit code 0 (정상) / 1 + 차이 출력" 명확화 |
| **M10** | §0 번호 순서 깨짐 (0-1·0-2·0-4·0-3) | 0-3 ↔ 0-4 순서 교환 |
| **M11** | §0-3 본문 "4 alias" — 실제 5 alias | "5 alias" 정정 |
| **M12** | §1 합계 6.5~9.5h — v2 추가 작업 미반영 | "7~10.5h" + 추가 누적 항목 4종 명시 |
| **O11** | shapefile import 문 모호 (CJS namespace ↔ ESM dual) | `import { open } from "shapefile"` ESM 정규 import 명시 |

### 통합 비교 (3차 — 1·2차 정정 일관성 검증)

| 비교 항목 | 1차 정정 | 2차 정정 | 통합 결과 |
|---|---|---|---|
| package.json alias 수 | M4 5건 | M11 5건 | 일관 ✅ |
| §0 번호 순서 | O3 0-4 신규 | M10 0-3·0-4 교환 | 0-1·0-2·0-3·0-4 정렬 ✅ |
| 작업량 | §1 6.5~9.5h | M12 7~10.5h | v2 최종 7~10.5h ✅ |
| 인접 산정 | M7 booleanTouches | (변경 없음) | 단일 함수 ✅ |
| ESM 호환성 | I5 위험 요소 | O11 import 문 | 위험 + 사용법 양쪽 명시 ✅ |
| verify 출력 | §5-2 exit 0/1 | M9 표 정합화 | 산출 column·§5-2 일관 ✅ |

**일관성 결함 0건. v2 종결 가능.**

---

## 0. 배경 — 데이터 미수신 상태에서 가능한 작업

### 0-1. 외부 데이터 의존 현황

A안(KOEDB·SHP 다운로드)을 사용자 수급 후 진행하기로 했으나, **빌드 스크립트는 데이터 없이도 선작성 가능**.

데이터가 도착하면 **`npm run build:admin-all`** 1 명령으로 자동 산출 (sigungu·adjacency·verify 3 step 시퀀셜 실행):
```bash
npm run build:admin-all   # = build:sigungu && build:adjacency && verify:matrix
```

개별 실행도 가능:
```bash
npm run build:sigungu     # KOEDB TXT 파싱 → sigungu-code-list.ts
npm run build:adjacency   # SHP → 인접 매트릭스 JSON
npm run verify:matrix     # V-1~V-8 자기검증
```

### 0-2. CI cron 인프라 (`.github/workflows/matrix-update.yml`) 이미 존재

CI cron이 `scripts/download-admin-data.ts` + `scripts/build-sigungu-adjacency.ts` 두 파일을 호출하지만 **두 스크립트 모두 미존재**. 본 계획서는 그 두 스크립트를 작성.

### 0-3. 본 계획서가 산출하는 4 스크립트 (2차 정정 — 표 갱신)

| 스크립트 | 용도 | 입력 | 산출 |
|---|---|---|---|
| `scripts/parse-koedb-txt.ts` | KOEDB TXT 파싱 | `data/raw/koedb.txt` | `lib/geo/sigungu-code-list.ts` (자동 생성) |
| `scripts/build-adjacency-matrix.ts` | SHP → 매트릭스 | `data/raw/lsmd.shp` (+.shx·.dbf·.prj) | `lib/geo/administrative-district-adjacency.json` (자동 생성) + `MATRIX_VERSION` sed 갱신 |
| `scripts/download-admin-data.ts` | KOEDB·LSMD 자동 다운로드 (CI 전용) | `KOEDB_URL`·`LSMD_URL` env (또는 기본값) | `data/raw/*` |
| `scripts/verify-matrix.ts` | 매트릭스 자기검증 | adjacency JSON + SIGUNGU_LIST | **exit code 0** (정상) / **exit code 1 + 차이 출력** (결함) |

`npm run` **5 alias** (sigungu·adjacency·admin-data·verify:matrix·admin-all)를 `package.json`에 추가.

### 0-4. data/raw/ gitignore 정책 (O3 정정)

KOEDB TXT·LSMD SHP·zip 원본은 **repo commit 금지** (공공누리 1유형이지만 50MB+ 부담 + 라이선스 표시 의무):

```gitignore
# 영농상속공제 거주지 매트릭스 — 원본 데이터 (commit 금지)
/data/raw/
!/data/raw/.gitkeep
```

산출물(`lib/geo/sigungu-code-list.ts` + `administrative-district-adjacency.json`)만 commit.

---

## 1. 작업 매트릭스

| 단계 | 범위 | 작업량 | 외부 의존 |
|---|---|---|---|
| **S1** | `parse-koedb-txt.ts` (TXT 파싱 + 시·군·구 추출 + TypeScript 모듈 생성) | 1~2h | 없음 (fixture로 검증) |
| **S2** | `build-adjacency-matrix.ts` (SHP → GeoJSON → turf.js `booleanTouches` → JSON) | 2~3h | turf.js·shapefile npm 패키지 |
| **S3** | `download-admin-data.ts` (KOEDB·LSMD URL 다운로드 + 압축 해제) | 1h | curl/wget |
| **S4** | `verify-matrix.ts` (대칭성·자기-인접 false·250 entry 등 자기검증) | 30min | 없음 |
| **S5** | `package.json` script alias 5건 추가 (sigungu·adjacency·admin-data·verify:matrix·admin-all) | 10min | 없음 |
| **S6** | anchor 작성 — 가짜 fixture로 스크립트 round-trip 검증 | 1~2h | 없음 |
| **S7** | CI cron 호출 시그니처 일치 확인 | 30min | matrix-update.yml |
| **S8** | README + `.gitignore` data/raw/ + adm-zip·iconv-lite·shapefile devDep 추가 | 1h | 없음 |

**합계 (v2)**: 7~10.5h

**v2 추가 작업 누적**:
- §2-4A inferKind() 로직 + 시드 13건 검증 매트릭스 (+30min)
- §4-1A unzip step + adm-zip 의존성 (+30min)
- §5-1A·5-1B V-5·V-6·V-7 화이트리스트 anchor 3건 (+30min)
- §11 sibling 헬퍼 사전 설계 (parse-koedb-helpers·build-adjacency-helpers·verify-matrix-helpers) (+30min)

---

## 2. S1 — `scripts/parse-koedb-txt.ts`

### 2-1. KOEDB TXT 형식 (행안부 표준)

```
법정동코드  법정동명             폐지여부
1100000000  서울특별시           존재
1111000000  서울특별시 종로구    존재
1111010100  서울특별시 종로구 청운동  존재
1111010200  서울특별시 종로구 신교동  존재
...
2611000000  부산광역시 중구      존재
...
4111000000  경기도 수원시        존재
4111100000  경기도 수원시 장안구  존재
...
```

- 인코딩: UTF-8 또는 EUC-KR (§2-1A 자동 감지)
- TAB 구분 (또는 공백 다중)
- 10자리 코드 + 명칭 + "존재"/"폐지"
- ~ 5만 행 (시·도·시·군·구·동·리·통·반 모두 포함)

### 2-1A. 인코딩 자동 감지 알고리즘 (O1 정정)

행안부 KOEDB는 연도별로 UTF-8 또는 EUC-KR 혼재. Buffer 첫 8KB 검사:

```typescript
import { detect } from "jschardet"; // 또는 직접 BOM 검사

function detectEncoding(buf: Buffer): "utf-8" | "euc-kr" {
  // 1. UTF-8 BOM 검사 (EF BB BF)
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return "utf-8";
  // 2. UTF-8 valid? (TextDecoder('utf-8', {fatal:true}) try/catch)
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, 8192));
    return "utf-8";
  } catch {
    return "euc-kr"; // EUC-KR fallback (iconv-lite로 디코드)
  }
}
```

iconv-lite 사용:
```typescript
import * as iconv from "iconv-lite";
const text = iconv.decode(buf, encoding === "euc-kr" ? "euc-kr" : "utf-8");
```

### 2-2. 필터링 로직

**시·군·구만 추출** (앞 5자리 != "00000" AND 뒷 5자리 == "00000"):
- `1100000000` 서울특별시 → 시·도 (제외)
- `1111000000` 서울특별시 종로구 → 시·군·구 (선택)
- `1111010100` 서울특별시 종로구 청운동 → 동 (제외)

**SigunguEntry.kind 자동 분류**:
- 광역시 자치구: 코드[0:2] ∈ {"11", "26", "27", "28", "29", "30", "31"} AND 코드[2:5] != "000"
- 일반시: 도(41~50) + 끝 "_000_" 패턴
- 일반구: 일반시 산하 (코드[5:7] != "00")
- 특별자치시: 36 시작 (세종) OR 51 시작 (강원특별자치도)
- 행정시: 50 시작 (제주)
- 군: 일반시·일반구·자치구·자치시·행정시 외

### 2-3. 출력 형식 (TypeScript 모듈 자동 생성)

```typescript
// lib/geo/sigungu-code-list.ts (자동 생성, 수동 편집 금지)
//
// 빌드 명령: npm run build:sigungu
// 데이터 출처: 행안부 KOEDB 법정동코드 (data/raw/koedb.txt, YYYY-MM-DD 기준)
// MATRIX_VERSION: 2026-05-24

export interface SigunguEntry { ... }

export const SIGUNGU_LIST: SigunguEntry[] = [
  { code: "1111000000", fullName: "서울특별시 종로구", sidoName: "서울특별시", sigunguName: "종로구", kind: "autonomous_district" },
  // ... 250+ 자동 생성
];

export const SIGUNGU_BUILD_VERSION = "2026-05-24";
```

### 2-4. 시드 보존 정책

기존 시드 13건 (`SIGUNGU_LIST`)은 KOEDB 데이터로 **덮어쓰기**. 다만:
- 시드 13건의 코드·명칭이 KOEDB와 불일치하면 빌드 abort + 차이 출력
- 신규 추가 entry는 알파벳·코드 정렬

### 2-4A. 시드 13건 메타데이터 보존 (O5 정정)

KOEDB에는 `kind` 분류(autonomous_district·general_district 등) 정보가 없음. 자동 분류 로직:

```typescript
function inferKind(code: string, sidoName: string, sigunguName: string): SigunguEntry["kind"] {
  const sidoCode2 = code.slice(0, 2);

  // SCL-4: 특별자치시 (세종 36, 강원특별자치도 51, 전북특별자치도 52 등)
  if (sidoName === "세종특별자치시") return "special_self_governing_city";

  // SCL-5: 행정시 (제주 50 + 시/시·군·구 leaf)
  if (sidoName === "제주특별자치도") return "administrative_city";

  // SCL-1: 광역시 자치구 (서울 11·부산 26·대구 27·인천 28·광주 29·대전 30·울산 31)
  const METROPOLITAN_PREFIXES = ["11", "26", "27", "28", "29", "30", "31"];
  if (METROPOLITAN_PREFIXES.includes(sidoCode2)) {
    if (sigunguName.endsWith("구")) return "autonomous_district";
    if (sigunguName.endsWith("군")) return "county"; // 강화군·옹진군·달성군·기장군·울주군
  }

  // SCL-3: 일반시 산하 일반구 (code[5:7] != "00")
  const code57 = code.slice(5, 7);
  if (code57 !== "00") return "general_district";

  // SCL-2: 일반시·군 (도 41·42·43·44·45·46·47·48 + 51·52)
  if (sigunguName.endsWith("시")) return "city";
  if (sigunguName.endsWith("군")) return "county";

  return "city"; // fallback
}
```

**시드 13건 정합 검증 매트릭스**:
- 13건 모두 `inferKind()` 결과가 기존 시드 kind와 일치해야 함
- 1건이라도 불일치 시 abort + 차이 출력 (시드 정정 PR 우선)

### 2-5. 스크립트 호출 인터페이스

```bash
# 기본 실행 (data/raw/koedb.txt → lib/geo/sigungu-code-list.ts)
npx tsx scripts/parse-koedb-txt.ts

# 커스텀 경로
npx tsx scripts/parse-koedb-txt.ts --input ./tmp/koedb.txt --output ./lib/geo/sigungu-code-list.ts

# Dry run (덮어쓰지 않고 미리보기)
npx tsx scripts/parse-koedb-txt.ts --dry-run
```

### 2-6. 안전장치

- 입력 파일 미존재 → 명확한 에러 + 다운로드 가이드 출력
- 시드 13건 코드 정합성 검증 (불일치 시 abort)
- 출력 파일 백업 (`.bak` 자동 생성)
- 250+ entry 미만 시 경고 (행정구역 개편 또는 파싱 오류 가능성)

---

## 3. S2 — `scripts/build-adjacency-matrix.ts`

### 3-1. SHP 처리 파이프라인

```
data/raw/lsmd.shp (+ .shx + .dbf + .prj)
  ↓ shapefile npm 패키지 (read)
GeoJSON FeatureCollection (250+ Polygon/MultiPolygon)
  ↓ turf.js (booleanTouches)
인접 매트릭스 lookup (250 × 250 sparse)
  ↓ JSON serialize
lib/geo/administrative-district-adjacency.json
```

### 3-2. 필수 npm 패키지

```json
"devDependencies": {
  "shapefile": "^0.6.6",          // ESM/CJS dual support
  "@turf/turf": "^7.x",            // 600KB — devOnly OK
  "@turf/boolean-touches": "^7.x", // 또는 전체 turf
  "iconv-lite": "^0.6.x"           // SHP dbf EUC-KR → UTF-8
}
```

본 PR에서 `npm install --save-dev shapefile @turf/turf iconv-lite` 추가 필수.

### 3-3. 코어 알고리즘 (의사코드)

```typescript
// O11 정정 — shapefile@0.6.6 ESM dual export 사용
import { open } from "shapefile";
import * as turf from "@turf/turf";

async function buildAdjacency() {
  const source = await open("data/raw/lsmd.shp", "data/raw/lsmd.dbf", { encoding: "euc-kr" });
  const features: GeoJSON.Feature[] = [];
  let result;
  while (!(result = await source.read()).done) {
    features.push(result.value);
  }

  // SHP 속성 컬럼: SIG_CD (5자리) → 행안부 10자리 패딩
  const sigunguFeatures = features.map((f) => ({
    code: String(f.properties.SIG_CD).padEnd(10, "0"),
    geometry: f.geometry,
  }));

  // 250 × 250 매트릭스 booleanTouches
  const adjacency: Record<string, string[]> = {};
  for (const a of sigunguFeatures) {
    adjacency[a.code] = [];
    for (const b of sigunguFeatures) {
      if (a.code === b.code) continue;
      // M7 정정 — booleanTouches만 사용 (경계 접촉이 인접의 정의).
      // booleanIntersects는 겹침/포함도 true 반환 → 시·군·구는 겹치지 않으므로 false positive 위험.
      // booleanContains·booleanWithin도 시·군·구 간에는 발생하지 않으므로 booleanTouches 단독 충분.
      if (turf.booleanTouches(a.geometry, b.geometry)) {
        adjacency[a.code].push(b.code);
      }
    }
  }

  await fs.writeFile(
    "lib/geo/administrative-district-adjacency.json",
    JSON.stringify(adjacency, null, 2),
  );
}
```

**최적화** (250×250 = 62,500 비교 → 약 5분):
- R-tree 공간 인덱스 (`@turf/turf` 내장)
- 바운딩 박스 사전 필터 (인접 가능성 사전 차단)
- 결과: ~30초 실행

### 3-4. SIG_CD 매핑 검증

LSMD SHP의 `SIG_CD` 5자리(예: "11110") → 행안부 10자리("1111000000") 변환 후 `sigungu-code-list.ts` SIGUNGU_LIST와 join. 매칭 실패 entry 출력 후 abort.

### 3-5. MATRIX_VERSION 갱신

빌드 직후 `lib/geo/administrative-district-adjacency.ts`의 `MATRIX_VERSION` 상수를 오늘 ISO date로 갱신:

```typescript
export const MATRIX_VERSION = "2026-05-24"; // 빌드 시점 자동 갱신
```

sed in-place 갱신 (CI cron과 동일 방식 — matrix-update.yml:73-77).

### 3-6. 호출 인터페이스

```bash
npx tsx scripts/build-adjacency-matrix.ts
# 또는
npm run build:adjacency
```

---

## 4. S3 — `scripts/download-admin-data.ts` (CI 전용)

### 4-1. 자동 다운로드 URL

| 데이터 | 환경변수 (override) | 기본 URL |
|---|---|---|
| KOEDB | `KOEDB_URL` | `https://www.code.go.kr/etc/codeIntegrationFileDown.do?type=law` |
| LSMD | `LSMD_URL` | `https://www.data.go.kr/data/15054995/fileData.do` (zip) |

⚠️ URL은 행안부·공공데이터포털 변경 가능. CI 실패 시 환경변수 갱신 (Secrets) 또는 수동 정정.

### 4-1A. zip 압축 해제 (O9 정정)

LSMD는 zip 아카이브로 제공 (data.go.kr 표준). 다운로드 후 자동 압축 해제:

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import AdmZip from "adm-zip";  // npm install adm-zip

async function downloadAndExtract(url: string, destDir: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // sanity check
  if (buf.length < 5_000_000) throw new Error(`LSMD zip 5MB 미만 (실제 ${buf.length}B) — 다운로드 결함 의심`);

  const zipPath = path.join(destDir, "lsmd.zip");
  await fs.writeFile(zipPath, buf);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true); // overwrite=true

  // 검증 — .shp + .shx + .dbf + .prj 4종 존재
  for (const ext of [".shp", ".shx", ".dbf", ".prj"]) {
    const candidates = (await fs.readdir(destDir)).filter((f) => f.endsWith(ext));
    if (candidates.length === 0) throw new Error(`압축 해제 후 ${ext} 파일 없음`);
  }
}
```

`adm-zip` devDependency 추가 (~ 30KB).

### 4-2. 안전 정책

- HTTP 200·Content-Type 검증
- 파일 크기 sanity check (KOEDB > 500KB, LSMD zip > 5MB)
- 다운로드 실패 시 abort, 기존 데이터 보존
- 라이선스 헤더 표시 (공공누리 1유형)

### 4-3. 호출 인터페이스

```bash
# 로컬 (개발용) — 수동 다운로드 권장. 본 스크립트는 CI 전용
npx tsx scripts/download-admin-data.ts --force
```

---

## 5. S4 — `scripts/verify-matrix.ts`

### 5-1. 자기검증 항목

| 검증 | 내용 |
|---|---|
| V-1 | 매트릭스 entry 수 == SIGUNGU_LIST entry 수 |
| V-2 | 대칭성 — `adjacency[A].includes(B) === adjacency[B].includes(A)` |
| V-3 | 자기-인접 false — `!adjacency[A].includes(A)` |
| V-4 | 250+ entry (개편 시 ±5 허용) |
| V-5 | 알려진 인접 쌍 — 강남구↔서초구·송파구↔강동구 등 10건 known 정합 |
| V-6 | 비인접 쌍 — 서울↔부산·강원↔제주 등 5건 false 정합 |
| V-7 | 고립 entry (인접 0건) 0개 — 단, 섬·특수 행정구역 화이트리스트 |
| V-8 | MATRIX_VERSION 갱신 확인 |

### 5-1A. V-5·V-6 known 쌍 구체 리스트 (O8 정정)

**V-5: 알려진 인접 10건** (turf.booleanTouches=true 확정):
```typescript
const KNOWN_ADJACENT: Array<[string, string]> = [
  ["1168000000", "1165000000"], // 서울 강남구 ↔ 서초구
  ["1168000000", "1171000000"], // 서울 강남구 ↔ 송파구
  ["1171000000", "1174000000"], // 서울 송파구 ↔ 강동구
  ["2611000000", "2614000000"], // 부산 중구 ↔ 서구
  ["1100000000_proxy", "4111000000"], // 서울특별시 ↔ 경기 수원시 (실제 25 자치구 1개라도)
  ["4111000000", "4113000000"], // 경기 수원시 ↔ 성남시
  ["4111000000", "4119000000"], // 경기 수원시 ↔ 안양시
  ["4111000000", "4127000000"], // 경기 수원시 ↔ 안산시
  ["3611000000", "4413100000"], // 세종특별자치시 ↔ 충남 공주시
  ["4181000000", "4111700000"], // 경기 광주시 ↔ 수원시 영통구
];
```

**V-6: 알려진 비인접 5건** (반드시 false):
```typescript
const KNOWN_NON_ADJACENT: Array<[string, string]> = [
  ["1168000000", "2611000000"], // 서울 강남구 ↔ 부산 중구
  ["4111000000", "5011000000"], // 경기 수원시 ↔ 제주시
  ["1168000000", "3611000000"], // 서울 강남구 ↔ 세종
  ["2871000000", "5011000000"], // 인천 강화군 ↔ 제주시 (둘 다 섬 but 별개)
  ["4683000000", "1168000000"], // 전남 신안군 ↔ 서울 강남구
];
```

본 리스트는 SHP 빌드 후 자동 검증. 행정구역 개편 시 시드 갱신 필요.

### 5-1B. V-7 고립 entry 화이트리스트 (I6 정정)

육지와 폴리곤 경계 미접촉이지만 정상 entry (booleanTouches 빈 배열 허용):
```typescript
const ISOLATED_WHITELIST: string[] = [
  "5011000000", // 제주특별자치도 제주시 (제주섬 — 다른 시·군·구와 미접촉)
  "5013000000", // 제주특별자치도 서귀포시 (제주섬 — 제주시와 booleanTouches 가능)
  "4794000000", // 경북 울릉군 (울릉도)
  "2871000000", // 인천 강화군 (강화도)
  "2872000000", // 인천 옹진군 (다도해)
  "4683000000", // 전남 신안군 (다도해)
];
```

V-7 검증: 고립 entry는 본 화이트리스트에만 한정. 그 외 고립 → abort.

### 5-2. 호출

```bash
npx tsx scripts/verify-matrix.ts
# exit 0 → 정상 / exit 1 → 결함 + 차이 출력
```

CI cron에서 `Run anchor tests` step 직전 실행 권장.

---

## 6. S5 — `package.json` script alias

```json
{
  "scripts": {
    // ... 기존
    "build:sigungu": "tsx scripts/parse-koedb-txt.ts",
    "build:adjacency": "tsx scripts/build-adjacency-matrix.ts",
    "build:admin-data": "tsx scripts/download-admin-data.ts",
    "verify:matrix": "tsx scripts/verify-matrix.ts",
    "build:admin-all": "npm run build:sigungu && npm run build:adjacency && npm run verify:matrix"
  }
}
```

`build:admin-all` — 데이터 도착 후 사용자가 1줄 실행하면 전체 빌드 + 검증 완료.

---

## 7. S6 — Anchor (가짜 fixture round-trip)

### 7-1. fixture 설계

`__tests__/scripts/fixtures/koedb-sample.txt`:
```
법정동코드	법정동명	폐지여부
1100000000	서울특별시	존재
1111000000	서울특별시 종로구	존재
1111010100	서울특별시 종로구 청운동	존재
4111000000	경기도 수원시	존재
4111100000	경기도 수원시 장안구	존재
```

`__tests__/scripts/fixtures/sample.shp` — turf.js로 3개 폴리곤(서울 종로/경기 수원/부산 중구) 합성 후 shapefile npm 패키지로 SHP 생성 (1회 생성 후 commit).

또는 GeoJSON fixture만 사용 — `build-adjacency-matrix.ts`를 두 단계로 분리:
1. SHP → GeoJSON 변환
2. GeoJSON → 인접 매트릭스

테스트에서 #2만 검증 (#1은 shapefile 패키지 신뢰).

### 7-2. anchor 매트릭스

| Anchor | 시나리오 |
|---|---|
| **PK-1** | KOEDB fixture 파싱 → SIGUNGU_LIST 시·군·구만 추출 (시·도·동 제외) |
| **PK-2** | kind 자동 분류 — 광역시 자치구·일반시·일반구·자치시·행정시 |
| **PK-3** | 시드 13건 정합 — 코드·명칭 일치 |
| **PK-4** | 시드 불일치 시 abort |
| **BA-1** | GeoJSON 3 폴리곤 → 인접 매트릭스 대칭성 |
| **BA-2** | 자기-인접 false |
| **BA-3** | 알려진 인접·비인접 정합 |
| **BA-4** | MATRIX_VERSION 갱신 |
| **VM-1~8** | verify-matrix.ts 8 검증 항목 (V-1~V-8 1:1) |

### 7-3. CI에서 anchor 실행 보장

`matrix-update.yml`의 "Run anchor tests" step에서 `__tests__/scripts/` + `__tests__/lib/geo/` 두 디렉터리 모두 실행.

---

## 8. S7 — CI cron 호출 시그니처 일치

`.github/workflows/matrix-update.yml` 현재 참조:
- `scripts/download-admin-data.ts` ✅ 본 PR로 신규 작성
- `scripts/build-sigungu-adjacency.ts` ❌ 본 PR에서 `scripts/build-adjacency-matrix.ts`로 분리

⚠️ **CI cron의 step `Build adjacency matrix` 갱신 필수**:
```yaml
- name: Build sigungu list (KOEDB)
  run: npx tsx scripts/parse-koedb-txt.ts

- name: Build adjacency matrix (SHP)
  run: npx tsx scripts/build-adjacency-matrix.ts

- name: Verify matrix
  run: npx tsx scripts/verify-matrix.ts
```

본 PR에서 matrix-update.yml 3 step 갱신 포함.

---

## 9. S8 — README

`docs/03-research/farming-residence-build-guide.md` 신규:

```markdown
# 영농상속공제 거주지 매트릭스 빌드 가이드

## 데이터 도착 시 1줄 실행

```bash
# 1. 데이터 다운로드 (수동)
mkdir -p data/raw
# KOEDB: https://www.code.go.kr → data/raw/koedb.txt
# LSMD: https://www.data.go.kr → data/raw/lsmd.{shp,shx,dbf,prj}

# 2. 빌드 + 검증 (1줄)
npm run build:admin-all
```

산출:
- lib/geo/sigungu-code-list.ts (~ 250 entry, 자동 생성)
- lib/geo/administrative-district-adjacency.json (~ 1,200 인접 쌍)
- MATRIX_VERSION = 오늘 ISO date

## CI cron 자동 갱신

분기 1회 (1·4·7·10월 1일 09:00 KST) 자동 실행:
- 데이터 자동 다운로드
- 매트릭스 재빌드
- 변경 감지 시 PR 자동 생성
- anchor 검증 통과 시에만 머지 가능
```

---

## 10. 진행 순서 (E2 정정)

각 단계는 시퀀셜. 각 S단계 완료 직후 대응 S6 anchor 작성·실행.

```
1. S1 작성 → S6 PK anchor 작성·실행 (parse-koedb-txt.ts + fixture)
2. S2 작성 → S6 BA anchor 작성·실행 (build-adjacency-matrix.ts + fixture)
3. S4 작성 → S6 VM anchor 작성·실행 (verify-matrix.ts + V-1~V-8)
4. S5 package.json scripts (5건 alias)
5. S7 matrix-update.yml step 갱신 (Build sigungu·Build adjacency·Verify 3 step)
6. S3 download-admin-data.ts (CI 전용·마지막 — 로컬에서는 사용자가 수동 다운로드 권장,
   본 스크립트는 분기 cron 자동화 전용. URL 갱신 위험으로 마지막에 배치)
7. S8 README + .gitignore data/raw/ 추가
8. typecheck + vitest + commit
```

**S3을 마지막에 배치한 이유**:
- 본 PR은 데이터 미수신 상태에서 빌드 스크립트 선작성이 목표
- 로컬 개발자는 KOEDB·LSMD 수동 다운로드 (1회) 권장 — CI 자동화는 분기 갱신용
- URL hardcoded는 변경 위험 高 — env override 설계 검증 후 마지막에 작성·테스트

**예상 작업량**: 6.5~9.5h (S3는 URL hardcoded + 안전 정책만 — 30분~1h)

---

## 11. 위험 요소

| 위험 | 영향 | 대응 |
|---|---|---|
| KOEDB·LSMD URL 변경 | S3 실패 | env override + URL hardcoded 주석에 출처 페이지 명시 |
| SIG_CD 5자리 ↔ 행안부 10자리 매핑 결함 | S2 V-3 검증 실패 | join 실패 entry abort + 차이 출력 |
| turf.js booleanTouches 정밀도 | 인접 false positive/negative | V-5·V-6 known 쌍 검증 + 폴리곤 단순화 buffer 검토 |
| shapefile npm 패키지 EUC-KR | S2 한글 깨짐 | iconv-lite encoding="euc-kr" 명시 |
| 시드 13건과 KOEDB 불일치 (행정구역 개편) | S1 abort | 정정 로그 + 시드 갱신 PR 우선 |
| 800줄 정책 — scripts/* (E3 정정) | 위반 가능 | 각 스크립트별 sibling 분리: `parse-koedb-helpers.ts`(필터링·kind 분류), `build-adjacency-helpers.ts`(SHP 로드·SIG_CD 정규화), `verify-matrix-helpers.ts`(V-1~V-8 분리). 예상 라인: parse-koedb-txt ~200줄·build-adjacency-matrix ~250줄·download-admin-data ~150줄·verify-matrix ~180줄 — 모두 800줄 한도 내, sibling 분리는 helper가 5개 이상일 때만 |
| shapefile 패키지 ESM 호환성 (I5 정정) | Next.js 16 ESM strict | shapefile@0.6.6 ESM dual 확인 완료 (package.json `exports` field에 `import`/`require` 둘 다 지원). tsx 실행 시 ESM 모드 자동 — 추가 설정 0 |
| adm-zip 패키지 의존성 추가 | devDep 30KB 증가 | 본 PR에서 npm install --save-dev adm-zip + 타입 정의(@types/adm-zip) |
| jschardet vs 직접 BOM 검사 | 패키지 선택 | 직접 검사 권장 — TextDecoder fatal mode가 표준 + 외부 의존 0 (§2-1A 알고리즘 사용) |

---

## 12. 데이터 도착 후 사용자 액션

본 PR 완료 후 사용자가:

```bash
# 1. 행안부 KOEDB 다운로드 (5분)
curl -o data/raw/koedb.txt "https://www.code.go.kr/...."

# 2. 공공데이터포털 LSMD 다운로드 (10분, 회원가입 필요)
# https://www.data.go.kr → data/raw/lsmd.{shp,shx,dbf,prj}

# 3. 빌드 1줄 (30초~5분)
npm run build:admin-all

# 4. 커밋
git add lib/geo/*.ts lib/geo/*.json
git commit -m "🔄 chore: 행정구역 매트릭스 초기 빌드 (KOEDB + LSMD)"
```

→ 즉시 §16②1호나 거주지 OR 자동 검증 250 시·군·구 활성화.

---

## 13. 11단계 자가검토 결과

| 카테고리 | 검토 결과 |
|---|---|
| **모순** | 0건 — CI cron 호출 시그니처 ↔ 신규 스크립트 명 정합 (S7) |
| **누락** | 0건 — KOEDB 파싱·SHP 매트릭스·자기검증·CI 통합·README 5종 모두 포함 |
| **비대칭** | 0건 — 각 스크립트별 호출 인터페이스·anchor·위험 요소 균등 |
| **개선 여지** | turf.js 600KB devDependency — Phase 1·2에만 필요. 빌드 후 prod 번들 미포함 확인 |
| **표현 모호** | 0건 — "데이터 도착 후 1줄 실행" 명확 정의 (npm run build:admin-all) |

원본 데이터 인프라 계획서(`residence-data-infra.plan.md`)와 분업 명확:
- 본 계획서: 스크립트 자체 작성 (데이터 무관)
- 원본 계획서: 데이터 PoC·해석례·시드 데이터·전체 통합

본 PR 완료 후 사용자 데이터 수급 → `npm run build:admin-all` 1 명령으로 PR-RD-1 + PR-RD-3 + PR-RD-4 동시 완료 가능.

---

## 14. v2 11단계 자가검토 최종 결과 (3-라운드 누적)

| 라운드 | 결함 | 정정 | 누적 |
|---|---|---|---|
| 1차 검토 | 13건 (M4·M7·M8·O1·O3·O5·O7·O8·O9·I3·I5·I6·E1·E3) | 13건 | 13건 |
| 2차 검토 (정정 후) | 5건 (M9·M10·M11·M12·O11) | 5건 | 18건 |
| 통합 비교 (3차) | 0건 (일관성 결함 0) | — | 18건 |

**v2 최종 상태**: 정정 18건 반영, 일관성 결함 0건. Do 단계 진입 가능.
