# Do TODO — §114의2 부담부증여 양도분 환산 5% 가산세

> 단일 응답 완주. anchor 선확정 → 엔진 결선 → 양탭 입력전달 → 증여세 14지점 → E2E → 회귀 → 품질게이트.

## 체크리스트

- [x] 0. 엔진 핵심 코드 실측 — 활성화 결선 방법 확정(A step·B finalize·C 조기반환)
- [x] 1. Pre-Do anchor 5종 작성·실행 → 실패 확보·결선 후 5/5 green
- [x] 2. 엔진 결선 A: transfer-tax-burdened-gift-step.ts override (K-5+isSelfBuilt → estimated·usedEstimatedAcquisition·estimatedBase=building)
- [x] 3. 엔진 결선 B: finalize.ts:313-314 penaltyBase 게이트 effectiveInput 참조
- [x] 4. 엔진 결선 C: transfer-tax.ts:386-388 pb0 + penaltyBase 조기반환(§114의2②)
- [~] 5. 엔진 결선 D: general-building B경로 → **Phase 2 SCOPE OUT 환류** (증여세 미도달·양도세 general_building 엣지·payload 3단계)
- [x] 6. 증여세 ① 폼타입 BurdenedGiftTransferTaxInput 신축 4필드
- [x] 7. 증여세 ②③ createEmptyBgt + hasData + normalize(constructionDate toOptionalDate)
- [x] 8. 증여세 ④⑬ gift-burdened-transfer-api body 신축필드(시가+converted+건물 한정)
- [x] 9. 증여세 ⑤ UI BurdenedGiftValuationModeSection K-5 신축 위젯(ToggleCard+RadioCardGroup name+DateInput)
- [x] 10. 증여세 ⑧ validation (converted+!land standardPrice>0 + isSelfBuilt 시 constructionDate 필수)
- [x] 11. 증여세 ⑦ 결과카드 BurdenedTransferTaxResultCard penalty Row(지방소득세 base 정합)
- [x] 12. 양도세 입력전달 — transfer-tax-api.ts:380-387 신축필드 body 기존 전달(신규 0 확인)
- [x] 13. 엔진 anchor 5/5 + 부담부 회귀 40/40 green
- [x] 14. tsc 0 + 전체 npm test 회귀 0(9091) + 14지점 grep(⑬3·⑫1)
- [x] E2E: gift-burdened-transfer.spec §114의2 신축 흐름 + body 검증 (9/9 green)
- [x] 15. 코드 품질 게이트(code-analyzer) — Critical 0·Important 4: #1#2(store stale 초기화) 수정·재검증, #3(extension Phase2 앵커 주석), #4(transferPrice placeholder — 기존코드 범위밖 기록). 수정 후 tsc 0·anchor 5/5·E2E 3/3 재검증
