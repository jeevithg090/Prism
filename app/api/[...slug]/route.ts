// Any /api path with no route answers in the JSON envelope ({ok:false,error}), never the HTML app 404.
import { fail } from "@/lib/schemas/community";

function notFound(req: Request): Response {
  return fail(404, "not_found", `No API route at ${new URL(req.url).pathname}.`);
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
