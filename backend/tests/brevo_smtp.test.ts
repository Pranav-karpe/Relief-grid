import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getBrevoSmtpConfig,
  verifyEmailTransport,
  sendEmail,
  sendRoleNotification,
  setTestTransporter,
  sendReportConfirmation,
  sendNgoNewReportAlert,
  sendDonorAllocationNotification,
  sendVolunteerTaskAssignment,
  sendDeliveryStatusUpdate,
  sendNgoDeliveryConfirmation,
  sendAuthVerificationEmail,
  sendEmergencyBroadcastEmail,
  type EmailPayload,
} from '../src/services/email.service.js'

// ---------------------------------------------------------------------------
// 1. Brevo SMTP Configuration Loader
// ---------------------------------------------------------------------------
test('Brevo SMTP config loader loads host, port, and security defaults', () => {
  const cfg = getBrevoSmtpConfig()
  assert.equal(cfg.host, 'smtp-relay.brevo.com')
  assert.equal(cfg.port, 587)
  assert.equal(typeof cfg.secure, 'boolean')
  assert.ok(cfg.from.includes('ReliefGrid Team'))
  assert.equal(typeof cfg.isConfigured, 'boolean')
})

// ---------------------------------------------------------------------------
// 2. Unconfigured Fallback (Simulation Mode)
// ---------------------------------------------------------------------------
test('sendEmail gracefully simulates delivery when credentials unconfigured without crashing', async () => {
  setTestTransporter(null)
  const result = await sendEmail({
    to: 'citizen@example.com',
    subject: 'Emergency Shelter Allocation Update',
    text: 'Your shelter allocation has been verified.',
  })

  assert.equal(result.success, true)
  assert.equal(result.simulated, true)
  assert.equal(result.error, undefined)
})

test('verifyEmailTransport reports unconfigured simulated mode when credentials missing', async () => {
  setTestTransporter(null)
  // Ensure unconfigured state during test
  const savedUser = process.env.SMTP_USER
  const savedPass = process.env.SMTP_PASS
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS

  try {
    const status = await verifyEmailTransport()
    assert.equal(status.connected, false)
    assert.ok(status.message.includes('not configured') || status.message.includes('simulated'))
  } finally {
    if (savedUser) process.env.SMTP_USER = savedUser
    if (savedPass) process.env.SMTP_PASS = savedPass
  }
})

// ---------------------------------------------------------------------------
// 3. Mocked Brevo SMTP Dispatch
// ---------------------------------------------------------------------------
test('Mocked Brevo SMTP transport captures recipient, subject, and dark-theme HTML', async () => {
  const sentMessages: Array<{ from: string; to: string; subject: string; text?: string; html?: string }> = []

  const mockTransporter: any = {
    sendMail: async (mailOptions: any) => {
      sentMessages.push(mailOptions)
      return { messageId: '<brevo-mock-msg-12345@smtp-relay.brevo.com>' }
    },
    verify: async () => true,
  }

  setTestTransporter(mockTransporter)

  try {
    const res = await sendEmail({
      to: 'field.volunteer@kerala-relief.org',
      subject: 'Critical Task Assignment: Wayanad Landslide Response',
      text: 'Report to Command Center Alpha at 07:00 IST.',
      html: '<p>Report to Command Center Alpha at 07:00 IST.</p>',
    })

    assert.equal(res.success, true)
    assert.equal(res.messageId, '<brevo-mock-msg-12345@smtp-relay.brevo.com>')
    assert.equal(sentMessages.length, 1)
    assert.equal(sentMessages[0].to, 'field.volunteer@kerala-relief.org')
    assert.equal(sentMessages[0].subject, 'Critical Task Assignment: Wayanad Landslide Response')
    assert.ok(sentMessages[0].from.includes('ReliefGrid Team'))
  } finally {
    setTestTransporter(null)
  }
})

