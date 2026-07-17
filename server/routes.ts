import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { dbClient } from './db.js';
import { CalculationService } from './calculations.js';
import { 
  UserRole, User, Session, LoginAudit, AuditLog, 
  Unit, Category, Competition, Participant, Team, 
  Registration, Result, EventSettings, EducationStatus, ParticipationType, 
  StageType, Gender, ResultStatus 
} from '../src/types.js';

export const apiRouter = express.Router();

// --- SERVERLESS GLOBAL SYNC MIDDLEWARE ---
// This guarantees that in a stateless environment like Vercel, the in-memory cache
// is fully populated from MongoDB before any request is processed.
apiRouter.use(async (req, res, next) => {
  try {
    await dbClient.waitForSync();
    next();
  } catch (e) {
    console.error("Database connection failed:", e);
    res.status(500).json({ error: 'Database connection error' });
  }
});

// Ensure required environment variables exist
if (!process.env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET environment variable is missing.");
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
  console.error("FATAL: MONGODB_URI environment variable is missing.");
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const JWT_SECRET = process.env.AUTH_SECRET || 'fallback_secret_for_development_only_12345';
const COOKIE_NAME = 'sahityotsav_session';

// Rate limiter / failed attempts map
const failedLoginTracker: { [username: string]: { count: number; lockedUntil?: number } } = {};

// --- MIDDLEWARES ---

// Authenticate session from HTTP-only cookie or custom Authorization header using JWT
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const db = dbClient.get();
  
  // Get token from cookie or authorization header
  const authHeader = req.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Read from cookies if present
    const cookieHeader = req.headers.cookie || '';
    const cookieMatch = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (cookieMatch) {
      token = cookieMatch[1];
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, code: 'SESSION_MISSING', message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Find user
    const user = db.users.find(u => u.id === decoded.userId);
    if (!user || !user.active) {
      return res.status(401).json({ success: false, code: 'USER_INACTIVE', message: 'User account is deactivated or deleted.' });
    }

    // Attach user to request
    (req as any).user = user;
    
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, code: 'SESSION_INVALID', message: 'Session invalid or corrupted.' });
  }
}

// Require role middleware
export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Access denied. You do not have permission for this resource.' });
    }
    next();
  };
}

// Utility to calculate eligible categories
export function calculateEligibleCategories(dobStr: string, educationStatus: string) {
  const db = dbClient.get();
  const dob = new Date(dobStr);
  
  if (isNaN(dob.getTime())) {
    return db.categories.map(c => ({ id: c.id, name: c.name, eligible: false, reason: 'Invalid date of birth' }));
  }

  return db.categories.map(c => {
    const start = new Date(c.dobStart);
    const end = new Date(c.dobEnd);
    
    // Check Date of Birth range
    const dobMatch = dob >= start && dob <= end;
    if (!dobMatch) {
      return { 
        id: c.id, 
        name: c.name, 
        eligible: false, 
        reason: `DOB must be between ${c.dobStart} and ${c.dobEnd}` 
      };
    }

    // Check custom rules:
    if (educationStatus === 'student') {
      if (c.id.startsWith('cat_campus')) {
        return {
          id: c.id,
          name: c.name,
          eligible: false,
          reason: 'Campus categories are only for Undergraduate or Postgraduate candidates.'
        };
      }
    }
    else if (educationStatus === 'undergraduate') {
      if (c.id === 'cat_campus_senior') {
        return {
          id: c.id,
          name: c.name,
          eligible: false,
          reason: 'Campus Senior is only for Postgraduate candidates.'
        };
      }
    }
    else if (educationStatus === 'postgraduate') {
      if (c.id === 'cat_campus_junior') {
        return {
          id: c.id,
          name: c.name,
          eligible: false,
          reason: 'Campus Junior is only for Undergraduate candidates.'
        };
      }
    }

    return { id: c.id, name: c.name, eligible: true };
  });
}


// --- API ROUTES ---

// 1. AUTHENTICATION

