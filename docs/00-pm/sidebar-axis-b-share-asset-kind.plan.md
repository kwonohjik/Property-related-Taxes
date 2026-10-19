# 축 B(같은 물건 지분 분할) 둘째 지분 — 사이드바·카드 요약이 저장값 «주택»을 읽는 문제 수정 계획서 v0.2

- 작성일: 2026-10-19 · 기준 커밋: master `cf89d97d8` · 워크트리 `-sidebarb` (브랜치 `fix/sidebar-axis-b-share-asset-kind`)
- 출처: 1주택 코드 리뷰 별건 ① 작업(#2256) 중 발견(V-2) — 세액 무관 표시 결함

## 1. 원인

축 B 둘째 카드는 화면이 `makeDefaultAsset(2)`로 만들어 저장된 `assetKind`가 기본값 `"housing"`이고 ① 기본정보가 숨겨진다.
엔진에 보낼 때는 ④가 첫 카드 값으로 덮는다 — `mergePrimaryBasic`(`lib/calc/transfer-tax-api-helpers.ts:140`, 자산 종류·면적·소재지·양도 형태·부담부증여·상가 하위필드·`isNonBusinessLand` 등) → `neutralizeCarryoverDonorSplitForCompanion`(`transfer-tax-api-bundled.ts:73`). ⑧도 같은 병합을 쓴다(`transfer-tax-validate.ts:405`).
카드 제목은 2026-08-10에 같은 결함을 이미 고쳤다(`CompanionAssetCard.tsx:162-172` — 첫 카드 종류로 표시). **원래 값을 그대로 읽는 곳이 두 군데 남았다.**

| 위치 | 읽는 값 |
|---|---|
| 사이드바 `computeTransferPerAssetSummary` 행 루프(`lib/stores/transfer-per-asset-summary.ts:307-309`) → `assetKind: a.assetKind`(`:637`) → 렌더 `TransferSidebarSummary.tsx:56` | 원래 값 |
| 카드 섹션 요약 `summarizeAssetSections(asset, …)`(`CompanionAssetCard.tsx:180-188`) → ③ 칩 라벨(`asset-section-summary.ts:114`) · ⑤ 노출(`:137-138` → `CompanionAssetCard.tsx:446`) | 원래 값 |

## 2. 실측

**사이드바 행 2 — 원래 값 vs 병합 값**(probe: 첫 카드 종류 7종 × 실가/환산, 계산 전 `result = null`):

| 첫 카드 | 갈리는 칸(현행 → 병합 기준) |
|---|---|
| 주택 | 없음(우연히 일치) |
| 토지 · 건물 | 종류 이름만 «주택» → 토지·건물 |
| 분양권(환산) | 필요경비 1,500,000 → 500,000 (개산공제율 3% → §163⑥4호 1%) |
| 입주권 | 취득가액 75,000,000 → 0 · 라벨 «취득가액» → «인가전 분 취득가액» · 환산이면 필요경비 1,500,000 → «계산 후 표시» |
| 일반건물 · 상가(환산) | 필요경비 1,500,000 → «계산 후 표시» |

계산 **후**에는 취득가액·필요경비가 엔진 결과(`bundledMatch` — `:438`·`:575`)라 값은 맞고 종류 이름만 틀린다.

**브라우저**(E2E probe, 계산 전): 첫 카드가 토지·분양권이어도 사이드바는 «자산 2 — 주택». 분양권은 자산 1 필요경비 500,000 · 자산 2 1,500,000.
둘째 카드 제목은 «단순토지»·«분양권»으로 맞지만, **⑤ 「기타 특례 — 장기임대 거주주택 특례」 섹션이 뜬다**. 펼치면 내용이 없다 — `AssetSectionExtras`(`:40` 둘째 카드는 §155⑳ 선언 불가 · `:62-84` 토지 블록은 원래 값 «주택»이라 미표시).

축 B 토글은 자산 종류 제한 없이 첫 카드에 뜬다(`AssetSectionAcquisition.tsx:122` `isFirst`만) — 위 조합은 모두 입력 가능하다.

## 3. 수정

| # | 지점 | 변경 |
|---|---|---|
| S1 | 사이드바 행 루프(`transfer-per-asset-summary.ts:309`) | 축 B(`axisBBundle`) · `i > 0`이면 `mergePrimaryBasic(rawAsset, primary)` 후 `neutralizeCarryoverDonorSplitForCompanion` — **④와 같은 함수·같은 순서**. 종류 이름·계산 전 미리보기가 엔진에 가는 값과 맞는다 |
| S2 (Q-1) | 카드 섹션 요약(`CompanionAssetCard.tsx:182`) | `summarizeAssetSections(acquisitionAsset, …)` — ③ 섹션이 이미 렌더하는 값(`:158-161`, 첫 카드 종류)과 같다. ③ 칩 라벨이 맞고, 토지·분양권 지분 카드에 빈 ⑤ 섹션이 뜨지 않는다 |

새 판정식·새 필드 없음. 세액 불변(엔진 입력은 이미 병합값).

## 4. 결정 요청

- **Q-1. S2(카드의 빈 ⑤ 섹션·③ 칩)를 이 PR에 넣을지** — 권장 **(a) 넣는다**: 원인이 같고(원래 값 읽기) 한 줄이다. (b) 사이드바만.
- **Q-2(범위 밖 확인 필요)**: 첫 카드가 **토지**일 때 둘째 지분 카드의 비사업용 토지 상세 판정·지정지역 질문(`AssetSectionExtras.tsx:62-84`)이 원래 값 «주택» 때문에 뜨지 않는다. 그 지분의 엔진 입력에 상세 판정 값이 어떻게 실리는지(④가 둘째 카드 자기 필드를 쓰는지)는 **확인하지 않았다** — 세액에 닿을 수 있어 이 PR(표시 전용)과 분리해 따로 실측한다.

## 5. 검증 계획

1. 단위: 사이드바 행 2의 `assetKind`·`acqLabel`·`acqPrice`·`expense`·`expensePending`이 병합 기준과 같다 — 첫 카드 종류 7종 × 실가/환산. 축 B 아닌 함께 양도(서로 다른 물건)는 원래 값 그대로(부정 짝).
2. RTL: 둘째 지분 카드 — 첫 카드 토지·분양권이면 ⑤ 섹션 없음, 주택이면 있음 · ③ 칩 라벨이 첫 카드 종류 기준.
3. E2E: 첫 카드 분양권 축 B — 사이드바 «자산 2 — 분양권» · 필요경비 500,000.
4. 뮤테이션: S1 병합 제거 · `i > 0` 게이트 제거 · 축 B 게이트 제거 · S2 원복.
5. `npm run check:pre-pr`.

## 6. 결정·구현 결과 (v0.2 — 2026-10-19)

- 사용자 결정: Q-1 **(a) S2 포함** · Q-2 **분리**(이 PR 뒤 따로 실측).
- S1 `transfer-per-asset-summary.ts` 행 루프 — `axisBBundle && i > 0 ? mergePrimaryBasic(rawAsset, primary) : rawAsset`을 중립화 앞에 둔다.
- S2 `CompanionAssetCard.tsx` — `summarizeAssetSections(acquisitionAsset, …)`. `acquisitionAsset`을 `useMemo`로 감쌌다(그대로 두면 매 렌더 새 객체라 요약 `useMemo` 의존성이 매번 바뀐다 — react-hooks 경고).
- 검증: 단위 `sidebar-axis-b-share-asset-kind.anchor.test.ts` 3건(AS-1은 같은 입력의 두 지분 행이 같다는 불변식 — 7종 × 실가/환산 14셀) · RTL `axis-b-share-card-section-summary.ui.anchor.test.tsx` 4건 · E2E `transfer-axis-b-share-sidebar-kind.spec.ts` 1건(master 코드에서 실패, 수정 후 통과).
- 뮤테이션 4종: 병합 제거 · 축 B 게이트 제거 · 카드 요약 원복 KILLED / `i > 0` 게이트 제거는 **동치**(첫 카드를 자기 자신과 병합 — `mergePrimaryBasic(p, p)`는 덮는 필드가 전부 자기 값) — ④와 같은 모양으로 남긴다.
