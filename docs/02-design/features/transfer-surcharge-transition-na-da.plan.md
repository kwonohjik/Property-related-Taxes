# 다주택 중과 한시배제 경과조치(§167의3①12의2 나·다목) 구현 계획서

- 작성일: 2026-07-23 · rev.3 (자가검증: 가목 우선 게이트 누락·함수 시그니처·regionCode 정규화 3건 보강 — 전 인용 file:line 실측 일치 확인)
- 대상: 양도소득세 — 2026-05-10 이후 양도분 조정대상지역 다주택 중과에 대한 계약·허가 기반 경과조치
- 성격: **엔진 판정 로직 정정 + 입력 확장** (현행 gracePeriod 로직이 확정 시행령 원문과 불일치 — silent 오세액 양방향)

## 1. 법령 원문 (KoreanLaw 실측 2026-07-23, 소득세법 시행령 MST 286211 · 공포 2026-05-22 · 시행 2026-07-01)

§167의3①12의2 (§167의10①12의2 **동일 미러 실측 확인**): 법 §95④ 보유기간 2년 이상(재개발 조합원 신축주택은 기존건물 취득일 기산) 주택으로서 각 목의 어느 하나:

- **가목**: 2026-05-09까지 양도하는 주택 → ✅ 기구현 (`SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW`, legal-codes/transfer.ts:482)
- **나목** (부동산거래신고법 §11 **토지거래허가 대상** 주택부수토지에 정착된 주택, 4요건 모두):
  1) 양도 위해 **2026-05-09까지 토지거래허가 신청**
  2) 그 신청에 대한 **허가를 받았을 것**
  3) 매매계약 체결 + **계약금 수령 증빙** 확인
  4) **계약체결일부터 4개월**(표 지역 6개월) 이내 양도. 단, **2026-05-10 이후 계약 체결 시 2026-09-09까지**(표 지역 **2026-11-09까지**)로 한정
- **다목** (토지거래허가 대상 **아닌** 주택부수토지, 2요건 모두):
  1) **2026-05-09까지 매매계약 체결** + 계약금 수령 증빙
  2) 계약체결일부터 4개월[나목4)의 표 지역 6개월] 이내 양도

**구조**: 나/다목 구분 = **토지거래허가 대상 여부**, 4/6개월 구분 = **나목4)의 표 소재 지역 여부**.

### 나목4)의 표 = 소재 지역 명단 (이미지45 해설서로 확정 — 2026-07-24)

법제처 API가 조문 내 표를 미반환하나, **국세청 해설서(이미지45)가 표 내용을 명시**:

| 소재 지역 | 양도 기한 |
|---|---|
| **강남구·서초구·송파구·용산구** (기존 조정대상지역) | **계약일부터 4개월** |
| **2025-10-16 이후 추가 지정 조정대상지역** — 서울 나머지 21개구, 과천시, 광명시, 성남시(분당·수정·중원구), 수원시(영통·장안·팔달구), 안양시 동안구, 용인시 수지구, 의왕시, 하남시 | **계약일부터 6개월** |

- **다목(허가 대상 아님)**: 계약 ≤ 2026-05-09 → 4개월 지역 최대 2026-09-09, 6개월 지역 최대 2026-11-09 (절대기한 자동 충족).
- **나목(허가)**: 계약 5-10 이후 가능 → 4개월 지역 **2026-09-09까지 한정**, 6개월 지역 **2026-11-09까지 한정**.
- ⇒ 4/6개월 판정은 `areaDesignatedDate ≥ 2025-10-16` 근사가 아니라 **소재 시군구 명단(regionCode)** 기반으로 정밀화 (rev.1 근사 대체). "서울 나머지 21개구" = 서울 25구 − 강남4구 → 서울 전 구는 4개월(강남4구) 또는 6개월(나머지)로 이분.

## 2. 현행 구현 실측

