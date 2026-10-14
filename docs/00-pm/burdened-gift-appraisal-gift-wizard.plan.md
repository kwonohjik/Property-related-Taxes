# 부담부증여 취득가액 「매매사례가액·감정가액」 — 증여세 마법사 경로 (PR-4)

> 선행: #2196(엔진·양도세 화면, K-6/K-7) · #2199(신축 × 감정가액 §114조의2 가산세). 계획서 본문: `burdened-gift-appraisal-sales-case-acquisition.plan.md`.
> 엔진·Zod(`/api/calc/transfer`)는 두 경로가 공유하므로 **엔진 수정은 없다** — 이 PR은 증여세 마법사의 입력 칸·④·⑧만 다룬다.

## 1. 갭 (실측)

| 층 | 현행 | 근거 |
|---|---|---|
| 타입 | `acquisitionMethod?: "actual" \| "converted"` | `lib/tax-engine/types/inheritance-gift-estate.types.ts:1370` |
| ⑤ | 라디오 2옵션(실지 K-4·환산 K-5), 신축 위젯은 환산 박스 안에만 | `BurdenedGiftValuationModeSection.tsx` |
| ④ | `acquisitionMethod`·`actualAcquisitionTotal`만 싣는다. 신축 필드는 `converted`일 때만 | `lib/calc/gift-burdened-transfer-api.ts:213-300` |
| ⑧ | 「실지 또는 환산을 선택하세요」, 환산·상속 차단 | `components/calc/gift-tax-form-validate.ts:150-195` |
| 토글 OFF 경고 | `hasData`가 새 필드를 모른다 | `BurdenedGiftTransferSection.tsx:112` |

## 2. 결정 (양도세 화면 PR-1 선택과 같게 — 사용자가 이미 권고안을 택한 축)

| # | 결정 |
|---|---|
| D-1 | enum은 양도세 경로와 통일: `"actual" \| "salesCase" \| "appraisal" \| "converted"` |
| D-2 | 금액은 **한 칸** `presumedAcquisitionTotal`(증여 category에 `general_building`이 없다 — 토지·주택·건물 모두 한 값). ④가 토지면 `presumedLandAcquisitionPrice`, 아니면 `presumedAcquisitionTotal`로 싣는다(엔진이 건물 몫을 취득시 기준시가 비율로 나눈다) |
| D-3 | 상속 취득은 새 두 방식 **차단** — 양도세 경로와 같은 이유(§163⑨가 가목). ⑤ 비활성 + ⑧ 오류, 판정은 환산 차단과 같은 술어 `giftBurdenedInheritedConversionBlocked` 재사용 |
| D-4 | 신축·증축 위젯(§114조의2)은 **환산 또는 감정가액**일 때 표시. 감정가액 + 증축(85㎡ 초과) 5년 이내는 PR-3과 같은 이유로 ⑤·⑧이 차단 |
| D-5 | 새 방식에서는 자본적지출·양도비·실지취득가액을 보내지 않는다(개산공제만 — 엔진이 무시하지만 body에 stale이 실리지 않게) |

## 3. 검증 기준

- ④: 새 두 방식이 `burdenedGiftInfo.acquisitionMethod`·금액 필드로 도달, 감정가액 + 신축이 `isSelfBuilt` 등 body 최상위로 도달(매매사례는 안 실림)
- 엔진 통합: ④ body → `/api/calc/transfer` Zod 통과 → 문제 20 상황 1 양도차익 28,920,000, 신축 감정 가산세
- ⑧: 방식 미선택 문구, 금액 필수, 상속·증축 차단, 신축일 필수
- ⑤: 라디오 4옵션(**기존 정규식 strict mode** — 새 옵션 문구에 「환산취득가액」·「실지취득가액」 금지), 방식 전환 시 stale 초기화, 입력 칸
- E2E: 증여세 마법사에서 감정가액 선택 → 계산 → 부담부증여 양도세 카드

## 4. 미검증

- V-2(총액 기준시가 비율 분배의 법적 근거)는 양도세 경로와 같게 종속
- 사람이 브라우저로 한 수동 확인 없음(headless Playwright만)

## 5. 구현 결과 (2026-10-14)

- 타입 `acquisitionMethod`에 `salesCase`·`appraisal`, `presumedAcquisitionTotal` 신설 · 술어 leaf `lib/calc/gift-burdened-presumed-acquisition.ts`(양도세 쪽 라벨·종류 판별 재사용)
- ④ `gift-burdened-transfer-api.ts`: 토지는 `presumedLandAcquisitionPrice`, 그 밖은 `presumedAcquisitionTotal`. 새 방식은 stale 실비 0. 신축 필드는 환산 또는 감정가액에서만
- ⑧ `gift-tax-form-validate.ts`: 방식 안내 4종 · 금액 필수 · 상속 차단 · 감정가액 신축일 필수 · 증축 5년 이내 차단
- ⑤ `BurdenedGiftValuationModeSection.tsx`: 라디오 4옵션(testId `bg-acq-method-sales-case`·`-appraisal`) · 입력 칸 · 신축 위젯을 환산·감정 공용 `SelfBuiltPenaltyFields`로 추출 · 방식 전환 시 stale 초기화 · 증축부분 기준시가 칸은 환산 전용 · `transferDate`를 두 필드셋 경로로 전달
- 토글 OFF 경고(`hasData`)·초기 객체에 새 필드 반영
- 테스트: anchor 16(④ 6·통합 2·⑧ 7+1) · E2E PG-1~PG-4 · 뮤테이션 6종 모두 anchor가 잡음
- **손대지 않은 것**: 증여세 마법사의 결과 화면 — 부담부증여 양도세 카드는 엔진 `acquisitionMethodUsed`를 공용 라벨(#2196에서 `satisfies Record` 가드로 확장)로 읽는다

