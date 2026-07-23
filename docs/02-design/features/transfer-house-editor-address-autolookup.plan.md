# 다른 보유 주택 편집 모달 — 소재지 주소검색 + 자동조회 (작업 계획서)

> ✅ **구현 완료(2026-07-24, 3억 fix PR#765 위 후속)**: HouseEntry 주소필드 · `house-region.ts`(`deriveSellingHouseRegion`→`deriveHouseRegionFromCode` rename + `buildHouseAddressPatch`) · 단건④·다건④' regionCode(length(10) 가드) · 모달 max-w-5xl 2열 · AddressSearch(disableUnits 미전달)·지역 자동파생 읽기전용·partial-guard 자동채움·조회값 배지 · 테스트 `house-region-payload.test.ts`(11) + E2E `transfer-house-editor-address.spec.ts`(2).

> 대상: `HouseEntryEditor`("주택 N 정보 입력" 모달) / 진입: Step4 ④ 주택수·중과 판정 → 주택 추가/편집
> 작성 근거: 전 항목 file:line 실측(추정 금지). 미검증 항목은 "확인 필요" 표기.

## 1. 배경·목표

현재 다른 보유 주택 편집 모달은 **소재지 주소 입력 수단이 없고**, 지역 구분을 수도권/지방 2택 라디오로만 받으며, 공시가격·전용면적을 전부 수동입력한다. 사용자 요청 3건:

| # | 요건 | 성격 |
|---|---|---|
| R1 | 모달 화면 폭을 현재보다 2배 넓게 | UI 레이아웃 |
| R2 | Vworld API로 소재지 주소 입력 기능 구현 | UI + 기존 API 재사용 |
| R3 | 소재지 조회 시 공시가격·전용면적 등 조회 가능 항목 자동입력 | UI 배선(신규) |

## 2. 현행 실측 — 재사용 가능 인프라

| 자산(리소스) | 경로 | R2/R3 재사용 |
|---|---|---|
| 주소검색 컴포넌트 `AddressSearch` | `components/ui/address-search.tsx:61-71` | ✅ 그대로 |
| 반환 타입 `AddressValue` (pnu·exclusiveArea·standardPrice 포함) | `address-search.tsx:22-38` | ✅ |
| 주소검색 API | `app/api/address/search/route.ts` | ✅ (컴포넌트 내부) |
| 공시가격·전유면적 API | `app/api/address/standard-price/route.ts` | ✅ (컴포넌트 내부) |
| 대표 자산 onChange 매핑 템플릿 | `asset-sections/AssetSectionBasic.tsx:187-232` | ✅ 복제 |
| 지역기준 파생 헬퍼 | `multi-house-surcharge-count.ts:34` `classifyRegionCriteriaByCode` | ✅ (방금 selling house에 적용) |
| 자동파생 래퍼 | `lib/calc/selling-house-region.ts` `deriveSellingHouseRegion` | ✅ |
| 배지 제거 패턴(참고) | `PriorGiftInput.tsx:91-125` (`sourceCalculationId`) | 참고 |

**핵심 발견 (확인됨)**: `AddressValue`는 동/호 선택 시 `exclusiveArea:number`(전유면적, `address-search.tsx:360`)와 `standardPrice:number`(공시가격, 공동주택 `pblntfPc`/개별주택 `housePc`)를 **이미 반환**한다. 대표 자산(`AssetSectionBasic`)은 이 두 값을 소비하지 않지만, 주택 편집 모달에서 onChange에 소비 배선만 추가하면 **신규 API 없이 R3 충족**.

**HouseEntry 현행 필드** (`calc-wizard-asset-nbl.ts:75-183`):
- 보유: `region:"capital"|"non_capital"`, `officialPrice(string)`, `exclusiveArea?(string)`, `acquisitionDate`, `completionDate?` …
- **없음(신규 필요)**: `regionCode`, `addressPnu`, 주소 표시문자열(`regionName` 등). (대표 AssetForm은 `regionCode`(asset.ts:150)·`addressPnu`(156) 보유 — 선례 있음. `PresaleRightEntry`도 `regionCode`(nbl.ts:205)·`regionName`(206) 보유.)

## 3. 요건별 설계

### R1 — 모달 폭 2배
- `HousesListSection.tsx:533` `DialogContent className="max-w-lg …"` → `max-w-5xl` (32rem 512px → 64rem 1024px, 정확히 2×). `max-h-[85vh] overflow-y-auto` 유지.
- 넓어진 폭 활용: `BasicInfoSection` 등 내부를 **2열 그리드**(`sm:grid-cols-2`)로 재배치(모바일 1열 유지). 좁은 뷰포트는 Dialog가 자동 축소.

### R2 — 소재지 주소검색
- `BasicInfoSection`(`HouseEntryEditor.tsx:43-171`) 최상단(지역 라디오 위치)에 "소재지" `AddressSearch` 추가.
- **`disableUnits` 미전달(=활성)** 필수 — `address-search.tsx:70,193` 기본 falsy일 때만 동/호 조회가 실행돼 R3(공시가격·전유면적) 반환이 가능. `disableUnits=true`(경량모드)로 붙이면 R3 침묵 실패.
- **onChange 콜백 내에서 모든 필드를 동시 set**(useEffect→store 미러링 금지 — `HouseEntryEditor.tsx:12` 정책). regionCode·region·주소·공시가격·면적을 한 patch로 `onUpdate`.
- onChange 매핑(대표 자산 `AssetSectionBasic.tsx:187-232` 축약 복제): **`v.pnu.length >= 10일 때만 v.pnu.slice(0,10)` → `regionCode`**(선례 `AssetSectionBasic:207-209` 동일 가드 — houseSchema `.length(10)` 강제 때문, 아래 §4 ④ 참조), `v.pnu`(len 19) → `addressPnu`, 표시문자열(`v.road||v.jibun`) → `regionName`. regionCode·pnu·주소는 **매 발화 갱신 OK**(가격 없는 발화도 안전).
- **지역 구분 라디오 → 자동파생 읽기전용**: 같은 onChange 콜백에서 `deriveHouseRegionFromCode(regionCode)`(rename — 결정 D6)로 `region` 동시 set·표시. 표시는 **양도주택과 동일 `ToneCard` rose(조회됨)/amber(주소없음) 재사용**(일관성). regionCode 미확보 시에만 수동 라디오 유지(fallback) — 결정 D1.

### R3 — 공시가격·전유면적 자동입력
- **onChange 3회 발화 주의**(`address-search.tsx`): 주소선택(`:184`)·동선택(`:347`)엔 가격·면적 **없음**, **오직 "호(ho)" 선택 시**(`:355-363`)에만 `standardPrice`·`exclusiveArea` 반환. → **partial-guard 필수**: `if (v.standardPrice != null) officialPrice = String(v.standardPrice)`, `if (v.exclusiveArea != null) exclusiveArea = String(v.exclusiveArea)`. 무조건 대입 시 주소/동 발화의 `undefined`가 기존값(수동입력분·직전 조회분) 삭제(fork High).
- **변환 규칙**: `officialPrice = String(v.standardPrice)`(raw digits — `CurrencyInput`(`HouseEntryEditor.tsx:75`)이 콤마 포맷), `exclusiveArea = String(v.exclusiveArea)`(DecimalInput 형식).
- **개별(단독)주택·NED 무자료**: `units[]` 없음(`address-search.tsx:366-376` 텍스트 fallback) → 가격·면적 미반환. **공동주택(집합)만 자동조회 보장** → 미조회 시 officialPrice·exclusiveArea 수동입력 유지 + "공동주택만 자동조회" 안내 카피.
- 자동입력 값에 "조회값" 배지 + 사용자 수정 시 배지 제거(`PriorGiftInput.tsx:91-100` `hasUserEditedFields`→플래그 제거 패턴 축약) — 결정 D3.

## 4. 동기화 지점 매트릭스 (HouseEntry 신규 필드 `regionCode`/`addressPnu`/`regionName`)

HouseEntry는 클라이언트 store 타입. 신규 필드 반영 지점:

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① | 타입 | `calc-wizard-asset-nbl.ts` HouseEntry | `regionCode?`·`addressPnu?`·`regionName?` 추가 (+배지 플래그 `addressLookupFilled?`) |
| ② | initial | `HousesListSection.tsx:393` `addHouse()` 기본값 | 신규 필드 미설정(optional) |
| ③ | normalize | store 마이그레이션(있으면) | optional → 무해 |
| ④ | API 변환 (단건) | `transfer-tax-api-houses.ts:55-` otherHouses map | **`regionCode: h.regionCode?.length === 10 ? h.regionCode : undefined` 추가** (length(10) 가드 필수 — 아래 ⑫ 하드리젝트) |
| ④' | API 변환 (다건) | `multi-transfer-tax-api.ts:53-55` otherHouses map | **동일 배선 필수**(현재 `region: h.region`(:55)만 — regionCode 없음). 단건만 하면 다건에서 정밀 판정 누락 |
| ⑤ | UI 위젯 | `HouseEntryEditor.tsx` BasicInfoSection | AddressSearch(disableUnits 미전달) + onChange 동시 set + **기존 지역 라디오(:50-60) → 자동파생 읽기전용 ToneCard로 교체**(regionCode 없을 때만 수동 fallback) |
| ⑥ | 사이드바 | 해당 없음 | — |
| ⑦ | 결과 카드 | 해당 없음(내부 판정용) | — |
| ⑧ | validation | `transfer-tax-validate`(주택 목록 검증 있으면) | 신규 필드 검증 불요, region fallback 유지 |
| ⑫ | Zod 입력 | **houseSchema `transfer-tax-schema-sub.ts:307`, regionCode `:311 z.string().length(10).optional()`** | **무변경**(수용). ⚠️ **`.length(10)` 하드 제약** — 제공 시 ≠10자리면 silent strip 아니라 **요청 전체 400 거부**. ④/④'에서 10자리 가드 필수 |
| ⑬⑭ | Route 매핑 | `mapHousesToEngine`이 `regionCode: h.regionCode` 엔진 전달 — 단건 `route.ts:195`·**다건 `multi/route.ts:160` 동일 함수 사용**(STEP 3 실측) | **무변경**(단건·다건 모두 regionCode 엔진 도달 확인) |

> ④/④' 개선 효과: 다른 보유 주택도 `regionCode` 전송 → 엔진이 `classifyRegionCriteriaByCode`로 **군 지역 예외(기장·달성·강화 등 VALUE)까지 정밀 판정**. 종전 언급한 2분법 한계 해소.
> ⚠️ **인용 정정**(fork): 원안의 `transfer-tax-schema-sub.ts:390 min5`는 **분양권(presaleRightSchema)** — houseSchema 아님. houseSchema regionCode는 `:311 length(10)`.

## 5. 결정 지점 (추천안 표기)

| ID | 결정 | 확정 | 근거 |
|---|---|---|---|
| D1 | 지역 라디오: 자동파생 읽기전용 vs 수동 유지 | ✅ **자동파생 읽기전용**(regionCode 없을 때만 수동 fallback) | 양도주택과 일관·정밀·이중입력 제거 (사용자 확정) |
| D2 | HouseEntry 주소 필드 범위 | **최소**(regionCode·addressPnu·regionName) | 판정·재조회·표시에 충분. 전체 AssetForm 병렬은 과잉 |
| D3 | 자동입력 값 배지+수정시 제거 | ✅ **이번 범위 포함**(Phase E) | 조회↔수동 구분 명확 (사용자 확정) |
| D4 | 모달 폭·레이아웃 | **max-w-5xl + 2열 그리드** | 정확히 2×·넓은 폭 활용 |
| D5 | 다른 주택 payload에 regionCode 전송 | **전송**(④·④' 단건+다건) | 정밀 판정·스키마 이미 수용(length(10) 가드) |
| D6 | `deriveSellingHouseRegion` 명칭 | **범용 rename `deriveHouseRegionFromCode`** | 이제 selling 전용 아님(다른 주택 일반). 호출부 3곳(UI selling·단건·다건 API) 동시 갱신 — trivial |

## 6. 구현 Phase (Do — verify 포함)

1. **Phase A 타입·store**: HouseEntry에 `regionCode?/addressPnu?/regionName?` 추가 → verify: `tsc` 0건.
2. **Phase B API 배선(④·④')**: 단건(`transfer-tax-api-houses.ts`)·다건(`multi-transfer-tax-api.ts`) otherHouses map **양쪽**에 `regionCode`(length(10) 가드) 추가 + `deriveSellingHouseRegion`→`deriveHouseRegionFromCode` rename(호출부 3곳) → verify: `multi-transfer-api-sync`류 payload 테스트(regionCode 10자리 전송·비10자리 undefined) 통과.
3. **Phase C UI 모달(R1·R2·R3)**: 폭 확대 + 2열 + AddressSearch + onChange 매핑(regionCode/pnu/regionName/officialPrice/exclusiveArea) + 지역 자동파생 표시 → verify: E2E(주소검색 → 동/호 선택 → 공시가격·전유면적·지역 자동채움 확인).
4. **Phase D anchor**: 지역 자동파생·regionCode 전송이 주택 수 산정에 반영되는지 엔진 anchor 1건(군 지역 VALUE 3억 배제 케이스).
5. **Phase E 배지**(확정): 자동조회 값에 "조회값" 배지 표시 + 사용자 수정 감지 시 제거(`PriorGiftInput.tsx:91-125` `hasUserEditedFields` 패턴 축약). officialPrice·exclusiveArea·regionCode를 조회 표식(예: `addressLookupFilled?` 플래그 또는 원본값 비교)으로 관리 → verify: 자동채움 후 값 수정 시 배지 사라짐 단위 테스트.

## 7. Pre-Do anchor (강제 — 디자인 환류)

Do 진입 전 anchor 우선 작성(memory `pre_anchor_verification`):
- **A1**: 지방 군 지역(예: 기장군 `26710…` 10자리) regionCode를 가진 보유 주택 3억 이하 → 주택 수 **제외** 확인(현재 2분법은 capital 오분류 가능성). 실패 메시지로 ④/④' 배선 필요성 확정.
- **A2**: AddressValue 소비 후 officialPrice/exclusiveArea 문자열 세팅 값 형식(콤마·소수) 검증 + onChange 3회 발화 partial-guard(주소/동 발화가 기존값 미삭제) 단위 테스트.
- **A3**: houseSchema `.length(10)` 하드리젝트 — regionCode 9/11자리 payload가 400인지, 10자리·undefined는 통과인지 Zod 파싱 anchor.

## 7-B. 🔴 BLOCKER — pre-do anchor + 법령 검증 발견 (2026-07-24)

**법령**(소득세법 시행령 §167의3①1호, 현행 직접조회): 수도권·광역시·특자시(소속 군·읍면 제외) **외** 주택 中 기준시가 **3억원 이하** → 주택 수 제외.

**production 버그**:
- seed(`transfer-rate-seed.ts:168`)·schema(`rate-table.schema.ts:203`)는 `lowPriceThreshold`에 `capital`·`non_capital(1억)`만 — **`local(3억)` 없음**. `parseHouseCountExclusion`(`:264`)의 `houseCountExclusionSchema`가 Zod strip → 런타임 `.local` 항상 undefined.
- 엔진(`multi-house-surcharge-count.ts:437`)의 3억 VALUE 배제(`low_price_local_300`)는 **production dead code**. 현재 1억(`non_capital`) 기준만 작동 → **법령(3억) 위반·납세자 불리**.
- else-if(`:447`)가 `!regionCode`를 요구 → **regionCode를 보내면 1억 배제마저 미적용(regression)**.

**anchor 결과**: A1/A1b **9건 통과**(`.local` 주입 시 3억 배제 정상 — 로직 자체는 옳음). A3는 순환 의존(houseSchema ↔ -sub)으로 Do단계 route 경유 이관.

**함의**: ④/④' regionCode 배선은 **schema/seed threshold 3억 배선(엔진 경로 활성화 + `non_capital` 1억→3억 정정) 선행 없이는 동작 불가 + regression**. 이는 세액 변경·법령 정정 → 원 요청 범위 초과. **결정 필요**(아래 D7).

| D7 | regionCode·3억 배제 처리 | 옵션 | 영향 |
|---|---|---|---|
| A | 3억 threshold 배선(schema+seed) + 엔진 활성화 + regionCode(④/④') | 법령 정합·기능 완성 | 엔진·DB·회귀 — 세액 변경 |
| B | regionCode(④/④') **제외** — R1·R2·R3만, region 2분법 자동파생 유지 | regression 0·범위 최소 | 군지역 3억 정밀 없음(후속) |
| C | seed `non_capital` 1억→3억 정정 + 엔진 else-if가 regionCode 있어도 동작하게 1줄 수정 + regionCode | 최소 정정으로 기능+법령정합 | 엔진 1줄·seed 1값 — 세액 변경 |

> ✅ **결정(2026-07-24)**: **"3억 버그만 먼저 독립 정정"** — 지방 저가주택 3억 배제(§167의3①1호) 법령 정정을 **별도 PR로 선행**(엔진 VALUE 분기 단일 3억 통합 + seed 1억→3억 + 회귀 `house-count-low-price-3eok.test.ts`). 본 UI 기능(R1·R2·R3 + regionCode ④/④')은 그 위에서 **후속 진행** — 이 계획서는 그때 재개.

## 8. 범위 밖 / 리스크

- **범위 밖**: 분양권 섹션 주소검색(이미 `PresaleRightsSection:142` 보유), 대표 자산 공시가격 자동채움(별건), 건축물대장 연면적(주택 편집 모달 불필요).
- **리스크 R-1**: 개별(단독)주택은 `standard-price`가 `units[]` 없이 총액만 반환(`route.ts:317-330`) → 동/호 드롭다운 미노출 시 `exclusiveArea` 미확보. **공동주택(집합)만 전유면적 자동조회 보장**. R3에 수동입력 폴백 + 안내 카피 반영 완료.
- **리스크 R-2**: `officialPrice`/`exclusiveArea`는 string 저장(`parseAmount`/`parseDecimal` 왕복) — `String(number)` raw digits 저장(CurrencyInput/DecimalInput이 포맷). R3 변환 규칙 반영 완료.
- **리스크 R-3**: 모달 폭 2배(1024px)가 다른 세목 편집 모달 표준과 상이 — 폭 변경은 이 모달 한정.
- **리스크 R-4**(확인 필요): AddressSearch 결과 드롭다운·동/호 패널이 `absolute z-50`인데 `DialogContent`가 `overflow-y-auto`(`HousesListSection.tsx:533`) → **모달 내 드롭다운 클리핑** 위험(Step1은 모달 아님). Phase C에서 실물 확인, 필요 시 overflow/portal 조정.

## 9. 검증 게이트 (완료 기준)

- [ ] `npx tsc --noEmit` 0건
- [ ] 양도 엔진·calc 회귀 통과(1825+)
- [ ] Playwright E2E: 주소검색 → 동/호 → 공시가격·전유면적·지역 자동채움 (+ **모달 내 드롭다운 클리핑 없이 표시** R-4)
- [ ] anchor A1(군 지역 3억 배제)·A2(3회 발화 guard)·A3(length(10) 하드리젝트) 통과
- [ ] lint 클린
