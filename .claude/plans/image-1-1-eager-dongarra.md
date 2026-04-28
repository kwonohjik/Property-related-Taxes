# Plan: PHD 섹션 라벨/입력란 UI 수정

## Context

`HouseValuationSection.tsx`의 개별주택가격 미공시 환산(PHD) 섹션에서 4개 FieldCard의
라벨이 2~3줄로 감겨 있고 금액 입력란이 과도하게 넓습니다. 사용자 요청:
1. 라벨 텍스트 일부 수정 (P_T / P_F 괄호 제거, 양도시→양도 당시 등)
2. 금액 입력란을 현재보다 50% 축소
3. 라벨을 한 줄로 표시

## 대상 파일

`components/calc/transfer/inheritance/HouseValuationSection.tsx` (lines 288–338)

## 구현 전략

- **라벨 한 줄**: `FieldCard`의 `className` prop으로 grid 열 너비를 오버라이드.  
  (`cn()` 내부에서 `tailwind-merge` 사용 → 뒤에 오는 클래스가 기본값 `sm:grid-cols-[120px_1fr]`을 덮어씀)
- **입력란 50% 축소**: FieldCard 내부 `CurrencyInput`을 `<div className="w-1/2">` 래퍼로 감쌈.

## 변경 상세

| 항목 | 현재 라벨 | 변경 후 라벨 | grid-cols 오버라이드 |
|---|---|---|---|
| ① 양도시 주택가격 | `양도시 공시된 개별주택가격 (P_T)` | `양도 당시 공시된 개별주택 가격` | `sm:grid-cols-[220px_1fr]` |
| ② 양도시 건물기준시가 | `양도당시 건물기준시가` | (변경 없음) | `sm:grid-cols-[160px_1fr]` |
| ③ 최초고시 주택가격 | `최초 공시된 개별주택가격 (P_F)` | `최초 공시된 개별주택가격` | `sm:grid-cols-[185px_1fr]` |
| ④ 최초고시 건물기준시가 | `최초 공시 당시 건물기준시가` | (변경 없음) | `sm:grid-cols-[200px_1fr]` |

모든 항목에 CurrencyInput을 `<div className="w-1/2">` 로 감쌈.

## 검증

개발 서버 `npm run dev` 실행 후 양도세 → 상속 취득 경로에서 PHD 섹션 확인:
- 4개 FieldCard 라벨이 모두 한 줄로 표시되는지
- 금액 입력란이 이전 대비 약 절반 너비인지
