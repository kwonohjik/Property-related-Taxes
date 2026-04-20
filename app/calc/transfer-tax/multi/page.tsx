import MultiTransferTaxCalculator from "./MultiTransferTaxCalculator";

export const metadata = {
  title: "양도소득세 다건 동시 양도 계산 | 한국세금계산기",
  description: "같은 과세연도에 여러 자산을 동시에 양도하는 경우의 양도소득세를 계산합니다. 양도차손 통산, 기본공제 배분, 비교과세를 자동 적용합니다.",
};

export default function MultiTransferTaxPage() {
  return <MultiTransferTaxCalculator />;
}
