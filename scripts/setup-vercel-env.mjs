import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const appDir = path.join(rootDir, 'apps', 'vercel-api');
const secretsPath = process.env.VERCEL_SECRETS_FILE || path.join(rootDir, 'secrets.json');
const vercelEnvFilePath = process.env.VERCEL_ENV_FILE || path.join(rootDir, '.env.vercel.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const rawLine of fileContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

const localEnv = loadEnvFile(vercelEnvFilePath);
const projectId = process.env.VERCEL_PROJECT_ID || localEnv.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || localEnv.VERCEL_TEAM_ID || localEnv.VERCEL_ORG_ID;
const token = process.env.VERCEL_TOKEN || localEnv.VERCEL_TOKEN;

if (!token) {
  console.error('Missing VERCEL_TOKEN.');
  process.exit(1);
}

if (!projectId) {
  console.error('Missing VERCEL_PROJECT_ID.');
  process.exit(1);
}

if (!fs.existsSync(secretsPath)) {
  console.error(`Secrets file not found at ${secretsPath}`);
  process.exit(1);
}

const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));

function runVercel(args, stdinValue = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['dlx', 'vercel@latest', ...args], {
      cwd: appDir,
      env: {
        ...process.env,
        VERCEL_TOKEN: token,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(new Error(errorOutput.trim() || output.trim() || `vercel exited with code ${code}`));
    });

    if (stdinValue) {
      child.stdin.write(stdinValue);
      child.stdin.write('\n');
    }
    child.stdin.end();
  });
}

async function main() {
  if (vercelEnvFilePath) {
    console.log(`Loaded Vercel settings from ${vercelEnvFilePath}`);
  }

  console.log(`Linking Vercel project ${projectId}${teamId ? ` in scope ${teamId}` : ''}`);
  await runVercel(['link', '--yes', '--project', projectId, ...(teamId ? ['--scope', teamId] : [])]);

  const entries = Object.entries(secrets);
  console.log(`Uploading ${entries.length} environment variables to Vercel.`);

  for (const [key, value] of entries) {
    await runVercel(['env', 'add', key, 'production', '--force', '--yes', '--token', token], String(value));
    console.log(`✓ ${key}`);
  }

  console.log('Vercel environment setup complete.');
}

main().catch((error) => {
  console.error(`Vercel setup failed: ${error.message}`);
  process.exit(1);
});