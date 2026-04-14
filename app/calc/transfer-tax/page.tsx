import TransferTaxCalculator from "./TransferTaxCalculator";

export const metadata = {
  title: "양도소득세 계산기",
  description: "한국 부동산 양도소득세를 간편하게 계산하세요.",
};

export default function TransferTaxPage() {
  return <TransferTaxCalculator />;
}