| 지점 | 위치 | 현행 |
|---|---|---|
| 엔진 판정 | `lib/tax-engine/multi-house-surcharge-exclusion.ts:88~110` `checkGracePeriodExemption` | 조건A: 2022-05-10 ≤ 계약일 ≤ 2026-05-09 강제 → 조건B: 양도 ≤ 계약일+4개월(areaDesignatedDate ≥ 2025-10-16 시 6개월, JS `setMonth`) OR 조건C: 토지허가구역+임차인 거주 → **무기한** |
| 발동 경로 | 동파일 :326~349 | 보유 2년(§95④) 게이트 → `input.gracePeriod && suspensionRules?.surcharge_suspended` 시 조건부 판정 (양도일 > 2026-05-09에도 도달 가능 — 배관 자체는 나·다목 수용 가능 구조) |
| 타입 | `types/multi-house-surcharge.types.ts:280~289` `MultiHouseGracePeriodInput` | contractDate·isLandPermitArea·hasTenantInResidence·areaDesignatedDate? |
| ⑤ UI | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx:146~250` | violet ToggleCard — 계약일·토지허가구역·임차인·지정일 4입력 |
| B3 팁 | `app/calc/transfer-tax/steps/Step4.tsx:655~663` | "나·다목 — 본 계산기 **자동판정 미지원**" 안내 (PR#754) |
| ⑫ Zod | `lib/api/transfer-tax-schema.ts:186~193` | 4필드 optional 객체 |
| ⑭ Route | `app/api/calc/transfer/route.ts:198` `mapGracePeriodToEngine` | Date 변환 매핑 |
| ⑧ validate | `lib/calc/transfer-tax-validate.ts:183~184` | houses>0 + gracePeriod ON 시 contractDate 필수 |
| ⑦ 결과 | `components/calc/results/TransferTaxResultView.tsx:365~374` | `isSurchargeSuspended` 시 유예 표시 (경로 사유 echo 없음) |

## 3. 갭 분석 — 원문 대조

| # | 갭 | 방향 | 심각도 |
|---|---|---|---|
| G1 | **나목 계약일 2026-05-10 이후 허용 경로 부재** — 현행은 계약일 > 2026-05-09 → 일괄 false. 원문 나목은 허가 신청만 5-09까지면 계약은 이후 가능(절대기한 한정) | 과대 과세 (유리 배제 누락) | 🔴 |
| G2 | **나목 절대기한(2026-09-09/11-09) 미구현** — 5-10 이후 계약 시 계약일+4개월이 9-09 초과 가능(예: 6-01 계약+4개월=10-01) | G1 확장 시 과소 과세 방지 필수 | 🔴 |
| G3′ | **가목 우선 게이트 누락** (자가검증) — gracePeriod 입력 시 호출부(:337~343)가 checkGracePeriodExemption만 타서, 양도일 ≤ 5-09(가목)인데 나·다 조건 미충족이면 배제 누락 | 과대 과세 | 🔴 |
| G3 | **조건C(토지허가구역+임차인 거주 → 무기한 배제)는 확정 시행령 나·다목 원문에 근거 없음** — 나목 요건은 "모두 갖춘"(신청·허가·계약금·기한 4요건)이며 임차인 조항 전무. 대책 발표문 단계 문구가 잔존한 것으로 추정 | **과소 과세 (근거 없는 무기한 배제)** | 🔴🔴 |
| G4 | 나목 1)~3) 요건 입력 부재 — 허가 신청일·허가 수령·계약금 증빙 미수집 (현행은 계약일+구역 여부만으로 배제) | 요건 미충족자 오배제 | 🟠 |
| G5 | 나/다목 분기 기준 상이 — 현행 `isLandPermitArea`(구역 여부, 조건C 전용)와 원문 "허가 **대상**"(주택부수토지의 허가 대상 여부) 의미 정렬 필요. 다목도 계약 ≤ 5-09 + 증빙 요건 명시 필요 | 구조 | 🟠 |
| G6 | 표 지역(6개월) 판정 — 현행 `areaDesignatedDate ≥ 2025-10-16` 근사. **이미지45로 명단 확정** → regionCode 명단 상수로 정밀화 | 정밀도 (해소) | 🟢 |
| G7 | 기간 계산 방식 — 현행 JS `setMonth`(:102~103). "계약체결일부터 4개월"의 국기법 §4→민법 준용(초일불산입·역월 만료) 대조 시 월말 경계에서 1일 오차 가능(예: 5-31 계약 → 민법 만료 9-30 vs setMonth 10-01) | 경계 1일 | 🟡 |
| G8 | ⑦ 결과 echo — 어느 목(가/나/다)으로 배제됐는지·기한 미표시 | 표시 | 🟡 |
| G9 | B3 팁 "자동판정 미지원" 문구 — 구현 후 갱신 필요 (Step4.tsx:655~663) | 표시 | 🟡 |

## 4. 설계

### 4.1 법령 상수 — `legal-codes/transfer.ts` (클라이언트 공용은 legal-codes — PR#754 빌드함정 준수)

```ts
/** §167의3①12의2 나·다목 — 2026-05-10 이후 양도분 계약·허가 기반 경과조치 (KoreanLaw 실측 2026-07-23) */
export const SURCHARGE_TRANSITION = {
  /** 나목1)·다목1) 공통 기준일 — 허가 신청(나) / 매매계약 체결(다) 마감 */
  DEADLINE: "2026-05-09",
  /** 계약일부터 양도 기한 (개월) — 기본 4, 나목4) 표 지역 6 */
  MONTHS_DEFAULT: 4,
  MONTHS_TABLE_REGION: 6,
  /** 나목4) 단서 — 2026-05-10 이후 계약 체결 시 절대 양도기한 */
  ABSOLUTE_DEADLINE_4M: "2026-09-09",
  ABSOLUTE_DEADLINE_6M: "2026-11-09",
  BASIS: "소득세법 시행령 §167의3①12의2 나·다목 · §167의10①12의2 나·다목",
} as const;

