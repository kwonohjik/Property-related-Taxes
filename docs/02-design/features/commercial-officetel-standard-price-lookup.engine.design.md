# 상업용건물·오피스텔 기준시가 자동조회 — 데이터·API 설계

> 계획서: [`docs/01-plan/features/commercial-officetel-standard-price-lookup.plan.md`](../../01-plan/features/commercial-officetel-standard-price-lookup.plan.md)
> 이 문서는 **엔진 무변경**이므로 통상의 `engine.design`(input/result 타입 확장)이 아니라
> **데이터 파이프라인 + 조회 계층 계약**을 다룬다. UI는 `.ui.design.md` 참조.
>
> **개정 이력**: v2(2026-07-27) 13단계 자가검토 STEP 6~9 반영 — 건물명 키 누락·응답 스키마 자기모순·xlsx 경로 부재 등 24건.

## 0. 엔진 변경 없음 — 근거

`lib/tax-engine/commercial-building-valuation.ts`의 input/result 타입은 **한 줄도 바뀌지 않는다.**

| 엔진이 요구하는 물리량 | CSV 제공 컬럼 | 대응 |
|---|---|---|
| `unitPriceAtTransfer` (원/㎡) | `고시가격` | 1:1 |
| `unitPriceAtAcquisition` / `unitPriceAtFirstDisclosure` (원/㎡) | `고시가격`(해당 고시일자) | 1:1 |
| `exclusiveArea` (㎡) | `전용면적` | 1:1 |
| `commonArea` (㎡) | `공유면적` | 1:1 |
| `landArea` (㎡) | **없음** | 사용자 수기 (§4 갭) |

엔진은 `floorAreaTotal = exclusiveArea + commonArea`(`:148`)를 만들어 `Math.floor(unitPrice × floorAreaTotal)`(`:151`·`:192`·`:294`)로 호별총액을 산출한다. 조회는 **폼 필드에 값을 넣을 뿐** 이 경로에 개입하지 않는다.

**신규 `AssetForm` 필드도 0개**다. 선택 호 보관은 `lib/stores/building-std-snapshot-store.ts:7`이 확립한 *"EstateItem/AssetForm 타입·initial·normalize·Zod에 진입하지 않는 별도 UI 스토어"* 패턴을 따른다.

## 1. 케이스 인벤토리

응답 필드는 §3-2 스키마를 따른다 — `parcelReason`(PNU 단위) / `dateStatus[date]`(고시일자 단위)로 구분한다.

| # | 케이스 | 입력 상태 | 기대 응답 | anchor |
|---|---|---|---|---|
| C-01 | 정상 조회 (환산, post_disclosure) | PNU 有 · 취득 2013 · 양도 2021 | 두 고시일자 모두 `ok`, 동일 호 매칭 → 4필드 | A-01 |
| C-02 | 정상 조회 (환산, pre_disclosure) | PNU 有 · 취득 2003 · 양도 2021 | 2005-01-01·2021-01-01 → 4필드 | A-02 |
| C-03 | 정상 조회 (상속 §164⑥) | PNU 有 · 상속개시 2003 | **2005-01-01 고정** → 3필드(`cbUnitPriceAtTransfer` 제외) | A-03 |
| C-04 | 층구분 충돌 필지 | 적선현대빌딩 1층 1호 | 지상층·지하층 **2행 별도 노출** | A-04 |
| C-05 | 한 필지 복수 건물명 | 스마트빌A동/B동 (1126010200 129-19) | 건물명별 **별도 행**, 목록에 건물명 노출 | A-05 |
| C-06 | **부분 시점 매칭** | 2005에 호 없음 / 2021에만 존재 | `dateStatus["2005-01-01"]="unit_not_found"`, `prices[date]=null` → **해당 필드 미충전** | A-06 |
| C-07 | 미고시 필지 | 파티션에 필지 자체 없음 | 전 시점 `unit_not_found`, `units:[]` → "미고시 — 수기 입력" | A-07 |
| C-08 | 부분 결손 고시일자 | 2020-01-01 요청 | `dateStatus="partial_data"` → "자료 미확보"(≠ 미고시) | A-08 |
| C-09 | 파티션 부재 | 2024-01-01 (미변환) | `dateStatus="partition_missing"`, `availableDates`에서 제외 | A-09 |
| C-10 | PNU 미보유 | 구 세션 자산 | 런처 `disabled` (라우트 미호출) | A-10 |
| C-11 | 특수지 비-일반/산 | 특수지 `6`(블록)·`A` 등 | `parcelReason="unjoinable_parcel"`, `units:[]` | A-11 |
| C-12 | 3시점 면적 상이 | 취득 366.1㎡ / 양도 733.72㎡ | 양도시 면적 채움 + **경고** (자동 보정 금지) | A-12 |
| C-13 | 잘못된 PNU | 19자리 아님 | **200** + `{success:false, error}` (§3-2 불변식 5) | A-13 |
| C-14 | 호 날짜 오염 | 원본 호 `03월 02일` | 파이프라인이 `3-2`로 복원 후 저장 | A-14 |
| C-15 | 2022 중복 배포본 | 지번 정정 104건 | 후행본 채택 (서초포레지움 번지 611) | A-15 |
| C-16 | 2022 zero-pad | 번지 `0080`·호 `0000` | parseInt 정규화 후 PNU 조인 성공 | A-16 |
| C-17 | xlsx 원본 | 2026 (5시트 × 50만행) | OOM 없이 변환 완료 | A-17 |

