# TODO — 비상장 간편평가(V1) 입력 폼 리스타일

계획: `docs/00-pm/inheritance-unlisted-stock-simple-input-redesign.plan.md`
원칙: 엔진/산식/결과 변경 0건 — UI(⑤)만.

- [x] R1. IntegerInput 공용 컴포넌트 신규 (주식 수 콤마·정수)
- [x] R2. UnlistedStockSimpleFields 리스타일 — 외곽 indigo + ①sky ②emerald ③violet 섹션 카드 + FieldCard
- [x] R3. NetIncomeYearRow FieldCard 기반 전환 (단위 중복 방지)
- [x] R4. UnlistedStockPreview 보존 (내부 무변경) 확인
- [x] R5. 800줄 측정 (초과 시 분리)
- [x] R6. tsc 0 + lint 0
- [x] R7. 기존 e2e 2건(deficit·goodwill) selector 정정 + 통과
- [x] R8. 신규 e2e R-1~R-6 (섹션 카드·번호·raw input 0건·미리보기 보존)
- [x] R9. 전체 npm test 회귀 0
- [x] R10. 커밋 & 푸시 (TODO.md 제외)
