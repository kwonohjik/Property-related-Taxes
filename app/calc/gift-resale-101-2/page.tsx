import GiftResaleClient from "./GiftResaleClient";

export const metadata = {
  title: "증여 후 우회양도 판정 — 소득세법 §101②",
  description:
    "특수관계인에게 증여한 자산을 수증자가 10년 이내 양도한 경우, 증여자가 직접 양도한 것으로 보는지 판정 (소득세법 §101②)",
};

export default function GiftResalePage() {
  return <GiftResaleClient />;
}
