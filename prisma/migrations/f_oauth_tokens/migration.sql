-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- AlterTable
ALTER TABLE "TokenCache" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'jwt',
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "nickname" TEXT;
