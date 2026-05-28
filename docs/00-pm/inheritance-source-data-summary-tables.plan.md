# 상속개시자료 요약 4표 — 결과 화면 출력 계획서

> **목표**: 사용자가 입력한 원시 상속개시자료(이미지 29~31의 서술형 케이스)를, 교재 모범답안(이미지 32~35)과 동일한 4종 요약표로 결과 화면에 자동 출력한다. **신규 입력 0건** — 이미 엔진/스토어에 보유 중인 데이터를 결과 뷰에서 재구성한다.
>
> **현황**: 결과 뷰 `components/calc/results/InheritanceTaxResultView.tsx` (779줄, 분할 임박). props에 `estateItems` · `debtItems` · `priorGifts`가 이미 흐른다. `presumedItems`는 props 미전달 — 신규 추가 필요.
>
> **11단계 검토 결과 (2026-05-28)**: 실측 5건 정정 반영. 핵심: ① `EstateItem.valuationMethod` enum 부재 → 신규 필드 의무화. ② `DebtCategory`는 4분류(financial/tax/personal/funeral)이며 필드명은 `category`. ③ 부동산 면적(`areaSqm`) 미보유 → 신규 필드. ④ presumed 1Y/2Y 분리 echo 불필요(input 직접 사용). ⑤ Table C 와 기존 `DebtAllocationResultCard` 표시 정책 분리 명문화.
>
> **DoD**: 4표 모두 결과 화면 최상단 "상속개시자료 요약" 섹션에서 모범답안 행/합계/안분치와 1:1 일치. anchor ≥ 4건 (표당 1건) + e2e 1건.

---

## 1. 산출물 (표 4종)

이미지 32~35를 그대로 재현. 단위: 원(KRW), `formatKRW` 사용. 헤더의 "(상속개시일 : YYYY.M.D)"는 `deathDate` echo.

### Table A — 상속재산의 협의분할 내역 (이미지 32~33)
- **컬럼**: 재산분류 · 적요 · 수량(면적) · 평가금액 · 배우자(갑) · 장남(을) · 차남(병) · 수유자(손녀,정) · 비고(시가/기준시가/매매사례가액/감정가액)
- **행 구조** (소계 행 강제):
  - 예금 (2행 + 소계)
  - 부동산 (5행 + 소계: 아파트·임야·농지·공장건물·공장부지)
  - 주식 (2행 + 소계: 상장·비상장)
  - 기타자산 (9행 + 소계: 회원권·차량·전세보증금·현금·공탁금·골동품·채권·급여·퇴직금·보험금)
  - **상속재산 합계**
- **데이터 출처**: `estateItems[]` 실측 보유 필드 (`category` · `name` · `marketValue?` · `standardPrice?` · `appraisedValue?` · `listedStockShares?` · `heirAllocations[]`).
- **신규 필드 2종 (코드 실측 결과 부재 확인 — C1·C3 정정)**:
  - `EstateItem.valuationMethod?: "market" | "sale_comparable" | "standard" | "appraisal"` — 비고 열 단일 도출.
    - 미입력 시 fallback 우선순위: `marketValue>0 → "시가"` / `appraisedValue>0 → "감정가액"` / `standardPrice>0 → "기준시가"`. "매매사례가액"은 사용자 명시 입력만.
  - `EstateItem.areaSqm?: number` — 부동산 면적. 카테고리별 quantity formatter:
    - `listed_stock`/`unlisted_stock` → `${listedStockShares ?? unlistedStockData.shares}주`
    - `real_estate_*` → `${areaSqm}㎡`
    - `cash`/`financial`/`deposit` → 빈칸
    - `other` → 사용자 입력 수량 (별도 필드 또는 description 파싱 — Pre-Do 검증)
- **14지점 동기화 의무**: 2종 신규 필드 모두 입력 폼 ①~⑭ 전수 적용.

### Table B — 과세가액 가산 추정상속재산 요약 (이미지 33~34)
- **컬럼**: 재산종류별 · 세부내용 · 소명대상 금액(1년 이내/2년 이내/소계) · 사용처 확인금액 · 소명비율(%) · 기준금액(Min(처분액×20%, 2억)) · 과세가액 산입액
- **행**: 부동산 및 부동산 권리(개별 + 소계) · 예금 · 기타자산 · 금융기관 채무 · 합계
- **하단**: 가산 산식 echo (㉠ 미소명액 = 처분액 − 사용처확인액 / ㉡ 추정상속재산 = 미소명액 − Min(×20%, 2억))
- **출처 (C4 정정 — 실측: 엔진 확장 불필요)**:
  - **input 직접**: `PresumedInheritanceItem.amountWithin1Y` / `amountWithin2Y` / `verifiedUseAmount` (1Y·2Y 분할은 input 그대로 echo)
  - **engine result**: `PresumedInheritanceItemResult.thresholdTriggered`·`scrutinyAmount`·`unverifiedAmount`·`baseDeduction`·`addedAmount` (perRow 모두 echo 완비)
  - 소명비율(%) = `verifiedUseAmount / scrutinyAmount × 100` UI 도출
