import { NextResponse } from 'next/server'
import { exec, spawn } from 'child_process'
import { resolve } from 'path'
import { promisify } from 'util'
import net from 'net'

const execAsync = promisify(exec)
const PROD_PORT = 3100
const STUDIO_DIR = resolve(process.cwd())

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    sock.setTimeout(1000)
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('timeout', () => { sock.destroy(); resolve(false) })
    sock.once('error', () => { sock.destroy(); resolve(false) })
    sock.connect(port, '127.0.0.1')
  })
}

export async function GET() {
  const running = await checkPort(PROD_PORT)
  return NextResponse.json({ running, port: PROD_PORT })
}

export async function POST(req: Request) {
  const { action } = (await req.json()) as { action: 'start' | 'stop' }

  if (action === 'stop') {
    try {
      const { stdout } = await execAsync(
        `netstat -ano | findstr :${PROD_PORT} | findstr LISTENING`,
        { shell: 'cmd.exe' },
      )
      const pids = new Set(
        stdout.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean),
      )
      for (const pid of pids) {
        await execAsync(`taskkill /PID ${pid} /T /F`, { shell: 'cmd.exe' }).catch(() => {})
      }
      return NextResponse.json({ ok: true, action: 'stopped' })
    } catch {
      return NextResponse.json({ ok: true, action: 'already_stopped' })
    }
  }

  if (action === 'start') {
    const running = await checkPort(PROD_PORT)
    if (running) {
      return NextResponse.json({ ok: true, action: 'already_running', port: PROD_PORT })
    }

    const child = spawn('cmd.exe', ['/c', 'npm run build && npm run start'], {
      cwd: STUDIO_DIR,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()

    return NextResponse.json({ ok: true, action: 'starting', port: PROD_PORT, pid: child.pid })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
