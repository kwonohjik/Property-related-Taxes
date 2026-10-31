# 부담부증여 축 B(지분 분할 취득) × 시가 모드 × 담보 승 — ⑧ 거짓 차단 해소 · ⑤ 칸 · ⑫ 요구 정합 (S-1)

`bg-nonsupp-winner-support.plan.md` §4.1의 첫 단계. 착수 순서는 사용자 결정(S-1 → S-2 → I-0 → I-1 → 질의 병행 → I-2·M-1).

## 1. 배경 — 무엇이 어긋나 있었나

축 B(같은 물건을 지분으로 나눠 취득)는 채무·시가를 **물건 전체**로 입력하고, ④가 채무를 지분율로 줄여 보내고, 엔진이 시가를 같은 비율로 줄여 비교한다
(`scaleBurdenedGiftInfo`). 그래서 카드마다의 승자는 **비율 1로 물건 전체**를 판정한 승자와 같다.

측정(주택 60/40, 시가·기준시가 10억, 취득시 기준시가 5억, 채무 12억(물건 전체) → 담보평가 12억 > 시가 10억):

| 층 | 종전 | 사유 |
|---|---|---|
| ⑧ | 두 카드 모두 «채무액(12억)이 증여가액(10억)을 초과» **차단** | 축 B에서 `bgWholeGiftValuation`을 건너뛰어 C가 시가로 남음 — 틀린 사유 |
| ⑫ | **200**, 양도차익 685,000,000 = 12억 − 5억 − 개산공제 1,500만 (손계산 일치) | 엔진은 정상 계산 |
| ⑫ Zod | 실지취득가액을 비우면 **400** | `collateralForcesStdAcquisition`이 시가를 줄이기 전 값으로 판정 → 엔진이 담보 승으로 읽는 카드를 담보 승이 아니라고 봄 → 엔진이 읽지 않는 값을 요구 |
| ⑤ | 취득시 기준시가 칸·담보 승 안내 없음 | `bgCollateralForcesStdAcq`가 지분 자산이면 항상 false |

⑧만 풀면 ⑤에 칸이 없는데 ⑫가 «취득시 기준시가를 입력하세요»를 내는 **막다른 길**이고, 실지취득가액은 엔진이 안 읽는데 ⑫가 요구한다. 그래서 ⑤·⑧·⑫를 함께 맞춘다.
기준시가 모드 축 B(보충·담보·임대)는 이미 ⑧ 통과 · ⑫ 200이었다(같은 시료로 측정).

## 2. 변경

범위는 **주택**(이월과세·의제취득일 전 상속·증여·겸용 제외)이다. 그 밖의 종류는 같은 상황에서 새 사유로 정확히 막는다 — 종류별 격자를 측정하지 않았다(지원 계획서 V-S1·V-S4).

- `bgWholeGiftValuation(asset, isFractionalSplit)`: 축 B이면 지분이 있어도 비율 1로 물건 전체를 판정.
- `bgCollateralForcesStdAcq(asset, isFractionalSplit)`: 축 B 주택이면 물건 전체 승자로 판정. 확인하지 못한 종류는 false.
- `bgSplitAxisCollateralWinUnsupported(asset)`(신규): 축 B ∧ 시가 모드 ∧ 담보 승 ∧ 범위 밖 종류 → ⑧ 차단 사유(«채무액 초과» 대체).
- `needsBgAcqStdPriceInput` · `bgCoDonorNeedsStdPrice` · `bgExpenseUnusedBasis` · `bgExpenseInputsUnused`: optional `isFractionalSplit`(기본 false = 종전).
- ⑧ `transfer-tax-validate-bg.ts`: `isFractionalSplitAxis`를 위 판정에 전달. 조합원입주권은 같은 전달로 `rtmiNonSupplementaryWinnerIssue`가 입주권 전용 사유(`BG_RTMI_WINNER_CAUSE`)로 막는다(종전 «채무액 초과»). 검증 셀이 지분율 < 1 카드에서 안내 문구가 지분 분기(«함께 양도 토글을 끄고 단건으로…» — 틀린 조치)를 타는 결함을 드러내 입주권 전용 상수로 분리했다.
- ⑤: `AssetSectionTransfer`(취득시 기준시가 칸·담보 승 안내) · `BurdenedGiftBlock`(담보 승 안내·방식 입력 숨김) · `BurdenedGiftTrancheBasisBlock`(둘째 이후 카드) · `AssetSectionExpense`/`asset-section-summary`(필요경비 칸 숨김 «개산공제만») — `CompanionAssetCard`가 `splitMode === "fractional"`을 전달.
- ⑫: `collateralForcesStdAcquisition(bg, ownershipRatio)`가 엔진처럼 `scaleBurdenedGiftInfo`로 시가를 줄여 판정. 비율을 넘기지 않으면 종전(줄이기 전).
- 축 A(공유 소유) 지분은 이 단계에서 열지 않는다 — 플래그를 넘기지 않는 호출처는 종전 동작(S-2).