/**
 * 나목4) 표 = 소재 지역별 양도 기한 (국세청 해설서 이미지45, 2026-07-24 확정).
 * 4개월 = 강남·서초·송파·용산 4구 / 6개월 = 2025-10-16 추가 지정 조정대상지역.
 * ★ 6개월 명단 하드코딩 불요 — 기존 REGULATED_REGIONS(data/regulated-areas.ts)의
 *   designatedDate==="2025-10-16" 엔트리가 이미지45 명단과 실측 정확 일치(서울 11 전역 +
 *   과천41290·광명41210·하남41450·성남 수정41131/분당41135/중원41133·수원 영통41117/팔달41115/장안41111
 *   ·안양동안41173·용인수지41465·의왕41430). 단일 진실 소스 파생(드리프트 방지).
 */
export const SURCHARGE_TRANSITION_FOUR_MONTH_SGG = new Set(["11680", "11650", "11710", "11170"]); // 강남4구
export const SURCHARGE_TRANSITION_DESIGNATION_DATE = "2025-10-16"; // 6개월 지역 판별 기준일
```

**판정 함수** `transitionMonths(regionCode)` (엔진 side — REGULATED_REGIONS 의존):
```
sgg = regionCode.substring(0, 5)   // ⚠️ regionCode 5자리 초과 가능(count.ts:38 관례) — 정규화 필수
if (FOUR_MONTH_SGG.has(sgg)) return 4                                  // 강남4구
if (REGULATED_REGIONS에서 sgg 또는 sido "11" 엔트리에 2025-10-16 지정 이력 有) return 6  // 서울전역·경기 신규지정
return 4                                                              // 기타(구리·용인기흥 2026-07-01 등) 보수적 — §7
```
- 서울 나머지 21구는 데이터에 개별 엔트리 없이 **"11" 전역이 2025-10-16 재지정** → `startsWith("11") && !강남4구` → 6개월 자연 도출. 21구 코드 하드코딩·전수검증 **불요**(§7 항목 해소).
- 용인 기흥(41463)·구리(41310)는 2026-07-01 지정 → 이미지45 표 부재 → 4개월(보수적). §7 잔여.

### 4.2 타입 확장 — `MultiHouseGracePeriodInput` (types/multi-house-surcharge.types.ts)

```ts
export interface MultiHouseGracePeriodInput {
  contractDate: Date;                       // (유지) 매매계약 체결일
  /** 주택부수토지가 부동산거래신고법 §11 토지거래허가 "대상"인지 — 나목/다목 분기 */
  isLandPermitTarget?: boolean;             // 신규 (isLandPermitArea 의미 승계·개명)
  /** 나목1) 토지거래허가 신청일 — ≤ 2026-05-09 필요 */
  permitApplicationDate?: Date;             // 신규
  /** 나목2) 허가 수령 여부 */
  permitGranted?: boolean;                  // 신규
  /** 나·다목 공통 3)/1) — 계약금 수령 증빙 확인 (자기확인) */
  depositReceiptConfirmed?: boolean;        // 신규
  /** @deprecated areaDesignatedDate 근사 → regionCode 명단 판정으로 대체(G6 해소). 하위호환 유지 */
  areaDesignatedDate?: Date;
  /** @deprecated 확정 시행령 원문에 근거 없음(G3) — 판정 미사용, normalize에서 경고 */
  isLandPermitArea?: boolean;
  /** @deprecated G3 — 판정 미사용 */
  hasTenantInResidence?: boolean;
}
```

- **4/6개월 소재 지역 판정은 `sellingHouse.regionCode`(HouseInfo에 기존재 — exclusion.ts:202·205 사용 확인)로 수행** — gracePeriod에 지역 필드 신설 불요. 양도 주택 자체의 소재 시군구로 명단 대조.
- 전 필드 optional 추가 → 기존 저장 세션·직접 API 호출 하위호환. `isLandPermitArea` 값은 마이그레이션에서 `isLandPermitTarget`으로 이전(의미 승계 — 허가구역 소재 ≒ 허가 대상. 정밀 구분은 사용자 재확인 안내).

### 4.3 엔진 재작성 — `checkGracePeriodExemption` (multi-house-surcharge-exclusion.ts:88~110)

**시그니처 변경**: `checkGracePeriodExemption(transferDate, gracePeriod, sellingRegionCode?)` — regionCode 인자 추가(4/6개월 판정). 호출부(:343)는 `sellingHouse?.regionCode` 전달(sellingHouse는 :141 `input.houses.find(sellingHouseId)` — HouseInfo, regionCode 접근 가능·실측).

```
공통 전제(호출부 기존 유지): 보유 2년(§95④) 게이트(:337) 통과 후 도달.

