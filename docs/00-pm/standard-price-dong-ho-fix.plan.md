# 공동주택 공시가격 조회 동·호(dong/ho) 누락 버그 — 전 세목 수정계획서

> 작성일: 2026-06-24 · 대상: 공시가격 자동조회(Vworld NED) 공용 인프라 + 5세목 호출부
> 검증 방식: Vworld API 직접 호출 실측 + 4개 Explore 에이전트 전수 점검

---

## 1. 증상 (실측)

기흥역센트럴푸르지오 **201동 3204호**(전용 84.7616㎡) 공동주택 공시가격 조회 시:

| 연도 | 우리 앱 표시 | 공시가격알리미(정답) | Vworld API 실응답(3204호) |
|---|---|---|---|
| 2024 | 481,000,000 | 481,000,000 | 481,000,000 ✅ |
| 2025 | **465,000,000** ❌ | 518,000,000 | 518,000,000 |
| 2026 | **524,000,000** ❌ | 534,000,000 | 534,000,000 |
| 2023(직전연도) | **370,000,000** ❌ | 427,000,000 | 427,000,000 |

**Vworld는 정답을 정확히 반환**하는데(stdrYear 서버 필터 정상), 앱이 틀린 값을 보여줌.

### 1-1. 원인 재현 (실측)

조회 시 동·호를 빼고 호출하면 서버 `pickUnit()`이 전체 2,632세대 중 **임의의 첫 세대**를 반환:

| 연도 | pickUnit이 고른 세대(동/호 無) | 가격 | 앱 표시값과 일치 |
|---|---|---|---|
| 2024 | 202동 3305호 | 481,000,000 | ✅ (3204호 값과 **우연히 동일**) |
| 2025 | 201동 304호 | 465,000,000 | ✅ |
| 2026 | 206동 1104호 | 524,000,000 | ✅ |

→ **2024가 "맞았던 것은 순전히 우연**"이며 실제로는 어느 연도도 3204호를 조회하지 않음.

---

## 2. 근본원인 — 3-layer 전달 끊김

공용 인프라(훅·API·pickUnit)는 **이미 dong/ho를 완전 지원**한다. 끊긴 곳은 UI 전달 경로뿐.

### 이미 지원하는 지점 (수정 불필요)
- `lib/hooks/useStandardPriceLookup.ts` L17-28 `LookupOptions{ dong?, ho? }`, L80-82 `if(opts.dong) params.set("dong",...)` — **검증완료(직접 읽음)**
- `app/api/address/standard-price/route.ts` L217-218 dong/ho 수신, L275·298 `pickUnit(items, field, dong, ho)` 필터링 — **검증완료**
- `pickUnit` L172-181: dong/ho 양쪽 `replace(/동$|호$/)` 정규화 → "201동"/"3204" 그대로 전달 OK — **검증완료**

### 끊긴 지점 (수정 대상)
1. **`StandardPriceInput`에 `dong`/`ho` prop 자체가 없음** — `components/calc/inputs/StandardPriceInput.tsx` L20-54 Props · L143 `lookup({jibun, propertyType, year})` (dong/ho 누락) — **검증완료**
2. **`AddressSearch`가 동·호를 별도 필드로 emit하지 않음** — `components/ui/address-search.tsx` L22-34 `AddressValue`에 `detail`(="201동 3204") 문자열만, `dong`/`ho` 분리 필드 없음 — **검증완료**
3. **호출부가 선택한 동·호를 폼에 저장조차 안 함** — 대부분 `AddressSearch.onChange`에서 `jibun/road/building`만 읽고 `detail`·`standardPrice`·`pnu` 폐기

### 2-1. 트리거 정확화 (1차 검토 정정 ★)

