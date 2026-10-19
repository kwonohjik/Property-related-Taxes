# 주택 부수토지 세율 기산 — 구주택 멸실·신축 통산 (해석 (5)) 구현 계획 초안

작성: 2026-10-19 · 조사·계획 전용 (코드 수정 없음). 모든 해석례 인용은 taxlaw.nts.go.kr 상세 페이지 Playwright 판독본 기준.

## 0. 한 줄 결론

`resolveAppurtenantLandRateBasisDate`(transfer-tax-appurtenant-land.ts:48)는 (7)과 같은 결과를 낸다(변경 불필요). (5)는 처리하지 못한다.
**구주택 부수토지 기간 + 신축주택 부수토지 기간을 합산한 개월 수 M**을 세율 구간 판정에 넣어야 하고, 엔진 하부(`calcTax`)는 날짜를 받으므로
**등가 기산일 `E = subMonths(양도일+1, M)`** 을 이 함수가 돌려주면 하류 배관 변경 없이 세율만 바뀐다(아래 프로토타입 실측).

## 1. 근거 요약 (원문 대조는 최종 보고서 표 참조)

- 서면법규과-1222 (2014.11.19.) 원문: 요지 "…주택 부수토지의 보유기간은 구주택과 신축주택의 부수토지의 기간을 합하여 1년 이상인 경우 일반세율" — **책자 인용은 현행 세율(2년·60/70%)로 풀어 쓴 것**이고 원문은 2014 개정법(1년·40%) 기준이다. 결론 구조는 동일.
  사실관계: 구주택 취득 2012.12.28. → 멸실 2013.02.25. → 사용승인 2013.09.10. → 양도 2014.08.28. 질의서 자체가 `토지 전체 1년8개월 / 주택부수토지로서 1년1개월 / 나대지로서 7개월`로 **나대지(멸실~사용승인) 기간을 따로 빼서** 기재했고 회신은 "해당 토지의 주택부수토지인 보유기간이 1년 이상 2년 미만"이라는 그 전제로 답했다. ⚠️ 다만 이 사안은 전체 1y8m·부수 1y1m이 같은 구간(1~2년)이라 **공백 제외가 결론을 가르는 사안은 아니다** — 공백 제외의 직접 근거는 (7)의 "나대지 기간은 주택부수토지가 아님"(기재부 재산세제과-1354 / 사전-2021-법규재산-1232 질의: "전체 토지 보유 1~2년, 주택부수토지 보유 1년 미만 → 70%")과 조심 2012중0184(공사기간 제외 통산 — 장특 사안)다.
- 사전-2023-법규재산-0097 (2023.6.15.) 원문 요지: "구주택 멸실 후 새로운 주택을 신축하여 양도 시, 주택부수토지로서의 기간을 통산하여 2년 이상인 경우, 해당 토지의 양도소득 과세표준에 대해서는 소득법§104①(1)에 따른 세율". 전제: 1960 상속 취득 / 신축 취득일은 영 §162①4호(사용승인) / **"구주택 및 신축주택의 주택이 정착된 면적은 증가하지 않은 것을 전제"**. 회신 문언은 "구주택의 주택부수토지와 신축주택의 주택부수토지 기간을 통산" — 두 기간의 합이지 연속 구간이 아니다(= 공백 불산입 문언 일치). ⚠️ **회신은 ≥2년인 경우만** 답했다. 1~2년(60%)·1년 미만(70%) 구간은 §104①2·3호 괄호의 같은 기준("주택부수토지로서의 보유기간", 기재부-1354)에 따른 **확장 적용** — 확인 필요 고지 대상.
- (7) 방향 = 현행 `max` 규칙과 일치: 기재부 재산세제과-1354 · 사전-2021-법규재산-1232 · 사전-2023-법규재산-0389 · 조심 2024인3140 (본문 확인). 추가 발견: **사전-2025-법규재산-0289 (2025.6.4.)** — 토지 상속(1991) 후 주택 매수(2024.7.) → 1년 내 양도: 토지 중 영 §167의5 부수토지분 **70%**, 장특은 **토지 전체 보유기간**. 이는 `max` 규칙(토지 먼저·주택 나중)의 **직접 근거**이므로 `transfer-tax-appurtenant-land.ts:35-47` 주석의 "근거 수준 간접"은 이 방향에 한해 갱신 대상(토지 나중 방향은 여전히 간접).
- 경계: 사전-2024-법규재산-0463 (2024.8.5.) — 재개발 관리처분인가 후 권리(입주자 지위) 승계 → 신축 사용승인일부터 기산(통산 없음). ⇒ 정비사업 경로(RedevelopmentBlock)는 이 기능 대상 밖. 서면법규과-944 (2014.8.28.) — 주택과 부수토지 소유자가 별개 세대면 그 토지는 부수토지 아닌 일반토지 세율. ⇒ 구주택이 **본인(동일 세대) 소유가 아니던 기간**은 통산 불가(동일 세대원 소유 기간 처리는 해석 미확보). 부동산거래관리과-211 (2012.4.18.) — 비과세 보유기간(영 §154⑧1호) 사안: 신축 면적 증가 시 **구주택 정착면적×배율 이내 토지에 한해** 구주택 기간 통산.

