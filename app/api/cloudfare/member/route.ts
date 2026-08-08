import { requireVaultMember, vaultAccessResponse } from "@/lib/cloudflare";

export async function GET(request: Request) {
  try {
    const member = await requireVaultMember(request);

    return Response.json({
      member: {
        email: member.email,
        displayName: member.displayName,
        isAdmin: member.isAdmin,
        allowedVaults: member.allowedVaults,
      },
    });
  } catch (error) {
    return vaultAccessResponse(error);
  }
}
