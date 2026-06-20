# 부담부증여 양도소득세 통합 표시 — UI 설계

> 엔진/데이터 설계: [`gift-burdened-transfer-tax.design.md`](./gift-burdened-transfer-tax.design.md) 참조.
> 본 문서는 입력 위젯·바인딩·testid·결과 카드 레이아웃을 구체화한다(13단계 자가검토 STEP 12).

- MVP: 단일 자산 · 상증법 기준시가 모드 · 자산 모달 인라인 토글
- 정책: `feedback_three_state_optional_mode_toggle`·`mirror-pattern`·`feedback_ui_order_follows_logic`·`feedback_toggle_card_visibility`·`feedback_land_price_lookup_field`·`feedback_no_silent_apportion_fallback`·`feedback_result_view_korean_formula`·`amount-column-align`

---

## 1. 입력 — 자산 모달 (EstateBodyRealEstate.tsx)

### 1.1 배치 (mode==="gift" && category∈부동산3종 && assumedDebtForGift>0)

```
┌─ 부동산 자산 편집 모달 ─────────────────────────────┐
│ … 소재지 · 평가(시가/감정/매매사례/기준시가) …        │
│ … 담보·임대(§66): 임대보증금·저당·월세 …             │
│ ─────────────────────────────────────────────── │
│ [§47①] 수증자 인수 채무액  [  500,000,000 ]        │ ← 기존 RealEstateBurdenedGiftField
│ ┌─ §47③ 배우자·직계존비속 주의 (ToggleCard) ──────┐ │ ← 기존(line 648~667)
│ │ …입증책임 안내…                                │ │
│ └────────────────────────────────────────────┘ │
│ ┌─ 🟦 양도소득세 함께 계산 (ToggleCard, sky) ─────┐ │ ← 신규(H7: §47③ 이후)
│ │ ☐ 부담부증여 채무인수분 양도소득세 계산          │ │   노출조건 assumedDebtForGift>0
│ │   ON 시 ▼ 아래 입력 노출                        │ │   상태 = burdenedGiftTransferTax≠undefined
│ └────────────────────────────────────────────┘ │
│  ┌─ (토글 ON) 취득 정보 입력 (sky/indigo) ───────┐ │
│  │ ⓘ 채무인수분은 유상양도 → 증여자에 양도세 과세  │ │
│  │   (소득세법 §88·소령 §159)                    │ │
│  │ … category별 필드(아래 1.3) …                 │ │
│  └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### 1.2 토글 — 3-state (H8)

| 개념 | 식 | 비고 |
|---|---|---|
| **노출** 조건 | `(item.assumedDebtForGift ?? 0) > 0` | 단순 표시 게이트(숫자 파생 허용) |
| **ON/OFF** 상태 | `item.burdenedGiftTransferTax !== undefined` | 3-state. truthy/length derive 금지 |
| ON 전환 | `onChange` → `{ acquisitionDate: undefined, standardPriceAtAcquisition: 0, ... }` 객체 생성 | useEffect→store 미러링 금지 |
| OFF 전환 | `onChange` → `undefined` | 입력값 존재 시 **shadcn Dialog 확인**(`feedback_dialog_data_discard_confirm`, `window.confirm` 금지, 파괴 액션 rose-600). 빈 객체면 즉시 OFF |

### 1.3 category별 입력 필드 (UI 순서 = 엔진 처리 순서)

```
[real_estate_land]
  취득일(DateInput)
  취득시 개별공시지가(LandPriceLookupField)   ← H5 필수
  비사업용 토지 여부(ToggleCard)

[real_estate_building]
  주택 여부(ToggleCard, isHousing)             ← P1 분기 선행
   ├ 주택O → [housing 세트]와 동일
   └ 주택X → 취득일 · 취득시 기준시가(CurrencyInput)

[real_estate_apartment]  (isHousing 자동 true)
  취득일(DateInput)
  취득시 기준시가(CurrencyInput)               ← 공동주택공시가격
  1세대 1주택 여부(ToggleCard)
  세대 보유 주택 수(DecimalInput, 기본 1)
  양도시 조정대상지역(ToggleCard)
  취득시 조정대상지역(ToggleCard)
  거주기간(개월)(DecimalInput)                  ← 1세대1주택 ON 시 필수(H11)
  [세대주택수==2] 일시적 2주택(종전·신규 취득일 DateInput ×2)
