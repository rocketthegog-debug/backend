import axios from 'axios'

const API_BASE_URL = 'http://localhost:5001/api'

// Test results
const results = {
  passed: [],
  failed: [],
  errors: []
}

// Helper function to make API calls
const testEndpoint = async (name, method, url, data = null, headers = {}, expectedFailure = false) => {
  try {
    console.log(`\n🧪 Testing: ${name}`)
    console.log(`   ${method.toUpperCase()} ${url}`)
    if (data) {
      console.log(`   📤 Data: ${JSON.stringify(data).substring(0, 80)}...`)
    }
    
    const config = {
      method,
      url: `${API_BASE_URL}${url}`,
      headers: {
        ...headers
      },
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept 4xx as valid responses
    }
    
    // Only add Content-Type and data for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      config.headers['Content-Type'] = 'application/json'
      if (data) {
        config.data = data
      }
    }

    const response = await axios(config)
    
    // Check if this was an expected failure
    if (expectedFailure && response.status >= 400) {
      results.passed.push({ name: `${name} (Expected Failure)`, status: response.status })
      console.log(`   ✅ PASSED - Expected failure: ${response.status}`)
      return response.data
    }
    
    if (response.status >= 200 && response.status < 300) {
      results.passed.push({ name, status: response.status, data: response.data })
      console.log(`   ✅ PASSED - Status: ${response.status}`)
      if (response.data?.data && typeof response.data.data !== 'string') {
        const dataStr = JSON.stringify(response.data.data)
        console.log(`   📦 Response: ${dataStr.substring(0, 100)}${dataStr.length > 100 ? '...' : ''}`)
      } else if (response.data) {
        const dataStr = JSON.stringify(response.data)
        console.log(`   📦 Response: ${dataStr.substring(0, 100)}${dataStr.length > 100 ? '...' : ''}`)
      }
      return response.data
    } else {
      const errorMsg = response.data?.message || response.data?.error || `HTTP ${response.status}`
      results.failed.push({ name, status: response.status, error: errorMsg })
      console.log(`   ❌ FAILED - Status: ${response.status}`)
      console.log(`   💥 Error: ${errorMsg}`)
      if (response.data) {
        console.log(`   📋 Details: ${JSON.stringify(response.data).substring(0, 150)}`)
      }
      return null
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      const errorMsg = 'Connection refused - Server might not be running'
      results.failed.push({ name, status: 'No Connection', error: errorMsg })
      console.log(`   ❌ FAILED - ${errorMsg}`)
      return null
    }
    
    const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || 'Unknown error'
    const status = error.response?.status || error.code || 'No response'
    results.failed.push({ name, status, error: errorMsg })
    results.errors.push({ name, status, error: errorMsg, fullError: error.response?.data })
    console.log(`   ❌ FAILED - Status: ${status}`)
    console.log(`   💥 Error: ${errorMsg}`)
    if (error.response?.data) {
      console.log(`   📋 Details: ${JSON.stringify(error.response.data).substring(0, 150)}`)
    }
    return null
  }
}