## 2. 현행 코드 지도

### 2.1 `resolveAppurtenantLandRateBasisDate` 호출 경로 (전수 grep)
| 호출 | 위치 | 역할 |
|---|---|---|
| 단건/다건 split 세율 시드 | transfer-tax-split-part-seeds.ts:47 | `landBasisDate` → land seed `basisDate` + `buildLandRateInput(input, basis)`(acquisitionCause=purchase 로 자산 단위 §104② 재적용 무력화) |
| echo | transfer-split-part-echo.ts:57 | `appliedRateBasisDate` 표시 전용 |
| 재수출 | transfer-tax-split-rate.ts:59 | 800줄 분리 호환 |
| 하류 | transfer-tax-rate-calc.ts:395-399 | `holdingForRate=calculateHoldingPeriod(basis, transferDate)`, `holdingMonthsTotal=years*12+months`; 구간 판정 :427-428(<12→50%, <24→40%), 주택 단기세율 :518~546 |

**결정적 사실**: 세율은 `holdingMonthsTotal`(정수 개월) 하나로만 갈린다 — 일(day)은 쓰지 않는다. 다건(multi)도 같은 시드를 쓴다(app/api/calc/transfer/multi/route.ts 는 입력 매핑만).

### 2.2 같은 규칙을 **따로** 구현한 곳 (이번 기능이 건드릴지 결정 필요)
1. 단건 겸용 `rateParts` 주택분 — transfer-tax-mixed-use-rate-parts.ts:35 `Math.min(landRateYears, buildingRateYears)`
2. 겸용 컴패니언 주택 카드 — app/api/calc/transfer/mixed-use-part-cards.ts:345-356 `housingRateBasisDate`(= max, types/transfer.types.ts:683)
3. **일괄양도 companion 토지 카드** — lib/tax-engine/appurtenant-land-rate.ts:218 `housingRateForHoldingPeriod(primary.holdingMonths)` / :245 `resolveCompanionLandRate`. 주택 취득일 기준 `holdingMonths`(app/api/calc/transfer/bundled-split-helpers.ts:133)만 쓰고 **토지 취득일을 보지 않는다**(토지 나중 취득이면 split 경로의 `max`와 결과가 갈릴 수 있음 — 이번 조사에서 발견한 기존 불일치, 미실측).
   → 5·7번 사례를 companion 모드로 입력하면 (5)는 구주택 기간이 통째로 빠진다.

