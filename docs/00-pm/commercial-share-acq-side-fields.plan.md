# 상가 축 B 지분 카드 — 취득 쪽 칸은 지분 값, 물건 단위 칸은 자산 1 값

- 출발: `bg-163-9-proviso-post-deemed.plan.md` §11 「남은 것」(상가 축 B 페이지 전체 cb 칸 3개 중복 표시 · 미조사).
- 기준 master `56e629a36`. 측정은 route POST(mock 세율) · Playwright(dev 서버). probe는 지웠다.
- 상태: **결정 완료 2026-11-16 — 사용자 「취득 쪽 지분 값 + 양도 쪽 숨김」**. 구현 · 검증 완료.

## 1. 실측

「중복 3칸」은 `cbTotalLandArea` · `cbTotalBuildingFootprintArea` · `cbZoneType`(부수토지 판정)이 자산 1 ③과 지분 카드 ③에 둘 다 뜨는 것이었다. 원인을 따라가 보니 같은 뿌리의 세액 결함 2건이 더 있었다.

원인: 2026-09-03 상가 축 B 개방(`553776de6`)이 상가 하위 칸 16개를 「물건 단위 값」으로 보고 `mergePrimaryBasic`에서 전부 자산 1 값으로 덮었다. 그 근거는 §101① 면적(배율 판정)이었고, 지분마다 취득일 · 취득원인이 다른 축 B에서 **취득 당시** 가격이 지분마다 다르다는 점은 다루지 않았다(비교: 부담부증여 취득시 기준시가는 「지분마다 자기 값」으로 일부러 병합하지 않는다 — `bg-axis-b-card-acquisition-sum.plan.md:11`).

| # | 상황(상가 · 축 B 지분 카드) | 종전 | 정답(오라클) |
|---|---|---|---|
| D1 🔴 | 상속 지분 2003 × §164⑥(§163⑨ 단서 2호) — 지분 카드 ③ §164⑥ 칸에 입력 | ⑧ 「누락: 최초고시 ㎡당 호별고시가 …」(방금 넣은 칸) — 4칸이 자산 1의 빈 값으로 덮인다. 자산 1(매매)에는 그 칸이 화면에 없어 ② 도달 불가 → 평가액만: 일반 양도 지분 360,000,000 · 부담부증여 144,000,000 | 196,363,637(0.4 × 490,909,091) · 78,545,455 |
| D3 🔴 | 매매 지분 2019 × 환산 — 지분 카드 「취득시 ㎡당 호별고시가」 3.0M | 무시 · 자산 1(2015) 값 2.0M으로 198,320,000 | 97,480,000(0.4 × 단건 243,700,000) |
| D2 🟡 | 양도시 가격 3칸 · 부수토지 판정 섹션(무허가 · 전체 대지 · 바닥면적 · 용도지역 · 지정지역)이 지분 카드에도 뜸 | 입력해도 자산 1 값을 씀(세액 무관) | — |

- 단건 오라클: §164⑥ 상속 2003 · 평가액 1억 · 8칸(509,090,909) · 시가 10억 → 490,909,091. 환산 2019 매매 · 취득시 단가 2.0M → 495,800,000 / 3.0M → 243,700,000.
- 취득시 개별공시지가(`cbLandPricePerSqmAtAcq`)는 종전에도 병합 대상이 아니었다.

## 2. 결정 · 구현

- 물건 단위 칸 단일 소스 `lib/calc/commercial-share-object-fields.ts`(`CB_SHARE_OBJECT_FIELDS` 10칸 — 면적 3 · 부수토지 3 · 무허가 · 양도시 가격 3). `mergePrimaryBasic`(④ · ⑧)은 이 10칸만 자산 1 값으로 덮는다.
- 취득 쪽 6칸은 지분 값: `cbUnitPriceAtFirstOrAcq` · `cbBuildingStdPriceAtAcq` · `cbBuildingStdPriceAtFirst` · `cbLandPricePerSqmAtFirst`(사용자 결정의 4칸) + §164⑧ 준용 `cbPrevStdPriceSum` · `cbStdPriceAdjustMonths`(취득당시 기준시가 산정 B · D — 같은 원칙으로 함께 · 지분 카드에 뜨는 칸이다). 비우면 ⑧이 지분 카드 칸을 짚는다 — 자산 1 값으로 대신하지 않는다.
- 지분 카드 ③ 표시 자산(`CompanionAssetCard` `acquisitionAsset`)에 물건 단위 10칸을 자산 1 값으로 준다 — 미리보기 · 연면적 표시가 계산과 같은 값을 쓴다.
- 지분 카드에서 숨김: `CommercialBuildingBlock` 양도시 3칸(`shareCard`) · `CommercialAppurtenantLandSection` 전체 → 「자산 1에서 입력한 값을 씁니다」 안내(`cb-share-object-fields-note` · `cb-share-appurtenant-note`).
- 세액이 바뀌는 경우: 지분 취득 쪽 칸이 자산 1과 다른 값일 때(정답으로). 같은 값이면 종전과 같다(CS-2 2.0M 198,320,000). 저장된 옛 지분 카드가 취득 쪽 칸을 비워 두고 자산 1 값에 기대던 경우는 이제 ⑧이 그 칸을 요구한다.

## 3. 검증

- route anchor `transfer.route.commercial-share-acq-side-fields.anchor.test.ts`(10 — 지분 칸 비움 ⑧ 포함 · 병합 변경을 되돌리면 실패).
- `transfer.route.bg-163-9-proviso-share-companion.anchor.test.ts` 상가 케이스를 화면 경로(취득 쪽 칸은 지분 카드)로 고쳤다 — #3406에서 값을 자산 1에 둔 시료는 화면에서 도달할 수 없는 경로였다.
- E2E `commercial-share-acq-side-fields.spec.ts` CS-E1 · CS-E2(수정 전 코드에서 둘 다 실패) · 상가 관련 E2E 20스펙 98/98.
- 회귀: api 상가 × 축 B 23파일 + calc · components · lib 1,990파일 23,179건 통과 · typecheck 0 · lint 0.

## 4. 남은 것

- 지분 카드의 「국세청 고시분 자동조회」(`CommercialStdPriceLookupModal`)는 양도시 단가 · 면적도 그 카드에 채운다 — 쓰이지 않는 값이 지분 카드 store에 남는다(세액 무관 · 미수정).
