# 재산세 비주거용 건축물 시가표준액 — 서울 ETAX 자동조회 계획서

> rev.3 (2026-07-24). 대상 세목: **재산세(property)**. 대상 물건유형: **건축물(비주거용)**.
> 참고 자료: `wang2185/siga-lookup`(Flask, **라이선스 없음** → 코드 복사 불가, 조회 방식만 참고 재구현).
>
> **rev.2**: P0 Pre-Do 검증 3건 실측(SSL·매핑·법령).
> **rev.3**: plan-design-self-review-loop 자가검토(3-way fork) 반영 — High 3건 해소
> [① `tsj_gubun`은 raw pnu[10] 도출·`parts.platGbCd` 금지(§4 함정), ② `StandardPriceInput` 확장 대신 전용 컴포넌트
> 채택 근거 명시(§5.2), ③ 소방분 이중 base §146④ 확정(§9-④)] + Medium/Low 다수(파서 순수 lib 분리·9셀 계라벨·
> 본번부번 strip·연도 헬퍼 금지·mirror 가드·picker 컬럼·오채움 방지·이력 fallback).

---

## 0. 목표 / 범위

재산세 마법사에서 물건유형이 **건축물(비주거용)** 일 때, 현재 사용자가 시가표준액(`publishedPrice`)을
**순수 수동 입력**하는 필드에 **서울시 ETAX 주택외건물 시가표준액 자동조회** 버튼을 붙인다.

- **In scope (Phase 1)**: 서울 25개 자치구 소재 비주거용 건축물. 소재지(주소)로 조회 → 시가표준액 자동 채움.
- **Out of scope**: 주택 건축물 부분(§146④ 소방분 — ETAX 원문에서 제외 확정, §1 참조), 서울 외 지역(위택스 전국 — §12 후속).

### 용어 정정
사용자 요청의 "건물 기준시가"는 재산세 문맥에서 **시가표준액**(지방세법 §4)이 정확한 표현이다.
"기준시가"는 국세(양도·상속·증여)의 국세청 고시 개념이므로 본 계획서·UI는 **시가표준액**으로 표기한다.

---

## 1. 조회 대상 확정 — 주택 제외, 비주거용만 (ETAX 원문 실측)

서울 ETAX `BldnStndAmtLstAction` 페이지 원문 안내문(HTTP 200, EUC-KR 디코딩 실측):

> **"주택 부분(면적)을 제외한 건축물의 시가표준액입니다."**
> 페이지 제목: **"주택외건물시가 표준액조회"**

→ 이 엔드포인트는 **주택을 명시적으로 제외**한다. 따라서:

| 물건유형 / 필드 | ETAX 조회 | 결론 |
|---|---|---|
| 건축물(비주거용) 시가표준액 | ✅ 반환 | **본 계획 대상** |
| 주택 건축물 부분 시가표준액(§146④) | ❌ 제외 명시 | 조회 불가 → 현행 수동입력 유지 |

---

## 2. Pre-Do Anchor (실측 완료)

실제 POST 조회로 응답 구조·값을 확보(디자인 환류 근거). `pre-do-anchor-verification` 정책 충족.

**요청**: `POST https://etax.seoul.go.kr/BldnStndAmtLstAction.tran`
(Referer=`.view`, `Content-Type: application/x-www-form-urlencoded`)
파라미터(실측 성공 세트): `sysCode=EAX`, `PRE_SIGU_CD=680`, `SIGU_CD=680`, `HDONG_CD=10100`,
`HDONG680=10100`, `BDONG_CD=99999`, `tsj_gubun=1`, `bonbun=737`, `bubun=`, `GWAPO_YEAR=2025`, `downExcel=N`

**응답**(EUC-KR HTML, table[1] 결과):

| 번호 | 년도 | 번지 | 동 | 호수 | 물건명 | 시가표준액(계) | 연면적 |
|---|---|---|---|---|---|---|---|
| 1 | 2025 | 0737-0000 | 0000 | 00000 | 강남구 역삼동 737 | **225,037,140,965 원** | 212,615.29㎡ |
| | | | | | 건축물 | 223,958,545,915 원 | |
| | | | | | 시설 | 1,078,595,050 원 | |

**Anchor**: 강남구 역삼동 737 / 2025년 → 계 225,037,140,965원 (건축물 223,958,545,915 + 시설 1,078,595,050).

