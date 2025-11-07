import mongoose from 'mongoose'

const paymentMethodSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  accountHolderName: {
    type: String,
    required: true,
  },
  accountNumber: {
    type: String,
    required: true,
  },
  ifscCode: {
    type: String,
    required: true,
  },
  upiId: {
    type: String,
    default: null,
  },
  bankName: {
    type: String,
    default: null,
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

paymentMethodSchema.index({ userId: 1 }, { unique: true })

export default mongoose.model('PaymentMethod', paymentMethodSchema)