설계 선택: 축을 store에 저장하지 않고 호출 시 파생한다(`useEffect → store` 미러링 금지). 플래그 기본값이 false라 미전환 호출처는 종전 차단을 유지한다(fail-closed).

## 3. 검증

- anchor `__tests__/api/transfer.route.bg-axis-b-mkt-collateral-win.anchor.test.ts` 24건 — master 소스에서 13건 적색. 격자(기준시가 3 · 시가 2), 둘째 카드 병합, 실지 비움 200, 취득시 기준시가 비움(⑧ 차단 ∧ ⑫ 400), 보충 승 실지 요구 유지(안전망), ⑤ 술어, 범위 밖 종류 사유, 축 A 미개방(단건 FRAC_WIN · 컴패니언 게이트), ⑫ 지분 축소.
- E2E `e2e/bg-axis-b-mkt-collateral-win.spec.ts` 4건 — master 소스에서 AE-1·2·3 적색, AE-4(보충 승 안전망)만 통과. 화면에서 필요경비 요약 칩 «개산공제만», 양도정보 안 취득시 기준시가 칸, 200, «채무액 초과» 차단 없음을 확인.
- 기존 테스트 1건 수정: `axis-b-burdened-gift-presumed.anchor` B-4b의 대조군 «채무가 물건 전체 시가보다 크면 막힌다»는 채권최고액 없이 채무 6억 > 시가 5억만 봐서 **정상 담보 승**을 정답 차단으로 단언하고 있었다. 보호 의도(진짜 초과 차단)는 그대로 두고 채권최고액을 낮춘 진짜 초과 시료로 교체하고, 정상 담보 승은 «초과로 막지 않는다»를 추가했다(반전이 아니라 시료 정정).
- 회귀: `test:transfer` 1,590파일 통과 · `__tests__/calc/` 750파일 중 위 1건 수정 후 통과.

## 4. 확인 필요 · 하지 않은 것

- 주택 외 종류(토지·일반건물·재개발·입주권·겸용), 이월과세, 의제취득일 전 상속·증여의 축 B 담보 승은 계산하지 않고 막는다 — 종류별 격자 측정 후 별도(V-S1·V-S4). 이월과세는 당초 증여자 입력 요구가 먼저 걸려 새 차단의 끝단까지 도달하는 시료는 측정하지 않았다.
- 12억 고가주택 판정 분모와 1세대1주택 비과세 교차(V-S2), ⑫ 이외 `bgCollateralWinsSingle`·`gb-bg-refines:95`의 지분 처리(V-S3)는 측정하지 않았다 — S-2 착수 전 필수.
- 시가 모드 담보 승 축 B 주택의 ⑥ 사이드바 합계와 ⑦ 결과 카드 값은 이번에 화면으로 읽지 않았다(필요경비 칩·칸·200까지 확인).
- 옛 세션의 축 추론(`assetSplitMode` 없음 → 전 자산 지분이면 축 B)은 이 단계에서 건드리지 않았다. 축 B 시료는 모두 `assetSplitMode: "fractional"`을 명시했다. S-2에서 Q-S3 가드를 넣는다.