### 2.3 멸실·재건축 관련 기존 입력 (재사용 가능성)
- 정비사업 재개발·재건축: `RedevelopmentBlock` / `redevelopment` 입력(영 §154⑧1호 통산, 사전-2020-386) — **조합원 경로 전용**, 임의 재건축·자가 신축은 입력 없음.
- `NewHouseOriginKind="self_rebuild"` (types/transfer.types.ts:68) — **일시적 2주택 신규 주택의 취득 경위**(§155① 판정용). 양도 자산 자신의 세율 기산에는 쓰이지 않음 → 재사용 불가(의미 다름).
- `demolishedBeforeBalance`(types/transfer.types.ts:569, lib/calc/one-house-demolished.ts) — 잔금 전 멸실 특약(판정 메뉴). 무관.
- `exemptionHoldingStartDate`(types:585) — 비과세 보유 기산(정비사업·겸용 카드). 임의 재건축 비과세 통산용 입력은 없음 → 구주택 정보를 받는 이번 입력이 생기면 **비과세 보유·거주 통산(영 §154⑧1호)·장특 표2(조심 2012중0184, 2013중0919)** 확장이 자연스러운 후속이지만 범위 밖(Q-6).
- 결론: **재사용 가능한 기존 입력 없음. 신규 자산-수준 입력이 필요**하다. 선례 패턴 = `LandPartCauseBlock`(components/calc/transfer/LandPartCauseBlock.tsx:100) + `lib/calc/transfer-land-part-cause.ts`(호스트 술어 `landPartCauseApplicable`·`effectiveLandAcquisitionCause`·`hasStaleSplitInput` 정규화).

### 2.4 사용자가 오늘 (5)를 입력하는 방법
- 경로 A(split): 주택 + 「토지·건물 취득일이 다르다」 + 건물 취득원인 신축(취득일=사용승인일) + 토지 취득일(구주택 포함 취득일). 엔진: land basis = max(토지, 신축) = 신축일 → 단기세율.
- 경로 B(companion 일괄양도 토지 카드): 위 2.2-3.
- 경로 C(겸용주택): 위 2.2-1·2.
- 단일 취득일 입력(토지·건물 같은 날로 입력)이면 신축일 기준 단기세율로 나가며 구주택 정보를 담을 곳이 없다.

## 3. 프로토타입 실측 (throwaway probe, 삭제 완료 · git clean)

전제: mock 세율, 주택 split(토지 양도 7억·취득 2억 / 건물 양도 3억·취득 2.5억), 2주택·비조정(비과세·중과 회피), 신축 사용승인 2025-01-01, 양도 2025-09-01(신축 8개월), 토지 취득 2022-01-01.
`resolveAppurtenantLandRateBasisDate` 반환값만 `vi.mock`으로 갈아 끼워 하류가 날짜 하나로 움직이는지 확인.

| 사례 | 구주택 부수토지 | 합산 M | 현행 산출세액 | 등가 기산일 적용 | 적용 세율 |
|---|---|---|---|---|---|
| S1 | 17개월 | 25 | 362,250,000 (land 70%) | 195,309,999 (override 2023-08-01) | 토지 기본세율 |
| S2 | 7개월 | 15 | 362,250,000 | 315,249,999 (override 2024-06-01) | 토지 60% |
| S3 | 2개월 | 10 | 362,250,000 | 362,250,000 (override 2024-11-01) | 토지 70% (불변) |
- 프로토타입 override 날짜는 개월 수만 맞춘 근사다(정식 공식 E=subMonths(양도일+1,M)이면 S1=2023-08-02, S2=2024-06-02, S3=2024-11-02 — 같은 개월 수라 세율 동일).
- 장특(`longTermHoldingDeduction`)은 세 경우 모두 30,000,000으로 동일 — **세율 축만 바뀐다**(사전-2025-0289의 "장특은 토지 전체 보유기간"과도 정합). 끝자리 999는 mock 누진공제 유래로 보이나 **원인 미확인**(엔진 변경과 무관, 현행·가정 양쪽 같은 계산식).
- (7) 나대지 2020 취득 → 2025-01 신축 → 2025-09 양도: 현행 70%(348,250,000) = 해석 (7) 결론과 일치.
- 현행 S1이 해석대로면 **과세 과다 166,940,001원**(362,250,000−195,309,999) — 단기세율 오적용 크기 참고.

