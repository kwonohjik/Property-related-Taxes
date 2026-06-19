# 신탁이익의 증여 (§33) — 엔진 설계

> 계획서: `docs/00-pm/gift-trust-benefit.plan.md`. UI: `gift-trust-benefit.ui.design.md`.
> 검증: KoreanLaw §33·상증령 §25·§61·상증칙 §19의2 본문(2026-06-19 현행). 현가 모델: `gift-deemed/free-realestate-use.ts:22-28`(§37).

## Context

증여 의제 `DeemedGiftType`에 `trust_benefit`(§33) 1종 추가. 신탁이익 받을 권리를 상증령 §61로 평가 — 수익권은 §37과 동일한 정수 현가합 패턴(`safeMultiplyThenDivide(R, 100ⁿ, 103ⁿ)`), 원본권은 신탁재산 가액 기반, Max(평가액, 해지일시금).

---

## ★ 케이스 인벤토리 (행≥1 — Do 진입 게이트)

| # | 시나리오 | 법령 | anchor (원단위) | 테스트 | 상태 |
|---|---|---|---|---|---|
| TB-C | **통합 계산사례** (동일수익자·분할·수익률확정) | §33·령§25①3호·령§61·칙§19의2 | deemedGiftValue=**997,183,628** (수익 197,183,628 + 원본 800,000,000) | `gift-deemed/trust-benefit.test.ts` | ☐ TODO(Pre-Do) |
| TB-1 | 동일수익자 단일 일시 (분할 아님) | 령§61①1호 | 신탁재산 가액 그대로 | 〃 | ☐ |
| TB-2 | 수익권 PV합 (n=0..2) | 령§61①2호나목·칙§19의2① | 67,680,000·65,708,737·63,794,891 | 〃 | ☐ |
| TB-3 | 원본권 (수익자 다름) | 령§61①2호가목 | 재산−수익권합 | 〃 | ☐ |
| TB-4 | 해지일시금 > 평가액 → 일시금 | 령§61① 단서 | surrender>신탁이익 → surrender | 〃 | ☐ |
| TB-5 | 수익률 미확정 → 원본×3% | 칙§19의2② | R=원본×30/1000 후 PV합 | 〃 | ☐ |
| TB-D2 | 위탁자 사망 → 사망일 증여 | 령§25①1호 | (증여시기 라벨) | 〃 | ☐ |
| TB-D5 | 분할+위탁자 실질지배 → 실제지급일 | 령§25①3호나목 | (증여시기 라벨) | 〃 | ☐ |
| TB-6 | 수익시기 미정 → §62 준용 20년 | 령§61② | (Phase2) | — | ⏸ 보류 |

### TB-C 계산사례 세부 (이미지 5·6)
원본 8억·수익률 10%(확정)·원천징수 15.4%·3년·동일수익자(자)·위탁자 미지배 → 증여시기 최초지급일 2026.1.3.
- R = 800,000,000 × 10% × (1−0.154) = 67,680,000
- 수익권 = 67,680,000(n0) + 65,708,737(n1) + 63,794,891(n2) = 197,183,628
- 원본권 = 800,000,000 (동일수익자 → 신탁재산 가액)
- deemedGiftValue = 997,183,628

---

## 법령 근거 (KoreanLaw 본문 검증)
```
상증법 §33     신탁이익의 증여 — 위탁자가 타인 수익자 지정, 실제지급일 등=증여일, 받을 권리 가액=증여재산
상증령 §25①    증여시기: 실제지급일/사망일(1)/약정일(2)/분할=최초지급일(3,단 가·나 예외 실제지급일)
상증령 §25②    분할 시 §61 준용 평가
상증령 §61①1호 동일수익자 = 신탁재산 가액
상증령 §61①2호 가목 원본권=재산−수익권 / 나목 수익권=Σ (수익−원천징수)/(1+이자율)ⁿ
상증령 §61① 단서  해지·철회·취소 일시금 > 각호 평가액이면 일시금 (Max)
상증령 §61②    수익시기 미정 → §62 준용 20년/기대여명
상증칙 §19의2① 이자율 연 1,000분의 30 (3%)
상증칙 §19의2② 수익률 미확정 시 장래 수익금 = 원본 × 1,000분의 30
```
상수 (`legal-codes/inheritance-gift.ts` GIFT.*, 기존 §33 부재): `TRUST_BENEFIT="상증법 §33"`·`TRUST_BENEFIT_VALUATION="상증령 §61"`·`TRUST_BENEFIT_RATE="상증칙 §19의2"`.

