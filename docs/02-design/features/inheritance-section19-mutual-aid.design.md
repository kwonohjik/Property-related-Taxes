# §19① 공제금 — financial 카테고리 포함 명문화 (PR6) — 설계

> 상위 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §5 4-b (그룹 ④)
> 단계: Design · 도메인: 상속세 §22 금융재산공제 / 시행령 §19①
> KoreanLaw 검증: 상증법 §8(보험금 간주)·시행령 §19①(금융재산 정의) 전문 대조 완료

## Context

§19① 금융재산공제 대상 열거 = "예금·적금·부금·계금·출자금·신탁재산(금전신탁)·보험금·**공제금**·주식·채권·수익증권·출자지분·어음 등". 공제금이 명시 항목이나 현재 코드에 공제금 입력 안내·분류가 없어 사용자가 어디 입력할지 불명확.

## 법령 분석 (분류 결정)

- ✅ §8(상속재산으로 보는 보험금): "**생명보험 또는 손해보험**의 보험금으로서 피상속인이 보험계약자인 것" — **공제금 미열거**. → 공제금은 §8 간주상속재산 **아님** → `deemedCategory="insurance"`(§8) 부적합.
- ✅ §19①: 보험금·공제금 둘 다 금융재산공제 대상.
- → **공제금 = 일반 금융재산(`financial`) 분류**가 정합. `resolveFinancialEligibility(financial)`=true이므로 §22 자동 적용 (별도 카테고리·deemedCategory 신설 불요).

## ★ 케이스 인벤토리

| # | 케이스 | 입력 | §22 적격 | 비고 |
|---|---|---|---|---|
| MA-1 | 공제금 → financial 입력 | category=financial | true (기존 default) | numeric 불변 — 명문화만 |
| MA-2 | 보험금 → deemedCategory=insurance | §8 간주 | true | 기존 (공제금과 구분) |
| MA-3 | financial 라벨/hint | — | — | "공제금 포함" 명시 |

## 변경 (표시·명문화 — numeric 무영향)

1. **financial 라벨**(`PropertyValuationForm.tsx:66`): `"예금·펀드·채권"` → `"예금·펀드·채권·공제금"`.
2. **financial hint**(`PropertyValuationForm.tsx:86`): `"잔액 또는 평가기준일 시가 (상증법 §62) — §22 금융재산공제 적용"` → §19① 공제금 포함 명시 추가.
3. **getFinancialDeductionHint**(`AssetToggleHints.tsx`) 기본 return: `"예금·신탁·보험금·주식·채권 등"` → `"예금·신탁·보험금·공제금·주식·채권 등"`.
4. **financial-deduction-resolver.ts** 주석: 공제금이 §8 보험금과 달리 §8 간주 아님·§19① financial 분류임을 명문화(이미 line 25 §19① 공제금 언급 — 분류 근거 보강).

## anchor (K-1 — 신규 numeric anchor 없음)

PR6는 순수 표시·명문화로 새 데이터 필드/분기가 없다(공제금은 `financial` 카테고리로 입력 — 별도 필드 없음). `resolveFinancialEligibility(financial)=true`는 기존 FDR-1이 이미 보장. 따라서:
- **신규 numeric anchor 불필요** — 라벨/hint 문구 변경은 RTL 컴포넌트 테스트 대상이나, 기존 PropertyValuationForm 테스트가 라벨 문자열을 hard-assert하지 않으면 추가 불요.
- **회귀**: 전체 `npm test` 통과로 financial §22 적격·금융재산공제·라벨 렌더 불변 확인 (numeric 무영향).
- 분류 근거(§8 공제금 미열거 → financial)는 financial-deduction-resolver.ts 주석에 명문화하여 회귀 방어.

## Silent fallback 식별

- 없음. 공제금은 사용자가 financial로 명시 입력. 자동 분류·추정 없음.

## 동기화 지점

- 표시 전용(라벨·hint·주석). 엔진·API·validation 변경 없음 (financial 기존 경로 재사용).
- ①~⑭ 입력 구조 불변 → ⑤ UI 라벨만.

## 범위 외

- 공제금이 §8 보험금에 준한다는 해석(일부 사망공제금) — 본 PR은 §8 문언(생명·손해보험) 기준 financial 분류. 간주 논란은 별도.
- §54⑥/§54③ V2 등 무관.
