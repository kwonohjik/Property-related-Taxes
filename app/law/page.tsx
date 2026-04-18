import Link from "next/link";
import { LawResearchClient } from "./_components/LawResearchClient";

export const metadata = {
  title: "법령 리서치 | 한국 부동산 세금 계산기",
  description: "부동산 세법 조문·판례·별표를 법제처 Open API로 통합 검색",
};

export default function LawPage() {
  const apiKeyConfigured = Boolean(process.env.KOREAN_LAW_OC);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">법령 리서치</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            부동산 세법 관련 법령·판례·별표·인용 검증을 한 화면에서.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 홈
        </Link>
      </div>

      {!apiKeyConfigured ? (
        <ApiKeyMissingNotice />
      ) : (
        <LawResearchClient />
      )}
    </main>
  );
}

function ApiKeyMissingNotice() {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-900/40 dark:bg-yellow-900/10">
      <h2 className="text-base font-semibold text-yellow-900 dark:text-yellow-200">
        법제처 Open API 키가 설정되지 않았습니다.
      </h2>
      <ol className="mt-3 ml-4 list-decimal space-y-1 text-sm text-yellow-900/80 dark:text-yellow-100/80">
        <li>
          <a
            href="https://open.law.go.kr"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            open.law.go.kr
          </a>
          에 접속하여 회원가입 후 Open API 신청 → 승인되면 OC(계정ID) 발급.
        </li>
        <li>
          프로젝트 루트 <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-900/40">.env.local</code> 에 다음 추가:
          <pre className="mt-2 rounded bg-yellow-100 px-3 py-2 text-xs dark:bg-yellow-900/40">KOREAN_LAW_OC=발급받은계정ID</pre>
        </li>
        <li>개발 서버 재시작 후 이 페이지로 돌아오세요.</li>
      </ol>
    </div>
  );
}