**등가 기산일 방식 검증 (격자 40,000건)**: `E = subMonths(addDays(T,1), M)` 로 두면 `calculateHoldingPeriod(E,T)`의 `years*12+months`가 M(1,6,11,12,13,17,23,24,25,36)과 **전건 일치**(T = 2015-01-01 이후 4,000일 × 10개 M, 불일치 0). 반면 "구주택 구간 (y,m,d)를 신축 시작일에서 거꾸로 빼는" 방식은 20,000건 중 5,337건(27%)이 (y,m,d) 왕복 불일치(월 길이 차) → **채택하지 않음**.

## 4. 엔진 설계

### 4.1 입력 (최소, 자산-수준, split 모드 + 주택 + 건물 취득원인 신축에서만)
| 필드 | 형태 | 비고 |
|---|---|---|
| `priorHouseRebuilt` | boolean (ToggleCard) | 「신축 전 같은 토지 위에 본인(세대)이 소유한 구 주택이 있었고 멸실했다」 — 미선택=통산 없음(현행). 「모름」=혜택 불성립 + 확인 필요 |
| `priorHouseDemolitionDate` | date | 멸실일. 필수. 신축(건물 취득)일보다 앞 |
| `priorHouseStartMode` | `"since_land"` \| `"later"` | 구주택이 토지 취득 때부터 있었는가(예 → 시작일 = 토지 법정 기산일 `resolveLandRateBasis().date`, 상속·이월과세 반영) / 아니오 → 아래 날짜 필수 |
| `priorHouseAcquisitionDate` | date | `later`일 때만. 구주택 취득일(본인 소유 개시일) |
| `priorHouseFootprintUnchanged` | 확인 체크 | 사전-2023-0097 전제 「정착면적 미증가」. 미체크 시 계산 차단(Q-3) |
- 판정 술어 leaf(신규): `lib/calc/transfer-rebuilt-house-land.ts` — `rebuiltHouseLandApplicable(asset)`(split ∧ housing ∧ newConstruction 호스트 ∧ selfOwns=both), `effectivePriorHouse(asset)`(블록이 닫히면 stale 값 제거 = `hasStaleSplitInput` 패턴).

### 4.2 산식 (순수 함수, `transfer-tax-appurtenant-land.ts` 하나에 격리)
```
seg1 = [구주택 부수토지 시작일, 멸실일]            (토지 법정 기산일 또는 priorHouseAcquisitionDate 중 늦은 날)
seg2 = [건물 취득일(사용승인), 양도일]              (= input.acquisitionDate)
각 구간을 calculateHoldingPeriod(from,to) → (y,m,d)
M = (y1·12+m1) + (y2·12+m2) + floor((d1+d2)/30)   ← 일 이월 규칙은 Q-2
E = subMonths(addDays(양도일,1), M)               ← 등가 기산일(격자 검증)
반환: E        (priorHouseRebuilt 가 유효할 때만. 아니면 현행 max)
```
- 멸실~사용승인 공백은 산입하지 않는다(나대지 기간 — (7)·1222 질의 구분). seg1 시작이 토지 법정 기산일이므로 상속(피상속인 취득일)·이월과세(증여자 취득일) 토지는 `resolveRateBasis` 결과를 그대로 쓴다(단순 증여는 통산 안 함 — 기존 규칙).
- 건물(주택) 파트 기산은 **불변**(신축 사용승인일) — 1222 요지 "신축주택의 보유기간에 구주택 보유기간은 포함하지 않는다"와 현행 일치.
- `calculateHoldingPeriod` 규약(§95④ 초일 산입)은 그대로. NTS 질의서 산술(1개월28일 / 11개월18일)과 엔진 값(1개월29일 / 11개월19일)이 구간당 +1일 다르다(실측) — 임계 경계에서만 의미(Q-2와 함께 경계 anchor).
- echo: `SplitPartResult.land.appliedRateBasisDate`는 E(합성 날짜)가 되므로 **그대로 두면 오해** → 별도 echo `rateHoldingAggregation?: { seg1: {from,to}, seg2: {from,to}, totalMonths, equivalentBasisDate }` 추가(echo-field-pattern), 결과 화면 산식에 구간 2개 병기. (선택)

