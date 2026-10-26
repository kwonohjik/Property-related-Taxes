# 상속 자산 — 피상속인 취득일 비움 · 조기 종료 분기 전반 (⑧)

> **출처**: `redev-successor-inherit-valuation-required.plan.md` §3 V-2 — 「그 밖의 `validateAssetAcquisition` 조기 종료 분기도 피상속인 취득일을 빠뜨리는가 · 실측 안 함」.
> **검증 깊이**: L2 — ⑧만 바뀐다. 엔진·④·⑫는 그대로다. 채운 경우의 세액은 바뀌지 않는다(§3 「채움」 열). 정상 입력에서 계산되던 경로는 닫히지 않는다 — 막히는 입력은 전부 수정 전에도 서버가 400을 냈다.

## 1. 결함 (실측 — route probe, 세율 mock)

⑫는 상속 자산이면 조건 없이 피상속인 취득일을 요구한다(`transfer-tax-schema-refines.ts` 상속 분기 · 컴패니언 `transfer-tax-schema-companion-refines.ts` 상속 arm). ④는 화면의 취득원인을 그대로 싣는다(`transfer-tax-api.ts` `acquisitionCause: primary.acquisitionCause` · `transfer-tax-api-companion-payload.ts` · `transfer-tax-api-mixed-use.ts`). ⑧은 `validateAssetAcquisition`의 일반 상속 분기(5번)에서만 요구했는데, 그보다 먼저 끝나는 분기가 여럿이다.

| 행 | 입력(상속 · 피상속인 취득일 비움) | 수정 전 ⑧ | 수정 전 서버 | 끝나는 자리 |
|---|---|---|---|---|
| C1 | 주택 + 매매에서 남은 추계 플래그 | 통과 | 400 `decedentAcquisitionDate` | 5번 조건 `!isEstimated` |
| C2 | 주택 + 남은 매매사례 플래그 | 통과 | 400 | 0번 매매사례 `return null` |
| C4 | 주택 × 부담부증여 | 통과 | 400 | 5번 조건 `transferType !== "burdened_gift"` |
| C5 | 겸용주택 | 통과 | 400 | 겸용 분기 `validateMixedUseAsset` |
| C6 | 겸용주택 × 부담부증여 | 통과 | 400 | `validateMixedUseBurdenedGift` |
| C7 | 토지 · 다필지 | 통과 | 400 | `validateParcelMode` |
| C8 | 토지 · 1990.8.30. 전(토지등급 환산) | 통과 | 400 | 5번 조건 `!hasPre1990` |
| K1·K2·K3·K5 | 컴패니언 — 부담부증여 · 남은 추계 · 겸용 · 1990 전 토지 | 통과 | 400 `companionAssets.0.decedentAcquisitionDate` | 같음 |
| C0·C9 | 주택·토지 일반 상속(대조) | **막음** | 400 | 5번 |

