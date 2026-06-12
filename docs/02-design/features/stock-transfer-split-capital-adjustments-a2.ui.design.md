# 분할 매수 + 자본조정 — UI 설계 (A-2)

> 엔진 설계: `stock-transfer-split-capital-adjustments-a2.engine.design.md` · 작성 2026-06-12

## 1. 사용자 시나리오

1. 취득가액 실가 + 다건(lots) + 분할 양도(split) 또는 lots-only — 기존 흐름.
2. 자본조정 블록(`CapitalAdjustmentsBlock`)이 **더 이상 disabled 아님** — 무상증자·형식감자 이벤트(발생일·비율·유형)를 입력.
3. 계산 → 엔진이 발생일 이전 보유 lot만 희석 → 매칭·차익에 반영.
4. 결과에 lot별 희석(before→after 주식수·환산 단가) 표시 + 기존 자본조정 timeline.

## 2. CapitalAdjustmentsBlock 변경 (⑤)

### 2.1 입력 게이트 flip (STEP13-19 — 실측)
- 현행: `!isSplit &&` 게이트 4곳(`:61` 유형 라디오·추가 / `:93`·`:97` 행 목록)이 split 시 입력 숨김 + `:87 isSplit &&` amber "사용할 수 없습니다" 표시.
- 변경: 4 게이트 flip(split도 입력 노출) + `:87` amber 제거 → 분할 안내(violet/sky)로 교체: "분할 모드에서는 발생일 이전 보유한 매수 lot만 희석됩니다 (무상주 보유기간은 원주 취득일로 통산 — 집행기준 97-163-12)."
- 단일/분할 공통 입력 — 폼 전역 `capitalAdjustments` 그대로(이벤트는 종목 전체 사건).

### 2.2 배정 합 안내 (A-1 specific 결합 시)
- 개별법 배정 합계 검증은 **희석 전 입력 주식수** 기준(STEP3-11). hint: "자본조정 희석은 계산 시 자동 반영 — 배정 수량은 매수 당시(원주) 기준으로 입력하세요."

## 3. 결과 카드 (⑦)

### 3.1 lot별 희석 표 (신규 — split + capitalAdjustments 시)
```
┌─ 자본조정 lot별 환산 (분할 모드) ──────────────────┐
│ 매수 lot │ 조정 전 │ 조정 후 │ 환산 단가 │ 적용     │
│ 매수 #1  │ 100     │ 200     │ 5,000     │ 무상증자 │
│ 매수 #2  │ 100     │ 100     │ 20,000    │ —        │  (before==after 생략 가능)
└────────────────────────────────────────────────────┘
```
- `result.lotCapitalAdjustmentsDetail` 소비. before==after lot 행 생략(변동 lot만).
- 금액 셀 `text-right font-mono tabular-nums` ([[amount-column-align]]). "원" 미표기.
- 적용 유형: 무상증자(자본준비금)·형식감자·[skip]의제배당.

### 3.2 기존 timeline 카드
- 단일 모드 `CapitalAdjustmentsTimelineCard`는 **단일 모드 전용 유지**(split은 `capitalAdjustmentsDetail` undefined — gate). split은 §3.1 신규 표.

## 4. 동기화 지점 (UI 측)

신규 입력 필드 **0** — `capitalAdjustments` 기배선. 본 PR:
| # | 파일 | 작업 |
|---|---|---|
| ⑤ | `CapitalAdjustmentsBlock.tsx` | isSplit disabled 제거 + 분할 안내 |
| ⑦ | `StockTransferTaxResultView` + 신규 lot 희석 표 컴포넌트 | `lotCapitalAdjustmentsDetail` 렌더 |
| ⑧ | `validate-step2.ts:68·380-386` | split+capital 차단 2곳 제거 |
| ⑧ | `validate-step2.ts:403-407` | eventDate vs 폼-전역 날짜 검증 split 시 gate(단일 전용) |
| ⑫ | `stock-transfer-tax-schema.ts:335-344` | split+capital 차단 제거 |
| **④⑬** | `stock-transfer-tax-api.ts:481` | **★ `&& lotsMode !== "split"` strip 조건 제거(split 전송)** |

- ①②③: 기존 — 변경 0. ratio 검증(:391-398)은 양 모드 유지.

## 5. E2E — `e2e/stock-transfer-split-capital.spec.ts` (신규)

| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | 다건(lots-only)·개별법 + 무상증자 100% + 계산 | 결과 lot 희석(200@5,000)·acquisitionPrice·차익 정확 |

- 자본조정 유형 라디오·발생일·비율 입력. 포트 충돌 시 `E2E_PORT=3200`.
- ToggleCard/라디오 제목 텍스트 클릭.

## 5.5 Do deviation (UI 환류)

- **isLotMode 확장(Critical)**: 블록의 `isSplit = lotsMode==="split"`은 **lots-only(취득 다건+양도 단건)를 놓침** — 엔진은 lots-only도 lot 희석 적용. → `isLotMode = lotsMode==="split" || acquisitionActualInputMode==="lots"`로 확장. help note·환산 설명도 모드 분기.
- **placeholder 정정**: `:161` "예: 0.5 (1주당 0.5주 무상)" 숫자 예시 → "1주당 비율 (무상증자 배정·감자 비율)" (정책 위반 부수 정정).
- **CA-6 stale 재anchor**: `pr2-validate.test.ts` CA-6-01(split+capital=error 단정) → 차단 제거 반영(error 없음).

## 6. UI 자가 점검
- [ ] split 모드에서 자본조정 블록 입력 가능(disabled 0)
- [ ] 단일 모드 자본조정 동작 불변(timeline 카드)
- [ ] lot별 희석 표 — 변동 lot만·금액 정렬·"원" 0
- [ ] validate/Zod split+capital 통과(차단 0)
- [ ] placeholder 숫자 예시 0