### Anchor에서 도출된 재구현 필수 포인트
1. 하위 구성 라벨이 **`건축물`/`시설`** 이다(참고 repo 파서는 `건물`/`토지`만 찾아 이 케이스를 **누락** —
   "건축물"에 "건물"이 부분문자열로 없음). → 파서는 **모든 하위 라벨을 포괄**하도록 신규 작성.
2. 계(총액)에 **시설이 포함**된다. 재산세 건축물 과세표준이 계인지 건축물만인지는 **법령 검증 항목**(§9-①).

---

## 3. 현행 구현 공백 (file:line 실측)

경로: `components/calc/property/` (Step0~3, shared.ts). 아래 인용은 워크트리
`feat+property-std-market-value` 기준.

- 물건유형 라디오: `Step0.tsx:88-99`. 옵션 `["building","건축물 (비주거용)"]` = `shared.ts:55`.
- 시가표준액 입력 분기: `Step0.tsx:112-141`
  - 주택·토지·선박·항공기 → `StandardPriceInput ... enableLookup={true}` (`Step0.tsx:130`, 조회 버튼 有)
  - **건축물 → 순수 `CurrencyInput`** (`Step0.tsx:134-139`, 조회 버튼 無) — 분기 조건
    `form.objectType !== "building"` (`Step0.tsx:118`). **← 이 공백을 메움.**
- 시가표준액 저장 필드: `publishedPrice: string` (`shared.ts:126`, 전 물건유형 공유).
- 소재지: `AddressSearch` 이미 존재(`Step0.tsx:101-110`). 저장 필드 `jibun/road/building/dong/ho`
  (`shared.ts:118-124`). **PNU는 onChange에서 의도적 제외**(`Step0.tsx:108`) → 저장 안 됨.
- 변환: `buildPropertyTaxRequestBody` (`shared.ts:381`) `publishedPrice` 공통 전송.
- 검증: `validateStep` (`shared.ts:248-252`) `publishedPrice` 필수.
- Zod: `lib/validators/property-input.ts:25-28` `publishedPrice`. 엔진: `property.types.ts:78` `publishedPrice`.

---

## 4. 핵심 설계 — PNU → ETAX 파라미터 무변환 도출 (anchor 검증)

기존 `decomposePnuForBuildingRegister(pnu)` (`lib/geo/pnu-building-register.ts:25-36`)가 분해하는 값이
**그대로 ETAX 파라미터**가 된다. 별도 자치구/법정동 코드표(참고 repo의 하드코딩)·ETAX VIEW 파싱 불필요.

| ETAX 파라미터 | PNU 도출 규칙 | 역삼동 737 anchor |
|---|---|---|
| `SIGU_CD` / `PRE_SIGU_CD` (자치구 3자리) | `parts.sigunguCd.slice(2,5)` (서울 "11" 접두 제거) | 11680 → **680** ✓ |
| `HDONG_CD` (법정동 5자리) | `parts.bjdongCd` (그대로) | 1168010100 → **10100** ✓ |
| `tsj_gubun` (특수지: 1=일반,2=산,0=특수) | **raw `pnu[10] === "2" ? "2" : "1"`** ⚠ `parts.platGbCd` 금지 | pnu[10]="1" → **1** ✓ |
| `bonbun` | `String(parseInt(parts.bun,10))` (선행 0 제거) | "0737" → **"737"** ✓ |
| `bubun` | `parseInt(parts.ji,10)===0 ? "" : String(parseInt(parts.ji,10))` (0000→**빈값**) | "0000" → **""** ✓ |
| `HDONG{SIGU_CD}` | `parts.bjdongCd` (`HDONG_CD`와 동일) | HDONG680=10100 ✓ |
| `BDONG_CD` | 고정 상수 | "99999" |

즉 **표준 법정동코드 = "11" + SIGU(3) + HDONG(5)**. 이름표·VIEW 파싱 불요, PNU에서 직접 도출.

