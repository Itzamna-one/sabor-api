// api/health.js
// Pre-release verification endpoint. Hit this after every build.
// Returns pass/fail for every critical system in one response.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkAppKey(req) {
  const key = req.headers['x-sabor-key'];
  const expected = process.env.SABOR_APP_KEY;
  if (!expected) return { status: 'warn', message: 'SABOR_APP_KEY not set — gate is OFF (passthrough)' };
  if (!key) return { status: 'fail', message: 'No X-Sabor-Key header sent — app is not sending the key' };
  if (key !== expected) return { status: 'fail', message: 'X-Sabor-Key mismatch — wrong key in app build' };
  return { status: 'pass', message: 'App key authenticated' };
}

async function checkFirestore() {
  try {
    const snap = await db.collection('directory_spots').limit(1).get();
    const tokenSnap = await db.collection('fcm_tokens').get();
    return {
      status: 'pass',
      message: `Firestore connected`,
      directorySpots: (await db.collection('directory_spots').get()).size,
      fcmTokens: tokenSnap.size,
    };
  } catch (e) {
    return { status: 'fail', message: `Firestore error: ${e.message}` };
  }
}

async function checkAnthropic() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { status: 'fail', message: 'ANTHROPIC_API_KEY not set' };
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { status: 'pass', message: 'Anthropic API reachable' };
  } catch (e) {
    return { status: 'fail', message: `Anthropic error: ${e.message}` };
  }
}

async function checkEnvVars() {
  const required = [
    'FIREBASE_SERVICE_ACCOUNT',
    'ANTHROPIC_API_KEY',
    'GOOGLE_PLACES_KEY',
    'NOTIFY_API_SECRET',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) return { status: 'fail', message: `Missing env vars: ${missing.join(', ')}` };
  return { status: 'pass', message: 'All required env vars set' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sabor-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const [appKey, firestore, anthropic, envVars] = await Promise.all([
    checkAppKey(req),
    checkFirestore(),
    checkAnthropic(),
    checkEnvVars(),
  ]);

  const checks = { appKey, firestore, anthropic, envVars };
  const allPass = Object.values(checks).every(c => c.status === 'pass' || c.status === 'warn');
  const overall = allPass ? 'healthy' : 'degraded';

  return res.status(allPass ? 200 : 500).json({
    overall,
    timestamp: new Date().toISOString(),
    checks,
    howToUse: 'Send X-Sabor-Key header with your app key to verify auth end-to-end',
  });
}