★ 가목 우선 게이트 (자가검증 발견 — 현행 잠재버그):
  현행 호출부(:337~343)는 gracePeriod 입력 시 checkGracePeriodExemption **만** 탄다.
  → gracePeriod 입력한 사용자가 양도일 ≤ 5-09(가목 해당)인데 나·다목 조건 미충족이면 배제 누락(오과세).
  ⇒ checkGracePeriodExemption 최상단에 `if (transferDate <= DEADLINE) return {suspended:true, basis:"a"}` 우선 배제.
  (가목은 계약·허가·소재지 무관 — 양도일 단일 조건. 기존 isSurchargeSuspended 경로와 등가지만 gracePeriod 입력 경로도 커버.)

나목 (isLandPermitTarget === true):
  1) permitApplicationDate ≤ 2026-05-09
  2) permitGranted === true
  3) depositReceiptConfirmed === true
  4) 개월수 = sellingHouse.regionCode ∈ 6개월 명단 ? 6 : 4  (강남4구=4, 신규지정=6 — 이미지45)
     기한 = 계약일 + 개월수.
     계약일 ≥ 2026-05-10이면 기한 = min(계약일+개월수, 절대기한 9-09[4M]/11-09[6M])  ← 원문 "한정"
     ※ 계약일 ≤ 5-09 계약도 나목 성립 (원문 4목 본문 — 단서는 5-10 이후 계약에만 적용)
  → 1)~3) 충족 AND 양도일 ≤ 기한 → 배제

