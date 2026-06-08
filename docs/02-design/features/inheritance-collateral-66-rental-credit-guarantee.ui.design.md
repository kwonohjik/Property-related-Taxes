# UI설계 — §66 임대료환산(㉱) + 신용보증 차감(㉲) 입력

> 상위: `inheritance-collateral-66-rental-credit-guarantee.{plan,engine.design}.md`
> 공용 폼: `PropertyValuationForm`(상속·증여 공용) → 한 곳 수정 = 양 세목.
> 입력 위치: `EstateBodyRealEstate.tsx`의 `CollateralLeaseFields`(담보·임대 상시 섹션, 2026-06-08 신설).

## 1. 위젯 배치 (CollateralLeaseFields 확장)

기존 담보·임대 섹션(amber, §66·§14)에 2칸 추가:

```
┌─ 담보·임대 (§66 평가 하한 · §14 채무공제) ─────────── 상시 ─┐
│ 임대보증금 (세입자 있는 경우)  leaseDeposit [        ] (주택만)│
│ 월 임대료 (원)              monthlyRent [        ] (주택만·신규)│   ← ㉱
│   └ hint: "임대 부동산 §61⑤ — (월세×12÷12%)+보증금이 보충평가보다 크면 채택"│
│ 저당권 등에 의해 담보된 채권액  mortgageAmount [        ]      │
│ 신용보증기관 보증액 (원)     creditGuaranteeAmount [    ] (신규)│   ← ㉲
│   └ hint: "신용보증기금 등 보증분 — 저당 담보채권액에서 차감 §63②"│
│ §14 자동공제 ToggleCard / §23의2 (기존)                       │
└──────────────────────────────────────────────────────────┘
```

### 위젯 규칙
- 둘 다 `CurrencyInput` + `parseAmount`(원·정수), `hideLabel hideUnit`(FieldCard 라벨).
- **월 임대료(monthlyRent)**: `showLeaseDeposit`(apartment·building)일 때만 — 임대보증금 직후 배치(같은 임대 맥락).
- **신용보증기관 보증액(creditGuaranteeAmount)**: 저당권 칸 직후 — 전 부동산(land 포함, 저당은 토지도 설정 가능).
- 순서: 임대보증금 → 월 임대료 → 저당권 → 신용보증액 (입력 의미 그룹: 임대 / 저당).

## 2. 동기화 지점 ⑤ (UI 위젯)
| 위치 | 변경 |
|---|---|
| `EstateBodyRealEstate.tsx` `CollateralLeaseFields` | monthlyRent·creditGuaranteeAmount CurrencyInput 2칸 추가 |
| (H2/H3) | 계획 §6 결정 — 사이드바·미리보기 미반영 유지(엔진 단일진실) |

## 3. 결과 표시 (⑦)
- 평가금액 열: `resolveEngineValuatedAmount`(엔진) 경유 → ㉱·㉲ 자동 반영(추가 UI 불요).
- breakdown(상세): 엔진이 "§61⑤ 임대료환산가액 적용"·"§63② 신용보증액 차감" 행 생성(엔진설계 §3-4) → 결과 상세 카드에 표시됨.

## 4. testid / a11y / E2E
- 신규 testid 불요 — label 텍스트 기반 E2E.
- E2E 셀렉터: "월 임대료 (원)"·"신용보증기관 보증액 (원)" 텍스트 + CurrencyInput 입력.
- 기존 담보·임대 spec(collateral-debt 등)에 신규 칸 추가로 영향 없음(기존 셀렉터 불변, 새 칸은 추가만).

## 5. 검토 사항 (STEP13 반영)
- **D-UI1 (월 임대료 노출 범위)**: 현행 임대보증금이 주택(apartment·building)만 노출(`showLeaseDeposit`) → 월 임대료도 **주택 한정**(일관성). §61⑤은 토지 임대(주차장 등)도 대상이나 빈도 낮음 → **주택 한정 권장, land 확장은 후속**. Design 확정.
- **D-UI2 (신용보증 칸 disabled)**: `creditGuaranteeAmount` 칸은 `(mortgageAmount ?? 0) === 0`이면 `disabled` + `disabledReason="저당 담보채권액이 없으면 신용보증 차감 무관"` (입력 혼란 차단). 단 CurrencyInput에 disabled prop 지원 확인 필요(FieldCard 안내로 대체 가능).
- placeholder 숫자 예시 금지 — hint로 한국어 설명.
