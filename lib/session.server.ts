import { cookies } from "next/headers";
export async function getCurrentUserId() { return (await cookies()).get("ks_uid")?.value ?? null; }
