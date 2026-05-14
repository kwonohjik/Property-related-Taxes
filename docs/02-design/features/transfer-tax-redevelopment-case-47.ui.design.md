# 사례 47 — 재개발 APT 신축APT 양도 + 청산금 수령 동시신고 — UI 설계

> 본 문서는 `transfer-tax-redevelopment.ui.design.md` 및 사례 44·45·46 UI 디자인의 후속 확장.
> 입력 자료: PDF 사례수정 2 "재건축(재개발)조합의 최초조합원이 청산금을 지급받은 경우" + 이미지 24~25
> 시점: 2026-05-14
> 짝궁 엔진 디자인: `transfer-tax-redevelopment-case-47.engine.design.md`

---

## Context

사례 46 (`receiveOnlyMode=true`) 청산금 수령 **단독신고**에 이은 **신축APT 양도 + 청산금 수령 동시신고** UI 분기.

핵심 차이 (vs 사례 46):
- 사례 46: receiveOnlyMode=ON → 신축APT 양도가·인가후 경비 등 자동 숨김 + transferPrice/transferDate를 settlement 값으로 미러
- **사례 47: receiveOnlyMode=OFF** → 신축APT 양도가·인가후 경비 입력 그대로 활성 (사례 44 입력 흐름과 동일) + settlement 분기는 **결과 단계에서 비과세 자동 차감**

UI 요구사항 4가지:

1. **`ExemptionAtApprovalCard` 노출 조건 확장** — 현재 `receiveOnlyMode === "yes"` 에서만 표시. → `redevSettlementDirection === "receive"` AND `isOneHouseSingle === true` **전체** 케이스에서 노출.
2. **DetailedStatement 청산금 수령분 3단계 분해** — 안분 전 / 안분 후 / 비과세 차감 시각화.
3. **FilingFormTable settlement 비과세 행** — 신고서 양식 표에 청산금 분 비과세 라인 추가.
4. **사이드바 합계 settlement 비과세 표시** (선택) — settlement 비과세 액 별도 라벨.

엔진 측 입력 인터페이스 변경 없음 (Pre-Do 검증: `exemptionEligibleAtApproval` 기존 필드 재사용).

---

## ★ 사용자 시나리오 (사례 47 입력 흐름)

PDF 사례수정 2 입력 데이터 매핑:

```
[Step 1] 자산종류 선택
  → "재개발·재건축 아파트 (redevelopment_apt)" 선택
  → 자동 설정 (사례 46과 동일):
    · assetKind = "redevelopment_apt"
    · redevSubject = "apt"
    · redevApprovalLawBasis = "urban_renovation_art_74"

[Step 2] 자산 카드 입력 (RedevelopmentBlock)
  ① 종전부동산 유형: 주택 (housing)
  ② 청산금 방향: receive ← 사례 46과 동일
  ③ 청산금 수령분 단독 신고 ToggleCard: OFF ← ★ 사례 46과 결정적 차이 (사례 47은 신축APT 양도 동시신고)

[Step 3] 자산-수준 일반 입력 (CompanionAcqPurchaseBlock + RedevelopmentBlock)
  ④ 신축APT 양도가액 (transferPrice): 2,000,000,000  ← 입력 활성 (사례 46은 자동 미러로 숨김)
  ⑤ 신축APT 양도일 (transferDate): 2022-03-01      ← 입력 활성
  ⑥ 종전주택 취득일 (acquisitionDate): 2001-01-01
  ⑦ 종전주택 취득가액: 100,000,000
  ⑧ 관리처분 인가일: 2014-02-01
  ⑨ 권리가액 (rightsValue): 800,000,000
  ⑩ 청산금 수령액 (settlementAmount): 200,000,000
  ⑪ 인가후 필요경비: 0 (사례수정 2 가정 — 입력 활성, 0 허용)
  ⑫ 소유권이전 고시일 → 자동 +1일 양도일 표시 (직전 PR 패턴 — receive 모드에서 활성)

[Step 4] 1세대1주택 + 거주 (RedevelopmentBlock 또는 보유 상황 Step)
  ⑬ isOneHousehold = true, householdHousingCount = 1
  ⑭ residencePeriodMonths = 254 (21년 2개월, 보유 = 거주)
  ⑮ ★ ExemptionAtApprovalCard 자동 노출 ← 본 PR 신규 (receive direction 전체 노출)
     · 인가일(2014-02-01) 기준 보유 13년 → 2년 충족 ✓
     · 자동 산정: exemptionEligibleAtApproval = true
     · Card 분기 4종 자동 판정 → 본 입력은 **rose tone** (rightsValue 8억 ≤ 12억 + exemptionEligibleAtApproval=true):
       "settlement 비과세 자동 적용 (1세대1주택 + 인가일 평가액 ≤ 12억)"

  (참고 — Card 4분기 시나리오 분기)
  · 만약 rightsValue=13억 입력 시 → **amber tone** Card "고가주택 → settlement 과세 적용 (후속 PR)" 표시 → 비과세 차감 미적용
  · 만약 residencePeriodMonths=0 입력 시 → **gray tone** Card "비과세 요건 미충족" 표시 → 비과세 차감 미적용
  · 만약 isOneHousehold=false (다주택) → Card 자체 미노출 + 후속 PR 영역 (C-F2)

[Step 5] 계산 결과 (TransferTaxResultView)
  → DetailedStatement 3단계 분해 시각화 (본 PR 신규)
  → 산출세액 37,630,000 (옵션 B anchor)
```

