import crypto from 'node:crypto'

export interface ImageVerificationResult {
  isValid: boolean
  fileType: 'image/jpeg' | 'image/png' | 'image/webp' | 'unknown'
  fileSize: number
  sanitizedBuffer: Buffer
  reviewFlags: string[]
  reviewStatus: 'clean' | 'flagged' | 'rejected'
  errorMessage?: string
}

export class ImageVerificationService {
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
  private static readonly MIN_FILE_SIZE = 100 // 100 bytes

  /**
   * Identifies MIME type by checking the file's magic bytes.
   */
  public detectMimeType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'unknown' {
    if (buf.length < 12) return 'unknown'

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg'
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return 'image/png'
    }

    // WebP: RIFF ... WEBP
    // 0..3: RIFF (0x52, 0x49, 0x46, 0x46)
    // 8..11: WEBP (0x57, 0x45, 0x42, 0x50)
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return 'image/webp'
    }

    return 'unknown'
  }

  /**
   * Strips EXIF and XMP metadata (specifically GPS coordinates and camera fingerprints)
   * from JPEG, PNG, and WebP images to safeguard donor and beneficiary privacy.
   */
  public stripExifMetadata(buf: Buffer, mimeType: string): Buffer {
    if (mimeType === 'image/jpeg') {
      return this.stripJpegExif(buf)
    }
    if (mimeType === 'image/png') {
      return this.stripPngExif(buf)
    }
    if (mimeType === 'image/webp') {
      return this.stripWebpExif(buf)
    }
    return buf
  }

  private stripJpegExif(buf: Buffer): Buffer {
    // If not valid JPEG start, return
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      return buf
    }

    const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])]
    let offset = 2

    while (offset < buf.length) {
      if (buf[offset] !== 0xff) {
        // Raw scan data or corrupted marker; keep remainder
        chunks.push(buf.subarray(offset))
        break
      }

      const marker = buf[offset + 1]
      // SOS (Start of Scan) or EOI (End of Image)
      if (marker === 0xda || marker === 0xd9) {
        chunks.push(buf.subarray(offset))
        break
      }

      if (offset + 4 > buf.length) {
        chunks.push(buf.subarray(offset))
        break
      }

      const length = buf.readUInt16BE(offset + 2)
      const nextOffset = offset + 2 + length

      // APP1 (0xE1 = Exif/XMP) and APP13 (0xED = Photoshop IPTC/IRB)
      if (marker === 0xe1 || marker === 0xed) {
        offset = nextOffset
        continue
      }

      // Preserve other markers (SOF, DHT, DQT, APP0 JFIF, etc.)
      chunks.push(buf.subarray(offset, Math.min(nextOffset, buf.length)))
      offset = nextOffset
    }

    return Buffer.concat(chunks)
  }

  private stripPngExif(buf: Buffer): Buffer {
    if (buf.length < 8) return buf
    const chunks: Buffer[] = [buf.subarray(0, 8)]
    let offset = 8

    while (offset + 8 <= buf.length) {
      const length = buf.readUInt32BE(offset)
      const type = buf.subarray(offset + 4, offset + 8).toString('ascii')
      const totalChunkLength = 12 + length

      if (offset + totalChunkLength > buf.length) {
        chunks.push(buf.subarray(offset))
        break
      }

      // eXIf chunk holds EXIF data in PNG
      if (type === 'eXIf') {
        offset += totalChunkLength
        continue
      }

      // iTXt or tEXt chunks carrying XMP or geolocation metadata
      if (type === 'iTXt' || type === 'tEXt') {
        const textPayload = buf.subarray(offset + 8, offset + 8 + Math.min(length, 128)).toString('latin1')
        if (textPayload.includes('XML:com.adobe.xmp') || textPayload.includes('Raw profile type exif')) {
          offset += totalChunkLength
          continue
        }
      }

      chunks.push(buf.subarray(offset, offset + totalChunkLength))
      offset += totalChunkLength
    }

    return Buffer.concat(chunks)
  }

  private stripWebpExif(buf: Buffer): Buffer {
    // WebP structure: 0..3 'RIFF', 4..7 size (uint32LE), 8..11 'WEBP'
    if (
      buf.length < 12 ||
      buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buf.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      return buf
    }

    const chunks: Buffer[] = []
    let offset = 12
    let hasStrippedMetadata = false
    let vp8xChunkIndex = -1

    while (offset + 8 <= buf.length) {
      const fourCC = buf.subarray(offset, offset + 4).toString('ascii')
      const chunkDataSize = buf.readUInt32LE(offset + 4)
      // Chunks are padded to even number of bytes in RIFF
      const paddedSize = chunkDataSize + (chunkDataSize % 2)
      const totalChunkSize = 8 + paddedSize

      if (offset + 8 + chunkDataSize > buf.length) {
        // Truncated chunk; preserve remainder and exit
        chunks.push(buf.subarray(offset))
        break
      }

      const chunkBuffer = buf.subarray(offset, Math.min(offset + totalChunkSize, buf.length))

      // Strip EXIF and XMP chunks
      if (fourCC === 'EXIF' || fourCC === 'XMP ') {
        hasStrippedMetadata = true
        offset += totalChunkSize
        continue
      }

      if (fourCC === 'VP8X') {
        vp8xChunkIndex = chunks.length
      }

      chunks.push(Buffer.from(chunkBuffer))
      offset += totalChunkSize
    }

    if (!hasStrippedMetadata) {
      return buf
    }

    // If an extended VP8X chunk exists, clear EXIF (bit 3, 0x08) and XMP (bit 2, 0x04) in flags byte
    if (vp8xChunkIndex !== -1 && chunks[vp8xChunkIndex].length >= 12) {
      // VP8X payload starts at offset 8. Byte 8 is the flags field.
      // bit 2 (0x04) is XMP, bit 3 (0x08) is EXIF. Clear both: & ~0x0C
      const currentFlags = chunks[vp8xChunkIndex][8]
      chunks[vp8xChunkIndex][8] = currentFlags & ~0x0c
    }

    // Build final sanitized buffer
    const payloadBuffer = Buffer.concat(chunks)
    const totalFileSize = 4 + payloadBuffer.length // 'WEBP' (4 bytes) + chunks
    const newHeader = Buffer.alloc(12)
    newHeader.write('RIFF', 0, 4, 'ascii')
    newHeader.writeUInt32LE(totalFileSize, 4)
    newHeader.write('WEBP', 8, 4, 'ascii')

    return Buffer.concat([newHeader, payloadBuffer])
  }

  /**
   * Analyzes pixel samples for quality flags (Low Light, Blurry, Potential Portrait/Selfie).
   */
  public analyzeImageQuality(buf: Buffer, mimeType: string): string[] {
    const flags: string[] = []

    // Sample byte distribution for luminance and contrast
    const sampleSize = Math.min(buf.length, 16384)
    const step = Math.max(1, Math.floor(buf.length / sampleSize))
    let sumLuminance = 0
    let count = 0
    let varianceSum = 0

    const samples: number[] = []
    for (let i = 0; i < buf.length && count < sampleSize; i += step) {
      const val = buf[i]
      samples.push(val)
      sumLuminance += val
      count++
    }

    if (count > 0) {
      const avgLuminance = sumLuminance / count
      for (const val of samples) {
        varianceSum += (val - avgLuminance) * (val - avgLuminance)
      }
      const variance = varianceSum / count

      // Extremely dark / underexposed image
      if (avgLuminance < 18) {
        flags.push('LOW_LIGHT')
      }

      // Extremely low variance indicates completely flat/blurry/empty image
      if (variance < 6) {
        flags.push('BLURRY')
      }
    }

    // Check for selfie / portrait heuristics:
    // If the image is JPEG, check for typical selfie camera tags if present, or face hints
    const stringCheck = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1')
    if (
      stringCheck.includes('Front Camera') ||
      stringCheck.includes('Selfie') ||
      stringCheck.includes('portrait')
    ) {
      flags.push('POTENTIAL_PORTRAIT_OR_SELFIE')
    }

    return flags
  }

  /**
   * Computes a SHA-256 fingerprint of the image buffer.
   */
  public computeFingerprint(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex')
  }

  /**
   * Full pipeline verification of a raw image buffer.
   */
  public verifyAndSanitize(
    rawBuffer: Buffer,
    originalName: string = 'image.jpg',
  ): ImageVerificationResult {
    if (rawBuffer.length < ImageVerificationService.MIN_FILE_SIZE) {
      return {
        isValid: false,
        fileType: 'unknown',
        fileSize: rawBuffer.length,
        sanitizedBuffer: rawBuffer,
        reviewFlags: ['INVALID_FILE_TOO_SMALL'],
        reviewStatus: 'rejected',
        errorMessage: 'Image file is too small or corrupted.',
      }
    }

    if (rawBuffer.length > ImageVerificationService.MAX_FILE_SIZE) {
      return {
        isValid: false,
        fileType: 'unknown',
        fileSize: rawBuffer.length,
        sanitizedBuffer: rawBuffer,
        reviewFlags: ['FILE_TOO_LARGE'],
        reviewStatus: 'rejected',
        errorMessage: 'Image file exceeds the 5MB maximum allowed limit.',
      }
    }

    const mimeType = this.detectMimeType(rawBuffer)
    if (mimeType === 'unknown') {
      return {
        isValid: false,
        fileType: 'unknown',
        fileSize: rawBuffer.length,
        sanitizedBuffer: rawBuffer,
        reviewFlags: ['UNSUPPORTED_FORMAT'],
        reviewStatus: 'rejected',
        errorMessage: 'Invalid image format. Only JPEG, PNG, and WebP are accepted.',
      }
    }

    // Strip EXIF to protect donor privacy
    const sanitized = this.stripExifMetadata(rawBuffer, mimeType)

    // Analyze quality
    const flags = this.analyzeImageQuality(sanitized, mimeType)
    const reviewStatus = flags.length > 0 ? 'flagged' : 'clean'

    return {
      isValid: true,
      fileType: mimeType,
      fileSize: sanitized.length,
      sanitizedBuffer: sanitized,
      reviewFlags: flags,
      reviewStatus,
    }
  }
}

export const imageVerificationService = new ImageVerificationService()