## 2. 변환 파이프라인

### 2-0. 파일 구성 (프로젝트 선례 준수)

`scripts/parse-koedb-txt.ts`·`build-adjacency-matrix.ts` 등 선례 3/3이 **순수 helpers + I/O 진입점 + `__tests__/scripts/` 테스트** 구조다. 4세대 파서 + xlsx + 중복해소 + 파티셔닝을 단일 파일에 담으면 800줄 트리거를 넘고 anchor를 단위 테스트로 쓸 수 없다.

```
scripts/build-commercial-stdprice-helpers.ts   순수 — 세대판별·정규화·호 날짜 복원·중복해소·키 산출
scripts/build-commercial-stdprice-zip.ts       I/O 프리미티브 — 스트리밍 zip 리더 (내장 zlib)
scripts/build-commercial-stdprice-xlsx.ts      I/O 프리미티브 — xlsx SAX 행 스트리밍
scripts/build-commercial-stdprice.ts           I/O 오케스트레이션 — 열거·배포본 해소·파티션 쓰기·manifest
__tests__/scripts/build-commercial-stdprice.test.ts   24 케이스 (표본 행은 전부 원본 실측값)
```

> **Do 단계 deviation (2026-07-28)**: 당초 2파일(순수+I/O) 설계였으나 zip·xlsx 리더를 별도 모듈로 분리했다.
> 둘 다 **재사용 가능한 I/O 프리미티브**이고 합계 ≈250줄이라, 오케스트레이터에 합치면 단일 파일이 700줄에
> 근접하면서 "원본 열거·배포본 해소" 논리가 바이트 파싱에 묻힌다. 순수/I·O 분리 원칙은 그대로다.
>
> 테스트 표본은 별도 `fixtures/` 파일 대신 **테스트 파일 내 실측 문자열 상수**로 뒀다 — 4세대 표본이
> 헤더+1행씩이라 파일로 빼면 EUC-KR 인코딩 왕복만 늘고 대조가 어려워진다.

**선행 조건**: 워크트리에는 `node_modules`가 없다(실측). Phase 1 착수 전 `npm ci` 필요.

### 2-1. 단계

```
data/raw/stdprice/**            원본 CSV·zip·xlsx (gitignore)
   │
   ├─ [S1]  원본 열거 + 압축 해제
   ├─ [S2a] CSV 파싱   /  [S2b] XLSX 파싱
   ├─ [S3]  정규화
   ├─ [S4]  고시일자 그룹 + 중복 배포본 해소
   ├─ [S5]  시군구 파티션 분할 + gzip
   └─ [S6]  manifest 생성
        ↓
data/stdprice/commercial/{시군구5}/{고시일자}.json.gz   (gitignore)
data/stdprice/commercial/manifest.json                  (gitignore — 빌드 산출물)
```

### S1 — 열거·해제

- ⚠️ **확장자를 신뢰하지 않는다 (필수).** `…(2020년1월1일기준).zip`은 실체가 **CSV 텍스트**였다. 확장자로 분기하면 `File is not a zip file`이 나고, 이를 "손상"으로 오판하면 **멀쩡한 자료(2020년 2-2 파트 721,852행)를 결손 처리**한다 — 실제 발생한 오진이다. 각 원본은 **선두 매직바이트로 실체를 판별**한다: `PK\x03\x04` → zip, 그 외 → 텍스트(CSV)로 취급.
- **zip 엔트리명이 cp949**다. 표준 unzip은 `Illegal byte sequence`로 실패한다(실측 — 2023 배포본). UTF-8 플래그(범용 비트 11)가 없으면 cp949로 디코딩한다.
- ⚠️ **파일명 유니코드 정규화가 배포본마다 다르다.** macOS는 NFD로 저장하는데 배포본 중 일부만 NFD다(실측: `국세청_상업용건물 오피스텔 기준시가_20260101.zip`만 NFD, 나머지는 NFC). 정규화하지 않으면 파일명 매칭·기준일 추출이 **조용히** 빗나간다 — 실제로 NFC 패턴 glob이 2026년 파일 하나만 누락시켰다. 열거 직후 **`.normalize("NFC")` 통일 필수**.
- 진짜 해제 실패는 **skip + 기록 후 계속**(전체 중단 금지). 단 skip 전에 위 매직바이트 판별을 반드시 거친다.

