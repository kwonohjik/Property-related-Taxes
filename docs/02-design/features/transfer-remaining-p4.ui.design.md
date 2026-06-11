# P4 — §98의2 + §98의4 UI 설계

> 엔진 설계: `transfer-remaining-p4.engine.design.md` · P2·P3 폼 패턴 준수

## 1. 폼 2건

### `Unsold982InputForm.tsx`
① sky 취득·계약 시기 — contractDate982 DateInput (hint: 취득 2008.11.3~2010.12.31, 자산 취득일이 기간 내면 계약일 생략 가능 — 계약일은 2010.12.31까지 계약+계약금 케이스용)
② rose 자격 — isNonCapitalUnsold982(수도권 밖 미분양 — 령①)·isFirstOrFcfsContract982(선착순 공급 또는 사업주체 최초 매매계약)
emerald 안내 — "감면세액이 아닌 특칙: 장기보유특별공제는 표2 보유기간별 공제율(연 4%, 최대 40%)·세율은 기본 누진세율 적용. 농어촌특별세 없음. 중과 배제 (소령 §167의3①5호)"

### `Unsold984InputForm.tsx`
① rose 주체 — isNonResidentNoPe984 토글 (국내사업장 없는 비거주자 — 미확인 시 적용 불가, 거주자는 §98의3 검토 안내)
② sky 시기 — contractDate984 DateInput (취득 2009.3.16~2010.2.11, 자산 취득일 fallback)
③ rose 대상 — isNotUnsold983House984 (§98의3 미분양주택이 아닌 일반주택 확인)
emerald 안내 — "양도소득세 10% 세액감면 (5년 구분 없음) + 농특세 20%. 다주택 중과 배제 대상이 아닙니다 (소령 §167의3①5호 비열거)"

## 2. 결과 카드 — IncomeDeductionDetailCard kind 2종 추가

- `unsold_98_2`: effectCategory lthd_rate_special — 합계 행 대신 "특칙 적용: 장기보유특별공제 표2 보유기간별 공제율 + 기본세율 (감면세액 없음)" 안내. 중과 배제 각주 유지.
- `unsold_98_4`: tax_amount 모드 (rate 10%) — 기존 분기 재사용. 중과 배제 각주 **제거** (비열거) — 각주를 kind 조건부로.

## 3. 동기화 — P3과 동일 메커니즘 (① union 2 ② defaults ③ factory ④ api ⑤ 폼·패널 ⑦ 카드 ⑧ validate(토글 낙관 — 차단 없음) ⑫ Zod ⑭ mapper)

## 4. E2E — `transfer-p4.spec.ts` 미분양 그룹 2개 라디오 폼 렌더
