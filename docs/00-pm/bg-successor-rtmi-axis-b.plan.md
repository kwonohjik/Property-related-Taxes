# 같은 물건 지분 분할 취득(축 B) 승계 조합원입주권 담보·임대 승 (X-3)

> 상위: [bg-successor-rtmi-extend-measure.md](bg-successor-rtmi-extend-measure.md) §4 X-3(B1~B5) · [bg-successor-rtmi-axis-a-share.plan.md](bg-successor-rtmi-axis-a-share.plan.md)(X-2) · [bg-successor-rtmi-bundle-gate.plan.md](bg-successor-rtmi-bundle-gate.plan.md)(X-1).
> 사용자 지시: 「X-3 진행해」(2026-11-01). 법문이 명확하고 측정이 끝나 질의 불필요. 이 PR로 **승계 입주권은 전 경로(단건·묶음·공유 지분·지분 분할)가 열린다.**

## 1. 증상 (실측 B1·B1d·B2·B4)
- 시가 모드 담보 승: ⑧ 차단 «지분 분할 취득은 주택만». 엔진 값은 맞다.
- 기준시가 모드 담보·임대 승: ⑧ 통과 ∧ ⑫ 400 — 둘째 카드에 «취득일 기준시가» 칸이 없는 막다른 길(`bgSuccessorRightStdForced`가 축 B면 `false`).
- 비주 카드는 ② 양도정보(채무·시가·평가 방식)를 숨기므로 카드 자체 저장값으로는 ⑤가 승자를 모른다.

## 2. 변경
| 지점 | 내용 |
|---|---|
| 술어 `bgSuccessorRightStdForced`(`bg-rtmi-std-acq.ts`) | 축 B(`true`) 제외 조건 제거. 호출자가 첫 카드 부담부증여 값을 병합한 자산을 넘긴다 |
| ⑧ 시가 모드 축 B 차단(`transfer-tax-validate-bg.ts` 「주택만」) | `bgRtmiAxisBWinnerComputable`(승계 카드)이면 면제. 원조합원 카드는 계속 막는다 |
| ⑧ 카드 병합 | 기존 `axisBEffectiveAsset`(카드마다 첫 카드 병합) 그대로 — 둘째 카드도 (5-c‴)이 자기 기준시가를 요구한다 |
| ⑤ `CompanionAssetCard`(`acquisitionAsset`) | `bgRtmiShareJudgmentFields(asset, primary)` 주입 — 승계 입주권 카드에 첫 카드 병합값 중 `transferType`·`bg*`만 준다(`bgPreDeemedShareJudgmentFields`와 같은 방식, ③이 편집하는 `successorRight*`는 덮지 않음). 요약(필요경비 «개산공제만»)도 같은 값을 쓴다 |
| 문구 | 쓰이지 않게 된 `BG_RTMI_SUCCESSOR_SINGLE_ONLY_CAUSE` 삭제(내가 만든 고아). 승계 입주권은 양도일 없이는 열거 시기를 몰라 막히는 사유만 `BG_RTMI_SUCCESSOR_DATE_CAUSE`로 남긴다 |
- ⑫(Zod)·엔진 무변경 — B1d 등에서 ⑫ 200으로 확인(`successorRtmiMarketCollateralForcesStd`가 지분분으로 판정).
- 14지점 중 ⑤(주입)·⑧만.

## 3. 오라클·검증
취득가액 = Σ 지분 × 카드 기준시가(물건 전체 입력) × 채무비율, 개산공제 1%. 60/40 · 담보 30억:
- 카드 1 3억·카드 2 2억: 30억 − (0.6×3억+0.4×2억=2.6억) − 260만 = **2,737,400,000** (시가·기준시가 모드 같다)
- 3억/3억: **2,697,000,000** (단건과 같다) · 임대(비율 0.75): 30억 − 1.95억 − 195만 = **2,803,050,000** · 열거 이전(실지 4억씩) **2,600,000,000** · 보충 **440,000,000**

| 항목 | 결과 |
|---|---|
| anchor `bg-successor-rtmi-axis-b` XB-1~XB-4 | 17건 통과 (격자 6 · ⑧⊇⑫ 입력 요구 정합 5 · 원조합원 차단 3 · 술어·주입 4) |
| 뮤테이션 5종 | 전부 적색(9·7·2·2·1건), 원본 복원 `diff -q` 일치 |
| E2E `bg-successor-rtmi-axis-b` XBE-1~XBE-3 | 3건 통과 — 두 카드 모두 기준시가 2칸, ⑦ 2,737,400,000, ⑥ 사이드바 «지분 60% 1,800,000,000 / 취득가액 180,000,000 / 필요경비 1,800,000» · «지분 40% 1,200,000,000 / 80,000,000 / 800,000» · 합계 3,000,000,000. 주입 제거 뮤테이션에서 XBE-1 적색 |
| 기존 anchor 정정 | I-1 SR-5·X-2 XA-3의 «축 B 차단» 셀 삭제(XB-1로 대체), XA-5 진리표 축 B `true` 단언 삭제 |
| 회귀 | §5 |

## 4. 하지 않은 것 · 확인 필요
- **원조합원 카드는 열지 않는다.** 열거 이후는 H-2 대기. 열거 이전도 막았다(XB-3b) — 청산금 규약 불명(X-2 계획서 §4).
- 열거 이전 승계 카드의 실지취득가액을 비우면 ⑧은 막지만 ⑫는 200이다(실측 B4b: 카드 2 비움 → 2,760,000,000, 해당 카드 취득가액 0). 화면으로는 도달하지 못하고 직접 호출만 해당 — X-1 계획서 §3과 같은 별건.
- 지분 입주권의 이월과세·의제취득일 전·겸용 교차, 지분 분할 + 일반건물/주택 혼합 묶음은 측정하지 않았다.
- 사이드바 축 B: 이 경로에서는 null이 아니라 카드별 값이 나왔다(위 E2E). 다른 경로(비-입주권)의 «사이드바 축 B null» 별건은 이 PR 범위 밖이다.

## 5. 회귀
| 범위 | 결과 |
|---|---|
| `npm run test:transfer` | 1615 파일 · 20,655 통과 (3 skipped · 10 todo) |
| `__tests__/calc/` + `__tests__/components/` | 1463 파일 · 17,347 통과 (299 todo) |
| 신규 anchor 17 · 신규 E2E 3 · 뮤테이션 5(+E2E 1) 사망 | §3 |
