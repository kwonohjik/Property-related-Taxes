# 비상장주식 평가 PR-P — §54③ 다른 비상장주식 10% 이하 보유 옵션 계획서

> **Source**: `docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md` §3 **PR-P (v3 신규)**
> **Date**: 2026-05-24

---

## 1. 법령 근거 (KoreanLaw MCP 검증)

### 1.1 상증령 §54③ (KoreanLaw MCP 2026-05-24)

> ③제1항 및 제2항을 적용할 때 법 제63조제1항제1호나목의 주식등을 발행한 법인이 **다른 비상장주식등을 발행한 법인의 발행주식총수등(자기주식과 자기출자지분은 제외한다)의 100분의 10 이하**의 주식 및 출자지분을 소유하고 있는 경우에는 그 다른 비상장주식등의 평가는 제1항 및 제2항에도 불구하고 「법인세법 시행령」 **제74조제1항제1호 마목에 따른 취득가액**에 의할 수 있다. 다만, 법 제60조제1항에 따른 시가가 있으면 시가를 우선하여 적용한다.

### 1.2 법인령 §74①1호마목 (KoreanLaw MCP 2026-05-24)

> 마. 자산을 취득할 때마다 장부시재금액을 장부시재수량으로 나누어 평균단가를 산출하고 그 평균단가에 의하여 산출한 취득가액을 그 자산의 평가액으로 하는 방법(이하 "이동평균법"이라 한다)

### 1.3 정리

- **적용 조건**: 평가법인이 다른 비상장법인의 발행주식총수(자기주식·자기출자지분 제외) **10% 이하** 보유
- **갈음 가능**: §54①(가중평균) + §54②(순자산가치) 보충적 평가 대신 **이동평균법 취득가액**
- **우선순위**: §60① 시가 > 이동평균법 취득가액 (시가 있으면 시가 강제)
- **목적**: 평가 행정 부담 경감 — 소액 보유 비상장주식까지 보충적 평가 반복하는 비용 회피

---

## 2. 작업 범위

본 PR은 **엔진 옵션 + warnings + 헬퍼 + anchor** 중심. UI 토글은 후속 N-1로 분리.

### 2.1 신규 모듈

```
lib/tax-engine/property-valuation/
└── other-unlisted-holdings.ts          # ★ 신규 (~120줄)
    - OtherUnlistedHolding 타입 (목록 입력 — 1 평가법인이 N개 다른 비상장주식 보유 가능)
    - evaluateOtherUnlistedHolding(h): {valuatedAmount, appliedMethod, reasonCode}
      · §60① 시가 우선 (marketValue 있으면)
      · 10% 이하 + 이동평균 취득가액 (movingAverageAcquisitionValue 있으면)
      · 10% 초과 → 보충적 평가 필요 안내 (warnings, valuatedAmount=0 fallback)
    - 헬퍼 isWithinTenPercentThreshold(holdingShares, totalShares, treasuryShares)

lib/tax-engine/types/unlisted-stock-valuation.types.ts        # 수정
    - UnlistedStockValuationInput에 `otherUnlistedHoldings?: OtherUnlistedHolding[]` 추가
    - 결과 metadata `otherUnlistedHoldingsEvaluated?: OtherUnlistedHoldingResult[]` 추가
```

### 2.2 통합 위치

- **엔진**: `unlisted-orchestrator.ts`에서 `input.otherUnlistedHoldings`가 있으면 평가 후 `result.otherUnlistedHoldingsEvaluated` 노출 (참고용 메타 — 자산총액에 자동 가산하지 않음, 자산 입력은 사용자가 별도로 `bsTotalAssets`에 반영)
- **UI 통합 (후속 N-1)**: 본 PR은 엔진만, UI 폼은 사용자 명시 요청 시 별도 PR

### 2.3 anchor 7건

| ID | 시나리오 | 검증 |
|---|---|---|
| P-1 | 10% 이하 + 시가 있음 → 시가 우선 (§60①) | appliedMethod="market_value" |
| P-2 | 10% 이하 + 시가 없음 + 이동평균 취득가액 → 취득가액 갈음 (§54③) | appliedMethod="moving_average_acquisition" |
| P-3 | 10% 초과 → 옵션 적용 차단 | warnings.exceeds_10pct + appliedMethod="not_applicable" |
| P-4 | 자기주식 제외 후 10% 정확히 동률 | appliedMethod="moving_average_acquisition" (10% 이하 포함) |
| P-5 | 자기주식 미입력 → totalShares 그대로 사용 (보수적) | 동작 |
| P-6 | 결과 metadata `otherUnlistedHoldingsEvaluated` 노출 | result.otherUnlistedHoldingsEvaluated[0] 존재 |
| P-7 | 빈 배열 입력 (otherUnlistedHoldings=[]) → 결과 metadata undefined 또는 [] | 회귀 보호 |

---

## 3. Definition of Done

- [ ] anchor 7건 통과
- [ ] 기존 회귀 0건 (4,780 PASS 유지)
- [ ] `npx tsc --noEmit` 0건
- [ ] 800줄 정책 — 신규 모듈 ≤ 150줄
- [ ] §54③ 본문 + §60① 단서 + 법인령 §74①1호마목 인용 주석 명시
- [ ] 한국어 커밋 메시지 + push

---

## 4. 후속 PR

- N-1: UI 토글 + 입력 폼 (otherUnlistedHoldings 배열 편집)
- N-2: 결과 카드에 §54③ 옵션 적용 내역 표시 (메타 노출)
- N-3: bsTotalAssets 자동 조정 (현재 사용자 수동 입력 — 자동화 옵션)

---

## 5. 한계

- **자산총액 자동 반영 안 함**: §54③ 옵션은 다른 비상장주식 평가 단순화만 제공. 평가법인의 재무상태표상 자산총액(`bsTotalAssets`)은 사용자가 별도로 입력 (이미 장부 반영분).
- **시가 입력 시 검증 불가**: §60① 시가 정합성(매매사례·감정 등)은 사용자 책임
- **UI 미포함**: 엔진 옵션만 — 마법사 UI에서 입력 불가 (후속 N-1)