---

## ★ `ExemptionAtApprovalCard` 확장 명세

### 현행 (`RedevelopmentBlock.tsx:171-174 + ExemptionAtApprovalCard:417~`)
```tsx
{asset.redevReceiveOnlyMode === "yes" && isOneHouseSingle && (
  <ExemptionAtApprovalCard asset={asset} onChange={onChange} />
)}
```
→ 사례 46 단독신고에서만 노출.

### 확장 후 (본 PR)
```tsx
{asset.redevSettlementDirection === "receive" && isOneHouseSingle && (
  <ExemptionAtApprovalCard asset={asset} onChange={onChange} />
)}
```
→ receive direction 전체 (사례 46 receiveOnly=yes + 사례 47 receiveOnly=no 모두 포함).

**자동 산정 함수 재사용**: `ExemptionAtApprovalCard` 내부의 `monthsBetween(acquisitionDate, approvalDate) >= 24` 자동 산정 로직은 사례 46에서 이미 구현 → 본 PR은 노출 조건만 확장, 자동 산정 함수는 무수정 재사용.

**UI 필드명 ↔ 엔진 필드명 매핑**:
| UI (AssetForm) | 엔진 (RedevelopmentInfo) |
|---|---|
| `redevSettlementDirection` | `settlementDirection` |
| `redevReceiveOnlyMode` ("yes"/"no") | `receiveOnlyMode` (boolean) |
| `redevRightsValue` | `rightsValue` |
| `exemptionEligibleAtApproval` (boolean) | `exemptionEligibleAtApproval` (동일 키) |

### Card 내부 분기 (rightsValue·exemptionEligibleAtApproval 4가지 조합)

| rightsValue | exemptionEligibleAtApproval | 톤 | 표시 | 엔진 동작 |
|---|---|---|---|---|
| ≤ 12억 | true (자동/수동) | **rose** | "settlement 비과세 자동 적용 (1세대1주택 + 인가일 평가액 ≤ 12억)" | settlement 마스킹 + exemptedGain/Lthd 메타 |
| ≤ 12억 | false (보유·거주 미충족) | gray | "비과세 요건 미충족 → settlement 과세" | settlement 정상 합산 (마스킹 없음) |
| > 12억 | true | **amber** | "고가주택 → settlement 과세 적용 (후속 PR — C-F1)" | settlement 정상 합산 (현행 동작) |
| > 12억 | false | gray | "비과세 미충족 + 고가주택 → settlement 전부 과세" | settlement 정상 합산 |

### 자동 산정 로직 (사례 46과 공유)
- `monthsBetween(acquisitionDate, approvalDate) >= 24` → `exemptionEligibleAtApproval` 자동 true
- 사용자 override 허용 (사례 46 패턴 재사용)
- 미입력(undefined) 시 legacy `isOneHouseSingle` fallback

---

## ★ DetailedStatement 3단계 분해 (본 PR 핵심 시각화)

`DetailedStatementFormulaBuilders` 분기 추가 — `redevSettlementDirection === "receive"` + `redevReceiveOnlyMode !== "yes"` + `settlementExemptionApplied === true`:

### 시각화 레이아웃 (rose tone 카드)

```
┌─────────────────────────────────────────────────────────┐
│ 청산금 수령분 (1세대1주택 비과세)                       │
├─────────────────────────────────────────────────────────┤
│ ① 양도차익 (안분 전)                  175,000,000       │
│    청산금 200,000,000                                    │
│    − 안분 취득가 25,000,000 (1억 × 200M/800M)            │
│                                                          │
│ ② 12억 초과분 안분 후                  70,000,000       │
│    175,000,000 × (양도가 20억 − 12억) / 양도가 20억      │
│                                                          │
│ ③ 1세대1주택 비과세 차감             −70,000,000       │
│    사유: 인가일 평가액 8억 ≤ 12억                        │
│         + 1세대1주택 비과세 요건 충족 (보유 13년)        │
│    근거: 서면2016-법령해석재산-2705                      │
│         PDF 사례수정 2 (2)-1번 주석                      │
│                                                          │
│ → 양도소득금액 합산 제외                                │
└─────────────────────────────────────────────────────────┘
```

