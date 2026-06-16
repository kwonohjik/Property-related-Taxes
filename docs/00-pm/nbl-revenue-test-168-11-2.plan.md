# 비사업용 토지 §168의11② 수입금액비율 — 풀 정확 구현 계획

> 브랜치 `feat/nbl-revenue-test` · NBL 갭 우선순위 3 (Medium). 기존 dead 스캐폴딩이 4축(업종·율·인용·기간모델) 모두 부정확 → 법령 검증 후 정확 재설계.
> 법령은 **KoreanLaw MCP로 본문 직접 검증**(2026-06-16, get_law_text). 관련: [[feedback_korean_law_citation_verify]]·[[project_transfer_nbl_gaps]]

## 0. 검증된 법령 (동결 — 추정 아님, 본문 실측)

### §168의11② (소득세법 시행령, mst 286211)
> ②제1항제2호 다목, 제10호, 제11호 다목 및 제12호의 규정을 적용함에 있어서 토지의 가액에 대한 1년간의 수입금액의 비율(이하 "수입금액비율")은 과세기간별로 계산하되, 다음 각 호의 비율 중 **큰 것**으로 한다.
> 1. 당해 과세기간의 연간수입금액 ÷ 당해 과세기간의 토지가액
> 2. (당해 + 직전 과세기간의 연간수입금액) ÷ (당해 + 직전 과세기간의 토지가액)

- **적용 대상(특정 호만)**: ①2호다목(주차장운영업)·10호(광천지)·11호다목(양어장 기타)·12호(블록·석물·토관제조·조경·화훼·학원·도소매). 체육시설(1호)·청소년수련(4호)·휴양업(6호)은 **면적기준**, 수입금액비율 아님.
- **④항 토지가액** = 당해 과세기간 종료일(양도 시 양도일)의 **기준시가**.
- **③항 연간수입금액** = 1과세기간 수입금액(전세보증금은 부가세령 §65① 환산·공통안분·1년미만 연환산) — **본 PR 범위 밖**(사용자 산정 입력).
- **판정 효과**: 비율 ≥ 율 → 해당 토지 사업용 인정(§104의3①4호다목 "사업 직접 관련"). 미달 → 비사업용.

### §83의4 (소득세법 시행규칙, mst 286379) — 율
| 호 | 업종 | 율 | 근거 |
|---|---|---|---|
| 2호다목 | 주차장운영업용 | **3%** | §83의4⑥ |
| 10호 | 광천지 | **4%** | §83의4⑬ |
| 11호다목 | 양어장·지소 기타 | **4%** | §83의4⑬ |
| 12호 | 블록·석물·토관 제조업용 | **20%** | §83의4⑮1 |
| 12호 | 조경작물식재·화훼판매시설업용 | **7%** | §83의4⑮2 |
| 12호 | 자동차·중장비 정비/운전 학원용 | **10%** | §83의4⑮3 |
| 12호 | 농업 학원용 | **7%** | §83의4⑮4 |
| 12호 | §83의4⑭ 도소매업용(블록·석물·토관·벽돌·콘크리트·옹기·철근·비철·플라스틱파이프·골재·조경작물·화훼·분재·농수축산물 도소매) | **10%** | §83의4⑮5 |

### 기존 스캐폴딩 오류 (전부 정정 대상)
- `NBL_REVENUE_THRESHOLDS`(legal-codes/transfer.ts:71-88): sports_facility·youth_facility·tourist_lodging·resort_business는 **수입금액비율 대상 아님**(면적기준). 율 10/7/3% ≠ 실제 3/4/20/7/10/7/10%. 인용 "§83의5" → 실제 **§83의4**(§83의5는 §168의14).
- `RevenueTestInput`(types.ts:242): 단일 기간(annualRevenue·landValue) → 법은 **2기간 max** 필요.

## 1. 정확 설계 (입력/판정)

### legal-codes (정정)
```
NblRevenueBusinessType = parking_operation | mineral_spring | fish_farm_other
  | block_stone_pipe_mfg | landscaping_floriculture | vehicle_repair_academy
  | agriculture_academy | wholesale_retail | none
NBL_REVENUE_THRESHOLDS: 0.03/0.04/0.04/0.20/0.07/0.10/0.07/0.10/0
NBL.REVENUE = "시행령 §168조의11 ② + 시행규칙 §83조의4"
```

