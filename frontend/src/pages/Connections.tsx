// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { connectionsApi } from '../api'
import { errorMessage } from '../api/client'
import { ConnectionsGrid } from '../components/features'
import { PageHeader, PageLoader } from '../components/ui'
import { toast } from '../store/toastStore'
import type { Connection } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

export default function Connections() {
  const [items, setItems] = useState<Connection[] | null>(null)
  const revision = useDataRefresh()
  useEffect(() => {
    let active = true
    connectionsApi.list().then((rows) => { if (active) setItems(rows) }).catch((e) => { if (active) toast.error(errorMessage(e)) })
    return () => { active = false }
  }, [revision])
  const upsert = (c: Connection) => setItems((l) => l?.map((x) => (x.platform === c.platform ? c : x)) ?? l)
  const count = items?.filter((i) => i.connected).length ?? 0
  return (
    <>
      <PageHeader title="Connected accounts" subtitle={items ? `${count} of ${items.length} platforms connected. Auto-apply only runs on connected platforms.` : undefined} />
      {items ? <ConnectionsGrid items={items} onChange={upsert} /> : <PageLoader variant="cards" />}
    </>
  )
}
