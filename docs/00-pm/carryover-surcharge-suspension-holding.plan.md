# 이월과세 주택의 다주택 중과 한시배제 보유기간 (2026-11-07)

> 근거: `docs/00-pm/roster-fallback-surcharge-bundle.plan.md` §4 🔴 (PR #2977에서 발견 · 범위 밖으로 남긴 결함)

## 1. 법령 (KoreanLaw MCP 본문 확인)

- 영 §167의10①12의2(·§167의3①12의2): 「법 제95조제4항에 따른 **보유기간이 2년** … 이상인 주택을 2022년 5월 10일부터 2026년 5월 9일까지 양도하는 경우」 — 중과 배제.
- 소득세법 §95④ 단서: §97의2①(이월과세)에 해당하는 자산은 **증여자가 그 자산을 취득한 날**부터 보유기간을 기산한다.
- ⇒ 증여받은 지 2년이 안 됐어도 증여자 취득일부터 2년 이상이면 한시배제 대상이다.

## 2. 실측 (수정 전 · route 경유 · `makeMockRatesWithHouseEngine`)

사례: 서울 강남구(조정) · 2주택 · 양도 2026-03-01 15억 · 당초 증여 2025-06-01 평가 10억 · 증여자 취득 2000-06-01 1억 · 직계존속.

| 셀 | 명부(정밀) | fallback | 비고 |
|---|---|---|---|
| 단순 이월과세 | 842,435,000 (0.65 중과) | 374,610,000 (0.42 한시배제) | 🔴 명부가 틀림 |
| 채무 4억 인수(증여분 + 매입분) | 623,110,000 (증여분 0.62) | 349,270,000 (증여분 0.42 · 매입분 0.70) | 🔴 명부가 틀림 |
| 대조: 양도 2026-07-01(창 밖) | 842,435,000 | 842,435,000 | 같음 |
| 대조: 증여자 취득 2025-01-01(증여자 보유도 2년 미만) | 842,435,000 (중과) | 838,500,000 (0.60) | 🔴 fallback이 틀림(아래 원인 2) |

일반 매매(엔진 직접 · 15억/1억 · 양도 2026-03-01): 2025-01-01 취득 — 명부 842,435,000 · fallback 838,500,000. 2023-01-01 취득은 둘 다 525,135,000(같음).

## 3. 원인

1. **명부 경로** — 12의2·12호 보유 판정(`multi-house-surcharge-exclusion.ts`)이 양도 주택 행의 `shareAcquisitionDate ?? acquisitionDate`로 센다.
   ④가 싣는 이월과세 양도 행 취득일은 증여 등기일이다(`primaryAcquisitionDateOf` — 주택 수 선후·§155① 축이 같은 값을 읽는다).
   시나리오 A 입력(`transfer-tax-carryover.ts`)은 본문 `acquisitionDate`만 증여자 취득일로 바꾸고 명부 행은 그대로라 한시배제가 빠졌다.
2. **fallback** — `resolveSurchargeApplication`이 한시배제를 양도일 창(`isSurchargeSuspended`)만으로 판정해 12의2 본문의 보유 2년 요건을 보지 않았다.
   보유 1~2년 양도에서 §104⑦ 비교과세(단기 60% ↔ 기본세율 + 20%p)가 빠진다(보유 1년 미만은 단기 70%가 늘 커서 세액이 같다).

## 4. 처방

| 층 | 바꾸는 것 |
|---|---|
| 타입 | `HouseInfo.holdingPeriodStartDate?` — 행의 §95④ 보유 기산일(행 취득일과 다를 때). `TransferTaxInput.carryoverHoldingStartDate?` — 엔진 내부 값 |
| 엔진 | 시나리오 A가 `carryoverHoldingStartDate`를 싣는다(부담부증여는 `bgCarryoverPartDates`의 건물 기산일 — 본문 `acquisitionDate`와 같은 값). STEP 0.5가 양도 행에 옮긴다 |
| 엔진 | 12의2·12호 보유 판정이 `holdingPeriodStartDate ?? shareAcquisitionDate ?? acquisitionDate`로 센다(`surchargeHoldingStartDate`) |
| 엔진 | fallback 한시배제에 `meetsSurchargeSuspensionHolding(input.acquisitionDate, 양도일)`을 더한다(취득일이 없는 겸용 자산별 fallback은 종전 그대로) |

행 취득일은 바꾸지 않는다 — 주택 수 선후·일시적 2주택·제9270호 부칙 §14① 「취득한」(위기취득)은 이번 결함과 별개 축이다.
매입분 조각(`carryover-debt-pieces.ts`)은 원 카드로 `buildInputB`를 만들어 새 필드가 실리지 않는다 — 증여 등기일 기산 그대로(C-2에서 0.70 확인).

## 5. anchor

- `__tests__/api/transfer.route.carryover-surcharge-suspension-holding.anchor.test.ts` C-1~C-5 — 명부 = fallback · 매입분 불변 · 창 밖 · 증여자 보유 2년 미만 · 증여 2년 이상 회귀.
- `__tests__/tax-engine/transfer/roster-fallback-surcharge-parity.anchor.test.ts` F-4 — fallback 보유 2년 경계(2024-03-02 = 2년 · 2024-03-03 = 미만, 초일 산입).
- mutation: 엔진 수정을 되돌리면 C-1·C-2·C-4 실패, fallback 게이트만 되돌리면 F-4 2건 실패.

## 6. 범위 밖 · 확인 필요

- 화면 게이트(④ 중과 섹션 숨김 `isMultiHouseSurchargeSuppressed` · `GracePeriodSection` · `spouse-holding-scope`)는 이월과세 자산에서 증여 등기일(또는 빈 값)을 읽는다.
  엔진은 §97의2②3호 비교(이월과세 적용 여부)를 계산 뒤에 정하므로 화면이 미리 증여자 취득일로 숨길 수 없다 — 질문이 더 보일 뿐 세액에는 닿지 않는다(이번에는 바꾸지 않음).
- E2E `carryover-gift-debt-purchased-part`의 「비조정」 고정(PR #2977)은 사례 머리말 조건이라 그대로 둔다.
- 겸용주택 자산별 fallback은 취득일을 넘기지 않아 보유 2년 요건을 보지 않았다(위 「종전 그대로」) — `docs/00-pm/surcharge-oos-remaining.plan.md` A에서 건물 취득일로 고쳤다.