### 4.3 호출부
- `resolveAppurtenantLandRateBasisDate` 한 곳 수정 → seeds(:47)·echo(:57) 자동 추종. `calcTax`·분기 게이트 7(세율 동일 시 병합) 무영향.
- 게이트: 토지가 주택 부수토지가 아니면(배율 초과분 `non_business_land`) 기존대로 토지 본래 기산(`resolveLandStatutoryAcquisitionDate`) — 통산 대상 아님.

## 5. 14지점 영향 (엔진 input 신설 시)
| # | 지점 | 파일(예상) | 내용 |
|---|---|---|---|
| ① | 폼 상태 | lib/stores/calc-wizard-asset-split-acq.ts (SplitAcquisitionFormSlice) | 위 5필드 |
| ② | initial | lib/stores/calc-wizard-asset-factory.ts | 기본값 (토글 false 등) |
| ③ | normalize/migrate | lib/stores/calc-wizard-asset-migrate*.ts | 구 세션 복원 방어 |
| ④ | API 변환 | lib/calc/transfer-tax-api-split.ts (+신규 leaf) | 유효할 때만 전송, stale 제거 |
| ⑤ | UI 위젯 | 신규 `RebuiltHouseLandBlock.tsx` — `CompanionAcquisitionCauseSection.tsx:183` 의 `LandPartCauseBlock` 옆(ToneCard/ToggleCard/DateInput 규약) | 계산 로직 순서=표시 순서 |
| ⑥ | 사이드바 | 합계 항목 없음(세율 축) — 해당 없음 확인 | |
| ⑦ | 결과 카드 | split 파트 산식에 구간 2개·M 병기, 확인 필요 고지(0097 ≥2년 한정) | |
| ⑧ | validation | lib/calc/transfer-tax-validate-split.ts | 토글 on → 멸실일 필수·신축일 앞·시작 모드/날짜·정착면적 확인 필수. 3중 패턴: UI 표시/④ 전송/⑧ 동일 술어 공유 |
| ⑨⑩ | Zod enum | startMode enum (메인·컴패니언+`addPropertyRefines`) | companion 지원 시 |
| ⑪ | 자산-수준 acquisitionDate fallback | 해당 없음 | |
| ⑫ | Zod 입력 객체 | lib/api/transfer-tax-schema-split.ts (:29 landAcquisitionDate 인근) | 침묵 stripping 주의 |
| ⑬ | body spread | callTransferTaxAPI / multi body | |
| ⑭ | Route 매핑 | app/api/calc/transfer/engine-input.ts:364 근방, multi/route.ts, bundled-split-helpers.ts:417 근방 | `toOptionalDate` Date 변환 |
추가: types/transfer.types.ts 입력·types/transfer-split-gain.types.ts echo, `legal-codes/transfer.ts` 상수(해석례 인용은 문자열 리터럴 금지) + `lib/legal-verification/manifest/additions-transfer-*.ts` 등록(조문 인용 시), 주석 갱신(appurtenant-land.ts:35 근거 수준, 사전-2021-법규재산-**1231**→1232 확인).
정책 점검: ① useEffect 미러링 없음(블록 열림은 술어 파생 렌더) ② 자동 안분 없음(면적 증가 차단) ③ validate 동일 술어.

## 6. 케이스 매트릭스

