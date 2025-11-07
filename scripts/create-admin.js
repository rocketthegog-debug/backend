import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'

dotenv.config()

// Create admin user
const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const phone = process.argv[2] || '9999999999'
    const password = process.argv[3] || 'admin123'
    const name = process.argv[4] || 'Admin User'

    // Check if admin already exists
    const existingAdmin = await User.findOne({ phone, isAdmin: true })
    if (existingAdmin) {
      console.log(`❌ Admin with phone ${phone} already exists`)
      process.exit(1)
    }

    // Check if user exists
    const existingUser = await User.findOne({ phone })
    if (existingUser) {
      // Update to admin
      existingUser.isAdmin = true
      await existingUser.save()
      console.log(`✅ User ${phone} updated to admin`)
      console.log(`   Name: ${existingUser.name}`)
      console.log(`   Phone: ${existingUser.phone}`)
      console.log(`   Password: ${password} (unchanged - existing password)`)
    } else {
      // Create new admin
      const admin = new User({
        phone,
        name,
        password, // In production, hash this
        isAdmin: true,
        walletBalance: 0
      })
      
      await admin.save()
      console.log(`✅ Admin user created successfully`)
      console.log(`   Name: ${admin.name}`)
      console.log(`   Phone: ${admin.phone}`)
      console.log(`   Password: ${password}`)
    }

    process.exit(0)
  } catch (error) {
    console.error('❌ Error creating admin:', error)
    process.exit(1)
  }
}

createAdmin()

