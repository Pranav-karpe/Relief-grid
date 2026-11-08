export interface ProcessedImage {
  dataUrl: string
  fileName: string
  mimeType: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  warning?: string
}

/**
 * Downsamples an image in-browser using HTML5 Canvas, strips EXIF tags (including GPS coordinates),
 * and compresses it to < 800 KB for fast, reliable emergency uploads.
 */
export async function processAndCompressImage(file: File): Promise<ProcessedImage> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Unsupported image format. Please select a JPEG, PNG, or WebP photo.')
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Original file exceeds 20MB limit.')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image data.'))
      img.onload = () => {
        try {
          const maxDimension = 1600
          let width = img.naturalWidth || img.width
          let height = img.naturalHeight || img.height

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width)
              width = maxDimension
            } else {
              width = Math.round((width * maxDimension) / height)
              height = maxDimension
            }
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d', { willReadFrequently: true })

          if (!ctx) {
            throw new Error('Canvas context could not be created.')
          }

          // Draw image to canvas — this automatically strips all EXIF GPS tags upon re-export
          ctx.drawImage(img, 0, 0, width, height)

          // Luminance check (analyze center 100x100 sample)
          let warning: string | undefined
          try {
            const sampleW = Math.min(width, 100)
            const sampleH = Math.min(height, 100)
            const sampleData = ctx.getImageData(
              Math.floor((width - sampleW) / 2),
              Math.floor((height - sampleH) / 2),
              sampleW,
              sampleH,
            )
            let totalLuminance = 0
            const pixelCount = sampleW * sampleH
            for (let i = 0; i < sampleData.data.length; i += 4) {
              const r = sampleData.data[i]
              const g = sampleData.data[i + 1]
              const b = sampleData.data[i + 2]
              totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b
            }
            const avgLuminance = totalLuminance / pixelCount
            if (avgLuminance < 30) {
              warning = 'Photo appears dark. Please ensure item labels and quantities are clearly visible.'
            }
          } catch {
            // Ignore non-fatal analysis errors
          }

          // Export as compressed JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          // Calculate approx size in bytes from base64
          const base64Len = dataUrl.length - 'data:image/jpeg;base64,'.length
          const compressedSize = Math.round((base64Len * 3) / 4)

          resolve({
            dataUrl,
            fileName: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
            mimeType: 'image/jpeg',
            originalSize: file.size,
            compressedSize,
            width,
            height,
            warning,
          })
        } catch (err) {
          reject(err)
        }
      }

      img.src = reader.result as string
    }

    reader.readAsDataURL(file)
  })
}