- **신규 props**: `InheritanceTaxResultView`에 `presumedItems?: PresumedInheritanceItem[]` 추가 (현재 props 미전달 — 코드 실측 확인). 엔진 result는 `result.presumedInheritanceDetail.items[]`에서 join.
- **상속추정의 배제** 기준 박스(상증법 집행기준 15-11-6) 정적 영역 1개.

### Table C — 채무 등의 협의분할 내역 (이미지 35 상단)
- **컬럼**: 구분 · 채권자 주소 등 · 채권자등 · 금액 · 배우자 · 장남 · 차남 · 수유자(손녀) · 비고(YYYY.M.D. 발생 / 식대 등)
- **행 그룹화 (C2 정정 — 실측 4분류)**: 금융채무(`financial`) + 공과금(`tax`) + 사적채무(`personal`) + 장례비(`funeral`). 각 그룹 N건 + 소계 + **합계**.
- **출처**: `debtItems[]` 실측 필드 — `category`(DebtCategory 4종) · `name`(채권자등) · `amount` · `heirAllocations[]` · `isBongan?`(장례비 한도 분기)
- **결손 필드 (Pre-Do 검증 D-1)**: 채권자 주소 (`address`/`creditorAddress`) · 발생일 (`incurredDate`) — 실측 미존재 시 신규 optional 필드 추가 또는 description 활용 정책 결정.
- **C5 모순 차단 — 표시 정책 분리 명문화**:
  - 기존 `DebtAllocationResultCard`: 상속인별 안분 결과 강조 (변제액 합계, 영리법인 면제 영향 등 계산 결과 중심).
  - 신규 Table C: 원시 협의분할 내역 (채권자·발생일·메모 등 입력 데이터의 표 재현).
  - 두 카드 동시 표시 허용. 결과뷰 mount 순서: ① Table C (상단 자료 요약) → ... → ⑦ DebtAllocationResultCard (안분 결과).

### Table D — 사전증여 요약 (이미지 35 하단)
- **컬럼**: 관계 · 증여일시 · 증여물건 · 세부내역 · 증여재산가액 · 증여재산공제 · 증여세 과세표준 · 증여세 산출세액 · 비고
- **행**: priorGifts 각 1행 + 소계
- **출처**: `priorGifts[]` + 엔진의 사전증여 합산 detail (`priorGiftAggregated`·관계별 공제·산출세액 echo)
- 영리법인 대여금 채무면제 사례(이미지 31의 M사 7억) — `relationKind: "corporate"` 분기 라벨 처리.

---

## 2. 데이터 가용성 사전 검증 (Pre-Do 필수 — [[feedback_pre_anchor_verification]])

**가정 단정 금지**. Do 진입 전 anchor 실행으로 확인할 것:

