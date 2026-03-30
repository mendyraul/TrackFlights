export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'trackflights-web',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
