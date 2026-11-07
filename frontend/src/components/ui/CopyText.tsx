// Author: Kishore Kumar
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyText({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  return (
    <div className={`flex items-start gap-1.5 group ${className}`}>
      <span className="min-w-0 flex-1 line-clamp-1 break-words">{text}</span>
      <button onClick={copy} title="Copy full text" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-500 hover:text-gray-300">
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}
