# §99의4 농어촌·고향주택 — 기준시가 조회형 위젯 전환 계획서

> 작성일: 2026-07-27 · 대상: 조특법 §99의4(농어촌주택·고향주택 주택수 제외 특례)
> 후속 작업: 감면 기준시가 조회형+PHD 통일(7개 조문 완결, PR #810·#811·#812)에서 보류됐던 §99의4 단일 처리
> 계획서(모): `docs/02-design/features/reduction-stdprice-lookup-phd-unification.plan.md` §8-3

---

## 1. 배경 · 왜 별건인가

§99의4는 감면소득금액 차감(5년 안분) 방식이 **아니다**. 농어촌주택등을 소유주택에서 제외해 1세대1주택 비과세(§89①3호)를 적용받게 하는 **주택수 제외 특례**다. 따라서:

- **3시점 기준시가·PHD 환산 부적용** — 5년 안분 구조 자체가 없다(`standardPriceAt5Years` 계열 필드 부재, 실측).
- 기준시가는 **단일 값** `ruralHouseStdPrice` = "취득 당시 기준시가 합계"(주택+부속토지). 용도는 **가액 요건 한도 판정**(3억 이하, 등록 한옥 4억 — 엔진 `new-99-4.ts:134-136`).

그래서 7개 조문 통일(`ReductionStdPriceSection` 공용 컴포넌트, 3시점+PHD)에 포함하지 않고 별건으로 남겼다. 이 계획서는 §99의4의 **단일 기준시가 입력을 조회형으로만** 전환한다.

## 2. 현황 실측 (근거 file:line)

| 항목 | 위치 | 내용 |
|---|---|---|
| variant 타입 | `calc-wizard-asset-reduction.ts:204-224` | `new_99_4_rural` / `new_99_4_hometown`. 필드: `ruralHouseAcquisitionDate`·`ruralHouseStdPrice`·`isRegisteredHanok`·`meetsLocationRequirement`·`isAdjacentArea`(+hometown: `meetsHometownRequirement`). **주소 지번 필드 없음** |
| UI | `New994InputForm.tsx:74-85` | ② 가액 요건 섹션 — `ruralHouseStdPrice`를 순수 수동 `<CurrencyInput>`. referenceDate로 쓸 취득일은 `ruralHouseAcquisitionDate`(①섹션 62행) |
| API 변환 | `transfer-tax-api-reductions.ts:231-246` | `common994.ruralHouseStdPrice: parseAmount(...)` — rural/hometown 공용 |
| validate | `transfer-tax-validate-reductions.ts:175-179` | `ruralHouseStdPrice <= 0` 차단 |
| 엔진 | `new-99-4.ts:134-136` | `ruralHouseStdPrice > limit(3억/4억)` 초과 시 부적격. 단일 값 소비 |

## 3. 핵심 난제 — 농어촌주택은 별개 물건

`ruralHouseStdPrice`는 **양도물건(일반주택)이 아니라 농어촌주택**의 기준시가다. 양도물건 자산 주소(`assetJibun`)로 조회하면 **틀린 물건을 조회**한다. (§99 종전주택 `previousHouseStdPrice99`가 별개 물건이라 조회형에서 제외됐던 것과 동일 구조 — 모 계획서 §6-4.)

→ 조회형을 적용하려면 **농어촌주택 주소를 별도 입력**받아야 한다. 이는 `RentalUnitCard`(임대주택=별개 물건 주소 입력 + `HousingStdPriceLookupField` 조회)의 선례와 동일한 패턴이다.

## 4. 목표 · 스코프

`ruralHouseStdPrice`를 **조회형 위젯**(`HousingStdPriceLookupField`)으로 전환한다. 단일 시점(취득 당시) 단일 값 조회 — 3시점·PHD 없음.

- rural/hometown 2 variant 공용(New994InputForm 단일 폼).
- 농어촌주택 주소 입력 UI 신설(조회 소스). 공시가격(개별주택가격/공동주택가격)은 주택+부속토지 합계 개념이므로 조회값이 곧 "기준시가 합계"에 부합.

## 5. 변경 지점

### ① 타입 `calc-wizard-asset-reduction.ts`
- rural·hometown 두 variant에 **농어촌주택 지번** 필드 신설: `ruralHouseJibun?: string`. (조회 소스 보존용. 공동주택이면 `ruralHouseDong?`/`ruralHouseHo?`도 — §5-A 판정.)
- 엔진·검증에 무관한 조회 전용 상태이나, 재조회·값 신뢰성을 위해 폼에 저장(sessionStorage 지속).

### ③ normalize `calc-wizard-asset-migrate.ts`
- new_99_4 migrate 블록(`:111-118`)은 `ruralHouseAcquisitionDate: ""`·`ruralHouseStdPrice: ""` 등 **명시적 기본값 부여 패턴**(구 세션 복원 시 controlled input 경고·validate 차단 방어). 일관성 위해 이 블록에 **`ruralHouseJibun: ""` 추가**(단순 optional 생략이 아님).

### ⑤ UI `New994InputForm.tsx` (② 가액 요건 섹션)
- 농어촌주택 **주소 검색**(`AddressSearch`, `components/ui/address-search.tsx`) → `ruralHouseJibun` 도출. (RentalUnitCard 패턴 차용 — `RentalUnitCard.tsx:277-298`의 `AddressSearch onChange`가 `v.jibun`·`v.pnu`를 받는 구조.)
- `<CurrencyInput ruralHouseStdPrice>` → `<HousingStdPriceLookupField>`:
  - `value={ruralHouseStdPrice}` / `onChange`
  - `jibun={value.ruralHouseJibun}` (양도물건 assetJibun **아님** — 별개 물건)
  - `referenceDate={value.ruralHouseAcquisitionDate}` (①섹션 취득일)
  - `testidPrefix="new994-stdprice"` · `hint="주택+부속토지 합계 — 3억 이하(등록 한옥 4억)"`
- **onExclusiveArea 미전달**(고가주택 전용면적 판정 없음 — §99의4는 면적 요건 없음).

### ④ API / ⑧ validate
- `ruralHouseStdPrice`는 **동일 필드**(값 저장 위치 불변) → API 변환·validate **무변경**. 조회형은 UI 입력 수단만 교체.
- `ruralHouseJibun`은 조회 전용 → 엔진 미전달(A설계와 동형: 클라이언트 조회, 값만 이미 폼에).

### ⑫ Zod / ⑭ Route
- `ruralHouseStdPrice`는 이미 body 전달 중(무변경). `ruralHouseJibun`은 엔진 미전달이면 Zod/Route 불필요. (sessionStorage 지속만 필요하면 폼 타입만으로 충분.)

## 5-A. 공동주택 vs 단독주택 분기 (설계 결정 필요)

농어촌주택은 대개 **단독주택** → 개별주택가격. `HousingStdPriceLookupField`는 공동주택가격 우선 → 개별주택가격 자동 fallback(주석 실측). 따라서:
- **단독주택**: `jibun`만으로 조회(dong/ho 불요).
- **공동주택(농어촌 아파트 등 드묾)**: `ruralHouseDong`/`ruralHouseHo` 필요.

권장: 우선 `jibun`만 배선(단독주택 기본). 공동주택 세대 지정은 조회 실패 시 수동 입력 fallback으로 충분(과설계 회피).

## 6. 리스크 · 함정

1. **별개 물건 주소(핵심)**: 반드시 `ruralHouseJibun`(신규)로 조회. `assetJibun`(양도물건) 사용 금지 — 틀린 물건 조회.
2. **주소 입력 UX 추가**: 기존엔 기준시가만 타이핑 → 이제 주소 검색 단계 추가. 조회 실패 시 수동 입력 fallback 유지(값 필드는 그대로 편집 가능).
3. **단일 값 ≠ 3시점**: `ReductionStdPriceSection` 공용 컴포넌트 재사용 **불가**(그것은 3시점+PHD 전용). `HousingStdPriceLookupField` 단독 사용.
4. **"합계" 의미 정합**: 공시가격이 주택+부속토지 합계이므로 조회값=합계에 부합. 단 부속토지가 공시 범위를 벗어나는 예외(대규모 부속토지)는 수동 보정 안내.
5. **엔진 무변경 확인**: `ruralHouseStdPrice` 소비 로직(한도 판정) 불변 — 값 저장 위치·타입 동일.

## 7. 검증 · 성공 기준

- [ ] anchor: `ruralHouseStdPrice` 조회값 → 엔진 한도 판정(3억/4억) 정합(기존 new-99-4 테스트 무회귀).
- [ ] `ruralHouseJibun`으로 조회 시 농어촌주택 기준시가 반환(assetJibun 아님) — 수동 확인.
- [ ] `npx tsc --noEmit` 0.
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/new-99-4*.test.ts` GREEN(무회귀 — 값 경로 불변).
- [ ] 브라우저: 농어촌주택 주소 검색 → 조회 → ruralHouseStdPrice 자동채움 → 계산.
- [ ] eslint 0.

## 8. 미확정 사항 (착수 시 결정)

1. **주소 입력 방식**: `AddressSearch`(지도·도로명 검색, RentalUnitCard 패턴) vs 지번 직접 타이핑. 권장 `AddressSearch`.
2. **공동주택 세대 필드**(`ruralHouseDong`/`ruralHouseHo`) 신설 여부 — §5-A 권장: 우선 미신설(단독주택 기본), 필요 시 후속.
3. **`ruralHouseJibun` 지속 범위**: 폼 sessionStorage만(엔진 미전달) 확정 — Zod/Route 무배선.
4. **소재지 자동판별 연계(개선·범위 밖)**: `AddressSearch`는 `pnu` 앞 10자리 = 법정동코드를 준다. `RentalUnitCard.tsx:296-297`는 이를 `regionCode`로 저장해 소재 지역을 자동판별한다(`deriveRentalRegionFromCode`). §99의4도 소재지 요건(읍·면 소재 등, `meetsLocationRequirement` 토글)이 있어, 주소 도입 시 **읍·면 소재 자동판별 힌트**로 연계할 수 있다. 단 §99의4 소재지 판정은 수도권·조정대상지역·관광단지 등 복합 조건이라 완전 자동화는 별건 — 이번 조회형 전환 범위 밖(후속 검토).