### S2a — CSV 파싱 · 형식 세대 판별

```ts
type Generation = "quoted-code" | "plain-code" | "plain-label" | "padded-label";
```

판별 순서:
1. 첫 데이터 행의 구분 값이 `/^[123]$/` → 코드계, 아니면 라벨계
   - ⚠️ **헤더명으로 판별 금지** — 2019는 헤더가 `상가종류코드`인데 값은 코드다. **값 sniffing 필수**.
2. `번지` 값이 `/^0\d{3}$/` → zero-pad 세대(2022·2024~2026)
3. 헤더 첫 필드가 `"`로 시작 → quoted 세대(2005·2007·2008·2009)

⚠️ **따옴표 인식 CSV 파서 필수 — `split(",")` 금지.** 필드 안에 콤마가 있는 값이 실재한다:
- 호수 `"1,2층1호"`·`"1,2,3,4,5,6층호"` — **2021년만 17,013행**(실측). 단순 split이면 컬럼이 통째로 밀려 고시가격 자리에 면적이 들어간다.
- 특수지 라벨 `"가,확정예정지번"`·`"구,확정예정지번(부번이세분화된경우)"` — 분류코드표(2018) 규격값.

⚠️ **2016년분은 헤더 말미에 빈 컬럼 3개**가 붙어 18칸이다(실측). 컬럼 인덱스는 **정규화 이름 기준 맵**으로 잡고 빈 이름은 무시한다.

인코딩은 EUC-KR이 원칙이나 **UTF-8 BOM·UTF-8 본문 가능성을 배제하지 않는다** — 선두 8KB로 판별한 뒤 `iconv-lite`(**devDependency** — 빌드 스크립트 전용. 런타임 라우트는 내장 `zlib`만 사용)로 스트리밍 디코딩한다. cp949로 UTF-8을 읽으면 예외 없이 조용히 깨진다.

### S2b — XLSX 파싱 (2024·2025·2026)

⚠️ **설치본 `xlsx@0.18.5`는 streaming *read* 를 지원하지 않는다** — 실측 `XLSX.stream` = `{to_json, to_html, to_csv, set_readable}`로 **출력 전용**이다. `XLSX.readFile`로 161MB(시트 XML 합 ≈1.47GB)를 통째 파싱하면 OOM 위험이 크다.

→ **zip을 직접 열어 SAX 스캔**한다:
```
xl/sharedStrings.xml   (6.2MB — 건물명·동 등 문자열이 여기 있음) → 인덱스 배열로 선(先)적재
xl/worksheets/sheetN.xml (시트당 ≈294MB)  → <row> 단위 스트리밍 파싱
```
2026 기준 5시트 × 50만행(dimension `A1:O500001`×4 + `A1:O490452` 실측). 시트 경계를 넘어 행이 이어지므로 **시트 순서대로 연결**한다. 순서는 파일명 숫자가 아니라 `workbook.xml`의 `<sheet>` 선언 순서 + `workbook.xml.rels`로 확정한다.

**xlsx 세대 고유 함정 (실측)**
- **전 셀이 `t="s"`(공유문자열)** — 숫자도 마찬가지다. 2024 `uniqueCount` 425,745. 숫자 셀만 처리하는 파서는 전량을 놓친다.
- **고시일자가 `20240101`**(하이픈 없음)이다. CSV 세대의 `2020-01-01`과 함께 ISO로 통일해야 한다.
- **빈 셀은 `<c>` 자체가 생략**된다. 등장 순서로 채우면 빈 셀 뒤 컬럼이 밀리므로 **셀 참조(`r="H2"`)의 열 문자로 위치를 정한다**.
- 각 시트 헤더 행이 반복되므로 시트마다 첫 행을 건너뛴다.

### S3 — 정규화

| 대상 | 규칙 |
|---|---|
| 컬럼명 | 단위 접미사 제거 — `고시가격(원)`→`고시가격`, `전용면적(m2)`·`전유면적(㎡)`→`전용면적`, `공용면적`→`공유면적`, `상가종류코드`→`건물구분` |
| **SOFT HYPHEN(U+00AD)** | `-`로 치환. 2018년분 건물명·동에 실재한다(실측 `신부파스칼텔(431­5)`, 동 값이 `­` 단독). **눈에 보이지 않아** 연도 간 물건 키 매칭을 조용히 깨뜨린다. 치환 후 구분자만 남는 필드는 빈 값 처리(2017 공백 ↔ 2018 `­` 통일) |
| 건물구분 | 라벨→코드 (`상가`→`1` `오피스텔`→`2` `복합건물`→`3`) |
| 특수지 | 라벨→코드 (`일반지번`→`0` `산`→`1` `가,확정예정지번`→`2` … `해당없음`→`A`) — **`A`가 실재하므로 문자열 유지** |
| 층구분 | 라벨→코드 (`지하층`→`1` `지상층`→`4` `옥탑층`→`5`) |
| 번지·호 | `parseInt(v, 10)` — zero-pad·공백 제거 |
| **호수(`상가건물호주소`)** | `/^(\d{1,2})월\s*(\d{1,2})일$/` → `$1-$2` (Excel 날짜 복원 — Phase 1 전량 실측 **13,790행 = 0.052%**, 2019·2020·2021·2023에만 존재) |
| 면적 | `parseFloat` — 2자리·3자리 소수 혼재 허용 |
| 고시가격 | `parseInt` (원/㎡ 정수) |

