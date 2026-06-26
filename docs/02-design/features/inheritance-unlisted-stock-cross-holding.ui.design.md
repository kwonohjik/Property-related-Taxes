# UI 설계 — 다른 비상장법인 주식 소유 평가 (상호출자)

> PDCA Design (UI) · 계획서 `…cross-holding.plan.md` · 엔진설계 `…cross-holding.engine.design.md`
> 기존 `otherUnlistedHoldings`는 **UI 위젯 부재**(엔진 전용) → 전면 신규. 비상장 V2 마법사에 섹션 추가.

---

## 1. 사용자 시나리오

평가대상 비상장법인이 다른 비상장법인 주식을 자산으로 보유 → 사용자가 보유 항목을 행으로 추가하고,
보유비율·시가/장부가·(상호출자 시) 상대법인 재무를 입력 → 엔진이 평가방법 자동분기 →
평가액을 ②평가차액에 반영 + 결과카드에 연립방정식 산출근거 표시.

---

## 2. 신규 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| `OtherHoldingSection.tsx` | `components/calc/inheritance/unlisted-stock-v2/` | 보유 다른 비상장주식 목록 + 행 추가/편집 |
| `OtherHoldingRowEditor.tsx` | 〃 | 행 편집 모달 (보유주식수·총발행·시가/장부·상호출자 토글·상대재무) |
| `CrossHoldingResultCard.tsx` | 〃 | 연립방정식 풀이 산출근거 (αᵢ·(2α+3ρ)/5·Max 비교) echo 표시 |

`UnlistedStockV2Card.tsx`에 `OtherHoldingSection` 삽입 (순자산 계산 섹션 **직전** — 자산반영 순서 = UI 순서).
②평가차액 반영분은 기존 `ValuationDeltaTable`에 **읽기전용 자동 행**으로 표기 (출처: 보유주식 평가).

---

## 3. 입력 위젯 (행 편집 모달)

```
┌─ 다른 비상장법인 주식 보유 ─────────────────────────┐
│ 발행법인명          [____________]                  │
│ 보유 주식수         [____] 주   총발행주식수 [____] 주│
│ 자기주식 (분모제외) [____] 주  → 보유비율 70.0% (자동)│
│ ─ 평가방법: 보유비율 자동분기 ───────────────────── │
│  • 10%↓: 시가 있으면 시가, 없으면 이동평균법 취득가액 │
│  • 10%↑: Max(장부가액, 보충적평가가액)              │
│ 시가(있으면)        [____________] 원               │
│ 장부가액            [____________] 원               │
│ 이동평균법취득가액  [____________] 원   (10%↓ 시)    │
│ ─ [토글] 상호출자 (상대도 평가대상 주식 보유) ────── │
│   (ON 시) 상대법인 재무 입력 그룹 ▼                  │
│     자산(주식제외 Pⱼ)·부채 dⱼ·발행주식 ηⱼ          │
│     1주당 순손익가치 ρⱼ·부동산과다 여부             │
│     상대가 보유한 평가대상 주식수 a                  │
│     평가기준 [가중평균 / 순자산단독] ← §54④ 자동판정 │
│     할증 적용 [법령판정] ← §63③·§53⑧4호·기준일 도출  │
└──────────────────────────────────────────────────┘
```
> 🔴 **U6 (정책)**: `valuationBasis`·`premiumOnHeld`·`premiumRate`는 **법령 판정 사항** — 상대법인의
> §54④ 순자산단독 사유 충족 여부·평가기준일(2021.2.17 §53⑧4호 개정 전후)로 도출한다. 자유 라디오로
> 노출해 납세자가 유리하게 임의선택하게 두지 않는다 (`feedback_no_unfavorable_application_without_legal_basis`).
> 상대법인 §54④ 입력이 있으면 자동도출, 불가 시 "법령판정 필요" 안내 + 근거 표시(임의 토글 아님).

