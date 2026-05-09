import type { Metadata } from 'next'
import { PreviewNav } from '@/components/PreviewNav'
import { Sidebar } from '@/components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'AppHarbor Studio',
  description: 'カートリッジ開発・検証スタジオ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <PreviewNav />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
