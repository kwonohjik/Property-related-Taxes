# 작업 계획서 — 임대개시일·직전거주주택 기준시가 Vworld 자동조회 + 순서 교체

> §155⑳ 임대주택 카드·B시나리오의 주택 기준시가를 Vworld 공시가격 API로 자동조회.
> 작성일 2026-07-26 · 대상 `RentalUnitCard.tsx`·`RentalHousingExceptionSection.tsx` 외.

---

## 1. 요구 (3건)

1. **순서 교체**: `실제 임대 기간` ↔ `임대개시일 기준시가` 위치를 서로 바꿈(RentalUnitCard).
2. **임대개시일 기준시가 자동조회**: 조회연도(임대개시일 기준 **자동** + **수동 선택** 겸용) + 조회 버튼 추가 → Vworld 공시가격 조회.
3. **직전거주주택 양도 당시 기준시가 자동조회**(이미지20): 조회연도(직전거주주택 양도일 기준 **자동** + 수동 겸용) + 조회 버튼 → Vworld 조회. (현재 `CurrencyInputWithLookup`의 자동조회는 Phase 2 스텁·비활성)

> **사용자 note**: 대상 주택은 반드시 공동주택이 아니고 **개별(단독)주택일 수도** 있음.

---

## 2. 실측 전제 (추정 금지 — 코드 확인 완료)

- **API 존재**: `GET /api/address/standard-price?jibun={지번}&propertyType=housing&year={YYYY}` → `{ price, priceType, year, area?, ... }`.
  - propertyType=housing이 **공동주택(getApartHousingPriceAttr, pblntfPc) 우선 → 없으면 개별주택(getIndvdHousingPriceAttr, housePc) fallback**(route:293-331). ⇒ **house-type 토글 불필요**, 응답 `priceType`(apart_housing_price/indvd_housing_price)로 어느 쪽인지 표시. **사용자 note 자동 충족**.
  - PNU는 jibun→법정동코드→buildPnu로 자동 구성(route:231-254). **지번 주소가 필수 입력**.
  - 참조 UX: `LandPriceLookupField`(연도 Select + 조회 버튼 + jibun 구동, propertyType="land"). 주택은 propertyType="housing"으로 동일 패턴.
- **격차 — 주소 필드**:
  - 임대주택 unit(RentalUnitInput)에 주소 필드 **없음**(region 수도권/비수도권만). §155⑳ A시나리오의 임대주택은 양도 대상(asset.addressJibun)과 **다른 물건** → 조회에 임대주택 자체 지번 필요(**신규 필드**).
  - **B시나리오 §161① 정정**: "직전거주주택 양도 당시 기준시가"는 직전거주주택이 아니라 **양도 대상 물건(임대→거주 전환 주택) 자신의 D_prior 시점 가격**(안분 3시점=취득/직전양도/현양도 모두 동일 물건). ⇒ 주소 = **`asset.addressJibun`(기존 필드 재사용)**, 별도 주소 필드 **불필요**. 연도만 D_prior(priorResidenceTransferDate)에서 도출.
- **Phase 2 스텁**: `CurrencyInputWithLookup`(components/calc/shared)의 자동조회 버튼은 `isAutoLookupPhase2=false`로 비활성. 이미지20이 이 컴포넌트.
- **연도 도출 소스**: 직전거주주택 양도일 = `rh.priorResidenceTransferDate`(존재). 임대개시일 = **임대 시작일**(신규 `rentalPeriods[].start` 최소값) → 없으면 등록기준일(effRegDate) fallback.

---

## 3. Task 1 — 순서 교체 (RentalUnitCard)

현재(코드 실측): `임대개시일 기준시가`(:450) → `실제 임대 기간`(:465). 요청대로 **교체** → `실제 임대 기간` 먼저, `임대개시일 기준시가` 다음.
- **부수 이점**: 임대개시일 기준시가 조회연도가 **임대 시작일(실제 임대 기간)**에서 도출되므로, 임대기간을 먼저 입력하는 순서가 데이터 의존성과 일치.
- 나·라목(취득당시 기준시가) 분기는 순서 동일 적용.

## 4. Task 2 — 임대개시일 기준시가 Vworld 조회 (RentalUnitCard)

### 4-1. 신규 필드 (rental unit)
- `rentalAddressJibun: string` — 임대주택 지번(조회용). **AddressSearch는 컴포넌트 외부**(RentalUnitCard가 렌더) → `onChange(AddressValue)`에서 `.jibun` 추출해 저장(asset.addressJibun 방식 미러). 조회 필드엔 `jibun` string prop만 주입(LandPriceLookupField 패턴).