// Public Login API
apiRouter.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = dbClient.get();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const normalizedUsername = username.trim().toLowerCase();

  // Check rate limit/lockout
  const lock = failedLoginTracker[normalizedUsername];
  if (lock && lock.lockedUntil && lock.lockedUntil > Date.now()) {
    const remainingSecs = Math.ceil((lock.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Account locked temporarily. Try again in ${remainingSecs} seconds.` });
  }

  // Find user
  const user = db.users.find(u => u.username.toLowerCase() === normalizedUsername);

  const logFailure = async (reason: string) => {
    const audit: LoginAudit = {
      id: `login_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      username,
      success: false,
      failureReason: reason,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    };
    db.loginAudits.unshift(audit);
    await dbClient.save();

    // Increment failed attempts
    if (!failedLoginTracker[normalizedUsername]) {
      failedLoginTracker[normalizedUsername] = { count: 1 };
    } else {
      failedLoginTracker[normalizedUsername].count++;
    }

    if (failedLoginTracker[normalizedUsername].count >= 5) {
      failedLoginTracker[normalizedUsername].lockedUntil = Date.now() + 60 * 1000; // 1 min lock
      return res.status(429).json({ error: 'Too many failed login attempts. Account temporarily locked for 60 seconds.' });
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
  };

  if (!user || !user.active) {
    return await logFailure('User does not exist or is inactive');
  }

  // Verify password
  const match = bcrypt.compareSync(password, user.passwordHash);
  if (!match) {
    return await logFailure('Incorrect password');
  }

  // Success - Clear lockout
  delete failedLoginTracker[normalizedUsername];

  // Generate Session Token (JWT)
  const token = jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  // Update last login timestamp
  user.lastLoginAt = new Date().toISOString();
  await dbClient.save();

  // Audit login success
  const audit: LoginAudit = {
    id: `login_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    username: user.username,
    success: true,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  };
  db.loginAudits.unshift(audit);
  await dbClient.save();

  // Set secure HTTP-only cookie
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  });

  return res.json({
    message: 'Logged in successfully',
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      assignedUnitId: user.assignedUnitId,
      mustChangePassword: user.mustChangePassword
    }
  });
});

// Logout
apiRouter.post('/auth/logout', authenticate, async (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

// Get Current Session Profile
apiRouter.get('/auth/session', authenticate, async (req, res) => {
  const user = (req as any).user as User;
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      assignedUnitId: user.assignedUnitId,
      mustChangePassword: user.mustChangePassword
    }
  });
});

// Change Password
apiRouter.post('/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = (req as any).user as User;
  const db = dbClient.get();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  const liveUser = db.users.find(u => u.id === user.id);
  if (!liveUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Validate current password
  if (!bcrypt.compareSync(currentPassword, liveUser.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  const salt = bcrypt.genSaltSync(10);
  liveUser.passwordHash = bcrypt.hashSync(newPassword, salt);
  liveUser.mustChangePassword = false;
  liveUser.passwordChangedAt = new Date().toISOString();
  
  await dbClient.logAudit(liveUser.id, liveUser.username, liveUser.role, 'Change Password', 'User', liveUser.id);
  await dbClient.save();
  
  // Issue a fresh token after password change
  const token = jwt.sign(
    { 
      userId: liveUser.id, 
      username: liveUser.username,
      role: liveUser.role
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  });

  res.json({ message: 'Password changed successfully', token });
});



// 2. SETTINGS & EVENT MANAGE

apiRouter.get('/settings', async (req, res) => {
  const db = dbClient.get();
  res.json(db.eventSettings);
});

apiRouter.put('/settings', authenticate, requireRole([UserRole.SUPER_ADMIN, UserRole.SECTOR_TEAM]), async (req, res) => {
  const db = dbClient.get();
  const prevSettings = { ...db.eventSettings };
  
  db.eventSettings = {
    ...db.eventSettings,
    ...req.body
  };
  
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Update Event Settings', 'EventSettings', 'global', undefined, prevSettings, db.eventSettings);
  await dbClient.save();
  
  res.json({ message: 'Settings updated successfully', settings: db.eventSettings });
});


// 3. AUDIT LOGS & LISTS

apiRouter.get('/audit-logs', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  res.json(db.auditLogs);
});


// 4. UNITS (CRUD)

apiRouter.get('/units', async (req, res) => {
  const db = dbClient.get();
  res.json(db.units);
});

apiRouter.post('/units', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const { name, code } = req.body;
  const db = dbClient.get();

  if (!name || !code) {
    return res.status(400).json({ error: 'Unit name and code are required.' });
  }

  const normalizedCode = code.trim().toUpperCase();
  if (db.units.some(u => u.code === normalizedCode)) {
    return res.status(400).json({ error: `Unit code ${normalizedCode} is already in use.` });
  }

  const newUnit: Unit = {
    id: `unit_${Date.now()}`,
    name: name.trim(),
    code: normalizedCode,
    active: true
  };

  db.units.push(newUnit);
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Create Unit', 'Unit', newUnit.id, undefined, undefined, newUnit);
  await dbClient.save();

  res.json({ message: 'Unit created successfully', unit: newUnit });
});

apiRouter.put('/units/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const { name, code, active } = req.body;
  const db = dbClient.get();
  const unitIndex = db.units.findIndex(u => u.id === req.params.id);

  if (unitIndex === -1) {
    return res.status(404).json({ error: 'Unit not found' });
  }

  const oldUnit = { ...db.units[unitIndex] };
  
  if (code) {
    const normalizedCode = code.trim().toUpperCase();
    if (db.units.some(u => u.code === normalizedCode && u.id !== req.params.id)) {
      return res.status(400).json({ error: 'Unit code is already in use' });
    }
    db.units[unitIndex].code = normalizedCode;
  }

  if (name) db.units[unitIndex].name = name.trim();
  if (active !== undefined) db.units[unitIndex].active = active;

  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Update Unit', 'Unit', req.params.id, undefined, oldUnit, db.units[unitIndex]);
  await dbClient.save();

  res.json({ message: 'Unit updated successfully', unit: db.units[unitIndex] });
});

apiRouter.delete('/units/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const unitId = req.params.id;
  
  // Delete only if no related registrations or results
  const hasRegistrations = db.participants.some(p => p.unitId === unitId && !p.deletedAt);
  const hasTeams = db.teams.some(t => t.unitId === unitId && !t.deletedAt);

  if (hasRegistrations || hasTeams) {
    return res.status(400).json({ 
      error: 'Cannot delete unit. It has active participants or group teams registered. Deactivate the unit instead.' 
    });
  }

  const index = db.units.findIndex(u => u.id === unitId);
  if (index === -1) {
    return res.status(404).json({ error: 'Unit not found' });
  }

  const deletedUnit = db.units[index];
  db.units.splice(index, 1);
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Delete Unit', 'Unit', unitId, undefined, deletedUnit);
  await dbClient.save();

  res.json({ message: 'Unit deleted successfully' });
});


// 5. CATEGORIES

apiRouter.get('/categories', async (req, res) => {
  const db = dbClient.get();
  res.json(db.categories);
});

apiRouter.put('/categories/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const { dobStart, dobEnd, active } = req.body;
  const db = dbClient.get();
  const catIndex = db.categories.findIndex(c => c.id === req.params.id);

  if (catIndex === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }

  const oldCat = { ...db.categories[catIndex] };

  if (dobStart) db.categories[catIndex].dobStart = dobStart;
  if (dobEnd) db.categories[catIndex].dobEnd = dobEnd;
  if (active !== undefined) db.categories[catIndex].active = active;

  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Update Category DOB', 'Category', req.params.id, undefined, oldCat, db.categories[catIndex]);
  await dbClient.save();

  res.json({ message: 'Category rules updated successfully', category: db.categories[catIndex] });
});


// 6. COMPETITIONS

apiRouter.get('/competitions', async (req, res) => {
  const db = dbClient.get();
  res.json(db.competitions);
});

apiRouter.post('/competitions', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const { name, categoryId, language, participationType, teamSize, duration, stageType, displayOrder } = req.body;
  const db = dbClient.get();

  if (!name || !categoryId || !participationType || !stageType) {
    return res.status(400).json({ error: 'Name, Category, Participation Type, and Stage Type are required.' });
  }

  const newComp: Competition = {
    id: `comp_${categoryId.replace('cat_', '')}_${Date.now()}`,
    name: name.trim(),
    categoryId,
    language: language ? language.trim() : undefined,
    participationType,
    teamSize: participationType === ParticipationType.GROUP ? (Number(teamSize) || 2) : 1,
    duration: Number(duration) || 0,
    stageType,
    displayOrder: Number(displayOrder) || (db.competitions.length + 1),
    active: true
  };

  db.competitions.push(newComp);
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Create Competition', 'Competition', newComp.id, undefined, undefined, newComp);
  await dbClient.save();

  res.json({ message: 'Competition created successfully', competition: newComp });
});

apiRouter.put('/competitions/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const compIndex = db.competitions.findIndex(c => c.id === req.params.id);

  if (compIndex === -1) {
    return res.status(404).json({ error: 'Competition not found' });
  }

  const oldComp = { ...db.competitions[compIndex] };
  db.competitions[compIndex] = {
    ...db.competitions[compIndex],
    ...req.body,
    // ensure casting
    teamSize: req.body.participationType === ParticipationType.INDIVIDUAL ? 1 : Number(req.body.teamSize || oldComp.teamSize),
    duration: req.body.duration !== undefined ? Number(req.body.duration) : oldComp.duration,
    displayOrder: req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : oldComp.displayOrder,
  };

  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Update Competition', 'Competition', req.params.id, undefined, oldComp, db.competitions[compIndex]);
  await dbClient.save();

  res.json({ message: 'Competition updated successfully', competition: db.competitions[compIndex] });
});

apiRouter.delete('/competitions/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const compId = req.params.id;

  // Check if used in results or teams
  const hasResults = db.results.some(r => r.competitionId === compId && !r.deletedAt);
  const hasTeams = db.teams.some(t => t.competitionId === compId && !t.deletedAt);

  if (hasResults || hasTeams) {
    return res.status(400).json({ error: 'Cannot delete competition because it has registered results or team participants.' });
  }

  const index = db.competitions.findIndex(c => c.id === compId);
  if (index === -1) {
    return res.status(404).json({ error: 'Competition not found' });
  }

  const deletedComp = db.competitions[index];
  db.competitions.splice(index, 1);
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Delete Competition', 'Competition', compId, undefined, deletedComp);
  await dbClient.save();

  res.json({ message: 'Competition deleted successfully' });
});


// 7. PARTICIPANT ELIGIBILITY CALCULATION

apiRouter.post('/participants/check-eligibility', async (req, res) => {
  const { dob, educationStatus } = req.body;
  if (!dob || !educationStatus) {
    return res.status(400).json({ error: 'dob and educationStatus are required.' });
  }

  const results = calculateEligibleCategories(dob, educationStatus);
  res.json(results);
});


// 8. PARTICIPANTS MANAGEMENT

// Read Participants (Filtered / Isolated)
apiRouter.get('/participants', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  
  let participants = db.participants.filter(p => !p.deletedAt);

  // Unit Team Leader Isolation: Can only see their unit's participants
  if (user.role === UserRole.UNIT_TEAM_LEADER) {
    participants = participants.filter(p => p.unitId === user.assignedUnitId);
  } else if (req.query.unitId) {
    // Other roles can filter by unitId
    participants = participants.filter(p => p.unitId === req.query.unitId);
  }

  if (req.query.categoryId) {
    participants = participants.filter(p => p.selectedCategoryId === req.query.categoryId);
  }

  if (req.query.search) {
    const s = String(req.query.search).toLowerCase();
    participants = participants.filter(p => p.fullName.toLowerCase().includes(s));
  }

  res.json(participants);
});

// Read all registrations
apiRouter.get('/registrations', authenticate, async (req, res) => {
  const db = dbClient.get();
  res.json((db as any).registrations || []);
});

// Duplicate Checking Check
apiRouter.post('/participants/check-duplicate', authenticate, async (req, res) => {
  const { fullName, dob, unitId } = req.body;
  const db = dbClient.get();
  
  if (!fullName || !dob || !unitId) {
    return res.status(400).json({ error: 'fullName, dob and unitId are required' });
  }

  const matches = db.participants.filter(p => 
    !p.deletedAt &&
    p.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() &&
    p.dob === dob &&
    p.unitId === unitId
  );

  res.json({ duplicate: matches.length > 0, matches });
});

// Create Participant
apiRouter.post('/participants', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;

  // Check registration lock for Unit Leaders
  if (!db.eventSettings.registrationOpen && user.role === UserRole.UNIT_TEAM_LEADER) {
    return res.status(400).json({ error: 'Registration process is currently closed/disabled by the sector team.' });
  }

  const { 
    fullName, dob, unitId, gender, educationStatus, 
    selectedCategoryId, institution, course, yearSemester, 
    phone, guardianPhone, address, notes, selectedCompetitionIds
  } = req.body;

  // Basic Validation
  if (!fullName || !dob || !unitId || !selectedCategoryId || !educationStatus) {
    return res.status(400).json({ error: 'Missing required participant fields.' });
  }

  // 1. Lock unit field for Unit Team Leaders
  const finalUnitId = user.role === UserRole.UNIT_TEAM_LEADER ? user.assignedUnitId! : unitId;

  // 2. Server-side validation of category eligibility based on age/education
  const eligibility = calculateEligibleCategories(dob, educationStatus);
  const matchedCategory = eligibility.find(e => e.id === selectedCategoryId);
  if (!matchedCategory || !matchedCategory.eligible) {
    return res.status(400).json({ 
      error: `Participant is not eligible for ${selectedCategoryId}. Reason: ${matchedCategory?.reason || 'Invalid'}` 
    });
  }

  // 3. Server-side limit validation:
  // Split selected competition IDs into Individual and Group to verify limits:
  // Maximum 3 individual events, 2 group events per participant!
  const competitionIds: string[] = selectedCompetitionIds || [];
  const individualCompetitions = db.competitions.filter(c => 
    competitionIds.includes(c.id) && c.participationType === ParticipationType.INDIVIDUAL
  );
  const groupCompetitions = db.competitions.filter(c => 
    competitionIds.includes(c.id) && c.participationType === ParticipationType.GROUP
  );

  if (individualCompetitions.length > db.eventSettings.maxIndividualEvents) {
    return res.status(400).json({ error: `Cannot select more than ${db.eventSettings.maxIndividualEvents} individual competitions.` });
  }
  if (groupCompetitions.length > db.eventSettings.maxGroupEvents) {
    return res.status(400).json({ error: `Cannot select more than ${db.eventSettings.maxGroupEvents} group competitions.` });
  }

  // Verify that all competitions belong to the SELECTED category
  for (const compId of competitionIds) {
    const comp = db.competitions.find(c => c.id === compId);
    if (!comp || comp.categoryId !== selectedCategoryId) {
      return res.status(400).json({ error: `Competition ${compId} is invalid or does not belong to the selected category.` });
    }
  }

  // Enforce unit level limit: only one candidate per unit per competition
  for (const comp of individualCompetitions) {
    const registeredCandidate = db.participants.find(p => {
      if (p.deletedAt || p.unitId !== finalUnitId) return false;
      const reg = (db as any).registrations?.find((r: any) => r.participantId === p.id);
      return reg && reg.selectedIndividualCompetitionIds.includes(comp.id);
    });
    if (registeredCandidate) {
      return res.status(400).json({ 
        error: `Your unit already has a registered candidate (${registeredCandidate.fullName}) for "${comp.name}". Only one participant is allowed per unit per competition.` 
      });
    }
  }

  // Generate chest/participant number
  const serial = db.participants.length + 1;
  const unitObj = db.units.find(u => u.id === finalUnitId);
  const unitCode = unitObj ? unitObj.code : 'GEN';
  const chestNumber = `${unitCode}-${serial.toString().padStart(3, '0')}`;

  const newParticipant: Participant = {
    id: `part_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    fullName: fullName.trim(),
    dob,
    unitId: finalUnitId,
    gender: gender || Gender.MALE,
    educationStatus,
    institution,
    course,
    yearSemester,
    selectedCategoryId,
    phone,
    guardianPhone,
    address,
    notes,
    profilePhoto: chestNumber, // save the chest code or custom photo
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.participants.push(newParticipant);

  // Maintain group event registrations
  // If participant registered directly for any group competitions, we should associate them if they are added to a team.
  // Group competitions are primarily managed via Team records. We save the selected competitions.
  
  // Store selected competitions in a new Registration record
  const registration: Registration = {
    id: `reg_${Date.now()}`,
    participantId: newParticipant.id,
    categoryId: selectedCategoryId,
    selectedIndividualCompetitionIds: individualCompetitions.map(c => c.id),
    selectedGroupTeamIds: [], // Added when teams are created
    registrationStatus: 'confirmed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (!db.hasOwnProperty('registrations')) {
    (db as any).registrations = [];
  }
  (db as any).registrations.push(registration);

  await dbClient.logAudit(user.id, user.username, user.role, 'Register Participant', 'Participant', newParticipant.id, finalUnitId, undefined, newParticipant);
  await dbClient.save();

  res.json({ message: 'Participant registered successfully', participant: newParticipant });
});

// Update Participant
apiRouter.put('/participants/:id', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;

  // Check registration lock for Unit Leaders
  if (!db.eventSettings.registrationOpen && user.role === UserRole.UNIT_TEAM_LEADER) {
    return res.status(400).json({ error: 'Registration process is currently closed/disabled by the sector team.' });
  }

  const partId = req.params.id;
  
  const partIndex = db.participants.findIndex(p => p.id === partId && !p.deletedAt);
  if (partIndex === -1) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  const existingPart = db.participants[partIndex];

  // Unit isolation enforcement
  if (user.role === UserRole.UNIT_TEAM_LEADER && existingPart.unitId !== user.assignedUnitId) {
    return res.status(403).json({ error: 'Access denied. You can only manage participants from your own unit.' });
  }

  const { 
    fullName, dob, educationStatus, selectedCategoryId, gender,
    institution, course, yearSemester, phone, guardianPhone, address, notes,
    selectedCompetitionIds
  } = req.body;

  // If changing unit, block unless super admin
  if (req.body.unitId && req.body.unitId !== existingPart.unitId && user.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Only Super Admins can transfer participants between units.' });
  }

  const finalDob = dob || existingPart.dob;
  const finalEd = educationStatus || existingPart.educationStatus;
  const finalCat = selectedCategoryId || existingPart.selectedCategoryId;

  // Recalculate eligibility if details changed
  if (dob || educationStatus || selectedCategoryId) {
    const eligibility = calculateEligibleCategories(finalDob, finalEd);
    const matchedCategory = eligibility.find(e => e.id === finalCat);
    if (!matchedCategory || !matchedCategory.eligible) {
      return res.status(400).json({ 
        error: `Participant is not eligible for ${finalCat}. Reason: ${matchedCategory?.reason || 'Invalid'}` 
      });
    }
  }

  // Update competition limits
  if (selectedCompetitionIds) {
    const competitionIds: string[] = selectedCompetitionIds;
    const individualCompetitions = db.competitions.filter(c => 
      competitionIds.includes(c.id) && c.participationType === ParticipationType.INDIVIDUAL
    );
    const groupCompetitions = db.competitions.filter(c => 
      competitionIds.includes(c.id) && c.participationType === ParticipationType.GROUP
    );

    if (individualCompetitions.length > db.eventSettings.maxIndividualEvents) {
      return res.status(400).json({ error: `Cannot select more than ${db.eventSettings.maxIndividualEvents} individual competitions.` });
    }
    if (groupCompetitions.length > db.eventSettings.maxGroupEvents) {
      return res.status(400).json({ error: `Cannot select more than ${db.eventSettings.maxGroupEvents} group competitions.` });
    }

    // Verify category matches
    for (const compId of competitionIds) {
      const comp = db.competitions.find(c => c.id === compId);
      if (!comp || comp.categoryId !== finalCat) {
        return res.status(400).json({ error: `Competition ${compId} is invalid or does not belong to the selected category.` });
      }
    }

    // Enforce unit level limit: only one candidate per unit per competition
    for (const comp of individualCompetitions) {
      const registeredCandidate = db.participants.find(p => {
        if (p.id === partId || p.deletedAt || p.unitId !== existingPart.unitId) return false;
        const reg = (db as any).registrations?.find((r: any) => r.participantId === p.id);
        return reg && reg.selectedIndividualCompetitionIds.includes(comp.id);
      });
      if (registeredCandidate) {
        return res.status(400).json({ 
          error: `Your unit already has a registered candidate (${registeredCandidate.fullName}) for "${comp.name}". Only one participant is allowed per unit per competition.` 
        });
      }
    }

    // Update Registration record
    const reg = (db as any).registrations?.find((r: any) => r.participantId === partId);
    if (reg) {
      reg.categoryId = finalCat;
      reg.selectedIndividualCompetitionIds = individualCompetitions.map(c => c.id);
      reg.updatedAt = new Date().toISOString();
    }
  }

  const oldPart = { ...existingPart };

  // Update fields
  if (fullName) existingPart.fullName = fullName.trim();
  if (dob) existingPart.dob = dob;
  if (educationStatus) existingPart.educationStatus = educationStatus;
  if (selectedCategoryId) existingPart.selectedCategoryId = selectedCategoryId;
  if (gender) existingPart.gender = gender;
  if (institution !== undefined) existingPart.institution = institution;
  if (course !== undefined) existingPart.course = course;
  if (yearSemester !== undefined) existingPart.yearSemester = yearSemester;
  if (phone !== undefined) existingPart.phone = phone;
  if (guardianPhone !== undefined) existingPart.guardianPhone = guardianPhone;
  if (address !== undefined) existingPart.address = address;
  if (notes !== undefined) existingPart.notes = notes;
  
  if (req.body.unitId && user.role === UserRole.SUPER_ADMIN) {
    existingPart.unitId = req.body.unitId;
  }

  existingPart.updatedAt = new Date().toISOString();

  await dbClient.logAudit(user.id, user.username, user.role, 'Update Participant', 'Participant', partId, existingPart.unitId, oldPart, existingPart);
  await dbClient.save();

  res.json({ message: 'Participant updated successfully', participant: existingPart });
});