다목 (isLandPermitTarget === false):
  1) 계약일 ≤ 2026-05-09 AND depositReceiptConfirmed === true
  2) 양도일 ≤ 계약일 + (regionCode ∈ 6개월 명단 ? 6 : 4)개월  (계약 ≤ 5-09이므로 절대기한 자동 충족)
  → 배제

조건C(토지허가+임차인 무기한) 제거 — G3. 결과 warning으로 전환 안내(불리 전환 케이스 T6 명시).
계약일 하한(2022-05-10, :96) — 나·다목 원문에 하한 없음. 단 가목 윈도우(≤5-09 양도)가 선처리되므로
이 함수 도달 = 양도일 > 5-09. 계약 하한 제거 여부는 부칙 적용례 실측(§7) 후 확정 — 원문 요건에 없으면 제거(명문부재=유리).
반환: boolean → { suspended: boolean; basis?: "na" | "da"; deadline?: Date } (⑦ echo용, G8)
```

기간 계산: `setMonth` 직접 조작 대신 date-fns `addMonths` + 초일불산입 검토(§7 G7) 결과 반영.

### 4.4 ⑤ UI — `GracePeriodSection` (HousesListSection.tsx:146~250) 재구성

- 토글 title·description 갱신: "중과 경과조치 조건 입력 (§167의3①12의2 나·다목)" — 양도일 > 2026-05-09일 때 노출 의미 명확화 (가목 윈도우 내 양도는 Step4 sky 카드가 이미 전면배제 안내 — Step4.tsx:574~).
- 분기 라디오(RadioCardGroup): "토지거래허가 대상"(나목) / "허가 대상 아님"(다목).
  - 나목: 허가 신청일(DateInput)·허가 수령(ToggleCard chip)·매매계약일·계약금 증빙 확인(chip)
  - 다목: 매매계약일·계약금 증빙 확인
- **4/6개월은 양도 주택 소재지(regionCode)로 자동 판정** — 별도 입력 없음. 기한 미리보기에 "소재지 강남·서초·송파·용산 → 4개월 / 그 외 조정대상 → 6개월" 근거 문구 표시. regionCode 미확보 세션은 소재지 확인 안내(보수적으로 4개월 근사 후 경고 — 유·불리 방향 명시).
- 기한 미리보기 박스: 계산된 양도 기한(min 절대기한 포함) + 양도일 충족/미충족 상태 표시.
- `areaDesignatedDate` 지정일 입력 **제거**(regionCode 명단으로 대체). 임차인 거주 토글 제거(G3).
- 임차인 거주 토글 **제거**(G3). 기존 세션에 값 잔존 시 안내 문구 1줄.
- B3 팁(Step4.tsx:655~663): "자동판정 미지원" → "아래 ④ 중과 판정 > 경과조치 조건 입력에서 판정" 문구 교체 (G9).

### 4.5 ⑦ 결과 — TransferTaxResultView.tsx:374 유예 표시에 basis echo

엔진 result에 `surchargeSuspensionBasis?: "a" | "na" | "da"` + `surchargeSuspensionDeadline?` echo 필드 추가(엔진 echo 패턴 — 장특 배제사유 표시와 동일 계열). 표시: "§167의3①12의2 나목 경과조치 — 양도기한 2026-09-09 이내 충족".

### 4.6 14지점

폼-전역 `gracePeriod` 객체 확장: ①`calc-wizard-store.ts:137` 타입 ② 토글 ON 초기 객체(HousesListSection:165) ③ 마이그레이션(`isLandPermitArea`→`isLandPermitTarget` 이전 + deprecated 필드 유지) ④ `transfer-tax-api.ts:448` spread — **신규 필드 명시 전달 확인**(명시 prop 매핑 침묵 strip 주의) ⑤ 4.4 ⑥ n/a ⑦ 4.5 ⑧ `transfer-tax-validate.ts:183~184` 분기별 필수(나목: 신청일·계약일 / 다목: 계약일. 증빙·허가 미확인 시 차단 아닌 안내로 할지 — 차단: 원문 "모두 갖춘" 요건이므로 미확인=경과조치 부적용으로 계산 진행, silent 차단 아님) ⑨⑩ enum 없음 ⑫ schema:186 신규 필드 ⑬ body 전달 ⑭ route:198 `mapGracePeriodToEngine` Date 변환 추가. multi 라우트 동일 지점 grep 전수.

## 5. 케이스 매트릭스 (경과조치 판정 — 전 케이스 보유 2년 이상·조정대상지역·중과대상 전제)

소재지 표기: 4M=강남4구(예 강남 11680) / 6M=신규지정(예 성남분당 41135).

| # | 목 | 허가신청 | 허가 | 계약일 | 소재지 | 양도일 | 판정 |
|---|---|---|---|---|---|---|---|
| M1 | 가 | — | — | — | — | 2026-05-09 | 배제 (기존 회귀) |
| M2 | 나 | 2026-05-01 | ✓ | 2026-04-20 (≤5-09) | 4M | 2026-08-20 (계약+4M 이내) | 배제 |
| M3 | 나 | 2026-05-01 | ✓ | 2026-06-01 (5-10 이후) | 4M | 2026-09-09 | 배제 (절대기한 경계) |
| M4 | 나 | 2026-05-01 | ✓ | 2026-06-01 | 4M | 2026-09-10 | 과세 (계약+4M=10-01이나 절대기한 9-09 초과) |
| M5 | 나 | 2026-05-01 | ✓ | 2026-06-01 | 6M | 2026-11-09 | 배제 (6개월 지역 절대기한) |
| M6 | 나 | 2026-05-10 신청 | ✓ | 2026-06-01 | 4M | 2026-08-01 | 과세 (신청일 > 5-09 — 나목1 위반) |
| M7 | 나 | 2026-05-01 | ✗ 미수령 | 2026-06-01 | 4M | 2026-08-01 | 과세 (나목2 위반) |
| M8 | 다 | — | — | 2026-04-01 (≤5-09) | 4M | 2026-08-01 | 배제 (계약+4M) |
| M9 | 다 | — | — | 2026-04-01 | 4M | 2026-08-02 | 과세 (계약+4M 초과 — G7 만료일 산정 방식 확정 후 경계값 조정) |
| M10 | 다 | — | — | 2026-05-10 | 4M | 2026-07-01 | 과세 (다목1 위반 — 계약 > 5-09) |
| M11 | 다 | — | — | 2026-04-01 | 6M(성남분당) | 2026-10-01 | 배제 (6개월) |
| M12 | (G3) 조건C 잔존 세션: 허가구역+임차인, 계약 2026-01-01 | | | | 4M | 2026-08-01 | **과세로 전환** (현행 무기한 배제 → 원문 근거 없음. 계약+4M=5-01 경과) |
| M13 | 보유 2년 미만 | | | | | any | 경과조치 부적용 (기존 게이트 회귀) |
| M14 | gracePeriod 미입력 + 양도 2026-05-10 | | | | | | 중과 적용 (suspended_until 경과 — 기존 회귀) |
| M15 | 가목우선: gracePeriod 입력(계약·허가 조건 미충족) + 양도 2026-05-09 | ✗ | ✗ | — | 4M | 2026-05-09 | **배제 (가목 우선 게이트)** — 현행은 나·다 조건 미충족으로 오과세, 정정 |

## 6. Anchor 테스트

`__tests__/tax-engine/transfer/multi-house-surcharge-transition.test.ts` (신규): M1~M14 전 케이스 + 미러(2주택 `multi_house_2` 경로 1건). 기존 `checkGracePeriodExemption` 관련 테스트 grep 후 조건C 기대값 정정(법령 정합 우선 — anchor 갱신 사유 명기). ⑧⑫⑭ 배관: 신규 필드 왕복 1건. RTL: 나/다 분기 라디오·기한 미리보기.

## 7. 확인 필요 (Do 착수 시 실측 — 미해소 시 해당 부분 보류)

- [x] **나목4) 표 = 소재 지역 명단** — 이미지45 해설서로 확정(4개월: 강남·서초·송파·용산 / 6개월: 2025-10-16 신규지정 명단). regionCode 명단 상수로 구현.
- [x] **서울 21개구 + 수도권 시군구 코드** — 하드코딩 제거. `REGULATED_REGIONS` 2025-10-16 엔트리(서울 11 전역 + 경기 13개 자치구)가 이미지45와 실측 정확 일치 확인 → 데이터 파생으로 해소. 서울 21구는 "11" prefix로 자연 도출.
- [ ] **2026-07-01 지정 지역(용인 기흥·구리) 처리** — 이미지45 표 명단에 없음. 보수적 4개월 처리. 해당 지역 경과조치 실무 확인(이례 케이스).
- [~] **신설 개정령 부칙 적용례** — 부칙 API 조회 NOT_FOUND. 실용 판단: 나·다목은 가목 우선 게이트(양도 ≤ 5-09) 통과 후 도달 = **양도일 > 5-09에서만 의미** → "2026-05-10 이후 양도분" 해설서 문구와 구조적 정합. **계약일 하한(2022-05-10) 제거 확정**(나·다목 원문에 하한 없음·명문부재=유리). 부칙 정밀 실측은 잔여.
- [~] **G7 기간 만료일** — date-fns `addMonths`(응당일 = 민법 §160② 방식, 현행 `setMonth`와 동일 결과)로 통일. 초일불산입(민법 §157) 1일 오차는 유권해석 필요 — 보수적으로 응당일 방식 채택, 경계 anchor(M9)에 명시. 정밀 유권해석 잔여.
- [x] **조건C 유래** — §167의3①12의2 나목 원문 4요건(신청·허가·계약금·기한)에 임차인 조항 전무(KoreanLaw 실측). 다른 근거 없음 → **G3대로 제거 확정**. 기존 테스트(`special-exclusions.test.ts:609~624` 무기한 유예 기대값) 법령 정합으로 뒤집음(anchor 갱신 사유 명기).
- [x] 기존 테스트 위치 — `special-exclusions.test.ts:609(조건C)·626(areaDesignatedDate 6개월)`, `predo-anchor.test.ts:97~132`, `multi-house-grace-period.test.ts`. 조건C·areaDesignatedDate 의존 anchor 재작성 대상.

## 8. 작업 순서

```
0. §7 실측 4건 (시군구코드·부칙·기간계산·조건C)    → verify: 원문/해석 확보 문서화 (표 명단은 이미지45로 확정)
1. 법령 상수 + 타입 확장 + 엔진 재작성 + M1~M14   → verify: 신규 anchor GREEN + 기존 회귀
2. ⑫⑭ schema·route 매핑 (+multi 라우트)          → verify: 배관 왕복 테스트
3. ③ 마이그레이션 + ⑧ validate                   → verify: 구세션 로드·validate 테스트
4. ⑤ UI 재구성 + B3 팁 갱신 + ⑦ basis echo       → verify: RTL + tsc 0건
5. 전체 회귀 + E2E(Step4 중과 스펙 사전존재 확인)  → verify: ALL GREEN
6. 브라우저 확인 (나목 5-10 이후 계약 케이스 M3)
```

## 9. 리스크

- **G3 제거 = 불리 전환**(M12): 현행 무기한 배제 이용 계산 이력과 결과 상이. 법령 정합 우선 원칙으로 정정하되 결과 화면 warning으로 전환 사유 안내.
- 시군구 코드 오타 시 4/6개월 오판 → §7 표준 코드 전수 검증으로 차단. regionCode 미확보 세션은 근사(4개월) + 경고로 silent 오판 방지.
- 부칙 적용례가 예상과 다르면(예: 시행 2026-07-01 이후 양도분 한정) 판정 게이트에 양도일 축 추가 필요.
