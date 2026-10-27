# 상속·증여 — 자산 종류·겸용 전환으로 일반 범위에 들어올 때 남는 취득가액 산정 방식 플래그

> **출처**: `inherit-stale-acq-mode-flags.plan.md`(#2594) §4 V-1 — 「상속인 채로 자산 종류를 바꿔 다른 경로가 켠 플래그가 남는 경우」. 후속 계획서 `inherit-gift-owner-split-residue.plan.md` Q-3 (b)에서 별건으로 남겼고, `owner-split-residue-followups.plan.md` V-4(「증여 + 남은 환산 플래그 → 400 — #2594 V-1 축」)도 범위 밖으로 넘겼다.
> **검증 깊이**: ~~L2~~ → **L3** (Pre-Do 정정 · V-4) — 막다른 길(화면에 없는 칸 요구 · ⑧ 통과 후 서버 400)을 화면 세션 안에서 없앤다. 옛 형식 직접 필요경비(`directExpenses`)가 있는 상속에서는 남은 플래그가 경비를 0으로 실어 **세액이 조용히 틀렸다**(280,530,000 ↔ 대조 277,002,000) — 이 변경으로 바로잡힌다.
> **상태**: **구현 완료**(2026-10-27) — §7.
> **결정**(사용자 2026-10-27 「권장 사항으로 진행」): **Q-1 = (a)** 일반 범위 진입 전환 patch · **Q-2 = (a)** 상속·증여 둘 다 · **Q-3 = (a)** 되돌아가는 전환의 라디오 값 소실은 받아들인다.

## 0. 한 줄 요약

상속·증여 자산에서 재개발·입주권·겸용주택 화면이 켠 취득가액 산정 방식 플래그(`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition`)가 자산 종류 변경이나 겸용 해제 뒤에도 남는다. 그 뒤의 일반 상속·증여 카드에는 그 플래그를 끌 칸이 없어 계산이 막힌다. 저장 폼을 다시 열면(복원) 정리되지만, 같은 화면 세션 안에서는 정리되지 않는다. **전환하는 순간에 복원과 같은 규칙으로 비운다.**

## 1. 결함 (실측)

### 1.1 경로 — 플래그를 켜는 곳과 일반 범위에 들어오는 곳

일반 범위 = `giftEstimationGenericScope`(`lib/calc/transfer-tax-validate-gift-163-9.ts:26`): 일반건물·재개발·입주권·겸용주택이 **아닌** 자산. 이 범위의 상속·증여 카드에는 산정 방식 라디오가 없다(#2594 §1 · 증여 B1).

| 플래그를 켜는 곳 (일반 범위 밖) | 켜는 플래그 | 상속·증여에서 보이는가 |
|---|---|---|
| 재개발·입주권 §166③ 라디오 `RedevelopmentBlock.tsx:535-541` | `useEstimatedAcquisition` | 상속: 보인다(2026-10-27 화면 실측 — `project_inherit_stale_residuals_measured` V-1). 증여: **확인 필요**(V-1) — 부담부증여는 라디오 대신 안내문이다(`:528`) |
| 겸용 「개별주택가격 미공시」 토글 `mixed-use/MixedUseLegacyStdPrice.tsx:162` · `MixedUseAssetMajorStdPrice.tsx:325` | `useEstimatedAcquisition`(+ `usePreHousingDisclosure`) | 상속: 보인다(같은 화면 실측). 증여: **확인 필요**(V-1) |
| 승계조합원 입주권 산정 방식 `SuccessorRightAcquisitionBlock.tsx:73-78` | 세 플래그 중 하나 | **확인 필요**(V-2) — 블록 렌더 조건은 `isSuccessorRightTransfer`(`assetKind === "right_to_move_in" && isSuccessorRightToMoveIn`)뿐이고 취득원인을 보지 않는다(`AssetSectionAcquisition.tsx:348`). 승계 토글 `SuccessorRightTypeToggle`이 상속·증여에서도 보이는지는 확인하지 않았다 |
| 일반건물 매매 블록 `GeneralBuildingAcquisitionCards.tsx:369-381` | 세 플래그 | 아니다 — 매매에서만 렌더(`:369`)하고, 원인 전환은 `gbUnifiedSec1639ClearPatch`가 비운다 |

| 일반 범위로 들어오는 곳 | 지금 비우는 것 | 산정 방식 플래그 |
|---|---|---|
| 자산 종류 버튼 `asset-sections/AssetSectionBasic.tsx:155-166` | `areaResetPatchForAssetKind` · `redevSubjectPatchForAssetKind` · `housingFlagResetPatchForAssetKind`(주택이 아닌 종류로 바꾸면 겸용 플래그도 끈다) | **안 비운다** |
| 겸용 토글 OFF `MixedUseSection.tsx:50-55` | `isMixedUseHouse`만 | **안 비운다** |

원인 전환 patch(`giftEstimationClearPatch` — `lib/calc/transfer-tax-split-acq-mode.ts:133`)는 **취득원인이 바뀔 때만** 돈다(`CompanionAcquisitionCauseSection`). 위 두 곳은 원인이 그대로라 이 patch가 돌지 않는다.

### 1.2 route 실측 — 전환 patch를 그대로 적용

시료: 2015 상속·증여 주택 · 상속 평가액 3억(보충적 평가) / 증여 신고가액 3억 · 양도 12억 · 2023-02-16 양도. 플래그를 켠 시작 상태(재개발·입주권 + 플래그, 또는 겸용 + 환산·PHD)에 **화면의 전환 patch를 그대로** 적용했다. 자산 종류 버튼 patch 3종을 합치고, 겸용 OFF는 `{ isMixedUseHouse: false }`이다. 그 결과를 ⑧(`allIssues`) → ④(`captureBody`) → ⑫·엔진(`postTransfer`)으로 쟀다. mock 세율이고, 프로브는 커밋하지 않는다. 플래그가 없는 대조는 상속·증여 × 주택·토지 모두 200 · 280,530,000이다.

**상속**

| 남은 플래그 | 취득 당시 기준시가 칸 | ⑧ | ⑫ | 복원 후 |
|---|---|---|---|---|
| 환산 | 채움 | 통과 | 200 · 280,530,000 | 같음 |
| 환산 | **비움** | **「취득 당시 기준시가를 입력하세요」** | 400 `standardPriceAtAcquisition` | 200 · 280,530,000 · 플래그 3종 false |
| 감정 | 채움 | 통과 | **400 「감정가액 방식 선택 시 감정가액을 입력하세요」** | 200 · 280,530,000 |
| 매매사례 | 채움 | **「매매사례가액을 입력하세요」** | 400 | 200 · 280,530,000 |

- 위 4행은 시작 상태가 재개발·입주권이고 목적 종류가 주택·토지인 4조합 모두 같은 값이다.
- 겸용 OFF와 겸용 → 토지도 환산 행과 같은 값이다. 「토지·건물 취득일 분리」 플래그는 켜든 끄든 같다.

**증여**

| 남은 플래그 | ⑧ | ⑫ | 복원 후 |
|---|---|---|---|
| 환산·감정·매매사례 | **「증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다. 실거래가 모드로 …」** — 끌 라디오가 그 카드에 없다(B1) | 400 `useEstimatedAcquisition` | 200 · 280,530,000 · 플래그 3종 false |

- 이 표도 재개발·입주권 × 주택·토지, 겸용 OFF·겸용 → 토지 모두 같은 값이다.
- 기준시가 칸을 비우면 ⑫에 `standardPriceAtAcquisition`이 함께 실린다.

정리하면 상속은 기준시가 칸이 채워져 있고 플래그가 환산일 때만 계산이 된다. 나머지는 모두 막다른 길이다.

- 상속 일반 범위 카드에 「취득 당시 기준시가」 칸이 없다는 것은 #2594 §1 화면 실측(「환산취득가 | ⑧ 『취득 당시 기준시가를 입력하세요』 | 페이지에 0개」)이다.
- 감정 행은 ⑧이 통과한 뒤 서버가 거부해, 사용자에게는 고칠 곳이 없다.

복원은 이미 고친다.
- 상속: `clearInheritedStaleAcqInputs` — `lib/stores/calc-wizard-asset-migrate.ts:709`, 스토어 복원 `calc-wizard-store.ts:307` · 이력 재개 `transfer-resume-entry.ts:137`
- 증여: `migrateAsset`의 `giftEstimatedModeBlocked` 분기 — `calc-wizard-asset-migrate.ts:629`

즉 결함은 **복원 전 화면 세션**에만 있다.

## 2. 원인

일반 범위 상속·증여의 정리 규칙(「이 범위에는 그 라디오가 없으니 플래그를 비운다」)이 두 시점에만 걸려 있다. 하나는 원인 전환, 다른 하나는 복원이다. 같은 원인 그대로 **범위 경계를 넘는 전환**(자산 종류 · 겸용 해제)에는 걸려 있지 않다. 범위 밖 자산에서는 같은 플래그가 정당한 입력이다(재개발 §166③ · 겸용 PHD 환산). 그래서 범위 밖에서 미리 지울 수는 없고, 범위에 **들어오는 순간**에만 비울 수 있다.

## 3. 변경안

### 3.1 순수 함수 하나 — 「일반 범위 진입 정리」

```ts
// lib/calc/transfer-tax-split-acq-mode.ts (giftEstimationClearPatch 옆) — 이름은 착수 때 정한다
export function genericScopeEntryClearPatch(prev: AssetForm, merged: AssetForm): Partial<AssetForm> {
  if (giftEstimationGenericScope(prev) || !giftEstimationGenericScope(merged)) return {};      // 경계를 넘을 때만
  if (merged.acquisitionCause === "inheritance")
    return effectiveBuildingCauseMix(merged) ? {} : giftEstimationClearPatch("inheritance", merged); // 복원(clearInheritedStaleAcqInputs)과 같은 규칙
  if (merged.acquisitionCause === "gift")
    return giftEstimatedModeBlocked(merged) ? giftEstimationClearPatch("gift") : {};             // 복원(migrateAsset :629)과 같은 술어
  return {};
}
```

- **복원과 같은 결과**가 원칙이다. 화면 세션에서 전환한 상태와 저장 폼을 다시 연 상태가 같아진다. 술어(`giftEstimationGenericScope`·`giftEstimatedModeBlocked`·`effectiveBuildingCauseMix`)와 patch(`giftEstimationClearPatch`)는 이미 있는 것을 쓴다(사본 금지).
- 상속은 `giftEstimationClearPatch("inheritance", …)`이라 파트 방식·파트 취득가 4필드도 비운다(#2594 §2.2·§2.3). D2 흔적이 있으면 토지 파트는 남긴다(C10). 복원이 하는 일과 같다.
- 증여는 플래그 3종만 비운다. 부담부증여는 `giftEstimatedModeBlocked`가 거짓이라 건드리지 않는다(V-3).
- 축 B 둘째 이후 지분 카드는 기본정보(자산 종류 버튼)가 숨겨져 이 전환이 일어나지 않는다. 복원 쪽의 지분 카드 건너뜀(`clearInheritedStaleAcqInputs`)과 충돌하지 않는다.

### 3.2 호출하는 곳 2곳 — 같은 onChange 배치에 합친다(`useEffect` 미러링 금지)

1. `AssetSectionBasic.tsx:157-166` 자산 종류 버튼: 기존 patch 3종을 합친 `next`로 `merged = { ...asset, ...next }`를 만든다. 그리고 `...genericScopeEntryClearPatch(asset, merged)`를 같은 `onChange`에 더한다. 주택 → 토지·건물이면 `housingFlagResetPatchForAssetKind`가 겸용을 끄므로, 겸용 → 토지 경로도 여기서 잡힌다.
2. `MixedUseSection.tsx:50-55` 겸용 토글: `checked === false`이면 `...genericScopeEntryClearPatch(asset, { ...asset, isMixedUseHouse: false })`를 더한다.

④·⑧·⑫·엔진은 바꾸지 않는다.

### 3.3 후보 임시 적용 실측

§3.1 함수를 프로브 안에 임시로 두고, §1.2의 전환 결과에 덧붙여 다시 쟀다. 범위는 원인 2 × 기준시가 칸 2(채움·비움) × 시작 상태 2(재개발·입주권) × 플래그 3 × 목적 종류 2(주택·토지) = 48행에, 원인 2 × 기준시가 칸 2 × 겸용 OFF = 4행을 더한 52행이다. **52행 모두 ⑧ 통과 · 200 · 280,530,000(= 대조)**이다. 부담부증여 시료는 평가 유형(`bgValuationMode`) 미입력으로 ⑧에서 멈춰 측정하지 못했다(V-3).

## 4. 사용자 결정

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 고칠 층 | (a) 일반 범위 진입 전환 patch(§3) · (b) 읽는 쪽 — ④·⑧·⑫가 일반 범위 상속·증여면 세 플래그를 무시 · (c) 그대로 두고 ⑧ 메시지에 「새로고침하면 정리됩니다」 안내 | **(a)** — 복원과 같은 규칙을 전환 시점에도 거는 것이라 새 규칙이 없다. #2594가 이 축(자산 단위 플래그)에서 고른 층도 입력 정리였다(그 결정의 (b) 기각). (b)는 ⑫(서버)까지 바꿔야 하고, 범위 밖 정당 입력과의 경계를 세 층에 복제한다 |
| Q-2 | 증여 포함 | (a) 상속·증여 둘 다 · (b) 상속만 | **(a)** — 증여도 같은 막다른 길이 재현되고(§1.2), 복원 규칙(`giftEstimatedModeBlocked`)이 이미 있다 |
| Q-3 | 되돌아가는 전환 | 주택으로 바꿨다가 다시 재개발로 돌아오면 §166③ 라디오가 「실지거래가액」으로 돌아와 있다. (a) 받아들인다 · (b) 플래그를 별도 키에 보관했다가 되살린다 | **(a)** — 그 라디오는 재개발 카드에 보이므로 조용한 오계산이 아니다(#2594 V-7 「매매 → 상속 → 매매 왕복」과 같은 비용). (b)는 새 필드가 생겨 14지점 동기화 대상이 된다 |

## 5. 테스트 계획

- **Pre-Do anchor**(route — 신규 1파일, 예: `__tests__/api/transfer.route.inherit-gift-scope-entry-stale-acq-flags.anchor.test.ts`)
  - 수정 전 계약: §1.2 표의 막다른 길 행(⑧ 메시지 · 400 필드)과 복원 후 대조를 적는다.
  - 수정 후: 상속·증여 × 재개발·입주권·겸용 × 플래그 3 × 주택·토지에서 전환 patch(화면과 같은 합성)가 대조와 같다.
  - 범위 확인: 범위 안 → 범위 안 전환(예: 주택 → 토지, 매매)은 빈 patch. 매매 원인은 빈 patch. D2 흔적 상속은 토지 파트 보존(C10). 부담부증여는 플래그 그대로.
- **render anchor**: 자산 종류 버튼 · 겸용 토글 OFF가 한 번의 `onChange`에 플래그 소거를 싣는다. 재개발 → 재개발처럼 범위 밖에 머무는 전환은 싣지 않는다.
- **E2E 2건**(headless): ① 상속 재개발 §166③ 「환산취득가액」 → 자산 종류 주택 → 계산 200 · 대조 세액 > 0. ② 상속 겸용 「개별주택가격 미공시」 → 겸용 OFF → 계산 200. 증여 화면 경로는 V-1 확인 결과에 따라 추가한다.
- **mutation(구현 후)**
  - M1 경계 조건 제거(항상 비움): 범위 밖 정당 입력 소실 → render anchor
  - M2 증여 분기 제거 → 증여 행
  - M3 자산 종류 버튼 호출 제거 → 재개발·입주권·겸용 → 토지 행
  - M4 겸용 OFF 호출 제거 → 겸용 OFF 행
  - M5 D2 제외 제거 → C10 행
  - M6 `giftEstimatedModeBlocked` → 무조건 → 부담부증여 행

## 6. 미검증 · 별건 V-n

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 증여에서 재개발 §166③ 라디오 · 겸용 「개별주택가격 미공시」 토글이 화면에 보이는가 | ✅ 2026-10-27 화면 실측(headless Playwright 프로브) — 상속·증여 모두 보인다(재개발 라디오 · 겸용 PHD 토글). 증여도 화면 도달 경로다 |
| V-2 | 승계조합원 입주권 산정 방식(세 플래그)이 상속·증여에서 보이는가 | ✅ 2026-10-27 화면 실측 — 입주권이면 `SuccessorRightTypeToggle`이 원인과 무관하게 보이고(`AssetSectionBasic.tsx` `assetKind === "right_to_move_in"`), 승계를 고르면 산정 방식 4종(실지거래가액·매매사례가액·감정가액·환산취득가액)이 상속·증여에서도 보인다. ⇒ §1.2 감정·매매사례 행도 화면 도달 경로다 |
| V-3 | 부담부증여 × 남은 산정 방식 플래그 | 🟡 2026-10-27 실측(§8) — **세액은 바뀌지 않는다**(부담부증여는 `bgAcquisitionMethod`로 계산). 값 없는 감정·매매사례 플래그는 **막다른 길**이다. 매매에서 고른 뒤 양도 유형을 부담부증여로 바꾸는 경로에서 도달하며, 이 경로는 복원도 고치지 못한다. 후속 계획 필요 |
| V-4 | 세액이 바뀌는 조합 | ✅ 2026-10-27 route 실측 — 상속 소유자 분리(건물만 154,500,000 · 토지만 94,022,000)와 현행 자본적지출 칸(277,002,000)은 남은 플래그 3종 모두 세액이 같다(#2607 정규화). **옛 형식 `directExpenses` 1천만만** 남은 환산·감정·매매사례가 경비를 0으로 실어 280,530,000(대조 277,002,000) — #2594 TX-1과 같은 축. 증여는 모두 ⑧ 차단. ⇒ 깊이 L3 |
| V-5 | 증여 ⑧ 메시지(`giftEstimatedModeError`)는 필드 키가 없다(프로브 `field: undefined`) — 오류를 눌러도 이동할 칸이 없다 | ⏳ 별건 관찰. 이 변경 뒤에는 화면 세션에서 이 메시지가 날 경로가 줄어든다 |
| V-6 | 다른 범위 경계 전환 | ✅ 2026-10-27 grep — `assetKind` 쓰기: 자산 종류 버튼(§3.2) 외에는 새 자산 생성(`CompanionAssetCardReplot` 증환지 증가분 · `swap-selling-house` 명부 행 → 판정 기본 자산에서 시작)과 판정 메뉴(`one-house-exemption/Step3`)뿐이다. `isMixedUseHouse` 쓰기: 겸용 토글 · `housingFlagResetPatchForAssetKind`(자산 종류 버튼 안) · 기본값 상수뿐이다 |


## 7. 구현 결과 (2026-10-27)

- 신규 `lib/calc/transfer-generic-scope-entry.ts` `genericScopeEntryClearPatch(prev, merged)`. `lib/calc/transfer-tax-split-acq-mode.ts`는 778줄이라 800줄 트리거를 피해 별도 파일로 뒀다. 기존 술어·patch만 조합한다.
- 호출: `AssetSectionBasic.tsx` 자산 종류 버튼(기존 patch 3종 합성 → `merged`)과 `MixedUseSection.tsx` 겸용 토글 OFF. 둘 다 같은 `onChange` 한 번에 싣는다.
- 테스트:
  - render anchor `__tests__/components/inherit-gift-scope-entry-stale-acq-flags.anchor.test.tsx` 14건 — 버튼·토글이 싣는다 / 매매·범위 밖 유지·범위 안 이동·부담부증여는 싣지 않는다.
  - route anchor `__tests__/api/transfer.route.inherit-gift-scope-entry-stale-acq-flags.anchor.test.ts` 18건 — 수정 전 막다른 길 계약 · 상속·증여 × 재개발·입주권 × 3플래그 × 주택·토지 × 기준시가 칸 채움·비움 = 대조 280,530,000 · 겸용 OFF·겸용 → 토지 · 수정 후 = 복원 후 · 옛 `directExpenses` 280,530,000 → 277,002,000 · 범위(매매·부담부증여·재개발 → 입주권·D2).
  - E2E `e2e/inherit-gift-scope-entry-stale-acq-flags.spec.ts` SE-E1(재개발 환산 → 주택) · SE-E2(겸용 PHD → 겸용 OFF), 대조 세액과 같음.
- mutation 7/7 KILLED: M1 경계 조건 제거 · M2 증여 분기 제거 · M3 자산 종류 버튼 호출 제거 · M4 겸용 OFF 호출 제거 · M5 D2 제외 제거 · M6 증여 술어 무조건 · M7 상속을 증여 patch로. 호출 2곳을 함께 뺀 E2E 변형에서도 2건 모두 실패했다.
- 화면 모양은 바뀌지 않는다(새 칸·문구 없음) — 스크린샷 점검은 하지 않았다.

## 8. V-3 실측 — 부담부증여 (2026-10-27)

### 8.1 route (⑧ → ④ → ⑫·엔진 · mock 세율 · 프로브 커밋 안 함)

시료: 2009 취득 주택 · 부담부증여(직계비속 · 임대보증금 3억 + 담보채무 3억) · 양도시 기준시가 1,000,000,001 · 취득시 500,000,001 · 원인 매매·상속·증여 × 평가 유형 3(상증법 기준시가 · 시가 + 실지취득가액 · 시가 + 환산) × 플래그(없음·환산·감정·감정+값·매매사례·매매사례+값).

| 결과 | 행 |
|---|---|
| **세액 불변** | 200이 나온 모든 행이 같은 평가 유형의 「플래그 없음」과 같다 — 기준시가 56,516,000 · 시가 환산 56,516,000 · 시가 실지취득가액 74,870,000(⑧은 실지취득가액 칸 미입력으로 막지만 ⑫는 200) |
| 감정 · 값 없음 | 매매·상속: ⑧ 통과 → **서버 400 `appraisalValue`**. 증여는 신고가액(`fixedAcquisitionPrice`)이 그 값으로 실려 200 |
| 매매사례 · 값 없음 | 세 원인 모두 ⑧ 「매매사례가액을 입력하세요」 · 400 `similarSalesValue` |
| 환산 · 값 있는 감정·매매사례 | 200 · 세액 불변 |
| 복원(저장 폼 재로드) | 상속은 비운다(`clearInheritedStaleAcqInputs`는 양도 유형을 보지 않는다). 매매·증여는 그대로 둔다(증여는 `giftEstimatedModeBlocked`가 부담부증여를 뺀다) |

④는 남은 플래그를 최상위 `acquisitionMethod`(`estimated`·`appraisal`·`salesCase`)로 싣는다. 부담부증여 계산은 `burdenedGiftInfo.acquisitionMethod`(= `bgAcquisitionMethod`)를 쓰므로 세액에는 닿지 않는다. 막히는 곳은 ⑧·⑫의 최상위 감정·매매사례 필수 검사뿐이다.

### 8.2 화면 (headless Playwright 프로브)

- 부담부증여 주택 카드(매매·상속·증여 모두)에는 산정 방식 라디오(`data-field="useEstimatedAcquisition"`)가 **0개**다. 매매사례가액 칸(`similarSalesValue`)과 취득가액 칸(`fixedAcquisitionPrice`)도 **0개**다. 끌 수단도 값을 넣을 칸도 없다.
- **도달 경로 A — 양도 유형 전환**: 매매 주택에서 「감정가액」 또는 「매매사례가액」을 고른 뒤 양도 유형을 「부담부증여 (소령 §159)」로 바꾼다. 플래그는 남고(`isAppraisalAcquisition`·`isSalesCaseAcquisition` true) 라디오는 사라진다. 전환 patch(`TransferModeBlock.tsx` `selectMode` 부담부증여 분기)는 수용 프리필만 정리하고 산정 방식 플래그는 건드리지 않는다. 매매는 복원 정리 대상도 아니라 **새로고침해도 막힌 채**다.
- **도달 경로 B — 승계 입주권 → 자산 종류 변경**: 부담부증여에서도 승계 입주권 산정 방식 4종이 보인다(매매·상속·증여 모두). 그 뒤 주택으로 바꾸면 상속은 #2622가 비우지만 매매·증여는 남는다(부담부증여는 `giftEstimatedModeBlocked`가 거짓).
- 겸용 × 부담부증여의 「개별주택가격 미공시」 토글은 비활성이다(매매·상속·증여 모두 `disabled`) — 이 경로로는 플래그를 켤 수 없다.

### 8.3 결론

조용한 오계산은 없다. 값 없는 감정·매매사례 플래그가 남으면 계산이 막히고, 고칠 칸이 화면에 없다. 경로 A는 이 계획서의 범위(상속·증여의 일반 범위 진입)보다 넓다 — 원인이 **매매**이고 경계가 **양도 유형**이다. 별도 계획서로 다룬다 → [bg-stale-acq-mode-flags.plan.md](bg-stale-acq-mode-flags.plan.md). 고칠 층 후보는 둘이다. (a) 부담부증여 전환 patch·복원에서 세 플래그를 비운다(부담부증여 카드에 그 라디오가 없으므로). (b) 부담부증여면 ④·⑧·⑫가 최상위 감정·매매사례 검사를 하지 않는다. 고르기 전에 부담부증여 재개발 K-5·겸용 의제 경로가 최상위 `useEstimatedAcquisition`을 읽는지 확인해야 한다.