import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, trim: true, maxlength: 100 },
    entityType: { type: String, required: true, trim: true, maxlength: 80 },
    entityId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed, default: {} },
    correlationId: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
auditSchema.index({ actor: 1, createdAt: -1 })
auditSchema.index({ correlationId: 1 })

export type AuditRecord = InferSchemaType<typeof auditSchema>
export type AuditRecordDocument = HydratedDocument<AuditRecord>
export const AuditRecordModel = model<AuditRecord>('AuditRecord', auditSchema)