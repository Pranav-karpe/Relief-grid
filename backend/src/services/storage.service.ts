import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export interface UploadResult {
  storageKey: string
  url: string
  provider: 'local' | 'cloudinary'
  sizeBytes: number
}

export interface IStorageService {
  upload(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<UploadResult>
  delete(storageKey: string): Promise<void>
}

class LocalStorageProvider implements IStorageService {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), 'uploads', 'evidence')
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  async upload(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<UploadResult> {
    const ext = this.getExtension(mimeType, originalName)
    const randomSuffix = crypto.randomBytes(8).toString('hex')
    const fileName = `img_${Date.now()}_${randomSuffix}${ext}`
    const filePath = path.join(this.baseDir, fileName)

    await fs.promises.writeFile(filePath, fileBuffer)

    return {
      storageKey: `evidence/${fileName}`,
      url: `/uploads/evidence/${fileName}`,
      provider: 'local',
      sizeBytes: fileBuffer.length,
    }
  }

  async delete(storageKey: string): Promise<void> {
    const safeKey = path.basename(storageKey)
    const filePath = path.join(this.baseDir, safeKey)
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {})
    }
  }

  private getExtension(mimeType: string, originalName: string): string {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return '.jpg'
    if (mimeType === 'image/png') return '.png'
    if (mimeType === 'image/webp') return '.webp'
    const parsed = path.extname(originalName).toLowerCase()
    return parsed.length > 1 ? parsed : '.jpg'
  }
}

class CloudinaryStorageProvider implements IStorageService {
  private cloudName: string
  private apiKey: string
  private apiSecret: string
  private fallback: LocalStorageProvider

  constructor(cloudName: string, apiKey: string, apiSecret: string) {
    this.cloudName = cloudName
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.fallback = new LocalStorageProvider()
  }

  async upload(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<UploadResult> {
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const folder = 'reliefgrid/evidence'
      const signaturePayload = `folder=${folder}&timestamp=${timestamp}${this.apiSecret}`
      const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex')

      const base64Data = `data:${mimeType};base64,${fileBuffer.toString('base64')}`
      const formData = new URLSearchParams()
      formData.append('file', base64Data)
      formData.append('api_key', this.apiKey)
      formData.append('timestamp', String(timestamp))
      formData.append('folder', folder)
      formData.append('signature', signature)

      const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        console.warn(`[storage.service] Cloudinary upload HTTP ${response.status}. Falling back to local storage.`)
        return this.fallback.upload(fileBuffer, originalName, mimeType)
      }

      const data = (await response.json()) as { secure_url?: string; public_id?: string; bytes?: number }
      if (data.secure_url && data.public_id) {
        return {
          storageKey: data.public_id,
          url: data.secure_url,
          provider: 'cloudinary',
          sizeBytes: data.bytes ?? fileBuffer.length,
        }
      }

      return this.fallback.upload(fileBuffer, originalName, mimeType)
    } catch (err) {
      console.warn('[storage.service] Cloudinary upload error. Falling back to local storage:', err)
      return this.fallback.upload(fileBuffer, originalName, mimeType)
    }
  }

  async delete(storageKey: string): Promise<void> {
    // If key starts with evidence/, it's a local fallback file
    if (storageKey.startsWith('evidence/')) {
      return this.fallback.delete(storageKey)
    }
    // Attempt Cloudinary destroy
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const signaturePayload = `public_id=${storageKey}&timestamp=${timestamp}${this.apiSecret}`
      const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex')
      const formData = new URLSearchParams()
      formData.append('public_id', storageKey)
      formData.append('api_key', this.apiKey)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)

      await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`, {
        method: 'POST',
        body: formData,
      })
    } catch {
      // Ignored
    }
  }
}

function createStorageService(): IStorageService {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (cloudName && apiKey && apiSecret) {
    return new CloudinaryStorageProvider(cloudName, apiKey, apiSecret)
  }

  return new LocalStorageProvider()
}

export const storageService = createStorageService()

