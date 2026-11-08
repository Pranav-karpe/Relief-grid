import React, { useState } from 'react'
import { processAndCompressImage, type ProcessedImage } from '../../lib/image-processing'

interface DonorImageUploaderProps {
  images: ProcessedImage[]
  onChange: (images: ProcessedImage[]) => void
  maxImages?: number
  disabled?: boolean
}

export const DonorImageUploader: React.FC<DonorImageUploaderProps> = ({
  images,
  onChange,
  maxImages = 3,
  disabled = false,
}) => {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return
    setError(null)

    const remainingSlots = maxImages - images.length
    if (remainingSlots <= 0) {
      setError(`Maximum limit of ${maxImages} evidence photos reached.`)
      return
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots)
    setProcessing(true)

    try {
      const newProcessed: ProcessedImage[] = []
      for (const file of filesToProcess) {
        const processed = await processAndCompressImage(file)
        newProcessed.push(processed)
      }
      onChange([...images, ...newProcessed])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error processing image file.')
    } finally {
      setProcessing(false)
    }
  }

  const handleRemove = (index: number) => {
    if (disabled) return
    const updated = images.filter((_, i) => i !== index)
    onChange(updated)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Evidence Photos ({images.length}/{maxImages})
        </label>
        <span className="text-[11px] text-zinc-400">
          Max 3 photos • Auto-compressed • GPS scrubbed
        </span>
      </div>

      {/* Grid of uploaded images */}
      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {images.map((img, idx) => {
            const savingsPercent = Math.max(
              0,
              Math.round(((img.originalSize - img.compressedSize) / img.originalSize) * 100),
            )
            return (
              <div
                key={idx}
                className="relative group rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900/60 p-2 flex flex-col justify-between"
              >
                <div className="relative aspect-video rounded overflow-hidden bg-black/40">
                  <img
                    src={img.dataUrl}
                    alt={`Evidence ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-full text-xs transition"
                      title="Remove photo"
                      aria-label="Remove photo"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="mt-2 text-[11px] text-zinc-400 space-y-0.5">
                  <div className="truncate font-medium text-zinc-300">{img.fileName}</div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>{formatBytes(img.compressedSize)}</span>
                    {savingsPercent > 0 && (
                      <span className="text-emerald-400 font-medium">-{savingsPercent}%</span>
                    )}
                  </div>
                  {img.warning && (
                    <div className="text-amber-400 font-normal leading-tight pt-1">
                      ⚠️ {img.warning}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Drop / upload zone */}
      {images.length < maxImages && (
        <label
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition ${
            disabled || processing
              ? 'border-zinc-700 bg-zinc-900/30 opacity-60 cursor-not-allowed'
              : 'border-zinc-700 hover:border-emerald-500/60 bg-zinc-900/40 hover:bg-zinc-800/40'
          }`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={maxImages - images.length > 1}
            disabled={disabled || processing}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <div className="flex flex-col items-center space-y-1 text-center">
            <svg
              className="w-6 h-6 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs font-medium text-zinc-300">
              {processing ? 'Processing & sanitizing photos...' : 'Add resource photos (JPEG, PNG, WebP)'}
            </span>
            <span className="text-[10px] text-zinc-400">
              Photos reassure NGOs and expedite delivery verification
            </span>
          </div>
        </label>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/50 rounded p-2">
          {error}
        </div>
      )}
    </div>
  )
}

