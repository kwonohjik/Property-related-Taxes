# 종합부동산세 공유지분(지분율) — UI 설계

> PDCA Design (UI). 2026-06-15. Plan: `comprehensive-tax-ownership-ratio.plan.md` · Engine: `.engine.design.md`.
> 사례2(reductionRate) UI 패턴 재사용. 코딩 금지 — 설계만.

## 1. 입력 위젯 (⑤)

`components/calc/PropertyListInput.tsx` `PropertyCard` — 공시가격 직후, **감면율 위젯과 나란히** 지분율(%) DecimalInput.

```
┌─ 주택 #1 ────────────────────────────┐
│ 공시가격          [ 1,500,000,000 ] 원 │
│ ┌ 지분율(sky) ──┐ ┌ 재산세 감면율 ──┐ │  ← 같은 행/연속 배치
│ │ [  70  ] %    │ │ [  0  ] %       │ │
│ └───────────────┘ └─────────────────┘ │
│ hint: 단독 소유면 100. 공유지분만 입력 │
└──────────────────────────────────────┘
```
- 위젯: `DecimalInput`+`parseDecimal` (% 소수, CurrencyInput 금지). 기존 reductionRate 패턴 복제.
- **디폴트 표시 100** (미입력=단독). 감면율은 디폴트 0 — 방향 반대 주의(R-5).
- placeholder 숫자 금지. hint로 안내.

## 2. 폼 상태 (①②③)
- ① `PropertyEntry.ownershipRatio: string` (comprehensive-wizard-store.ts)
- ② `makeProperty()` 초기값 `ownershipRatio: "100"` (디폴트 100 — 사례2 reductionRate ""와 다름: 지분은 명시 100 표시)
- ③ onRehydrateStorage `p.ownershipRatio ?? "100"` 복원 가드

## 3. API 변환 (④⑬) + validation (⑧)
- comprehensive-api.ts: `ownershipRatio: p.ownershipRatio ? parseFloat(p.ownershipRatio)/100 : undefined` (미입력/100→엔진 1.0 fallback). previousYearAuto도 properties[0].ownershipRatio 기준(원칙3, reductionRate 패턴 동일).
- ⑧ validation: 0~100% 범위. UI onChange 제한 + Zod .max(1) 일치. 미입력=100% fallback 3중 일치(UI 100 표시 ↔ API undefined ↔ 엔진 ??1).

## 4. 결과 카드 (⑦)
- HousingPayableTaxCalcCard Step1: 지분율<100 시 "공시가격 × 지분율(70%) = 안분 공시" bullet. **form 값 직접** 사용(result echo 역산 불가 — engine §2).
- 감면 bullet과 **독립 2줄**(지분 → 감면 순) 또는 결합 1줄. 둘 다 활성 시 "공시 × 지분율 × (1−감면율)". → 독립 2줄 권장(가독성).
- [STEP13 정정] 부표3 ③칸 라벨 "감면후 공시가격" → **"과세 공시가격"**(중립어). 지분만·감면만·둘다 모든 케이스에 정확. effectiveIncludedAssessedValue 값 동일, 라벨만 변경(사례2 "안분·감면후" 어색 회피).
- [STEP13] ⑧ 지분율 0% 입력(과세 0) 허용 — 별도 경고 없음(소유 안함은 주택 미입력이 정상이나 0 입력도 수학적 유효).

## 5. 14지점 클라이언트 (①②③⑤⑦⑧)
| # | 위치 | 작업 |
|---|---|---|
| ① | PropertyEntry | ownershipRatio: string |
| ② | makeProperty | "100" |
| ③ | onRehydrateStorage | ?? "100" |
| ⑤ | PropertyListInput | DecimalInput(지분율%) 감면율 옆 |
| ⑥ | 사이드바 | 없음(미구현) |
| ⑦ | HousingPayableTaxCalcCard + 부표3 | 안분 bullet + 라벨 일반화 |
| ⑧ | comprehensive-api.ts validate | 0~100 범위, 미입력=100 fallback |

## 6. E2E
`e2e/comprehensive-ownership-ratio.spec.ts`: 사례3 폼(일반1주택·공시15억·지분70%) → 결과 ⑤ 907,200 + 안분 bullet "10.5억" + 부표3 ③ 1,050,000,000. 회귀: 지분 미입력=100% → 사례12 동작 보존.

## 7. 리스크 (UI)
- 디폴트 100 vs 감면 0 혼동 — 라벨·hint 명확화.
- §10의2 토글 활성 시 지분율 입력 비활성/무시(v1, R-4).
- 1세대1주택 토글과 지분율 공존(사례3은 ≠1세대1주택).
