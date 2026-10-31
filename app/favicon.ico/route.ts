export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.redirect(new URL('/favicon.svg', url).toString(), 302);
}
