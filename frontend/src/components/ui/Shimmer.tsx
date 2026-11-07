// Author: Kishore Kumar
interface Props {
  className?: string
}

export function Shimmer({ className }: Props) {
  return <div className={`animate-pulse rounded bg-gray-800 ${className ?? ''}`} />
}