| # | 사실 | 기대 | 근거 |
|---|---|---|---|
| C1 | 토지·구주택 동시 취득 → 멸실 → 나대지 → 신축 → 양도, 합산 ≥24개월 | 토지 기본세율, 건물 단기세율 | 1222 · 0097 |
| C2 | 〃 합산 12~24개월 | 토지 60%(확장 적용, 확인 필요 고지) | 1354 기준 + 0097 확장 |
| C3 | 〃 합산 <12개월 | 토지 70% | 1354 |
| C4 | 나대지 취득 → 주택 신축(구주택 없음) | 현행 max 불변 | (7) 1354·1232·조심 2024인3140 |
| C5 | 근생 건물 멸실 → 주택 신축 | 구건물은 주택 아님 → 토글 off, 현행 불변 | 0389 |
| C6 | 토지만 먼저, 구주택은 토지 취득 후에 취득 | seg1 시작 = 구주택 취득일 (`later`) | 0289(토지만 있던 기간은 부수토지 아님) |
| C7 | 구주택이 타인(별개 세대) 소유였던 기간 | 통산 제외 | 944 |
| C8 | 신축 정착면적 증가 | **차단**(Q-3) | 0097 전제 · 부동산거래관리과-211 |
| C9 | 토지 상속(구주택 포함), 피상속인 취득일이 seg1 시작 | `resolveRateBasis` 결과 사용 | 0097(1960 상속) · §104②1호 |
| C10 | 토지 이월과세(§97의2①) | 증여자 취득일 사용, 단순 증여는 통산 없음 | 기존 `resolveRateBasis` |
| C11 | 정비사업 조합원 경로 | 대상 아님(신축 사용승인일 기산) | 사전-2024-0463 |
| C12 | 경계: M=11/12, 23/24 (일 이월 ±1), 윤년 2/29 멸실·취득 | anchor로 고정 | Q-2 |
| C13 | 1세대1주택 비과세(12억 이하) + 합산 | 비과세 판정은 현행(신축일 기준) — 통산 확장은 후속 | Q-6 |
| C14 | 배율 초과분 | 통산 대상 아님, 토지 본래 기산 | 기존 G-2 |
| C15 | companion/겸용 경로 입력 | v1 미지원 → 안내 | Q-7 |

## 7. 결정이 필요한 쟁점 (권장안)

| Q | 쟁점 | 권장 |
|---|---|---|
| Q-1 | 멸실~신축 공백 산입? | **불산입**. 근거: 1222 질의서 구분·(7)(나대지 기간 ≠ 부수토지)·0097 문언 "기간을 통산". 단 1222는 결론을 가르는 사안이 아님 → 결과 화면에 근거 수준 고지 |
| Q-2 | 두 구간 일(day) 이월 규칙 | 30일=1개월(NTS 사례 산술만 근거, 입증 약함 → **확인 필요 표기**) 또는 달력식. 경계 anchor 선행 |
| Q-3 | 신축 정착면적 증가 | **차단 + 안내**(0097 전제). 구정착×배율 안분은 해석 부재 + 자동 안분 금지 정책 |
| Q-4 | 구주택 시작일 입력 형태 | 「토지 취득 때부터 있었는가」 예/아니오 + 아니오면 날짜 필수(기본값 자동 채움 금지) |
| Q-5 | 노후·소실 사유 요건 | **필드 두지 않음**(0097 회신은 사유 미언급, 1222 질의서만 「노후」). 불리 적용 금지 정책 + 확인 필요 고지 |
| Q-6 | 비과세 보유·거주 통산(영 §154⑧1호)·장특 표2 | **별건 후속**. 이번엔 1세대1주택이면 「비과세·장특 통산은 별도 판정 필요」 고지만 |
| Q-7 | companion·겸용 경로 | **v1은 split 경로만**. 다른 두 경로의 별도 구현(2.2)과 companion의 토지 나중 취득 불일치는 후속 별건으로 분리 |
| Q-8 | 1~2년·1년 미만 구간 | 확장 적용 + 「0097은 ≥2년만 직접 판단」 고지 |
| Q-9 | 동일 세대원 소유였던 구주택 | 해석 미확보 → 본인 소유로만 입력 가능하게 하고 확인 필요 |
| Q-10 | 인용 정리 | appurtenant-land-rate.ts:11 · legal-codes/transfer.ts:542 의 「사전-2021-법규재산-1231」 vs 확인된 1232[법규과-3119] |

