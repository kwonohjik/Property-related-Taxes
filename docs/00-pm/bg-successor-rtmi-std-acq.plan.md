# 승계 조합원입주권 부담부증여 × 담보·임대 승 — 취득가액 = 입주권 기준시가, 개산공제 1% (I-1)

`bg-nonsupp-winner-support.plan.md` §4.2.2. 착수 순서는 사용자 결정(S-1 → S-2 → I-0 → I-1 → 질의 병행 → I-2·M-1). I-0(#2801)이 시가 모드 입주권 담보 승을 기준시가 모드와 같은 fail-fast로 대칭시켰고, 이 단계가 **승계** 입주권에 한해 그 fail-fast를 계산으로 바꾼다.

## 1. 법문 (명확)

| 항목 | 법문 | 확인 |
|---|---|---|
| 취득가액 | 소령 §159①1호 A 괄호: 양도가액을 상증법 §61①·②·⑤ 및 §66으로 산정한 경우 취득가액도 기준시가로 산정 | 담보(§66)는 양도일 **2023.2.28.**부터, 임대(§61⑤)는 **2020.2.11.**부터 열거(지원 계획서 §2 L-1 — MCP로 확인, 엔진 상수 `BG_PAREN_*_FROM`) |
| 입주권 기준시가 | 법 §99①2호 가목 → 소령 §165①: 취득일(또는 양도일)까지 납입한 금액 + 취득일(양도일) 현재의 프리미엄 | 지원 계획서 §2 L-2 |
| 개산공제 | 소령 §163⑥4호: **1%**(미등기 단서 없음) | 지원 계획서 §2 L-3 — SSOT `estimatedDeductionRate(isUnregistered, "right_to_move_in")` |

입주권 평가 자체는 §61③(열거 밖)이라 **보충적평가 승은 해당 없다**(취득가액 = 실지) — 담보·임대가 이긴 경우만 이 PR의 대상이다.

## 2. 어긋나 있던 것

| 모드 | 종전 | 이제 (승계 · 열거 시기 · 단건) |
|---|---|---|
| 기준시가 모드 · 담보·임대 승 | 엔진 400(입력 경로 없음) | 취득일 기준시가 2칸이 있으면 계산 |
| 시가 모드 · 담보 승 | 2023.2.28. 이후 I-0이 400, 이전 실지 | 같음 — 이후는 기준시가로 계산 |
| 열거 이전 양도 | 시가 모드 실지 200 · **기준시가 모드 400** | **둘 다 실지 200**(§66·§61⑤가 열거 밖) |
| 원조합원 | 400 | 400 유지(질의 H-2 대기) |

## 3. 변경

**엔진** (`burdened-gift-apportionment.ts` · `burdened-gift-valuation.ts` · `burdened-gift-acquisition.ts`)
- `rtmiParenEnumerated(selectedMode, 양도일)` — 입주권의 담보·임대 승이 괄호 열거 시기에 드는가. 양도일 `giftDate`가 없으면 `false`.
- 기존 입주권 fail-fast(기준시가 모드)와 I-0 블록을 아래로 교체: 열거 시기 ∧ 담보·임대 승이면 (a) **원조합원**(`rightValuation.isSuccessor` 아님) → 400(H-2), (b) **승계**인데 취득시 기준시가(`buildingStdPriceAtAcquisition`) 0 → 400(자동 fallback 금지), (c) 그 밖에는 괄호 발동 — 취득가액 = 입주권 기준시가 × B/C. 양도일이 없으면 종전대로 기준시가 모드 담보·임대 승만 중단한다.
- 개산공제: `estimatedDeductionForBurdenedGift`와 율 echo가 입주권이면 SSOT 1%(종전 3% 고정 — 설계서의 «입주권 1% 도달 불가» 기록은 정정).
- `acquisitionStdForcedByCollateral` 표지는 시가 모드의 승계 입주권 강제에도 켠다(결과 화면 고지의 근거).

**운반 필드(Q-I2).** 취득시 입주권 기준시가는 기존 `buildingStdPriceAtAcquisition`에 싣는다 — 신규 가격 필드 없음. 승계 표지 `rightValuation.isSuccessor`만 추가했다(⑫ Zod `transfer-tax-burdened-gift-schema.ts`에 `isSuccessor: z.boolean().optional()` — 안 넣으면 침묵 strip되어 승계가 원조합원으로 읽힌다 / ④ `buildBurdenedGiftInfo` 입주권 분기 / `scaleRightValuation`이 보존).

**④** `buildBurdenedGiftInfo`: 승계 입주권이면 `successorRightStdPriceAtAcq`(납입금 + 프리미엄)를 `buildingStdPriceAtAcquisition`에 싣고 `isSuccessor: true`. 엔진이 열거 시기·승자일 때만 읽으므로 ④는 가리지 않는다.

**⑧** 신규 leaf `lib/calc/bg-rtmi-std-acq.ts`(`bgRtmiParenEnumerated` · `bgSuccessorRightStdForced`) 하나를 ⑤·⑧·⑥이 같이 쓴다.
- `rtmiNonSupplementaryWinnerIssue`: 열거 이전은 막지 않고, 열거 시기에는 **승계 단건**만 통과, 원조합원·지분·축 B는 각자의 사유로 막는다. 원조합원 사유(`BG_RTMI_ORIGINAL_CAUSE`)와 «승계는 단건만»(`BG_RTMI_SUCCESSOR_SINGLE_ONLY_CAUSE`)을 가른다.
- (5-c‴): 승계 입주권 단건 담보·임대 승(열거 시기)이면 취득일 기준시가 2칸의 합 > 0을 요구한다(칸 `successorRightStdPaidAtAcq`). 승계 검증(`validateSuccessorRightAsset`)은 그 경우 승계취득가액·추가분담금을 요구하지 않는다(쓰이지 않는 값 — ⑧ ⊇ ⑫).
- 묶음 게이트(`bgUnsupportedWinnerReason/Cause`): 입주권·겸용을 지분 여부보다 먼저 가른다. 입주권 문구는 원조합원/«승계 단건만»으로 분리(종전 «입력 경로가 없어 계산하지 않습니다»는 승계에게 틀린 말이 됐다).

**⑤** `SuccessorRightAcquisitionBlock`: 강제이면 «기준시가 — 납입액 + 프리미엄» 2칸을 열고 승계취득가액·추가분담금 칸은 숨긴다(`bg-successor-right-std-forced` 안내). 필요경비 칸 «개산공제만»(`bgExpenseUnusedBasis`에 양도일 인자 추가 → `AssetSectionExpense` · `asset-section-summary` · `CompanionAssetCard`).

**⑫** `refineBurdenedGiftInputs`: 시가 모드 승계 입주권 담보 승(2023.2.28. 이후)은 실지취득가액을 요구하지 않는다(`successorRtmiMarketCollateralForcesStd`) — 안 고치면 ⑧ 통과 ↔ ⑫ 400 막다른 길이었다(anchor SR-3이 잡았다).

⑥⑦: 코드 변경 없음 — 엔진 breakdown(`perAsset.building`)을 그대로 읽어 사이드바·결과가 값을 맞게 보였다(E2E로 확인).

## 4. 연혁 처리 — 이 PR의 결정

엔진의 관행(사용자 결정 2026-10-22)은 비입주권의 담보 승을 양도일과 무관하게 **현행 문언대로 계산하고 열거 이전이면 «확인 필요»를 고지**한다. 입주권은 이전 양도를 **실지**로 둔다 — 열거 이전에는 괄호가 §66·§61⑤를 열거하지 않아 법문상 실지가 맞고, 입주권은 기준시가 입력 칸을 시기와 승자로 갈라야 하므로 «계산 + 고지»가 성립하지 않는다. 기준시가 모드의 열거 이전 입주권도 같은 원칙으로 **종전 400을 실지 200으로** 바꿨다(법문 명확 — 해석례 불필요).

## 5. 검증

- anchor `transfer.route.bg-successor-rtmi-std-acq.anchor.test.ts` 24건(SR-1~SR-6). 손계산 오라클: 담보 2,697,000,000 · 임대 2,772,750,000 · 열거 이전 2,600,000,000 / 2,700,000,000 · 보충 승 440,000,000(불변). 뮤테이션 9종(승계 검사 제거 · 0 가드 제거 · 개산공제 3% · 연혁 게이트 2곳 · 기준시가 요구 제거 · ⑫ 실지 요구 · 승계취득가액 요구 · 원조합원 허용)이 모두 적색(3·1·8·2·3·1·1·3·4건).
- E2E `e2e/bg-successor-rtmi-std-acq.spec.ts` 4건 — 기준시가 2칸 · 승계취득가액 칸 숨김 · «개산공제만» · ⑦ 양도차익 2,697,000,000 · ⑥ 사이드바 양도가액 3,000,000,000 / 취득가액 300,000,000 / 필요경비 3,000,000(손계산 일치) · 칸 비움 차단 · 열거 이전 실지 2,600,000,000 · 원조합원 차단.
- 기존 테스트 정정 — 옛 «입력 경로가 없어 계산하지 않습니다»(원조합원·묶음)를 단언하던 11셀을 새 문구로: I-0 RT-1(원조합원) · NR-1/NR-2 · S-1 AB-4 · S-2 AA-4 · CW-2. 반전이 아니라 문구 정정이고, 원조합원 차단은 그대로다.
- 회귀: 아래 §7.

## 6. 하지 않은 것 · 확인 필요

- **원조합원(I-2):** 「취득일」·「납입한 금액」의 범위(종전 부동산 평가액·청산금 포함 여부)가 불명확해 질의 H-2 회신 전에는 계산하지 않는다. 임의로 정하면 청산금 이중 차감이 날 수 있다(V-I6).
- **묶음·지분·축 B 승계 입주권:** 엔진은 지분 축소로 값을 계산할 수 있으나 ⑧ 격자·화면은 측정하지 않아 막는다(사유 «단독 소유 단건만»). 측정 후 별도. → **2026-11-01 갱신:** 측정 `bg-successor-rtmi-extend-measure.md`, **묶음은 X-1이 풀었다**(`bg-successor-rtmi-bundle-gate.plan.md`) · 지분(X-2, 승계만)은 `bg-successor-rtmi-axis-a-share.plan.md`, 축 B(X-3)는 `bg-successor-rtmi-axis-b.plan.md`로 풀었다 — 승계 입주권은 전 경로가 열렸다.
- **이월과세·의제취득일 전 × 입주권:** 범위 밖(V-I2·V-I3).
- ~~**⑧ 묶음 게이트의 열거 이전 과차단(종전부터):** 함께 양도 묶음의 입주권 비보충 승은 양도일과 무관하게 막힌다 — 열거 이전에는 실지라 계산할 수 있는 조합인데 막는다. 측정·의도 확인 전이라 그대로 뒀다.~~ → **X-1이 풀었다**(2026-11-01).
- **상속·증여로 받은 승계 입주권:** 부담부증여가 아닌 취득이라 이 경로의 대상이 아니다. 승계 입주권을 이월과세로 증여받은 뒤 부담부증여하는 조합은 측정하지 않았다.
- **세액·증여세:** 양도차익까지 손계산으로 맞췄고, 같은 시료의 증여세·총세액은 손계산하지 않았다(양도세 계산은 엔진 기존 경로).

## 7. 회귀

`test:transfer` · `__tests__/calc/` · `__tests__/components/` — 정정 전 첫 실행에서 11건 적색(위 §5 옛 문구 단언) → 샘플·문구 정정 후 전건 통과.

| 범위 | 결과 |
|---|---|
| `npm run test:transfer` | 1596 파일 · 20,287 통과 (3 skipped · 10 todo) |
| `__tests__/calc/` + `__tests__/components/` | 1449 파일 · 17,034 통과 (299 todo) |
| 신규 anchor (SR-1~SR-6) | 24 통과 |
| 신규 E2E (SE-1~SE-4) | 4 통과 |
| 뮤테이션 probe | 9건 전부 사망, 원본 복원 `diff -q` 일치 |