### S4 — 중복 배포본 해소

⚠️ **파일 mtime을 기준으로 삼지 않는다** — mtime은 다운로드 시각이라 재다운로드 시 순서가 역전된다(실측: 두 2022 배포본이 9초 차로 우연히 정순). 오채택하면 지번 정정 104건이 유입되지 않아 **PNU 조인이 깨진다**.

채택 규칙:
1. **파일명의 기준일 표기** 우선 (`2022년2월28일 기준` > `2022년1월1일 기준`)
2. 없으면 **zip 내부 엔트리 타임스탬프** (2022 실측: `2022-01-18` vs `2022-05-04`)
3. 채택·폐기 내역을 manifest에 기록

### S5 — 시군구 파티션 분할·gzip · 중복 행 처리 ⚠️ 키만으로 제거 금지

파티션은 `{시군구5}/{고시일자}.json.gz`, 내부는 결정적 정렬(법정동→특수지→본번→부번→물건키→페이로드)이라 재빌드 diff가 0이다.

**완전 동일 행(키 + 가격·면적)만 제거**하고, 키는 같은데 페이로드가 다른 행은 **둘 다 보존**한다.

실측(2017년): 키 중복 1,378행 중 **870행만 완전 동일**이고 **508개 키는 면적이 다르다**.
```
건원베스트원(1126010100 105-4) 지상 1층 102호 · 가격 5,726,000 동일
  → 전용 14.35㎡ / 공유 6.11㎡     …그리고    전용 40.59㎡ / 공유 17.26㎡
```
면적은 `호별총액 = floor(단가 × (전용+공유))`의 **직접 곱수**라 임의로 하나를 버리면 세액이 틀린다.

→ 보존한 뒤 `conflictingKeyCount`로 남긴다. **Phase 2 파생 불변식**: 한 고시일자 안에서 물건 키가 중복이면 그 키는 **모호**하므로 3시점 자동 매칭에서 제외하고 사용자가 시점별로 직접 고르게 한다(임의 선택 금지 — `feedback_no_silent_apportion_fallback`).

### S6 — manifest 스키마

```jsonc
{
  "generatedAt": "2026-07-28T...",
  "totalRows": 26458783,
  "notices": [
    { "date": "2021-01-01", "rows": 1565934, "storedRows": 1565934,
      "sigunguCount": 116, "sigungus": ["11110", "11140", "…"], "coverage": "full",
      "adopted": ["상업용건물_오피스텔 기준시가(2021년1월1일 기준).zip"],
      "repairs": { "hoRestored": 0 }, "skippedRows": 0,
      "unjoinableParcelRows": 645, "duplicateKeyRows": 0 },
    { "date": "2022-01-01", "rows": 1871970, "sigunguCount": 116, "coverage": "full",
      "adopted": ["오피스텔 상업용건물 기준시가(2022년2월28일 기준).zip"],
      "superseded": ["상업용건물_오피스텔 기준시가(2022년1월1일 기준).zip"], /* 지번 정정 104건 반영본 채택 */ },
    { "date": "2020-01-01", "rows": 1443701, "sigunguCount": 116, "coverage": "full",
      "adopted": ["상업용건물_오피스텔 기준시가(2020년1월1일기준_2-1(재추출).csv",
                  "상업용건물_오피스텔 기준시가(2020년1월1일기준).zip"] }
      /* 후자는 확장자만 .zip이고 실체는 CSV(2-2 파트) — S1 매직바이트 판별 필수 */
  ]
}
```

- `rows`는 **파싱 성공 행수**, `storedRows`는 완전중복 제거 후 **실제 저장 행수**다. 원본 대조는 `rows` 기준이다.
- `skippedRows`는 파싱 불가 행 수다. **xlsx 세대는 시트마다 헤더 행이 반복**되므로 시트 수−1 만큼(2024~2026은 4) 정상적으로 잡힌다 — 이 값이 그보다 크면 실제 결손 신호다.
- `duplicateKeyRows`는 키·가격·면적까지 **전부 동일**한 행이다(제거 대상). `conflictingKeyCount`는 **키는 같은데 가격·면적이 다른 키**의 수이며 **행은 전부 보존**한다 — §S5 참조.