| 항목 | 실측 결과 (2026-05-28) | 조치 |
|---|---|---|
| A-1 `EstateItem.valuationMethod` enum | ❌ **부재**. `marketValue`/`standardPrice`/`appraisedValue` 3개 필드만 존재. "시가" vs "매매사례가액" 구분 불가 | **신규 enum 필드 추가** + 14지점 동기화 (의무) |
| A-2 `EstateItem.areaSqm` 부동산 면적 | ❌ **부재**. 위치 코드(EstateLocationFields)만 보유 | **신규 필드 추가** + 카테고리별 quantity formatter |
| A-3 기타자산 수량 (골동품 점수 등) | ❌ **부재 확인 (2026-05-28 실측)**. `quantity`/`count` 0 hit. `listedStockShares`(주식만) 외 일반 수량 필드 없음 | **신규 필드 `quantityCount?: number` 추가** (description 파싱은 비추) |
| B-1 `presumedItems` props 전달 | ❌ **현재 미전달**. props에 `estateItems`·`debtItems`·`priorGifts`만 있음 | 결과뷰 props 1개 추가 |
| B-2 엔진 perRow echo | ✅ **완비**. `PresumedInheritanceItemResult.{thresholdTriggered, scrutinyAmount, unverifiedAmount, baseDeduction, addedAmount}` 모두 존재. 1Y/2Y는 input 직접 사용 | 엔진 변경 0건 |
| C-1 `DebtItem` 구조 | ✅ 실측 — `category: DebtCategory(4종)` · `name` · `amount` · `isBongan?` · `heirAllocations[]` · `isFinancialDebtForDeduction?` | 4분류 반영 (financial/tax/personal/funeral) |
| C-2 채권자 주소·발생일 필드 | ❌ **부재 확인 (2026-05-28 실측)**. DebtItem 7필드만(id·category·name·amount·isBongan·heirAllocations·isFinancialDebtForDeduction). 주소·발생일 0 hit | **신규 필드 2종 추가**: `creditorAddress?: string` · `incurredDate?: string` (Table C 비고 열 표시용) |
| D-1 priorGift perRow 산출세액 echo | ✅ **완비 확인 (2026-05-28 실측)**. `PriorGift.computedTax?` (L32) input 보유 + `PriorGiftCreditDetail`·`ComputedDetail` 결과 echo 완비 | **엔진 변경 0건**. Table D는 input `computedTax` 직접 echo |
| D-2 PriorGift `beneficiaryType` 영리법인 분기 | ✅ **완비 확인 (2026-05-28 실측)**. `beneficiaryType?: "heir"\|"legatee"\|"corporate"` (L48) 3종 enum + `corporateGiftComputedTax?` 영리법인 전용 필드. UI 기활용 (InheritanceSidebar L78) | **엔진 변경 0건**. 라벨 매핑 헬퍼만 (`beneficiaryType + doneeRelation` 결합으로 "영리법인"/"배우자"/"장남") |

**Pre-Do anchor 1건 (필수)**: 이미지 32 첫 데이터행 "○○은행 예금 11억 → 배우자 1,100,000,000" 정확히 출력되는지 RTL anchor. 실패 확보 후 진입.

---

## 3. 구현 단계 (PDCA)

### Plan (이 문서)
- ✅ 산출 표 4종 컬럼/행 동결
- ⚠️ 데이터 가용성 §2 6항목 사전 검증 — Do 진입 전 필수

### Design (`docs/02-design/features/inheritance-source-data-summary.ui.design.md`)
- 표 4종 컴포넌트 모듈 분리:
  ```
  components/calc/results/source-summary/
    SourceDataSummarySection.tsx         (orchestrator, 4표 묶음 + deathDate echo)
    EstateAllocationTable.tsx            (Table A)
    PresumedInheritanceTable.tsx         (Table B)
    DebtAllocationTable.tsx              (Table C — 기존 DebtAllocationResultCard와 별개의 "원시 협의분할 표")
    PriorGiftSummaryTable.tsx            (Table D)
    source-summary-constants.ts          (카테고리 그룹 순서·라벨·시가 표기 enum)
    source-summary-helpers.ts            (소계/합계 reducer — floor 잔액 흡수 [[feedback_floor_residual_absorption]])
  ```
- **800줄 정책 사전 충족** — InheritanceTaxResultView는 신규 1줄 import + 1줄 mount만 추가. 표 4종 모두 외부 모듈.
- **macOS 가로 스크롤** — `HorizontalScrollContainer` 강제 ([[feedback_macos_scrollbar_autohide_workaround]])
- **케이스 인벤토리 행 ≥ 1 필수** (Do 진입 게이트)

### Do — 시퀀셜 위임 (11단계 검토 반영)
1. **엔진 시니어 (`inheritance-gift-tax-senior`)**:
   - **신규 타입 필드 4종** (의무): `EstateItem.valuationMethod?`·`EstateItem.areaSqm?` + (검증 결과에 따라) `DebtItem.creditorAddress?`·`DebtItem.incurredDate?`
   - **(C6 검증 결과)** priorGift perRow 산출세액 echo 누락 시 `gift-prior-aggregation.ts` return 확장 (산식 0 변경)
   - result 타입 변경 시 14지점 전수 점검 (특히 ⑫⑬⑭ TS 미감지 strip 위험)
2. **UI 시니어 (`inheritance-gift-tax-ui-senior`)**:
   - 표 4종 신규 컴포넌트 + `InheritanceTaxResultView` mount + 소계/합계 helper
   - 신규 필드 2~4종 입력 위젯 추가 (자산-수준 카드 + 채무 카드 입력 폼)
   - props 추가: `presumedItems` (신규)
   - 기존 `DebtAllocationResultCard`와 표시 순서·역할 분리 명문화 코드 주석

### Check
- `ui-engine-sync-checker` (read-only 14지점)
- anchor 4 + e2e 1
- 모범답안 수치 일치 검증 (이미지 32~35 행별 toBe)