// ---------------------------------------------------------------------------
// 4. Error Handling & Secret Sanitization
// ---------------------------------------------------------------------------
test('Brevo SMTP failure (e.g. 535 Auth / 550 Unverified) sanitizes secrets in logs', async () => {
  const fakeSecretKey = 'xsmtpsib-sensitive-fake-secret-do-not-leak'
  const fakeUser = 'brevo-login-user@reliefgrid.org'
  process.env.SMTP_PASS = fakeSecretKey
  process.env.SMTP_USER = fakeUser

  const failingTransporter: any = {
    sendMail: async () => {
      throw new Error(`535 5.7.8 Authentication credentials invalid for key ${fakeSecretKey}`)
    },
    verify: async () => {
      throw new Error(`550 5.1.8 Sender address rejected for account with key ${fakeSecretKey}`)
    },
  }

  setTestTransporter(failingTransporter)

  try {
    const sendResult = await sendEmail({
      to: 'donor@example.com',
      subject: 'Donation Receipt',
      text: 'Thank you.',
    })

    assert.equal(sendResult.success, false)
    assert.ok(sendResult.error)
    assert.ok(!sendResult.error.includes(fakeSecretKey), 'Secret must NOT appear in sendResult error!')
    assert.ok(sendResult.error.includes('[REDACTED_SMTP_KEY]'))

    const verifyResult = await verifyEmailTransport()
    assert.equal(verifyResult.connected, false)
    assert.ok(!verifyResult.message.includes(fakeSecretKey), 'Secret must NOT appear in verify message!')
    assert.ok(verifyResult.message.includes('[REDACTED_SMTP_KEY]'))
  } finally {
    delete process.env.SMTP_PASS
    delete process.env.SMTP_USER
    setTestTransporter(null)
  }
})

// ---------------------------------------------------------------------------
// 5. Verification of All 8 Transactional Notification Types
// ---------------------------------------------------------------------------
test('All 8 transactional notification types generate correct recipients, subjects, and payloads', async () => {
  const captured: Array<{ to: string; subject: string; text?: string; html?: string }> = []

  const mockTransporter: any = {
    sendMail: async (mailOptions: any) => {
      captured.push(mailOptions)
      return { messageId: `<tx-notif-${captured.length}@smtp-relay.brevo.com>` }
    },
    verify: async () => true,
  }

  setTestTransporter(mockTransporter)

  try {
    // 1. Citizen Report Confirmation
    await sendReportConfirmation({
      citizenEmail: 'citizen.kerala@example.com',
      citizenName: 'Rahul Varma',
      reportId: 'REP-KL-001',
      disasterType: 'Flash Flood',
      locationName: 'Meppadi, Wayanad',
      urgency: 'Critical',
    })

    // 2. NGO New-Report Alert
    await sendNgoNewReportAlert({
      ngoEmail: 'operations@keralarelief.org',
      ngoName: 'Kerala Disaster Relief Network',
      reportId: 'REP-KL-001',
      disasterType: 'Flash Flood',
      urgency: 'critical',
      locationName: 'Meppadi, Wayanad',
      affectedPersons: 85,
    })

    // 3. Donor Resource Allocation Notification
    await sendDonorAllocationNotification({
      donorEmail: 'tata.trusts@example.org',
      donorName: 'Tata Community Relief Trust',
      donationTitle: '500 Water Purification Units',
      quantityAllocated: 250,
      targetIncident: 'Wayanad Monsoon Inundation',
      locationName: 'Chooralmala Relief Camp',
    })

    // 4. Volunteer Task Assignment Notification
    await sendVolunteerTaskAssignment({
      volunteerEmail: 'arun.kumar@gmail.com',
      volunteerName: 'Arun Kumar',
      taskId: 'TSK-MED-09',
      taskTitle: 'First Aid Kit Distribution at Camp Alpha',
      location: 'Government High School, Meppadi',
      urgency: 'High',
    })

    // 5. Delivery Status Notification
    await sendDeliveryStatusUpdate({
      recipientEmail: 'shelter.manager@reliefgrid.org',
      recipientName: 'Meppadi Base Camp Manager',
      deliveryId: 'DEL-2026-0042',
      status: 'in_transit',
      destination: 'Wayanad Sector 3 Distribution Center',
      trackingNotes: 'Convoy escorted by district emergency services.',
    })

    // 6. NGO Delivery Confirmation Notification
    await sendNgoDeliveryConfirmation({
      ngoEmail: 'logistics@sewainternational.org',
      ngoName: 'Sewa International Disaster Cell',
      deliveryId: 'DEL-2026-0042',
      confirmedBy: 'Inspector Ramesh Nair',
      verifiedAt: '2026-10-31 11:00 IST',
      itemsDeliveredSummary: '250 Water Purification Units, 100 Family First Aid Kits',
    })

    // 7. Account Verification / Password Reset Email
    await sendAuthVerificationEmail({
      userEmail: 'new.responder@reliefgrid.org',
      userName: 'Dr. Priya Sen',
      actionType: 'account_verification',
      actionUrl: 'https://reliefgrid.org/auth/verify?token=xyz987',
      expiresInMinutes: 30,
    })

    // 8. Emergency Administrative Broadcast
    await sendEmergencyBroadcastEmail({
      recipientEmail: 'all-responders-zone4@reliefgrid.org',
      recipientName: 'Zone 4 Relief Responders',
      alertLevel: 'extreme',
      title: 'IMD Red Alert: Dam Gate Discharge Warning',
      instructions: 'Evacuate riverbank logistics depots immediately to elevated ground.',
      affectedRegion: 'Idukki & Wayanad Downstream Basins',
    })

    assert.equal(captured.length, 8, 'Exactly 8 transactional emails must be dispatched')

    // Detailed assertions for each transactional message
    // 1. Citizen Report Confirmation
    assert.equal(captured[0].to, 'citizen.kerala@example.com')
    assert.ok(captured[0].subject.includes('Disress Report Received'))
    assert.ok(captured[0].text?.includes('Rahul Varma'))
    assert.ok(captured[0].html?.includes('Meppadi, Wayanad'))

    // 2. NGO New-Report Alert
    assert.equal(captured[1].to, 'operations@keralarelief.org')
    assert.ok(captured[1].subject.includes('URGENT: New CRITICAL'))
    assert.ok(captured[1].html?.includes('Kerala Disaster Relief Network'))

    // 3. Donor Allocation
    assert.equal(captured[2].to, 'tata.trusts@example.org')
    assert.ok(captured[2].subject.includes('Allocated to Relief Operations'))
    assert.ok(captured[2].html?.includes('Tata Community Relief Trust'))
    assert.ok(captured[2].text?.includes('500 Water Purification Units'))

    // 4. Volunteer Task Assignment
    assert.equal(captured[3].to, 'arun.kumar@gmail.com')
    assert.ok(captured[3].subject.includes('Field Mission Assignment'))
    assert.ok(captured[3].text?.includes('First Aid Kit Distribution'))

    // 5. Delivery Status Update
    assert.equal(captured[4].to, 'shelter.manager@reliefgrid.org')
    assert.ok(captured[4].subject.includes('Relief Shipment Status: IN TRANSIT'))
    assert.ok(captured[4].html?.includes('DEL-2026-0042'))

    // 6. NGO Delivery Confirmation
    assert.equal(captured[5].to, 'logistics@sewainternational.org')
    assert.ok(captured[5].subject.includes('Verified and Confirmed at Destination'))
    assert.ok(captured[5].text?.includes('Inspector Ramesh Nair'))

    // 7. Account Verification
    assert.equal(captured[6].to, 'new.responder@reliefgrid.org')
    assert.ok(captured[6].subject.includes('Verify Your ReliefGrid Responder Account'))
    assert.ok(captured[6].html?.includes('https://reliefgrid.org/auth/verify?token=xyz987'))

    // 8. Emergency Broadcast
    assert.equal(captured[7].to, 'all-responders-zone4@reliefgrid.org')
    assert.ok(captured[7].subject.includes('[EMERGENCY BROADCAST - EXTREME]'))
    assert.ok(captured[7].html?.includes('Dam Gate Discharge Warning'))
    assert.ok(captured[7].text?.includes('Evacuate riverbank logistics depots'))
  } finally {
    setTestTransporter(null)
  }
})

