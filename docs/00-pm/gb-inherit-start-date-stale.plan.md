# 상속개시일 칸 ≠ 토지 취득일 — 화면에서 가능하고, 그때 ⑧↔⑫ 가 갈린다 (실측)

- 상태: **구현 완료 — Q-1 a** (사용자 「권고안으로 진행해」). 측정은 §1~§4, 구현은 §6
- 앵커: `__tests__/api/transfer.route.gb-inherit-start-date-stale.anchor.test.ts` (2건 — 수정 후 기대)
- 선행: `gb-bg-inherit-presumed.plan.md` §5 (#2737 이 남긴 한계 「상속개시일 칸과 토지 취득일이 다른 입력이 화면에서 가능한지 미확인」)

## 1. 질문

BG 상속 × 환산·감정·매매사례가액 규칙(#2735·#2737)의 ⑫ 는 기준일로 **토지 파트 취득일**(`generalBuildingValuation.landAcquisitionDate`)을 읽고, ⑧ 은 **상속개시일 칸**(`inheritanceStartDate || acquisitionDate` — `deriveSec163_9BaseDate`, `transfer-tax-validate-bg.ts:383` · `burdened-gift-presumed-acquisition.ts:61`)을 읽는다.
두 값이 화면에서 갈릴 수 있는가? 갈리면 어떻게 되는가?

## 2. 화면에서 갈리는 길 (코드 근거 — 브라우저 실행은 하지 않았다)

`inheritanceStartDate` 를 쓰는 곳은 **두 곳뿐**이다 — `CompanionAcqInheritanceBlock:75-79`(상속 블록의 날짜 칸, `buildingDatePatch("inheritance", v)` = `acquisitionDate`·`inheritanceStartDate`·`inheritanceDate` 3키)와 같은 patch 를 쓰는 D2 날짜 칸(`CompanionAcquisitionCauseSection:220`). 일반건물 카드의 건물 취득일 칸은 `acquisitionDate` 만(`GeneralBuildingAcquisitionCards.tsx:161` `setBuildingAcqDate`), 토지 카드는 `landCardOnChange`(`:194`)가 `acquisitionDate` 를 `landAcquisitionDate` 로 돌리되 나머지 키(`inheritanceStartDate`)는 그대로 쓴다.

- **분리 ON** 에서 토지 상속일을 넣으면 `inheritanceStartDate = landAcquisitionDate` 다 (화면이 유지하는 불변식).
- 그 뒤 **분리 OFF 로 끄면** `applySeparateOff`(`:214`)가 `landAcquisitionDate` 를 건물 취득일(`acquisitionDate`)로 되맞추지만 **`inheritanceStartDate` 는 건드리지 않는다.** 화면에는 건물 취득일 하나만 상속개시일로 보이는데(`fieldAcquisitionDate` = `acquisitionDate`) 내부에는 옛 토지 상속일이 남는다 → 두 값이 갈린다.
- 분리 ON 전환 패치(`gbSeparateOnPatch`)가 이 키를 되맞추는지는 읽지 않았다 — 「확인 필요」. 이력 복원 레코드는 `inheritanceStartDate` 가 비어 있을 수 있다(`calc-wizard-asset-migrate.ts:245`) → ⑧ 은 `acquisitionDate`(분리 ON 에서는 건물 취득일)로 떨어진다.

## 3. 측정

환경: vitest + `makeMockRates`. 상속개시일 칸 S ∈ {빈 값, 1983-07-26, 1995-05-01} × 토지 취득일 L ∈ {1983, 1995} × 건물 취득일 B ∈ {1983, 1995} × 분리 ON·OFF(OFF 는 L = B) × 방식 3(환산·감정·실가) × 건물 원인 2(상속·매매) × 위치 3 = **324셀**. 토지 원인은 상속, 시가 평가, 담보 승 아님.

| S 와 L | 방식 | ⑧↔⑫ 일치 | 거짓 차단(⑧ 통과 · ⑫ 400) | ⑫ 미차단(⑧ 차단 · ⑫ 200) |
|---|---|---|---|---|
| S = L | 실가 | 36 | 0 | 0 |
| S = L | 환산·감정 | 72 | 0 | 0 |
| S ≠ L | 실가 | 36 | 0 | 0 |
| S ≠ L | 환산·감정 | 12 | **36** | **24** |
| S 빈 값 | 실가 | 36 | 0 | 0 |
| S 빈 값 | 환산·감정 | 48 | **12** | **12** |

- **S = L 이면 어긋남이 없다**(108셀). 화면이 정상적으로 만드는 상태에서는 #2737 이 맞다.
- 갈리는 상태에서만 어긋나고 실가는 영향이 없다 (이 규칙이 환산·감정에만 걸리기 때문).
- 대표 상태(앵커 EC-2): 분리 ON 에서 토지 상속일 1983 → 분리 OFF 로 끔(L = B = 1995, S = 1983 그대로) → 환산·감정 × 위치 3 = **⑧ 통과 · ⑫ 400** (6셀). 화면은 건물 취득일 1995 하나만 보여 주므로 **⑫ 의 판정(1995 → 환산 불가)이 화면과 맞고, ⑧ 이 옛 값 1983 을 읽어 통과시킨 것**이다. 사용자는 ⑧ 을 통과하고 서버에서 400 을 받는다.
- 반대 방향(S = 1995 ⑧ 차단, L = 1983 ⑫ 200): 분리 ON 에서 토지 상속일 1995 → 분리 OFF 로 끄면서 B = 1983 인 경우 — ⑧ 이 옛 값으로 막는다. 세액 오류는 아니고 입력을 다시 해야 하는 화면 문제다.

## 4. 해석

어긋남의 원천은 ⑫ 가 아니라 **⑧ 이 읽는 `inheritanceStartDate` 가 분리 토글 뒤 stale** 인 것이다 (`transfer-163-9-base-date.ts` 머리 주석이 이미 경고하는 「stale `inheritanceStartDate`」 계열). payload 는 토지 파트 취득일을 이미 `partAcquisitionDates(asset).land` 로 만들어 보내므로 ④·엔진은 일관된다.
세액 오류는 아니다 — ⑫ 가 400 으로 막거나(거짓 차단) 막지 않는 쪽이 화면에 보이는 날짜와 같은 방향이다. 문제는 **화면(⑧)이 통과시킨 입력을 서버가 막는 모순**(CLAUDE.md 「UI 통과 ↔ validate 차단 모순 금지」)과 그 반대의 과차단이다.

## 5. 사용자 결정

- **Q-1** ✅ (a) — ⑧ 의 BG 일반건물 분기가 ⑫·④ 와 같은 토지 파트 취득일을 읽게 한다 (사용자 「권고안으로 진행해」). (b) 분리 토글이 `inheritanceStartDate` 도 되맞추기는 이력 복원·저장된 stale 상태를 못 고쳐 기각, (c)는 (b) 가 더해질 뿐이라 이번 범위 밖, (d) 보류는 거짓 차단이 남아 기각.

## 6. 구현 결과 (Q-1 a)

`lib/calc/burdened-gift-presumed-acquisition.ts` — `bgInheritanceBaseDate(asset)`(일반건물은 `partAcquisitionDates(asset).land`, 그 밖은 종전 `deriveSec163_9BaseDate`)와 `isBgPostDeemedInheritance(asset)`를 신설하고, 같은 판정을 하던 **세 곳**이 이것을 쓴다:
- ⑧ `bgPresumedBlock`(`:61` 상속 사유) — 감정·매매사례가액
- ⑧ `transfer-tax-validate-bg.ts` 환산 분기(`:383`)
- ⑤ `BurdenedGiftPresumedAcquisitionSection` 의 환산 라디오 비활성(`inheritedConversionBlocked`)
`deriveSec163_9BaseDate` 는 주택·상가·토지가 공유하므로 바꾸지 않았다.

검증: 앵커 EC-1 — S = L · S ≠ L · S 빈 값 모두 324셀 ⑧↔⑫ 일치(수정 전 거짓 차단 48 · ⑫ 미차단 36), EC-2 대표 상태는 ⑧ 차단 · ⑫ 400 (환산·감정 × 위치 3, 수정 전 ⑧ 통과). 변형(GB 분기 제거) 적색 2건 후 복원 녹색.

## 7. 한계

- §2 의 도달 경로는 코드 근거이며 **브라우저로 확인하지 않았다** (「확인 필요」). 앵커는 그 경로가 만드는 상태(S ≠ L)를 직접 입력해 ⑧·⑫ 를 잰 것이다.
- ⑤ 라디오 비활성(`inheritedConversionBlocked`)은 같은 함수로 바꿨으나 **화면에서 눈으로 확인하지 않았다** — 컴포넌트 단위 검증도 하지 않았다 (「확인 필요」).
- 주택·상가·토지의 `inheritanceStartDate` 사용처는 측정하지 않았다 (이 문서는 BG 일반건물 규칙만).
- 분리 ON 전환 패치(`gbSeparateOnPatch`)가 `inheritanceStartDate` 를 되맞추는지는 읽지 않았다.