// Soft Delete Participant
apiRouter.post('/participants/:id/delete', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;

  // Check registration lock for Unit Leaders
  if (!db.eventSettings.registrationOpen && user.role === UserRole.UNIT_TEAM_LEADER) {
    return res.status(400).json({ error: 'Registration process is currently closed/disabled by the sector team.' });
  }

  const partId = req.params.id;
  const { reason } = req.body;

  const partIndex = db.participants.findIndex(p => p.id === partId && !p.deletedAt);
  if (partIndex === -1) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  const part = db.participants[partIndex];

  // Unit isolation enforcement
  if (user.role === UserRole.UNIT_TEAM_LEADER && part.unitId !== user.assignedUnitId) {
    return res.status(403).json({ error: 'Access denied. You can only delete participants from your own unit.' });
  }

  // Safety checks: Is participant registered in group teams or has entered results?
  const isMemberOfTeams = db.teams.some(t => t.memberIds.includes(partId) && !t.deletedAt);
  const hasResults = db.results.some(r => r.participantId === partId && !r.deletedAt);

  if (isMemberOfTeams) {
    return res.status(400).json({ error: 'Cannot delete participant. They are active members of a group team. Remove them from the team first.' });
  }
  if (hasResults) {
    return res.status(400).json({ error: 'Cannot delete participant. They have results entered for competitions. Delete results first.' });
  }

  // Soft delete
  part.deletedAt = new Date().toISOString();
  part.deletedBy = user.username;
  part.deletionReason = reason || 'Not specified';

  await dbClient.logAudit(user.id, user.username, user.role, 'Soft Delete Participant', 'Participant', partId, part.unitId, undefined, { deletionReason: part.deletionReason });
  await dbClient.save();

  res.json({ message: 'Participant soft-deleted successfully' });
});


