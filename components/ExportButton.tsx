'use client'

import { Package, Download } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ExportButton({ appId }: { appId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          配布パッケージ
        </CardTitle>
        <CardDescription>
          このカートリッジを <code className="rounded bg-muted px-1 text-xs">.appcart.json</code> ファイルとして出力します。
          AppHarbor の「JSON で取り込み」から install できます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={`/api/cartridges/${encodeURIComponent(appId)}/export`}
          download
          className={cn(buttonVariants(), 'gap-1.5')}
        >
          <Download className="h-4 w-4" />
          .appcart.json をダウンロード
        </a>
      </CardContent>
    </Card>
  )
}
