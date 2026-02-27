-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "openaiText" TEXT,
    "geminiText" TEXT,
    "claudeText" TEXT,
    "selectedModel" TEXT,
    "finalText" TEXT,
    "linkedinPostId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);
