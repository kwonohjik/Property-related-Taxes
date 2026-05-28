# 상장주식 입력 폼 평가 산식 텍스트 — §63③ 할증 미반영 표시 버그 수정 계획서

> **증상 (이미지 16)**:
> - 평가 산식: `61,465 × 30,000주`
> - 상장주식 평가액: `2,212,740,000`
>
> **산술 검산**:
> - 61,465 × 30,000 = **1,843,950,000** (할증 0%, 산식 텍스트가 함의하는 결과)
> - 1,843,950,000 × 1.2 = **2,212,740,000** ✓ (실제 표시된 평가액 — §63③ 할증 20% 반영)
> - 73,758(⑩) × 30,000 = **2,212,740,000** ✓ (등가)
>
> → **평가액 숫자 자체는 엔진이 할증을 정확히 반영하여 정답.**
> → **표시 산식 텍스트가 ⑨(61,465, 할증 전)만 보여줘 사용자가 보기에 산술 모순.**

---

## 1. 원인 — 표시 산식 텍스트 단일 버그

### 1-1. file:line 실측

`components/calc/StockValuationForm.tsx:220-236` — "평가액 미리보기" 카드:

```tsx
{/* 평가액 미리보기 */}
{totalValue > 0 && (
  <div className="rounded-md bg-gray-50 ...">
    <div className="flex justify-between text-gray-500 ...">
      <span>평가 산식</span>
      <span>
        {isCapInc && capInc
          ? `(${avgPrice.toLocaleString()} − ${capInc.effectiveDividendDifference.toLocaleString()}) × ${shares.toLocaleString()}주`
          : `${avgPrice.toLocaleString()} × ${shares.toLocaleString()}주`}   {/* ★ ⑨ × shares — ⑩ 할증 미반영 */}
      </span>
    </div>
    <div className="flex justify-between font-semibold ...">
      <span>{isCapInc ? "§63②3호 평가액" : "상장주식 평가액"}</span>
      <span>{formatKRW(totalValue)}</span>   {/* ★ totalValue = computeStockValuation = ⑩ × shares (정답) */}
    </div>
  </div>
)}
```

**모순**:
- `avgPrice` = `item.listedStockAvgPrice ?? 0` (line 69) — **⑨ 산식**
- `totalValue` = `computeStockValuation(item)` (line 78) → `evaluateListedStock(item, {}).valuatedAmount` = `page1Values.perShareMajorShareholder × shares` — **⑩ × shares 산식 (할증 반영)**
- 산식 텍스트는 `avgPrice × shares`, 결과는 `⑩ × shares` → **dual-truth**.

### 1-2. 영향 범위

| 위치 | 책임 | 본 버그 |
|---|---|---|
| `StockValuationForm.tsx:226-228` | 입력 폼 평가액 미리보기 산식 텍스트 | ★ 본 PR 정정 대상 |
| 갑지 ⑨/⑩ 미리보기 (`Page1CoverSection.tsx`) | 갑지 양식 표시 (별도 셀) | 영향 없음 (양식 자체에 ⑨·⑩ 분리 셀) |
| PDF ⑨/⑩ (`ListedStockBesshiPdfDocument.tsx`) | PDF 출력 | 영향 없음 |
| 결과뷰 breakdown (`InheritanceTaxResultView` 등) | 결과 단계별 산식 | 영향 없음 (엔진 breakdown은 ⑨/⑩ 별도 step) |
| 사이드바 합계 | 평가액 합계만 표시 (산식 없음) | 영향 없음 |

→ **단일 파일 단일 위치 수정으로 종결.**

### 1-3. §63②3호 분기도 동일 버그

`isCapInc && capInc` 분기 산식: `(${avgPrice} − ${effectiveDividendDifference}) × ${shares}주` — **⑯ 산식**.
그러나 `totalValue` = `evaluateListedStock`의 §63②3호 분기 = `perShareMajorShareholderUnlisted × shares` = **⑰ × shares** (할증 반영).

→ §63②3호 + 최대주주 + 대기업 케이스에서도 동일하게 산식·결과 모순.

---

## 2. 수정 전략 — 산식 텍스트를 ⑩/⑰ 기준으로 통일

### 2-1. 산식 분해 표시 (옵션 비교)