> 🔴 **tsj_gubun 규약 함정 (rev.3, 자가검토 High)**: `decomposePnuForBuildingRegister`의 `parts.platGbCd`는
> **건축HUB 규약**("0"=대지/"1"=산, `pnu-building-register.ts:32`)이라 ETAX `tsj_gubun` 규약(일반="1"/산="2"/
> 특수="0", `building_seoul.py ETAX_TSJ`)과 **불일치**. `parts.platGbCd`를 그대로 쓰면 대지(pnu[10]="1") →
> "0"(특수번지) **silent 오조회**(성공 probe는 "1"). → 반드시 **raw `pnu[10]`** 에서 직접 도출.
> `parts`는 SIGU/HDONG/bun/ji 도출에만 사용, `platGbCd`는 미사용.

**✅ 교차검증 완료 (rev.2, P0-실측)**: 4개 자치구 / 22개 dong에서 `표준 법정동코드[5:10] == ETAX HDONG` 전건 성립.
- 강남(680): 역삼 10100(라이브 조회 anchor)·삼성 10500·대치 10600·논현 10800 — 4/4
- 종로(110): 가회 14600·견지 12900 …, 마포(440): 공덕 10200·노고산 11000 …, 송파(710): 가락 10700·문정 10800 …
- SIGU도 전건 일치: 강남 11680→680·종로 11110→110·마포 11440→440·송파 11710→710.
- 근거: etax VIEW 페이지 `HDONG{sigu}` select 옵션 추출 + 표준 법정동코드 대조. `lib/geo/pnu-sigungu.ts`가 역삼동 `1168010100` 확정.

---

## 5. 아키텍처 (기존 조회 인프라 패턴 준수)

프로젝트 표준: **Next.js Route Handler 서버 프록시 + 클라이언트 조회 필드**
(외부 CORS·EUC-KR·SSL은 서버에서 처리). 템플릿: `app/api/address/building-register/route.ts`.

### 5.1 Route Handler (신규)
`app/api/address/building-standard-price-etax/route.ts`
- 입력: `?pnu=<19자리>&year=<YYYY>` (+ optional `dong`,`hosu` — 집합건물 비주거 호별)
- **서울 게이트**: `pnu`가 `"11"`로 시작하지 않으면 즉시 `{ warnings:["서울 소재 건축물만 ETAX 조회가 가능합니다."] }` (비차단, HTTP 200).
- PNU 분해(`decomposePnuForBuildingRegister`) → §4 도출규칙으로 폼 데이터 구성.
  ⚠ `tsj_gubun`은 raw `pnu[10]`에서(§4 함정 박스), 본번/부번은 `parseInt` strip 후 전송.
- 외부 fetch: `POST BldnStndAmtLstAction.tran`, `cache:"no-store"`, UA/Referer 헤더.
  **⚠ 기본 `fetch()` 사용 금지** — ETAX 약한 DH키에서 `ERR_SSL_DH_KEY_TOO_SMALL` 실패(§10-A 실측).
  **스코프된 undici Agent 필수**(전역 `setGlobalDispatcher` 금지):
  ```ts
  import { Agent, fetch as undiciFetch } from "undici";
  const etaxAgent = new Agent({ connect: { ciphers: "DEFAULT@SECLEVEL=1" } }); // 모듈 상수 재사용
  const res = await undiciFetch(TRAN, { method:"POST", headers, body, dispatcher: etaxAgent });
  ```
  인증서 검증(`rejectUnauthorized`)은 유지 — DH/cipher 강도만 완화. P0에서 이 정확한 방식으로 anchor 반환 실증.
- **EUC-KR 디코딩**: 응답 `ArrayBuffer` → `iconv-lite`(`^0.7.2` 기존 의존성) `decode(buf,"euc-kr")`.
  (Node `TextDecoder('euc-kr')`도 가용하나 iconv-lite로 통일.)
- **fetch/decode/parse를 순수 함수 `lib/geo/etax-building-std.ts`로 분리 (rev.3, 자가검토)** — route가 호출.
  anchor(225,037,140,965) **유닛테스트 가능** + §12 위택스(전국) 재사용 여지. route는 얇은 orchestrator.
- **파서 (신규, 고정 인덱스 금지 — rev.3)**: table[1] 헤더행 스킵. **데이터 메인행은 헤더 8칼럼과 달리 9셀**
  — 물건명 뒤에 `계` 라벨 셀이 삽입됨(anchor: `…,'강남구 역삼동 737','계','225,037,140,965 원','212,615.29(m²)'`).
  → 금액칸을 **고정 idx7로 잡지 말고** `계` 라벨 다음 셀(또는 숫자패턴 셀)로 특정. 연면적은 `(m²)` 제거.
  후속 2셀 하위행(`건축물`/`시설`/기타 라벨 → 금액) 수집. **시설 라벨 부재 시 `facility=null`, `total=building`**.
  다중 메인행(집합건물 호별)은 각각 파싱. 참고 repo 파서 **미차용**(`건물`/`토지` substring이라 `건축물`/`시설` 누락).
