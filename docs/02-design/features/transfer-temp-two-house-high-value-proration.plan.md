# 일시적 2주택 §155① 고가주택 12억 초과분 안분 누락 수정 계획서

> 작성: 2026-07-23 · 상태: **Do 완료** (anchor RED→GREEN · 회귀 2,979건 0실패 · API 실측 확인)
> 증상 보고: 양도가액 14억 · 일시적 2주택 특례 → 양도차익 9억 전액 비과세(세액 0) 처리

## 1. 증상 및 실증 (probe 실측 완료)

사용자 사례: 취득 2017-05-02(5억) · 신규주택 취득 2023-03-05 · 양도 2026-02-16(14억) · §155① 요건 A·B 충족.

**현행 엔진 실측** (throwaway probe, `calculateTransferTax` + `baseTransferInput` + `makeMockRates`, 2026-07-23):

```
isExempt: true, exemptReason: "일시적 2주택 비과세",
transferGain: 0, taxableGain: 0, calculatedTax: 0, totalTax: 0
```

→ 양도가액 12억 초과인데도 **전액 비과세**. 신고서 양식에도 비과세 양도차익 900,000,000 / 과세대상 0으로 표시됨(스크린샷 재현 일치).

## 2. 법적 근거

- 소득세법 §89①3호: 1세대1주택 비과세는 **고가주택(양도가액 12억 초과) 제외**.
- 소득세법 §95③·시행령 §160: 고가주택 양도차익 = 전체 양도차익 × (양도가액 − 12억) / 양도가액 안분.
- 시행령 §155①: 일시적 2주택은 "이를 1세대 1주택으로 **보아** 제154조제1항을 적용" — 1세대1주택 의제이므로 고가주택 배제·안분 규정(§89①3괄호·§95③)도 동일 적용. 일시적 2주택이라고 12억 상한이 면제된다는 명문 규정 없음.
- 기존 엔진도 동일 취지로 구현済: 합가 특례(§155④⑤)·대체주택(§156의2⑤)·기본 1주택 경로 모두 12억 체크 있음(아래 §3).

## 3. 원인 분석 (file:line 실측)

`lib/tax-engine/transfer-tax-exemption.ts` `checkExemption()`의 비과세 반환 4개 지점 중 **E-3(일시적 2주택)만 가격 체크 부재**:

| 경로 | 위치 | `maxExemptPrice`(12억) 체크 | 고가 시 `isPartialExempt` |
|---|---|---|---|
| E-5 대체주택 §156의2⑤ | :287-302 | ✅ `priceCheck <= rule.maxExemptPrice` | ✅ |
| **E-3 일시적 2주택 §155①** | **:344-349** | **❌ 없음 — `timing.overall`이면 무조건 전액 비과세** | ❌ |
| E-3.5 합가 §155④⑤ | :367-373 | ✅ | ✅ |
| E-1/E-2 기본 1주택 | :390-400 | ✅ | ✅ |

다운스트림 12억 초과분 안분(§160)은 `transfer-tax.ts:445` `if (exemptionResult.isPartialExempt)` → `calcOneHouseProration`으로 **이미 구현되어 있음**. E-3가 `isPartialExempt`를 반환하지 않아 이 경로에 도달하지 못하는 것이 원인.

## 4. 수정안

`transfer-tax-exemption.ts` E-3 반환부(:344-349)에 다른 경로와 동일한 priceCheck 패턴 적용:

```ts
if (timing.overall) {
  const provisoLabel = provisoRelaxesHolding
    ? ` (§154① 단서 ${PROVISO_LABEL[provisoReason!]})`
    : "";
  const priceCheck =
    input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
  if (priceCheck <= rule.maxExemptPrice) {
    return { isExempt: true, isPartialExempt: false, exemptReason: `일시적 2주택 비과세${provisoLabel}` };
  }
  return { isExempt: false, isPartialExempt: true, exemptReason: `일시적 2주택 고가주택${provisoLabel}` };
}
```