| 옵션 | 텍스트 | 장점 | 단점 |
|---|---|---|---|
| (a) **단순** — `${perShareMajorShareholder} × ${shares}주` | `73,758 × 30,000주` | 결과와 정합. 단일 source. | ⑨·할증율이 보이지 않아 교육적 가치 낮음 |
| (b) **할증 명시** — `${avgPrice} × ${premiumLabel} × ${shares}주` | `61,465 × 120% × 30,000주` (할증 시) / `61,465 × 30,000주` (할증 0%) | 할증 단계 노출. 갑지 ⑩ 라벨과 정합. | 정수 산식상 floor 위치 모호 |
| (c) **★권장 — 갑지 양식 정합 2행** | 1행: `⑩ 최대주주 1주당 평가액 = floor(61,465 × 1.2) = 73,758` (할증 시) / `⑨·⑩ 1주당 평가액 = 61,465` (할증 0%)<br>2행: `${perShare} × ${shares}주` | 갑지 양식과 1:1 매핑. 할증 0%·20% 모두 일관. §63②3호 ⑯·⑰ 동일 패턴. | UI 영역 2배 |

**권장 (c)** — 갑지 양식(⑨→⑩→총액)과 시각적 매핑이 명확. 사용자가 갑지 미리보기로 검증 시 헷갈림 없음.

### 2-2. (c) 산식 텍스트 정의

#### 일반 분기 (§63①1가목)

| 케이스 | 1행 (1주당) | 2행 (총액) |
|---|---|---|
| 할증 0% | `1주당 평가액 (⑨·⑩) = 61,465` | `61,465 × 30,000주` |
| 할증 20% | `⑩ 최대주주 1주당 평가액 = floor(61,465 × 1.2) = 73,758` | `73,758 × 30,000주` |
| 할증 0% + 배제 사유 | `⑩ 1주당 평가액 = 61,465 (배제: ${premiumExclusionLabel})` | `61,465 × 30,000주` |

#### §63②3호 분기 (capital increase unlisted share)

| 케이스 | 1행 (1주당) | 2행 (총액) |
|---|---|---|
| 할증 0% | `1주당 평가액 (⑯·⑰) = (61,465 − 2,000) = 59,465` | `59,465 × 30,000주` |
| 할증 20% | `⑰ 최대주주 1주당 평가액 = floor((61,465 − 2,000) × 1.2) = 71,358` | `71,358 × 30,000주` |
| 배당기산일 동일 (⑮=0) | `1주당 평가액 (⑯) = 61,465` | `61,465 × 30,000주` |

### 2-3. 핵심 원칙

- **dual-truth 차단** [[feedback_ui_engine_dual_truth_avoidance]] — 산식 텍스트는 엔진의 `page1Values.perShareMajorShareholder` / `perShareMajorShareholderUnlisted` 를 직접 인용 (UI 자체 재계산 0).
- **단일 source** — `computeStockValuation(item)` 가 이미 ⑩·⑰ 기준. 그러나 화면 표시용 perShare 값은 별도 엔진 호출(`evaluateListedStock`)에서 page1Values 만 가져와 인용.
- **fmtKRW·toLocaleString 정합** — 1주당 값과 총액 값 모두 ⑩/⑰ 기준.

---

## 3. 작업 분해

### Step 1 — Pre-Do anchor (RED 확보)

- [ ] **A-1** `__tests__/components/calc/StockValuationForm.test.tsx` 또는 신규 `__tests__/components/calc/stock-valuation-form-formula-display.test.tsx`:
  - 입력: `closingAvg=61,465, shares=30,000, isMaxShareholder=true, companySize="large"` (이미지 16 fixture).
  - 기대:
    - 1행 텍스트에 `73,758` 포함 (⑩ 할증 적용 1주당 평가액).
    - 2행 텍스트에 `73,758 × 30,000주` 포함.
    - 합계 표시 = `2,212,740,000`.
  - RED 확인 (현행 화면은 1행 `61,465 × 30,000주`).
- [ ] **A-2** 할증 0% 케이스 anchor 1건 — `isMaxShareholder=false`. 1행 `61,465` 단독.
- [ ] **A-3** §63②3호 + 할증 anchor 1건 — `isCapitalIncreaseUnlistedShare=true, listedStockDividendDifference=2000, isMaxShareholder=true, companySize="large"`. 1행 ⑰ 산식, 2행 ⑰ × shares.

### Step 2 — UI 산식 텍스트 정정

- [ ] **B-1** `components/calc/StockValuationForm.tsx:69-78` perShare 도출:
  - `evaluateListedStock(item, {})` 결과의 `besshiData?.page1Values.perShareMajorShareholder` / `perShareMajorShareholderUnlisted` 를 도출. try/catch로 enrich (avgPrice·shares 0 시 fallback).
  - `majorShareholderRate` 도 도출 (0 vs 0.2).
