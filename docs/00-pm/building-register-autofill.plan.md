# 건축물대장 자동조회 → 건물 기준시가 폼 자동채움 — 계획서

> 목적: 국토부 건축HUB(공공데이터포털 `BldRgstHubService`) 건축물대장 API로
> 건물 기준시가 입력 폼(`BuildingStdPriceForm`)의 **구조·용도·연면적·신축연도·층수**를 자동채움.
> 사용자가 소재지를 입력하면 "건축물대장 조회" 1회 클릭으로 5개 필드를 한 번에 채운다.
>
> 작성일: 2026-06-24 · 상태: **Plan** (Design·Do 미착수)
> 매핑 상세(중복 복붙 금지 — 링크): [`docs/02-design/features/building-register-usage-mapping.draft.md`](../02-design/features/building-register-usage-mapping.draft.md) (§Y 실 API 검증·§Z 완성 매핑표·§X 별표1 KoreanLaw 검증)
> 관련 정책: `feedback_no_silent_apportion_fallback`(자동 안분 아님—외부 권위 prefill) · `feedback_useeffect_store_mirror_forbidden`(onClick 핸들러 내 set) · `feedback_select_on_focus` · `feedback_decimal_input` · `pre-do-anchor-verification` · `history-lookup-modal`(배지 제거 §3 차용·모달 4-레이어는 부적합)

---

## 1. 목표·배경(편익)

### 1.1 목표

건물 기준시가 계산은 사용자가 **구조키·용도번호·연면적·신축연도·층수**를 손으로 입력해야 한다. 이 중 5개는 건축물대장에 **공적으로 등재된 사실**이다. 건축물대장 API로 자동채움하면:

- **입력 부담·오류 감소**: 용도번호(60항목)·구조키(25키)는 사용자가 정확히 고르기 어려움 → 대장 권위 값으로 prefill.
- **기존 인프라 재사용**: 소재지 입력(`AddressSearch`)이 이미 모달에 prefill됨 + `MOLIT_RTMS_API_KEY`(data.go.kr 동일 인증키)가 건축HUB 활용신청 승인 후 그대로 커버.
- **5개 진입점 동시 수혜**: `GeneralBuildingBlock`·`CommercialBuildingBlock`(양도) + `EstateBodySupplementaryValuation`(상증) + 독립 페이지 — 전부 `BuildingStdPriceModalButton`이 `initialAddress`(`AddressValue`)를 모달에 전달하므로 폼 1곳 수정으로 전 진입점 적용.

### 1.2 배경(검증 완료)

타당성·매핑은 2026-06에 검증 완료(미구현). 실 API 표본 4건(강남파이낸스센터·은마아파트·롯데월드타워·코엑스)으로 `getBrTitleInfo` 응답 필드·구조코드·`mainPurpsCd` 패턴·정밀도 상한을 실측했고, 건축법 시행령 별표1 「용도별 건축물의 종류」 전문을 KoreanLaw로 대조해 §A default 매핑을 확정했다. → draft §Y·§Z·§X.

---

## 2. 범위·비범위

### 2.1 범위 (MVP)

- **신규 API 프록시 라우트** `app/api/address/building-register/route.ts`: PNU → 건축HUB 파라미터 분해 + `getBrTitleInfo`(표제부) 호출 + 매핑 적용 → 정규화 응답 1개 반환.
- **순수 매핑 모듈** `lib/tax-engine/data/building-standard-price/building-register-map.ts`: `strctCd(+etcStrct) → {structureKey, confidence}`(★Pre-Do: `STRCT_CD_TO_KEY` 9코드 대표 primary + `etcStrct` 자유텍스트 fine refine — strctCdNm은 coarse라 명칭 25키 커버 불가), `mainPurpsCd(+grndFlrCnt/totArea) → {usageNo, confidence}`(confidence `high|medium` 2-등급).
- **PNU 분해 헬퍼 신규**: `sigunguCd/bjdongCd/platGbCd/bun/ji` 도출(`pnu-sigungu.ts`는 sigungu만 → bjdong/bun/ji/platGbCd 분해는 신규, 라우트 내부 또는 인접 모듈).
- **폼 상태에 `pnu: string` 1필드 추가** + `AddressSearch onChange`에서 `pnu` 보존(현재 버려짐 — `BuildingStdPriceForm.tsx:315-323` `pnu` 미매핑 확인). 자동채움 API 파라미터 도출 소스.
- **UI 인라인 조회 버튼** (소재지 카드 내): `LandPriceLookupField` 동형(로컬 `isLookingUp`/`lookupError` + fetch + `setF` 다필드 patch). 신뢰도 배지(high/medium) + 매핑 불가 시 안내.
- **자동채움 대상**(전부 **기존 폼 필드**): 양도 = 양도시점 `transStructureKey`·`transUsageNo`(취득시점 미채움 — §4.5), 상증 = `valStructureKey`·`valUsageNo` + 공통 `floorArea`·`builtYear`·`floorsAbove`/`floorsBelow`(전부 `DecimalInput`·`String()` 주입).

### 2.2 비범위 (MVP 제외 — 후속 분리)