// Test all endpoints
const runTests = async () => {
  console.log('🚀 Starting Backend API Tests\n')
  console.log('=' .repeat(60))

  // 1. Health Check
  await testEndpoint('Health Check', 'GET', '/health')

  // 2. Cricket API Tests
  console.log('\n📊 CRICKET API TESTS')
  console.log('-'.repeat(60))
  await testEndpoint('Get All Matches', 'GET', '/cricket/matches')
  await testEndpoint('Get Current Matches', 'GET', '/cricket/matches/current')
  await testEndpoint('Get Upcoming Matches', 'GET', '/cricket/matches/upcoming')
  await testEndpoint('Get Series List', 'GET', '/cricket/series')

  // 3. Auth API Tests
  console.log('\n🔐 AUTH API TESTS')
  console.log('-'.repeat(60))
  
  // Register a test user
  const testPhone = `9876543${Math.floor(Math.random() * 1000)}`
  const testUser = {
    phone: testPhone,
    name: 'Test User',
    password: 'test123456'
  }

  const registerResult = await testEndpoint('Register User', 'POST', '/auth/register', testUser)
  
  if (registerResult?.success) {
    console.log(`\n   ✅ Test user created: ${testPhone}`)
  }

  // Login test
  await testEndpoint('Login User', 'POST', '/auth/login', {
    phone: testPhone,
    password: 'test123456'
  })

  // Login with wrong password (expected to fail)
  await testEndpoint('Login with Wrong Password (Should Fail)', 'POST', '/auth/login', {
    phone: testPhone,
    password: 'wrongpassword'
  }, {}, true)

  // Get user by ID
  if (registerResult?.success) {
    await testEndpoint('Get User by ID', 'GET', `/auth/user/${testPhone}`)
  }

  // 4. Wallet API Tests
  console.log('\n💰 WALLET API TESTS')
  console.log('-'.repeat(60))

  if (registerResult?.success) {
    // Get wallet balance
    await testEndpoint('Get Wallet Balance', 'GET', `/wallet/balance/${testPhone}`)

    // Create recharge request
    const rechargeResult = await testEndpoint('Create Recharge Request', 'POST', '/wallet/recharge', {
      userId: testPhone,
      amount: 500,
      upiReferenceId: `UPI${Date.now()}`
    })

    let transactionId = null
    if (rechargeResult?.success) {
      transactionId = rechargeResult.data?.transactionId
      console.log(`\n   ✅ Transaction created: ${transactionId}`)

      // Update UTR for recharge
      if (transactionId) {
        await testEndpoint('Update Recharge UTR', 'PUT', `/wallet/recharge/${transactionId}/utr`, {
          utr: `UTR${Date.now()}`
        })
      }
    }

    // Get user transactions
    await testEndpoint('Get User Transactions', 'GET', `/wallet/transactions/${testPhone}`)

    // Create withdrawal request (will fail due to insufficient balance - expected)
    await testEndpoint('Create Withdrawal Request (Insufficient Balance)', 'POST', '/wallet/withdraw', {
      userId: testPhone,
      amount: 10000
    }, {}, true)

    // Create valid withdrawal request (only if balance > 100)
    await testEndpoint('Get Wallet Balance (Before Withdrawal)', 'GET', `/wallet/balance/${testPhone}`)
    
    // Note: Withdrawal will be created but needs admin approval
    // This is expected behavior - transaction goes to "processing" status
  }

  // 5. Admin API Tests (may fail if no admin user exists)
  console.log('\n👨‍💼 ADMIN API TESTS')
  console.log('-'.repeat(60))
  console.log('   ℹ️  Note: Admin endpoints may fail if no admin user exists')
  
  await testEndpoint('Get Processing Transactions', 'GET', '/admin/transactions?status=processing')
  await testEndpoint('Get All Transactions', 'GET', '/admin/transactions')
  await testEndpoint('Get All Users', 'GET', '/admin/users')

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${results.passed.length}`)
  console.log(`❌ Failed: ${results.failed.length}`)
  
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:')
    results.failed.forEach((test, index) => {
      console.log(`\n${index + 1}. ${test.name}`)
      console.log(`   Status: ${test.status}`)
      console.log(`   Error: ${test.error}`)
    })
  }

  if (results.passed.length > 0) {
    console.log('\n✅ PASSED TESTS:')
    results.passed.forEach((test, index) => {
      console.log(`${index + 1}. ${test.name} (Status: ${test.status})`)
    })
  }

  console.log('\n' + '='.repeat(60))
  console.log(`Total Tests: ${results.passed.length + results.failed.length}`)
  console.log(`Success Rate: ${((results.passed.length / (results.passed.length + results.failed.length)) * 100).toFixed(2)}%`)
  console.log('='.repeat(60) + '\n')
}

// Run tests
runTests().catch(console.error)

