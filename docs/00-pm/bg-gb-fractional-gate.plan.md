# 부담부증여 지분 보유 × 담보·임대 승 — 일반건물 ⑧ 게이트 열기 (Q-3)

- 상태: **구현 완료(§7)** — 결정 Q-1 a · Q-2 a · Q-3 a(2026-11-08, 모두 권장안). 측정 기준 master `6f074c320`, 구현 기준 master `92f97ce73`.
- 선행: `bg-fractional-winner-kinds-grid.plan.md` §3.2·Q-2(일반건물 축 A 값 결함 → #2990 수정) · `gb-excess-burdened-gift-guard.plan.md`(#2997) · `bg-redev-fractional-collateral-win.plan.md`(#3006 — 같은 유형의 «축 인자 없는 술어» 발견).
- 표기: **[직접]** = 이 문서 작성 중 직접 실행·대조. **[코드]** = 코드 읽기만. **확인 필요** = 미측정·미해명.

## 0. 결론

| 질문 | 답 |
|---|---|
| ⑫ 값은 맞는가 | **맞다.** 60칸(취득일 동일 · 토지·건물 취득일 분리 × 3모양 × 10칸) 중 58칸이 같은 종류 단건 기준과 일치하고, 2칸이 +4원(축 B 임대 — 토지·건물 파트 안분 반올림, 선행 계획서 `bg-fractional-winner-kinds-grid.plan.md` §3.2가 일반건물 축 B 임대에서 이미 확인한 +4원과 같은 값)이다. 게이트를 열어 새로 통과하는 **28칸은 28칸 모두 일치**, ⑫ 값은 게이트를 열든 닫든 60칸 모두 같다 [직접] |
| 게이트 한 줄(`bgFractionalCollateralKindSupported`에 `general_building`)만 열면 되는가 | **안 된다. 열면 새로 생기는 문제가 2건이다.** ① **막다른 길(축 B)** — ⑫ Zod가 축 B 카드에 지분율을 넘기지 않아, 담보 승인데도 «실지취득가액·매매사례가액이 필요하다»고 400을 낸다. ⑧은 0건이고 화면은 그 칸을 숨긴다. ② **정반대 안내** — 일반건물 취득 안내 3곳이 담보 승을 축 없이 읽어 «취득가액은 실지취득가액 × 채무비율 · 개산공제 미적용»이라고 말한다. 실제 계산은 취득시 기준시가 × 채무비율 + 개산공제다 (§3.2·§3.3) |
| 원인 | ① `lib/api/transfer-tax-schema-gb-bg-refines.ts:214`가 `s.valuation?.ownershipRatio`를 넘기는데 와이어에 그 값이 없다(`s.ownershipRatio`는 있다). ② `gbBgStdUseOf`(`lib/calc/gb-bg-std-use.ts:31`)가 `bgCollateralForcesStdAcq(asset)`를 **축 인자 없이** 부른다 — #3006 재개발과 같은 유형이다 [직접 + 코드] |
| 한 줄 수정으로 막다른 길이 풀리는가 | **풀린다 [직접, 프로토타입].** ① 한 줄을 `s.valuation?.ownershipRatio ?? s.ownershipRatio`로 바꾸면 축 B 담보 승이 실지 비움에서 400 → **200 · 988,000,000**. 보충 승은 여전히 요구한다(⑧ 2건 · ⑫ 400 — 정합). 60칸 격자는 불변 |
| 별건 발견 | **의제취득일 전 토지 파트 × 지분 × 시가 모드 × 보충 승**에서 ⑫가 단건 대조와 **18,000,000** 어긋난다(219,000,000 vs 237,000,000). 게이트와 무관하고 지금도 ⑧ 0건으로 도달한다. 원인 **확인 필요** — V-S4(의제취득일 전 × 지분 미측정)의 첫 값이다 (§3.4) |
| 판정 | 사용자 결정 필요 — 아래 §4. 권장은 **Q-1 a(선결 2건과 함께 연다) · Q-2 a(의제취득일 전 파트는 열지 않는다) · Q-3 a(18,000,000은 별건으로 바로 이어 측정)** |

## 1. 범위

- 종류: 일반건물(`general_building`). 상업용 건물·오피스텔·입주권·겸용은 이 문서 범위 밖.
- 시나리오 2종: **base**(토지·건물 취득일 동일 · 실지취득가액 K-4) · **sepdate**(토지 취득일 2012-01-01 분리). 의제취득일 전 파트는 §3.4에서 따로 쟀다.
- 모양 3종: 축 A 단건(공유 소유 50%) · 축 A 함께 양도(100% + 50%) · 축 B(같은 물건 60/40).
- 칸 10종: 기준시가 모드(담보 · 임대 · 보충) · 시가 모드 K-4(담보 · 보충) · **K-5**(환산취득가액, 담보 · 보충) · **K-6**(매매사례가액, 담보 · 보충) · **K-7**(감정가액, 담보).
- 측정하지 않은 것: 이월과세(게이트가 이월과세를 계속 제외한다 `bgAnyCarryover`) · 건물 신축(자기 건축) · 증축·용도변경 · 양도일 2023.2.28. 전 · 일반건물 주택 파트의 12억 판정 분모(V-S1e).

## 2. 측정 방법 [직접]

화면 경로 그대로: 폼 → ⑧(`collectStepIssues` 0~5단계) → ④(`captureBody`) → ⑫~⑭(route POST). 경제 입력은 선행 계획서와 같다 — 양도시 기준시가 8억(토지 6,000,000 × 100㎡ + 건물 2억) · 취득시 4억(2,000,000 × 100㎡ + 2억) · 시가 10억 · 실지 2.5억(토지 1억 + 건물 1.5억). 대조 기준은 같은 시나리오의 단건(축 A 단건 = 반 크기 단건 · 축 B = 단건 100% · 함께 양도 = 단건 합)이다. 절대값 손계산은 선행 계획서의 494,000,000(축 A 기준시가 담보)이 이미 있다.

- **게이트 열림/닫힘 2회**: 열림은 `kindOk` 식에 `|| asset.assetKind === "general_building"`을 임시로 넣고, 닫힘은 현행 코드다. 복원은 `cp` 백업 + `cmp` + `git status`로 확인했다.
- **화면**: jsdom 렌더(`AssetSectionTransfer` · `GbBgAcquisitionNotice`)로 칸 존재·문구만 봤다. 브라우저(Playwright)는 쓰지 않았다 — 구현 PR에서 한다.
- 이번 시료에서 #2997 가드(B > C)는 걸리지 않는다(담보 승에서 B = C).

## 3. 측정 결과 [직접]

### 3.1 값 — 60칸 (게이트 열림)

| 항목 | 결과 |
|---|---|
| ⑧ | **60/60 0건** (닫힘에서는 28칸이 막힌다 — 시나리오마다 14칸: 함께 양도 기준시가 담보·임대 2 + 시가 담보 K-4·K-5·K-6·K-7 × 3모양 12) |
| ⑫ | 60/60 → 200 |
| 값 일치 | **58/60.** 새로 통과하는 **28칸은 28칸 모두 일치** |
| 불일치 2칸 | 축 B · 기준시가 · 임대 — 125,090,914 vs 125,090,910 (+4). base와 sepdate 모두. 닫힘에서도 같다 |
| 게이트가 바꾸는 것 | ⑧·화면 판정만이다. 열림·닫힘의 ⑫ 값은 60칸 모두 같다 |

### 3.2 ⑫ Zod의 축 B 요구 — 막다른 길 [직접]

시가 모드 · 담보 승 · 축 B 60/40(물건 전체 채무 14억) · K-4에서 실지취득가액(토지·건물)을 비웠다:

| 모양 | ⑧ | ⑫ |
|---|---|---|
| 축 A 단건 | 0건 | **200** · 494,000,000 |
| 함께 양도 100% + 50% | 0건 | **200** · 1,682,000,000 |
| 단건 100%(채무 12억) | 0건 | **200** · 788,000,000 |
| **축 B 60/40** | 0건 | **400** — 「부담부증여 취득가액은 토지·건물 칸이 모두 필요합니다」 |

- K-6(매매사례가액)에서 매매사례가액 칸을 비워도 똑같다(축 B만 400).
- **화면은 그 칸을 숨긴다 [직접]**: 열림에서 축 B 담보 승 카드는 «담보 승 안내»가 뜨고 «토지 실지취득가액»·«건물 실지취득가액» 칸이 없다(`BurdenedGiftBlock`의 `collateralForced`가 축 B로 판정). 즉 사용자는 ⑧을 통과하고 계산 버튼에서 400을 만나며 **채울 칸이 없다.**
- 닫힘(현행)에서는 ⑧이 «지분 분할 취득에서 담보평가액 … 계산하지 않습니다»로 먼저 막아 도달하지 못했다 — **게이트를 여는 순간 새로 생기는 결함**이다.
- 원인 [직접 + 코드]: `lib/api/transfer-tax-schema-gb-bg-refines.ts:214` `requireBgAcquisitionParts(s.burdenedGiftInfo, s.valuation, s.valuation?.ownershipRatio, …)`. ④가 축 B 카드를 보낼 때 카드 채무는 지분율로 줄여 싣는데(8.4억 · 5.6억) 시가는 물건 전체(10억) 그대로이고, **`valuation.ownershipRatio`는 실리지 않는다**(와이어 키: `shareId · shareLabel · ownershipRatio · acquisitionDate · acquisitionPrice · expenses · valuation · burdenedGiftInfo` — 지분율은 카드 바로 아래 `ownershipRatio`에 있다). 그래서 `collateralForcesStdAcquisition`이 줄이지 않은 시가 10억과 줄인 채무 8.4억을 비교해 «담보 승 아님»으로 읽고 실지 금액을 요구한다. `collateralForcesStdAcquisition`의 주석이 이 상황을 이미 적어 두었다(축 B는 지분율을 넘겨야 한다 — 실측: 60/40 주택). 주택·건물 컴패니언 경로(`:219`)는 `c.ownershipRatio`를 넘기고 일반건물만 빠졌다.
- **프로토타입 [직접]**: 같은 줄을 `s.valuation?.ownershipRatio ?? s.ownershipRatio`로 바꾸면 축 B 담보 승 실지 비움 → **200 · 988,000,000**(K-4 · K-6 모두). 보충 승 실지 비움은 여전히 ⑧ 2건 · ⑫ 400(정합). 60칸 격자 값·⑧ 건수 불변. 프로토타입은 복원했다(`git status`로 확인).

### 3.3 안내 문구 — 정반대 [직접]

열림에서 축 A 50% · 시가 · K-4 · 담보 승 카드의 일반건물 안내 3곳 (`GbBgAcquisitionNotice` · `gbBgLandStdNote` · `gbBgAcqBuildingHint`):

| 안내 | 지금(`gbBgStdUseOf` = `market_actual`) | 단독 100% 담보 승 대조(`market_collateral`) |
|---|---|---|
| 취득 안내 | 「취득가액 = ② 양도정보에 입력한 토지·건물 실지취득가액 × 채무비율입니다. 위 취득시 기준시가는 취득가액에 쓰이지 않고 자본적지출을 나누는 비율로만 쓰입니다」 | 「담보평가액이 시가보다 커서 … 취득가액은 취득시 기준시가 × 채무비율로 산정합니다 … 필요경비는 개산공제입니다」 |
| 토지 카드 머리 | 「… 취득가액은 실지취득가액 × 채무비율입니다」 | 「취득가액은 산정방식과 관계없이 취득시 기준시가 × 채무비율입니다」 |
| 건물 기준시가 hint | 「자본적지출을 토지·건물로 나누는 비율에만 쓰입니다 (취득가액은 실지취득가액 · 개산공제 미적용)」 | 「이 금액 × 채무비율이 건물 취득가액이자 개산공제 기준액입니다」 |

- 같은 카드에 `BurdenedGiftBlock`의 «담보 승 안내»(축 지정)는 맞게 뜬다 — 한 화면에 서로 반대 말을 하는 안내가 같이 뜬다.
- 원인 [코드]: `gbBgStdUseOf`가 `bgCollateralForcesStdAcq(asset)`를 축 없이 부른다(`gb-bg-std-use.ts:31`). 지분 자산은 축 없이는 `false`(`bgCollateralForcesStdAcq` 주석)라 K-4 → `market_actual`, K-5 → `market_converted`, K-6/7 → `market_presumed`로 읽힌다. 소비처: `GbBgAcquisitionNotice` · `GeneralBuildingBlock`(`gbBgLandStdNote` · `gbBgAcqBuildingHint` 2곳). `GeneralBuildingBlock`에는 축 prop이 없다 — 호출하는 `AssetSectionAcquisition`은 `splitMode`를 갖고 있다 [코드].
- 숨은 필요경비(자본적지출 5천만 · 양도비 2천만)를 넣어도 세액이 새지 않는다: 0원 494,000,000 = 입력 494,000,000 = 반 크기 단건 입력 494,000,000 [직접]. `bgExpenseInputsUnused`는 축을 받아 담보 승에서 칸을 맞게 숨긴다(`x=true`).

### 3.4 의제취득일 전 토지 파트 × 지분 [직접]

토지만 1980-01-01 상속(건물은 2015 매매 · 토지 취득시 단가 300,000 · 상증법 평가액 6천만), 지분 50%·60/40:

| 칸 | 모양 | 게이트 닫힘 | 게이트 열림 | 단건 대조 |
|---|---|---|---|---|
| 시가 · 담보 | 축 A | ⑧ 1건(차단) · ⑫ 581,550,000 | ⑧ 0건 · ⑫ **581,550,000** | 581,550,000 ✓ |
| 시가 · 담보 | 축 B 60/40 | ⑧ 2건(차단) · ⑫ 1,163,100,000 | ⑧ 0건 · ⑫ **1,163,100,000** | 1,163,100,000 ✓ |
| 기준시가 · 담보 | 축 A | ⑧ 0건 · ⑫ 581,550,000 | 같음 | 581,550,000 ✓ |
| **시가 · 보충** | 축 A | **⑧ 0건 · ⑫ 219,000,000** | 같음 | **237,000,000 ✗ (−18,000,000)** |

- 게이트의 의제취득일 전 배제 `!isBgPreDeemedAsset`은 일반건물을 거르지 못한다 — `BG_PRE_DEEMED_ASSET_KINDS`(`bg-pre-deemed.ts:14`)에 `general_building`이 없고, 일반건물은 파트별 판정(`gbBgMarketPreDeemedParts`, `gb-pre-deemed.ts:30`)을 따로 쓴다 [코드]. 그래서 게이트를 열면 이 시료의 담보 승이 같이 열린다. 담보 승은 엔진이 파트 ①②를 읽지 않아(`gb-pre-deemed.ts` 주석) 값이 맞다.
- **18,000,000 불일치는 게이트와 무관하다** — 닫힘에서도 ⑧ 0건 · ⑫ 200으로 지금 화면에서 도달한다. 어느 값이 틀렸는지·원인은 **확인 필요**(지분을 줄이지 않은 ①·③이 3자 max에 들어가는지 등은 읽지 않았다). 의제취득일 전 상속·증여 × 지분 전체가 V-S4로 미측정이다.

## 4. 결정 — **Q-1 a · Q-2 a · Q-3 a 확정(2026-11-08)**

**Q-1. 일반건물 지분 담보·임대 승을 연다 (권장 a)**
- (a) **연다 — 선결 2건과 함께.** ① 게이트 `bgFractionalCollateralKindSupported`에 `general_building`을 더한다. ② ⑫ Zod 한 줄: `generalBuildingShares` 요구가 `s.valuation?.ownershipRatio ?? s.ownershipRatio`를 쓰게 한다(§3.2). ③ 안내 3곳이 축을 읽게 한다: `gbBgStdUseOf(asset, isFractionalSplit?)` + `GeneralBuildingBlock`에 축 prop 1개 + `AssetSectionAcquisition`이 `splitMode === "fractional"`을 넘김 (§3.3). ④ ⑧ 차단 문구의 «계산하는 종류»에 일반건물을 더한다(`BG_FRACTIONAL_SCOPE_TEXT`). ⑫ 엔진·계산식은 바꾸지 않는다. 규모: 중-소.
- (b) 게이트와 Zod 한 줄만 열고 안내 문구는 별건으로 미룬다. 막다른 길은 없지만 같은 카드에 정반대 문구가 뜨는 상태로 열린다 — 권하지 않는다.
- (c) 열지 않는다. 지금 닫힌 입력이 정확히 계산되는 입력이라는 사실(28칸 일치)만 기록하고 닫는다.

**Q-2. 의제취득일 전 상속·증여 파트가 있는 일반건물 지분 담보 승 (권장 a)**
- (a) **열지 않는다.** 게이트에 `!gbBgMarketPreDeemedParts(asset).any`를 더해 ⑧이 계속 막는다(다른 종류가 `isBgPreDeemedAsset`로 제외하는 것과 같은 방침). 담보 승 값은 맞지만(§3.4) 같은 파트의 보충 승이 어긋나는 영역(V-S4)이라 한 번에 열지 않는다. 규모: 술어 1줄 + anchor.
- (b) 담보 승만 열고 보충 승 불일치는 별건으로 둔다. 열린 칸의 값은 맞지만, 같은 파트 입력에서 담보 ↔ 보충을 오가며 값이 검증되지 않은 채 갈릴 수 있다 — 권하지 않는다.

**Q-3. 의제취득일 전 토지 파트 × 지분 × 보충 승 −18,000,000 (권장 a)**
- (a) **별건으로 바로 이어 측정한다.** 원인(어느 값이 틀렸는지 · 지분을 줄이지 않은 값이 3자 max에 들어가는지)과 주택·토지·상가 등 다른 종류에도 있는지를 V-S4로 재고 결과에 따라 결함 계획서를 만든다. 이 PR 범위에 넣지 않는다.
- (b) 이번 계획에 포함해 같은 PR에서 고친다. 원인을 모르는 채 범위가 커지므로 권하지 않는다.
- (c) 설계 의도로 보고 닫는다. 근거(법문·질의회신)를 확인하지 못했다 — 권하지 않는다.

## 5. 미검증 · 확인 필요

| ID | 내용 | 비고 |
|---|---|---|
| V-G1 | §3.4 −18,000,000의 원인 — 어느 쪽 값이 맞는가 · 다른 종류에도 있는가 | Q-3 a의 측정 대상. 게이트와 무관 |
| V-G2 | 축 B 임대 +4원(토지·건물 파트 안분 반올림) 원인 | 선행 계획서 +1원과 같은 성격으로 보이나 크기가 달라 **확인 필요** |
| V-G3 | 일반건물 주택 파트 12억 고가주택 판정 분모 × 지분(V-S1e) | 미측정 |
| V-G4 | 건물 신축(자기 건축)·증축·용도변경 파트 × 지분 담보 승 | 미측정 |
| V-G5 | 브라우저(Playwright) 화면 확인 — jsdom 렌더만 했다 | ✅ headless Playwright 3건 통과(§7). 사람이 브라우저로 직접 본 것은 아니다 |
| V-G6 | 일반건물 컴패니언 ⑫ Zod(`:222` `c.ownershipRatio`)가 담보 승 지분 컴패니언을 맞게 판정하는가 | 함께 양도 칸은 이번에 실지 비움까지 쟀고 200이었다 — 다른 입력 조합은 미측정 |
| V-S4 | 이월과세·의제취득일 전 상속·증여 × 지분 | 종전부터 미측정 — Q-3 a가 첫 측정이다 |

## 6. 재현

- 측정 코드는 저장소에 두지 않았다(throwaway). 로컬 보관: 작성 세션의 scratchpad `keep43/probe-gb.test.ts`(값 60칸 · 빈 칸 · 필요경비 · 축 B 진단 · 와이어 · 의제취득일 전 파트) · `keep43/probe-gb-ui.test.tsx` · `keep43/probe-gb-notice.test.tsx`. 결과 원본: `probe43/closed.json` · `open.json` · `open-blank.json` · `diag-closed.json` · `diag-open.json` · `proto-*.json` · `pre-closed.json` · `pre-open.json` · `ui-*.txt` · `notice.txt` · `wire-open.json`.
- 실행은 테스트 폴더에 임시 복사 후 `vitest run`, 게이트 임시 개방·Zod 프로토타입은 §2 방법(백업 `cp` + `cmp` 복원).

## 7. 구현 결과 (Q-1 a · Q-2 a · Q-3 a) [직접]

### 7.1 변경 (코드 6곳 + 주석)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `lib/calc/burdened-gift-collateral-win.ts` `bgFractionalCollateralKindSupported` | `general_building`을 더한다 — **의제취득일 전 파트(토지 `gbLandPreDeemed` 또는 건물 `gbBuildingPreDeemed`)가 있으면 제외**(Q-2 a). 평가 모드와 무관하게 제외한다: 기준시가 모드의 함께 양도 지분 담보·임대 승은 종전에 일반건물 전체가 닫혀 있었고 의제전 파트와의 교차는 측정하지 않았기 때문이다(`gbBgMarketPreDeemedParts`는 시가 모드에서만 켜져 이 목적에 쓰지 않았다) |
| 2 | 같은 파일 `BG_FRACTIONAL_SCOPE_TEXT` | «주택·토지·일반건물·재개발 완공 아파트(이월과세·의제취득일 전 상속·증여 제외)» — ⑧ 차단 문구 3곳이 한 상수를 쓴다 |
| 3 | `lib/api/transfer-tax-schema-gb-bg-refines.ts` (⑫) | 축 B 지분 요구가 `s.valuation?.ownershipRatio ?? s.ownershipRatio`를 읽는다(§3.2) + 지분 타입에 `ownershipRatio` |
| 4 | `lib/calc/gb-bg-std-use.ts` | `gbBgStdUseOf` · `gbBgLandStdNote` · `gbBgAcqBuildingHint`가 `isFractionalSplit?`를 받아 `bgCollateralForcesStdAcq`에 넘긴다(세 상태 — 생략하면 종전 fail-closed) |
| 5 | `components/calc/transfer/GbBgAcquisitionNotice.tsx` · `GeneralBuildingBlock.tsx` | `isFractionalSplit` prop 1개를 안내 3곳에 전달 |
| 6 | `components/calc/transfer/asset-sections/AssetSectionAcquisition.tsx` | `isFractionalSplit={splitMode === "fractional"}` |

⑫ 엔진·계산식은 바꾸지 않았다. 안내 문구 본문도 그대로다 — 어느 분기를 고를지만 바뀐다.

### 7.2 검증

| 항목 | 결과 |
|---|---|
| 새 anchor | `__tests__/api/transfer.route.bg-gb-fractional-win.anchor.test.ts` 76건(GB-1 격자 60 · GB-2 고정값 3 · GB-3 축 B 실지 비움 3 · GB-4 4 · GB-5 6) + `__tests__/components/gb-fractional-collateral-notice.anchor.test.tsx` 8건. **수정 전 32건 실패**(28칸 ⑧ 차단 · GB-3 2 · GB-5 2), 수정 후 전부 통과 |
| 고정값 | 축 A 단건 494,000,000 · 축 B 60/40 988,000,000 · 함께 양도 1,682,000,000 |
| 뮤테이션 | 11건 중 11건 KILLED(복원은 `cp` 백업 + `cmp`): 게이트 `general_building` 제거(32건 실패) · 의제전 배제 제거(3) · **건물 파트만 제거(1 — 처음에는 살아남았다. 건물 파트 시료가 없었다 → GB-5에 추가해 KILLED)** · Zod 지분율(2) · 범위 문구(1) · `gbBgStdUseOf` 축(4) · 프롭 연결 `AssetSectionAcquisition`(2) · 안내 3곳 각 축 전달(2씩) · 안내 컴포넌트 prop(2) |
| 회귀 | api · lib · components · calc · tax-engine 5배치. 첫 실행에서 `__tests__/api` 기존 anchor **6개 파일 10건 실패** — 모두 «일반건물은 막힌다»를 전제한 단언이었다(아래 7.3). 갱신 후 api 478파일 6365건 통과, 나머지 4배치는 처음부터 통과(lib 262 · components 748 · calc 818 · tax-engine 1498) |
| tsc · eslint | 0건 |
| Playwright | `e2e/bg-gb-fractional-win.spec.ts` 3건 통과(15.9초, 로컬 포트 3143): E1 축 A 50% 200 · 494,000,000 · 안내 «취득시 기준시가 × 채무비율» · E2 축 B 60/40 실지 비움 200 · 988,000,000 · E3 의제전 토지 파트 차단 · 요청 안 나감 |

### 7.3 갱신한 기존 anchor (삭제 없이 단언 반전 — 형제 안전망 보존)

| 파일 | 변화 |
|---|---|
| `bg-axis-a-nonsupp-win` AA-4 | 문구에 «일반건물» · 술어: 일반건물 지분 `false`(열림) + 의제전 파트는 `true`(계속 막힘) |
| `bg-axis-b-mkt-collateral-win` AB-4 | «일반건물» 항목을 «토지 파트 의제전 상속 일반건물»로 — 축 B 차단 사유 단언 유지 |
| `bg-land-fractional-win` BL-7 | 일반건물 열림 · 의제전 파트 닫힘 · 입주권 닫힘 · 축 B 차단 술어는 의제전 파트로 |
| `bg-fractional-grid` FG-1·FG-3 | 일반건물 쌍이라 ⑧게이트·200 칸이 ⑧통과·200으로 이동: 9+26=**35**, 10+6=**16**. 혼합 56·14는 그대로 |
| `bg-collateral-bundle-gift-value` CB-2 | ⑧통과·200 11→**20**, ⑧게이트·200 9→0(⑧ ⊇ ⑫ 불변) |
| `bg-fractional-companion-winner` FC-4 | 균일 담보 승의 ⑧ 게이트 여부 true→false(⑫ 200 그대로) |

회귀 배치에 `__tests__/lib`을 넣은 이유는 #3006의 교훈(반전을 놓친다)과 같다 — 이번에는 lib 쪽 반전은 없었다.

### 7.4 남은 것

- 사람이 브라우저로 직접 본 확인은 하지 않았다(headless Playwright · jsdom).
- V-G1(−18,000,000): **원인 확정·결정 대기** — `bg-gb-pre-deemed-fractional-clause-a.plan.md`(①② 지분 미축소, #2990으로 L-1 (a)의 전제가 깨짐). 나머지 V-S4(이월과세·의제전 × 지분) · V-G2(축 B 임대 +4원) · V-G3 · V-G4 · V-G6은 그대로다.
- 기준시가 모드 + 의제전 파트의 **함께 양도** 지분 담보·임대 승은 게이트가 계속 막는다(코드상 — 의제전 제외가 평가 모드와 무관). 이 조합의 ⑫ 값은 측정하지 않았다 — **확인 필요**. 단건 기준시가 모드 담보 승(축 A)은 §3.4 표 3행대로 종전부터 ⑧ 0건 · 값 일치이고, 축 B 기준시가 모드 × 의제전 파트는 측정하지 않았다 — **확인 필요**.