### Act
- `docs/00-pm/recent-completions.md` 업데이트
- memory `project_inheritance_source_data_summary_tables.md` + MEMORY.md 인덱스 1줄

---

## 4. 케이스 인벤토리 (모범답안 일치 anchor — Do 게이트)

이미지 32~35의 합계/소계 수치를 정수 anchor로 동결:

| # | 표 | 행 | 평가금액 | 배우자 | 장남 | 차남 | 수유자 |
|---|---|---|---:|---:|---:|---:|---:|
| A-1 | A | 예금 소계 | 2,100,000,000 | 1,100,000,000 | 500,000,000 | — | 500,000,000 |
| A-2 | A | 부동산 소계 | 3,530,000,000 | 1,650,000,000 | 450,000,000 | 1,430,000,000 | — |
| A-3 | A | 주식 소계 | 650,000,000 | 150,000,000 | — | 500,000,000 | — |
| A-4 | A | 기타자산 소계 | 400,000,000 | 400,000,000 | — | — | — |
| A-5 | A | 상속재산 합계 | 6,680,000,000 | 3,300,000,000 | 950,000,000 | 1,930,000,000 | 500,000,000 |
| A-6 | A | (추정상속 포함) 총계 | 7,030,000,000 | 3,450,000,000 | 1,050,000,000 | 2,030,000,000 | 500,000,000 |
| B-1 | B | 부동산권리 산입액 | 108,000,000 | — | — | — | — |
| B-2 | B | 예금 산입액 | 100,000,000 | — | — | — | — |
| B-3 | B | 금융기관채무 산입액 | 142,000,000 | — | — | — | — |
| B-4 | B | 합계 산입액 | 350,000,000 | — | — | — | — |
| C-1 | C | 금융채무 소계 | 1,145,000,000 | 500,000,000 | 400,000,000 | 245,000,000 | — |
| C-2 | C | 합계 | 1,215,000,000 | 515,000,000 | 400,000,000 | 300,000,000 | — |
| D-1 | D | 사전증여 소계 증여재산가액 | 2,960,000,000 | — | — | — | — |
| D-2 | D | 사전증여 소계 산출세액 | 592,000,000 | — | — | — | — |

(추정상속 총계 합 130,000,000 차이 = 영리법인 M사 채무면제 700,000,000 가산 위치는 표 D 사전증여로 분류 — 모범답안 처리와 일치 확인 필요)

---

## 5. 위험 / 사전 차단

| # | 위험 | 차단 |
|---|---|---|
| R-1 | EstateItem 면적/주수 등 단위가 카테고리마다 다른데 단일 "수량(면적)" 열로 통합 | 카테고리별 formatter (`주식→N주`, `부동산→N㎡`, `골동품→N`) helper |
| R-2 | 모범답안 비고 열 ("시가"/"기준시가"/"매매사례가액") 출처 데이터 미존재 | §2 A-1 사전 검증. 없으면 EstateItem에 `valuationMethod` enum 추가 (14지점 동기화) |
| R-3 | 추정상속재산 표 (B)의 1년이내/2년이내 분할 표시가 엔진 detail에 echo 안 됨 | §2 B-2 검증. echo만 추가 (산식 0 변경) |
| R-4 | 사전증여 표 (D)의 "관계" 컬럼이 자녀/배우자/영리법인 enum 매핑 누락 | 기존 priorGift `relationKind` 재사용 + 라벨 매핑 |
| R-5 | InheritanceTaxResultView 800줄 임박 (현재 779) | 신규 코드는 100% 외부 모듈. mount 1~2줄만 추가 |
| R-6 | floor 안분 잔액 ±1원 | [[feedback_floor_residual_absorption]] — 마지막 컬럼 raw−Σfloor(others) |
| R-7 | "상속개시자료 요약"이라는 표제 위치 — 결과뷰 최상단? 모범답안과 일치하려면 결과 카드들보다 **위** | 결과뷰 첫 섹션으로 mount. 토글로 접을 수 있게 (`<details>` 또는 ToggleCard) — 기존 사용자 경험 보존 |
| **R-8** | **신규 필드(`valuationMethod`·`areaSqm` 등) 14지점 누락 시 침묵 strip** ([[feedback_explicit_prop_mapping_strip]]·[[feedback_api_zod_schema_sync]]) | Do 진입 전 14지점 self-grep checklist + ⑫⑬⑭ TS 미감지 위험 명시. 신규 필드별 entry/exit 5단 파이프라인 전수 |
| **R-9** | **신규 필드 입력 위젯 UX 부담** — 사용자가 자산마다 "시가/매매사례가/기준시가/감정가액" 라디오 추가 선택 강제 | 자동 fallback(우선순위) + override 토글 패턴. EstateItem 입력 폼 카드에 `RadioCardGroup` (활성 우선·default=auto) 신설 |
| **R-10** | **Table C와 기존 `DebtAllocationResultCard` 중복 우려 (C5)** | 두 카드 역할 분리 명문화: Table C=원시 자료 echo / 기존 카드=안분 계산 결과 강조. 결과뷰 mount 순서 코드 주석 명시 |

