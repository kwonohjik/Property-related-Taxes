import { ProfileClient } from "./ProfileClient";

export const metadata = {
  title: "프로필 | KoreanTaxCalc",
};

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">프로필 설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이름과 생년월일을 저장하면 세금 계산에 활용됩니다.
        </p>
      </div>
      <ProfileClient />
    </div>
  );
}
