// Author: Kishore Kumar
import { useState } from 'react'
import { useModalEscape } from '../../hooks/useModalEscape'
import { createPortal } from 'react-dom'
import { X, Star, Send, CheckCircle2, MessageSquareHeart } from 'lucide-react'
import { submitFeedback } from '../../api/feedback'

interface Props {
  onClose: () => void
}

export function FeedbackModal({ onClose }: Props) {
  useModalEscape(onClose)
  const [rating, setRating]   = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit() {
    if (!rating) { setError('Please select a star rating.'); return }
    setError('')
    setLoading(true)
    try {
      await submitFeedback(rating, comment.trim())
      setDone(true)
    } catch {
      setError('Failed to submit feedback. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent']
  const active = hovered || rating

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15">
              <MessageSquareHeart className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100">How's your experience today?</h3>
              <p className="mt-0.5 text-xs text-gray-500">Daily check-in · takes less than a minute</p>
            </div>
          </div>
          <button onClick={onClose} className="ml-4 shrink-0 text-gray-500 hover:text-gray-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-gray-100">Thank you for your feedback!</p>
            <p className="text-xs text-gray-500 text-center">Your input helps us make the platform better for everyone.</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-500 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-5">
            {/* Star rating */}
            <div>
              <p className="mb-2 text-xs font-medium text-gray-400">Overall rating</p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => { setRating(s); setError('') }}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 transition-colors ${
                        s <= active
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-transparent text-gray-600 hover:text-amber-400/50'
                      }`}
                    />
                  </button>
                ))}
                {active > 0 && (
                  <span className="ml-2 text-sm font-medium text-amber-400">{LABELS[active]}</span>
                )}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Comments <span className="text-gray-600 font-normal">(optional)</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What's working well? What could be improved?"
                rows={4}
                maxLength={2000}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
              />
              <p className="mt-1 text-right text-xs text-gray-700">{comment.length}/2000</p>
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-50 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                {loading ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
