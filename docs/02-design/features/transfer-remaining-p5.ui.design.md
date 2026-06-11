# P5 — §98 + 모드 2 N-way UI 설계

> 엔진 설계: `transfer-remaining-p5.engine.design.md`

## 1. §98 폼 — `Unsold98InputForm.tsx` (Step5 감면 패널)

① sky 취득 시기 — contractDate98 DateInput (선택 — 자산 취득일 fallback, hint: ① 1995.11.1~1997.12.31 / ③ 1998.3.1~12.31 2-트랙 자동 판정)
② rose 자격 — isNationalScale98(국민주택규모 이하)·isOutsideSeoul98(서울 밖)·isUnsoldConfirmed98(시장·군수·구청장 미분양 확인 — 1995.10.31/1998.2.28 현재)·isFirstBuyerNoOccupancy98(최초 분양 + 완공 후 타인 입주사실 없음)·rentedFor5Years98(5년 이상 보유·임대)
emerald 안내 — "세율 20% 단일 (§104① 불구 — 누진·단기·중과 대체). 장특공제는 일반 규칙. 농특세 없음. 종합소득 합산 방식(①2호)은 본 계산기 범위 외 — 종합소득세 신고 시 별도 검토. 중과 배제 (소령 §167의3①3호)"

## 2. 모드 2 — `SpecialHouseExclusionSection.tsx` (Step4 보유 상황, 주택 수 입력 직후)

ToggleCard(tone violet) "조특법 감면주택 보유 — 주택 수 제외 (§89①3호 의제)" → ON children:
- 행 배열 (추가/삭제): article Select(9개 조문 — 라벨에 취득기간 표기) + 감면주택 취득일 DateInput + 매매계약일 DateInput(선택) + requirementsConfirmed ToggleCard("해당 조문 요건 충족 확인 — 상세 판정은 그 주택 양도 시 모드 1 입력으로 검증")
- hint: "비과세(1세대1주택) 판정 주택 수에서만 제외 — 다주택 중과세율 주택 수는 불변"
- §99 선택 시 경고 hint: "다른 주택을 2007.12.31까지 양도하는 경우만 적용 (법 §99②)"

FormData: `specialHouseExclusions: { article; houseAcquisitionDate; houseContractDate; requirementsConfirmed }[]` (string 날짜) — 폼-전역 (자산 아님). 3-state 아님 — 빈 배열 = OFF.

## 3. 동기화 — 폼-전역 신규 필드 (priorReductionUsage 선례)

①② store FormData+initial ③ merge 방어 ④ `transfer-tax-api.ts` 변환 (⑬ body) ⑤ Step4 섹션+Step5 폼 ⑦ §98 카드(flat 20% 배지·종합소득 안내) + 모드 2 step 표시 ⑧ validate (행에 article·취득일 필수) ⑨⑫ `transfer-tax-schema.ts` 2곳(단건 421·컴패니언 659) ⑭ route.ts 2곳(202 단건·654 다건) Date 변환.

## 4. E2E — `transfer-p5.spec.ts` §98 폼 렌더 + Step4 모드 2 토글·행 추가