---

## 6. 정책 인용

- [[feedback_pre_anchor_verification]] — §2 가용성 검증 1건 우선 실행
- [[feedback_pdf_table_row_one_to_one_mapping]] — 행 번호 ↔ 변수명 1:1 (case 인벤토리 #1~#14)
- [[feedback_floor_residual_absorption]] — 안분 잔액 흡수
- [[feedback_macos_scrollbar_autohide_workaround]] — 가로 스크롤
- [[feedback_no_won_suffix]] — 표 셀 "원" 생략
- [[feedback_engine_result_map_json_loss]] — 엔진 echo 확장 시 Record 사용 (Map 금지)
- [[feedback_explicit_prop_mapping_strip]] — 신규 props는 spread 우선 + grep
- [[project_besshi_result_view_integration]] 패턴 재사용 — estateItems만 받는 순수 섹션을 결과뷰 1줄로 mount

---

## 7. 다음 액션 (2026-05-28 잔여 4항목 검증 완료 후 확정)

**신규 필드 의무 (실측 확정)** — 총 **5종**:
1. `EstateItem.valuationMethod?: "market" | "sale_comparable" | "standard" | "appraisal"` (C1)
2. `EstateItem.areaSqm?: number` (C3)
3. `EstateItem.quantityCount?: number` (A-3)
4. `DebtItem.creditorAddress?: string` (C-2)
5. `DebtItem.incurredDate?: string` (C-2)

**엔진 변경 0건 확정**: presumed (C4) · priorGift perRow 산출세액 (D-1) · `beneficiaryType` enum (D-2) 모두 기존 필드 활용.

**액션 순서**:
1. **Design 문서** 작성 (`docs/02-design/features/inheritance-source-data-summary.ui.design.md`)
   - 신규 필드 5종 입력 UX 패턴 (RadioCardGroup + 자동 fallback) 사전 동결
   - 14지점 매트릭스 신규 필드별 행 사전 enumerate
   - 신규 필드 2~4종 입력 UX 패턴 (RadioCardGroup + 자동 fallback) 사전 동결
   - 14지점 매트릭스 신규 필드별 행 사전 enumerate
3. **Plan/Design 병렬 시니어** — 엔진+UI 시니어 단일 메시지 호출로 케이스 인벤토리/14지점 매트릭스 사전 작성
4. Do 시퀀셜 (엔진 신규 타입 필드 → API/Zod → UI 입력 위젯 → 결과 표 4종)
5. **Pre-Do anchor 1건 의무** ([[feedback_pre_anchor_verification]]): 이미지 32 첫 행 "○○은행 예금 11억 → 배우자 1,100,000,000" RTL anchor 실패 확보 후 진입

---

## 8. 11단계 검토 이력 (2026-05-28)

| 단계 | 산출 |
|---|---|
| 1·2 | 이미지 29~35 + 계획서 v1 재정독 |
| 3 | 코드 실측 — `lib/tax-engine/types/inheritance-gift.types.ts` L75~595 |
| 4 | 1차 검토 — 사실관계 5건(C1~C5) 발견 |
| 5 | 1차 정정 — 본 문서 §1·§2 정정 |
| 6 | 2차 검토 — 누락 4건 (R-8·R-9·R-10·priorGift D-1/D-2 검증) |
| 7 | 2차 정정 — §2 행 확장, §5 R-8~R-10 추가, §3 Do 신규 필드 명시 |
| 8 | 디자인 1차 — 표 A 컬럼/quantity·valuationMethod 도출 정책 동결 |
| 9 | 디자인 2차 — Data flow 매트릭스 표 4종 × 엔진/UI/14지점 영향 |
| 10 | 통합 비교 — 모범답안 수치 anchor V1~V8 검증 (전 정합) |
| 11 | 우선순위 — P0(C1·C2·C3) → P1(C4·C5·R-8·R-9·R-10) → P2(C6·D-2) |

**핵심 변경 요약**: "신규 입력 0건" 가정 **무효화** — 코드 실측 결과 신규 EstateItem/DebtItem 필드 2~4종 추가 의무. 14지점 동기화 부담 명시. 엔진 산식 변경은 여전히 0건 (echo만).