버그 트리거는 **"propertyKind가 house_apart인가"가 아니라 "propertyType=housing 조회 + 실제 주소가 공동주택(아파트·연립·다세대) + dong/ho 없음"**이다. 근거(검증완료):
- `StandardPriceInput.toPropertyType` L59-61: `house_individual`·`house_apart` **둘 다 `"housing"`** 으로 매핑.
- `route.ts` L274: housing 조회는 `getApartHousingPriceAttr`(공동주택, dong/ho 다세대)를 **먼저** 호출하고, 없을 때만 개별단독(`getIndvdHousingPriceAttr`, 지번 단위) fallback.
- 따라서 **`house_individual` 라벨이어도 아파트/연립/다세대 주소를 조회하면 동일 버그**. 진짜 단독주택(indvd 단일결과)만 무관.
- 대부분 호출부가 `enableLookup`을 명시 안 함 → **기본값 `true`**(StandardPriceInput L77) → 조회 버튼 상시 존재.

---

## 3. 전 세목 영향 매트릭스

✅ = 검증완료(직접 읽음/grep) · ☑ = 에이전트 점검(Do 시 line 재확인)

| 세목 | 호출부 (housing 조회) | 폼에 dong/ho | 영향 |
|---|---|---|---|
| **재산세** | `property/Step0.tsx` StandardPriceInput(housing→house_apart) + 직전연도 `fillPriorYearPrice` ✅ | ✗ 없음 | **Y** |
| **취득세** | `acquisition/Step0.tsx`(주소) + `acquisition/Step1.tsx` StandardPriceInput(housing→house_apart) ☑ | ✗ 없음 | **Y** |
| **종부세** | `PropertyCardEditor.tsx` StandardPriceInput ×2(당해 L183·직전 L235, house_apart 고정) ✅ | **O 있음**(property.dong/ho L157·169, detail 파싱 L137-143) | **Y**(전달만 누락) |
| **양도세** | `CompanionAcqPurchaseBlock`(취득 L621·양도 L655) + `CompanionAcqInheritanceBlock`(상속 L196, house_apart) + **`CompanionSaleModeBlock`(안분 L145) ★정정** ✅ | ✗ AssetForm에 없음 | **Y** |
| **상속·증여** | `EstateBodySupplementaryValuation`(보충평가 house_apart) + `EstateBodyRealEstate`(주소→addrValue) ✅ | △ `item.estateAddress`(detail·pnu 보유, dong/ho 필드 추가 필요) | **Y** |

> ★ **양도세 정정**: 1차 계획에서 `CompanionSaleModeBlock`(안분)을 "house_individual 정규화 → 무관(N)"으로 적었으나 **오류**. house_individual도 propertyType="housing" → 아파트 엔드포인트 호출 → `enableLookup` 기본 true → **아파트 주소 안분 조회 시 동일 버그**. **N→Y 정정**. 양도세 housing 자산은 라벨이 house_individual이지만(CompanionAcqPurchaseBlock.types L129) 조회는 전부 영향.

### 영향 없음 (수정 불필요 — 근거, 검증완료)
- **모든 토지 경로**: `land` propertyKind은 `getIndvdLandPriceAttr` 지번 단위, 동·호 개념 없음 (LandParcelEditor·MixedUse·SelfFarmingIncorporation·EstateBody 부수토지·CompanionAcqInheritance L169 토지·ThreePoint PHD)
- **진짜 단독주택**: `getApartHousingPriceAttr` 미존재 → `getIndvdHousingPriceAttr` 단일결과 → dong/ho 무의미. (단, **house_individual 라벨이라도 아파트/연립/다세대 주소면 영향** — §2-1)
- **주소 저장 전용**: 피상속인 주소(`steps.tsx`)·영농거주지(`FarmingEligibilitySection`) — 공시가격 조회 없음
- **건물기준시가 도구**(`BuildingStdPriceForm`): 기준시가 직접 입력, 조회 경로 없음
- **겸용주택**: `MixedUseStandardPriceInputs`는 `land`(LandPriceLookupField)만 → 공동주택 미도달

→ **5개 세목 전부(재산·취득·종부·양도·상속증여) 영향**. 종부세만 폼에 dong/ho 보유로 최소 수정.

