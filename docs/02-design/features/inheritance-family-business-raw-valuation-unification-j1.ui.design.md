# UI Design — 가업상속공제 raw 평가액 통일 (J-1) [경량]

> **Engine Design**: `inheritance-family-business-raw-valuation-unification-j1.engine.design.md`
> **Plan**: `docs/00-pm/inheritance-family-business-raw-valuation-unification-j1.plan.md`
> **범위**: **신규 UI 위젯·폼·Zod·결과 카드 0**. 엔진 평가액 통일 + 레이어 이동(엔진). UI는 (a) 결과 표시값 자동 정정 확인 (b) **import 사이트 re-export 보존**(컴포넌트 깨짐 방지)뿐.

## 0. 적용 정책 메모리

- [[feedback_800line_split_export_preservation]] — computeStockValuation·resolveUnlistedDisplayMode 이동 시 re-export로 import 사이트 무변경
- [[feedback_numeric_impact_verify_before_bug_claim]] — 표시값 변화는 가업상속 auto-derive에만 국한
- [[single-source-engine-helper]] — getValuatedAmount ≡ resolveEstateItemValue 단일 진실

---

## 1. UI 영향 (신규 작업 없음 — 자동 반영 + 회귀 보호)

| 영역 | 영향 | 작업 |
|---|---|---|
| 가업상속공제 결과 카드 (`InheritanceTaxResultView` + FamilyBusinessDeductionDetail breakdown) | `detail.autoDerivedValue`·`deduction`이 통일값 자동 반영(0→정상). **표시 구조·산식 무변경** | 없음 (엔진 echo) |
| 금융재산공제 등 getValuatedAmount 호출처 (ResultView 82·88행) | **영향 0** — getValuatedAmount 동작 무변경(재배치만, DR-1) | 없음 |
| `StockValuationForm`·`EstateCommonAttributesSection` | computeStockValuation·resolveUnlistedDisplayMode를 lib/calc에서 import — **이동 후 re-export로 무변경** | re-export 보존 확인(R-3) |

---

## 2. import 사이트 re-export 보존 (UI측 유일 핵심 — R-3)

이동 대상 2함수의 UI 컴포넌트 import 사이트:
- `components/calc/StockValuationForm.tsx` — `export { computeStockValuation, resolveUnlistedDisplayMode } from "@/lib/calc/stock-valuation"` (재-재수출)
- `components/calc/inheritance/EstateCommonAttributesSection.tsx` — resolveUnlistedDisplayMode 사용

→ `lib/calc/stock-valuation.ts`가 엔진에서 **2함수 re-export** 유지하면 위 import 경로(@/lib/calc/stock-valuation) 무변경. grep으로 잔존 import 사이트 전수 확인.

---

## 3. 결과 카드 표시 (변경 없음 — 값만 정정)

- 가업상속공제 detail breakdown: "가업상속재산가액 (EstateItem 자동합산)" 행 amount가 통일값(0→정상)으로 표시. 라벨·구조 무변경.
- 비상장 V2/감정가/기준시가 가업주식 사용자: 기존 0원 → 정상 평가액 표시 + 공제액·총 납부세액 정정. (산식·UI 위젯 추가 없음.)

---

## 4. Silent fallback / Cross-field

- **없음** — 표시 전용 자동 반영. store write·useEffect 0. marketValue 있는 자산 표시 불변.

---

## 5. 브라우저 e2e

- **신규 e2e 불요** — 신규 위젯·입력 경로 0. 엔진 anchor(J1-1~8) + 기존 가업상속 결과 e2e(있으면) 회귀로 충족.
- (선택) 비상장 V2 가업주식 → 결과 공제액 정정 1건 추가 가능 — Do에서 판단(엔진 anchor로 이미 충분).

---

## 6. UI senior 사전 점검 체크리스트

- [ ] 엔진 S-1~S-4 선행 완료(resolver 이동 + family-business 채택) — 시퀀셜
- [ ] `lib/calc/stock-valuation.ts` re-export 2개(computeStockValuation·resolveUnlistedDisplayMode) 보존 + import 사이트 grep 0 깨짐
- [ ] 가업상속공제 결과 카드 표시 구조 무변경(값만 정정) 확인
- [ ] getValuatedAmount 기존 호출처(ResultView) 동작 무변경(DR-1) 확인
- [ ] `npx tsc --noEmit` 0 + `npm test`(기존 컴포넌트 테스트 포함) 회귀 0