- `priceCheck` 우선순위(부담부 분모 > 지분 총양도가 > 단독 양도가)는 E-1/E-3.5/E-5와 동일한 기존 패턴 복제 — 신규 정책 없음.
- 신규 `exemptReason` 문자열: `일시적 2주택 고가주택`. (소비처 grep 결과 완전일치 매칭 없음 — `new-99-4-integration.test.ts:84`의 `toContain("일시적 2주택")`은 비과세 케이스로 계속 통과. enum substring 정책 위반 아님: reason은 표시 전용.)
- 엔진 **input·result 타입 변경 없음** → 14개 동기화 지점 미해당. UI·API·Zod·validation 무변경.
- 판정 카드(Step4)는 이미 "최종 비과세 여부는 계산 결과에서 확정됩니다" 안내가 있어 UI 문구 변경 불요.

### 파급 경로 (2026-07-23 재검증 — 정정 반영)

- **`checkExemption` 경유 경로 (수정 자동 전파)**: 단건(`transfer-tax.ts:262`)·다건(`transfer-tax-aggregate` — 단건 엔진 반복 호출)·번들(`bundled-split-helpers` — 단건 엔진 입력 조립)·부담부증여(분모 = giftValuation C) → 별도 수정 없음.
- **겸용(mixed-use)은 `checkExemption` 미경유 — 본 버그 없음** (검증: mixed-use 파일 전체에서 `checkExemption` grep 0건): `asset.isOneHouseExempt`를 API 변환 레이어에서 파생(`lib/calc/transfer-tax-api-mixed-use.ts:186-189` — 1세대 + (1주택 ∨ 2주택+일시적 특례 토글))하고, `buildHousingPart`(`transfer-tax-mixed-use-helpers.ts:659-688`)가 **자체적으로 12억 초과 안분(proratio)을 이미 수행**. 즉 겸용 일시적 2주택 고가는 현행도 부분과세로 처리됨 → 수정·회귀 대상 아님. (겸용은 §155① 타이밍을 엔진 검증 없이 UI 토글 신뢰 — 기존 설계, 본 건 범위 외.)
- 참고: 비과세 가격 게이트는 `rule.maxExemptPrice`(DB), 다운스트림 안분 임계는 `calcOneHouseProration` 하드코딩 12억(`transfer-tax-helpers.ts:392-402`) — E-1/E-2도 동일 이중 구조로 본 수정이 새 모순을 만들지 않음(둘 다 현행 12억).

## 5. 케이스 매트릭스

| # | 양도가 | §155① 요건 | 기대 결과 |
|---|---|---|---|
| M1 | 12억 이하 | 충족 | 전액 비과세 (현행 유지 — 회귀 0) |
| M2 | 12억 초과 | 충족 | **부분과세**: 과세 양도차익 = 전체차익 × (양도가−12억)/양도가, 장특공제·세율은 기존 E-2 고가주택 경로와 동일 |
| M3 | 12억 초과 | 미충족(기한 초과 등) | 일반 과세 + (조건 충족 시) 다주택 중과 — 현행 유지 |
| M4 | 12억 초과 + §154① 단서 사유(1·2가·3호) | 충족 | 부분과세 + reason에 단서 라벨 병기 |
| M5 | 부담부증여 분모(giftValuation) 12억 초과 | 충족 | 분모 기준 부분과세 (E-1과 동일 우선순위) |
| M6 | 지분양도 totalPropertyTransferPrice 12억 초과·지분가 12억 이하 | 충족 | 총양도가 기준 부분과세 |

## 6. Pre-Do anchor (Do 진입 전 작성·실행)

파일: `__tests__/tax-engine/transfer/temporary-two-house-high-value.anchor.test.ts`

