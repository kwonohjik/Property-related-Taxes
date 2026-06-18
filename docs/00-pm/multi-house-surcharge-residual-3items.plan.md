# 다주택 중과 — 잔여 3항목 구현 계획서

> #1 인구감소지역/관심지역 데이터+판정로직 정정 · #2 부칙 양도일 세율 분기 · #3 폴리시 후속(신축/미분양 validation)
> 선행 완결: [[project_transfer_multi_house_gaps]] (#0~#4·#2a·#2b·§154①·동일시군구 다라목2호·Phase2 분양권).
> 작성일 2026-06-18. **개정 2026-06-18(자가검토 9건 반영)**.

## ⚠️ 개정 사유 (자가검토 발견 — 초안 오류·누락 9건)
- **O-1 [치명]** 라목(관심지역) 자동판정 경로 **코드에 부재**: `POPULATION_INTEREST_AREA_CODES`는 `multi-house-surcharge.ts:80` import·재수출만, 판정 미사용. `classifyPopulationDeclineArea`는 DECLINE set만 본다 → set 보강만으론 라목 작동 안 함. **판정 로직 추가 필수**.
- **N-6 [치명]** `populationAreaType`(다목 9억/라목 4억 구분) regionCode 자동판정 시 미도출 → 다목 수도권밖 9억 지역이 4억으로 과소(과대과세).
- **M-9** `classifyPopulationDeclineArea` `priceLimit:9억` 고정은 `count.ts`에서 미사용(dead/dual-truth). popCap이 별도 계산.
- **N-5** 코드체계 전수 정정 필요: 강원 42→51·전북 45→52(특별자치도)·시군구 뒷자리 부정확. `house.regionCode`=법정동코드(PNU, 부산26). `sigungu-codes.ts`≠법정동(부산21). 단일소스=`regulated-areas.ts`.
- **O-3** #1은 "데이터-only 빠름" 아님 → **데이터 전수정정 + 판정로직 변경** 중간규모.
- **O-4/N-7/N-8** #3 validate 라인 추정(미검증)·#2 2018.4.1 이전 중과미적용 분기 누락·§104 부칙 KoreanLaw 미검증.
- (O-2 D4 anchor·D 케이스는 §1.4에서 정정)

---

## 항목 #1 — 인구감소지역/관심지역 데이터 보강 🟡 (실질 갭, numeric 영향)

### 1.1 법령 (소령 §167의3①12, KoreanLaw MST286211 실측)
- **다목 1호**: 인구감소지역(지방분권균형발전법 §2 12호) 소재. **단 수도권(접경지역 아닌 지역) 또는 광역시(군 제외) 제외** → 수도권이라도 **접경지역이면 포함**, 광역시 자치구는 제외(광역시의 군은 가능).
- **다목 3호**: 기준시가 4억(**수도권 밖 인구감소지역 9억**) 이하.
- **라목 1호**: 수도권 밖 + 인구감소관심지역(§2 12호의2). 광역시(군 제외) 제외. (접경지역 예외 없음)
- **라목 3호**: 기준시가 4억 이하.

### 1.2 현재 상태 (실측)
| 데이터 | 위치 | 현황 | 행안부 고시 |
|---|---|---|---|
| 인구감소지역(다목) | `data/population-decline-areas.ts:11~` `POPULATION_DECLINE_AREA_CODES` | 도(道) 78곳(+관심중복4=82행) | **89곳** |
| 관심지역(라목) | 동 `POPULATION_INTEREST_AREA_CODES` | **4곳만** | **18곳** |
| 시군구 판정 | `classifyPopulationDeclineArea()` 동 120 | `substring(0,5)` set 포함 여부 | — |

**누락 확정**:
- 다목: **수도권 접경 인구감소지역**(인천 강화 `28710`·옹진 `28720`, 경기 연천 `41800`·가평 `41820`) 전부 미수록 → 이 4곳 세컨드홈이 인구감소지역 판정 실패(**과대과세**). + 도 지역 89 대비 누락분 점검.
- 라목: 관심지역 18곳 중 4곳만 → **14곳 누락**(라목 특례 대량 미작동).
- 광역시 자치구(부산 동구·서구·영도구, 대구 남구·서구): 인구감소지역이나 **법령상 다·라목 제외** → set 미수록 유지가 정답(추가 금지).

### 1.3 설계 (데이터 + 판정로직 — 개정)

**(가) 출처·코드체계 확정 [Do 선행, 추정 금지]**
1. **Vworld PNU 시도코드 확정**: dev에서 강원/전북 주소 검색 → `house.regionCode`(PNU 앞5)가 강원 42 vs **51**, 전북 45 vs **52** 어느 쪽인지 실측. (강원특별자치도 2023.6·전북 2024.1 출범으로 법정동 51/52로 변경 — WebSearch 확인됨, but Vworld 갱신 여부 실측 필수)
2. **현행 법정동 시군구코드 전수 확보**: 인구감소 89곳·관심 18곳·접경지역 별표를 공식 출처(공공데이터포털 법정동 CSV / code.go.kr / `regulated-areas.ts` 대조)로 5자리 매핑.

**(나) 데이터 전수 정정** `population-decline-areas.ts`
3. **DECLINE set 전수 재작성**: 강원(42→51)·전북(45→52) 시도코드 정정 + 시군구 뒷자리 법정동 정합(예 삼척 42150→51230 확인) + 수도권 접경 4곳(강화·옹진·연천·가평) 추가. 광역시 자치구는 제외(법령).
4. **INTEREST set 전수**: 관심지역 18곳(현 4곳) 법정동코드.

**(다) 판정 로직 추가 [O-1·N-6·M-9 해소 — 데이터-only 아님]**
5. **`classifyPopulationDeclineArea` 확장**: 반환을 `{ kind: "decline"|"interest"|null }`로 변경(또는 INTEREST set도 검사). `priceLimit` 9억 고정값 **제거**(M-9 dead). 다목/라목 구분 반환.
6. **count.ts isPopDecline 경로**: 자동판정 시 classify 결과의 kind로 **`populationAreaType` 도출**(decline→9억 게이트, interest→4억). 현재 `populationAreaType` 입력값에만 의존 → 자동판정 시 미설정이면 9억 손실(N-6). classify kind를 popCap 분기에 직접 사용하도록 수정.
7. **popCap 정합**: 다목=수도권밖 9억/수도권(접경) 4억, 라목=4억. region(capital/non_capital) + kind 조합으로 결정. dual-truth 회피(classify kind 단일 진실).

### 1.4 케이스 매트릭스 (anchor — 개정)
> 코드는 §1.3-가 확정 후 확정. 아래는 **체계 확정 전 placeholder**(시도코드 XX=실측값).
| # | 지역 | region | populationAreaType 경로 | 기대 |
|---|---|---|---|---|
| D1 | 수도권밖 인구감소(다목) 9억↓, regionCode 자동 | non_capital | 자동(classify→decline) | 배제 — **현재 자동 시 4억게이트로 9억 과소(N-6 버그)** |
| D2 | 동 9억 초과 | non_capital | decline | 산입(한도 초과) |
| D3 | 수도권 접경(강화) 4억↓ | capital | decline(접경도 다목) | 배제 |
| D4 | 관심지역(라목) 4억↓, regionCode 자동 | non_capital | 자동(classify→interest) | 배제 — **현재 라목 판정 부재로 산입(O-1 버그)** |
| D5 | 관심지역 4억 초과 | non_capital | interest | 산입 |
| D6 | 광역시 자치구(부산 동구) | — | — | 산입(법령 제외, 회귀) |
| D7 | 강원 시군 정정코드(51xxx) 세컨드홈 | non_capital | decline | 배제(코드체계 정정 검증) |

### 1.5 14지점
입력 필드 0(데이터+엔진 판정 로직) — UI/API/Zod ①~⑭ N/A. **단 classify 시그니처 변경 → 호출부(count.ts) 동기화·anchor 필수**.

### 1.6 우선순위·규모: **높음(numeric 갭) · 중간 규모** — 데이터 전수정정 + 판정로직 변경 + 코드체계 실측. "데이터-only 빠름" 아님(초안 정정).

---

## 항목 #2 — 부칙 양도일 세율 분기 ⚪ (스코프/비용 분석 → 보류 권고)

### 2.1 정의 (연혁 — ⚠️ KoreanLaw 미검증, Do 선행 확인 필수)
다주택 중과세율의 **양도일별 부칙 경과규정**. 아래 연혁은 **추정**이며 §104①·⑦ + 부칙을 KoreanLaw로 **축자 검증 후 확정**([[feedback_transfer_year_tax_rate]]·[[feedback_korean_law_82_vs_81_2_drift]]):
- ~2018.3.31: **중과 미적용**(제도 시행 전) → `surchargeApplicable=false` 분기 필요 (N-7, 초안 누락)
- 2018.4.1: 2주택 +10%p / 3주택+ +20%p (추정)
- 2021.6.1: 2주택 +20%p / 3주택+ +30%p (강화, 현행 — 추정)
- 2022.5.10~2026.5.9: 한시 유예

### 2.2 현재 상태 (실측)
- 중과세율 **현행 고정**: `multi-house-surcharge.ts:346-349` `SURCHARGE_ADDON_RATES = { multi_house_2: 0.20, multi_house_3plus: 0.30 }` — 양도일 연도별 차등 없음.
- 유예: `isSurchargeSuspended`(`tax-utils.ts:297-316`) — `suspended_until="2026-05-09"` **blanket** 판정. 구간별 차등 유예(예: 시기별 유예율) 없음.
- 양도일(transferDate)은 **조정대상지역 시점 판정**(`multi-house-surcharge.ts:201`)·**유예 종료일 비교**·**보유기간 배제 판정**에 이미 정확히 사용 중.

### 2.3 갭
- 2021.5.31 **이전 양도분**의 구(舊) 세율(+10%/+20%) 미반영 — 현행(+20%/+30%)으로 계산.

### 2.4 구현 방안 — 역사 상수 분기 (DB 불필요, 초안 "DB 필요" 정정)
- 중과 가산율은 개정 없는 **확정 역사 데이터** → [[feedback_historical_tax_tables]] 정합: `lib/tax-engine/data/`에 양도일 구간별 상수 테이블 + `getSurchargeAddonRate(type, transferDate)` 헬퍼. **DB 세율 구조 변경 불요**(초안 오판 정정).
- `SURCHARGE_ADDON_RATES` 고정값(`multi-house-surcharge.ts:346`)을 헬퍼 호출로 교체.
- 2018.4.1 이전 양도분 `surchargeApplicable=false` 분기 추가(N-7).
- ⚠️ 단 **세율·시행일은 KoreanLaw §104 부칙 검증 후 확정**(§2.1).
- 우선순위: 낮음(과거 양도 빈도 극저). 단 구현 비용은 초안 평가보다 작음(상수 분기).

---

## 항목 #3 — 폴리시 후속

### 3.1 B-1: 신축/준공후미분양 특례 validation ⚪ (실질, 경미)
**현황**: `transfer-tax-validate.ts`·`transfer-tax-validate-asset.ts`에 신축/미분양 입력(isUnsoldNewHouse·completionDate·exclusiveArea·acquisitionPrice) 차단/경고 **없음**(Explore 실측). 미입력 시 엔진(`isSmallNewHouseSpecial`)이 falsy → 배제 미발동(특례 신청했으나 데이터 부족 시 침묵 미적용 = 납세자 불리).

**설계**:
- 신축/미분양 토글 ON인데 필수 필드(completionDate·exclusiveArea·acquisitionPrice) 미입력 시 **비차단 경고**("특례 적용하려면 X 입력 필요"). 차단 아님 — 계산 자체는 진행(자동 안분 fallback 금지 원칙과 별개, 특례는 선택 적용).
- 위치: ⚠️ **확인 필요** — `transfer-tax-validate.ts` 보유 주택 행별 검증부(초안 `145-150`은 Explore 추정, Do 시 실측 확정. O-4 정정) 또는 보유 단계 경고 수집부.
- ⑧ validation 지점만 영향. UI 통과↔validate 모순 없음(경고는 비차단).

**우선순위**: 낮음(UX 개선, numeric은 사용자 입력 누락 책임).

### 3.2 B-2: excludedPresaleRights 결과뷰 표기 ✅ (이미 완료 — 작업 불요)
- `MultiHouseSurchargeDetailCard.tsx:120-137`에서 이미 표시(혼인 §167의4⑤). reason은 `"spouse_marriage_subtraction"` 1종(`types:366`)으로 하드코딩 표시 정상.
- **결론**: 추가 작업 없음. 미래에 다른 reason 추가 시 분기 필요(현재 불요). 계획서에 완료로 기록.

---

## 권장 진행 순서
1. **#1 데이터+판정로직 정정** (높음 · numeric 갭 · 중간규모) — 코드체계 실측(§1.3-가) → 데이터 전수정정 + classify/count 로직(다·라목 구분·populationAreaType 자동도출) → anchor D1~D7. 독립 PR.
2. **#3-B1 신축/미분양 경고** (낮음 · 경미) — 단독 소형 PR(데이터와 독립이라 #1 선행 불요, 먼저 가능).
3. **#2 부칙 세율 분기** (낮음) — §104 부칙 KoreanLaw 검증 → 역사 상수 분기(DB 불요). population과 독립.

> #3-B2는 완료 확인됨(PR#244, 작업 없음).
> #2·#3-B1은 population 코드체계와 **독립** → #1 데이터 확보가 막혀도 먼저 진행 가능.

## Pre-Do Anchor (#1) — red 핵심 2건
`__tests__/tax-engine/multi-house-surcharge/depopulation-data.test.ts`:
- **D4 (O-1 라목 부재)**: 관심지역 regionCode 자동판정 세컨드홈 → 현재 산입(라목 판정 부재) red → classify 확장 후 배제 green.
- **D1 (N-6 9억 과소)**: 수도권밖 다목 9억↓ regionCode 자동판정(populationAreaType 미입력) → 현재 4억 게이트로 5억~9억 구간 산입 red → populationAreaType 자동도출 후 배제 green.
- D6(광역시 자치구 산입 회귀)·D7(강원 정정코드 51xxx 배제).

## 관련 메모리
[[project_transfer_multi_house_gaps]] · [[feedback_no_unfavorable_application_without_legal_basis]] · [[feedback_historical_statute_value_via_tribunal]] · [[feedback_transfer_year_tax_rate]] · [[feedback_pre_anchor_verification]]