- [ ] **B-2** `StockValuationForm.tsx:220-236` 평가액 미리보기 카드 재구성:
  - 1행 (1주당) 추가 — `<div className="flex justify-between text-gray-500">` `<span>1주당 평가액</span><span>{perShareFormula}</span>`.
  - 2행 (총액) 산식 — `${perShareMajorShareholder.toLocaleString()} × ${shares.toLocaleString()}주`.
  - 3행 (결과) — 기존 `formatKRW(totalValue)` 유지.
  - §63②3호 분기는 1행에 ⑯·⑰ 단계 표시.
- [ ] **B-3** perShare 값 도출 단일화 — UI 자체 재계산 금지. `evaluateListedStock` 호출 1회로 page1Values 가져와 모든 1행/2행 산식에 사용.

### Step 3 — 회귀·E2E

- [ ] **C-1** `npx vitest run __tests__/components/calc/` + `__tests__/tax-engine/listed-stock/` 회귀 0건.
- [ ] **C-2** PR 직전 `npm test` 전체 1회.
- [ ] **C-3** `npx tsc --noEmit` 0건.
- [ ] **C-4** `e2e/listed-stock-besshi.spec.ts` 회귀 + 산식 텍스트에 `73,758` 검출 e2e anchor 1건 추가 (이미지 16 시나리오).

---

## 4. 8개 동기화 지점 점검

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | 변경 없음 |
| ②③④ | initial·normalize·API | 변경 없음 |
| ⑤ | **UI 위젯** | StockValuationForm 평가액 미리보기 카드 산식 텍스트 정정 (B-1·B-2) |
| ⑥ | 사이드바 합계 | 변경 없음 (총액 자체는 정답이라 합계 영향 0) |
| ⑦ | 결과 카드·PDF | 변경 없음 (갑지 ⑨·⑩ 별도 셀이라 모순 없음) |
| ⑧ | Validation | 변경 없음 |

→ UI 변경 1지점만. 엔진·API·검증 영향 0.

---

## 5. 위험·회귀

- **R-1** `evaluateListedStock` 을 UI에서 직접 호출 — 이미 `computeStockValuation` 내부에서 사용 중. 동일 인자(`{}` context)로 호출 시 동작 동일. 성능 영향 < 1ms (단순 산술).
- **R-2** **§63②3호 dividendBaseDateSameAsListed** — `applyCapitalIncreaseShareValuation` 가 dividendDifference를 0으로 자동 변환. 1행 산식에 `(${avgPrice} − 0) = ${avgPrice}` 표시되지 않도록 가드 (배당기산일 동일 시 `(⑯)` 라벨로 단순 표시).
- **R-3** **premiumExclusionReason** 라벨 — `premiumExclusionLabel`이 노출되면 사용자가 할증 배제 사유를 즉시 인지. 갑지 ⑩ note와 정합.
- **R-4** **avgPrice = 0 / shares = 0** — 현행 `totalValue > 0 && ` 가드로 카드 자체 렌더링 안 됨. 본 PR 후에도 동일 가드 유지.

---

## 6. Acceptance Criteria

- [ ] **AC-1** 이미지 16 fixture (closingAvg=61,465, shares=30,000, isMaxShareholder, large) →
  - 1행: `⑩ 최대주주 1주당 평가액 = floor(61,465 × 1.2) = 73,758`
  - 2행: `73,758 × 30,000주`
  - 합계: `2,212,740,000원`
- [ ] **AC-2** 할증 0% (isMaxShareholder=false) → 1행: `1주당 평가액 (⑨·⑩) = 61,465`, 2행: `61,465 × 30,000주`, 합계: `1,843,950,000원`. **산술 정합 확인**.
- [ ] **AC-3** §63②3호 + 할증 20% → 1행에 `(${avgPrice} − ${diff}) × 1.2 = ${perShareUnlisted}`, 2행 `${perShareUnlisted} × ${shares}주`, 합계 정합.
- [ ] **AC-4** §63②3호 + 배당기산일 동일 → 1행에 `−` 부호 없이 `1주당 평가액 (⑯·⑰) = ${perShareUnlisted}` (단순 표시).
- [ ] **AC-5** §63③ 배제 사유 (예: `companySize=small`) → 1행에 `(배제: ${premiumExclusionLabel})` 노출 + 할증 0% 산식.
- [ ] **AC-6** 전체 회귀 0건, tsc 0건, lint error 0.

---

## 7. 참고

- 디자인: `docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md` §2·§7
- 인접 정정: `docs/00-pm/listed-stock-besshi-avg-dual-truth-fix.plan.md` (본 커밋 `52e9dc5` 직후 후속)
- 메모리: [[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_result_view_korean_formula]] · [[feedback_pre_anchor_verification]] · [[feedback_anchor_correction_legal_priority]]
