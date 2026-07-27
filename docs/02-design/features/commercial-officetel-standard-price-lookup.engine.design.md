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
scripts/build-commercial-stdprice-helpers.ts   순수 — 세대판별·정규화·호 날짜 복원·중복해소·파티션 분할
scripts/build-commercial-stdprice.ts           I/O — 파일 열거·zip/xlsx 해제·쓰기·manifest
__tests__/scripts/build-commercial-stdprice.test.ts
__tests__/scripts/fixtures/                    4세대 샘플 행 + 2022 중복본 + 호 날짜 오염 행
```

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
- **zip 엔트리명이 cp949**다. 표준 unzip은 `Illegal byte sequence`로 실패한다(실측). **인덱스 기반 추출** 또는 cp949 디코딩으로 처리한다.
- 진짜 해제 실패는 **skip + 기록 후 계속**(전체 중단 금지). 단 skip 전에 위 매직바이트 판별을 반드시 거친다.

### S2a — CSV 파싱 · 형식 세대 판별

```ts
type Generation = "quoted-code" | "plain-code" | "plain-label" | "padded-label";
```

판별 순서:
1. 첫 데이터 행의 구분 값이 `/^[123]$/` → 코드계, 아니면 라벨계
   - ⚠️ **헤더명으로 판별 금지** — 2019는 헤더가 `상가종류코드`인데 값은 코드다. **값 sniffing 필수**.
2. `번지` 값이 `/^0\d{3}$/` → zero-pad 세대(2022)
3. 헤더 첫 필드가 `"`로 시작 → quoted 세대(2005~2018)

인코딩 EUC-KR → `iconv-lite`(**devDependency** — 빌드 스크립트 전용. 런타임 라우트는 내장 `zlib`만 사용).

### S2b — XLSX 파싱 (2024·2025·2026)

⚠️ **설치본 `xlsx@0.18.5`는 streaming *read* 를 지원하지 않는다** — 실측 `XLSX.stream` = `{to_json, to_html, to_csv, set_readable}`로 **출력 전용**이다. `XLSX.readFile`로 161MB(시트 XML 합 ≈1.47GB)를 통째 파싱하면 OOM 위험이 크다.

→ **zip을 직접 열어 SAX 스캔**한다:
```
xl/sharedStrings.xml   (6.2MB — 건물명·동 등 문자열이 여기 있음) → 인덱스 배열로 선(先)적재
xl/worksheets/sheetN.xml (시트당 ≈294MB)  → <row> 단위 스트리밍 파싱
```
2026 기준 5시트 × 50만행(dimension `A1:O500001`×4 + `A1:O490452` 실측). 시트 경계를 넘어 행이 이어지므로 **시트 순서대로 연결**한다.

### S3 — 정규화

| 대상 | 규칙 |
|---|---|
| 컬럼명 | 단위 접미사 제거 — `고시가격(원)`→`고시가격`, `전용면적(m2)`→`전용면적`, `전유면적`→`전용면적`, `공용면적`→`공유면적` |
| 건물구분 | 라벨→코드 (`상가`→`1` `오피스텔`→`2` `복합건물`→`3`) |
| 특수지 | 라벨→코드 (`일반지번`→`0` `산`→`1` `가,확정예정지번`→`2` … `해당없음`→`A`) — **`A`가 실재하므로 문자열 유지** |
| 층구분 | 라벨→코드 (`지하층`→`1` `지상층`→`4` `옥탑층`→`5`) |
| 번지·호 | `parseInt(v, 10)` — zero-pad·공백 제거 |
| **호수(`상가건물호주소`)** | `/^(\d{1,2})월\s*(\d{1,2})일$/` → `$1-$2` (Excel 날짜 복원, 12,359행 = 0.061%) |
| 면적 | `parseFloat` — 2자리·3자리 소수 혼재 허용 |
| 고시가격 | `parseInt` (원/㎡ 정수) |

### S4 — 중복 배포본 해소

⚠️ **파일 mtime을 기준으로 삼지 않는다** — mtime은 다운로드 시각이라 재다운로드 시 순서가 역전된다(실측: 두 2022 배포본이 9초 차로 우연히 정순). 오채택하면 지번 정정 104건이 유입되지 않아 **PNU 조인이 깨진다**.

채택 규칙:
1. **파일명의 기준일 표기** 우선 (`2022년2월28일 기준` > `2022년1월1일 기준`)
2. 없으면 **zip 내부 엔트리 타임스탬프** (2022 실측: `2022-01-18` vs `2022-05-04`)
3. 채택·폐기 내역을 manifest에 기록