---

## input / result 타입 (`gift-deemed/types.ts`)
```ts
export interface TrustBenefitInput {
  beneficiaryType: "same" | "diff_principal" | "diff_income"; // §61①1호/2호가목/2호나목
  trustPropertyValue: number;                 // 평가기준일 현재 신탁재산(원본) 가액
  yieldRate?: { numer: number; denom: number }; // 확정 수익률(미입력=미확정→칙§19의2② 30/1000)
  withholdingRate: { numer: number; denom: number }; // 원천징수세율 (15.4%={154,1000})
  installments: number;                       // 수익 분할 횟수(=현가합 항 수, n=0..installments-1)
  surrenderValue?: number;                    // 해지·철회·취소 일시금 (Max 비교)
  giftTimingType?: "actual" | "decedent_death" | "agreed" | "first_installment"; // §25① echo(표시)
}
```
- `DeemedGiftType` 유니온에 `"trust_benefit"`, `DeemedGiftInput`에 `({type:"trust_benefit"} & TrustBenefitInput)`.
- result = 공통 `DeemedGiftResult` (deemedGiftValue·breakdown·legalBasis). 신규 result 필드 없음.

---

## 알고리즘 (`gift-deemed/trust-benefit.ts` 신규 — §37 패턴 재사용)
```ts
const RATE = { numer: 30, denom: 1000 };      // 칙§19의2 3% — 1/(1.03)ⁿ = 100ⁿ/103ⁿ
const y = input.yieldRate ?? RATE;            // 미확정 → 원본×3%
let R = applyRateFraction(trustPropertyValue, y.numer, y.denom);          // 원본×수익률
R = R - applyRateFraction(R, withholdingRate.numer, withholdingRate.denom); // −원천징수
let incomeRight = 0;
for (let n = 0; n < installments; n++)
  // 1/1.03ⁿ floor — BigInt 거듭제곱 필수 (103**8 > MAX_SAFE_INTEGER → Number 거듭제곱 금지)
  incomeRight += Number((BigInt(R) * 100n ** BigInt(n)) / (103n ** BigInt(n)));
const principalRight = trustPropertyValue;
const benefit =
  beneficiaryType === "diff_income"    ? incomeRight :
  beneficiaryType === "diff_principal" ? Math.max(0, trustPropertyValue - incomeRight) :
                                         incomeRight + principalRight;     // same
const deemedGiftValue = Math.max(benefit, surrenderValue ?? 0);
```
- `applyRateFraction`는 `tax-utils`(§37 사용 중) 재사용 — R은 < 1e15라 Number 안전.
- **PV는 BigInt 거듭제곱**: `(BigInt(R) * 100n**BigInt(n)) / 103n**BigInt(n)` — BigInt 나눗셈은 0방향 절사 = 양수 floor. §37(`safeMultiplyThenDivide`, n≤5 Number)과 달리 신탁은 장기(n 큼) 가능 → BigInt 강제. 전용 헬퍼 `trustIncomePV(R, n)`로 추출.
- breakdown: 회차별 PV 행(installments개) + **원본권 행(diff_income 제외)** + (surrender>benefit 시) 해지일시금 Max 행.

---

## 동기화 지점
| # | 위치 | 작업 |
|---|---|---|
| enum | `gift-deemed/types.ts:9` | `\| "trust_benefit"` |
| union | `types.ts:238` | `({type:"trust_benefit"} & TrustBenefitInput)` + `TrustBenefitInput` export |
| 엔진 | `gift-deemed/trust-benefit.ts` 신규 | `calcTrustBenefit` |
| 라우터 | `gift-deemed/router.ts:24` switch + import | `case "trust_benefit"` |
| 상수 | `legal-codes/inheritance-gift.ts` GIFT.* | TRUST_BENEFIT 등 |
| ⑫ Zod | `lib/validators/gift-deemed-input.ts` | 순수 `z.object`(superRefine 금지) union 멤버 |
| ⑤⑦ UI | (UI 설계 문서) | TYPE_OPTIONS·TrustBenefitFields·결과 breakdown |

## 회귀·리스크
- 기존 18종 무영향(신규 case 추가만). discriminatedUnion 순수 object 제약 준수.
- 800줄: `trust-benefit.ts` 신규 파일(~80줄). types.ts +~15줄.
- 해석 경계(동일수익자 분할 vs 단일·원본 미할인)는 TB-C/TB-1 anchor가 동결.
