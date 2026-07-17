/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  SECTOR_TEAM = 'sector_team',
  UNIT_TEAM_LEADER = 'unit_team_leader'
}

export interface User {
  id: string;
  fullName: string;
  username: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  assignedUnitId?: string; // For unit_team_leader
  active: boolean;
  mustChangePassword?: boolean;
  failedLoginAttempts: number;
  lockedUntil?: string; // ISO string
  lastLoginAt?: string; // ISO string
  passwordChangedAt?: string; // ISO string
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  sessionTokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivityAt: string;
}

export interface LoginAudit {
  id: string;
  username: string;
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  actorUsername?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  assignedUnitId?: string;
  previousData?: string; // JSON string
  newData?: string; // JSON string
  timestamp: string;
}

export interface Unit {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

export enum EducationStatus {
  STUDENT = 'student',
  UNDERGRADUATE = 'undergraduate',
  POSTGRADUATE = 'postgraduate'
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female'
}

export interface Category {
  id: string;
  name: string;
  dobStart: string; // YYYY-MM-DD
  dobEnd: string; // YYYY-MM-DD
  educationRequirements?: EducationStatus[];
  active: boolean;
}

export enum ParticipationType {
  INDIVIDUAL = 'individual',
  GROUP = 'group'
}

export enum StageType {
  ON_STAGE = 'on_stage',
  OFF_STAGE = 'off_stage'
}

export interface Competition {
  id: string;
  name: string;
  categoryId: string; // References Category
  language?: string;
  participationType: ParticipationType;
  teamSize: number; // For group events, defaults to 1 for individual
  duration: number; // in minutes
  stageType: StageType;
  displayOrder: number;
  active: boolean;
}

export interface Participant {
  id: string;
  fullName: string;
  dob: string; // YYYY-MM-DD
  unitId: string; // References Unit
  gender: Gender;
  educationStatus: EducationStatus;
  institution?: string;
  course?: string;
  yearSemester?: string;
  selectedCategoryId: string; // References Category
  phone?: string;
  guardianPhone?: string;
  address?: string;
  notes?: string;
  profilePhoto?: string;
  active: boolean;
  
  // Soft delete fields
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface Registration {
  id: string;
  participantId: string; // References Participant
  categoryId: string; // References Category
  selectedIndividualCompetitionIds: string[]; // References Competition
  selectedGroupTeamIds: string[]; // References Team
  registrationStatus: string; // 'pending', 'confirmed'
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  teamNumber: string; // Auto-generated e.g. "T-001" or "Nekkila-Burda-1"
  teamName?: string; // Custom team name
  unitId: string; // References Unit
  categoryId: string; // References Category
  competitionId: string; // References Competition
  memberIds: string[]; // References Participant
  
  // Soft delete fields
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  
  createdAt: string;
  updatedAt: string;
}

export enum ResultStatus {
  PARTICIPATED = 'participated',
  NOT_PARTICIPATED = 'not_participated',
  ABSENT = 'absent',
  DISQUALIFIED = 'disqualified',
  RESULT_PENDING = 'result_pending'
}

export interface Result {
  id: string;
  categoryId: string; // References Category
  competitionId: string; // References Competition
  participantId?: string; // References Participant (for individual)
  teamId?: string; // References Team (for group)
  judge1Mark: number;
  judge2Mark: number;
  totalMark: number;
  rank?: number; // Calculated rank (1, 2, 3...)
  status: ResultStatus;
  remarks?: string;
  publishedStatus: boolean;
  manualRankOverride?: boolean;
  manualRankOverrideReason?: string;
  
  // Soft delete fields
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventSettings {
  eventTitle: string;
  sectorName: string;
  eventYear: string;
  cutoffDate: string; // YYYY-MM-DD, default "2026-05-01"
  eventDate?: string;
  venue?: string;
  contactInfo?: string;
  
  // Registration limits
  maxIndividualEvents: number; // default 3
  maxGroupEvents: number; // default 2
  registrationOpen: boolean;
  
  // Branding
  ssfLogoUrl: string;
  sahityotsavLogoUrl: string;
  primaryColor: string; // e.g. "emerald" or HEX
  accentColor: string; // e.g. "amber" or HEX
  headerBannerUrl?: string;
  
  // Result configuration
  numJudges: number; // default 2
  markDecimalPrecision: number; // default 2
  autoRankingEnabled: boolean;
}