### S6 — manifest 스키마

```jsonc
{
  "generatedAt": "2026-07-27T...",
  "notices": [
    { "date": "2021-01-01", "rows": 1565934, "sigunguCount": 116,
      "coverage": "full", "adopted": "…_01.csv,…_02.csv" },
    { "date": "2022-01-01", "rows": 1871970, "sigunguCount": 116,
      "coverage": "full", "adopted": "…2월28일 기준…", "superseded": ["…1월1일 기준…"], "diffRows": 110 },
    { "date": "2020-01-01", "rows": 1443701, "sigunguCount": 116,
      "coverage": "full", "adopted": "…_2-1(재추출).csv,…(2020년1월1일기준).zip",
      "note": "후자는 확장자만 .zip이고 실체는 CSV(2-2 파트) — S1 매직바이트 판별 필수" }
  ],
  "repairs": { "hoDateRestored": 12359 },
  "unjoinableParcelRows": 31410
}
```

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
    key: string;      // `${nm}|${dg}|${fc}|${fl}|${ho}`  ★ 건물명·층구분 포함 (불변식 2)
    buildingName: string; dong: string;
    floorClass: "지하" | "지상" | "옥탑"; floor: string; ho: string;
    kind: "상가" | "오피스텔" | "복합건물";
    prices: Record<string /*noticeDate*/, { price: number; ea: number; sa: number } | null>;
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
  if (manifest에 date 없음)            → dateStatus="no_notice"
  else if (coverage === "partial")     → dateStatus="partial_data"   (조회는 계속 시도)
  else if (loadPartition() === null)   → dateStatus="partition_missing"
  else if (strict match 0건)           → dateStatus="unit_not_found"
  else                                 → dateStatus="ok"
```

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
| `cbLandArea`(대지면적) CSV에 없음 | 조회 후에도 validate 차단(`transfer-tax-validate-asset.ts:148-149`) | 모달에 "대지면적은 등기부에서 직접 입력" 안내 |
| 상속 §164⑥ 8필드 all-or-nothing | 모달이 3필드만 채워 `filled=3` → 차단(`:110-127`) | 모달에 잔여 5필드 안내. **validate 무변경** — 현행 코드가 그렇게 동작한다는 사실만 확정이며, 법령상 all-or-nothing이 요구되는지는 **KoreanLaw 미검증(확인 필요)** |
| 특수지 2~9·A 필지 0.154% | PNU 조인 불가 | `parcelReason="unjoinable_parcel"` 반환, 수기 입력 |
| 고시 대상 비전수 | 미고시 물건 다수 | 수기 입력 경로 **제거 금지** |

## 5. anchor

**Pre-Do 우선 실행 (파이프라인 정확성 — 단위 테스트로 작성, §2-0 fixtures 사용)**

| ID | 대상 | 검증 |
|---|---|---|
| A-16 | 2022 zero-pad 정규화 | 번지 `0080`→80, 호 `0000`→0 후 PNU `1111010700100800000` 조인 성공 |
| A-15 | 중복 배포본 후행 우선 | 서초포레지움이 번지 611(2/28본)로 저장, 270-10(1/1본) 미존재 |
| A-14 | 호 날짜 복원 | 원본 `03월 02일` → 저장값 `3-2` |
| A-04 | 층구분 키 분리 | 적선현대빌딩 1층 1호 조회 시 2행(지상 639.47㎡ / 지하 7.18㎡) |
| A-05 | 건물명 키 분리 | 1126010200 129-19 2층 201호 조회 시 2행(스마트빌A동 / B동) |
| A-17 | xlsx OOM 없음 | 2026 5시트 변환 완료, 행수 2,490,451 |

**Phase 2·3 구현 시 작성** — A-01·A-02·A-03(3시점 조회 정합) · A-06(부분 매칭) · A-07~A-13(응답 사유 분기·UI). §1에서 ID만 예약한다.

**Phase 0에서 이미 GREEN**: PNU 조인(Vworld 실측 2건) · 특수지 분포(99.846%) · 파티션 크기(평균 98KB·최대 354KB·총 ≈255MB) · 층구분 충돌(0.370%) · 건물명 충돌(0.225%) · 키 안정성(2년 93.9% / 8년 66.1% / 16년 53.6%) · 호 오염(12,359행) · §164③ 고시일자 규칙.
