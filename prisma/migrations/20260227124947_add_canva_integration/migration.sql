-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "CanvaToken" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvaToken_pkey" PRIMARY KEY ("id")
);