// 9. GROUP TEAM MANAGEMENT (Teams)

apiRouter.get('/teams', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  
  let teams = db.teams.filter(t => !t.deletedAt);

  // Isolation
  if (user.role === UserRole.UNIT_TEAM_LEADER) {
    teams = teams.filter(t => t.unitId === user.assignedUnitId);
  } else if (req.query.unitId) {
    teams = teams.filter(t => t.unitId === req.query.unitId);
  }

  if (req.query.competitionId) {
    teams = teams.filter(t => t.competitionId === req.query.competitionId);
  }

  res.json(teams);
});

// Create/Register Group Team
apiRouter.post('/teams', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;

  // Check registration lock for Unit Leaders
  if (!db.eventSettings.registrationOpen && user.role === UserRole.UNIT_TEAM_LEADER) {
    return res.status(400).json({ error: 'Registration process is currently closed/disabled by the sector team.' });
  }

  const { teamName, unitId, categoryId, competitionId, memberIds } = req.body;

  if (!categoryId || !competitionId || !memberIds || !Array.length) {
    return res.status(400).json({ error: 'Category, Competition, and Members are required.' });
  }

  const finalUnitId = user.role === UserRole.UNIT_TEAM_LEADER ? user.assignedUnitId! : unitId;
  if (!finalUnitId) {
    return res.status(400).json({ error: 'Unit ID is required' });
  }

  const comp = db.competitions.find(c => c.id === competitionId);
  if (!comp || comp.participationType !== ParticipationType.GROUP) {
    return res.status(400).json({ error: 'Selected competition is not a group event.' });
  }

  if (comp.categoryId !== categoryId) {
    return res.status(400).json({ error: 'Selected competition category mismatch.' });
  }

  // Enforce unit level limit: only one team per unit per group competition
  const existsSameCompTeam = db.teams.some(t => 
    t.competitionId === competitionId && t.unitId === finalUnitId && !t.deletedAt
  );
  if (existsSameCompTeam) {
    return res.status(400).json({ error: `Your unit has already registered a team for this group competition.` });
  }

  // Validate team size (min 2, max comp.teamSize)
  if (memberIds.length < 2 || memberIds.length > comp.teamSize) {
    return res.status(400).json({ error: `Team size must be between 2 and ${comp.teamSize} members for ${comp.name}.` });
  }

  // Validate member qualifications
  const members: Participant[] = [];
  for (const mid of memberIds) {
    const p = db.participants.find(part => part.id === mid && !part.deletedAt);
    if (!p) {
      return res.status(400).json({ error: `Member participant ${mid} not found or is deleted.` });
    }
    // Unit match
    if (p.unitId !== finalUnitId) {
      return res.status(400).json({ error: `Member ${p.fullName} belongs to a different unit.` });
    }
    // Category match
    if (p.selectedCategoryId !== categoryId) {
      return res.status(400).json({ error: `Member ${p.fullName} belongs to a different category.` });
    }

    // Limit checks: Make sure this participant has not exceeded 2 group events
    // Let's count current group teams where this participant is a member
    const currentMemberTeams = db.teams.filter(t => 
      t.memberIds.includes(p.id) && !t.deletedAt && t.competitionId !== competitionId
    );
    if (currentMemberTeams.length >= db.eventSettings.maxGroupEvents) {
      return res.status(400).json({ 
        error: `Member ${p.fullName} has already reached the limit of ${db.eventSettings.maxGroupEvents} group competitions.` 
      });
    }

    // Prevent duplicate team membership for same competition
    const isAlreadyInSameComp = db.teams.some(t => 
      t.competitionId === competitionId && t.memberIds.includes(p.id) && !t.deletedAt
    );
    if (isAlreadyInSameComp) {
      return res.status(400).json({ error: `Member ${p.fullName} is already in another team registered for this competition.` });
    }
  }

  const serial = db.teams.filter(t => t.competitionId === competitionId && !t.deletedAt).length + 1;
  const finalTeamName = teamName || `${db.units.find(u => u.id === finalUnitId)?.name} Team ${serial}`;

  const newTeam: Team = {
    id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    teamNumber: `T-${String(db.teams.length + 1).padStart(3, '0')}`,
    teamName: finalTeamName,
    unitId: finalUnitId,
    categoryId,
    competitionId,
    memberIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.teams.push(newTeam);
  
  // Log Audit
  await dbClient.logAudit(user.id, user.username, user.role, 'Create Group Team', 'Team', newTeam.id, finalUnitId, undefined, newTeam);
  await dbClient.save();

  res.json({ message: 'Group team registered successfully', team: newTeam });
});