### 4-2. 조회연도 도출
- 자동: `임대개시일` = min(유효 `rentalPeriods[].start`) → 없으면 effRegDate → 그 연도. **`getYear` 헬퍼(RHES:30) 재사용**.
- 수동: 연도 Select override(자동값 기본선택·±N년). LandPriceLookupField의 `referenceDate` 기반 Select 패턴 준용.

### 4-3. UI
- 기존 `임대개시일 기준시가` else 분기(RentalUnitCard:450-462)를 **주택 기준시가 조회 필드**(§6)로 교체. 삼항 전체는 `showAcqPrice ? 취득당시(:433-448) : 임대개시일(:450-462)`(:433-462) — 조회화 대상은 **else(임대개시일) 분기만**.
  - RentalUnitCard가 AddressSearch 렌더(→rentalAddressJibun) + 조회 필드에 `jibun`·`referenceDate`(임대 시작일) 주입. 조회 성공 → `standardPriceAtRentalStart` 세팅.
- **적용 범위**: 임대개시일 분기(비 나·라목). 나·라목 취득당시 기준시가는 이번 범위 제외(요청 명시).

## 5. Task 3 — §161① 3시점 기준시가 Vworld 조회 (RentalHousingExceptionSection, B시나리오)

**정정(사용자·CONFIRMED)**: "직전양도 당시 기준시가"는 직전거주주택이 아니라 **양도 대상 물건 자신**의 D_prior 시점 공시가격. `prhp-allocation.ts` 실측 — P_acq/P_prior/P_transfer는 **동일 물건(PHRP) 3시점**. ⇒ 주소 = `asset.addressJibun`(기존, 신규 필드 없음).

**범위(사용자 결정)**: 환산 미연동(비-linked) 모드의 **3시점 모두**(취득시·직전양도·현양도) 자동조회 적용 — 세 필드가 동일 `CurrencyInputWithLookup`·동일 물건(asset)·연도 이미 배선이라 일괄 조회화가 일관.

### 5-1. 주소 — asset.addressJibun 재사용 (3시점 공통)
- 조회 주소 = `asset.addressJibun`. 미입력 시 조회 버튼 disabled + "양도 물건 주소(Step1)를 먼저 입력" 안내.

### 5-2. 조회연도 — 이미 배선(재사용, 신규 도출 불요)
- **이미 `lookupYear=getYear(...)` 전달됨**(RHES): P_acq(:216)·P_prior(:228, `getYear(priorResidenceTransferDate)`:232)·P_transfer(:238). 신규작업은 연도도출이 아니라 **조회 API 실호출 + 주소 주입 + 수동 override**뿐. 수동 Select override 추가.

### 5-3. UI — CurrencyInputWithLookup Phase 2 실연동 (3필드)
- `CurrencyInputWithLookup`을 §6 조회 필드로 교체(또는 Phase 2 활성화): 3필드(P_acq/P_prior/P_transfer 렌더 지점 :216·:228·:238) 각각 asset.addressJibun + 해당 lookupYear + 조회 버튼.
- **isPhrpStdPriceLinked [확인 완료]**: P_prior(:228)은 linked 게이트 **밖·항상 독립 렌더**(prhp-allocation·RHES:227-235 주석). P_acq(:216)·P_transfer(:238)는 **!linked 게이트 내부**(linked 시 자산 환산값 사용·조회 UI 미표시). ⇒ 조회는 비-linked 모드에서만 노출·취득/현양도 환산값 덮어쓰기 없음 = 무충돌 확정.

## 6. 공용 컴포넌트 — 주택 기준시가 조회 필드 (신규 `HousingStdPriceLookupField`)

`LandPriceLookupField`의 **주택판**이되 아래 차이 반영:

