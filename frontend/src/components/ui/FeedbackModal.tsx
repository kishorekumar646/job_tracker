// Author: Kishore Kumar
import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, Send, Star } from 'lucide-react'
import { feedbackApi } from '../../api'
import { errorMessage } from '../../api/client'
import { Modal, Spinner } from '.'

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!rating || busy) return
    setBusy(true)
    setError('')
    try {
      await feedbackApi.submit({ rating, comment: comment.trim(), page: pathname })
      setDone(true)
    } catch (e) {
      setError(errorMessage(e, 'Could not send feedback. Your message is kept here; please try again.'))
    } finally { setBusy(false) }
  }

  return (
    <Modal open title="Share feedback" onClose={onClose}>
      {done ? <div role="status" className="space-y-3 py-5 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" /><h3 className="font-semibold">Thank you for your feedback!</h3><p className="text-sm text-gray-400">Your feedback is available to the JobPilot administrators.</p><button className="btn-primary" onClick={onClose}>Done</button></div> : (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm text-gray-400">How is your JobPilot experience? Report a problem or suggest an improvement. Please do not include passwords, payment details or authenticator codes.</p>
          <fieldset><legend className="label">Overall rating</legend><div className="flex flex-wrap gap-1" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={rating === value} disabled={busy} onMouseEnter={() => setHovered(value)} onClick={() => setRating(value)} className="rounded-lg p-2"><Star className={`h-7 w-7 ${(hovered || rating) >= value ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`} /></button>)}
          </div></fieldset>
          <div><label htmlFor="feedback-comment" className="label">Comments (optional)</label><textarea id="feedback-comment" className="input min-h-28 resize-y" rows={4} maxLength={2000} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} placeholder="What is working well? What could we improve?" /><p className="mt-1 text-right text-xs text-gray-500">{comment.length}/2000</p></div>
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!rating || busy}>{busy ? <Spinner /> : <Send className="h-4 w-4" />}Send feedback</button></div>
        </form>
      )}
    </Modal>
  )
}