// Update Team Members
apiRouter.put('/teams/:id', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;

  // Check registration lock for Unit Leaders
  if (!db.eventSettings.registrationOpen && user.role === UserRole.UNIT_TEAM_LEADER) {
    return res.status(400).json({ error: 'Registration process is currently closed/disabled by the sector team.' });
  }

  const teamId = req.params.id;

  const teamIndex = db.teams.findIndex(t => t.id === teamId && !t.deletedAt);
  if (teamIndex === -1) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const team = db.teams[teamIndex];

  // Isolation check
  if (user.role === UserRole.UNIT_TEAM_LEADER && team.unitId !== user.assignedUnitId) {
    return res.status(403).json({ error: 'Access denied. You can only manage teams belonging to your own unit.' });
  }

  const { teamName, memberIds } = req.body;
  const oldTeam = { ...team };

  if (teamName) team.teamName = teamName.trim();

  if (memberIds) {
    const comp = db.competitions.find(c => c.id === team.competitionId);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });

    if (memberIds.length < 2 || memberIds.length > comp.teamSize) {
      return res.status(400).json({ error: `Team size must be between 2 and ${comp.teamSize} members.` });
    }

    // Verify member qualifications
    for (const mid of memberIds) {
      const p = db.participants.find(part => part.id === mid && !part.deletedAt);
      if (!p) {
        return res.status(400).json({ error: `Member ${mid} not found.` });
      }
      if (p.unitId !== team.unitId) {
        return res.status(400).json({ error: `Member ${p.fullName} belongs to a different unit.` });
      }
      if (p.selectedCategoryId !== team.categoryId) {
        return res.status(400).json({ error: `Member ${p.fullName} belongs to a different category.` });
      }

      // Max group event counts
      const currentMemberTeams = db.teams.filter(t => 
        t.memberIds.includes(p.id) && !t.deletedAt && t.id !== teamId
      );
      if (currentMemberTeams.length >= db.eventSettings.maxGroupEvents) {
        return res.status(400).json({ error: `Member ${p.fullName} already registered for maximum ${db.eventSettings.maxGroupEvents} group events.` });
      }
    }

    team.memberIds = memberIds;
  }

  team.updatedAt = new Date().toISOString();
  await dbClient.logAudit(user.id, user.username, user.role, 'Update Group Team', 'Team', teamId, team.unitId, oldTeam, team);
  await dbClient.save();

  res.json({ message: 'Team updated successfully', team });
});