- **토글/라디오**: 상호출자=`ToggleCard`(role=switch), 평가기준=`RadioCardGroup`. native 금지. OFF도 tone 유지.
- **포커스 전체선택**: 신규 input은 SelectOnFocusProvider 자동 (없으면 `onFocus={e=>e.target.select()}`).
- **금액칸**: `CurrencyInput` + `amount-column-align`(font-mono·tabular-nums·우측정렬).
- **보유비율 자동도출**: `holdingShares/(totalShares − treasuryShares)` `useMemo` (useEffect→store 미러링 금지).
- **조건부 노출**: 상호출자 OFF면 상대재무 그룹 숨김 (`feedback_ui_toggle_auto_visibility_policy`).
- **placeholder 숫자예시 금지** — 형식설명은 FieldCard `hint`.

---

## 4. 결과 카드 (`CrossHoldingResultCard`)

연립방정식 echo 산출근거 (`echo-field-pattern` + `formula-display-builder`):
```
[다른 비상장법인 주식 평가 — 상호출자]
 A법인 1주당 순자산가치 α = 17,575원
 B법인 1주당 순자산가치 β = 10,333원
 A 1주당 평가액 = (2×17,575 + 3×25,000)/5 = 22,030원
 B 1주당 평가액 = (2×10,333 + 3×15,000)/5 = 13,133원
 ─ 자산반영 (Max 장부·보충적) ─
 A 보유 B주식 = Max(60,000,000 장부, 6,000주×13,133=78,798,000) = 78,798,000원
 → ②평가차액 가산
```
- 펼침/접힘: `ExpandToggleButton` + `print:block`(`print-only-css-toggle`). 산식 한국어 풀어쓰기(약어·floor() 금지).
- 자기일관 검증: 카드 표시 αβ·평가액이 엔진 echo와 1:1 (`feedback_engine_result_display_drift`).

---

## 5. 14 동기화 지점 (신규 필드 전수)

| # | 지점 | 처리 |
|---|---|---|
| ① | 폼 상태 | `OtherHoldingFormRow[]` (StockAssetForm 또는 V2 폼) |
| ② | initial | `[]` (빈 배열) |
| ③ | normalize | 빈 행 제거·숫자 파싱 |
| ④ | API 변환 `lib/calc/` | FormRow → `OtherUnlistedHolding`(+`counterpartyNode`) 매핑 |
| ⑤ | UI 위젯 | §3 모달 |
| ⑥ | 사이드바 합계 | 보유주식 평가반영분 (계산가능 시만, 0원 제외) |
| ⑦ | 결과 카드 | §4 CrossHoldingResultCard |
| ⑧ | validate `lib/calc/…validate` | 10%↑·상호출자 시 상대재무 필수. **UI통과↔validate 모순 금지** (fallback 동일) |
| ⑨⑩ | Zod enum | `evaluationMethod` 메인+컴패니언 |
| ⑪ | 자산-수준 fallback | 해당 없음 (보유행 자체 입력) |
| **⑫** | **Zod 입력객체** | `OtherUnlistedHolding`+`counterpartyNode` 객체 정의 (grep 자가점검) |
| **⑬** | **body spread** | fetch body에 보유배열 포함 |
| **⑭** | **Route 엔진 매핑** | route handler → 엔진 input. counterpartyNode **Date 없음** → 변환 불필요 |

> ⑫⑬⑭ TS 미감지 침묵 strip — 신규 필드별 grep 자가점검 필수. **3중 패턴**(display fallback↔API↔validate 동일).

---

## 6. STEP 13 검토 반영 (UI 누락)
- 사이드바 ⑥: 보유주식 평가는 **연립방정식 풀린 후에만** 확정 → result 도착 전 입력값 추정 표시,
  도착 후 엔진값(`tax-summary-sidebar-pattern`). 0원·null 미표시.
- 이력 자동조회: 보유 발행법인 주식을 과거 평가이력에서 불러오는 `history-lookup-modal`은 **후속**(scope-out 표기).
- testid 동결: 모달 내 필드 `data-testid` (E2E 셀렉터 표준 — 모달 안 keepModalOpen, ToggleCard=role=switch).