- 반환 정규화: `{ results: [{ address, total, building, facility, area, dong, ho, year }], warnings: [] }`.
  `total` = ETAX "계"(§9-①). `building`/`facility`는 UI 보조표시용.
- **연도 기본값 (rev.3)**: 재산세 과세 대상연도(당해년도, 기준일 6/1) 단순 도출. `land-price-year.ts`
  헬퍼는 **개별공시지가 5/31 게이트라 부적합 — 재사용 금지**(시가표준액은 1/1 고시 체계).
- env 키 불요(ETAX는 무인증). 단 외부 사이트 장애·구조 변경은 `warnings[]` 비차단 처리(500 금지).

### 5.2 조회 필드 컴포넌트

> **신규 vs 확장 결정 (rev.3, 자가검토 High — Fork C #1)**: `StandardPriceInput`은 이미
> `propertyKind:"building_non_residential"`를 지원(`StandardPriceInput.tsx:25,98-100`)하나, 조회는
> `toPropertyType`(`:69-71`)이 `"land"`로 매핑→`useStandardPriceLookup`을 통해 **Vworld 공시지가 route로 고정**.
> etax를 쓰려면 (a) 이 공유 컴포넌트에 `lookupSource:"etax"` 분기+`forceTotalMode` 추가, 또는 (b) `LandPriceLookupField`
> 선례처럼 **전용 컴포넌트 신규**. → **(b) 전용 컴포넌트 채택**. 근거: etax는 총액(계) 반환이라 area-mode(단가×면적)
> 불사용(`forceTotalMode` 필요), 서울 전용, pnu 파라미터, `useStandardPriceLookup`(Vworld 결합) 훅과 무관 →
> 공유 컴포넌트(다세목 사용)에 서울-etax 니치 결합 시 회귀 위험. `LandPriceLookupField`가 이미 별도 컴포넌트인
> 선례와 정합. (대안 (a)는 위택스까지 통합할 때 재평가.)

`components/calc/property/BuildingStdPriceEtaxLookupField.tsx` (신규)
- 패턴: `LandPriceLookupField`(값 채움형, `components/calc/inputs/LandPriceLookupField.tsx`) 동형. `CurrencyInput` 재사용
  (select-on-focus·Enter 이동 등 전역 규칙 자동 상속).
- 구성: 연도 Select + `CurrencyInput`(publishedPrice, **총액 직접**) + `variant="modalLauncher"` 조회 버튼
  (`button.tsx:23-24`) + local state `isLookingUp`/`lookupError`.
- **출처 추적 (rev.3)**: `StandardPriceInput`의 `PriceSource`(`"lookup"|"manual"|"lookup-edited"`, `:18`)와
  **동일 명명** 채택 — 조회채움="lookup", 사용자 수정="lookup-edited". 단 재산세 `FormState`는 현재 price source를
  저장하지 않으므로(실측) 배지는 컴포넌트 local state로만 표시(이력 persist는 범위 밖).
- **mirror-pattern 가드 (rev.3, 정책)**: 조회 결과 → `publishedPrice` set은 **버튼 콜백(`handleLookup`)에서 직접**
  `onPublishedPriceChange(...)` 호출로만. **`useEffect`로 `form.pnu`→`publishedPrice` 동기화 금지**(무한루프·미러링 위반).
  `LandPriceLookupField:96-127`가 이 방식(콜백 직접 set) 준수 — 동형.
- 활성 조건: `canLookup = !!pnu && pnu.startsWith("11")`. 비서울/무PNU → 버튼 disabled + **인라인 hint**:
  무PNU="주소 선택 후 조회", 비서울="서울 소재 건축물만 ETAX 조회 가능"(`lookupError` 스타일 `:197-199` 동형).
- 조회 버튼에 `data-testid="etax-stdprice-lookup"` 1개 지정(렌더/게이트 테스트·P3 E2E 셀렉터용).
- **단일 결과** → `onPublishedPriceChange(total)` 자동 채움 = ETAX "계"(건축물+시설), 근거 §9-①(확정).
  건축물/시설 내역은 보조 표시(투명성).
- **다중 결과**(집합건물 비주거 호별 등) → `variant="modalLauncher"` + `Dialog` 선택 모달
  (`BuildingStdPriceModalButton.tsx` 패턴). **picker 표시 컬럼**: 번호·물건명·호수·연면적·시가표준액(계).
  선택 시 `onPublishedPriceChange(계)`.
  ⚠ **오채움 방지**: 결과가 다행이면 반드시 picker 강제(자동 채움 금지).
  📌 **Do-환류 (rev.3 구현)**: Phase 1은 `dong/ho`를 etax 조회 파라미터로 **전달하지 않는다** — property 폼의
  `form.dong`/`form.ho`("201동"·"3204")는 공동주택 표시형식이라 etax 숫자 dong/hosu 코드("0000"·"00000")와
  **형식 불일치** → 전달 시 과필터로 0행 위험. 대신 전체 결과를 받아 picker로 disambiguate. (lib/route는 dong/hosu
  파라미터를 계속 수용 — 향후 코드 정규화 매핑 시 재연결 여지.)

### 5.3 Step0 배선
- 건축물 분기(`Step0.tsx:134-139`)의 `CurrencyInput` → `BuildingStdPriceEtaxLookupField`로 교체.
  props: `pnu={form.pnu}`, `publishedPrice`+`onPublishedPriceChange`. (dong/ho 미전달 — 위 Do-환류.)
- `AddressSearch onChange`(`Step0.tsx:108`)에 `pnu: v.pnu ?? ""` 추가.
- **round-trip 일관성 (rev.3, Fork B #4)**: `AddressSearch value` 재구성(`Step0.tsx:107`)에도 `pnu: form.pnu`
  포함 — 컨트롤드 value에서 pnu 유실 방지(기능 무해하나 일관성). `AddressValue.pnu`는 optional(`address-search.tsx:29`).

---

## 6. ETAX 프로토콜 스펙 (실측 동결)

- URL: `https://etax.seoul.go.kr/BldnStndAmtLstAction.tran` (POST, form-urlencoded)
- 응답: **EUC-KR** HTML. table[0]=입력폼, **table[1]=결과**.
- 결과 헤더: **8칼럼** `번호 | 년도 | 번지 | 동 | 호수 | 물건명 | 시가표준액 | 연면적`
- ⚠ **데이터 메인행은 9셀 (rev.3, Fork B #2)** — 물건명 뒤에 `계` 라벨 셀이 삽입됨:
  anchor `['1','2025','0737-0000','0000','00000','강남구 역삼동 737','계','225,037,140,965 원','212,615.29(m²)']`.
  → 금액칸을 **고정 idx7로 잡지 말 것**. `계` 라벨 다음 셀(또는 숫자패턴 셀)로 특정. 연면적=마지막 셀, `(m²)` 제거.
- 하위행(2셀): `[라벨, 금액]` — 라벨 `건축물`·`시설` 등. **모든 라벨 수집**. 시설 부재 시 facility=null.
- 0행/자료없음: table[1] 데이터행 0개 → `results:[]`(C3, 수동 폴백).
- 연도 옵션: 2012~2026(참고 repo `get_years`). 기본값: 재산세 과세 대상연도(당해년도). land-price-year 헬퍼 금지(§5.1).
- SSL: **Node 기본 fetch 실패(DH), undici SECLEVEL=1 dispatcher 필수 — P0 실증 완료(§10-A)**.

---

## 7. 동기화 지점 / Definition of Done

`publishedPrice`는 **기존 필드**라 엔진·API·Zod·validate 경로를 **재사용**(변경 0). 신규 조회는
**클라이언트 국소 추가**만 필요 → DoD 표면이 작다.

| # | 지점 | 변경 |
|---|---|---|
| ① FormState | `shared.ts:117-194` | `pnu: string` 필드 추가 |
| ② INITIAL_FORM | `shared.ts:196-242` | `pnu: ""` |
| ③ Step0 주소 onChange | `Step0.tsx:108` | `pnu` 매핑 추가 |
| ④ Step0 건축물 분기 | `Step0.tsx:134-139` | `CurrencyInput`→`BuildingStdPriceEtaxLookupField` |
| ⑤ 신규 컴포넌트 | `components/calc/property/BuildingStdPriceEtaxLookupField.tsx` | 신규 |
| ⑥ 신규 Route + 순수 파서 lib | `app/api/address/building-standard-price-etax/route.ts` + `lib/geo/etax-building-std.ts` | 신규 |
| ⑦ publishedPrice 경로 | 변환/validate/Zod/엔진 | **변경 없음**(재사용) |

- `pnu`는 **UI 전용(엔진·API·이력 미전송)** → Zod·엔진·변환(`buildPropertyTaxRequestBody` `shared.ts:384` pnu 미포함)·
  validate **무관**. 선례: `dong`/`ho`가 "UI 전용, 엔진 미전송"(`shared.ts:121-124`) — pnu 동일 처리(3중 패턴 N/A).
- **⑦ publishedPrice = 재산세 건축물분 + 소방분 이중 base (rev.3, Fork B #1)**: `property-tax-surtax.ts:76`에서
  비주거용 소방분 base도 `publishedPrice` → 채운 "계"가 양쪽을 동일 구동(§9-④ 근거). 별도 필드 불요.
- **이력복원 fallback (rev.3, Fork A #5)**: property `FormState`는 전용 persist store·migration 없음. 구 레코드엔
  `pnu` 부재 → `undefined` → 버튼 disabled(주소 재검색 유도, 수용 가능). ② INITIAL_FORM `pnu:""`로 신규 세션 안전.
- 회귀: **순수 파서 lib 유닛 테스트**(anchor 225,037,140,965 / 건축물 223,958,545,915 / 9셀·계라벨 / 0행 / 시설부재),
  route 서울게이트·tsj_gubun 도출 테스트, 컴포넌트 렌더/disabled 테스트.
- **브라우저 수동 확인**(Playwright E2E): 건축물 선택 → 소재지 검색 → 조회 → publishedPrice 채움 → 계산. Network 탭 확인.

---

## 8. 케이스 매트릭스

| # | 소재지 | 결과 | 처리 |
|---|---|---|---|
| C1 | 서울 비주거 단일건물 | 1행 | 계 자동 채움 (건축물/시설 내역 보조표시) |
| C2 | 서울 비주거 집합건물(호별) | N행 | dong/ho로 좁힘 → 단일화, **다행이면 picker 강제(자동채움 금지)** |
| C3 | 서울 주소지만 ETAX 무자료 | 0행 | `warnings` "조회 자료 없음. 직접 입력" 안내, 수동 유지 |
| C4 | 비서울 PNU | — | 버튼 disabled + "서울만 조회 가능"(§12 후속: 위택스) |
| C5 | PNU 없음(주소 미선택/미해석) | — | 버튼 disabled + hint |
| C6 | ETAX 장애·구조 변경 | 파싱 실패 | `warnings` 비차단, 수동 입력 폴백 |
| C7 | 시설 없는 건물 | 1행, 시설 하위행 부재 | facility=null, total=building. 정상 채움 (rev.3, Fork A #3) |

---

## 9. 법령·정확성 검증 항목 (추정 금지)

- **① 계 vs 건축물 vs 시설 — ✅ 확정 (rev.2, KoreanLaw 실측)**: 자동채움 대상 = ETAX **"계"(건축물+시설)**.
  근거: 지방세법 **§104-2**("건축물"=§6④의 건축물) → **§6④**(건축물 = 「건축법」 건축물 **+ 레저·저장·
  도크·접안·도관·급배수·에너지공급 등 시설(딸린 시설 포함)**). 즉 재산세 건축물 과세표준의 시가표준액은
  정의상 시설을 포함 → "계"가 정확. (§104-3: 재산세 주택은 토지·건축물 범위에서 제외 → ETAX 주택제외와 정합.)
  UI는 계를 채우되 건축물/시설 내역을 함께 표시. 시설이 별도 과세되는 특수 물건은 사용자 수동 조정 여지.
- **② 과세기준일 연도**: 조회 기본연도 = 재산세 과세 대상연도(당해년도). ETAX `GWAPO_YEAR`와 정합. (경미, §5.1)
- **③ PNU→HDONG 매핑 전면 성립 — ✅ 확정 (rev.2, §4 참조)**: 4자치구/22dong 교차검증 완료.
- **④ 소방분(§146④) 이중 base — ✅ 확정 (rev.3, KoreanLaw + 실측)**: §146④ → 소방분 건축물 = **§104-2 건축물**,
  과세표준 = **§110 시가표준액**. 즉 §104-2→§6④로 시설 포함, **재산세 건축물분과 소방분이 동일 `publishedPrice`**
  (엔진 실측 `property-tax-surtax.ts:76`). "계" 채움이 양쪽을 일관 구동, 과대계상 없음. (§146④ 단서 "주택 건축물 부분"은
  §4② 준용 별도 산정 → etax 제외 주택과 정합.)

---

## 10. 리스크

- **A. Node 런타임 SSL — ✅ 확정+우회 실증 (rev.2, P0-실측)**:
  Node v24.14.1 / OpenSSL 3.5.5(SECLEVEL=2 기본)에서 실측 결과:
  - 전역 `fetch()` 기본 → ❌ **`ERR_SSL_DH_KEY_TOO_SMALL`** (`node:https` 기본도 `EPROTO`)
  - `undici.Agent({ connect: { ciphers: "DEFAULT@SECLEVEL=1" } })` dispatcher → ✅ **HTTP 200 + anchor 반환**
  → 우회책 확정(§5.1). 프로젝트 첫 런타임 커스텀 TLS 사례이므로 **스코프 최소화**(etax 조회 dispatcher에만
  SECLEVEL=1, 전역 미적용, 인증서 검증 유지). 보안 노트: 읽기 전용 공개 정부 조회 + DH강도만 완화라 수용 가능.
- **B. HTML 구조 변경**: ETAX 개편 시 파서 파손 → `warnings` 비차단 + 수동 폴백으로 UX 보호.
- **C. Rate limit / ToS**: 정부 사이트 스크래핑 — 서버측 조회, `cache:"no-store"`, 사용자 명시 클릭당 1회.
  남용 방지 위해 기존 rate-limit 정책 준수. 증거 PDF 생성(참고 repo 기능)은 **미포함**(범위 밖).
- **D. 다중결과 UX**: 집합건물 비주거 호별 다행 → picker 필요. Phase 1 dong/ho 우선.

---

## 11. 단계별 실행 (Phase)

```
P0 Pre-Do 검증 (최우선) — ✅ 3건 모두 완료 (rev.2)
   ✅ Node 런타임 ETAX 연결/SSL 실측(리스크 A)  → 기본 fetch 실패(DH), undici SECLEVEL=1 200 실증(§10-A)
   ✅ PNU→HDONG 매핑 4자치구 교차검증(§9-③)      → bjdongCd == HDONG 22dong 전건 일치(§4)
   ✅ §9-① 계/건축물/시설 법령 확정              → "계"(§104-2→§6④) 자동채움 대상 확정
P1 순수 파서 lib(`lib/geo/etax-building-std.ts`) + Route Handler(undici SECLEVEL=1) + 유닛테스트
   (anchor 225,037,140,965 / 건축물 223,958,545,915 / 9셀 계라벨 / 시설부재 / 0행 / tsj_gubun raw pnu[10])
   → verify: npx vitest run (파싱·서울게이트·tsj_gubun 도출)
P2 BuildingStdPriceEtaxLookupField 컴포넌트 + 배선(DoD ①~⑥, mirror 가드·picker·disabled hint)
   → verify: tsc 0건, 렌더/게이트 테스트
P3 브라우저 수동 확인(건축물→소재지→조회→채움→계산)  → verify: Network 탭 응답·publishedPrice 반영
```

---

## 12. 범위 밖 / 후속

- **위택스(WeTax) 전국 비주거 건축물 조회**: 서울 외 지역. 참고 repo `building_nonseoul.py`(전국 위택스,
  복잡도 높음). Phase 2 후속. 본 조회 필드에 비서울 시 위택스 분기 확장 가능하도록 컴포넌트 인터페이스 여지.
- **주택 건축물 부분 시가표준액**: ETAX 조회 불가(§1) — 현행 수동입력 유지.
- **증거 PDF 캡처**: 참고 repo 기능이나 본 계획 범위 밖.
- **취득세 등 타 세목 재사용**: Route/컴포넌트가 범용이므로 후속 확장 가능(현재는 재산세 전용 배선).
```
