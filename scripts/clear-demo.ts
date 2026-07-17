import { dbClient, saveDb } from '../server/db.js';

async function clearData() {
  console.log('Connecting to database...');
  await dbClient.waitForSync();
  await dbClient.forceSync();

  const db = dbClient.get();

  console.log('Clearing participants...');
  db.participants = [];
  
  console.log('Clearing chest numbers...');
  db.chestNumbers = [];
  
  console.log('Clearing green room assignments...');
  db.greenRoomAssignments = [];
  
  console.log('Clearing judgment sheets...');
  db.judgmentSheets = [];
  
  console.log('Clearing judge scores...');
  db.judgeScores = [];
  
  console.log('Clearing registrations...');
  db.registrations = [];
  
  console.log('Clearing teams...');
  db.teams = [];
  
  console.log('Clearing results...');
  db.results = [];

  console.log('Resetting chest number counters...');
  db.counters = [
    { id: 'counter_sub_junior', categoryId: 'cat_sub_junior', currentValue: 999 },
    { id: 'counter_junior', categoryId: 'cat_junior', currentValue: 1999 },
    { id: 'counter_senior', categoryId: 'cat_senior', currentValue: 2999 },
    { id: 'counter_campus_junior', categoryId: 'cat_campus_junior', currentValue: 3999 },
    { id: 'counter_campus_senior', categoryId: 'cat_campus_senior', currentValue: 4999 },
    { id: 'counter_general', categoryId: 'cat_general', currentValue: 5999 },
    { id: 'counter_campus_general', categoryId: 'cat_campus_general', currentValue: 6999 }
  ];

  console.log('Saving database...');
  await dbClient.save();

  console.log('Successfully cleared all participant and event data!');
  process.exit(0);
}

clearData().catch(console.error);
