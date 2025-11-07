import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const removeOldIndexes = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get the Transaction collection
    const db = mongoose.connection.db
    const collection = db.collection('transactions')

    // Get current indexes
    const indexes = await collection.indexes()
    console.log('\n📋 Current indexes:')
    indexes.forEach(index => {
      console.log(`  - ${JSON.stringify(index)}`)
    })

    // Remove old indexes if they exist
    try {
      await collection.dropIndex('transactionId_1')
      console.log('\n✅ Dropped index: transactionId_1')
    } catch (err) {
      if (err.code === 27) {
        console.log('\nℹ️  Index transactionId_1 does not exist (already removed)')
      } else {
        console.error('Error dropping transactionId_1:', err.message)
      }
    }

    try {
      await collection.dropIndex('transactionId_1_unique')
      console.log('✅ Dropped index: transactionId_1_unique')
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️  Index transactionId_1_unique does not exist (already removed)')
      } else {
        console.error('Error dropping transactionId_1_unique:', err.message)
      }
    }

    try {
      await collection.dropIndex('upiReferenceId_1')
      console.log('✅ Dropped index: upiReferenceId_1')
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️  Index upiReferenceId_1 does not exist (already removed)')
      } else {
        console.error('Error dropping upiReferenceId_1:', err.message)
      }
    }

    // Show updated indexes
    const updatedIndexes = await collection.indexes()
    console.log('\n📋 Updated indexes:')
    updatedIndexes.forEach(index => {
      console.log(`  - ${JSON.stringify(index)}`)
    })

    console.log('\n✅ Index cleanup completed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

removeOldIndexes()