`coverage: "partial"`이 API의 `partial_data` 사유를 구동한다 — **부분 결손을 "고시 없음"으로 안내하지 않기 위한 유일한 근거**다.

## 3. 조회 계층

### 3-1. `lib/stdprice/load-partition.ts`

```ts
export interface StdPriceUnit {
  b: string;      // 법정동코드 10
  s: string;      // 특수지코드 — "0"=일반, "1"=산, "2"~"9", "A"(해당없음, 188행 실재) ★ number 불가
  bn: number;     // 번지(본번) — parseInt 정규화
  jn: number;     // 호(부번)   — parseInt 정규화
  nm: string;     // 건물명 ★ 키 필수 (§3-2 불변식 2)
  dg: string;     // 동
  fc: 1 | 4 | 5;  // 층구분 (지하/지상/옥탑) ★ 키 필수 (§3-2 불변식 2)
  fl: string;     // 층
  ho: string;     // 호수
  p: number;      // 고시가격 원/㎡
  ea: number;     // 전용면적
  sa: number;     // 공유면적
  k: 1 | 2 | 3;   // 건물구분 (상가/오피스텔/복합)
}

export async function loadPartition(
  sigungu: string, noticeDate: string,
): Promise<StdPriceUnit[] | null>;   // null = 파티션 파일 부재

export async function loadManifest(): Promise<StdPriceManifest | null>;
```

계획서 §4-4의 반환 타입 표기도 `StdPriceUnit[]`으로 통일한다.

**캐시**: 파티션 LRU 8개 + **manifest는 프로세스 메모리 캐시 + mtime 기반 무효화**(매 요청 디스크 읽기 방지, 개발 중 재빌드 반영).

구현체가 하나뿐이므로 interface + class 2단 구성을 만들지 않는다(Simplicity First). **원격 전환 시 이 파일 1개만 교체**한다.

### 3-2. `app/api/address/commercial-standard-price/route.ts`

```ts
export const runtime = "nodejs";   // fs·zlib — 형제 라우트 building-standard-price-etax/route.ts:9 선례
```

**요청**
```
GET ?pnu={19자리}&dates={ISO,ISO,...}       dates 최대 3개
```

**응답**
```ts
{
  success: boolean;              // "조회를 수행했는가" — 결과 존재 여부가 아님 (불변식 5)
  parcelReason?: "invalid_pnu" | "unjoinable_parcel";   // PNU 단위 사유
  dateStatus: Record<string /*noticeDate*/,
    "ok" | "unit_not_found" | "partial_data" | "partition_missing" | "no_notice">;
  units: Array<{
    key: string;      // 위치 연결 시 `${dg}|${fc}|${fl}|${ho}`, 아니면 `${nm}|${dg}|${fc}|${fl}|${ho}`
    buildingName: string; dong: string;
    floorClass: "지하" | "지상" | "옥탑"; floor: string; ho: string;
    kind: "상가" | "오피스텔" | "복합건물";
    prices: Record<string /*noticeDate*/, { price: number; ea: number; sa: number } | null>;
    ambiguous?: boolean;                        // 한 시점 안에서 물건 키 중복 → 시점 간 연결 안 함
    linkedBy?: "position";                      // 건물명이 시점마다 달라 위치로 연결 — UI 노출 필수
    buildingNameByDate?: Record<string, string>; // linkedBy 시 시점별 원문 건물명
  }>;
  availableDates: string[];      // manifest coverage:"full" 인 고시일자
  error?: string;
}
```

⚠️ 형제 라우트(`building-standard-price-etax/route.ts:17-24`)는 `warnings?: string[]`(문자열 배열)이고 `success: results.length > 0`(L58)이다. 본 라우트는 **의도적으로 다르게** 간다 — 3시점 각각의 상태를 구분해야 하므로 `warnings: string[]`로는 표현할 수 없고, "결과 없음"이 정상 동작(§4)이므로 `success`를 결과 존재와 묶으면 미고시가 실패로 보인다. **HTTP 200 · 비차단**은 형제와 동일하다.

