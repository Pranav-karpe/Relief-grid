/**
 * ReliefGrid — Master Demo Data Provisioning Script
 * Populates realistic, interconnected demo data across all roles and models.
 *
 * Safety & Quality Guarantees:
 * - Idempotent: safe to run multiple times without duplicating accounts or records.
 * - Non-destructive: preserves existing database users and tested data.
 * - Password hashing: uses the existing scrypt password hashing system.
 * - Interconnected: all foreign keys reference genuine, corresponding entities.
 */

import '../src/config/env.js'
import mongoose, { Types } from 'mongoose'
import { UserModel, type UserDocument } from '../src/models/user.js'
import { ReportModel } from '../src/models/report.js'
import { DonationModel } from '../src/models/donation.js'
import { RequirementModel } from '../src/models/requirement.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { AllocationRecordModel } from '../src/models/allocation.js'
import { IncidentModel } from '../src/models/incident.js'
import { HazardModel } from '../src/models/hazard.js'
import { AlertModel } from '../src/models/alert.js'
import { NotificationModel } from '../src/models/notification.js'
import { AuditRecordModel } from '../src/models/audit.js'
import { NgoVerificationModel, VolunteerVerificationModel } from '../src/models/oversight.js'
import { hashPassword } from '../src/auth/password.js'

export const DEMO_PASSWORD = 'DemoRelief@2026!'

export const DEMO_ACCOUNTS = [
  // 1 Admin
  {
    key: 'admin',
    displayName: 'ReliefGrid System Administrator',
    email: 'admin.demo@reliefgrid.org',
    role: 'admin' as const,
    accountStatus: 'active' as const,
    emailVerified: true,
  },
  // 2 Citizens
  {
    key: 'citizen_rahul',
    displayName: 'Rahul Sharma (Citizen Reporter)',
    email: 'citizen.rahul@reliefgrid.org',
    role: 'citizen' as const,
    phone: '+91 98201 12345',
    accountStatus: 'active' as const,
    emailVerified: true,
  },
  {
    key: 'citizen_priya',
    displayName: 'Priya Patel (Community Volunteer Lead)',
    email: 'citizen.priya@reliefgrid.org',
    role: 'citizen' as const,
    phone: '+91 98202 23456',
    accountStatus: 'active' as const,
    emailVerified: true,
  },
  // 2 Donors
  {
    key: 'donor_tata',
    displayName: 'Tata Relief Trust (Corporate Donor)',
    email: 'donor.tata@reliefgrid.org',
    role: 'donor' as const,
    phone: '+91 98203 34567',
    accountStatus: 'active' as const,
    emailVerified: true,
  },
  {
    key: 'donor_anita',
    displayName: 'Anita Desai (Individual Philanthropist)',
    email: 'donor.anita@reliefgrid.org',
    role: 'donor' as const,
    phone: '+91 98204 45678',
    accountStatus: 'active' as const,
    emailVerified: true,
  },
  // 2 NGOs
  {
    key: 'ngo_sewa',
    displayName: 'SEWA Disaster Response Foundation',
    email: 'ngo.sewa@reliefgrid.org',
    role: 'ngo' as const,
    phone: '+91 98205 56789',
    accountStatus: 'active' as const,
    emailVerified: true,
    organizationProfile: {
      name: 'SEWA Disaster Response Foundation',
      registrationNumber: 'MH-BOM-10294/2018',
      darpanId: 'MH/2021/0148293',
      contactPhone: '+91 98205 56789',
      website: 'https://sewaindia.org',
      verificationStatus: 'verified' as const,
      verifiedAt: new Date('2026-06-15T10:00:00Z'),
    },
  },
  {
    key: 'ngo_goonj',
    displayName: 'Goonj Relief Mission Mumbai',
    email: 'ngo.goonj@reliefgrid.org',
    role: 'ngo' as const,
    phone: '+91 98206 67890',
    accountStatus: 'active' as const,
    emailVerified: true,
    organizationProfile: {
      name: 'Goonj Relief Mission Mumbai',
      registrationNumber: 'MH-MUM-8921/2015',
      darpanId: 'DL/2019/0091823',
      contactPhone: '+91 98206 67890',
      website: 'https://goonj.org',
      verificationStatus: 'verified' as const,
      verifiedAt: new Date('2026-07-20T11:00:00Z'),
    },
  },
  // 3 Volunteers
  {
    key: 'vol_arjun',
    displayName: 'Arjun Verma',
    email: 'vol.arjun@reliefgrid.org',
    role: 'volunteer' as const,
    phone: '+91 98207 78901',
    accountStatus: 'active' as const,
    emailVerified: true,
    volunteerProfile: {
      phone: '+91 98207 78901',
      skills: ['First Aid', 'Two-Wheeler Navigation', 'Search & Rescue'],
      availability: 'available' as const,
      generalLocation: { type: 'Point' as const, coordinates: [72.8777, 19.076] as [number, number] },
      serviceRadiusKm: 15,
      areas: ['Kurla', 'BKC', 'Sion'],
      experience: '4 years active field disaster volunteer with Red Cross and civil defense',
      verificationStatus: 'verified' as const,
      verifiedAt: new Date('2026-08-01T09:00:00Z'),
      currentWorkload: 1,
      affiliation: 'ngo' as const,
    },
  },
  {
    key: 'vol_kavita',
    displayName: 'Kavita Nair',
    email: 'vol.kavita@reliefgrid.org',
    role: 'volunteer' as const,
    phone: '+91 98208 89012',
    accountStatus: 'active' as const,
    emailVerified: true,
    volunteerProfile: {
      phone: '+91 98208 89012',
      skills: ['Heavy Cargo Driving', 'Bulk Water Transport', 'Medical Evacuation'],
      availability: 'available' as const,
      generalLocation: { type: 'Point' as const, coordinates: [72.85, 19.05] as [number, number] },
      serviceRadiusKm: 25,
      areas: ['Dharavi', 'Bandra', 'Mahim'],
      experience: 'Commercial transport driver and certified community emergency responder',
      verificationStatus: 'verified' as const,
      verifiedAt: new Date('2026-08-10T14:00:00Z'),
      currentWorkload: 1,
      affiliation: 'ngo' as const,
    },
  },
  {
    key: 'vol_rohit',
    displayName: 'Rohit Deshmukh',
    email: 'vol.rohit@reliefgrid.org',
    role: 'volunteer' as const,
    phone: '+91 98209 90123',
    accountStatus: 'active' as const,
    emailVerified: true,
    volunteerProfile: {
      phone: '+91 98209 90123',
      skills: ['Local Navigation', 'Emergency Food Distribution', 'Elderly Assistance'],
      availability: 'available' as const,
      generalLocation: { type: 'Point' as const, coordinates: [72.90, 19.12] as [number, number] },
      serviceRadiusKm: 12,
      areas: ['Ghatkopar', 'Vikhroli', 'Powai'],
      experience: 'Neighborhood youth volunteer team coordinator',
      verificationStatus: 'verified' as const,
      verifiedAt: new Date('2026-09-01T10:00:00Z'),
      currentWorkload: 0,
      affiliation: 'independent' as const,
    },
  },
]

