# 공유 지분(축 A) 승계 조합원입주권 담보·임대 승 (X-2)

> 상위: [bg-successor-rtmi-extend-measure.md](bg-successor-rtmi-extend-measure.md) §4 X-2 · [bg-successor-rtmi-bundle-gate.plan.md](bg-successor-rtmi-bundle-gate.plan.md)(X-1) · [bg-successor-rtmi-std-acq.plan.md](bg-successor-rtmi-std-acq.plan.md)(I-1).
> 사용자 지시: 「x-2」(2026-11-01). 법문이 명확하고 측정이 끝나 질의 불필요.

## 1. 증상 (실측 A1·A2·A2n·A4)
- 기준시가 모드 담보·임대 승 + 지분 < 1: ⑧ 통과 ∧ ⑫ **400** 막다른 길 — 취득가액이 입주권 기준시가인데 ⑤ 칸·⑧ 요구가 없다(`bgSuccessorRightStdForced`가 지분 < 1이면 `false`).
- 시가 모드 담보 승 + 지분 < 1: ⑧ 차단(엔진 값은 맞음). 열거 이전 실지도 같은 차단.

## 2. 변경
| 지점 | 내용 |
|---|---|
| 술어 `bgSuccessorRightStdForced`(`bg-rtmi-std-acq.ts`) | 지분 < 1 조건 제거. 축은 인자로 구분 — 축 A `false`는 지분분 승자로 판정, 축 B `true`는 꺼짐(X-3), 축 미지정 `undefined`는 승자 미확정이라 꺼짐(fail-closed) |
| ⑧ 기준시가 모드 승자 판정(`transfer-tax-validate-bg.ts` (5-c″)) | `bgWholeGiftValuation(asset)` → `(asset, false)` — 지분 자산도 승자를 정해 원조합원 열거 이후를 ⑧이 막는다(종전 ⑧ 통과 ∧ ⑫ 400) |
| ⑧ 시가 모드 지분 차단(같은 파일 「주택만」 사유) | `bgRtmiShareWinnerComputable`(승계 ∧ 지분 < 1 ∧ 양도일 있음)이면 면제 |
| 승계 검증(`transfer-tax-validate-successor-right.ts`) | 축 인자 추가 — 승계취득가액·추가분담금 면제가 지분에서도 같은 술어를 쓴다 |
| ⑤ `SuccessorRightAcquisitionBlock` | `isFractionalSplit` prop(`AssetSectionAcquisition`이 `splitMode === "fractional"` 전달) → 기준시가 2칸 노출 |
| 묶음 게이트(X-1 `bgRtmiBundleWinnerComputable`) | 지분 < 1이면 `bgRtmiShareWinnerComputable` 위임(승계만) |
| 문구 `BG_RTMI_SUCCESSOR_SINGLE_ONLY_CAUSE` | «지분 100%이거나 공유 지분인 경우만 … 같은 물건을 지분으로 나눠 취득한(지분 분할 취득) 경우는 확인하지 못했습니다» |
- ⑫(Zod)는 변경 없음 — `successorRtmiMarketCollateralForcesStd`가 이미 `ownershipRatio`를 받아 지분분으로 판정한다(측정 A1b).
- 엔진 변경 없음. 14지점 중 ⑤(prop)·⑧만.

## 3. 오라클·검증
취득가액 = 입주권 기준시가(물건 전체 입력) × 지분 × 채무비율, 개산공제 1%. 지분 50% · 본인분 담보 15억:
- 담보: 15억 − 3억×0.5 = 1.5억 − 150만 = **1,348,500,000** (시가·기준시가 모드 같다)
- 임대(본인분 보증금 15억 + 연 6천만 → 환산 20억 · 비율 0.75): 15억 − 3억×0.5×0.75 = 1.125억 − 112.5만 = **1,386,375,000**
- 열거 이전 담보(실지 4억×0.5): **1,300,000,000** · 보충 승 **220,000,000**(불변)
- 묶음: 주택 100% + 승계 지분 = 2,485,000,000 + 1,348,500,000 = **3,833,500,000** · 주택 50% + 승계 지분 = 1,242,500,000 + 1,348,500,000 = **2,591,000,000**

| 항목 | 결과 |
|---|---|
| anchor `bg-successor-rtmi-axis-a-share` XA-1~XA-5 | 19건 통과 |
| 뮤테이션 6종 | 전부 적색(10·6·1·1·4·2건), 원본 복원 `diff -q` 일치 |
| E2E `bg-successor-rtmi-axis-a-share` XE-1~XE-4 | 4건 통과 — ⑥ 사이드바 «양도가액 지분 50% 1,500,000,000 / 취득가액 150,000,000 / 필요경비 1,500,000», ⑦ 1,348,500,000. 술어 뮤테이션에서 적색 |
| 기존 anchor 정정 | I-1 SR-5 지분 셀 → 축 B 차단 셀로 교체 · X-1 BG-2·BG-5 → 원조합원 지분 묶음 차단·진리표 정정 |
| 회귀 | §5 |

## 4. 하지 않은 것 · 확인 필요
- **원조합원 공유 지분은 열지 않는다.** ⚠️ 2026-11-02 정정: 아래 「입력 규약 불명」은 오판이었다(규약은 2026-09-03 확정 — 본인 지분 해당분 입력). 열거 이전은 [bg-orig-rtmi-preera-share-open.plan.md](bg-orig-rtmi-preera-share-open.plan.md)가 열었다. 열거 이후는 H-2 대기. 열거 이전도 막았다 — 실측 D3: 청산금 납부 2억을 넣으면 지분 50%에서 양도차익 1,150,000,000, 청산금 0이면 1,350,000,000이라 **청산금이 지분만큼 줄지 않고 전액 차감된다**(실지취득가액 3억은 ×0.5). 청산금 칸이 물건 전체인지 본인 지분분인지 입력 규약이 불명이다. 단건(지분 100%)은 영향이 없다. 별건 후보.
- **축 B(같은 물건 지분 분할)는 X-3.** 기준시가 모드 축 B는 ⑧ 통과인데 카드 2의 기준시가 칸이 없어 ⑫ 400인 막다른 길이 남아 있다(실측 B2, X-3 대상).
- 열거 이전 승계 입주권 실지취득가액을 비우면 ⑫가 막지 않는 틈(X-1 계획서 §3)은 그대로다 — 별건.
- 지분 입주권의 이월과세·의제취득일 전·겸용 교차, 지분 2건 이상 묶음은 측정하지 않았다.

## 5. 회귀
| 범위 | 결과 |
|---|---|
| `npm run test:transfer` | 1611 파일 · 20,567 통과 (3 skipped · 10 todo) |
| `__tests__/calc/` + `__tests__/components/` | 1461 파일 · 17,291 통과 (299 todo) |
| 신규 anchor 19 · 신규 E2E 4 · 뮤테이션 6(+E2E 1) 사망 | §3 |