- **★ 엔진 input/result 신규 필드 0건 → CLAUDE.md "14 동기화 지점"의 ④⑥⑦⑨~⑭ 전부 비관여.** 자동채움 대상 필드는 `BuildingStdPriceFormState`에 **이미 전부 존재**(코드 확인: `building-std-price-form.ts:114-119,133-137,148-151`). 자동채움은 `setF`로 기존 필드에 값을 쓸 뿐이라 Zod enum·body spread·Route Date 매핑 등은 비관여. 실제 변경은 **표시용 `pnu` 1필드(①②) + AddressSearch onChange(③) + 조회 버튼(⑤) + 신규 프록시 라우트 1개**뿐(§6).
- **복합구조(`compositeMode`) 자동 구성 비범위**: 층별개요(`getBrFlrOulnInfo`)로 층별 용도를 `compositeParts`에 자동 매핑하려면 층별 면적 안분 + 조정률 추정이 필요하나 **조정률(특성 IV~VII)은 대장에 없는 정보**(사용자 입력) → 자동 구성 시 부정확/빈 부분 양산. 표제부 `mainPurpsCd`는 항상 대분류("000")만 줌. → **MVP는 `compositeMode === false`(단일 폼)에서만 자동채움 발동**, 복합구조 토글 ON 시 버튼 비활성 + "복합구조는 수동 입력" 안내.
- **층별개요 2nd call(`getBrFlrOulnInfo`) 비범위**: 표제부 단독으로 5필드 자동채움이 본질. 근생 세분·복합 prefill은 후속 Phase(별도 계획). 표제부 1-call로 MVP 완결.
- **기계식 주차(`isMechanicalParking`) 비범위**: 특수 산식(#61) — 자동채움 대상 5필드와 매핑 축이 다름. 토글 ON 시 버튼 비활성.
- **공동주택 고시 전 취득 환산(`apartmentConversionMode`) 비범위**: 일반 2시점 구조/용도 흐름을 대체하는 별도 모드(`building-std-price-form.ts:384,533`). 자동채움 대상 `*StructureKey`/`*UsageNo`를 엔진이 미사용 → 토글 ON 시 버튼 전체 비활성 + 수동 안내.
- **과거 스킴(scheme-59 이하, 2017 이하) 비범위**: 매핑표 usageNo는 **scheme-60(2018~2026) 번호 기준**. 자동채움이 쓰는 시점 연도가 2018~2026일 때만 용도 채움(구조는 연도 무관). 그 외 연도는 용도 자동채움 비활성(§7).
- **결과 캐싱 비범위**: 인접 형제 라우트(apt-trade·standard-price)는 `cache:"no-store"` 무캐시 컨벤션 → simplicity상 미적용.
- **rate-limit 비범위(기본)**: address 프록시 계열(apt-trade·standard-price·search·reverse-geocode) 전부 미적용 → 일관성상 미적용. 외부 쿼터(data.go.kr 일일 트래픽) 우려는 라우트 graceful 처리로 흡수(§7 쿼터/에러 행 — resultCode 검증 → 200+warnings, throw 금지). 본격 옵트인 rate-limit는 후속(`building-register:${ip}` 태그).

---

## 3. 현황 (검증된 사실 요약)

### 3.1 폼 상태 — 자동채움 대상 필드 (코드 확인)

구조·용도는 **시점별로 폼 필드가 분리**되어 있다(`structureKey`/`usageNo` 통합 필드는 폼 상태에 없음 — `BuildingPointInput` 타입 내부에만 존재):

| 시점/모드 | 구조 필드 | 용도 필드 | 연도 소스 |
|---|---|---|---|
| 양도 — 취득시점 | `acqStructureKey` | `acqUsageNo` | `acqIndexYear`(≤2000→2001) |
| 양도 — 양도시점 | `transStructureKey` | `transUsageNo` | `parseInt(transferYear)` |
| 상증(평가) | `valStructureKey` | `valUsageNo` | `valuationYear` |

공통(시점 무관): `floorArea`(`:116`)·`builtYear`(`:119`)·`floorsAbove`/`floorsBelow`(`:114-115`). 전부 `string`, `DecimalInput` 위젯. 자동채움은 `String()` 값을 `setF`로 주입.

### 3.2 소재지·PNU (코드 확인)

- 소재지 입력 UI는 이미 존재: `BuildingStdPriceForm.tsx:304-326`의 "소재지 (공시지가 조회용)" 카드 안 `AddressSearch`. road/jibun/building/detail/lng/lat를 폼에 write.
- **그러나 폼이 `pnu`를 보존하지 않음** — `AddressValue.pnu?`는 존재하나(`address-search.tsx:29`) 폼은 `longitude`/`latitude`만 저장, `pnu` 미매핑(`:315-323` 확인, form grep `pnu` 0건). → API 파라미터 도출 소스가 폼에 없음 → **`pnu` 필드 추가 필요**.
- PNU 19자리 구조(검증됨 — `pnu-sigungu.ts:4` 주석 + `standard-price/route.ts:90-104 buildPnu` 역구성으로 확증): `시군구5 + 읍면동3 + 리2 + 산여부1 + 본번4 + 부번4`. `landType`: **`buildPnu:93-95` "1=대지(일반토지), 2=산(임야)"**.

### 3.3 API 패턴 (코드 확인)

- **★템플릿 = `apt-trade/route.ts` 단독**(같은 data.go.kr `MOLIT_RTMS_API_KEY`·게이트웨이·User-Agent·resultCode 패턴): env 미설정 → **HTTP 200 + `{success:false, configMissing:true}`**(`:344-353`, 500 금지). data.go.kr 게이트웨이는 User-Agent 없는 fetch를 차단 → `"User-Agent":"Mozilla/5.0"` 필수. resultCode "00"|"000" 검증도 apt-trade 차용.
- **★`standard-price`는 env-graceful 템플릿 아님**: env 미설정 시 **HTTP 500**(`VWORLD_API_KEY_MISSING`, `:221-226`) 반환 + `VWORLD_API_KEY`(Vworld NED) 사용. → standard-price는 **PNU 분해(`buildPnu`)·`cache:"no-store"` 컨벤션 참조용으로만**, env-graceful·UA·resultCode는 apt-trade에서 차용. '형제 라우트 전부 graceful' 일반화 금지.
- 신규 라우트 위치 `app/api/address/building-register/route.ts` **미존재 확인**(`ls` 결과 apt-trade·regulated-area·reverse-geocode·search·standard-price만).
- `proxy.ts:6 PROTECTED_ROUTES = ["/api/history", "/api/pdf"]` — `/api/address/*` 미보호(비로그인 허용). **proxy.ts 수정 불필요**.

### 3.4 매핑 (draft §Z 완성)

- 구조: **★Pre-Do 정정 — `strctCd`(숫자) 코드 테이블 primary + `etcStrct` 세분 refine**(직전 "명칭 별칭이 25키 커버" 가정 폐기). 대장 `strctCdNm`은 **~9개 coarse 분류**(11벽돌·12블록·13석·21철근콘크리트·22프리캐스트·31일반철골·32경량철골·42철골철근콘크리트·51일반목구조)뿐 — 국세청 25키보다 거칠다(출처: 건설교통부 codil MOCT605, 2002 + 실 API 4코드 일치). → `STRCT_CD_TO_KEY: Record<string, structureKey>`(9코드→대표 국세청 키, 완결 소표) primary + `etcStrct`(자유텍스트) 매칭으로 fine 키 refine. 상세 draft §Z-1.
  - **★구조도 정밀도 상한**(용도와 동형): coarse 코드 → fine 키 **대표값 1개** → 동일 코드 내 fine 구분(연와조 95 vs 시멘트벽돌조 90 · 목조 100 vs 목구조 115)은 `etcStrct` refine만 가능, miss = 대표값 + **confidence medium + "세부구조 확인" 안내**.
  - **★51 일반목구조 → `wood`(목조) — RESOLVED(고시 검증)**: 국세청 「건물 기준시가」 고시(행정규칙 36679) 제7조 구조지수표가 이미지·본문에 목조/목구조 분류 텍스트 규칙 부재(§4 주의사항에도 없음·repo `structure-group-map.ts:4` 전사) → **건물 실제 구조가 기준**. codil 정비요령(51←"목조") + 실 API etcStrct "목조" = `wood`. 코드명 "일반목구조"는 라벨일 뿐. etcStrct 통나무→`solid_wood`·경량/중목구조→`wood_frame` refine. 직전 `wood_frame` 가정 정정. [[feedback_anchor_correction_legal_priority]]
  - **★etcStrct refine 매칭 시 정규식 접미사/괄호 치환 금지**: `STRUCTURE_META` 라벨은 `철골(철골철근)콘크리트조`(괄호)·`연와조`(≠`벽돌`) 등 → 명시 별칭 테이블만, `s.replace(/구조$/,"조")` 류 금지(`wood_frame:"목구조"`/`wood:"목조"` 오매핑·괄호 라벨 miss). 정규화는 공백 제거까지(`enum-verification-before-mapping` 정신).
- 용도: 5자리 §B override → miss 시 앞2자리 §A default(별표1 호, KoreanLaw 검증). 공동주택 "02" = `grndFlrCnt≥5?1:2` derive. 면적의존(목욕장·상점·체육관)은 `totArea` 구간 판정. 교정·군사("23") = 자동채움 제외.
  - **별표1 정의 정정(공동주택 #1/#2)**: 별표1 제2호 연립(나목)·다세대(다목)는 '4개 층 이하' + '1개 동 바닥면적 합계 660㎡'(연립=초과/다세대=이하, 주택용 층수·필로티 제외 산정)로 구분되나, scheme-60에서 **연립·다세대 모두 #2**(`USAGE_LABELS:11` 단독주택군)로 동일 매핑 → **660㎡ 구분은 usageNo 결과 무관**(무해). 단 표제부 `grndFlrCnt`는 건물 전체 지상층수라 필로티(주차 1층) 보정 불가 → 경계(4~5층) 사례는 medium. '별표1 정의 그대로(층수만)' 단정은 부정확 — derive는 결과 무해하나 정의는 660㎡·필로티 단서 포함.
- **PNU 분해 헬퍼 — 신규 작성**: `lib/geo/pnu-sigungu.ts`는 `extractSigunguCodeFromPnu`(sigungu 5자리만, `pnu-sigungu.ts:28`) 1개 export뿐 — `bjdongCd/bun/ji/platGbCd` 분해는 **없음** → §4.3 분해는 신규 헬퍼(또는 라우트 내부 분해, §2.1). `standard-price`의 `getLegalDongCode/buildPnu`는 jibun→PNU **역구성**(Vworld 호출, 방향 반대)이라 본 기능(이미 보유한 19자리 pnu를 분해) 주경로 아님 — PNU 미보유 fallback일 뿐.

---

## 4. 설계 개요

### 4.1 데이터 흐름 (1-call MVP)

```
[UI] 소재지 입력(AddressSearch → f.pnu 보존)
  → "건축물대장 조회" 버튼 클릭 (compositeMode·isMechanicalParking·apartmentConversionMode 전부 OFF + 시점 연도 입력됨)
  → fetch GET /api/address/building-register?pnu=...&year=<해당시점연도>
       [Route]
         · env 가드(configMissing) · pnu 19자리 검증
         · PNU 분해 → sigunguCd/bjdongCd/platGbCd/bun/ji
         · getBrTitleInfo 호출 (_type=json, User-Agent 필수)
         · resultCode "00"|"000" 검증
         · mapStructure(strctCd, strctCdNm) → structureKey|null
         · mapUsage(mainPurpsCd, grndFlrCnt, totArea, year) → {usageNo, confidence}|null
         · builtYear = useAprDay.slice(0,4) · floorArea = totArea · floors = grndFlrCnt/ugrndFlrCnt
       → { structureKey, usageNo, confidence, floorArea, builtYear, floorsAbove, floorsBelow, warnings[] }
  → [UI] setF((prev)=>({ ...prev, <양도시점/상증 필드 + 공통> })) 단일 patch (무확인 덮어쓰기)
       · 양도시점(transStructureKey/transUsageNo)·상증(valStructureKey/valUsageNo)만 set — 취득시점 미채움(§4.5)
       · structureKey/usageNo는 해당 시점 listStructureOptions/listUsageOptions(year)에 존재할 때만 set
       · 공통 floorArea/builtYear/floorsAbove/floorsBelow는 현재 상태값 → set
       · medium confidence 필드에 배지 표시 + 사용자 수정 시 배지 제거 (low 등급 없음)
```

### 4.2 매핑 헬퍼 (순수 함수, 엔진 필드 0)

`lib/tax-engine/data/building-standard-price/building-register-map.ts` (신규):

- `mapStructure(strctCd, etcStrct): { structureKey, confidence } | null` — ① `STRCT_CD_TO_KEY[strctCd]` 9코드 대표 매핑(11→brick·12→cement_block·13→stone·21→rc·22→precast_concrete·31→steel_frame·32→light_steel_frame·42→steel_frame_rc·51→**wood**(목조 잠정·§3.4)) → ② `etcStrct` 자유텍스트가 명시 별칭(`STRCT_ETC_REFINE`)에 매칭되면 fine 키로 refine(시멘트벽돌→cement_brick·통나무→solid_wood·라멘조→ramen 등) confidence high, 대표값만이면 medium. **★별칭은 명시 테이블만 — 접미사/괄호 정규식 치환 금지**(§3.4: `철골(철골철근)콘크리트조` 괄호·`연와조`≠`벽돌`·`wood_frame:"목구조"`vs`wood:"목조"`). strctCd 미수록 = null(미채움). `STRUCTURE_META` import으로 키 검증.
- `mapUsage(mainPurpsCd, grndFlrCnt, totArea, year): { usageNo, confidence } | null` — ① 5자리 `PURPS_DETAIL_TO_USAGE` override → ② 앞2자리 `PURPS_PREFIX_TO_USAGE` default(단일값). "02"=층수 derive(`grndFlrCnt≥5?1:2`). 면적의존=`totArea` 구간. confidence는 **`high|medium` 2-등급**: 세부 직접매핑·대분류 직결·층수 derive = `high` / 대분류 fallback·면적의존 = `medium`. **자동채움 불가 셀 = null(채우지 않음·수동)**: "23"(교정·군사)·정규화 miss·**숙박 등급부재(관광호텔 #3/#4 — 대장에 등급 정보 없음, draft §B-15)**·`PURPS_PREFIX_TO_USAGE`에 prefix 부재(예 "28" 야영장)·`PURPS_PREFIX_TO_USAGE`가 도달 못하는 #40 풍속영업 등. **★low confidence·잠정값 박기 금지**(채울 수 없는 값에 추정 입력은 `feedback_no_silent_apportion_fallback`·납세자 유불리 침묵 오류 — 호텔 #3 140 vs #4 130 지수차). 미대응은 교정·군사와 동일하게 '제외+안내' 단일 처리.
  - **§A prefix default 단일 동결**: 다값 병기 금지. 판매 `07`→**#10 단일**(§Y 실측 07000→#10 일치. 도매 #12·상점 #11·백화점 #9는 §B 5자리 override로만 분기). 숙박 `15`→**#4 단일**(관광호텔 #3은 등급 정보 부재로 자동 도달 불가 → §B override 없음 = #4 default가 곧 미세분 한계, 등급 확실치 않으면 #4 medium 또는 null. 단 "관광호텔" 명시 세부코드가 와도 5성/4성 등급 미확정이면 #3 자동입력 금지). 다값 prefix(13·15·16)는 이미 단일 default 명시 — 07도 동형으로 통일.
- **연도 게이트**: mapUsage 결과는 호출부에서 `listUsageOptions(year)`에 존재하는 번호인지 검증 후 set(미존재 = 미채움 — `BuildingStdPriceForm.tsx:185` 가드와 동형). year ∉ 2018~2026이면 용도 자동채움 비활성.

### 4.3 PNU 분해

`sigunguCd = pnu.slice(0,5)` · `bjdongCd = pnu.slice(5,10)` · `bun = pnu.slice(11,15)` · `ji = pnu.slice(15,19)`. `pnu[10]`은 `landType`(`buildPnu:93-95` "1=대지/2=산", 코드 확정). **platGbCd 변환(★HUB 0/1 방향만 Pre-Do 실측)**: 분기는 '대지냐 산이냐' 2-case뿐 → **명시 분기 `platGbCd = pnu[10] === "2" ? "1" : "0"`**(산술 `Number(pnu[10])-1` 트릭 금지 — 코드값 체계 의존·silent 오매핑 위험). `pnu[10] ∈ {"1","2"}`만 입력됨(`buildPnu`가 그 외 미생성) 전제. HUB `platGbCd`가 정말 "0=대지/1=산"인지는 산/임야 PNU 1건 실 API로 확정(§9.1).

### 4.4 Mediator vs 직접 fetch

`LandPriceLookupField`는 컴포넌트가 직접 `fetch`한다(별도 mediator 없음). 본 기능도 동형 — fetch는 조회 버튼 컴포넌트가, 매핑은 라우트가 수행. 별도 `lib/calc/` mediator는 simplicity상 불필요(라우트가 이미 정규화 응답 반환). 단 응답 → patch 변환이 시점 분기를 가지므로 그 분기 로직만 컴포넌트 핸들러에 둔다.

### 4.5 UI 흐름 — 인라인 버튼(모달 아님)

- **모달 부적합**: 건축물대장은 선택지 1건(해당 건물) → 선택 단계 불필요. `history-lookup-modal` SKILL "적용 금지: 외부 API 데이터" 명시. 모달 4-레이어(mediator/filterCandidates/CalculationRecord)는 이력 도메인 전용.
- **배치**: 소재지 카드(`:294`) 내 `AddressSearch` 직후. `LandPriceLookupField` 버튼(`:166-173`)과 동일 스타일.
- **활성화 가드**: `disabled={!f.pnu || compositeMode || isMechanicalParking || apartmentConversionMode || !시점연도 || isLookingUp}`. 미충족 시 안내 텍스트("소재지 입력 후 조회 가능"·"복합구조/기계식주차/공동주택 환산은 수동 입력"). **★`apartmentConversionMode`(양도 공동주택 고시 전 취득 환산)는 일반 2시점 구조/용도 흐름을 대체하는 세 번째 특수모드**(`building-std-price-form.ts:384,533` — `acqStructureKey`/`transStructureKey`/`*UsageNo`를 엔진이 미사용·`apartmentConversion.*` 별도 필드 사용) → 버튼 전체 비활성(보수적). 이 모드에서도 구조·연면적·연도는 유효할 수 있으나, 자동채움 대상 필드(`*StructureKey`/`*UsageNo`)가 엔진 무시 필드라 부분 채움은 혼란 → 전체 비활성 + 수동 안내가 안전.
- **결과 표시**: 조회 요약("○○구조 · ○○용도 · 연면적 ○○㎡ · ○○년 신축 자동 입력됨") + 신뢰도 배지. 에러는 `text-destructive` 한국어.
- **2-시점(양도) 적용 — 양도시점만 채움(권고 단정)**: 대장은 **현재 상태 1벌**만 주므로 취득시점 자동채움은 증축·용도변경 등 변경 이력을 침묵 반영해 numeric 오류 위험(`feedback_no_unfavorable_application` 인접). → **`transStructureKey`/`transUsageNo`(양도시점)·`valStructureKey`/`valUsageNo`(상증)만 채우고 `acqStructureKey`/`acqUsageNo`(취득시점)는 수동 유지**. 공통 `floorArea`/`builtYear`/`floors`는 현재 상태값이므로 채움. (PM 확인은 이 권고안 승인 형태 — Design 진입 전 종결.)
- **기존 입력값 덮어쓰기 — 무확인 덮어쓰기(정책 단정)**: 자동채움은 사용자가 명시적 버튼 클릭으로 능동 호출하는 액션이고, 형제 `LandPriceLookupField`("공시지가 조회")도 확인 prompt 없이 결과를 덮어쓴다. → **클릭 = 덮어쓰기 동의**로 보고 대상 필드 전체를 무확인 덮어쓰기 + "자동 입력됨" 요약 표시. `feedback_no_silent_apportion_fallback`은 '엔진 빈값 자동 안분' 금지이지 '사용자 명시 액션의 외부 권위 prefill'을 막지 않음(침묵 아님 — 버튼+요약 표시). §4.1 patch 기술(무조건 set)과 일치. ('빈 필드만 채움'·confirm 분기는 비채택 — 형제 컴포넌트 비일관·과복잡.)

---

## 5. 단계별 작업 (Phase별 · 각 verify 기준)

### Phase 0 — Pre-Do anchor (★최우선, Do 진입 전)

- [ ] 실 API **2건**(대지 1건 — draft §Y 표본 은마아파트 등 + **산/임야 PNU 1건**) `getBrTitleInfo` `_type=json` 직접 호출(`MOLIT_RTMS_API_KEY`)로 **(a) platGbCd 변환값**(산 표본으로 HUB "0=대지/1=산" 방향 확정 — 대지 표본만으론 산 경로 미커버), **(b) `_type=json` 응답 envelope 키 경로**(`response.body.items.item` 추정), **(c) User-Agent 차단 여부**, **(d) `strctCdNm` 정확 문자열**(별칭 테이블 동결용 — `목구조`/`목조`·괄호 라벨 충돌 회피) 실측.
  → **verify**: 4개 사실을 응답 raw로 확정. mapUsage/mapStructure anchor에 반영. PNU 분해 단위 anchor에 산 케이스(`platGbCd==="1"`) 포함. (지문 "현행 일치 예상" 금지 — 실측 우선.)

### Phase 1 — 순수 매핑 모듈

- [ ] `building-register-map.ts` 작성: `mapStructure`·`mapUsage` + `STRCT_NAME_TO_KEY`(별칭 1차)·`STRCT_CD_TO_KEY`(숫자 2차)·`PURPS_PREFIX_TO_USAGE`(§A 단일 default)·`PURPS_DETAIL_TO_USAGE`(§B 실측 9). `STRUCTURE_META` import.
  → **verify**: anchor 테스트(draft §Y 4표본) — 강남파이낸스(42→steel_frame_rc·14000→29)·은마(21→rc·02000+14층→1)·롯데월드타워(07000→10 판매 default). `npx vitest run` 통과. **별칭 테이블 HIGH 회귀 anchor**(`일반목구조→wood_frame`≠`wood`·괄호 라벨·`벽돌구조→brick`, §8.1) — 라벨 역인덱스 정규식 금지 검증.

### Phase 2 — PNU 분해 + API 라우트

- [ ] PNU 분해 헬퍼 **신규 작성**(`sigunguCd/bjdongCd/platGbCd/bun/ji` — `pnu-sigungu.ts`는 sigungu만 제공). platGbCd 명시 분기(`pnu[10]==="2"?"1":"0"`). 단위 anchor에 산(`pnu[10]="2"`→platGbCd `"1"`) 케이스.
- [ ] `app/api/address/building-register/route.ts`: **apt-trade 패턴 단독 복제**(env 가드·configMissing·User-Agent·resultCode "00"|"000" — standard-price 아님). PNU 19자리 검증. `getBrTitleInfo` 1-call. 매핑 적용 → 정규화 응답. resultCode 쿼터/에러 → 200+warnings(throw 금지).
  → **verify**: `pnu` 미전달/19자리 아님 → 400 안내. env 미설정 → 200+configMissing. 정상 PNU → 매핑 응답(Phase 0 anchor 건). `npx tsc --noEmit` 0건.

### Phase 3 — 폼 `pnu` 보존 (3지점)

- [ ] ①`BuildingStdPriceFormState`에 `pnu: string`(`:123-129` 소재지 그룹). ②`initialBuildingStdPriceForm`에 `pnu: ""`(`:201-206`). ③`AddressSearch onChange`에 `pnu: v.pnu ?? ""`(`:315-323`) + initialAddress 복원(`:130-138`)에 `pnu` 추가(있으면).
  → **verify**: `tsc` 0건. 소재지 검색 후 `f.pnu` 19자리 보존(E2E·probe).

### Phase 4 — UI 조회 버튼 + 자동채움

- [ ] 소재지 카드 내 인라인 버튼 + 로컬 `isLookingUp`/`lookupError`/`autoFilledFields`. fetch → `setF` 다필드 patch(**양도시점/상증만**, 취득시점 미채움 — §4.5). confidence 배지(high|medium) + 수정 시 배지 제거(`autoFilledFields` Set). 가드(compositeMode·isMechanicalParking·apartmentConversionMode·연도). 자동채움 setF는 기존 `changeYearWithGuard`(`BuildingStdPriceForm.tsx:176-192`) 경로를 거치지 않는 별도 patch — 연도 변경 가드와 독립.
  → **verify**: E2E `building-register-autofill.spec.ts` — 소재지 입력 → 조회 → 5필드 채움 → 계산까지. medium 배지 노출. 복합구조·apartmentConversionMode ON 시 버튼 비활성. **자동채움 후 시점연도 변경 → 옵션 불일치 시 구조/용도가 기존 가드대로 클리어(자동채움이 `:183-185` structOk/usageOk 가드를 우회하지 않음)** 시퀀스 검증.

### Phase 5 — 통합 검증

- [ ] `npm run check:pre-pr`(typecheck + lint + test). 5 진입점 중 1개(예: 상증 `EstateBodySupplementaryValuation`) 브라우저/E2E 수동 확인(Network 탭 request).
  → **verify**: 전체 green. 자동채움 후 기존 onChange(연도 변경 무효화 가드 등) 정상 동작.

---

## 6. 실제 변경 지점 (엔진 input/result 무변경)

**★ 엔진 input/result 신규 필드 0 → CLAUDE.md "14 동기화 지점"의 ④⑥⑦⑨~⑭(API 변환·사이드바·결과 카드·Zod enum·body spread·Route Date 매핑)는 전부 비관여.** 자동채움 5필드는 모두 `BuildingStdPriceFormState`에 이미 존재(코드 확인: `building-std-price-form.ts:114-119,133-137,148-151`)하고, 자동채움은 `setF`로 그 기존 필드에 값을 쓸 뿐이다. 실제로 건드리는 곳은 **표시용 `pnu` 1필드(①②) + 조회 버튼(⑤) + 신규 프록시 라우트 1개**뿐이다.

실제 변경 4지점 + 신규 라우트:

1. **① 폼 상태 타입** — `BuildingStdPriceFormState`에 `pnu: string` 추가(표시/조회용, 엔진 미전달 — `longitude`/`latitude`와 동일 성격).
2. **② initial** — `initialBuildingStdPriceForm`에 `pnu: ""`.
3. **③ AddressSearch onChange + initialAddress 복원** — `BuildingStdPriceForm.tsx:315-324` onChange에 `pnu: v.pnu ?? ""`, `:130-138` initialAddress 복원에 `pnu`(있으면).
4. **⑤ UI 위젯** — 소재지 카드 내 신규 "건축물대장 조회" 버튼 컴포넌트(+ 신뢰도 배지). select-on-focus는 전역 `SelectOnFocusProvider`가 모달 input에 자동 적용(`app/layout.tsx`) → 신규 버튼/배지에 `onFocus` 수동 추가 불요.
5. **신규 API 라우트** — `app/api/address/building-register/route.ts`(프록시 — calc 라우트 아님, Zod 미사용 수동 검증, `proxy.ts` 미보호 확인됨 `:6 PROTECTED_ROUTES=["/api/history","/api/pdf"]`).

**③ normalize·⑧ validation 단정(코드 확인 — '확인필요' 해소)**: `BuildingStdPriceFormState`는 zustand calc-wizard normalize/migration 파이프라인을 **거치지 않는다**(폼은 `BuildingStdPriceForm.tsx:126` `useState` 직접 초기화, normalize 함수 부재). 영속/복원은 별도 `useBuildingStdSnapshotStore`(`lib/stores/building-std-snapshot-store.ts:24-25`)가 raw `FormState`를 sessionStorage에 **normalize·merge 없이** 통째 저장·복원. 구버전 스냅샷에 `pnu`가 없어도 폼이 `{...initialBuildingStdPriceForm, ...(initialForm??{})}` 순으로 spread(`BuildingStdPriceForm.tsx:127-141`)하므로 `pnu:""` 기본이 먼저 깔리고 누락 키를 덮지 않아 **무해**. → ③ normalize = **N/A(파이프라인 부재)**, ⑧ validation = **`pnu` 비검증 확정**(`building-std-price-form.ts:480` validate가 소재지 필드 일절 미검증). 신규 차단 validation 없음. (주의: §6 ③를 'longitude 처리 방식 따름'으로 추정하는 것은 오류 — calc-wizard-migration의 longitude/latitude는 **양도 자산 폼** 마이그레이션이고 본 폼과 무관.)

---

## 7. 엣지케이스·fallback

차단(blocking) 없음 — 자동채움은 편의 기능. 매핑 실패·미대응은 "그 필드만 빈 채로 두고 수동"이지 에러 throw 금지.

| 케이스 | 데이터 | fallback |
|---|---|---|
| 구조 `strctCd` 직매핑 | high | 자동채움, 배지 없음 |
| 용도 대분류 직결(공동주택·업무·운수·종교·의료) | high | 자동채움 |
| 공동주택 #1/#2(`grndFlrCnt`) | high | 자동채움(층수 명시) |
| 면적의존(목욕장 #37~39·상점 #11/#41·체육관 #22/#25) | medium | `totArea` 자동 구간판정 + 배지 "대분류만 확인됨 — 세부용도 직접 확인(목욕장·의원 등 지수 상이)". ★단순 'medium=대체로 맞음' 오해 차단: 목욕장 #37~39(지수 130/115/110) vs 근생 #41(95) 지수차 큼 → 값 변동 가능 명시 |
| 근생 세분(표제부 "000"만 옴) | medium | 대분류 #41 fallback + "세부용도 확인필요(목욕장·의원 등은 값 상이)" 배지 |
| 숙박 등급부재(관광호텔 #3/#4) | 없음 | **자동채움 제외(수동 유지)** — 대장에 등급 정보 없음. 잠정값 박기 금지(#3 지수 140 vs #4 130, 침묵 과소 위험). 교정·군사와 동일 '제외+안내' |
| 미대응(교정·군사 "23"·야영장 "28"·풍속영업 #40 등 prefix 부재) | 없음 | **자동채움 제외**, 해당 필드 수동 유지 + "대장 용도 미대응" 안내 |
| 구조/용도 정규화 miss(별칭 테이블 미수록) | 없음 | **자동채움 제외**, 수동 유지 |
| 연도 ∉ 2018~2026 | (용도) | 용도 자동채움 비활성(scheme-60 외). 구조·연면적·연도·층수는 채움(연도 무관) |
| 시점 옵션셋에 매핑 번호 미존재 | 해당 필드 | 미채움(`listUsageOptions(year)` 검증) |
| 기존 입력값 있음 | — | **무확인 덮어쓰기**(명시적 버튼 클릭 = 동의, `LandPriceLookupField`와 동형) + "자동 입력됨" 요약 표시. confirm 분기 없음(§4.5) |
| 복합구조/기계식주차/공동주택 환산(apartmentConversionMode) ON | — | 버튼 전체 비활성 + 수동 안내 |
| env 미설정 | — | 라우트 200+configMissing → 버튼 비활성/안내(500 금지) |
| HUB resultCode 쿼터/에러 | — | 라우트 200+warnings로 graceful(throw 금지) → 버튼 안내. apt-trade resultCode 검증 패턴 재사용(`route.ts:344` 동형). rate-limit 미적용은 유지 |

---

## 8. 테스트 계획

### 8.1 anchor (vitest — `__tests__/` 또는 매핑 모듈 인접)

draft §Y 실측 4표본을 `toBe()` 상수 anchor (mapStructure는 `(strctCd, etcStrct)→{structureKey,confidence}`):
- 강남파이낸스센터: `mapStructure("42","철골철근콘크리트조").structureKey === "steel_frame_rc"`, `mapUsage("14000",_,_,2023).usageNo === 29`(high).
- 은마아파트: `mapStructure("21","철근콘크리트조").structureKey === "rc"`, `mapUsage("02000", 14, _, 2023).usageNo === 1`(층수 derive high).
- 롯데월드타워/코엑스: `mapUsage("07000",_,_,2023).usageNo === 10`(판매 default — §A `07`=#10 단일 동결, medium).
- 구조 코드 테이블(★Pre-Do 회귀 가드): `mapStructure("21",_).structureKey === "rc"` · `mapStructure("51","목조").structureKey === "wood"`(★잠정·≠wood_frame, §3.4 OPEN) · `mapStructure("42",_).structureKey === "steel_frame_rc"` · `mapStructure("11",_).structureKey === "brick"`(대표·confidence medium) · etcStrct refine `mapStructure("11","시멘트벽돌").structureKey === "cement_brick"`(high) · `mapStructure("51","통나무").structureKey === "solid_wood"` · 미수록 `mapStructure("99",_) === null`.
- §B override: `mapUsage("03025",_,totArea,2023)` 면적 구간 #37/#38/#39.
- 미대응: `mapUsage("23010",...) === null`(교정·군사). 호텔 등급 셀 `mapUsage("15010",...)` 숙박 → 등급부재 = **null(자동채움 제외)** 또는 대분류만 — §7과 일치(잠정값 금지). 연도 게이트: year=2010 → 용도 null/비활성.

### 8.2 E2E (`e2e/building-register-autofill.spec.ts`)

- 소재지 입력(mock `/api/address/building-register` 응답) → "건축물대장 조회" → `structureKey`·`usageNo`·`floorArea`·`builtYear`·`floors` 채워짐 확인 → 계산 완료.
- medium confidence 배지 노출 확인.
- 복합구조·기계식주차·apartmentConversionMode 토글 ON → 버튼 disabled(3개 모드 전부).
- env 미설정(configMissing mock) → 버튼 비활성/안내.
- **자동채움→연도변경 시퀀스**: 양도시점 자동채움 후 양도연도를 옵션셋에 없는 연도로 변경 → 기존 `changeYearWithGuard` 가드(`BuildingStdPriceForm.tsx:183-185`)대로 구조/용도 클리어(자동채움이 가드 우회 안 함). 취득시점 필드는 자동채움 안 됨(수동 유지) 확인.
- 회귀: 기존 `building-std-price` E2E green(baseline 대조 — 자동채움이 기존 흐름 비파괴).

> 정책: 브라우저 확인은 Playwright spec로(`feedback_browser_verify_with_playwright`). 차단 validation 신규 없음 → 전체 세목 E2E 회귀 불요(자동채움은 비차단).

---

## 9. 리스크·오픈 퀘스천

### 9.1 Pre-Do — ★실행 완료(2026-06)

- ✅ **platGbCd 변환**: `pnu[10]==="2"?"1":"0"`. HUB `platGbCd` **0=대지·1=산·2=블록** 권위 확정(행정표준코드/웹). 산 표본은 법정동코드 추정 실패로 미수신이나 코드 의미는 확정 → 분해 헬퍼 단위 anchor `decompose("...2...").platGbCd === "1"`로 표본 무관 검증.
- ✅ **`_type=json` envelope**: `response.body.items.item` — 4표본 실측 확정.
- ✅ **User-Agent**: BldRgstHubService는 **UA 불필요**(기본 UA·빈 UA 모두 NORMAL SERVICE 실측). apt-trade(RTMS)와 달라 UA 강제 아님(라우트에 UA 넣어도 무해).
- ✅ **구조코드 테이블 동결**: ★모델 정정 — 대장 `strctCdNm`은 ~9 coarse(11/12/13/21/22/31/32/42/51) → `STRCT_CD_TO_KEY` 9코드 대표 + `etcStrct` refine(§Z-1·§3.4·§4.2 반영). 출처 codil MOCT605(2002) + 실 API 4코드 일치.
- ✅ **51 일반목구조 → `wood`(목조) — RESOLVED**: 고시(행정규칙 36679) 구조지수표 이미지·목조/목구조 분류 텍스트 규칙 부재 → 건물 실제 구조 기준. codil(51←"목조")+실 API etcStrct "목조" = `wood`. 경량/중목구조는 etcStrct refine→`wood_frame`.
- ⬜ **잔여(비차단·정밀도)**: 현행 행정표준코드 「건축물구조코드」 전체표로 9코드 외 추가(목구조 세분 코드 등) 유무·etcStrct 표기 표본 확장. miss = 대표값/수동.

### 9.2 설계 결정 (Plan에서 단정 — Design 진입 전 종결)

- **양도 2시점 적용 → 양도시점만 채움(단정)**: 대장 = 현재 상태 단일 스냅샷 → 취득시점 자동채움은 변경 이력 침묵 반영 numeric 위험. `acqStructureKey`/`acqUsageNo`는 수동 유지. PM 확인은 권고안 승인 형태(§4.5).
- **기존 입력값 덮어쓰기 → 무확인 덮어쓰기(단정)**: 명시적 버튼 클릭 = 동의, 형제 `LandPriceLookupField`와 동형. confirm·빈 필드만 채움 분기 없음. "자동 입력됨" 요약 표시(§4.5).
- **호텔 등급류(#3/#4) → 자동채움 제외(단정)**: 대장에 등급 정보 없음 → 잠정값 자동입력 금지(#3 140 vs #4 130 과소 위험). confidence는 `high|medium` 2-등급, low 제거. 교정·군사와 동일 '제외+수동'.

### 9.3 외부 의존 리스크

- **활용신청 승인 상태**: `MOLIT_RTMS_API_KEY`가 건축HUB `BldRgstHubService` 커버 — 활용신청 승인 전제. 미승인 시 resultCode 에러 → 라우트가 graceful 처리(버튼 안내). draft §Y는 "승인 후" 실측 완료.
- **§B override 미확정 8행**: 학원·오피스텔·백화점 등 5자리 코드 미확정(draft §Z-2). default가 안전망(근생/업무 인접값) → 비차단, 정밀도만 영향. 행정표준코드 전체표 대조는 후속(기계적).
- **normalize/migration `pnu` 처리 — 무해 확정(코드 확인)**: `BuildingStdPriceFormState`는 zustand normalize/migration 파이프라인 부재(폼 `useState` 직접 초기화). 영속은 `building-std-snapshot-store`가 raw 저장(`:24-25`), 복원 시 `initialBuildingStdPriceForm.pnu:""` 기본 spread가 누락 키를 채움(`BuildingStdPriceForm.tsx:127-141`) → 구버전 스냅샷에 `pnu` 없어도 무해. ('longitude 처리 방식 따름'은 오류 — calc-wizard-migration의 longitude는 양도 자산 폼 전용, 본 폼 무관. §6 참조.)

---

## 10. 참조

- 매핑 상세: [`docs/02-design/features/building-register-usage-mapping.draft.md`](../02-design/features/building-register-usage-mapping.draft.md)
- 폼 상태/변환: `lib/calc/building-std-price-form.ts`
- 폼 UI: `components/calc/building-std-price/BuildingStdPriceForm.tsx`
- 구조/용도 Select: `components/calc/building-std-price/{BuildingStructureSelect,BuildingUsageSelect}.tsx`
- 데이터 함수: `lib/tax-engine/data/building-standard-price/{structure-index,usage-index,structure-group-map}.ts`
- 진입점(initialAddress): `components/calc/building-std-price/BuildingStdPriceModalButton.tsx`
- 템플릿 라우트(env-graceful·UA·resultCode 단일 출처): `app/api/address/apt-trade/route.ts` · PNU 구조 참조(역구성·`cache:no-store` 컨벤션만): `app/api/address/standard-price/route.ts:90`
- PNU 헬퍼: `lib/geo/pnu-sigungu.ts`(sigungu만 — bjdong/bun/ji/platGbCd 분해는 신규 작성 필요)
- 조회 버튼 모방: `components/calc/inputs/LandPriceLookupField.tsx` · FieldCard 슬롯: `components/calc/inputs/FieldCard.tsx`
- 주소 컴포넌트: `components/ui/address-search.tsx`(`AddressValue.pnu?`)