// ---------------------------------------------------------------------------
// 6. On-Demand Health & Webhook Endpoints
// ---------------------------------------------------------------------------
test('GET /api/email-status returns operational status', async () => {
  const { default: app } = await import('../src/app.js')
  const http = await import('node:http')

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to obtain server address'))
        return
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: '/api/email-status',
          method: 'GET',
        },
        (res) => {
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => {
            server.close()
            assert.equal(res.statusCode, 200)
            const json = JSON.parse(data)
            assert.equal(json.service, 'reliefgrid-email-brevo')
            assert.equal(typeof json.connected, 'boolean')
            resolve()
          })
        },
      )
      req.on('error', (e) => { server.close(); reject(e) })
      req.end()
    })
  })
})

test('POST /api/webhooks/brevo receives transactional delivery events', async () => {
  const { default: app } = await import('../src/app.js')
  const http = await import('node:http')

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to obtain server address'))
        return
      }

      const payload = JSON.stringify({
        event: 'delivered',
        email: 'volunteer@reliefgrid.org',
        id: 98765,
        date: '2026-10-31 11:30:00',
        'message-id': '<brevo-12345@smtp-relay.brevo.com>',
      })

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: '/api/webhooks/brevo',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => {
            server.close()
            assert.equal(res.statusCode, 200)
            const json = JSON.parse(data)
            assert.equal(json.received, true)
            assert.equal(json.provider, 'brevo')
            assert.equal(json.eventType, 'delivered')
            resolve()
          })
        },
      )
      req.on('error', (e) => { server.close(); reject(e) })
      req.write(payload)
      req.end()
    })
  })
})