**불변식 (강제)**
1. **strict-match-or-null** — 법정동·특수지·본번·부번 4개가 **전부** 일치하는 행만 반환. 부분 일치·임의 fallback **금지**. 선례: `app/api/address/standard-price/route.ts:183-185` (*"임의 세대로 fallback하지 않고 조회 실패(null) 반환"*). 정책: memory `feedback_apart_stdprice_dong_ho_required`.
2. **물건 키 = 건물명 + 동 + 층구분 + 층 + 호.** 실측 충돌 —
   - 층구분 제외 시 5,772건(0.370%). 적선현대빌딩 1층 1호가 지상 639.47㎡/5,898,000원 · 지하 7.18㎡/2,485,000원 (**단가 2.4배**)
   - 건물명 제외 시 3,517건(0.225%). 스마트빌A동 3,065,000원/61.15㎡ · B동 3,063,000원/62.08㎡ — **동이 둘 다 `1(단일)`이라 동으로 구분 불가**

   **2-1. 시점 간 연결은 위치 유일성을 검증한 뒤 위치로도 한다 (Phase 2 확장).**
   원본이 최근 연도로 갈수록 건물명 자리에 지번 표기를 넣어(적선현대빌딩 → `(80)`) 건물명 키로는
   시점이 이어지지 않는다. 실측(종로·강남·강서 910필지 106,764물건, 2021↔2026):

   | 연결 경로 | 비율 |
   |---|---|
   | 건물명 포함 키로 연결 | 79.1% |
   | **건물명만 다르고 위치(동·층구분·층·호)가 양쪽에서 유일** | **18.5%** |
   | 연결 불가 | 2.4% |

   → 위치 키가 **관련 시점 전부에서 유일할 때만** 위치로 연결한다. 유일성을 *검증*하므로
   스마트빌A동/B동처럼 위치가 겹치는 필지는 이 조건에서 자동 탈락해 건물명 키를 유지한다 —
   충돌 위험이 가정이 아니라 구조적으로 배제된다. 연결에 쓴 근거가 위치이고 이름이 다르면
   `linkedBy:"position"` + `buildingNameByDate`로 **반드시 노출**한다(조용한 병합 금지).
3. **`platGbCd` 사용 금지** — `decomposePnuForBuildingRegister`의 `platGbCd`는 건축HUB 규약 전용이며 CSV 특수지코드와 **우연히 값이 일치**해 더 위험하다. raw `pnu[10]`를 직접 읽는다 (memory `feedback_gov_site_lookup_weak_tls_pnu_params` 항목2).
   ```
   PNU[10] "1"(일반) ↔ CSV 특수지 "0"(일반지번)
   PNU[10] "2"(산)   ↔ CSV 특수지 "1"(산)
   그 외 CSV 특수지("2"~"9","A") → 조인 불가 → parcelReason="unjoinable_parcel"
   ```
4. **`no_notice` ≠ `partial_data` ≠ `unit_not_found`** — 각각 미고시(정상)·자료 미확보·해당 호 없음. 병합 안내 금지.
5. **전 경로 HTTP 200.** 형식 오류도 `{success:false, error}`로 200 반환 — 형제 라우트가 검증 실패·게이트 포함 전 경로를 200으로 처리한다(`:36-53`).

**판정 순서 (의사코드)**
```
if (!/^\d{19}$/.test(pnu))            → success:false, parcelReason:"invalid_pnu"
if (pnu[10] ∉ {"1","2"})              → success:true, parcelReason:"unjoinable_parcel", units:[]
for each requested date:
  if (manifest에 date 없음)                    → dateStatus="no_notice"
  else if (시군구 ∉ notice.sigungus)           → dateStatus="no_notice"   ★ 지역 미고시
  else if (coverage === "partial")             → dateStatus="partial_data"   (조회는 계속 시도)
  else if (loadPartition() === null)           → dateStatus="partition_missing"
  else if (strict match 0건)                   → dateStatus="unit_not_found"
  else                                         → dateStatus="ok"
```

⚠️ **`notice.sigungus` 분기 필수 — 고시 대상 지역이 해마다 다르다.** 실측:
`2005~2022`는 **특별시·광역시 + 세종 + 경기(41)** 뿐이고(시도 prefix `11·26·27·28·29·30·31·36·41`), **2023년부터 전국**으로 확대됐다(시군구 116 → 235 → 241).
이 분기가 없으면 강원·충청·전라·경상 소재 상가의 과거 시점이 전부 `partition_missing`("변환 결손 — 시스템 문제")으로 안내된다. **실제로는 그 해 그 지역에 고시 자체가 없었던 것**(정상)이며, 바로 이 상황이 §164⑥(고시 전 취득) 환산 규정이 존재하는 이유다.

**목록 정렬**: 층구분(지하→지상→옥탑) → 층(숫자 파싱, 비숫자는 뒤) → 호(숫자 파싱, 비숫자는 뒤).
`fl`·`ho`가 `string`이므로 사전순 정렬 시 `"10" < "2"` 함정이 있다.
**전량 반환 + 클라이언트 필터**(최대 5,371행 × 3시점) — 서버 페이징 없음.

**rate limit 미적용** — 실측상 `checkRateLimit`은 `app/api/calc/*` 10곳과 `app/api/law/_helpers.ts:24`에만 적용되고 `app/api/address/*` 8개 라우트는 전부 미적용이다. 본 라우트는 address 계열이며 외부 호출 없이 로컬 디스크만 읽으므로 규약을 따른다. (명시적 결정으로 기록)

**에러 로깅**: `console.error("[commercial-stdprice]", err)` — address 라우트는 Sentry 미사용, 태그 문자열 패턴만 쓴다(`standard-price/route.ts:341`·`search/route.ts:131`).

