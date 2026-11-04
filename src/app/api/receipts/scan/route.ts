import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Receipt scanning now runs privately on your device. Refresh the app to scan.' }, { status: 410 })
}