## 8. 작업 순서 (Do 진입 전)
1. Pre-Do anchor(엔진 단독): 위 S1~S3 + 경계 C12를 `resolveAppurtenantLandRateBasisDate` 단위로 고정(현행 값 = 회귀 가드, 신규 값 = RED).
2. 엔진: 입력 타입 → 함수 수정 → echo → 하류 무변경 확인.
3. ④⑧⑫⑬⑭ 배관 → ① ② ③ → ⑤ ⑦ UI → 14지점 grep 자가 점검.
4. `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/` + `npm run test:transfer` + 브라우저(Playwright) 확인.

## 9. 사용자 결정 (2026-10-19 확정 — 재론 금지)

§7의 쟁점을 사용자가 아래와 같이 확정했다. 엔진 설계는 `docs/02-design/features/appurtenant-land-rebuild-rate-basis.engine.design.md`.

| Q | 확정 | 내용 |
|---|---|---|
| Q-1 | **공백 제외** | 공사기간(멸실일~신축 사용승인일, 나대지)은 **빼고** 합산한다. seg1 = [구주택 부수토지 시작일, 멸실일], seg2 = [건물(신축) 취득일, 양도일] |
| Q-2 | **일수 버림** | 각 구간의 개월 수(`years*12+months` — 엔진 `calculateHoldingPeriod` 규약 그대로)만 더하고 남는 일수는 버린다. `M = months(seg1) + months(seg2)`. 등가 기산일 E는 `calculateHoldingPeriod(E, 양도일)`의 `years*12+months`가 정확히 M이 되도록 만든다(§4.2의 `floor((d1+d2)/30)` 이월은 **폐기**) |
| Q-3 | **split 경로만** | 함께 양도 컴패니언 토지 카드(`resolveCompanionLandRate`)·겸용(`transfer-tax-mixed-use-rate-parts.ts:35`, `mixed-use-part-cards.ts:345`)은 이번에 바꾸지 않는다(별건). 그 경로로 새 입력이 오면 strip이 아니라 ⑫ **400으로 거부**한다 |
| (권장안 확정) | 정착면적 | 신축 정착면적 증가 시 **차단 + 안내**(자동 안분 금지) — 입력은 「늘지 않았음」 확인(`footprintUnchanged: true`)이며 아니면 계산하지 않는다 |
| | 구주택 시작일 | 「토지 취득 때부터 있었음」 예/아니오. 아니오면 날짜 필수(자동 채움 금지). 예이면 시작일 = 토지 §104② 법정 기산일(상속·이월과세 반영) |
| | 본인 소유 | 구주택이 본인 소유가 아니던 기간은 통산하지 않는다(서면법규과-944). 입력은 본인 소유 구주택으로 한정하고 안내 |
| | 사유 필드 | 노후·소실 사유 필드 없음 |
| | 비과세·장특 | 비과세 보유기간(영 §154⑧)·장특 통산은 이번 범위 밖(고지만) |
| | 확장 적용 | 통산 1~2년·1년 미만 구간도 확장 적용하되 「0097은 2년 이상만 직접 판단」 확인 필요 고지 |

### 9.1 Do(엔진 단계) 구현 결과 요약