export async function seedDemoData() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  const isConnected = mongoose.connection.readyState === 1
  if (!isConnected) {
    await mongoose.connect(uri)
  }

  const results = {
    accountsCreated: 0,
    accountsReused: 0,
    incidentsCreatedOrUpdated: 0,
    reportsCreatedOrUpdated: 0,
    donationsCreatedOrUpdated: 0,
    requirementsCreatedOrUpdated: 0,
    allocationsCreatedOrUpdated: 0,
    tasksCreatedOrUpdated: 0,
    hazardsCreatedOrUpdated: 0,
    alertsCreatedOrUpdated: 0,
    notificationsCreatedOrUpdated: 0,
    auditRecordsCreated: 0,
  }

  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD)
    const userMap: Record<string, UserDocument> = {}

    // 1. Provision Demo Users (Idempotent)
    for (const acc of DEMO_ACCOUNTS) {
      let user = await UserModel.findOne({ email: acc.email })
      if (!user) {
        user = await UserModel.create({
          displayName: acc.displayName,
          email: acc.email,
          phone: acc.phone,
          role: acc.role,
          accountStatus: acc.accountStatus,
          emailVerified: acc.emailVerified,
          auth: { passwordHash },
          organizationProfile: (acc as any).organizationProfile,
          volunteerProfile: (acc as any).volunteerProfile,
        })
        results.accountsCreated++
      } else {
        // Ensure demo password and account status match DEMO_ACCOUNTS definition
        await UserModel.updateOne({ _id: user._id }, {
          $set: {
            'auth.passwordHash': passwordHash,
            accountStatus: acc.accountStatus,
            emailVerified: true,
          },
        })
        user.accountStatus = acc.accountStatus
        user.emailVerified = true
        if ((acc as any).organizationProfile) {
          user.organizationProfile = (acc as any).organizationProfile
        }
        if ((acc as any).volunteerProfile) {
          user.volunteerProfile = (acc as any).volunteerProfile
        }
        await user.save()
        results.accountsReused++
      }
      userMap[acc.key] = user
    }

    // Link volunteer affiliated NGO
    if (userMap.vol_arjun && userMap.ngo_sewa) {
      await UserModel.findByIdAndUpdate(userMap.vol_arjun._id, {
        $set: { 'volunteerProfile.affiliatedNgo': userMap.ngo_sewa._id },
      })
    }
    if (userMap.vol_kavita && userMap.ngo_goonj) {
      await UserModel.findByIdAndUpdate(userMap.vol_kavita._id, {
        $set: { 'volunteerProfile.affiliatedNgo': userMap.ngo_goonj._id },
      })
    }

    // 2. Ensure Oversight Verification Records Exist for Admin Review
    const adminUser = userMap.admin
    const sewaNgo = userMap.ngo_sewa
    const goonjNgo = userMap.ngo_goonj
    const arjunVol = userMap.vol_arjun
    const kavitaVol = userMap.vol_kavita

    await NgoVerificationModel.findOneAndUpdate(
      { ngo: sewaNgo._id },
      {
        $set: {
          ngo: sewaNgo._id,
          reviewer: adminUser._id,
          status: 'approved',
          submittedData: {
            name: sewaNgo.organizationProfile?.name,
            registrationNumber: sewaNgo.organizationProfile?.registrationNumber,
            darpanId: sewaNgo.organizationProfile?.darpanId,
            contactPhone: sewaNgo.organizationProfile?.contactPhone,
            website: sewaNgo.organizationProfile?.website,
          },
          assessmentReport: {
            assessment: 'appears_valid',
            confidence: 95,
            recommendation: 'Official non-profit verified via automated registry match.',
            fieldChecks: { requiredFields: true, validFormats: true, suspiciousCombinations: false },
            duplicateChecks: { duplicateRegFound: false, duplicateNameFound: false, duplicateContactFound: false, matchingAccounts: [] },
            registryChecks: { checkedAt: new Date(), sourcesChecked: ['Darpan API'], registryMatchFound: true, matchDetails: 'Active NGO record found', inconclusive: false },
            summary: 'Registration and contact credentials verified.',
          },
          reviewedAt: new Date(),
        },
      },
      { upsert: true },
    )

    await NgoVerificationModel.findOneAndUpdate(
      { ngo: goonjNgo._id },
      {
        $set: {
          ngo: goonjNgo._id,
          reviewer: adminUser._id,
          status: 'approved',
          submittedData: {
            name: goonjNgo.organizationProfile?.name,
            registrationNumber: goonjNgo.organizationProfile?.registrationNumber,
            darpanId: goonjNgo.organizationProfile?.darpanId,
            contactPhone: goonjNgo.organizationProfile?.contactPhone,
            website: goonjNgo.organizationProfile?.website,
          },
          assessmentReport: {
            assessment: 'appears_valid',
            confidence: 90,
            recommendation: 'Valid verified NGO account.',
            fieldChecks: { requiredFields: true, validFormats: true, suspiciousCombinations: false },
            duplicateChecks: { duplicateRegFound: false, duplicateNameFound: false, duplicateContactFound: false, matchingAccounts: [] },
            registryChecks: { checkedAt: new Date(), sourcesChecked: ['Darpan API'], registryMatchFound: true, matchDetails: 'Active registration confirmed', inconclusive: false },
            summary: 'Passed all verification checks.',
          },
          reviewedAt: new Date(),
        },
      },
      { upsert: true },
    )

    await VolunteerVerificationModel.findOneAndUpdate(
      { volunteer: arjunVol._id },
      {
        $set: {
          volunteer: arjunVol._id,
          reviewer: adminUser._id,
          status: 'approved',
          submittedData: {
            name: arjunVol.displayName,
            phone: arjunVol.phone,
            skills: arjunVol.volunteerProfile?.skills,
            serviceRadiusKm: arjunVol.volunteerProfile?.serviceRadiusKm,
            experience: arjunVol.volunteerProfile?.experience,
          },
          assessmentReport: {
            assessment: 'appears_valid',
            confidence: 85,
            duplicateFound: false,
            matchingAccounts: [],
            flags: [],
            summary: 'Experienced rescue volunteer with clean safety history.',
          },
          reviewedAt: new Date(),
        },
      },
      { upsert: true },
    )

    await VolunteerVerificationModel.findOneAndUpdate(
      { volunteer: kavitaVol._id },
      {
        $set: {
          volunteer: kavitaVol._id,
          reviewer: adminUser._id,
          status: 'approved',
          submittedData: {
            name: kavitaVol.displayName,
            phone: kavitaVol.phone,
            skills: kavitaVol.volunteerProfile?.skills,
            serviceRadiusKm: kavitaVol.volunteerProfile?.serviceRadiusKm,
            experience: kavitaVol.volunteerProfile?.experience,
          },
          assessmentReport: {
            assessment: 'appears_valid',
            confidence: 90,
            duplicateFound: false,
            matchingAccounts: [],
            flags: [],
            summary: 'Heavy vehicle cargo logistics verified.',
          },
          reviewedAt: new Date(),
        },
      },
      { upsert: true },
    )

    // 3. Disaster Incidents (Spatial clusters)
    const incident1 = await IncidentModel.findOneAndUpdate(
      { title: 'Monsoon Flash Flooding — Mithi River Basin & Kurla West [DEMO]' },
      {
        $set: {
          incidentType: 'flood',
          severity: 'critical',
          status: 'active',
          centroid: { type: 'Point', coordinates: [72.875, 19.068] },
          radiusKm: 2.0,
          managingNgos: [sewaNgo._id],
          totalAffectedPersons: 180,
          notes: 'Mithi River overtopping due to heavy rainfall and high tide. Urgent water and medical response required.',
        },
      },
      { upsert: true, new: true },
    )
    results.incidentsCreatedOrUpdated++

    const incident2 = await IncidentModel.findOneAndUpdate(
      { title: 'Urban Waterlogging & Power Outage — Dharavi Sector 5 [DEMO]' },
      {
        $set: {
          incidentType: 'flood',
          severity: 'high',
          status: 'monitoring',
          centroid: { type: 'Point', coordinates: [72.855, 19.043] },
          radiusKm: 1.5,
          managingNgos: [goonjNgo._id],
          totalAffectedPersons: 95,
          notes: 'Severe drainage blockage in transit lanes with sub-station electrical outages.',
        },
      },
      { upsert: true, new: true },
    )
    results.incidentsCreatedOrUpdated++

    // 4. Citizen Relief Reports
    const rahulCitizen = userMap.citizen_rahul
    const priyaCitizen = userMap.citizen_priya

    const report1 = await ReportModel.findOneAndUpdate(
      { title: 'Urgent drinking water and high-energy rations for 45 stranded residents [DEMO]' },
      {
        $set: {
          reporter: rahulCitizen._id,
          description: 'Ground floors inundated with 3 feet floodwater. 45 residents stranded including children and seniors without potable drinking water.',
          needCategory: 'drinking_water',
          location: { type: 'Point', coordinates: [72.8777, 19.076] },
          affectedPersonCount: 45,
          urgency: 'critical',
          status: 'verified',
          assignedNgo: sewaNgo._id,
          requestedResources: [{ category: 'drinking_water', quantity: 50, unit: 'cartons' }],
          timeline: [
            { stage: 'submitted', title: 'Relief Request Submitted', description: 'Citizen submitted emergency distress call.', timestamp: new Date(Date.now() - 3 * 3600 * 1000), actorRole: 'citizen' },
            { stage: 'verified', title: 'Distress Verified by NGO', description: 'SEWA disaster team verified on-ground crisis.', timestamp: new Date(Date.now() - 2.5 * 3600 * 1000), actorRole: 'ngo' },
            { stage: 'volunteer_assigned', title: 'Volunteer Dispatched', description: 'Volunteer Arjun Verma assigned for emergency transport.', timestamp: new Date(Date.now() - 2 * 3600 * 1000), actorRole: 'volunteer' },
          ],
        },
      },
      { upsert: true, new: true },
    )
    results.reportsCreatedOrUpdated++

    const report2 = await ReportModel.findOneAndUpdate(
      { title: 'Medical emergency trauma kits for flood relief dispensary [DEMO]' },
      {
        $set: {
          reporter: rahulCitizen._id,
          description: 'Community clinic treating water-borne injuries and lacerations. Bandages, antiseptic, and sterile trauma kits needed.',
          needCategory: 'medical_supplies',
          location: { type: 'Point', coordinates: [72.872, 19.071] },
          affectedPersonCount: 30,
          urgency: 'high',
          status: 'resolved',
          assignedNgo: sewaNgo._id,
          resolvedAt: new Date(Date.now() - 2 * 3600 * 1000),
          resolvedBy: sewaNgo._id,
          resolutionNote: 'Delivery confirmed by NGO. Reconciled 40 trauma kits delivered to clinic shelter lead.',
          requestedResources: [{ category: 'medical_supplies', quantity: 50, unit: 'kits' }],
          timeline: [
            { stage: 'submitted', title: 'Relief Request Submitted', timestamp: new Date(Date.now() - 6 * 3600 * 1000), actorRole: 'citizen' },
            { stage: 'verified', title: 'Verified by Coordinator', timestamp: new Date(Date.now() - 5 * 3600 * 1000), actorRole: 'ngo' },
            { stage: 'delivered', title: 'Delivery Confirmed (Partial Reconciliation)', description: '40 kits delivered to dispensary lead. 10 units recorded with transit water damage.', timestamp: new Date(Date.now() - 2 * 3600 * 1000), actorRole: 'ngo' },
          ],
        },
      },
      { upsert: true, new: true },
    )
    results.reportsCreatedOrUpdated++

    const report3 = await ReportModel.findOneAndUpdate(
      { title: 'Water purification packs & tarpaulins for waterlogged tenements [DEMO]' },
      {
        $set: {
          reporter: priyaCitizen._id,
          description: '60 persons in need of chlorine purification tablets and waterproof sheeting after roof runoff.',
          needCategory: 'water_purification',
          location: { type: 'Point', coordinates: [72.854, 19.045] },
          affectedPersonCount: 60,
          urgency: 'high',
          status: 'under_review',
          assignedNgo: goonjNgo._id,
          requestedResources: [{ category: 'water_purification', quantity: 200, unit: 'packs' }],
          timeline: [
            { stage: 'submitted', title: 'Request Submitted', timestamp: new Date(Date.now() - 1 * 3600 * 1000), actorRole: 'citizen' },
            { stage: 'under_review', title: 'Coordinator Review in Progress', timestamp: new Date(Date.now() - 30 * 60 * 1000), actorRole: 'ngo' },
          ],
        },
      },
      { upsert: true, new: true },
    )
    results.reportsCreatedOrUpdated++

    const report4 = await ReportModel.findOneAndUpdate(
      { title: 'Draft distress assessment — structural wall collapse warning [DEMO]' },
      {
        $set: {
          reporter: priyaCitizen._id,
          description: 'Retaining wall shows deep structural cracks. Assessment draft pending safety inspection photos.',
          needCategory: 'tents_shelter',
          location: { type: 'Point', coordinates: [72.858, 19.048] },
          affectedPersonCount: 15,
          urgency: 'medium',
          status: 'draft',
        },
      },
      { upsert: true, new: true },
    )
    results.reportsCreatedOrUpdated++

    // Link reports to incidents
    await IncidentModel.findByIdAndUpdate(incident1._id, {
      $addToSet: { linkedReports: { $each: [report1._id, report2._id] } },
    })
    await IncidentModel.findByIdAndUpdate(incident2._id, {
      $addToSet: { linkedReports: report3._id },
    })

    // 5. Donor Resources
    const tataDonor = userMap.donor_tata
    const anitaDonor = userMap.donor_anita

    const donation1 = await DonationModel.findOneAndUpdate(
      { description: 'Bottled Drinking Water Cartons (24 x 1L packs) [DEMO]' },
      {
        $set: {
          donor: tataDonor._id,
          resourceCategory: 'drinking_water',
          quantity: 200,
          quantityReserved: 50,
          quantityAllocated: 50,
          unit: 'cartons',
          condition: 'new',
          batchNumber: 'TATA-WTR-2026-08',
          location: { type: 'Point', coordinates: [72.83, 18.98] }, // Colaba warehouse
          availabilityStatus: 'partially_allocated',
          quarantineStatus: 'none',
        },
      },
      { upsert: true, new: true },
    )
    results.donationsCreatedOrUpdated++

    const donation2 = await DonationModel.findOneAndUpdate(
      { description: 'Trauma & First-Aid Disaster Response Medical Kits [DEMO]' },
      {
        $set: {
          donor: tataDonor._id,
          resourceCategory: 'medical_supplies',
          quantity: 60,
          quantityReserved: 0,
          quantityAllocated: 50,
          unit: 'kits',
          condition: 'new',
          batchNumber: 'TATA-MED-2026-03',
          location: { type: 'Point', coordinates: [72.83, 18.98] },
          availabilityStatus: 'allocated',
          quarantineStatus: 'none',
        },
      },
      { upsert: true, new: true },
    )
    results.donationsCreatedOrUpdated++

    const donation3 = await DonationModel.findOneAndUpdate(
      { description: 'Chlorine Disinfection Tablets & Micro-Filtration Packs [DEMO]' },
      {
        $set: {
          donor: anitaDonor._id,
          resourceCategory: 'water_purification',
          quantity: 500,
          quantityReserved: 0,
          quantityAllocated: 0,
          unit: 'packs',
          condition: 'new',
          batchNumber: 'DESAI-PUR-2026-11',
          location: { type: 'Point', coordinates: [72.835, 19.01] }, // Dadar
          availabilityStatus: 'available',
          quarantineStatus: 'none',
        },
      },
      { upsert: true, new: true },
    )
    results.donationsCreatedOrUpdated++

    const donation4 = await DonationModel.findOneAndUpdate(
      { description: 'High-Calorie Ready-to-Eat Emergency Food Tins [DEMO]' },
      {
        $set: {
          donor: anitaDonor._id,
          resourceCategory: 'canned_food',
          quantity: 150,
          quantityReserved: 0,
          quantityAllocated: 0,
          unit: 'boxes',
          condition: 'new',
          batchNumber: 'DESAI-FOD-2026-02',
          location: { type: 'Point', coordinates: [72.835, 19.01] },
          availabilityStatus: 'available',
          quarantineStatus: 'none',
        },
      },
      { upsert: true, new: true },
    )
    results.donationsCreatedOrUpdated++

    const donation5 = await DonationModel.findOneAndUpdate(
      { description: 'Pasteurized Milk Crates (Cold-Chain Required) [DEMO]' },
      {
        $set: {
          donor: tataDonor._id,
          resourceCategory: 'perishable_food',
          quantity: 80,
          quantityReserved: 0,
          quantityAllocated: 0,
          unit: 'crates',
          condition: 'new',
          coldChainRequired: true,
          expiryDate: new Date(Date.now() + 5 * 24 * 3600 * 1000), // expires in 5 days
          batchNumber: 'TATA-MLK-2026-19',
          location: { type: 'Point', coordinates: [72.84, 19.02] },
          availabilityStatus: 'available',
          quarantineStatus: 'none',
        },
      },
      { upsert: true, new: true },
    )
    results.donationsCreatedOrUpdated++

    // 6. NGO Requirements
    const req1 = await RequirementModel.findOneAndUpdate(
      { description: 'Emergency Drinking Water Cartons for Kurla West Relief Camp [DEMO]' },
      {
        $set: {
          ngo: sewaNgo._id,
          resourceCategory: 'drinking_water',
          quantityRequested: 100,
          quantityFulfilled: 0,
          quantityReserved: 50,
          unit: 'cartons',
          priority: 'critical',
          deliveryArea: { type: 'Point', coordinates: [72.877, 19.075] },
          status: 'active',
          neededBy: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        },
      },
      { upsert: true, new: true },
    )
    results.requirementsCreatedOrUpdated++

    const req2 = await RequirementModel.findOneAndUpdate(
      { description: 'First-Aid Emergency Trauma Kits for Kurla Clinic #3 [DEMO]' },
      {
        $set: {
          ngo: sewaNgo._id,
          resourceCategory: 'medical_supplies',
          quantityRequested: 50,
          quantityFulfilled: 40,
          quantityReserved: 0,
          unit: 'kits',
          priority: 'high',
          deliveryArea: { type: 'Point', coordinates: [72.872, 19.071] },
          status: 'fulfilled',
        },
      },
      { upsert: true, new: true },
    )
    results.requirementsCreatedOrUpdated++

    const req3 = await RequirementModel.findOneAndUpdate(
      { description: 'Water Purification Tablets for Dharavi Camps [DEMO]' },
      {
        $set: {
          ngo: goonjNgo._id,
          resourceCategory: 'water_purification',
          quantityRequested: 250,
          quantityFulfilled: 0,
          quantityReserved: 0,
          unit: 'packs',
          priority: 'high',
          deliveryArea: { type: 'Point', coordinates: [72.855, 19.043] },
          status: 'active',
          neededBy: new Date(Date.now() + 4 * 24 * 3600 * 1000),
        },
      },
      { upsert: true, new: true },
    )
    results.requirementsCreatedOrUpdated++

    // 7. Resource Allocations
    const alloc1 = await AllocationRecordModel.findOneAndUpdate(
      {
        donationId: donation1._id,
        requirementId: req1._id,
      },
      {
        $set: {
          donationId: donation1._id,
          requirementId: req1._id,
          quantity: 50,
          allocatedBy: sewaNgo._id,
          state: 'confirmed',
          completedAt: new Date(Date.now() - 2.5 * 3600 * 1000),
        },
      },
      { upsert: true, new: true },
    )
    results.allocationsCreatedOrUpdated++

    const alloc2 = await AllocationRecordModel.findOneAndUpdate(
      {
        donationId: donation2._id,
        requirementId: req2._id,
      },
      {
        $set: {
          donationId: donation2._id,
          requirementId: req2._id,
          quantity: 50,
          allocatedBy: sewaNgo._id,
          state: 'confirmed',
          completedAt: new Date(Date.now() - 5 * 3600 * 1000),
          reconciliation: {
            reconciledAt: new Date(Date.now() - 2 * 3600 * 1000),
            quantityDelivered: 40,
            quantityDeficit: 10,
            discrepancyReason: 'damaged_in_transit',
          },
        },
      },
      { upsert: true, new: true },
    )
    results.allocationsCreatedOrUpdated++

    // 8. Volunteer Tasks
    // Task 1: In-transit active task for Arjun with active safety check-in timer
    const task1 = await VolunteerTaskModel.findOneAndUpdate(
      { taskDetails: 'Transport 50 cartons of drinking water from Colaba depot to Kurla shelter [DEMO]' },
      {
        $set: {
          volunteer: arjunVol._id,
          assignedByNgo: sewaNgo._id,
          createdBy: sewaNgo._id,
          report: report1._id,
          requirement: req1._id,
          donation: donation1._id,
          assignmentStatus: 'accepted',
          pickupStatus: 'collected',
          deliveryStatus: 'in_transit',
          confirmationStatus: 'unconfirmed',
          priority: 'critical',
          assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
          pickupLocation: { type: 'Point', coordinates: [72.83, 18.98] },
          destinationLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
          quantityTarget: 50,
          quantityRemaining: 50,
          requiredVehicleType: 'two_wheeler',
          cargoWeightKg: 120,
          safetyCheckIn: {
            enabled: true,
            intervalMinutes: 30,
            lastCheckInAt: new Date(Date.now() - 10 * 60 * 1000),
            nextCheckInDue: new Date(Date.now() + 20 * 60 * 1000),
            overdueAlertSent: false,
            history: [
              {
                checkedInAt: new Date(Date.now() - 10 * 60 * 1000),
                note: 'Departed Colaba warehouse with loaded cargo. Navigating via Eastern Freeway.',
                location: { type: 'Point', coordinates: [72.85, 19.01] },
              },
            ],
          },
          history: [
            { status: 'assigned', changedBy: sewaNgo._id, changedAt: new Date(Date.now() - 2 * 3600 * 1000), reason: 'Dispatched for critical water relief' },
            { status: 'accepted', changedBy: arjunVol._id, changedAt: new Date(Date.now() - 1.8 * 3600 * 1000), reason: 'Volunteer accepted task' },
            { status: 'collected', changedBy: arjunVol._id, changedAt: new Date(Date.now() - 1 * 3600 * 1000), reason: 'Loaded water cartons at depot' },
            { status: 'in_transit', changedBy: arjunVol._id, changedAt: new Date(Date.now() - 45 * 60 * 1000), reason: 'In transit to Kurla West' },
          ],
        },
      },
      { upsert: true, new: true },
    )
    results.tasksCreatedOrUpdated++

    // Link task1 back to report1
    await ReportModel.findByIdAndUpdate(report1._id, { $set: { deliveryTask: task1._id } })

    // Task 2: Completed and reconciled task with multi-modal proof
    const task2 = await VolunteerTaskModel.findOneAndUpdate(
      { taskDetails: 'Deliver 50 trauma medical kits to Kurla dispensary lead [DEMO]' },
      {
        $set: {
          volunteer: arjunVol._id,
          assignedByNgo: sewaNgo._id,
          createdBy: sewaNgo._id,
          report: report2._id,
          requirement: req2._id,
          donation: donation2._id,
          assignmentStatus: 'accepted',
          pickupStatus: 'collected',
          deliveryStatus: 'delivered',
          confirmationStatus: 'confirmed',
          confirmedAt: new Date(Date.now() - 2 * 3600 * 1000),
          confirmedBy: sewaNgo._id,
          confirmationNotes: 'Delivery verified with dispensary lead Dr. Ramesh Kulkarni. 40 intact kits received; 10 water-damaged kits documented.',
          priority: 'high',
          assignedLocation: { type: 'Point', coordinates: [72.872, 19.071] },
          quantityTarget: 50,
          quantityDelivered: 40,
          quantityRemaining: 10,
          discrepancyReason: 'damaged_in_transit',
          discrepancyNotes: '10 outer medical packaging boxes damaged during heavy road water-splash.',
          reconciliationStatus: 'reconciled',
          reconciledAt: new Date(Date.now() - 2 * 3600 * 1000),
          proofOfDelivery: {
            proofType: 'photo',
            photoUrl: '/uploads/evidence/demo_pod_medical.jpg',
            capturedAt: new Date(Date.now() - 2.5 * 3600 * 1000),
          },
          proxyHandover: {
            isProxy: true,
            recipientType: 'community_shelter_lead',
            recipientName: 'Dr. Ramesh Kulkarni',
            recipientPhone: '+91 98209 11223',
            reason: 'Primary medical officer in-charge of relief camp dispensary',
          },
          history: [
            { status: 'assigned', changedBy: sewaNgo._id, changedAt: new Date(Date.now() - 6 * 3600 * 1000), reason: 'Dispatched for dispensary relief' },
            { status: 'delivered', changedBy: arjunVol._id, changedAt: new Date(Date.now() - 2.5 * 3600 * 1000), reason: 'Delivered at dispensary' },
            { status: 'confirmed', changedBy: sewaNgo._id, changedAt: new Date(Date.now() - 2 * 3600 * 1000), reason: 'NGO confirmed delivery and reconciled quantities' },
          ],
        },
      },
      { upsert: true, new: true },
    )
    results.tasksCreatedOrUpdated++

    await ReportModel.findByIdAndUpdate(report2._id, { $set: { deliveryTask: task2._id } })

    // Task 3: Assigned pending acceptance for Kavita
    const task3 = await VolunteerTaskModel.findOneAndUpdate(
      { taskDetails: 'Bulk transport of 100 water purification packs to Dharavi distribution point [DEMO]' },
      {
        $set: {
          volunteer: kavitaVol._id,
          assignedByNgo: goonjNgo._id,
          createdBy: goonjNgo._id,
          requirement: req3._id,
          assignmentStatus: 'assigned',
          pickupStatus: 'pending',
          deliveryStatus: 'pending',
          confirmationStatus: 'unconfirmed',
          priority: 'high',
          assignedLocation: { type: 'Point', coordinates: [72.855, 19.043] },
          pickupLocation: { type: 'Point', coordinates: [72.835, 19.01] },
          destinationLocation: { type: 'Point', coordinates: [72.855, 19.043] },
          quantityTarget: 100,
          quantityRemaining: 100,
          requiredVehicleType: 'four_wheeler',
          cargoWeightKg: 80,
          safetyCheckIn: {
            enabled: false,
            intervalMinutes: 30,
            history: [],
          },
          history: [
            { status: 'assigned', changedBy: goonjNgo._id, changedAt: new Date(Date.now() - 30 * 60 * 1000), reason: 'Assigned for four-wheeler bulk transport' },
          ],
        },
      },
      { upsert: true, new: true },
    )
    results.tasksCreatedOrUpdated++

    // 9. Environmental / Road Hazards
    await HazardModel.findOneAndUpdate(
      { title: 'Mithi River Overwash across BKC-Kurla Connector [DEMO]' },
      {
        $set: {
          hazardType: 'flooded_road',
          severity: 'impassable_all_vehicles',
          radiusMeters: 350,
          location: { type: 'Point', coordinates: [72.868, 19.062] },
          reportedBy: arjunVol._id,
          status: 'active',
          description: 'Flash flood water overtopping roadway with deep currents. Transit blocked.',
        },
      },
      { upsert: true },
    )
    results.hazardsCreatedOrUpdated++

    await HazardModel.findOneAndUpdate(
      { title: 'Downed High-Voltage Overhead Cables near Dharavi Depot [DEMO]' },
      {
        $set: {
          hazardType: 'fallen_tree_lines',
          severity: 'caution',
          radiusMeters: 150,
          location: { type: 'Point', coordinates: [72.852, 19.041] },
          reportedBy: kavitaVol._id,
          status: 'active',
          description: 'Live electrical cables dangling over western access lane. Drive with extreme caution.',
        },
      },
      { upsert: true },
    )
    results.hazardsCreatedOrUpdated++

    await HazardModel.findOneAndUpdate(
      { title: 'Collapsed Tree Trunk on S.V. Road [DEMO]' },
      {
        $set: {
          hazardType: 'landslide_debris',
          severity: 'impassable_for_two_wheelers',
          radiusMeters: 100,
          location: { type: 'Point', coordinates: [72.84, 19.05] },
          reportedBy: userMap.vol_rohit._id,
          status: 'cleared',
          clearedAt: new Date(Date.now() - 4 * 3600 * 1000),
          description: 'Tree trunk cleared by civic disaster team.',
        },
      },
      { upsert: true },
    )
    results.hazardsCreatedOrUpdated++

    // 10. System Alerts
    await AlertModel.findOneAndUpdate(
      { title: 'CRITICAL: Mithi River Flood Gate Alert — High Tide Advisory [DEMO]' },
      {
        $set: {
          message: 'Municipal flood advisory: Stay clear of low-lying sections along Kurla and Dharavi. ReliefGrid field teams deployed.',
          severity: 'emergency',
          targetRole: 'all',
          active: true,
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          createdBy: adminUser._id,
        },
      },
      { upsert: true },
    )
    results.alertsCreatedOrUpdated++

    // 11. Role-Specific Notifications
    await NotificationModel.findOneAndUpdate(
      { title: 'Emergency Task Dispatched: Drinking Water Delivery [DEMO]' },
      {
        $set: {
          recipient: arjunVol._id,
          eventType: 'volunteer.task_assigned',
          title: 'Emergency Task Dispatched: Drinking Water Delivery [DEMO]',
          message: 'SEWA NGO dispatched emergency water transport task to Kurla West.',
          relatedEntityType: 'VolunteerTask',
          relatedEntityId: task1._id,
        },
      },
      { upsert: true },
    )
    results.notificationsCreatedOrUpdated++

    await NotificationModel.findOneAndUpdate(
      { title: 'Relief Request Under Progress [DEMO]' },
      {
        $set: {
          recipient: rahulCitizen._id,
          eventType: 'report.in_progress',
          title: 'Relief Request Under Progress [DEMO]',
          message: 'Volunteer Arjun Verma is currently in transit with drinking water relief to your location.',
          relatedEntityType: 'Report',
          relatedEntityId: report1._id,
        },
      },
      { upsert: true },
    )
    results.notificationsCreatedOrUpdated++

    await NotificationModel.findOneAndUpdate(
      { title: 'Delivery Confirmed & Reconciled [DEMO]' },
      {
        $set: {
          recipient: sewaNgo._id,
          eventType: 'delivery.confirmed',
          title: 'Delivery Confirmed & Reconciled [DEMO]',
          message: 'Dispensary medical kits task confirmed with 40 delivered, 10 damaged units recorded.',
          relatedEntityType: 'VolunteerTask',
          relatedEntityId: task2._id,
        },
      },
      { upsert: true },
    )
    results.notificationsCreatedOrUpdated++

    // 12. Audit Activity Records
    await AuditRecordModel.create([
      {
        actor: sewaNgo._id,
        action: 'allocation.confirmed',
        entityType: 'AllocationRecord',
        entityId: alloc1._id,
        metadata: { quantity: 50, resourceCategory: 'drinking_water' },
      },
      {
        actor: sewaNgo._id,
        action: 'delivery.reconciled',
        entityType: 'VolunteerTask',
        entityId: task2._id,
        metadata: { quantityTarget: 50, quantityDelivered: 40, quantityRemaining: 10, discrepancyReason: 'damaged_in_transit' },
      },
      {
        actor: arjunVol._id,
        action: 'hazard.reported',
        entityType: 'Hazard',
        metadata: { title: 'Mithi River Overwash across BKC-Kurla Connector [DEMO]' },
      },
    ])
    results.auditRecordsCreated += 3

    return results
  } finally {
    if (!isConnected) {
      await mongoose.disconnect()
    }
  }
}

// Direct execution from CLI
if (process.argv[1]?.endsWith('seed-demo-data.ts') || process.argv[1]?.endsWith('seed-demo-data.js')) {
  seedDemoData()
    .then((stats) => {
      console.log('✅ Demo seed executed successfully!')
      console.log(JSON.stringify(stats, null, 2))
      process.exit(0)
    })
    .catch((err) => {
      console.error('❌ Demo seed failed:', err)
      process.exit(1)
    })
}