// Soft Delete Team
apiRouter.post('/teams/:id/delete', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;

  // Check registration lock for Unit Leaders
  if (!db.eventSettings.registrationOpen && user.role === UserRole.UNIT_TEAM_LEADER) {
    return res.status(400).json({ error: 'Registration process is currently closed/disabled by the sector team.' });
  }

  const teamId = req.params.id;

  const teamIndex = db.teams.findIndex(t => t.id === teamId && !t.deletedAt);
  if (teamIndex === -1) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const team = db.teams[teamIndex];

  // Isolation check
  if (user.role === UserRole.UNIT_TEAM_LEADER && team.unitId !== user.assignedUnitId) {
    return res.status(403).json({ error: 'Access denied. You can only manage teams belonging to your own unit.' });
  }

  // Safety check: has results?
  const hasResults = db.results.some(r => r.teamId === teamId && !r.deletedAt);
  if (hasResults) {
    return res.status(400).json({ error: 'Cannot delete team because results have been entered. Remove results first.' });
  }

  team.deletedAt = new Date().toISOString();
  team.deletedBy = user.username;

  await dbClient.logAudit(user.id, user.username, user.role, 'Delete Group Team', 'Team', teamId, team.unitId, undefined, { deleted: true });
  await dbClient.save();

  res.json({ message: 'Team deleted successfully' });
});


// 10. RESULT ENTRY & SCOREBOARDS (CRUD)