- 엔진 입력 `TransferTaxInput.landRebuildPriorHouse?: { startMode: "since_land" | "later"; priorHouseStartDate?: Date; demolitionDate: Date; footprintUnchanged: boolean }`.
- `resolveAppurtenantLandRateBasisDate`(`transfer-tax-appurtenant-land.ts`)에 통산 분기 — 입력이 유효하면 등가 기산일 E를 돌려준다. 입력이 없으면 현행 `max` 그대로(나대지·상가 철거 (7) 계열 불변 — 격자 1,024건 전수 동일 실측).
- 결과 echo `SplitPartResult.rateHoldingAggregation`(토지 파트) · 고지(확인 필요) · `splitRateBasisNote` 문구.
- **등가 기산일 방식 재검증(격자)**: `E = (양도일+1일) − M개월`(UTC 달력, 해당일 없으면 말일)로 두면 양도일 2010-01-01~2026-05(6,000일) × M 0~150 = 906,000건에서 `calculateHoldingPeriod(E, 양도일)` 개월 = M, **불일치 0**(TZ = UTC · Asia/Seoul). America/Los_Angeles에서는 date-fns 변형 9,945건·UTC 변형 397건 불일치가 났는데, 이는 `calculateHoldingPeriod` 자체의 TZ 의존(`differenceInYears`·`addDays`는 로컬 시간)이며 이 기능과 무관하다 — 그래서 ±3일 안에서 정확히 M이 되는 날을 확인하는 보정 루프를 두었다(없으면 throw).
- Q-10 인용: 「사전-2021-법규재산-1231」은 **조심 2024인3140 처분청 의견이 그렇게 적은 것**이다(재결 본문 대조). 국세청 상세 페이지에서 그 날짜·주제(기재부 재산세제과-1354 인용, 나대지 위 주택 신축 단기양도)에 해당하는 문서는 **사전-2021-법규재산-1232[법규과-3119](2022.10.31.)** 이고 1231은 조회되지 않았다 → 코드 주석 2곳을 1232로 정정하고 조심 인용이 「1231」임을 병기했다(1231이 별개 문서로 존재할 가능성은 배제하지 못함 — 확인 필요).

### 9.2 추가 결정 — 매매 호스트 (2026-10-19, 재론 금지)

UI 단계에서 실측으로 발견: 통산 입력이 «건물 신축 + 토지 상속·증여» 호스트(`LandPartCauseBlock`)에서만 열리고 엔진 leaf도 건물 원인이 `newConstruction`이 아니면 거부했다. 이 앱에서 **«매수한 토지 + 그 위에 신축한 주택»의 관례 입력 경로는 취득원인 「매매」 + 「토지·건물 취득일 다름」 칩(원시취득·신축 등)** 이고, 이 계획서 §1의 대표 사례(서면법규과-1222: 토지 매수 → 구주택 멸실 → 신축 → 단기 양도)가 바로 그 경로로 들어온다.

| 결정 | 내용 |
|---|---|
| 호스트 2곳 | ① 건물 신축 + 「토지는 다른 원인으로 취득」(기존) ② **취득원인 매매 + 「토지·건물 취득일 다름」 + 토지 상속·증여 overlay 없음**(신규). 신축 경로에 매수 토지 칸을 새로 만드는 안은 **기각** |
| 매매 호스트 배제 | 토지 overlay 켬(건물은 매수·토지는 상속·증여 — 건물을 산 것이지 신축이 아님) · D2 · 소유자 분리 · 부담부증여 · 겸용 · 컴패니언 · 첫 자산 아님 |
| 엔진 | 같은 leaf가 건물 원인 `purchase`(토지 취득일 분리 존재)를 받는다 — 건물 취득일 = 신축 건물 취득일. 상속·증여·이월과세 건물 원인은 계속 거부. `LAND_REBUILD_BUILDING_CAUSE_MESSAGE`를 새 범위로 고침 |
| 건물 취득일 안내 | 매매 경로에서는 「건물 취득일」 칸에 신축 주택의 취득일(자기가 건설한 건축물의 취득시기 — 영 §162①4호: 사용승인서 교부일, 그 전 사실상 사용·임시사용승인 시 빠른 날) |
| 문서 | UI 설계서 §1 R-5·§1.1(매매 하위 모드 상호작용 실측 포함) · 엔진 설계서 §2.2 |

§2.4 «사용자가 오늘 (5)를 입력하는 방법»의 경로 A(split)는 이제 신축 호스트와 매매 호스트 두 입력 경로를 모두 가진다.