### 구현 위치 (정확한 코드 경로)
- **빌더 본체**: `components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts`
  - 사례 46 라벨 분기 패턴 (`BRANCH_LABEL_RECEIVE_ONLY`)을 모델로 **신규 `BRANCH_LABEL_SETTLEMENT_EXEMPTED` 추가**
  - `getBranchLabel(redev)` 분기 우선순위:
    1. `redev.receiveOnlyMode === true` → `BRANCH_LABEL_RECEIVE_ONLY` (사례 46)
    2. `redev.settlementExemptionApplied === true` → `BRANCH_LABEL_SETTLEMENT_EXEMPTED` (사례 47 — 본 PR)
    3. 기본 → `BRANCH_LABEL_DEFAULT` (사례 44/45)
  - `settlement` 분기 산식 함수 (`buildTransferGainFormula`, `buildAcquisitionFormula`, `buildDeductionFormula` 등) 모두 사례 46 패턴으로 분기 추가
- **신규 5필드 참조**: `settlement.gainAfterAllocation` / `settlement.lthdAfterAllocation` / `exemptedGain` / `exemptedLthd` / `settlementExemptionApplied`

---

## FilingFormTable 통합 (신고서 양식 표)

`project_redev_filing_form_display.md` 정책 확장. 실제 구현 위치:
- `components/calc/results/transfer/FilingFormTableHelpers.ts:468-471` settlement 분기 처리 영역
- `:485` 사례 46 holdingDays 부착 패턴 (사례 47도 같은 분기 활용)
- `:500` 분기별 필요경비 정책
- `:594-600` 취득가액 합계 산식 (실가 합 = 종전주택 실가 + 청산금 납부액 — receive 모드에서 별도 처리)
- `:142` 라벨 정의

| 행 | 사례 44/45 (pay) | 사례 47 (receive 동시신고) |
|---|---|---|
| 양도가액 | 신축APT 실가 + 청산금 양도가 분기별 표시 | 신축APT 실가 단독 + **settlement 별도 비과세 행** (양도가 200M / 차감 −200M) |
| 취득가액 | 분양가 + 인가전 종전취득가 | 동상 (settlement 안분 취득가 25M은 비과세 행에 부속) |
| 양도차익 | 분기별 합계 | preApproval + postApproval 합계 = 1,925M (settlement 175M 별도) |
| 12억 안분 후 | 분기별 안분 양도차익 | 210M + 560M = 770M (settlement 70M 비과세 차감으로 제외) |
| LTHD | 분기별 LTHD | 168M + 448M = 616M (settlement 21M 비과세 차감) |
| 비과세 | (해당 없음) | **신규 행**: settlement 비과세 70M + LTHD 21M = 91M |
| 양도소득금액 | 합계 | 154,000,000 |

**`lthdResidenceAttribution` 호환성** (사례 45):
- 사례 45는 `lthdResidenceAttribution` 메타로 신축거주월수·기존거주월수 별도 표시
- 사례 47에서 settlement 분기는 마스킹되지만 사례 45 메타가 다른 분기에 부착돼 있으면 그대로 표시. 두 메타는 직교 (별도 분기 정보)이므로 호환 가능
- FilingFormTable·DetailedStatement는 두 메타를 독립적으로 분기 처리

---

## ★ `RedevelopmentDetailCard` settlement Row 표시 정책 (옵션 B 채택)

`components/calc/results/transfer/RedevelopmentDetailCard.tsx:180` 현행:
```tsx
<Row label="양도차익" value={settlement.gain} highlight />  // 마스킹 후 0 표시 → 사용자 혼란
```

**본 PR 정책 (옵션 B — settlement 행 유지 + 비과세 차감 라인 추가)**:
```tsx
{settlementExemptionApplied ? (
  <>
    <Row label="양도차익 (안분 후)" value={settlement.gainAfterAllocation} />
    <Row label="LTHD" value={settlement.lthdAfterAllocation} />
    <Row label="1세대1주택 비과세 차감" value={-(settlement.gainAfterAllocation - settlement.lthdAfterAllocation)} tone="rose" />
    <Row label="과세 양도소득금액" value={0} highlight />
  </>
) : (
  // 사례 44/45/46 기존 패턴
  <Row label="양도차익" value={settlement.gain} highlight />
)}
```

**시각화 효과**:
- 안분 후 70M / LTHD 21M / 비과세 차감 −49M / 결과 0
- 사용자는 청산금 분이 별도 비과세된 금액과 사유를 명확히 확인
- DetailedStatement 3단계 분해와 일관

