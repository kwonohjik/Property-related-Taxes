# 계획서 — 12억 초과분 과세 양도차익 산식 분모 금액 누락 버그 수정

## 1. 증상 (사용자 보고 이미지)

1세대1주택 고가주택(12억 초과) 부분과세 결과 카드의 산식에서 **마지막 분모가 라벨만 표시되고 금액이 빠짐**.

```
과세 양도차익 (12억 초과분)                                    69,230,769
900,000,000 × (양도가 1,300,000,000 - 12억) / 양도가          ← 마지막 "양도가" 뒤에 금액 없음
소득세법 §89
```

- 앞 분자 항 `(양도가 1,300,000,000 - 12억)` → 라벨 + 금액 정상
- 뒤 분모 항 `/ 양도가` → **라벨만, 금액 누락** (버그)

## 2. 원인 (실측)

`lib/tax-engine/transfer-tax.ts:494` — 부분과세(`exemptionResult.isPartialExempt`) step의 `formula` 조립 문자열.

```ts
// lib/tax-engine/transfer-tax.ts:492-497
steps.push({
  label: "과세 양도차익 (12억 초과분)",
  formula: `${transferGain.toLocaleString()} × (${denomLabel} ${denom.toLocaleString()} - 12억) / ${denomLabel}`,
  //          분자 항: 라벨+금액 ✓                    분모 항: 라벨만 ✗ (금액 미삽입)
  amount: taxableGain,
  legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
});
```

`${denomLabel}` 뒤에 `${denom.toLocaleString()}`이 붙지 않아 분모 금액이 렌더링되지 않음.

`denomLabel`/`denom`은 바로 위(482–491행)에서 세 경우로 분기:

| 경우 | denomLabel | denom |
|---|---|---|
| 부담부증여 (`burdenedGiftDenominator` 존재) | `증여가액 C` | `burdenedGiftDenominator` |
| 지분 (`totalPropertyTransferPrice ≠ transferPrice`) | `총양도가` | `totalPropertyTransferPrice` |
| 단독 | `양도가` | `transferPrice` |

→ 세 경우 모두 동일한 formula 템플릿을 쓰므로, 한 곳 수정으로 세 케이스가 함께 해결됨.

## 3. 수정 (원-라인, surgical)

`transfer-tax.ts:494` 의 분모 항에 금액 삽입:

```ts
// Before
formula: `${transferGain.toLocaleString()} × (${denomLabel} ${denom.toLocaleString()} - 12억) / ${denomLabel}`,

// After
formula: `${transferGain.toLocaleString()} × (${denomLabel} ${denom.toLocaleString()} - 12억) / ${denomLabel} ${denom.toLocaleString()}`,
```

결과 산식:
```
900,000,000 × (양도가 1,300,000,000 - 12억) / 양도가 1,300,000,000
```

- 계산 로직(`amount`, `taxableGain`)은 무변경 — **표시 문자열만 수정**.
- 다른 파일 무변경. `calcOneHouseProration` 등 산정 함수 미접촉.

## 4. 검증

**성공 기준**: 산식 분모에 금액이 표시되고, 세 분기(단독·지분·부담부증여) 모두 정상.

1. **회귀 안전 확인** — `formula` 문자열을 직접 assertion하는 테스트 부재 확인 완료(`grep .formula` → 12억/과세 양도차익 매칭 0건). 문자열 수정이 기존 테스트를 깨지 않음. → verify: `npx vitest run __tests__/tax-engine/transfer/` 그린 유지.
2. **타입/린트** → verify: `npx tsc --noEmit` 0건.
3. **브라우저 수동 확인** — 1세대1주택 + 양도가 13억(고가주택) 케이스 계산 → 결과 카드 "과세 양도차익 (12억 초과분)" 산식 분모에 `1,300,000,000` 표시 확인. amount `69,230,769` 불변.

## 5. 범위 밖 (touch 안 함)

- 재개발 경로(`transfer-tax-redevelopment.ts:91,143`)·겸용주택(`MixedUseResultCard.tsx:342`)은 이미 분모에 `양도가액` + 금액 또는 `÷ 양도가액` 표기가 별도 구현되어 있어 본 버그와 무관 → 수정 대상 아님.