### RevenueTestInput (2기간)
```
{ businessType, currentRevenue, currentLandValue, priorRevenue?, priorLandValue? }
```
직전 과세기간 미제공 시 비율2 생략(비율1만). 음수/0 토지가액 가드.

### RevenueTestResult
```
{ businessType, threshold, ratioCurrent, ratioCombined?, actualRatio(=max), pass, detail }
```

### 엔진 판정 (judgeOtherLand 신규 step)
- `o`(otherLand) + `input.revenueTest?.businessType !== "none"` 시:
  - ratioCurrent = currentRevenue / currentLandValue
  - ratioCombined = (prior 제공 시) (current+prior 수입)/(current+prior 토지가액)
  - actualRatio = max(ratioCurrent, ratioCombined ?? 0)
  - pass = actualRatio ≥ getNblRevenueThreshold(businessType)
  - pass → **buildPass(사업용)**; 미달 → 기존 종합합산/거주사업 경로 계속(비사업용 가능)
- 위치: Step 0(나대지) 이후, Step 3-1(재산세유형) **이전** — 특정 업종 사업용 우선.
- 결과 `revenueTestDetail` 노출(NonBusinessLandJudgment + CategoryJudgeResult).

## 2. 케이스 매트릭스

| # | businessType | current ratio | prior | actualRatio | 율 | 판정 |
|---|---|---|---|---|---|---|
| R0 | none/미제공 | — | — | — | — | revenue step skip(기존 경로) |
| R1 | parking_operation | 0.05 | 미제공 | 0.05 | 0.03 | ≥ → 사업용 |
| R2 | block_stone_pipe_mfg | 0.10 | 미제공 | 0.10 | 0.20 | < → 비사업용(기존 경로) |
| R3 | vehicle_repair_academy | 당해 0.08 / 합산 0.11 | 제공 | 0.11(max) | 0.10 | ≥ → 사업용(2기간 max로 전환) |
| R4 | agriculture_academy | 0.06 | 미제공 | 0.06 | 0.07 | < → 비사업용 |
| E1 | 임의 | landValue 0 | — | — | — | ⑧ validation 차단 |

## 3. 14 동기화 지점

| 지점 | 변경 |
|---|---|
| ① store | nblRevenueBusinessType·nblRevenueCurrentRevenue·CurrentLandValue·PriorRevenue·PriorLandValue |
| ② initial | NBL_DEFAULTS 동상 |
| ③ normalize | 무변경(확인) |
| ④ 매퍼 | buildOtherLand → revenueTest(2기간) |
| ⑤ UI | OtherLandDetailSection 업종 select + 4금액(business≠none 조건) |
| ⑥ 사이드바 | 무변경(판정) |
| ⑦ result | RevenueTestResult 카드(NonBusinessLandResultCard) |
| ⑧ validation | revenue 모드(업종≠none) 시 current 수입·토지가액 필수 |
| ⑨⑩⑫ Zod | nonBusinessLandRawSchema에 nblRevenue* + 업종 enum |
| ⑬ body | prefix-pick 자동 운반(nbl* 포함) |
| ⑭ route | mapAssetToNblInput 경유(무변경) |
| 엔진 | judgeOtherLand step + types + legal-codes |

## 4. Pre-Do Anchor
`__tests__/tax-engine/non-business-land/revenue-test.test.ts`: judgeOtherLand에 parking_operation(율3%) + 비율5% → 현재 비사업용(revenue 미판정), 구현 후 사업용. + 2기간 max(R3) + 미달(R2).

## 5. 게이트/Ship
tsc 0 · 전체 vitest · 변경파일 lint · E2E는 Anchor 충족 명시. 격리 worktree ship(PR).

## 부록 검증 근거
- §168의11②④: 소득세법 시행령 mst 286211 get_law_text 본문
- §83의4⑥⑬⑭⑮: 소득세법 시행규칙 mst 286379 get_law_text 본문
- 기존 오류: `lib/tax-engine/legal-codes/transfer.ts:71-88`·`types.ts:242-254,310`