---

## 4. 수정 설계

### 설계 원칙
- dong/ho는 **순수 UI 조회 보조값** — 엔진 input·Zod·route·결과뷰에 **전달 안 함**. 따라서 14/8 동기화 지점 중 **①폼타입·②initial·③normalize만** 해당, ④API·⑦결과·⑧validate **무관**.
- `useEffect → store` 미러링 금지 — `AddressSearch.onChange`에서 직접 폼 필드 set (cross-field 동기화 onChange 원칙 준수).
- 단일 진실: `AddressSearch`가 `dong`/`ho`를 **분리 필드로 emit** → 각 호출부의 detail 문자열 재파싱 중복 제거(현 `PropertyCardEditor` 수동 split 대체).

### Phase 1 — 공용 인프라 (2파일, 모든 세목 공통 토대)

**1-A. `components/ui/address-search.tsx`**
- `AddressValue`에 `dong?: string`·`ho?: string` 추가 (L22-34)
- `UnitSelector` 호 선택(onHoChange L345-357)·동 선택(onDongChange L340-343)에서 `onChange({ ...value, dong: selectedDong, ho, detail, exclusiveArea, standardPrice })` — detail은 하위호환 위해 유지

**1-B. `components/calc/inputs/StandardPriceInput.tsx`**
- Props에 `dong?: string`·`ho?: string` 추가 (L20-54)
- `handleLookup` L143: `lookup({ jibun: jibun ?? "", propertyType, year, dong, ho })`

> 훅·API·pickUnit은 무변경(이미 지원). Phase 1만으로 "조회 버튼"이 dong/ho를 받을 수 있게 됨.

### Phase 2 — 세목별 호출부 (각 세목 독립, 병렬 가능)

각 세목 공통 작업: ① 폼/자산 상태에 `dong`/`ho` UI 필드 추가(①②③) → ② `AddressSearch.onChange`에서 `v.dong`/`v.ho` 저장 → ③ `StandardPriceInput`에 `dong`/`ho` 전달(직전연도 자동조회 포함).

| 세목 | 폼타입 위치 | 호출부 수정 |
|---|---|---|
| **종부세**(최소) | `PropertyCardEditor` property 이미 dong/ho 보유 | StandardPriceInput ×2(L183·L235)에 `dong={property.dong} ho={property.ho}` 전달. (선택) detail 수동파싱 L137-143을 `v.dong`/`v.ho`로 교체 |
| **재산세** | `components/calc/property/shared.ts` FormState | Step0: AddressSearch onChange(L104) `dong/ho` 저장·StandardPriceInput(L115) 전달·`fillPriorYearPrice`(L64) `lookup`에 dong/ho 추가. PropertyTaxForm: prop 스레딩 |
| **취득세** | `components/calc/acquisition/shared.ts` FormState | Step0 AddressSearch onChange(L219) 저장·Step1 StandardPriceInput(L96) 전달·AcquisitionTaxForm 스레딩 |
| **양도세** | `lib/stores/calc-wizard-asset.ts` AssetForm | CompanionAssetCard AddressSearch onChange에서 `dong/ho` 자산 저장 → **3블록 전달**: CompanionAcqPurchaseBlock(취득 L621·양도 L655)·CompanionAcqInheritanceBlock(상속 L196)·**CompanionSaleModeBlock(안분 L145)**. ※AssetForm normalize/sessionStorage 마이그레이션 ③ 반드시 |
| **상속·증여** | `item.estateAddress` 타입에 dong/ho 추가 | EstateBodyRealEstate onChange(L171)에서 `v.dong/v.ho`를 estateAddress에 set → addrValue 복원(L137)에 포함 → EstateBodySupplementaryValuation(L236)으로 전파 → StandardPriceInput(L206) `dong/ho` 전달. (또는 estateAddress.detail 파싱 — dong/ho 필드 추가가 단일진실로 권장) |

---

## 5. 동기화 지점 점검 (UI-only 필드)