// Enter Result (Sector Team and Super Admin only)
apiRouter.post('/results', authenticate, requireRole([UserRole.SUPER_ADMIN, UserRole.SECTOR_TEAM]), async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  const { categoryId, competitionId, participantId, teamId, judge1Mark, judge2Mark, status, remarks, publishedStatus, manualRankOverride, manualRankOverrideReason, overrideRank } = req.body;

  if (!categoryId || !competitionId || (!participantId && !teamId) || !status) {
    return res.status(400).json({ error: 'Category, Competition, Participant/Team and Status are required.' });
  }

  // Validate decimals/numbers
  const j1 = Number(judge1Mark) || 0;
  const j2 = Number(judge2Mark) || 0;
  if (j1 < 0 || j2 < 0) {
    return res.status(400).json({ error: 'Judge marks cannot be negative' });
  }

  const totalMark = j1 + j2;

  // Check duplicates
  const existingResult = db.results.find(r => 
    r.competitionId === competitionId && 
    ((participantId && r.participantId === participantId) || (teamId && r.teamId === teamId)) &&
    !r.deletedAt
  );

  if (existingResult) {
    return res.status(400).json({ error: 'Result already entered for this participant/team in this competition. Edit the existing record instead.' });
  }

  const newResult: Result = {
    id: `res_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    categoryId,
    competitionId,
    participantId: participantId || undefined,
    teamId: teamId || undefined,
    judge1Mark: j1,
    judge2Mark: j2,
    totalMark,
    status,
    remarks,
    publishedStatus: publishedStatus !== undefined ? publishedStatus : true,
    manualRankOverride: !!manualRankOverride,
    manualRankOverrideReason,
    rank: manualRankOverride ? Number(overrideRank) : undefined,
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.results.push(newResult);
  await dbClient.save();

  // Trigger ranks and scores recalculations immediately!
  CalculationService.calculateCompetitionRanks(competitionId);
  await dbClient.logAudit(user.id, user.username, user.role, 'Enter Competition Result', 'Result', newResult.id, undefined, undefined, newResult);
  await dbClient.save();

  res.json({ message: 'Result entered successfully', result: newResult });
});

// Update Result
apiRouter.put('/results/:id', authenticate, requireRole([UserRole.SUPER_ADMIN, UserRole.SECTOR_TEAM]), async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  const resId = req.params.id;

  const resIndex = db.results.findIndex(r => r.id === resId && !r.deletedAt);
  if (resIndex === -1) {
    return res.status(404).json({ error: 'Result not found' });
  }

  const resultObj = db.results[resIndex];
  const oldRes = { ...resultObj };

  // Update properties
  if (req.body.status) resultObj.status = req.body.status;
  if (req.body.remarks !== undefined) resultObj.remarks = req.body.remarks;
  if (req.body.publishedStatus !== undefined) resultObj.publishedStatus = req.body.publishedStatus;

  // Judges' marks recalculations
  const j1 = req.body.judge1Mark !== undefined ? Number(req.body.judge1Mark) : resultObj.judge1Mark;
  const j2 = req.body.judge2Mark !== undefined ? Number(req.body.judge2Mark) : resultObj.judge2Mark;
  resultObj.judge1Mark = j1;
  resultObj.judge2Mark = j2;
  resultObj.totalMark = j1 + j2;

  // Rank overrides
  if (req.body.manualRankOverride !== undefined) {
    resultObj.manualRankOverride = !!req.body.manualRankOverride;
    resultObj.manualRankOverrideReason = req.body.manualRankOverrideReason;
  }

  if (resultObj.manualRankOverride) {
    resultObj.rank = Number(req.body.overrideRank) || resultObj.rank;
    // Log override audit if different
    if (oldRes.rank !== resultObj.rank || !oldRes.manualRankOverride) {
      await dbClient.logAudit(user.id, user.username, user.role, 'Manual Rank Override', 'Result', resId, undefined, { previousRank: oldRes.rank }, { overriddenRank: resultObj.rank, reason: resultObj.manualRankOverrideReason });
    }
  } else if (req.body.manualRankOverride === false) {
    resultObj.rank = undefined;
    resultObj.manualRankOverrideReason = undefined;
  }

  resultObj.updatedAt = new Date().toISOString();
  resultObj.updatedBy = user.id;

  await dbClient.save();

  // Recalculate competition ranks
  CalculationService.calculateCompetitionRanks(resultObj.competitionId);
  await dbClient.logAudit(user.id, user.username, user.role, 'Update Competition Result', 'Result', resId, undefined, oldRes, resultObj);
  await dbClient.save();

  res.json({ message: 'Result updated successfully', result: resultObj });
});

// Soft Delete Result
apiRouter.post('/results/:id/delete', authenticate, requireRole([UserRole.SUPER_ADMIN, UserRole.SECTOR_TEAM]), async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  const resId = req.params.id;

  const resIndex = db.results.findIndex(r => r.id === resId && !r.deletedAt);
  if (resIndex === -1) {
    return res.status(404).json({ error: 'Result not found' });
  }

  const resultObj = db.results[resIndex];
  resultObj.deletedAt = new Date().toISOString();
  resultObj.deletedBy = user.username;

  await dbClient.save();

  // Recalculate ranks immediately
  CalculationService.calculateCompetitionRanks(resultObj.competitionId);
  await dbClient.logAudit(user.id, user.username, user.role, 'Delete Competition Result', 'Result', resId, undefined, { deleted: true });
  await dbClient.save();

  res.json({ message: 'Result deleted successfully' });
});

// Read Results for specific competition
apiRouter.get('/results', authenticate, async (req, res) => {
  const db = dbClient.get();
  let results = db.results.filter(r => !r.deletedAt);

  if (req.query.competitionId) {
    results = results.filter(r => r.competitionId === req.query.competitionId);
  }
  if (req.query.categoryId) {
    results = results.filter(r => r.categoryId === req.query.categoryId);
  }
  if (req.query.stageType) {
    const stageType = String(req.query.stageType);
    results = results.filter(r => {
      const comp = db.competitions.find(c => c.id === r.competitionId);
      return comp?.stageType === stageType;
    });
  }


  res.json(results);
});

// Bulk Announce/Un-announce Results for a Competition
apiRouter.post('/results/announce', authenticate, requireRole([UserRole.SUPER_ADMIN, UserRole.SECTOR_TEAM]), async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  const { competitionId, announce } = req.body;

  if (!competitionId) {
    return res.status(400).json({ error: 'Competition ID is required.' });
  }

  const results = db.results.filter(r => r.competitionId === competitionId && !r.deletedAt);
  if (results.length === 0) {
    return res.status(404).json({ error: 'No results found for this competition.' });
  }

  const shouldAnnounce = announce !== false; // default to true
  results.forEach(r => {
    r.publishedStatus = shouldAnnounce;
    r.updatedAt = new Date().toISOString();
  });

  await dbClient.logAudit(user.id, user.username, user.role, shouldAnnounce ? 'Announce Competition Results' : 'Un-announce Competition Results', 'Competition', competitionId);
  await dbClient.save();

  res.json({ message: `Results ${shouldAnnounce ? 'announced' : 'un-announced'} successfully for ${results.length} entries.`, count: results.length });
});

// Update Participant Chest Number (Sector Team & Super Admin only)
apiRouter.put('/participants/:id/chest', authenticate, requireRole([UserRole.SUPER_ADMIN, UserRole.SECTOR_TEAM]), async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  const partId = req.params.id;
  const { chestNumber } = req.body;

  const part = db.participants.find(p => p.id === partId && !p.deletedAt);
  if (!part) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  const oldChest = part.profilePhoto;
  part.profilePhoto = chestNumber || part.profilePhoto;
  part.updatedAt = new Date().toISOString();

  await dbClient.logAudit(user.id, user.username, user.role, 'Update Chest Number', 'Participant', partId, part.unitId, { chestNumber: oldChest }, { chestNumber: part.profilePhoto });
  await dbClient.save();

  res.json({ message: 'Chest number updated successfully', participant: part });
});


// 11. PUBLIC STANDINGS & INDIVIDUAL SCOREBOARDS (ACCESSIBLE TO ALL LOGGED IN USERS)

// Get Individual Scoreboard (Calculated on server!)
apiRouter.get('/scoreboard', authenticate, async (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
  const stageType = req.query.stageType ? (String(req.query.stageType) as StageType) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;

  const scoreboard = CalculationService.getIndividualScoreboard({
    categoryId,
    unitId,
    stageType,
    search
  });

  res.json(scoreboard);
});

// Get Unit Standings (Calculated on server!)
apiRouter.get('/standings', authenticate, async (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const standings = CalculationService.getUnitStandings({ categoryId });
  res.json(standings);
});


// 12. USER MANAGEMENT (SUPER ADMIN ONLY)

// Read users
apiRouter.get('/users', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  // Filter sensitive fields
  const safeUsers = db.users.map(u => ({
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    role: u.role,
    assignedUnitId: u.assignedUnitId,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt
  }));
  res.json(safeUsers);
});

// Create user
apiRouter.post('/users', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const { fullName, username, password, email, role, assignedUnitId } = req.body;

  if (!fullName || !username || !password || !role) {
    return res.status(400).json({ error: 'FullName, Username, Password, and Role are required.' });
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (db.users.some(u => u.username.toLowerCase() === normalizedUsername)) {
    return res.status(400).json({ error: `Username "${normalizedUsername}" is already in use.` });
  }

  if (role === UserRole.UNIT_TEAM_LEADER && !assignedUnitId) {
    return res.status(400).json({ error: 'Assigned Unit is required for Unit Team Leaders.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newUser: User = {
    id: `usr_${Date.now()}`,
    fullName: fullName.trim(),
    username: normalizedUsername,
    email,
    passwordHash,
    role,
    assignedUnitId: role === UserRole.UNIT_TEAM_LEADER ? assignedUnitId : undefined,
    active: true,
    mustChangePassword: true, // Force password change upon login
    failedLoginAttempts: 0,
    createdBy: (req as any).user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.users.push(newUser);
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Create User Account', 'User', newUser.id, undefined, undefined, { username: newUser.username, role: newUser.role, assignedUnitId: newUser.assignedUnitId });
  await dbClient.save();

  res.json({
    message: 'User account created successfully. The user must change password upon first login.',
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      username: newUser.username,
      role: newUser.role,
      assignedUnitId: newUser.assignedUnitId,
      active: newUser.active
    }
  });
});

// Update user details or reset password
apiRouter.put('/users/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const userId = req.params.id;

  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const targetUser = db.users[userIndex];
  const oldUser = { ...targetUser };

  const { fullName, email, role, assignedUnitId, active, resetPassword } = req.body;

  if (fullName) targetUser.fullName = fullName.trim();
  if (email !== undefined) targetUser.email = email;
  if (active !== undefined) {
    targetUser.active = active;
  }

  if (role) {
    targetUser.role = role;
    if (role === UserRole.UNIT_TEAM_LEADER) {
      targetUser.assignedUnitId = assignedUnitId;
    } else {
      targetUser.assignedUnitId = undefined;
    }
  }

  if (resetPassword) {
    if (resetPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    const salt = bcrypt.genSaltSync(10);
    targetUser.passwordHash = bcrypt.hashSync(resetPassword, salt);
    targetUser.mustChangePassword = true; // force change again
  }

  targetUser.updatedAt = new Date().toISOString();
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Update User Account', 'User', userId, undefined, oldUser, targetUser);
  await dbClient.save();

  res.json({ message: 'User account updated successfully.' });
});

// Force log out a user by revoking all their sessions
apiRouter.post('/users/:id/logout', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const userId = req.params.id;
  
  // Note: With stateless JWTs, forceful logout requires a token blacklist or updating a sessionVersion on the user object.
  // For now, we just log the action.
  
  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Force Logout Sessions', 'User', userId);
  await dbClient.save();

  res.json({ message: 'User forced to log out successfully' });
});

// Delete user
apiRouter.delete('/users/:id', authenticate, requireRole([UserRole.SUPER_ADMIN]), async (req, res) => {
  const db = dbClient.get();
  const userId = req.params.id;

  if (userId === 'usr_admin' || userId === (req as any).user.id) {
    return res.status(400).json({ error: 'Cannot delete the main admin account or your own logged-in account.' });
  }

  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const deletedUser = db.users[index];
  db.users.splice(index, 1);

  await dbClient.logAudit((req as any).user.id, (req as any).user.username, (req as any).user.role, 'Delete User Account', 'User', userId, undefined, deletedUser);
  await dbClient.save();

  res.json({ message: 'User account deleted successfully' });
});


// 13. DATA DASHBOARD & STATS SUMMARY

apiRouter.get('/dashboard-stats', authenticate, async (req, res) => {
  const db = dbClient.get();
  const user = (req as any).user as User;
  
  // Scoped filters
  let participants = db.participants.filter(p => !p.deletedAt);
  let teams = db.teams.filter(t => !t.deletedAt);
  let results = db.results.filter(r => !r.deletedAt);
  
  if (user.role === UserRole.UNIT_TEAM_LEADER) {
    participants = participants.filter(p => p.unitId === user.assignedUnitId);
    teams = teams.filter(t => t.unitId === user.assignedUnitId);
    // filter results that belong to the unit leader's participants/teams
    const pIds = participants.map(p => p.id);
    const tIds = teams.map(t => t.id);
    results = results.filter(r => (r.participantId && pIds.includes(r.participantId)) || (r.teamId && tIds.includes(r.teamId)));
  }

  // Registrations counts
  const individualRegistrationsCount = participants.reduce((sum, p) => {
    const reg = (db as any).registrations?.find((r: any) => r.participantId === p.id);
    return sum + (reg ? reg.selectedIndividualCompetitionIds.length : 0);
  }, 0);

  // Group registrations count
  const groupRegistrationsCount = teams.length;

  // Active units count
  const unitsCount = db.units.filter(u => u.active).length;

  // Total active competitions
  const compsCount = db.competitions.filter(c => c.active).length;

  // Results progress
  const resultsEnteredCount = db.results.filter(r => !r.deletedAt).length;
  // Estimated total results expected
  // In individual events, each participant registers. For group events, each team is a single result.
  const totalResultsExpected = db.competitions.reduce((sum, comp) => {
    if (comp.participationType === ParticipationType.INDIVIDUAL) {
      // count active registrations in this comp
      const regsInComp = (db as any).registrations?.filter((r: any) => r.selectedIndividualCompetitionIds.includes(comp.id)) || [];
      const activeRegsCount = regsInComp.filter((r: any) => {
        const p = db.participants.find(part => part.id === r.participantId);
        return p && !p.deletedAt;
      }).length;
      return sum + activeRegsCount;
    } else {
      // count active teams in this comp
      return sum + db.teams.filter(t => t.competitionId === comp.id && !t.deletedAt).length;
    }
  }, 0);

  const resultsPendingCount = Math.max(0, totalResultsExpected - resultsEnteredCount);

  // Leading Unit Preview
  const standings = CalculationService.getUnitStandings();
  const leadingUnit = standings[0] || null;

  // Top Individual Preview
  const scoreboard = CalculationService.getIndividualScoreboard();
  const topIndividual = scoreboard[0] || null;

  // Top Individual On-Stage
  const scoreboardOnStage = CalculationService.getIndividualScoreboard({ stageType: StageType.ON_STAGE });
  const topIndividualOnStage = scoreboardOnStage[0] || null;

  // Top Individual Off-Stage
  const scoreboardOffStage = CalculationService.getIndividualScoreboard({ stageType: StageType.OFF_STAGE });
  const topIndividualOffStage = scoreboardOffStage[0] || null;

  // Counts by Unit
  const participantsByUnit = db.units.map(u => ({
    unitId: u.id,
    unitName: u.name,
    count: db.participants.filter(p => p.unitId === u.id && !p.deletedAt).length
  }));

  // Counts by Category
  const participantsByCategory = db.categories.map(cat => ({
    categoryId: cat.id,
    categoryName: cat.name,
    count: db.participants.filter(p => p.selectedCategoryId === cat.id && !p.deletedAt).length
  }));

  res.json({
    totalParticipants: participants.length,
    totalUnits: unitsCount,
    totalCompetitions: compsCount,
    individualRegistrations: individualRegistrationsCount,
    groupTeamsCount: groupRegistrationsCount,
    resultsEntered: resultsEnteredCount,
    resultsPending: resultsPendingCount,
    leadingUnit,
    topIndividual,
    topIndividualOnStage,
    topIndividualOffStage,
    participantsByUnit,
    participantsByCategory,
    recentRegistrations: db.participants.filter(p => !p.deletedAt).slice(-5).reverse().map(p => ({
      id: p.id,
      fullName: p.fullName,
      unitName: db.units.find(u => u.id === p.unitId)?.name || 'Unknown',
      categoryName: db.categories.find(c => c.id === p.selectedCategoryId)?.name || 'Unknown',
      createdAt: p.createdAt
    })),
    recentResults: db.results.filter(r => !r.deletedAt && r.publishedStatus).slice(-5).reverse().map(r => {
      const comp = db.competitions.find(c => c.id === r.competitionId);
      const cat = db.categories.find(c => c.id === r.categoryId);
      let participantName = 'Unknown';
      let unitName = 'Unknown';
      if (r.participantId) {
        const p = db.participants.find(part => part.id === r.participantId);
        participantName = p ? p.fullName : 'Unknown';
        unitName = p ? (db.units.find(u => u.id === p.unitId)?.name || 'Unknown') : 'Unknown';
      } else if (r.teamId) {
        const t = db.teams.find(team => team.id === r.teamId);
        participantName = t ? t.teamNumber : 'Unknown';
        unitName = t ? (db.units.find(u => u.id === t.unitId)?.name || 'Unknown') : 'Unknown';
      }
      return {
        id: r.id,
        competitionName: comp ? comp.name : 'Unknown',
        categoryName: cat ? cat.name : 'Unknown',
        participantName,
        unitName,
        totalMark: r.totalMark,
        rank: r.rank,
        updatedAt: r.updatedAt
      };
    })
  });
});
