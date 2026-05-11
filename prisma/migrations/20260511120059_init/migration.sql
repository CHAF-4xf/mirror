-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'SCRAPING', 'EXTRACTING', 'SYNTHESIZING', 'RENDERING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('CUSTOMER_STORY', 'REDDIT_POST', 'REDDIT_COMMENT', 'X_MENTION', 'TRUSTPILOT_REVIEW', 'OTHER_REVIEW', 'THIRD_PARTY_REVIEW');

-- CreateEnum
CREATE TYPE "SourceReliability" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ThemeCategory" AS ENUM ('JOB_TO_BE_DONE', 'LOVE', 'FRUSTRATION', 'WISH', 'CHURN_RISK', 'COMPETITIVE_REFERENCE', 'CONTRADICTION');

-- CreateEnum
CREATE TYPE "AgentName" AS ENUM ('SCRAPER', 'EXTRACTOR', 'SYNTHESIZER', 'RENDERER');

-- CreateEnum
CREATE TYPE "AgentState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "companyName" TEXT,
    "companyDomain" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "authorContext" TEXT,
    "publishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawText" TEXT NOT NULL,
    "reliability" "SourceReliability" NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "category" "ThemeCategory" NOT NULL,
    "statement" TEXT NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "weightedConfidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerbatimQuote" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceReliability" "SourceReliability" NOT NULL,

    CONSTRAINT "VerbatimQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersion" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "renderedMarkdown" TEXT NOT NULL,

    CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agentName" "AgentName" NOT NULL,
    "state" "AgentState" NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL DEFAULT '',
    "progress" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "errorDetail" TEXT,
    "inputHash" TEXT,
    "outputRef" TEXT,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "Run_companyDomain_idx" ON "Run"("companyDomain");

-- CreateIndex
CREATE INDEX "Source_runId_idx" ON "Source"("runId");

-- CreateIndex
CREATE INDEX "Source_type_idx" ON "Source"("type");

-- CreateIndex
CREATE INDEX "Theme_runId_idx" ON "Theme"("runId");

-- CreateIndex
CREATE INDEX "Theme_category_idx" ON "Theme"("category");

-- CreateIndex
CREATE INDEX "VerbatimQuote_themeId_idx" ON "VerbatimQuote"("themeId");

-- CreateIndex
CREATE INDEX "VerbatimQuote_sourceId_idx" ON "VerbatimQuote"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_runId_key" ON "Memo"("runId");

-- CreateIndex
CREATE INDEX "AgentRun_runId_idx" ON "AgentRun"("runId");

-- CreateIndex
CREATE INDEX "AgentRun_agentName_state_idx" ON "AgentRun"("agentName", "state");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerbatimQuote" ADD CONSTRAINT "VerbatimQuote_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerbatimQuote" ADD CONSTRAINT "VerbatimQuote_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