이미 막던 분기(측정 대상에서 제외 — 코드 확인): 상가 상속(`validateCommercialInheritanceAsset`) · 건물·토지 원인 분리(`validateBuildingCauseSplit`) · 일반건물 토지 상속(`validateGbDecedentDates`) · 재개발 계열(#2586).

## 2. 변경

1. ⑧ `transfer-tax-validate-acquisition.ts` — 분기 본문을 `validateAssetAcquisitionBranches`로 두고, export `validateAssetAcquisition`이 그 결과가 `null`일 때 `inheritedDecedentDateError`(상속 ∧ 피상속인 취득일 비움 → 그 칸)를 마지막 관문으로 건다. 각 분기의 고유 검사(전용 문구 — 일반건물 토지 상속 §95④ 등)가 먼저다.
2. #2586이 재개발·승계 입주권 분기 끝에 붙인 같은 검사 두 줄은 관문이 대신하므로 뺐다(H-4 ×4 · H-4e가 계속 지킨다 — §4 P1).

분기마다 붙이지 않은 이유: 조기 종료 분기가 이미 9곳이고(재개발 2 · 겸용 2 · 다필지 · 매매사례 · 부담부증여 · 추계 · 1990 전), #2586도 한 갈래만 고쳐 같은 갭이 남았다. 새 분기가 생겨도 관문이 받는다.

질문 Q-n 없음 — ⑫와 같은 규칙을 ⑧에 맞추는 것이다(⑧↔⑫ 정합).

## 3. 미검증 · 별건 V-n

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | **상속 + 매매에서 남은 감정 플래그**(`isAppraisalAcquisition`) — 피상속인 취득일을 채워도 ⑧ 통과 ↔ 서버 400 `appraisalValue`(실측 C3). 원인 전환 시 추계 플래그는 증여로 갈 때만 지운다(`giftEstimationClearPatch` — `cause !== "gift"`면 `{}`), 주 자산 ④는 원인과 무관하게 감정을 싣는다(`transfer-tax-api-primary-context.ts` `isAppraisal`). 남은 추계·매매사례 플래그는 같은 상황에서 200(세액 불변 — 무시됨) | ⏳ 별건 · 화면 도달(상속 카드에서 그 플래그가 남는 순서) 미확인. 고칠 층(④ 무시 vs 원인 전환 시 정리)을 정해야 한다 |
| V-3 | 피상속인 취득일을 **조건 없이** 필수로 두는 것이 법과 맞는가 — 소득세법 §104②1호는 §104①2·3호(2년 미만 단기세율)·11호가목 보유기간 기산에, §95④ 단서는 가업상속공제 비율분 장기보유 기산에 이 날짜를 쓴다(리뷰 게이트가 KoreanLaw MCP로 본문 확인 · 2026.1.1. 시행본 기준). 그 밖의 상속(예: 상속 후 2년 이상 보유)에는 쓰이지 않는다 | ⏳ 기존 정책 — ⑫와 일반 상속 분기가 종전부터 조건 없이 요구한다. 이 PR은 ⑧을 ⑫에 맞출 뿐 새 요구를 만들지 않는다. 완화하려면 ⑫·⑧을 함께 바꾸는 별건(§154⑧3호·비사업용 토지 기간 통산 등 다른 쓰임도 조회 필요) |
| V-4 | 지분 분할(축 B) 둘째 이후 카드 · 다필지 · 1990 전 토지 · 남은 추계 화면에서 피상속인 취득일 칸이 보이는가 | ⏳ 브라우저로 확인하지 않음(E2E는 값을 시드로 넣는다). 칸이 안 보이는 화면이 있으면 막다른 길이지만, 그 입력은 수정 전에도 서버 400이었다 |
| V-2 | 상속 자산의 다른 날짜 순서(피상속인 취득일 ≥ 상속개시일) — ⑧ `transfer-tax-validate-asset.ts`가 비교하고 ⑫도 비교한다 | 이 PR 범위 밖 · 측정 안 함 |

## 4. 테스트 · 결과

- 신규 anchor `__tests__/api/transfer.route.inherit-decedent-date-early-return.anchor.test.ts` 26건 — §1 13행 × (비움: ⑧이 `decedentAcquisitionDate`만 짚고 서버도 같은 칸 400 / 채움: ⑧ 통과 · 200 · 세액 불변).
  - 채움 세액: 주택·토지 42,950,000 · 부담부증여 9,768,000 · 1990 전 토지 32,685,000 · 컴패니언 24,110,000 · 98,126,666 · 275,658,000 · 85,510,000(수정 전 probe와 같은 값).
- E2E `e2e/inherit-decedent-date-early-return.spec.ts` DE-1~3(headless Playwright — 사람이 직접 한 브라우저 확인은 아니다): 겸용 상속 · 토지 다필지 상속 비움 → 「계산하기」에서 막히고 요청 없음 / 겸용 채움 → 200.
- 변경 전 안전망: 0건(probe에서 11행 모두 ⑧ 통과 — 이 동작을 지키는 테스트가 없었다).
- 구현 후 mutation:

| P | 무력화 | 실패 |
|---|---|---|
| P1 | 마지막 관문 제거 | 신규 「비움」 11건(C1·C2·C4~C8·K1·K2·K3·K5) · #2586 H-4 ×4 · H-4e · E2E DE-1·DE-2. 대조 C0·C9는 통과(일반 분기 고유 검사) |
| P2 | 관문의 상속 조건 제거 | 컴패니언 4행 × 2(매매 주 자산이 막힘) · #2586 H-1d · H-2d · H-3b · H-3d · H-4e |

### 취득가액 리뷰 게이트(2026-10-26) — FAIL 1 → 반영

- **FAIL 1 반영**: E2E `form` 헬퍼의 인자 타입이 좁아 DE-3에서 tsc TS2353. 넓은 타입으로 고쳤다(tsc 0).
- D 과차단 PASS(④가 화면 원인을 그대로 싣고 ⑫ 상속 arm에 면제 조건 없음) · 전용 메시지 가림 PASS(분기 본문이 `null`일 때만 관문) · 호출처 PASS(비테스트 호출처 `transfer-tax-validate-asset.ts` 1곳).
- 법령: 모순 없음 · 조건 없는 필수 여부는 V-3. V-1을 범위 밖으로 둔 것은 타당 — 다만 감정 플래그가 남은 입력은 이제 피상속인 취득일 오류를 먼저 보고, 감정 오류는 다음 왕복에 본다(추론 · 재현 안 함).