- **A1 (사용자 사례 = M2)**: 14억/5억, 취득 2017-05-02, 신규 2023-03-05, 양도 2026-02-16, 거주 0.
  - 기대 산식 체인: 양도차익 9억 → 과세분 `floor(9억 × 2/14)` = **128,571,428** (`calculateProration` floor 실측 확인) → 장특공제 표1(거주 2년 미충족 — 표2 배제, 보유 8년) → 누진세율.
  - 표1 분기 근거: 기존 anchor `new-99-4-integration.test.ts` B-5("양도 15억·거주 1년 → 부분과세 + 표1, 39,910,000")가 동일 분기를 이미 실증 — E-3 fix는 같은 partial-exempt 경로에 합류.
  - 최종 세액 원단위 anchor는 **anchor 최초 실행값으로 확정**(mock 세율표 기준) — "현행 일치 예상" 단정 금지, 실측 후 `toBe()` 고정.
- **A2 (M1 회귀)**: 동일 조건 양도가 11억 → `isExempt: true`, 세액 0.
- **A3 (M4)**: 14억 + proviso(예: expropriation) → `isPartialExempt` + reason 라벨 확인.
- (선택) A4 (M6): 지분 모드 분모 검증.

## 7. 테스트·검증 계획

1. Pre-Do anchor A1~A3 작성 → 현행 엔진에서 **A1·A3 실패(전액 비과세) 확인** = 버그 재현 테스트.
2. §4 수정 적용 → A1~A3 통과.
3. 회귀: `npx vitest run __tests__/tax-engine/transfer/ __tests__/tax-engine/transfer-tax/` (특히 `temporary-two-house-*.anchor`, `reductions-and-exempt`(T-33·T-34), `new-99-4-integration` B-4, mixed-use 계열) — 회귀 허용치 0.
4. `npm run check:pre-pr`.
5. 브라우저 확인: 스크린샷 동일 입력(14억) → 결과뷰에 "과세 양도차익 (12억 초과분)" 스텝 + 세액 > 0 표시. E2E `transfer-155-temp-two-house-auto-judge.spec.ts` 회귀.

## 8. 연관 갭 (본 수정 범위 외 — 별도 결정 필요)

**Gap B — E-3 거주요건 미검사**: E-3는 종전주택 **보유연수만** 검사(`:319-322`, `minHoldingYears`)하고 `meetsOneHouseHoldingResidence`(취득시 조정대상지역 2년 거주 + 2017-08-03 경과규정)를 호출하지 않음. E-3.5(:364)·E-4(:381)는 호출함. §155①이 §154①을 전부 준용한다면 취득시 조정지역 종전주택은 거주 2년 미충족 시 비과세 배제되어야 할 수 있음.
→ **확인 필요**: Do 전 KoreanLaw로 §155① 본문·집행기준 검증 후 별도 건으로 진행 여부 결정 (본 계획서 범위에 포함하지 않음 — 법 근거 없이 불리 적용 금지 정책).

## 9. 완료 기준 (Definition of Done)

- [x] anchor A1~A3 작성·수정 전 실패 확인(A1·A3 RED)·수정 후 통과 (`temporary-two-house-high-value.anchor.test.ts`)
- [x] 케이스 매트릭스: M1(A2)·M2(A1)·M4(A3) anchor / M3 기존 T-33·T-34 / M5·M6 우선순위 체인이 E-1과 동일 코드 복제 + 기존 회귀 통과
- [x] `npx tsc --noEmit` 0건 · 양도세 전체 vitest 264파일 2,979건 통과 (2026-07-23)
- [x] API 엔드투엔드 실측(dev 서버 `/api/calc/transfer`, 14억 사례): `exemptReason "일시적 2주택 고가주택"` · taxableGain 128,571,428 · 표1 16% 장특 20,571,428 · totalTax 23,633,500. E2E `transfer-155`·`transfer-154-proviso`·`regulated-auto` 14/14 통과. (마법사 전체 플로우 브라우저 수동 확인은 미수행 — 결과뷰는 엔진 steps 범용 렌더)
- [ ] Gap B(§155① 거주요건 전부 준용 여부) 검증 — 별도 건으로 분리, 미착수
