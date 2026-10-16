# 부담부증여 × 재개발 완공 아파트(원조합원) × 환산(K-5) — 시행령 §166③

> 상태: Do 완료 (2026-10-16) · 사용자 결정: 「§166③대로 구현」(차단·보류 대안 기각) · 선행 설계 `docs/02-design/features/burdened-gift-redevelopment-assets.engine.design.md`

## 1. 법령 (KoreanLaw MCP — 소득세법 시행령 MST 290841, 시행 2026-10-01)

- §166①1호 인가전양도차익 = (기존건물과 그 부수토지의 평가액 − 그 취득가액) − 「법 §97①2호 및 3호 **또는** 제163조제6항」의 필요경비
- §166②1호 신축주택 양도 — 인가전양도차익을 그대로 쓴다
- §166③ 기존건물과 그 부수토지의 취득가액을 **확인할 수 없는 경우** = 평가액 × 취득일 현재 기준시가 ÷ 관리처분계획등 인가일 현재 기준시가
- §159①1호·2호 부담부증여 — 취득가액·양도가액 = 각 가액 × 채무액 ÷ 증여가액

## 2. 결함 (실측 — 시가 15억 · 채무 6억 r 0.4 · 평가액 5억 · 납부 청산금 2억 · 취득일 기준시가 3억 · 인가일 4억)

| | 종전 | 수정 |
|---|---|---|
| 인가전 취득가액 | 120,000,000 (§176의2②2호 — 안분 양도가 6억 × 3억 ÷ **신축주택** 15억) | 150,000,000 (평가액 5억 × 0.4 × 3억 ÷ 4억) |
| 인가전 필요경비 | 입력 실비 × r (1천만 → 4,000,000 / 0 → 0) · 개산공제 버림 | 개산공제 3억 × 0.4 × 3% = 3,600,000 (실비는 택일로 쓰지 않음) |
| 인가전 양도차익 | 76,000,000 / 80,000,000 | 46,400,000 |

화면도 어긋나 있었다 — 부담부증여에서도 재개발 블록 ⑤ 「인가전 분 종전 부동산 취득가액」 라디오·칸이 떠서 ⑧이 엔진이 읽지 않는 값을 요구했고, §166③의 인가일 기준시가 칸은 그 라디오가 「환산」일 때만 떴다.

## 3. 설계

- **엔진**: `transfer-tax-burdened-gift-step.ts` — 완공 아파트(원조합원) × §159 명세 `converted`일 때만 `useEstimatedAcquisition: true`로 §166 경로의 §166③ 분기를 켠다. 평가액은 β로 이미 r배라 §166③ 결과가 그대로 §159①1호 안분값이다(기준시가는 비율항). `redevelopment-split.ts` Step B 개산공제 base = 기준시가 × 지분율 × r. `redevelopment.ts` 가드는 입주권(K-4 전용, 설계 D-2)에만 남긴다.
- **leaf** `lib/calc/redev-pre-approval-acq-mode.ts` — `actual | estimated | burdened_gift`. 부담부증여는 ⑤ 라디오가 아니라 K-4/K-5가 정한다(승계조합원·입주권·기준시가 모드는 `burdened_gift`). 소비: ⑤ `RedevelopmentBlock`(K-5는 라디오 없이 §166③ 칸 · 그 밖의 부담부증여는 섹션 숨김)·`RedevelopmentValuationSection` 미리보기, ⑧ `transfer-tax-validate-redev.ts`·`transfer-tax-validate-bg.ts`·`burdened-gift-acq-std-price.ts`(일반 환산 분자 「취득시 기준시가」 미요구), ④ `transfer-tax-api.ts` `useEstimatedAcquisition`(숨은 라디오 stale 차단 — ⑫ §166③ 분모 refine 정합), PHD 트리거 `redev-phd-trigger.ts`.
- **⑦** `BurdenedGiftDetailCard` — `redevSec166DisplayOf(result)`가 있으면 일반 환산 행 대신 §166③ 취득가액·개산공제 행. BG K-5 안내 문구(`BurdenedGiftBlock`)도 §166③으로.

### 해석 결정 (명문 없음 — 확인 필요)
- 개산공제에 채무비율을 곱하는 것: §159①은 취득가액·양도가액만 안분한다. β 설계(평가액·청산금·필요경비 절대항 안분 — `redevelopment-burdened-gift.ts` 헤더)와 같은 축으로 확장했다. 선례 조사는 β 설계 때 0건이었다.
- 인가전 필요경비 택일: 환산이면 개산공제만, 실가면 실비만 — 비-부담부 재개발 경로(`preApprovalNecessaryExpense`)와 같은 규칙.

## 4. 검증

- 엔진 anchor `burdened-gift-redevelopment-apt.anchor.test.ts` A-A6 K5-1~6
- 클라이언트 anchor `bg-redevelopment-sec166-conversion.anchor.test.tsx` 24건 (leaf 8 · PHD 2 · ⑧ 7 · ⑤ 3 · ④→엔진·⑦ 4)
- 뮤테이션 13종 전부 KILLED
- E2E `transfer-bg-redevelopment-sec166.spec.ts` RB-1(§166③ 칸 · 150,000,000 · 3,600,000)·RB-2(K-4 섹션 없음) · 재개발·BG 관련 기존 19 spec + 필드점프 634 passed (skip 21은 스펙의 `unreachableInUi`)
- 사람이 브라우저로 직접 한 수동 확인은 없다(headless Playwright만)

## 5. 범위 밖

- 부담부증여 K-4에서 ⑤ 섹션을 숨긴 대신 실지취득가액은 부담부증여 블록 칸 하나로만 받는다(종전 이중 입력 해소). 사이드바 자산별 행(`transfer-per-asset-direct.ts`)은 재개발이면 여전히 `redevActualAcquisitionPrice`를 읽는다 — 부담부증여 표시는 별건(확인 필요)
- `BurdenedGiftBlock.tsx` 796줄 · `TransferTaxResultView.tsx` 785줄 — 800줄 트리거 직전
