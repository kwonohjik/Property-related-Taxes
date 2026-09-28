# 증여 별지 제10호서식 부표1 ⑤ 수량(면적)·⑥ 단가 — #101 대안 설계

> 출처: `docs/review/gift-39/I-gift-tax-handoff.md` 「증여 별지 제10호서식 부표1이 중립 수량 필드 `quantityCount`를
> 읽지 않아 §39 건 ⑤·⑥이 공란 — 단, 원 수정안은 법령상 채택 금지」(low · 세액 영향 0)
> 상태: ✅ **구현 완료(2026-09-28)** — 사용자 채택: 「§39 공란 고정 + 면적 표시」

## 1. 두 수정안이 모두 틀렸다

| 안 | 내용 | 판정 |
|---|---|---|
| 원 수정안 | §39 행 ⑤ = 40,000주 · ⑥ = 2,500원(엔진 산출근거 주입) | ❌ 리뷰 법령 렌즈 기각 — 「상증법」§39①은 「그 이익에 상당하는 **금액**」을 증여재산가액으로 하고, 「상증칙」 별지 제10호서식 부표1 작성방법에 ⑤·⑥ 기재 지시가 없다. 그 단가는 주식 평가단가(7,500)도 인수가액(5,000)도 아니다 |
| 리뷰 대안 | ⑤ = `listedStockShares ?? quantityCount` | ❌ **효과 0 (이번 실측)** — `quantityCount`를 쓰는 유일한 위젯 `EstateValuationMetaSection`은 `EstateItemAdvancedPanel` 안에 있고, 그 패널은 `mode === "inheritance"`에서만 렌더된다(`EstateItemEditor.tsx:273`). 증여 마법사에는 입력 경로가 없다 |

## 2. 실측 — 증여에서 **입력되는데 버려지는** 값

`GiftTaxValuationFormTable` 직접 렌더(수정 전):

| 행 | 입력 | ⑤ | ⑥ |
|---|---|---|---|
| 아파트 | `areaSqm` 84.5 | **공란** | 공란 |
| §39 증자이익(이관) | — | 공란 | 공란 |
| 기타재산 | `quantityCount` 3 | 공란 | 공란 |
| 상장주식 | 1,000주 · 50,000 | 1,000 | 50,000 |

`areaSqm`의 증여 모드 쓰기 경로 2곳: 공용 부동산 카드 동·호 조회 자동채움(`EstateBodyHelpers.ts:103`) ·
부담부증여 면적 입력(`BurdenedGiftTransferSection.tsx:282·315`). 상속 부표2는 이미 ⑤에 면적을 싣는다
(`besshi-buppyo-2-data.ts:307`) — 증여 부표1만 버렸다.

## 3. 설계

- `lib/calc/gift-valuation-besshi.ts` `buppyo1QuantityOrArea(item)` — 화면·PDF 단일 출처.
  상장주식 주식수 → 부동산(`category` `real_estate*`) 면적 → 그 밖 공란.
  - 카테고리 게이트: 카테고리를 바꿔도 `areaSqm`이 남을 수 있다(stale 잔존 차단).
  - `quantityCount`는 읽지 않는다(입력 경로 없음 — 읽으면 저장 데이터 잔존분만 새어 나온다).
- ⑥ 단가는 변경 없음(상장주식 평균단가만 — 상속 부표2와 동일).
- §39 등 증여의제 이관 항목은 **공란 유지**를 anchor로 고정한다(엔진 산출근거가 실재함을 함께 단언 —
  「없어서 안 찍힌다」가 아니라 「있어도 싣지 않는다」).

## 4. 검증

- anchor `__tests__/components/calc/results/gift-buppyo1-quantity-101.anchor.test.tsx` B1-1~6
  (fail-first 2 — 화면·PDF 면적 / 가드 4 — 상장주식 짝·§39 공란·stale areaSqm·quantityCount 미독)
- E2E `gift-burdened-transfer.spec.ts` [BT-E2E-4]: 토지 100㎡ → 부표1 ⑤ = 100 · ⑥ 공란
