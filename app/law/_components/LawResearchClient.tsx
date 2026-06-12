"use client";

import { useState } from "react";
import { SimpleTabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/simple-tabs";
import { LawSearchTab } from "./LawSearchTab";
import { DecisionSearchTab } from "./DecisionSearchTab";
import { AnnexTab } from "./AnnexTab";
import { ChainResearchTab } from "./ChainResearchTab";
import { VerifyCitationsTab } from "./VerifyCitationsTab";
import { UnifiedSearchBar } from "./UnifiedSearchBar";
import { ArticleModal } from "./ArticleModal";
import type { ChainType, DecisionDomain, RouteResult } from "@/lib/korean-law/types";

export function LawResearchClient() {
  const [activeTab, setActiveTab] = useState<string>("law");
  const [routeNonce, setRouteNonce] = useState(0);
  const [routed, setRouted] = useState<RouteResult | null>(null);
  const [articleModal, setArticleModal] = useState<{ lawName: string; articleNo: string } | null>(
    null,
  );

  function handleRoute(route: RouteResult) {
    setRouted(route);
    setActiveTab(route.targetTab ?? "law");
    setRouteNonce((n) => n + 1);
    // 특정 조문 조회 라우팅 → 본문을 팝업으로 즉시 표시 (탭 하단 인라인 대신).
    if (route.tool === "get_law_text" && route.params.lawName && route.params.articleNo) {
      setArticleModal({
        lawName: String(route.params.lawName),
        articleNo: String(route.params.articleNo),
      });
    }
  }

  // 팝업으로 조문을 띄우는 경로에서는 법령·조문 탭의 인라인 자동조회를 억제(이중 fetch 방지).
  const openingArticlePopup = routed?.tool === "get_law_text";

  const initialLawQuery = extractQueryParam(routed, "q") ?? extractQueryParam(routed, "lawName");
  const initialArticleNo = extractQueryParam(routed, "articleNo");
  const initialDecisionQuery = extractQueryParam(routed, "q");
  const initialDecisionDomain = extractQueryParam(routed, "domain") as DecisionDomain | undefined;
  const initialChainQuery = extractQueryParam(routed, "query") ?? extractQueryParam(routed, "q");
  const initialChainType = routed?.chainType as ChainType | undefined;

  return (
    <div className="space-y-4">
      <UnifiedSearchBar onRoute={handleRoute} />

      <SimpleTabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="law">법령·조문</TabsTrigger>
          <TabsTrigger value="decision">판례·결정례</TabsTrigger>
          <TabsTrigger value="annex">별표·서식</TabsTrigger>
          <TabsTrigger value="chain">리서치 체인</TabsTrigger>
          <TabsTrigger value="verify">인용 검증</TabsTrigger>
        </TabsList>

        {/* 주요 탭은 keepMounted — 탭 이동 후에도 방금 조회한 조문/검색결과를 보존한다. */}
        <TabsContent value="law" keepMounted>
          <LawSearchTab
            initialQuery={initialLawQuery}
            initialArticleNo={initialArticleNo}
            autoSearch={routed?.targetTab === "law" ? routeNonce : 0}
            inlineArticleAutoLoad={!openingArticlePopup}
          />
        </TabsContent>
        <TabsContent value="decision" keepMounted>
          <DecisionSearchTab
            initialQuery={initialDecisionQuery}
            initialDomain={initialDecisionDomain}
            autoSearch={routed?.targetTab === "decision" ? routeNonce : 0}
          />
        </TabsContent>
        <TabsContent value="annex">
          <AnnexTab />
        </TabsContent>
        <TabsContent value="chain">
          <ChainResearchTab
            initialQuery={initialChainQuery}
            initialType={initialChainType}
            autoRun={routed?.targetTab === "chain" ? routeNonce : 0}
          />
        </TabsContent>
        <TabsContent value="verify" keepMounted>
          <VerifyCitationsTab />
        </TabsContent>
      </SimpleTabs>

      {articleModal && (
        <ArticleModal
          lawName={articleModal.lawName}
          articleNo={articleModal.articleNo}
          onClose={() => setArticleModal(null)}
        />
      )}
    </div>
  );
}

function extractQueryParam(route: RouteResult | null, key: string): string | undefined {
  if (!route) return undefined;
  const v = route.params[key];
  if (v === undefined || v === null) return undefined;
  return String(v);
}
