import { NextResponse } from "next/server";
import { divisionRoiReport } from "@/lib/services/divisionRoi";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** What each division has actually returned, per euro of cards it ties up. */
export const GET = withErrorHandling(async () => {
  return NextResponse.json(await divisionRoiReport());
});