```

### 1.4 위젯 바인딩 / testid

| 필드 | 위젯 | 바인딩 | testid |
|---|---|---|---|
| 토글 | `ToggleCard` | `burdenedGiftTransferTax !== undefined` | `bg-transfer-toggle` |
| 취득일 | `DateInput` | `.acquisitionDate` | `bg-transfer-acq-date` |
| 취득시 기준시가(land) | `LandPriceLookupField` | `.standardPriceAtAcquisition` | `bg-transfer-acq-stdprice` |
| 취득시 기준시가(건물/아파트) | `CurrencyInput` | `.standardPriceAtAcquisition` | `bg-transfer-acq-stdprice` |
| 주택 여부 | `ToggleCard` | `.isHousing` | `bg-transfer-is-housing` |
| 1세대1주택 | `ToggleCard` | `.isOneHousehold` | `bg-transfer-one-house` |
| 세대주택수 | `DecimalInput` | `.householdHousingCount` | `bg-transfer-house-count` |
| 양도시 조정지역 | `ToggleCard` | `.isRegulatedArea` | `bg-transfer-regulated` |
| 취득시 조정지역 | `ToggleCard` | `.wasRegulatedAtAcquisition` | `bg-transfer-regulated-acq` |
| 거주기간 | `DecimalInput` | `.residencePeriodMonths` | `bg-transfer-residence` |
| 비사업용 | `ToggleCard` | `.isNonBusinessLand` | `bg-transfer-nonbiz-land` |

- 숫자 입력은 `select-on-focus`(전역 Provider). `CurrencyInput.hideLabel` 시 aria 보존.
- 미입력 차단(`feedback_no_silent_apportion_fallback`): 토글 ON인데 취득일·취득시 기준시가 비면 validateStep 차단(⑧).

### 1.5 다자산 차단 (C4)

```
┌─ 🟥 (rose) 안내 ────────────────────────────────┐
│ 양도소득세 동시 계산은 현재 부담부증여 자산 1건만    │
│ 지원합니다. 이미 다른 자산에서 계산이 켜져 있습니다.  │
│ (여러 건은 양도소득세 계산기를 직접 이용하세요)       │
└────────────────────────────────────────────────┘
```
- 토글ON 자산이 이미 1개면 두 번째 토글 ON 시도 시 위 배너 + validateStep 차단.

---

## 2. 결과 — BurdenedTransferTaxResultCard.tsx (신규 분리, L2 800줄)

### 2.1 삽입 위치
`GiftTaxResultView.tsx` **line~554**(2-스트림 분리과세 블록 끝 이후) — 2-스트림 유무 무관 증여세 결과 **맨 아래**(C5). props `transferTaxResults: TransferTaxResult[]`(MVP 0|1).

### 2.2 레이아웃

```
┌─ 🟦 부담부증여 양도소득세 (증여자 납부) ─────────────┐
│ ⓘ 채무인수분은 유상양도 → 증여자 과세 (소득세법 §88) │
│                                                  amount
│  양도가액 (인수채무액)                      500,000,000 │ ← amount-column-align
│  (−) 취득가액 (취득시 기준시가 안분)          120,000,000 │   font-mono·tabular-nums·우측정렬
│  (−) 필요경비 (개산공제 3%)                   3,600,000 │
│  ─────────────────────────────────────────────── │
│  양도차익                                  376,400,000 │
│  (−) 장기보유특별공제                        45,168,000 │
│  ─────────────────────────────────────────────── │
│  양도소득금액                              331,232,000 │
│  (−) 기본공제                                2,500,000 │
│  과세표준                                  328,732,000 │
│  (×) 세율 …                                          │
│  산출세액                                   …          │
│  지방소득세 (10%)                            …          │
│  ═══════════════════════════════════════════════ │
│  합계 (양도세+지방소득세)                     …          │
│                                                  │
│  ▸ 펼치기: 산식 상세 (ExpandToggleButton)          │ ← 표준 토글, print:block
└────────────────────────────────────────────────┘
```

### 2.3 표시 규칙
- 산식 한국어 풀어쓰기(`feedback_result_view_korean_formula`) — 변수 약어·`floor()` 금지
- "원" 접미사 금지(`feedback_no_won_suffix`), 금액 `amount-column-align`(font-mono·tabular-nums·우측정렬)
- 내부 id 노출 금지(`feedback_no_internal_id_in_result`) — 자산명 `name.trim() || CATEGORY_LABEL`
- 펼치기/접기 `ExpandToggleButton`(▼펼치기/▲접기), 인쇄 시 `print:block` 자동 펼침(`print-only-css-toggle`)
- `formula-display-builder` 패턴(변수 배지+값+fine-print). 다크모드 강제 흰 배경(PDF)
- 산출근거 펼침에 **§159 안분비율**(인수채무액 B / 증여재산 평가액 C) 표시 — 양도가액·취득가액 산정 근거(U2)
- ✅ **U1 확정**: 거주기간 = **개월수 직접 입력(정수)**. 기존 `ResidencePeriodSection.tsx:171`("거주기간 (개월)" FieldCard) 패턴 차용. §1.3·§1.4의 위젯은 개월 정수 입력으로 구현(DecimalInput 소수 불필요)
- 교차검증(선택): 엔진이 함께 낸 `giftTax`와 증여세 본계산 정합 — 디버그용, 사용자 비노출

### 2.4 이력/사이드바
- ⑥ 사이드바: MVP 미표시(양도세는 별도 납세의무자, D5)
- 이력 저장: MVP 휘발(H9) — 재조회 시 양도세 미표시, 후속 PR 스키마 확장

---

## 3. E2E (e2e/gift-burdened-transfer.spec.ts)

1. 증여세 마법사 → 부동산(아파트) 자산 추가 → 채무인수액 입력
2. "양도소득세 함께 계산" 토글 ON(`bg-transfer-toggle`)
3. 취득일·취득시 기준시가·1세대1주택·거주기간 입력
4. 토글 ON인데 취득일 비우면 계산 차단 확인(⑧)
5. 계산 → 결과화면에 `부담부증여 양도소득세` 카드 표시 확인
6. 다자산: 두 번째 부담부증여 자산 토글 ON 시 차단 배너 확인
- 함정: 모달 닫기(backdrop)·자산 2단계 picker·`getByLabel("일")` 토글 오매칭→`textbox` role 한정(기존 부담부증여 E2E 교훈)
