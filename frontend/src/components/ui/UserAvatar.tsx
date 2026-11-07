// Author: Kishore Kumar
// A user's profile photo, or their initials when there's none (or it fails to load).
import { useEffect, useState } from 'react'

interface Props {
  url?: string | null
  initials: string
  /** Size, shape and initials colour — e.g. "h-7 w-7 text-xs bg-primary-600". */
  className?: string
  alt?: string
}

export function UserAvatar({ url, initials, className = '', alt = 'Profile photo' }: Props) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (url && !failed) {
    return <img src={url} alt={alt} onError={() => setFailed(true)} className={`shrink-0 rounded-full object-cover ${className}`} draggable={false} />
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none ${className}`}>
      {initials}
    </div>
  )
}
