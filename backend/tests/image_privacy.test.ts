import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageVerificationService } from '../src/services/image-verification.service.js'

test('JPEG metadata sanitization strips APP1 and APP13 markers', () => {
  // Construct a minimal valid JPEG with an APP1 marker containing simulated EXIF GPS data
  const jpegHeader = Buffer.from([0xff, 0xd8])
  // APP1: 0xFF, 0xE1, length (2 bytes), "Exif\0\0", payload
  const exifPayload = Buffer.from('Exif\0\0GPSLatitude=19.076,GPSLongitude=72.8777')
  const app1Length = 2 + exifPayload.length
  const app1Marker = Buffer.alloc(2 + 2 + exifPayload.length)
  app1Marker[0] = 0xff
  app1Marker[1] = 0xe1
  app1Marker.writeUInt16BE(app1Length, 2)
  exifPayload.copy(app1Marker, 4)

  // APP13: 0xFF, 0xED, length (2 bytes), "Photoshop 3.0"
  const iptcPayload = Buffer.from('Photoshop 3.0\0Author=SecretDonor')
  const app13Length = 2 + iptcPayload.length
  const app13Marker = Buffer.alloc(2 + 2 + iptcPayload.length)
  app13Marker[0] = 0xff
  app13Marker[1] = 0xed
  app13Marker.writeUInt16BE(app13Length, 2)
  iptcPayload.copy(app13Marker, 4)

  // Minimal JPEG image body (SOF0 + SOS + EOI)
  const imageBody = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x00,
    0xff, 0xd9,
  ])

  const rawJpeg = Buffer.concat([jpegHeader, app1Marker, app13Marker, imageBody])
  assert.ok(rawJpeg.toString('latin1').includes('GPSLatitude'))
  assert.ok(rawJpeg.toString('latin1').includes('Photoshop 3.0'))

  const sanitized = imageVerificationService.stripExifMetadata(rawJpeg, 'image/jpeg')
  const sanitizedStr = sanitized.toString('latin1')

  assert.ok(!sanitizedStr.includes('GPSLatitude'), 'APP1 EXIF GPS data must be stripped')
  assert.ok(!sanitizedStr.includes('Photoshop 3.0'), 'APP13 IPTC metadata must be stripped')
  // Verify JPEG starts with FF D8 and ends with FF D9
  assert.equal(sanitized[0], 0xff)
  assert.equal(sanitized[1], 0xd8)
  assert.equal(sanitized[sanitized.length - 2], 0xff)
  assert.equal(sanitized[sanitized.length - 1], 0xd9)
})

test('PNG metadata sanitization strips eXIf and XMP chunks', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // Helper to make a PNG chunk: 4 bytes length, 4 bytes type, data, 4 bytes CRC
  function makeChunk(type: string, data: Buffer): Buffer {
    const chunk = Buffer.alloc(12 + data.length)
    chunk.writeUInt32BE(data.length, 0)
    chunk.write(type, 4, 4, 'ascii')
    data.copy(chunk, 8)
    chunk.writeUInt32BE(0x12345678, 8 + data.length) // dummy CRC
    return chunk
  }

  const ihdrChunk = makeChunk('IHDR', Buffer.alloc(13))
  const exifChunk = makeChunk('eXIf', Buffer.from('GPSCoordinatesLatitude=19.076'))
  const xmpChunk = makeChunk('iTXt', Buffer.from('XML:com.adobe.xmp\0\0\0\0\0<xmp:Location>DisasterZone</xmp:Location>'))
  const idatChunk = makeChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]))
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  const rawPng = Buffer.concat([pngHeader, ihdrChunk, exifChunk, xmpChunk, idatChunk, iendChunk])
  assert.ok(rawPng.toString('latin1').includes('GPSCoordinatesLatitude'))
  assert.ok(rawPng.toString('latin1').includes('XML:com.adobe.xmp'))

  const sanitized = imageVerificationService.stripExifMetadata(rawPng, 'image/png')
  const sanitizedStr = sanitized.toString('latin1')

  assert.ok(!sanitizedStr.includes('GPSCoordinatesLatitude'), 'PNG eXIf chunk must be stripped')
  assert.ok(!sanitizedStr.includes('XML:com.adobe.xmp'), 'PNG XMP chunk must be stripped')
  assert.ok(sanitizedStr.includes('IHDR'), 'IHDR must be preserved')
  assert.ok(sanitizedStr.includes('IDAT'), 'IDAT must be preserved')
  assert.ok(sanitizedStr.includes('IEND'), 'IEND must be preserved')
})

