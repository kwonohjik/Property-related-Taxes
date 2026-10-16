# 첫 자산 삭제 — 주 자산 표시·미등기·사이드바 결과 정합 — 계획서 (v0.1)

> 작성 2026-10-16 · 출처: 1주택 코드 리뷰 후속 G1(#2198) 「남은 한계 — 첫 자산 삭제 시 `isPrimaryForHouseholdFlags` 미보정·사이드바 result stale(기존 갭)」
> 상태: **결정 확정(2026-10-16 사용자 「권고대로」) — Q-1 index 판정 · Q-2 기본 라벨 재번호 · Q-3 입력 변경 시 항상 결과 비움 · Q-4 첫 자산 삭제 시 재마운트** · Do 완료(§7-R) · V-1은 Q-5로 별도 결정.
> 수치는 throwaway probe(route POST 실행, `__tests__/zz-probe/first-asset-removal.probe.test.ts`, 측정 후 삭제 — 사본은 세션 scratchpad)로 잰 값이다. 실행하지 않고 코드만 읽은 항목은 «코드읽기»로 표시했다.

---

## 0. 한눈에

양도세 단건 마법사(다건 임베드 포함)에서 자산이 2건 이상일 때 **첫 자산을 삭제**하면 세 가지가 어긋난다. 두 번째는 **세액이 틀린다**.

| # | 증상 | 종류 | 실측 |
|---|---|---|---|
| D-1 | 새 첫 자산 카드에 「주 자산」 배지가 없고, 첫 자산 전용이 아닌 「토지 세율 수동 지정」 토글이 첫 자산에 뜬다. 그 토글 값은 ④가 보내지 않는다(입력해도 계산에 안 들어가는 칸) | 화면 | 삭제 후 플래그 `[false, false]` · 첫 자산의 오버라이드 `progressive` → body에 **없음**(같은 자산이 컴패니언이면 `progressive` 전송) |
| D-2 | 지운 첫 자산의 **미등기 여부(폼 전역)**가 새 첫 자산에 붙는다. 새 첫 자산 자신의 미등기 값(자산 필드)은 무시된다 | **세액** | 토지 3건 중 미등기 첫 자산 삭제 → 남은 [B, C] 총세액 **81,966,500**(정답 29,408,500) |
| D-3 | 사이드바가 계산 직후의 엔진 값을 계속 쓴다. 첫 자산을 지우면 **지운 자산의 값이 새 첫 행에 붙는다** | 표시 | 아래 §1 |

D-3은 첫 자산 삭제에만 있는 문제가 아니다. **계산한 뒤 어떤 값을 고쳐도** 사이드바는 옛 엔진 값을 보인다(§1 P5·P6). 첫 자산 삭제는 그 위에 «엉뚱한 자산의 값»이 붙는 경우다.
결과 화면은 「계산하기」로만 열리고 매번 다시 계산하므로(`TransferTaxCalculator.tsx:260-276`) **결과 탭에는 옛 값이 안 보인다** — 낡은 값이 보이는 곳은 입력 단계의 사이드바와 수동 저장이다.

---

## 1. 실측 (probe, 2026-10-16, master `2b0f89e89`)

토지 3건, 취득일 2015-03-01, 양도일 2024-03-01, 자산 1·2·3 양도가 5억·3억·2억 / 취득가 1억·2억·1.5억(계약서 가액 모드). 안분 모드는 총 양도가액 12억, 양도시 기준시가는 양도가의 1/2.

| # | 경우 | 사이드바 첫 행(라벨 · 양도가 · 취득가) | 다시 계산한 값 | 판정 |
|---|---|---|---|---|
| P1 | 계약서 가액 · **첫 자산 삭제** | 자산 2 · **500,000,000 · 100,000,000** | 자산 2 · 300,000,000 · 200,000,000 | ❌ 지운 자산 1의 값 |
| P2 | 계약서 가액 · 가운데 자산 삭제(대조군) | 자산 1 · 500,000,000 · 100,000,000 | 같음 | ✅ |
| P3 | 계약서 가액 · 2건 중 첫 자산 삭제 → 1건 | 자산 2 · **500,000,000 · 100,000,000** | 자산 2 · 300,000,000 · 200,000,000 | ❌ |
| P4 | 안분 · **첫 자산 삭제** | 자산 2 · **600,000,000 · 100,000,000** | 자산 2 · 720,000,000 · 200,000,000 | ❌ 지운 자산 1의 값 |
| P5 | 안분 · 가운데 자산 삭제 | 자산 1 · **600,000,000** (자산 3 · 240,000,000) | 자산 1 · 857,142,857 (자산 3 · 342,857,143) | ❌ 옛 안분값 |
| P6 | 계약서 가액 · 삭제 없이 자산 1 양도가 5억→6억 | 자산 1 · **500,000,000** | (입력값 6억) | ❌ 옛 엔진값 |
| P7 | 미등기 첫 자산(폼 전역 `isUnregistered: true`) 삭제 → [B, C] | — | 총세액 **81,966,500** vs 정답 29,408,500 | ❌ 세액 |
| P8 | 새 첫 자산(토지)에 남은 `manualHoldingPeriodOverride: "progressive"` | body `manualHoldingPeriodOverride` **없음** · 컴패니언 위치 대조군은 `"progressive"` | — | D-1의 «안 보내는 칸» |

결과 없이(`result = null`) 계산한 사이드바 프리뷰는 P1·P4 모두 다시 계산한 값과 같다 — **결과만 비우면 사이드바는 올바른 프리뷰로 돌아간다**.

---

## 2. 원인 (file:line)

### D-1 주 자산 플래그
- 삭제는 `CompanionAssetsSection.tsx:85-87` `removeAsset` 한 곳 — 배열에서 빼기만 한다.
- `isPrimaryForHouseholdFlags`는 index에서 파생되지 않는 **저장 필드**다. 만들 때만 정해진다(`calc-wizard-asset-factory.ts:100` `index === 1`). 복원 마이그레이션도 일부러 다시 채우지 않는다(`calc-wizard-asset-migrate.ts:660-671`). ⇒ 한 번 어긋나면 새로고침·이력 불러오기 후에도 그대로다(코드읽기).
- 소비처는 화면뿐이다: `CompanionAssetCard.tsx:133`(배지 `:260`, 카드 배경 `:239`) → `AssetSectionAcquisition.tsx:196` `!isPrimary`면 「토지 세율 수동 지정」. ④·route·엔진은 이 필드를 읽지 않는다(grep 0건).
- 같은 카드의 다른 «첫 자산» 게이트는 이미 index로 판정한다: 다필지 `isFirst`(`AssetSectionAcquisition.tsx:61`), 증여 세대 질문 `isNonPrimaryAsset={!isFirst}`(`:184`), 카드 제목 `자산 {index + 1}`(`CompanionAssetCard.tsx:258`). 한 카드 안에서 두 방식이 섞여 있다.

### D-2 미등기
- 주 자산의 미등기는 **폼 전역** `form.isUnregistered`(④ `transfer-tax-api.ts:494`), 컴패니언은 **자산** `asset.isUnregistered`(`transfer-tax-api-companion-payload.ts:491`)에 산다(`calc-wizard-asset-factory.ts:98` 주석).
- G1 교환(#2198)은 이 값을 순서와 함께 옮긴다(`reverse-appurtenant-swap.ts:83-90`, T2). 삭제 경로에는 그 처리가 없다.

### D-3 사이드바 결과
- `computeTransferPerAssetSummary(formData, result)`(`TransferTaxCalculator.tsx:106-113`)는 결과가 있으면 엔진 값을 쓴다. 다건 결과의 첫 행은 assetId가 아니라 **`"primary"`로 매칭**한다(`transfer-per-asset-summary.ts:321-324` — route가 주 자산 id를 `"primary"`로 고정). 그래서 첫 자산이 바뀌면 옛 주 자산의 값이 새 첫 행에 붙는다(P1·P3·P4).
- 입력 수정 경로 `updateFormAndInvalidate`(`TransferTaxCalculator.tsx:166-174`)는 결정세액·가산세 결과만 비우고 **`result`는 비우지 않는다**. `result`를 비우는 곳은 G1 교환 한 곳뿐이다(`Step1.tsx:149-154` → `onInvalidateResult={clearResult}` `:351`).
- 부수 효과(코드읽기): 입력 단계에도 있는 「저장」 버튼(`TransferTaxCalculator.tsx:417`)은 `result`가 있으면 **고친 입력 + 옛 결과**를 최종본(`isDraft: false`)으로 저장한다(`save-handler-builders.ts:74-96`).
- 같은 계열의 기존 기록: 주식 마법사는 PR #1327에서 `updateFormData`가 `result`를 비우도록 고쳤고, 양도세 공용 스토어는 「🟠 미확인 별건」으로 남아 있었다(memory `feedback_store_update_must_invalidate_result`). 이 계획이 그 별건의 실측이다.

---

## 3. 범위

**한다**: D-1 · D-2 · D-3(결정 Q-3에 따라 범위가 정해짐) · 회귀 anchor.
**하지 않는다**: 세액 산식 변경 · 새 입력 필드 · route·Zod 변경(⑫⑬⑭ 해당 없음 — 쓰는 키는 기존 `assets`·`isUnregistered`) · 순서 이동 UI.

---

## 4. 설계

### 4-1. D-1 — 「주 자산」을 index로 판정 (권고, Q-1)
`CompanionAssetCard.tsx:133` `const isPrimary = asset.isPrimaryForHouseholdFlags;` → `const isPrimary = index === 0;`

- 한 줄로 삭제·교환·옛 저장분(이미 어긋난 이력)이 함께 맞는다. 같은 카드의 다른 첫 자산 게이트(`isFirst`)와 방식이 같아진다.
- 저장 필드는 남긴다(교환 T1·팩토리·복원 제외 목록이 쓰는 키 — 지우면 마이그레이션까지 손댄다). 삭제 경로(4-2)에서도 `i === 0`으로 맞춰 써서 저장값과 화면이 어긋나지 않게 한다.
- 정상 상태에서 두 방식이 다른 경우는 없다 — 플래그를 `true`로 쓰는 곳은 팩토리 `index === 1` · 구 포맷 마이그레이션의 주 자산 · 교환 `i === 0` 셋뿐이다(grep).

### 4-2. D-2 — 삭제 패치 leaf (`lib/calc/asset-removal.ts`, 신규)
교환 leaf(`reverse-appurtenant-swap.ts`)와 같은 형태의 순수 함수.

```ts
export function assetRemovalPatch(
  form: Pick<TransferFormData, "assets" | "isUnregistered">,
  idx: number,
): { assets: AssetForm[]; isUnregistered: boolean }
```

- `idx !== 0`: 배열에서 빼기만 한다. `isUnregistered`는 그대로.
- `idx === 0`: 새 첫 자산의 `asset.isUnregistered`를 폼 전역으로 올리고 그 자산의 값은 `false`로 둔다(교환 T2의 «승격» 쪽과 같은 규칙). 지운 자산의 폼 전역 값은 버린다.
- 모든 자산 `isPrimaryForHouseholdFlags = i === 0`.
- 기본 라벨 재번호는 Q-2.

배선: `CompanionAssetsSection`에 `onRemoveAsset?(idx)` prop을 더하고 `removeAsset`이 있으면 그것을 부른다. `Step1`의 핸들러가 `assetRemovalPatch` → (첫 자산이면) `onInvalidateResult()` → `onChange(patch)`.
`updateAssets`의 `splitMode` 처리(`Step1.tsx:156-169` — 1건이 되면 `contractTotalPrice`를 첫 자산 양도가로)는 그대로 거치게 한다. `assetsRef` 동기화(`CompanionAssetsSection.tsx:66-83`)도 유지한다.

### 4-3. D-3 — 결과 비우기 (Q-3)
- **A(좁게)**: 삭제(또는 첫 자산 삭제)에서만 `clearResult()`. P1·P3·P4는 고치고 P5·P6·저장 문제는 남는다.
- **B(넓게, 권고)**: `updateFormAndInvalidate`에서 `result`도 비운다(주식 #1327과 같은 처리). 입력이 바뀌면 사이드바는 입력값 프리뷰로 돌아가고, 저장은 초안으로 저장된다. 결과 화면은 어차피 「계산하기」로만 열리고 다시 계산하므로 잃는 값이 없다.
  - 예상되는 화면 변화(정상 동작): 계산 뒤 아무 값이나 고치면 사이드바의 환산취득가액 같은 엔진 값이 「계산 후 표시」로 돌아간다.
  - B를 고르면 4-2의 `onInvalidateResult()` 호출은 중복이라 넣지 않는다.

### 4-4. 카드 접힘 상태 (Q-4)
카드의 섹션 펼침 상태는 마운트 때 한 번 정해진다(`CompanionAssetCard.tsx:188` — 첫 카드만 ①을 펼친 채 시작, ①에 양도일·신고일 칸이 있다). 카드 key가 assetId라(`CompanionAssetsSection.tsx:99`) 삭제 후 새 첫 카드는 컴패니언 때의 접힘 상태를 유지한다(코드읽기 — 화면 미확인).
교환은 같은 이유로 재마운트 세대(`remountEpoch`)를 올린다(`Step1.tsx:151`). 삭제도 첫 자산이면 같은 세대를 올릴지 결정한다.

---

## 5. 결정 필요 (권고 = 기본값)

| Q | 질문 | 권고 | 대안 |
|---|---|---|---|
| Q-1 | 「주 자산」 판정 방식 | **index로 판정**(4-1) — 옛 저장분까지 맞음 | 삭제 시 플래그만 다시 씀(옛 저장분은 어긋난 채) |
| Q-2 | 첫 자산을 지우면 기본 라벨(`자산 N`)을 새 위치로 다시 매길까 | **다시 매김**(사용자가 고친 라벨은 그대로 — 교환과 같은 규칙). 카드 제목·사이드바는 위치 번호(`CompanionAssetCard.tsx:258` `자산 {index + 1}` · `TransferSidebarSummary.tsx:56` `자산 {row.index}`)를 쓰지만, 저장 라벨은 컴패니언 payload(`transfer-tax-api-companion-payload.ts:246`)로 결과 화면 배분표 등에 실린다 — 지우고 나면 입력 화면 「자산 2」가 결과에서 「자산 3」이 된다(코드읽기). ※ v0.1의 「사이드바는 자산 2」는 오기 — 사이드바도 위치 번호다 | 그대로 둠. 가운데 삭제에도 적용할지는 함께 결정 |
| Q-3 | 결과 비우기 범위 | **B — 입력이 바뀌면 항상**(P5·P6·저장까지 해소) | A — 삭제에서만 |
| Q-4 | 첫 자산 삭제 시 카드 재마운트 | **올림**(교환과 같게, 새 첫 카드의 ① 펼침) | 그대로 |

---

## 6. 미검증 (Do 진입 전 또는 Do-0에서 확인)

| V | 내용 | 확인 방법 |
|---|---|---|
| V-1 | **미등기 말고도 «주 자산이면 폼 전역에서 읽는 값»이 더 있는가.** 보유 상황 단계(Step4)의 세대·거주기간·주택 수·조정대상지역 등은 첫 자산 기준으로 입력받는다 — 첫 주택을 지우면 그 사실이 새 첫 자산의 사실로 읽힌다(코드읽기, 미실측). 교환 PR은 주택 카드 키 501개를 바꿔 보며 «위치에 따라 ④ 본문이 바뀌는 키»를 찾았다(`reverse-appurtenant-swap.ts:107-115`) | 폼 전역 키를 하나씩 바꿔 «주 자산 위치에서만 ④ 본문이 바뀌는 키» 전수 diff. 결과에 따라 Q-5(고지 / 확인 필요 표시 / 범위 밖) |
| V-2 | Q-3 B 채택 시 **결과 화면에서 `updateFormAndInvalidate`가 불리는 경로가 없는가**. 있으면 결과가 비워지고 `isResult`가 false가 되어 화면이 1단계로 튄다(`TransferTaxCalculator.tsx:155-159`) | 결과 화면 컴포넌트의 폼 쓰기 grep(가산세 `setUnpaidTax`는 `updateFormData` 직통 `:305` — 해당 없음) + E2E 1건 |
| V-3 | 입력 단계 컴포넌트가 마운트 시 폼을 쓰는가(이전 → 입력 단계 복귀만으로 결과가 비워지는지). 비워져도 결과 탭은 재계산이라 잃는 값은 없으나, 사이드바가 바로 프리뷰로 바뀐다 | Step1~4 마운트 effect grep + E2E |
| V-4 | 다건 계산기(`/calc/transfer-tax/multi`)의 자산 편집이 같은 `Step1` 경로를 쓰는가, 다건 자체 결과에도 같은 stale이 있는가 | 코드읽기 + probe |
| V-5 | 4-4 접힘 상태가 실제로 남는가 | Playwright로 삭제 후 첫 카드 ① 상태 확인 |

---

## 7. 작업 순서 (Do)

1. **Do-0 실측** — V-1~V-5. V-1에서 새 키가 나오면 범위를 다시 정한다(사용자 확인). → verify: 표로 기록
2. **anchor 먼저(RED)** — P1·P4(사이드바 첫 행), P7(세액 29,408,500), 역방향(컴패니언 B가 미등기 `true`인 채 첫 자산이 됨 → 폼 전역 `true`), 플래그·라벨 → verify: 수정 전 실패 확인
3. **4-1 · 4-2 · 4-3 · 4-4 구현** → verify: anchor GREEN · tsc 0 · lint 0
4. **뮤테이션** — ① T2 승격 줄 제거 ② `i === 0` → `i === 1` ③ `clearResult` 호출 제거 ④ 카드 `index === 0` 뒤집기 → verify: 전부 KILLED
5. **회귀** — `npm test` 전체(`lib/stores`·`lib/calc` 변경이라 pre-push가 어차피 전체) · 관련 E2E(교환 `g1-reverse-appurtenant-swap`, 다건 자산 편집) · **브라우저 확인**: 자산 3건 계산 → 1단계로 돌아가 첫 자산 삭제 → 배지·사이드바·다시 계산한 결과 → verify: 수치 기록

### 회귀 수치 비교 기준
수정 전후 **삭제가 없는 경로의 세액은 바이트 동일**이어야 한다(세액에 닿는 변경은 삭제 경로의 `isUnregistered`뿐). 사이드바 표시는 Q-3 B면 «계산 후 수정» 경로에서 바뀌는 것이 의도된 변화다.

---

### 7-R. Do 결과 (2026-10-16)

**미검증 항목 확인**
| V | 결과 |
|---|---|
| V-1 | **있다(코드읽기)**. ④가 폼 전역에서 읽어 «양도하는 첫 자산의 사실»로 보내는 값: 거주기간 `residencePeriodMonths` · 취득 당시 조정대상지역 `wasRegulatedAtAcquisition` · 일시적 2주택(`temporaryTwoHouseSpecial`·`newHouseAcquisitionDate`) · 대체주택 `repl*` · §154① 단서 `proviso*` · 혼인·합가 `mergedHousehold*` · 입주권 `right*` · 분양권 `presaleRight*` · 판정 메뉴에서 넘겨받은 사실 `importedOneHouseFacts` 등. 첫 주택을 지우면 이 값이 새 첫 자산의 사실로 읽힌다. 같은 일은 첫 자산을 «그 자리에서 다른 물건으로 고칠 때»도 생긴다(위치 기준 입력이라). **이번 범위에서 제외 — 사용자 결정 Q-5로 넘김** |
| V-2 | 결과 화면 블록(`isResult && result`)에는 폼 쓰기가 없다. 가산세 `setUnpaidTax`는 `updateFormData` 직통(`TransferTaxCalculator.tsx:309`) |
| V-3 | 입력 단계 마운트 effect는 Step4 두 개(`Step4.tsx:267`·`:300`) — 값이 어긋났을 때만 쓴다. 정상 상태에서 단계 이동만으로 결과가 비워지지 않는다 |
| V-4 | 다건 계산기는 자체 스토어 `result`를 쓴다(`MultiTransferTaxCalculator.tsx:268`·`:401`) — 단건 스토어 결과를 비워도 닿지 않는다 |
| V-5 | 재마운트 없이는 새 첫 카드의 ① 기본정보(양도일·신고일)가 접혀 있다 — E2E 단언(재마운트 제거 뮤테이션 KILLED)로 확인 |

**구현**: `lib/calc/asset-removal.ts`(신규) · `CompanionAssetCard.tsx:133` index 판정 · `CompanionAssetsSection` `onRemoveAsset` · `Step1` `handleRemoveAsset`(첫 자산이면 재마운트, `updateAssets` 분기 그대로 거침) · `TransferTaxCalculator` `updateFormAndInvalidate`에서 `clearResult()`.
Q-2 재번호는 가운데 삭제에도 적용했다(같은 갈림이 생긴다).

**anchor**: `__tests__/calc/first-asset-removal.anchor.test.ts`(route 실행 — R-1 29,408,500 · R-2 81,966,500 · R-3~R-6) · `__tests__/components/first-asset-primary-badge.anchor.test.tsx`(B-1~B-3, 수정 전 RED 확인) · E2E `e2e/transfer-first-asset-removal.spec.ts`(계산 → 자산 목록 → 첫 자산 삭제 → 배지·① 펼침·저장 폼·사이드바 → 재계산 = 처음부터 [B, C] 폼).

**뮤테이션 8종 전부 KILLED**(파일 백업 복원 하네스, E2E 변형은 테스트 단언 실패로 확인 — 서버 기동 실패 아님): T2 승격 줄 제거 · 폼 전역 미등기 그대로 · 플래그 `i === 1` · 라벨 재번호 제거 · 카드 저장 플래그 복귀 · `clearResult` 제거 · Step1 삭제 배선 제거 · 재마운트 제거.

**회귀**: tsc 0 · eslint 0 · 사이드바·결과 복귀 관련 E2E 24건(겸용 사이드바·환산 프리뷰·split 결과 해소·G1 교환 포함) 통과.

## 8. 범위 밖 (알려진 한계)

- 순서 이동 UI 없음(교환 버튼은 사례 28 역방향 전용).
- 첫 자산에만 반영되는 입력(다필지·정밀판정·가업상속 등, `reverse-appurtenant-swap.ts:35-46`)이 지운 자산에 있었다면 그 자산과 함께 사라진다 — 정상(삭제한 자산의 입력).
- 반대로 컴패니언일 때는 안 보내다가 첫 자산이 되면 처음 보내는 입력(자산별 거주기간·신축 등, `reverse-appurtenant-swap.ts:115-128`)은 삭제 후 처음 반영된다 — 올바른 방향이지만 세액이 바뀔 수 있다. 고지를 붙일지는 V-1 결과와 함께 판단.

---

## 부록. 변경 이력
- v0.1 (2026-10-16) 초안 — probe P1~P8 실측, 결정 Q-1~Q-4, 미검증 V-1~V-5.
- v0.2 (2026-10-16) 결정 확정(권고대로) · Q-2 근거 정정(사이드바도 위치 번호 — 라벨이 갈리는 곳은 결과 화면) · Q-2 재번호는 가운데 삭제에도 적용(같은 갈림이 생긴다).
