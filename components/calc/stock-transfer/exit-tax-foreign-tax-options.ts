/**
 * 국외전출세 §118의13② 외국납부세액 적용 배제 사유 선택지 — 전역 입력(`ExitTaxSettlementBlock`)과
 * 종목별 실제 양도(`ExitTaxActualTransferBlock`)가 함께 쓰는 단일 소스. 배제 사유는 두 방식 모두 최상위 필드 하나다.
 */
export const FOREIGN_TAX_EXCLUSION_OPTIONS = [
  {
    value: "none",
    label: "배제 사유 없음 (공제 적용)",
    description: "§118의13① — 외국 납부 세액을 산출세액에서 공제",
  },
  {
    value: "credit_allowed",
    label: "외국정부가 산출세액에서 공제 허용 (1호)",
    description: "§118의13②1호 — 외국정부가 거주자 시절 납세액에 대해 공제를 허용",
  },
  {
    value: "step_up",
    label: "외국정부가 취득가액을 출국일 시가로 조정 (2호)",
    description: "§118의13②2호 — step-up basis 적용: 외국에서 출국일 시가를 취득가액으로 인정",
  },
];