---

## 사이드바 합계 (선택)

`computeTransferSummary` (현행 `lib/stores/calc-wizard-store.ts`)에 settlement 비과세 라벨 반영 (선택 — Phase 2):

```
양도가액:       2,000,000,000
취득가액:         625,000,000 (분양가 600M + 인가전 종전 100M − 안분 25M)
필요경비:                  0
양도소득금액:    154,000,000  ← settlement 비과세 차감 반영
                              (청산금 수령분 70M·LTHD 21M 별도 비과세)
산출세액:         37,630,000
```

---

## 14지점 동기화 점검

본 PR은 **입력 인터페이스 변경 없음**. 결과 카드만 신규 5필드 참조.

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 (AssetForm) | 변경 없음 |
| ② initial | 변경 없음 |
| ③ normalize | 변경 없음 |
| ④ API 변환 (`transfer-tax-api.ts`) | 변경 없음 (`receiveOnlyTransferDate`는 receiveOnly=yes 전용 — 동시신고는 신축APT transferDate 그대로) |
| ⑤ UI 위젯 | **`ExemptionAtApprovalCard` 노출 조건 확장** (`RedevelopmentBlock.tsx:170-173`) |
| ⑥ 사이드바 | settlement 비과세 라벨 반영 (선택, Phase 2) |
| ⑦ 결과 카드 | **3종 동시 수정**: ① `RedevelopmentDetailCard.tsx:180` settlement Row 옵션 B 분기 + ② `DetailedStatementRedevelopmentBuilders.ts` 신규 `BRANCH_LABEL_SETTLEMENT_EXEMPTED` + ③ `FilingFormTableHelpers.ts:468/485/500/594-600` settlement 비과세 행. `computeTransferSummary` 사이드바 양도소득금액 합계가 결과 카드 양도소득금액과 일치하는지 검증 (선택 — Phase 2이지만 본 PR에서 정합성 확인 필수) |
| ⑧ validate | settlementSaleDate 차단은 receiveOnly=yes 한정 (동시신고는 transferDate fallback graceful) |
| ⑨~⑪ Zod | 변경 없음 |
| ⑫ Zod 입력 객체 정의 | 변경 없음 |
| ⑬ callTransferTaxAPI body spread | 변경 없음 |
| ⑭ Route handler 엔진 매핑 | 변경 없음 |

---

## 시각 패턴 일관성

- `ExemptionAtApprovalCard` — **rose tone** (사례 46에서 사용, 본 PR 재사용)
- DetailedStatement 청산금 비과세 카드 — **rose tone** (1세대1주택 비과세 일관)
- FilingFormTable 비과세 행 — **slate-100 배경 + 음수 액 강조**

---

## ★ 사례 46과의 시각 분기 명시 (혼동 방지)

| 사례 | settlementDirection | receiveOnlyMode | 신축APT 양도 입력 | settlement 표시 |
|---|---|---|---|---|
| 사례 46 | receive | **yes** | 자동 숨김 (transferPrice 자동 미러) | settlement 단독 양도차익 산정 + LTHD 표1 강등 |
| **사례 47** | receive | **no** | 입력 활성 (사례 44 흐름) | settlement 안분 후 **비과세 자동 차감** (3단계 분해 시각화) |

`receiveOnlyMode` 토글 OFF가 사례 47의 결정적 분기 키. 사용자 입력 흐름은 사례 44(pay 모드)와 유사하되 `settlementDirection`만 receive로 다름.

---

## PDCA 단계

1. **Plan/Design**: 본 문서 + `case-47.engine.design.md`
2. **Pre-Do**: ✅ 완료 (2026-05-14) — M1 anchor 1건 실패 입증
3. **Do**:
   - `ExemptionAtApprovalCard` 노출 조건 확장 (`RedevelopmentBlock.tsx`)
   - Card 내부 4가지 조합 분기 시각화 (rose / amber / gray)
   - DetailedStatement 3단계 분해 빌더 분기
   - FilingFormTable settlement 비과세 행 추가
4. **Check**: `ui-engine-sync-checker` + 브라우저 수동 (Step 1~5 전수 시나리오)
5. **Act**: 회귀 anchor (사례 46 무회귀) + 디자인 환류

---

## 후속 PR (본 PR 차단)

- **C-F1** 평가액 > 12억 시 청산금 수령분 고가주택 안분 UI (amber tone 차단 안내 → 정식 산정으로 전환)
- 사이드바 합계 settlement 비과세 라벨 (Phase 2)
- `LawArticleModal` 신규 alias 등록 — PDF 사례수정 2 (2)-1번 주석 인용 모달 (서면2016-2705는 사례 46에서 이미 등록됨, 재사용)