### 3-3. `pickNoticeDate(availableDates, refDate)`

```ts
/** 기준일 이하 고시일자 중 최대. 없으면 null. */
export function pickNoticeDate(availableDates: string[], refDate: string): string | null;
```

**기존 헬퍼와의 관계 (dual-truth 회피)** — `lib/hooks/useStandardPriceLookup.ts`에 유사 헬퍼가 이미 있다:

| 헬퍼 | 방식 | 대상 |
|---|---|---|
| `getDefaultPriceYear(dateStr, propertyType)` (`:35`) | **달력 cutoff** — `land`/`land_farmland` `0531`, 그 외 `0429` | Vworld 공시가격 (고시일이 데이터에 없음) |
| **`pickNoticeDate`** (신규) | **manifest 실데이터** — 존재하는 고시일자 목록에서 선택 | 상가 기준시가 (고시일자가 데이터에 있음) |

상가 기준시가는 고시일자가 데이터에 실재하므로 달력 추정이 불필요하다 — **신규 헬퍼가 정확하다**. 두 헬퍼는 대상이 달라 dual-truth가 아니며, 이 구분을 코드 주석에도 남긴다.
`isNoticeAfterReference(noticeDate, refDate)` (`:48`)는 **재사용**해 과대선택 경고를 제공한다.

**법령 근거 (KoreanLaw MCP 원문 검증)**
> 소득세법 시행령 §164③ — "법 제99조제1항제1호가목부터 라목까지의 규정을 적용함에 있어서 **새로운 기준시가가 고시되기 전에 취득 또는 양도하는 경우에는 직전의 기준시가에 의한다.**"

"고시" 시점 = **시행일 = 1월 1일**임을 국세청 고시문으로 확정: 「2025년 오피스텔 및 상업용 건물에 대한 기준시가 고시」 **국세청고시 제2024-39호, 2024.12.31. 제정, [시행 2025.1.1.]**. 공포는 전년 12월 31일이나 시행일이 1/1이므로 §164③ 경계가 기준일과 일치한다.

⚠️ **`getDefaultPriceYear`·`recommendLandPriceYear` 재사용 금지** — 둘 다 개별공시지가·주택공시가격의 **시행 6/1·4/30**을 전제한 cutoff다. 기준시가는 시행 1/1이라 보정이 없어야 한다.

## 4. 알려진 갭

| 갭 | 영향 | 대응 |
|---|---|---|
| **3시점 부분 매칭이 다수** | 매칭률 — 2년 93.9% / 8년 66.1% / 16년 53.6% (계획서 §4-2 실측표) | 시점별 독립 처리. `prices[date]=null`이면 **필드 미충전 + "해당 고시분 없음" 표시**. 인접 호 자동 대체 **금지**(`feedback_no_silent_apportion_fallback`) |
| **건물명 결손이 최근 연도일수록 심하다** | 건물명 자리에 지번 표기가 들어온 행 비율 — 2021 **0.879%**(`27-0` 꼴) / 2024 **9.7%** / 2025 **14.6%**(`(80)`·`(466-9)` 꼴). 표기 형식도 연도 간 다르다(실측, 2024·2025는 sheet1 표본 15~17만행 기준) | **매칭**: §3-2 불변식 2-1의 위치 유일성 연결로 대부분 회복(2021↔2026 79.1% → 97.6%). 회복 불가분은 시점별 수기 선택. **표시**: 대표 이름은 실제 이름이 있는 표기를 우선하되 시점별 원문을 함께 노출한다. **지번 표기를 건물명으로 "복원"하지 않는다**(법 근거 없는 추정) |
| `cbLandArea`(대지면적) CSV에 없음 | 조회 후에도 validate 차단(`transfer-tax-validate-asset.ts:148-149`) | 모달에 "대지면적은 등기부에서 직접 입력" 안내 |
| 상속 §164⑥ 8필드 all-or-nothing | 모달이 3필드만 채워 `filled=3` → 차단(`:110-127`) | 모달에 잔여 5필드 안내. **validate 무변경** — 현행 코드가 그렇게 동작한다는 사실만 확정이며, 법령상 all-or-nothing이 요구되는지는 **KoreanLaw 미검증(확인 필요)** |
| 특수지 2~9·A 필지 0.222% (58,641행 — Phase 1 전량 실측) | PNU 조인 불가 | `parcelReason="unjoinable_parcel"` 반환, 수기 입력 |
| 고시 대상 비전수 | 미고시 물건 다수 | 수기 입력 경로 **제거 금지** |

## 5. anchor

**Phase 1 완료 — 전건 GREEN (2026-07-28)**

