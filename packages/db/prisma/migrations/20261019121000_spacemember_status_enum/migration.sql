-- Alinea space_members.status con el enum nativo MemberStatus (como users.status).
ALTER TABLE "space_members" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "space_members" ALTER COLUMN "status" TYPE "MemberStatus" USING "status"::"MemberStatus";
ALTER TABLE "space_members" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