- **⚠️ 가격 = 총액(원) 직접 세팅 — 면적곱 금지**: 주택 응답 `price`는 총 공시가격(공동 `pblntfPc`·개별 `housePc`, route가 `price`로 직접 반환). LandPriceLookupField의 `원/㎡ × 면적 = 토지기준시가` 로직 **답습 금지**(가액 과대 버그). 조회 성공 → `onChange(String(json.price))` 직접.
- **주소는 컴포넌트 외부**(LandPriceLookupField 패턴 준수): `jibun: string` prop 주입(내부 AddressSearch 미내장). 부모(RentalUnitCard=Task2·RentalHousingExceptionSection=Task3)가 주소 소스 결정(Task2 신규 검색·Task3 asset.addressJibun).
- **props**: `label`·`value`·`onChange(string)`·`jibun`·`referenceDate`(연도추천·Select 기준)·`hint`·`testidPrefix`.
- **동작**: 연도 Select(자동추천 기본·수동) + `공시가격 조회` 버튼(인라인 fetch·**modalLauncher 아님**) → `fetch(/api/address/standard-price?jibun&propertyType=housing&year)` → `price` 직접 세팅 + `priceType`(공동/개별) 배지 + 수동입력 fallback(CurrencyInput). 에러(주소 무입력·데이터 없음·API_KEY 미설정) 각 메시지.
- **연도추천**: 주택 공시는 ~4월 기준이라 토지용 `recommendLandPriceYear`(≤5월→전년)와 경계 근소 상이 — 근사 수용(임대개시일·D_prior 경계 드묾) 또는 housing 분기(경미). `referenceDate`로 Select ±N년 유지.
- **testid**(E2E mock 셀렉터): `{prefix}-year-select`·`{prefix}-lookup-btn`·`{prefix}-status`(조회중/에러)·`{prefix}-pricetype-badge`·`{prefix}-price-input`. AddressSearch testid는 부모에서.
- **재사용**: Task2(임대개시일)·Task3 3필드(P_acq/P_prior/P_transfer) 모두 이 컴포넌트. 신규 유지(Land 일반화보다 나음 — 토지 면적곱 결합 회피).

## 7. 14 동기화 지점 (신규 필드 1개: rentalAddressJibun — Task 2 전용)

Task 3은 `asset.addressJibun`(기존) 재사용이라 신규 필드 없음.

| 지점 | 조치 |
|---|---|
| ① 폼타입 | rental unit에 `rentalAddressJibun` |
| ② initial | factory 기본 `""` |
| ③ normalize | 마이그레이션 기본 `""` — `migrateRentalPeriodFields`(calc-wizard-asset-rental-period.ts) 인접 또는 rental unit forEach(calc-wizard-asset-migrate.ts). factory `makeDefaultRentalUnit`(factory:26) 기본 `""` |
| ④ API 변환 | **엔진 미전송**(조회용 UI 전용 — 엔진은 기준시가 number만 소비) → 변환 불요 |
| ⑤ UI | §4(Task2 임대개시일)·§5(Task3 3시점·asset.addressJibun 재사용) 조회 필드 |
| ⑥⑦ | 무(결과 무관) |
| ⑧ validation | 주소는 조회 편의 필드 → 필수 아님(기준시가 값은 기존 필수 유지: standardPriceAtRentalStart api:179·schema:74·standardPriceAtPriorTransfer api:204·schema:94). 조회 미사용 시 수동입력 허용 |
| ⑨~⑭ | 엔진 input 무변경(기준시가 number 그대로) → Zod·Route N/A |

**핵심**: 주소 필드(`rentalAddressJibun`)는 **조회 편의용 UI 상태**이지 엔진 입력이 아님 → 엔진/Zod/Route 무변경. 기준시가(number)만 기존대로 전송(기존 필드).

## 8. 결정 사항 (확정)

- **Q1 임대개시일 정의 [확정]**: 조회연도 자동값 = **최초 임대 시작일**(min 유효 `rentalPeriods[].start`)의 연도. 구간 미입력 시 effRegDate fallback. `getYear` 헬퍼 재사용.
- **Q2 주소 [확정·정정]**: Task2(임대주택)만 전용 주소검색 신규(부모 렌더·jibun 추출→`rentalAddressJibun`). Task3(3시점)는 `asset.addressJibun` 재사용(신규 필드 없음).
- **Q3 컴포넌트 [확정]**: 신규 `HousingStdPriceLookupField`(주소 **외부**·`jibun` prop 주입·**가격 총액 직접·면적곱 금지**). Task2·Task3 3필드 공용.
- **Q4 나·라목 [확정]**: 이번 범위 **제외**(임대개시일만).
- **Q5 §161① 조회 범위 [확정·사용자]**: 비-linked 모드 **3시점 모두**(P_acq·P_prior·P_transfer) 조회화(스텁 잔존 방지·UI 일관).

## 9. 범위 밖 / 검증

- 엔진 판정·기준시가 시그니처 무변경.
- 검증: 조회 성공/실패(주소무입력·데이터없음·API_KEY미설정)·연도 자동↔수동·공동/개별 fallback·**가격 총액 직접(면적곱 아님) anchor**·수동입력 회귀. E2E는 Vworld **mock**(memory `feedback_gov_site_lookup_weak_tls_pnu_params` E2E mock 패턴 재사용 — 실 API 호출 금지).
- self-review 루프 후 Do.