| 지점 | 적용 | 비고 |
|---|---|---|
| ① 폼 상태 타입 | ✅ 각 세목 FormState/AssetForm에 dong/ho | UI 전용 |
| ② initial value | ✅ "" 기본값 | |
| ③ normalize/마이그레이션 | ✅ 특히 양도세 AssetForm·sessionStorage | 누락 시 기존 저장폼에서 undefined |
| ④ API 변환 | ⛔ 해당없음 | 엔진 미전달 |
| ⑤ UI 위젯 | ✅ AddressSearch↔StandardPriceInput 연결 | |
| ⑥ 사이드바 | ⛔ 해당없음 | |
| ⑦ 결과 카드 | ⛔ 해당없음 | |
| ⑧ Validation | ⛔ 해당없음 | 선택값, 차단 불필요 |

---

## 6. 검증 계획

### Pre-Do anchor (디자인 환류용 — Phase 1 직후 우선 실행)
- **probe**: PNU `4146310200106620000`, dong=`201`, ho=`3204`로 `/api/address/standard-price` 직접 호출 → 2025=**518,000,000** 반환 확인 (이미 실측 통과)
- **단위 anchor**: `StandardPriceInput` 조회 시 dong/ho 전달되면 mock API가 dong/ho 쿼리 수신하는지 spy

### E2E (`feedback_browser_verify_with_playwright`)
- 재산세 기본정보: 주소검색→201동/3204호 선택→2025년 조회→입력란 **518,000,000** 검증(현재는 465,000,000 → 회귀 detect)
- 직전연도 자동: 2024 선택 시 직전연도(2023)=**427,000,000** 검증
- 종부세 PropertyCardEditor·취득세 Step1·**양도세 CompanionAcqPurchaseBlock(취득/양도 기준시가)·상속 보충평가** 각 1 spec
- (영향 세목 5개 모두 1 spec 권장 — 안분 경로는 수동 확인 가능)

### 회귀
- 토지/개별주택 경로 조회가 dong/ho 추가로 깨지지 않음(undefined 전달 → pickUnit 전체 후보 = 기존 동작) 확인
- `npx tsc --noEmit` 0건 · `npm test` 전체 통과

---

## 7. 비범위 (Out of Scope)
- `AddressSearch.fetchUnits`가 unit 선택 시 emit하는 `standardPrice`의 **연도 부정확성**(현재년~−3년 탐색): 본 수정과 별개. "조회 버튼"이 연도-정확 경로로 남음. 단, 선택 즉시 자동 채움 UX 개선은 후속 가능(선택).
- `pnu` 직접 전달로 lookup 견고화(jibun 재구성 대신): 후속 선택 개선. 현 범위는 dong/ho만.
- `pickUnit` 정렬 로직(`localeCompare` 최신우선): stdrYear 서버 필터로 단일연도만 오므로 무해 → 변경 없음.

## 8. 리스크 / 롤백
- **리스크 낮음**: 공용 컴포넌트에 optional prop 추가(기존 호출부 무변경 시 undefined=현 동작 유지). `AddressValue.dong?/ho?`도 optional → 인라인 `satisfies AddressValue` 생성부(LandParcelEditor 등 다수) 무영향. 세목별 독립 수정 → 부분 머지 가능.
- **회귀 무위험 근거**: dong/ho 전달 시 매칭 0건이면 `pickUnit`이 `candidates=items` fallback → 현 동작과 동일. 토지·단독주택 경로 불변.
- **롤백**: Phase 2 세목별 커밋 분리 → 문제 세목만 revert.
- **800줄 정책**: 신규 분리 불요(필드 추가 수준).

## 9. 작업 순서 제안
1. Phase 1(인프라 2파일) + Pre-Do anchor → 2. 종부세(최소·검증 용이) → 3. 재산세(원 신고 세목) → 4. 취득세 → 5. 양도세(AssetForm normalize 주의) → 6. 상속·증여 → 7. 전체 E2E·tsc·test → 8. ship
