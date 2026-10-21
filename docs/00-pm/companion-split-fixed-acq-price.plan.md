# 함께 양도 두 번째 자산 — 매매 분리취득이면 ⑫가 화면에 없는 자산 전체 취득가액을 요구해 400 — 수정 계획

> 작성 2026-10-21 · 상태 **Do — Q-1 권고안 a 결정(2026-10-21)** · 워크트리 `../Property-related-Taxes-cfap` · 브랜치 `docs/companion-split-fixed-acq-plan`
> 기준 master `f204df8f2`. 줄 번호는 모두 이 커밋 기준이다.
> 출처: `split-v7-era-and-legacy-expense.plan.md` §6.4(범위 밖 발견, PR #2370 작업 중).
> 실측 probe(`__tests__/calc/_probe-cfap*.test.ts*`)는 커밋하지 않았다.

---

## 0. 요약

| | 내용 |
|---|---|
| 증상 | 함께 양도 2번째 이후 자산이 **매매 + 토지·건물 별개 취득**(취득일 분리)이면 ⑧은 통과하는데 계산 요청이 400 `companionAssets.N.fixedAcquisitionPrice` 「매매(실가) 시 취득가액 필수」 |
| 원인 | ⑫ 컴패니언 매매 갈래(`lib/api/transfer-tax-schema-companion-refines.ts:73~104`)가 분리 계산 여부를 보지 않고 자산 전체 취득가액을 요구한다. 별개 취득 화면에는 그 칸이 없다 |
| 범위 | 매매 호스트의 별개 취득 전부 — 일반·토지 증여(D1)·파트 환산·파트 감정. 양도일·기준시가와 무관 |
| 세액 | ⑫만 통과시키면 엔진은 파트 가액으로 계산한다 — 그 값을 1원·5.5억·9.99억 중 무엇으로 넣어도, 아예 안 넣어도 결정세액이 같다 |
| 권고 | ⑫ 매매 갈래에서 별개 취득(`isSeparateAcquisition === true`)을 면제 — 증여 갈래의 D2 면제(`:115`)와 같은 형태 |

---

## 1. 실측

### 1.1 재현 — 실제 `CompanionAssetCard` 렌더 + 폼 → ④ body → 실제 route

첫 자산은 단순 매매 주택(2010 취득 3억, 양도 4억). 두 번째 자산이 아래 형태. 양도일 2025-06-30, 구분 기재(토지 12억·건물 3억), 양도시 기준시가 9억/6억, 토지 2003-06-01 · 건물 2015-06-01.

| 셀 | 화면 칸(자산 전체 / 토지 / 건물) | ⑧ | ④ `fixedAcquisitionPrice` | ⑫ | 같은 자산을 첫 자산 위치에 두면 |
|---|---|---|---|---|---|
| H1 매매 별개 취득(실가·실가) | 없음 / 있음 / 있음 | 통과 | 없음 | **400** | 200 |
| H2 매매 + 토지 증여(D1) | 없음 / 있음 / 있음 | (`landHouseExisted` 별건 질문) | 없음 | **400** | 200 |
| H6 매매 별개 취득 · 토지 환산 | 없음 / 없음 / 있음 | 통과 | 없음 | **400** | 200 |
| H7 매매 별개 취득 · 건물 감정 | 없음 / 있음 / 있음 | 통과 | 없음 | **400** | 200 |
| H3 매매 소유자 분리(같은 날, 건물만) — 총액 입력 | **있음** / 없음 / 없음 | 통과 | 5.5억 | 200 | 200 |
| H3b 위 셀에서 총액 비움 | **있음** | 차단 `fixedAcquisitionPrice` | 없음 | 400 같은 칸 | — |
| H4 건물 상속 + 토지 매매(D2) | 없음 / 있음 / 있음 | 통과 | 없음 | 200 | 200 |
| H5 신축 + 토지 상속 | 신축비용 칸 | 통과 | 신축비용 | 200 | 200 |

- 같은 날 소유자 분리(H3)는 자산 전체 칸이 화면에 있고 ⑧도 요구한다 — 정합(H3b ⑧ 차단 ⇔ ⑫ 400).
- D2(H4)는 증여·상속 갈래가 이미 면제한다(`isBuildingCauseMixCompanion` — `:115` · `:188~190`).
- 주 자산 ⑫에는 자산 전체 취득가액 필수 규칙이 없다(일반건물 경로 `transfer-tax-schema-required-refines-gb.ts:182` 제외).
- 매매 실가 필수 규칙은 2026-04-23 `0e6dbdaf7`에 들어왔고, 컴패니언 분리취득 지원 뒤에도 매매 갈래에는 면제가 붙지 않았다(`git log -S`).

### 1.2 ⑫만 통과시키면 — 값 주입 실측

400 셀의 body에 `companionAssets[0].fixedAcquisitionPrice`를 넣어 route에 직접 보냈다.

| 셀 | 1원 | 5.5억 | 9.99억 |
|---|---|---|---|
| H1 | 286,410,000 | 286,410,000 | 286,410,000 |
| H2 | 286,410,000 | 286,410,000 | 286,410,000 |
| H6 | 374,579,718 | 374,579,718 | 374,579,718 |
| H7 | 281,034,000 | 281,034,000 | 281,034,000 |

(묶음 결정세액 `aggregated.determinedTax`)

- 값에 따라 달라지는 응답 필드는 `apportionment.apportioned[N].allocatedAcquisitionPrice` **하나뿐**이다(1원 vs 5.5억 전체 응답 diff).
  - 이 값은 컴패니언 엔진 입력 `acquisitionPrice`로 가지만(`app/api/calc/transfer/bundled-split-helpers.ts:365`) 분리 계산은 파트 가액을 쓴다.
  - 주택 분리 자산의 화면 표시에는 쓰이지 않는다. 결과 카드의 표시는 일반건물 전용이다(`components/calc/results/BundledAllocationCard.tsx:296~309`). 사이드바는 분리 자산이면 엔진 echo로 덮는다(`lib/stores/transfer-per-asset-summary.ts:442~450`).

### 1.3 면제 임시 적용 — 백업 → 수정 → 측정 → 원복(`cmp` 확인)

매매 갈래 조건을 `c.isSeparateAcquisition !== true && (!c.fixedAcquisitionPrice || …)`로 바꿨다.

| 셀 | ⑫ | 결정세액 |
|---|---|---|
| H1 · H2 | 200 | 286,410,000(§1.2와 같음) |
| H6 | 200 | 374,579,718 |
| H7 | 200 | 281,034,000 |
| H3 · H4 · H5 | 그대로 200 | 그대로 |
| H3b(소유자 분리, 총액 비움) | 그대로 400 | — |
| H1x 별개 취득 · 건물 취득가액 비움 | 400 `buildingAcquisitionPrice`(⑧도 같은 칸) — 종전에 함께 나던 `fixedAcquisitionPrice` 오류만 사라진다 | — |

- 파트 완결은 기존 V1·V2(`lib/api/transfer-tax-schema-required-refines-2a.ts:361~373` — 컴패니언도 `transfer-tax-schema.ts:180`에서 부른다)가 그대로 지킨다.
- `isSeparateAcquisition`은 컴패니언 스키마가 받는다(`lib/api/transfer-tax-schema-split.ts:66~67` → `transfer-tax-schema-companion.ts:72`). ④는 두 날짜가 다를 때만 true를 보낸다.

### 1.4 숨은 총액 잔재 — 지금도 통과하는 경로

일반 입력으로 총액(9억)을 넣은 뒤 별개 취득으로 바꾸면 칸은 사라지지만 값이 남는다(H1y). 이 경우 ④가 그 값을 보내 지금도 200이고, 결정세액은 잔재가 없을 때와 같다(286,410,000).
- **결함은 처음부터 별개 취득으로 입력한 사용자에게만 보인다.**
- 숨은 총액을 보내는 것은 주 자산 ④도 같다(`lib/calc/transfer-tax-api.ts:303~319` — 재개발·승계 외에는 `fixedAcquisitionPrice`). 세액에 쓰이지 않고 비대칭도 아니라 이번 범위에서 손대지 않는다.

---

## 2. 수정안 (Q-1)

| | 내용 | 비고 |
|---|---|---|
| **a (권고)** | ⑫ 매매 갈래: 별개 취득(`isSeparateAcquisition === true`)이면 자산 전체 취득가액을 요구하지 않는다 | 증여 갈래 D2 면제와 같은 형태 · 주 자산 ⑫와 같은 결과 · 파트 완결은 V1·V2 · 세액 불변(§1.3) |
| b | ④가 파트 가액 합을 `fixedAcquisitionPrice`로 실어 보낸다 | 환산·감정 파트(H6·H7)는 합이 취득가액이 아니다 — 화면에 없는 합성값(자동 fallback 금지 원칙과 충돌) |
| c | ⑧이 자산 전체 취득가액을 요구한다 | 칸이 화면에 없어 막다른 길 |

---

## 3. Do (Q-1 결정 후)

1. ⑫ `transfer-tax-schema-companion-refines.ts:97~104` 매매 실가 갈래에 별개 취득 면제 + 근거 주석(형제 경로 `:115` · V1·V2).
2. 격자 `__tests__/calc/companion-split-fixed-acq-parity.test.ts`(신규) — 컴패니언 위치 × {H1, H2, H6, H7, H3, H3b, H4, H5, H1x(파트 비움 ⇔ 같은 칸), H1y(잔재)}.
   - 불변식: ⑧ 통과 ⇒ ⑫ 200, ⑧ 차단 ⇔ ⑫ 400.
   - 세액은 같은 자산의 잔재 주입 값과 같다.
   - 매매 일반(분리 아님) 컴패니언의 총액 필수는 그대로다(짝).
3. 뮤테이션: 면제 조건 제거 · 조건을 `isSeparateAcquisition` 대신 `landAcquisitionDate`로 넓히기(소유자 분리 H3b가 잡아야 한다).
4. E2E: 첫 자산 + 매매 별개 취득 두 번째 자산 시드 → 계산 성공 · 요청에 자산 전체 취득가액 없음.
5. `split-sale-std-era-parity.test.ts`(PR #2370)의 「일반 분리취득」 함께 양도 셀(`companion: false`)을 켠다 — #2370 머지 후 이 브랜치에 들어오면.
6. 게이트(워크트리라 수동): 폰트·톤·다크 짝·워크플로 러너 · typecheck · lint · `select-test-scope.sh --stdin` 범위.

## 4. 확인 필요

- 결과 화면(주택 분리 컴패니언)에 `allocatedAcquisitionPrice`가 0으로 그려지는 곳이 있는지 — §1.2의 grep 범위(`components/`·`lib/stores/`) 밖은 미확인. Do에서 결과 화면 렌더로 확인한다.
- H2의 ⑧ `landHouseExisted`는 토지 증여 D1의 정상 질문(1990.8.30.~2005.4.29. 증여 부수토지)이며 이 결함과 무관하다 — 픽스처에 답을 채워 격자에 넣는다.