| ID | 대상 | 검증 | 결과 |
|---|---|---|---|
| A-16 | 2022 zero-pad 정규화 | 번지 `0080`→80, 호 `0000`→0 후 PNU 조인 성공 | ✅ 단위 테스트 |
| A-15 | 중복 배포본 후행 우선 | 서초포레지움이 번지 611(2/28본)로 저장, 270-10(1/1본) 미존재 | ✅ 산출물 실측 — 104건 전부 `611-0`, `270-10` 0건 |
| A-14 | 호 날짜 복원 | 원본 `03월 02일` → 저장값 `3-2` | ✅ 단위 테스트 + 파이프라인 13,790행 복원 |
| A-04 | 층구분 키 분리 | 적선현대빌딩 1층 1호가 지상/지하 별개 키 | ✅ 단위 테스트 |
| A-05 | 건물명 키 분리 | 스마트빌A동/B동이 별개 키 | ✅ 단위 테스트 |
| A-17 | xlsx OOM 없음 | 2024~2026 5시트 변환 완료 | ✅ 2,289,626 / 2,406,504 / 2,490,451행 |

**변환 결과 대조 (Phase 1 verify)**

| 항목 | 기준 | 실측 | 판정 |
|---|---|---|---|
| 총 행수 | 계획서 §3-1 실측 26,458,783 | **26,458,783** | ✅ 일치 |
| 연도별 행수 | 원본 `wc -l` − 헤더 (2005·2013·2019) | 407,673 / 823,334 / 1,215,915 | ✅ 3/3 일치 |
| 무작위 표본 원본 대조 | 4세대 × 5건 = 20건 전 필드 | **20/20 일치** | ✅ |
| 2022 지번 정정 | 104건이 후행본 값 | 104건 `611-0` | ✅ |
| 파싱 실패(skip) | xlsx 시트 반복 헤더 4건 외 0 | 2024·2025·2026 각 4, 나머지 0 | ✅ |

**Phase 2 완료 — 라우트 anchor 22 케이스 GREEN (2026-07-28)**

`__tests__/api/commercial-standard-price.route.test.ts` — 픽스처는 실제 산출물과 같은 형식(gzip JSON + manifest).

| ID | 검증 | 결과 |
|---|---|---|
| A-01 | 3시점 병합 — 동일 물건이 시점별 가격 보유 | ✅ |
| A-04 | 지하/지상 별개 행 + 지하 우선 정렬 | ✅ |
| A-05 | **부정 케이스** — 스마트빌A동/B동은 위치로 연결되지 않는다 | ✅ |
| A-06 | 없는 시점은 `null` — 인접 호 자동 대체 없음 | ✅ |
| A-07 | 필지 없음 → `unit_not_found` + `units:[]` | ✅ |
| A-08·A-09 | `partial_data` / `partition_missing` / `no_notice` 3분기 + **지역 미고시** | ✅ |
| A-11 | 특수지 2~9·A → `unjoinable_parcel` | ✅ |
| A-13 | 형식 오류도 HTTP 200 | ✅ |
| — | 키 충돌 시 `ambiguous` — 시점 간 연결 안 함 | ✅ |
| — | 건물명 드리프트 → `linkedBy:"position"` + 시점별 원문 | ✅ |
| — | `pickNoticeDate` §164③ 직전 고시분 | ✅ |

**실데이터 스모크**(적선동 80, 2013·2021·2026 동시 조회): `dateStatus` 3시점 `ok`,
물건 170건(위치 연결 전 340건), **3시점 전부 충전 60건**, `availableDates` 22종.

**Phase 3 구현 시 작성** — A-02·A-03(배치별 충전 필드) · A-10(런처 disabled) · A-12(면적 상이 경고).

**Phase 0에서 이미 GREEN**: PNU 조인(Vworld 실측 2건) · 층구분 충돌(0.370%) · 건물명 충돌(0.225%) · 키 안정성(2년 93.9% / 8년 66.1% / 16년 53.6%) · §164③ 고시일자 규칙.

**Phase 0 외삽 → Phase 1 전량 실측으로 확정** (외삽은 2021년 1개 고시분 기준이었다):

| 항목 | Phase 0 외삽 | Phase 1 전량 실측 |
|---|---|---|
| 파티션 파일 수 | ≈2,550 | **3,029** (2023년 지역 확대 반영) |
| 파티션 평균·최대 | 98KB · 354KB | **55.3KB · 493.5KB** |
| 파티션 총량 | ≈255MB | **170MB** |
| manifest | — | **64KB** (시군구 목록 포함) |
| PNU 조인 불가 | 31,410행(0.154%) | **58,641행(0.222%)** |
| 호 Excel 날짜 오염 | 12,359행(0.061%) | **13,790행(0.052%)** |

평균이 내려가고 최대가 올라간 것은 2023년 전국 확대로 **소규모 시군구가 대량 편입**됐기 때문이다. 총량이 외삽보다 작은 것은 파티션 내부를 결정적으로 정렬해 gzip 압축률이 오른 영향이다. 최대 493.5KB는 단일 요청 전송량이므로 Phase 2 캐시 설계의 상한으로 쓴다.