test('WebP metadata sanitization strips EXIF and XMP chunks and updates VP8X flags and RIFF size', () => {
  // Helper to construct RIFF chunk: 4 bytes FourCC, 4 bytes uint32LE length, payload, padding if odd
  function makeRiffChunk(fourCC: string, payload: Buffer): Buffer {
    const padded = payload.length % 2 !== 0 ? 1 : 0
    const chunk = Buffer.alloc(8 + payload.length + padded)
    chunk.write(fourCC, 0, 4, 'ascii')
    chunk.writeUInt32LE(payload.length, 4)
    payload.copy(chunk, 8)
    return chunk
  }

  // VP8X payload: 10 bytes. Byte 0 is flags: bit 2 (0x04) is XMP, bit 3 (0x08) is EXIF, bit 4 (0x10) is Alpha
  // Initial flags: 0x08 | 0x04 | 0x10 = 0x1C
  const vp8xPayload = Buffer.alloc(10)
  vp8xPayload[0] = 0x1c // EXIF + XMP + Alpha
  const vp8xChunk = makeRiffChunk('VP8X', vp8xPayload)

  const exifPayload = Buffer.from('Exif\0\0SensitiveDonorLocationCoordinates=19.076,72.877')
  const exifChunk = makeRiffChunk('EXIF', exifPayload)

  const xmpPayload = Buffer.from('<xmp:CameraSerial>CANON-EOS-99999</xmp:CameraSerial>')
  const xmpChunk = makeRiffChunk('XMP ', xmpPayload)

  const vp8Payload = Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00])
  const vp8Chunk = makeRiffChunk('VP8 ', vp8Payload)

  const chunksPayload = Buffer.concat([vp8xChunk, exifChunk, xmpChunk, vp8Chunk])
  const totalRiffSize = 4 + chunksPayload.length // 'WEBP' + chunks

  const riffHeader = Buffer.alloc(12)
  riffHeader.write('RIFF', 0, 4, 'ascii')
  riffHeader.writeUInt32LE(totalRiffSize, 4)
  riffHeader.write('WEBP', 8, 4, 'ascii')

  const rawWebp = Buffer.concat([riffHeader, chunksPayload])

  assert.equal(imageVerificationService.detectMimeType(rawWebp), 'image/webp')
  assert.ok(rawWebp.toString('latin1').includes('SensitiveDonorLocationCoordinates'))
  assert.ok(rawWebp.toString('latin1').includes('CANON-EOS-99999'))

  const sanitized = imageVerificationService.stripExifMetadata(rawWebp, 'image/webp')
  const sanitizedStr = sanitized.toString('latin1')

  // Metadata chunks must be absent
  assert.ok(!sanitizedStr.includes('SensitiveDonorLocationCoordinates'), 'EXIF chunk must be stripped from WebP')
  assert.ok(!sanitizedStr.includes('CANON-EOS-99999'), 'XMP chunk must be stripped from WebP')
  assert.ok(sanitizedStr.includes('VP8 '), 'VP8 image frame must be retained')

  // Check VP8X flags: bit 3 (0x08) and bit 2 (0x04) must be cleared, while bit 4 (0x10) is preserved
  // In sanitized buffer: Header (12 bytes) + 'VP8X' (4 bytes) + size (4 bytes) -> payload byte 0 is at offset 20
  const updatedFlags = sanitized[20]
  assert.equal(updatedFlags & 0x08, 0, 'EXIF bit in VP8X flags must be cleared')
  assert.equal(updatedFlags & 0x04, 0, 'XMP bit in VP8X flags must be cleared')
  assert.equal(updatedFlags & 0x10, 0x10, 'Alpha bit in VP8X flags must be preserved')

  // Verify RIFF total length matches actual buffer length - 8
  const headerReportedSize = sanitized.readUInt32LE(4)
  assert.equal(headerReportedSize, sanitized.length - 8, 'RIFF size header must match sanitized length - 8')
})

test('Genuine clean images without metadata are preserved intact', () => {
  const cleanHeader = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
  ])

  const sanitized = imageVerificationService.stripExifMetadata(cleanHeader, 'image/jpeg')
  assert.deepEqual(sanitized, cleanHeader, 'Clean image without EXIF must remain identical')
})

