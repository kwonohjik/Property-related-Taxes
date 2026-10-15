# 통상(비-부담부) 경로 감정가액 × 증축 5년 이내 — §114조의2 가산세 base를 「증축한 부분의 감정가액」으로

> 선행: #2206(부담부증여 K-7 × 증축 — 칸 신설). 그 계획서 §4가 「통상 경로는 `appraisalValue`(건물 전체)를 base로 쓴다 — 별건」으로 남긴 건을 다룬다.

## 1. 법령 (KoreanLaw MCP 본문 확인, 2026-10-15 · 소득세법 MST 280405 시행 2026-01-01 — #2206 계획서 §1과 같은 본문)

「소득세법」 제114조의2 ① 거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에 한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 **감정가액(증축의 경우 증축한 부분에 한정한다)** 또는 환산취득가액(증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 제92조제3항제2호에 따른 양도소득 결정세액에 더한다. ② 제1항은 산출세액이 없는 경우에도 적용한다.

## 2. 결함 (실측)

통상 경로(`transfer-tax-finalize.ts` 「penaltyBase」)는 감정가액이면 `appraisalValue`(건물 전체)를 base로 쓴다. **환산(K-5)** 증축은 이미 증축부분 기준시가 비율로 줄이는데(`resolveExtensionPenaltyBase`) 감정가액만 빠져 있었다.

| 입력 | 종전 | 이 작업 |
|---|---|---|
| housing · 양도가 800M · 감정가액 300M · 증축 120㎡ · 증축부분 감정가액 60M | base 300,000,000 · 가산세 **15,000,000** | base 60,000,000 · 가산세 **3,000,000** |

(probe 실측 — 종전값은 이 작업 직전 master에서 측정. 건물 전체를 증축부분으로 오인해 5배 과대부과한 사례.)

## 3. 설계 결정 (사용자 지시는 「진행해」 — 권고안 적용)

| # | 결정 | 근거 |
|---|---|---|
| D-1 | 새 입력 `extensionAppraisalValue`(자산 단위 · 엔진 `TransferTaxInput` 같은 이름) — 증축부분에 한정한 감정가액. | 조문 문언. 부담부증여는 `bgPresumedExtensionAppraisal`이 같은 역할이라 이 칸은 **제외** |
| D-2 | 칸 노출·⑧ 필수·④ 전송은 한 술어 `generalExtensionAppraisalApplies`(`lib/calc/extension-appraisal-penalty.ts`) = 비-부담부 × 감정가액 × 신축·증축 축 × **증축** × `calculateBuildingPenalty` 게이트(85㎡·5년·2020.1.1). | 칸은 안 뜨는데 엔진이 요구하는 막다른 길 방지 |
| D-3 | 게이트가 열렸는데 값이 없거나 0이면 **오류**(건물 전체로 대신하지 않는다 — 자동 fallback 금지). | CLAUDE.md · 건물 전체는 과대부과 |
| D-4 | 상한 = 감정가액(건물 전체 기준 `appraisalValue`). 공유지분이면 둘 다 같은 지분율로 줄인다(`ratioed`). | 부분 ≤ 전체 |
| D-5 | 엔진은 base를 이미 정한 축(`splitPenaltyAxis` — 분리 취득의 건물 파트·일반건물 카드·부담부증여)이면 읽지도 요구하지도 않는다. | 그 축들은 입력 칸이 따로 있거나(GB 증축 카드) 이 작업 범위 밖 |
| D-6 | 매매사례가액·환산은 종전과 같다(매매사례는 조문에 없음 · 환산은 증축부분 기준시가 비율). | 조문 문언 · 기존 거동 보존 |

14지점: 엔진 타입 `TransferTaxInput.extensionAppraisalValue` · helper `resolveExtensionPenaltyBase(…, penaltyMethod)`(finalize·loss-return 공유) · ① `AssetForm.extensionAppraisalValue`(+②factory·③`fillMissingFromFactory`·주택→토지 전환 리셋) · ④ `transfer-tax-api.ts`·`multi-transfer-tax-api.ts` · ⑤ `SelfBuiltSection` · ⑧ `transfer-tax-validate-acquisition.ts` · ⑫ `transfer-tax-schema-base-shape.ts` · ⑭ `engine-input.ts`·`multi/route.ts`. ⑥ 사이드바 해당 없음 · ⑦ 가산세 산식은 엔진 step이 base를 그대로 적는다.

## 4. 범위 밖 (확인 필요)
- **함께 양도(컴패니언)·지분 카드의 신축·증축 입력은 엔진에 닿지 않는다** — 별건(후속 PR에서 다룬다). 이 작업의 칸도 주 자산·다건 주 자산만 전송한다(④ `primary`).
- 분리 취득(토지·건물 취득일 상이)의 건물 파트가 감정가액이고 증축인 경우 — 칸이 없고 종전대로(건물 파트 base). 일반건물(`general_building`)의 증축은 카드가 따로 있어 base가 이미 증축 한정이다.
- ⑧은 종전대로 증축에서 「증축부분 취득당시 기준시가」를 요구한다(감정가액 base에는 쓰이지 않으나 환산 전환 시 필요) — 이 작업에서 바꾸지 않는다.

## 5. 검증
- 엔진 anchor `__tests__/tax-engine/transfer-tax/general-extension-appraisal-penalty.anchor.test.ts`(10) · 클라이언트 `__tests__/calc/general-extension-appraisal.anchor.test.ts`(17) · UI `__tests__/components/self-built-extension-appraisal-ui.anchor.test.tsx`(12) · E2E `e2e/transfer-extension-appraisal-penalty.spec.ts`(EA-1~3) · 필드점프 케이스 2건.
- 뮤테이션 16종 전부 KILLED(처음 M16 「지분 스케일 제거」 생존 → 지분 anchor 보강 후 KILLED).
- 사람이 브라우저로 직접 한 수동 확인은 없음(headless Playwright만).
